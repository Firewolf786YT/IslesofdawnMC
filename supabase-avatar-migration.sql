-- Avatar support migration for IslesOfDawnMC
-- Run this AFTER supabase-rank-migration.sql.
-- Safe to re-run; all statements use IF NOT EXISTS / OR REPLACE / ON CONFLICT DO UPDATE.

begin;

-- 1) Add avatar_url column to user_profiles
alter table public.user_profiles
  add column if not exists avatar_url text;

-- 2) Create a public avatars storage bucket (2 MB limit, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update set
  public          = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

-- 3) Storage RLS policies for avatars bucket

-- Anyone (including anonymous visitors) can read avatar images
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects
  for select
  using (bucket_id = 'avatars');

-- Authenticated users may upload/replace only their own avatar folder ({user_id}/avatar)
drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users may overwrite their own avatar
drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users may delete their own avatar
drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4) Update list_public_staff_members() to include avatar_url
drop function if exists public.list_public_staff_members();

create function public.list_public_staff_members()
returns table (
  username   text,
  role       text,
  updated_at timestamptz,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    up.username,
    ur.role,
    ur.updated_at,
    up.avatar_url
  from public.user_roles ur
  join public.user_profiles up on up.user_id = ur.user_id
  where ur.role in ('builder', 'event_team', 'media', 'qa_tester', 'helper', 'moderator', 'developer', 'admin', 'manager', 'owner')
  order by
    case ur.role
      when 'owner'      then 1
      when 'manager'    then 2
      when 'admin'      then 3
      when 'developer'  then 4
      when 'moderator'  then 5
      when 'helper'     then 6
      when 'qa_tester'  then 7
      when 'media'      then 8
      when 'event_team' then 9
      when 'builder'    then 10
      else 11
    end,
    lower(up.username);
$$;

revoke all on function public.list_public_staff_members() from public;
grant execute on function public.list_public_staff_members() to anon, authenticated;

commit;
