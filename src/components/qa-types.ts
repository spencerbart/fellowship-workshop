import type { User } from "@supabase/supabase-js";

export type QuestionRow = {
  id: number;
  body: string;
  author: string;
  topic: string;
  room_slug: string;
  created_at: string;
  answered_at: string | null;
  moderation_status: "approved" | "highlighted" | null;
  moderation_score: number | null;
  moderation_reason: string | null;
};

export type VoteRow = {
  question_id: number;
  user_id: string | null;
};

export type Room = {
  slug: string;
  name: string;
  isLocked: boolean;
  archivedAt: string | null;
  logoPath: string | null;
  accentColor: string;
};

export type Question = {
  id: number;
  body: string;
  author: string;
  topic: string;
  votes: number;
  createdAt: string;
  answered: boolean;
  highlighted: boolean;
  moderationScore: number | null;
  moderationReason: string | null;
  mine?: boolean;
};

export type AuthMode = "sign-in" | "sign-up";

export function formatTimeAgo(value: string) {
  const created = new Date(value).getTime();
  const seconds = Math.max(1, Math.floor((Date.now() - created) / 1000));

  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function defaultAuthor(user: User | null) {
  return user?.email?.split("@")[0] ?? "Anonymous";
}

export function roomTitle(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
