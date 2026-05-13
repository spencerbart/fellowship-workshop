import { createClient } from "@supabase/supabase-js";

const roomSlugPattern = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function isValidRoomSlug(slug: string) {
  return roomSlugPattern.test(slug);
}

export async function roomExists(slug: string) {
  if (!isValidRoomSlug(slug)) {
    return false;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Missing Supabase public environment variables.");
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase
    .from("rooms")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}
