import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

export const questionModerationSchema = z.object({
  action: z.enum(["reject", "allow", "highlight"]),
  category: z.enum([
    "abusive",
    "spam",
    "irrelevant",
    "unsafe",
    "valid",
    "high-value",
  ]),
  score: z.number().min(0).max(1),
  topic: z.string().min(1).max(32),
  reason: z.string().min(1).max(160),
});

export type QuestionModeration = z.infer<typeof questionModerationSchema>;

export async function moderateQuestion({
  body,
  roomName,
}: {
  body: string;
  roomName: string;
}) {
  const { object } = await generateObject({
    model: openai(process.env.AI_MODERATION_MODEL ?? "gpt-5-mini"),
    schema: questionModerationSchema,
    system:
      "You screen live audience Q&A submissions for a presenter. Reject abusive, unsafe, spammy, promotional, incoherent, or off-topic messages. Allow concise, relevant questions. Highlight only unusually strong questions that are specific, broadly useful, and likely to move the discussion forward. Keep reasons short and presenter-facing.",
    prompt: [
      `Room: ${roomName}`,
      "Classify this audience submission.",
      `Submission: ${body}`,
      "Use action=highlight only for excellent questions. Use action=reject for bad or irrelevant messages. Use topic as a short audience-friendly category.",
    ].join("\n"),
  });

  return object;
}
