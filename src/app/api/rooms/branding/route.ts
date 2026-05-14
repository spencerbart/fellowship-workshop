import { NextResponse } from "next/server";
import { z } from "zod";
import { createUserRequestClient } from "@/lib/supabase/server";
import {
  createAdminClient,
  getBearerToken,
  getUserFromRequest,
} from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ROOM_ASSETS_BUCKET = "room-assets";
const MAX_LOGO_BYTES = 1024 * 1024;

const brandingSchema = z.object({
  roomSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/),
});

const deleteSchema = z.object({
  roomSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
});

const allowedLogoTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

type UploadedLogo = {
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function isUploadedLogo(value: unknown): value is UploadedLogo {
  return (
    typeof value === "object" &&
    value !== null &&
    "size" in value &&
    "type" in value &&
    "arrayBuffer" in value &&
    typeof value.size === "number" &&
    typeof value.type === "string" &&
    typeof value.arrayBuffer === "function"
  );
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  const { user, error: authError } = await getUserFromRequest(request);

  if (authError || !user || !token) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const formData = await request.formData();
  const parsed = brandingSchema.safeParse({
    roomSlug: formData.get("roomSlug"),
    accentColor: formData.get("accentColor"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid room and brand color." },
      { status: 400 },
    );
  }

  const { roomSlug, accentColor } = parsed.data;
  const userSupabase = createUserRequestClient(token);
  const { data: canManage, error: manageError } = await userSupabase.rpc(
    "can_manage_room",
    { requested_room_slug: roomSlug },
  );

  if (manageError) {
    return NextResponse.json({ error: manageError.message }, { status: 500 });
  }

  if (!canManage) {
    return NextResponse.json(
      { error: "Only room owners can update branding." },
      { status: 403 },
    );
  }

  const supabase = createAdminClient();
  const { data: currentRoom, error: roomError } = await supabase
    .from("rooms")
    .select("slug, logo_path")
    .eq("slug", roomSlug)
    .maybeSingle();

  if (roomError) {
    return NextResponse.json({ error: roomError.message }, { status: 500 });
  }

  if (!currentRoom) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  let logoPath = currentRoom.logo_path as string | null;
  const logo = formData.get("logo");

  if (isUploadedLogo(logo) && logo.size > 0) {
    const extension = allowedLogoTypes.get(logo.type);

    if (!extension) {
      return NextResponse.json(
        { error: "Upload a PNG, JPG, WebP, or GIF logo." },
        { status: 400 },
      );
    }

    if (logo.size > MAX_LOGO_BYTES) {
      return NextResponse.json(
        { error: "Logo must be 1 MB or smaller." },
        { status: 400 },
      );
    }

    const nextLogoPath = `rooms/${roomSlug}/logo-${Date.now()}.${extension}`;
    const logoBody = new Uint8Array(await logo.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(ROOM_ASSETS_BUCKET)
      .upload(nextLogoPath, logoBody, {
        cacheControl: "3600",
        contentType: logo.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    if (logoPath) {
      await supabase.storage.from(ROOM_ASSETS_BUCKET).remove([logoPath]);
    }

    logoPath = nextLogoPath;
  }

  const { data: room, error: updateError } = await supabase
    .from("rooms")
    .update({
      accent_color: accentColor,
      logo_path: logoPath,
    })
    .eq("slug", roomSlug)
    .select("slug, logo_path, accent_color")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ room });
}

export async function DELETE(request: Request) {
  const token = getBearerToken(request);
  const { user, error: authError } = await getUserFromRequest(request);

  if (authError || !user || !token) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid room." }, { status: 400 });
  }

  const userSupabase = createUserRequestClient(token);
  const { data: canManage, error: manageError } = await userSupabase.rpc(
    "can_manage_room",
    { requested_room_slug: parsed.data.roomSlug },
  );

  if (manageError) {
    return NextResponse.json({ error: manageError.message }, { status: 500 });
  }

  if (!canManage) {
    return NextResponse.json(
      { error: "Only room owners can update branding." },
      { status: 403 },
    );
  }

  const supabase = createAdminClient();
  const { data: currentRoom, error: roomError } = await supabase
    .from("rooms")
    .select("slug, logo_path")
    .eq("slug", parsed.data.roomSlug)
    .maybeSingle();

  if (roomError) {
    return NextResponse.json({ error: roomError.message }, { status: 500 });
  }

  if (!currentRoom) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  if (currentRoom.logo_path) {
    await supabase.storage.from(ROOM_ASSETS_BUCKET).remove([currentRoom.logo_path]);
  }

  const { data: room, error: updateError } = await supabase
    .from("rooms")
    .update({ logo_path: null })
    .eq("slug", parsed.data.roomSlug)
    .select("slug, logo_path, accent_color")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ room });
}
