import { NextResponse } from "next/server";
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

  return NextResponse.json({
    accepted: true,
    question,
    moderation,
  });
}
