-- Run this in Supabase SQL Editor
-- Normalized schema for IslesOfDawnMC site data.

create extension if not exists pgcrypto;

create table if not exists public.application_statuses (
  role_id text primary key,
  is_open boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.application_submissions (
  id text primary key,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  role_id text not null,
  role_title text not null,
  minecraft_username text,
  age text,
  discord text,
  email text,
  why_join text,
  experience text,
  conflict_handling text,
  community_improvement text,
  acknowledgements jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_application_submissions_created_at
  on public.application_submissions (created_at desc);

create table if not exists public.appeal_submissions (
  id text primary key,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  minecraft_name text,
  discord text,
  email text,
  punishment_type text,
  punishment_date text,
  punishment_location text,
  event_summary text,
  reconsider_reason text,
  prevention_plan text,
  additional_context text,
  acknowledgements jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_appeal_submissions_created_at
  on public.appeal_submissions (created_at desc);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'staff', 'admin')),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$'),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_user_profiles_username_lower
  on public.user_profiles (lower(username));

create table if not exists public.announcements (
  id text primary key,
  title text not null,
  message text not null,
  image_data_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_announcements_created_at
  on public.announcements (created_at desc);

alter table public.application_statuses enable row level security;
alter table public.application_submissions enable row level security;
alter table public.appeal_submissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_profiles enable row level security;
alter table public.announcements enable row level security;

create or replace function public.is_staff_or_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('staff', 'admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
  );
$$;

drop policy if exists application_statuses_read on public.application_statuses;
drop policy if exists application_statuses_write on public.application_statuses;
drop policy if exists application_submissions_read on public.application_submissions;
drop policy if exists application_submissions_write on public.application_submissions;
drop policy if exists appeal_submissions_read on public.appeal_submissions;
drop policy if exists appeal_submissions_write on public.appeal_submissions;

drop policy if exists user_roles_select_self on public.user_roles;
drop policy if exists user_roles_select_staff on public.user_roles;
drop policy if exists user_roles_admin_write on public.user_roles;
drop policy if exists user_profiles_select_self on public.user_profiles;
drop policy if exists user_profiles_select_staff on public.user_profiles;
drop policy if exists user_profiles_insert_self on public.user_profiles;
drop policy if exists user_profiles_update_self on public.user_profiles;
drop policy if exists announcements_read_public on public.announcements;
drop policy if exists announcements_write_staff on public.announcements;

create policy application_statuses_read
  on public.application_statuses
  for select
  using (true);

create policy application_statuses_write_staff
  on public.application_statuses
  for all
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

create policy application_submissions_insert_public
  on public.application_submissions
  for insert
  with check (true);

create policy application_submissions_read_staff
  on public.application_submissions
  for select
  using (public.is_staff_or_admin());

create policy application_submissions_update_staff
  on public.application_submissions
  for update
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

create policy appeal_submissions_insert_public
  on public.appeal_submissions
  for insert
  with check (true);

create policy appeal_submissions_read_staff
  on public.appeal_submissions
  for select
  using (public.is_staff_or_admin());

create policy appeal_submissions_update_staff
  on public.appeal_submissions
  for update
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

create policy user_roles_select_self
  on public.user_roles
  for select
  using (auth.uid() = user_id);

create policy user_roles_select_staff
  on public.user_roles
  for select
  using (public.is_staff_or_admin());

create policy user_roles_admin_write
  on public.user_roles
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy user_profiles_select_self
  on public.user_profiles
  for select
  using (auth.uid() = user_id);

create policy user_profiles_select_staff
  on public.user_profiles
  for select
  using (public.is_staff_or_admin());

create policy user_profiles_insert_self
  on public.user_profiles
  for insert
  with check (auth.uid() = user_id);

create policy user_profiles_update_self
  on public.user_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy announcements_read_public
  on public.announcements
  for select
  using (true);

create policy announcements_write_staff
  on public.announcements
  for all
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

-- Bootstrap first admin manually (replace with your auth user UUID):
-- insert into public.user_roles (user_id, role)
-- values ('00000000-0000-0000-0000-000000000000', 'admin')
-- on conflict (user_id) do update set role = excluded.role, updated_at = now();

-- After applying this schema, existing users can create or update their username
-- from profile.html. Admin role assignment can resolve usernames via public.user_profiles,
-- while roles remain stored against immutable auth UUIDs in public.user_roles.
