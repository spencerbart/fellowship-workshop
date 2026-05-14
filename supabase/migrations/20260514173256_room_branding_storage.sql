alter table public.rooms
add column if not exists logo_path text;

alter table public.rooms
add column if not exists accent_color text not null default '#17483f';

alter table public.rooms
drop constraint if exists rooms_accent_color_check;

alter table public.rooms
add constraint rooms_accent_color_check
check (accent_color ~ '^#[0-9A-Fa-f]{6}$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'room-assets',
  'room-assets',
  true,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop function if exists public.list_my_org_rooms(uuid);

create or replace function public.list_my_org_rooms(requested_org_id uuid)
returns table (
  slug text,
  name text,
  is_locked boolean,
  archived_at timestamptz,
  logo_path text,
  accent_color text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rooms.slug,
    rooms.name,
    rooms.is_locked,
    rooms.archived_at,
    rooms.logo_path,
    rooms.accent_color
  from public.rooms
  where rooms.org_id = requested_org_id
    and public.is_org_admin(requested_org_id, auth.uid())
  order by rooms.created_at desc;
$$;
