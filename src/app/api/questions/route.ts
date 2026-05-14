import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  moderateQuestion,
  type QuestionModeration,
} from "@/lib/ai/moderate-question";
import { createAdminClient, getUserFromRequest } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const questionRequestSchema = z.object({
  body: z.string().trim().min(1).max(220),
  author: z.string().trim().max(28).optional(),
  roomSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
});

const MAX_QUESTIONS_PER_MINUTE = 5;
const MAX_QUESTIONS_PER_IP_PER_MINUTE = 20;
const MAX_OPEN_QUESTIONS_PER_USER = 8;

function getIpFingerprint(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip =
    forwardedFor ??
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown";

  return createHash("sha256")
    .update(`${process.env.RATE_LIMIT_SALT ?? "fellowship"}:${ip}`)
    .digest("hex");
}

function normalizeQuestionBody(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function POST(request: Request) {
  const { user, error: authError } = await getUserFromRequest(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const parsed = questionRequestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid question before submitting." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { body, author, roomSlug } = parsed.data;
  const ipFingerprint = getIpFingerprint(request);

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("slug, name, is_locked, archived_at")
    .eq("slug", roomSlug)
    .maybeSingle();

  if (roomError) {
    return NextResponse.json({ error: roomError.message }, { status: 500 });
  }

  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  if (room.is_locked || room.archived_at) {
    return NextResponse.json(
      { error: "This room is not accepting new questions." },
      { status: 403 },
    );
  }

  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  const [
    { count: recentUserQuestionCount, error: userRateError },
    { count: recentIpQuestionCount, error: ipRateError },
    { count: openQuestionCount, error: openQuestionError },
    { data: recentQuestions, error: recentQuestionsError },
  ] = await Promise.all([
    supabase
      .from("rate_limit_events")
      .select("id", { count: "exact", head: true })
      .eq("action", "question")
      .eq("room_slug", roomSlug)
      .eq("user_id", user.id)
      .gt("created_at", oneMinuteAgo),
    supabase
      .from("rate_limit_events")
      .select("id", { count: "exact", head: true })
      .eq("action", "question")
      .eq("room_slug", roomSlug)
      .eq("ip_fingerprint", ipFingerprint)
      .gt("created_at", oneMinuteAgo),
    supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("room_slug", roomSlug)
      .eq("user_id", user.id)
      .is("answered_at", null),
    supabase
      .from("questions")
      .select("body")
      .eq("room_slug", roomSlug)
      .eq("user_id", user.id)
      .gt("created_at", fiveMinutesAgo)
      .limit(20),
  ]);

  const rateError =
    userRateError ?? ipRateError ?? openQuestionError ?? recentQuestionsError;

  if (rateError) {
    return NextResponse.json({ error: rateError.message }, { status: 500 });
  }

  if ((recentUserQuestionCount ?? 0) >= MAX_QUESTIONS_PER_MINUTE) {
    return NextResponse.json(
      { error: "Too many questions in a short period. Wait a minute and try again." },
      { status: 429 },
    );
  }

  if ((recentIpQuestionCount ?? 0) >= MAX_QUESTIONS_PER_IP_PER_MINUTE) {
    return NextResponse.json(
      { error: "This network is submitting too quickly. Wait a minute and try again." },
      { status: 429 },
    );
  }

  if ((openQuestionCount ?? 0) >= MAX_OPEN_QUESTIONS_PER_USER) {
    return NextResponse.json(
      { error: "You have several open questions already. Vote or wait for answers before adding more." },
      { status: 429 },
    );
  }

  const normalizedBody = normalizeQuestionBody(body);
  const duplicateQuestion = (recentQuestions ?? []).some(
    (question) => normalizeQuestionBody(question.body) === normalizedBody,
  );

  if (duplicateQuestion) {
    return NextResponse.json(
      { error: "That question was already submitted recently." },
      { status: 409 },
    );
  }

  let moderation: QuestionModeration = {
    action: "allow",
    category: "valid",
    score: 0,
    topic: "Audience",
    reason: "AI screening skipped because OPENAI_API_KEY is not configured.",
  };

  if (process.env.OPENAI_API_KEY) {
    try {
      moderation = await moderateQuestion({
        body,
        roomName: room.name || room.slug,
      });
    } catch (error) {
      console.error("Question moderation failed", error);

      return NextResponse.json(
        { error: "AI screening failed. Try again in a moment." },
        { status: 503 },
      );
    }
  }

  if (moderation.action === "reject") {
    await supabase.from("rate_limit_events").insert({
      room_slug: roomSlug,
      user_id: user.id,
      ip_fingerprint: ipFingerprint,
      action: "question",
    });

    return NextResponse.json(
      {
        accepted: false,
        moderation,
        error: moderation.reason,
      },
      { status: 422 },
    );
  }

  const { data: question, error: insertError } = await supabase
    .from("questions")
    .insert({
      body,
      author: author || user.email?.split("@")[0] || "Anonymous",
      topic: moderation.topic,
      room_slug: roomSlug,
      user_id: user.id,
      moderation_status:
        moderation.action === "highlight" ? "highlighted" : "approved",
      moderation_category: moderation.category,
      moderation_score: moderation.score,
      moderation_reason: moderation.reason,
      moderated_at: new Date().toISOString(),
    })
    .select("id, moderation_status, moderation_reason")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { error: analyticsError } = await supabase
    .from("room_participants")
    .upsert(
      {
        room_slug: roomSlug,
        user_id: user.id,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "room_slug,user_id" },
    );

  const { error: rateEventError } = await supabase.from("rate_limit_events").insert({
    room_slug: roomSlug,
    user_id: user.id,
    ip_fingerprint: ipFingerprint,
    action: "question",
  });

  if (analyticsError || rateEventError) {
    console.error("Question analytics write failed", analyticsError ?? rateEventError);
  }

  return NextResponse.json({
    accepted: true,
    question,
    moderation,
  });
}
