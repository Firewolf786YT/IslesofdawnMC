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
  user_id uuid references auth.users(id) on delete set null,
  discord_user_id text,
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

alter table public.application_submissions
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.application_submissions
  add column if not exists discord_user_id text;

create index if not exists idx_application_submissions_created_at
  on public.application_submissions (created_at desc);

create index if not exists idx_application_submissions_reviewed_status
  on public.application_submissions (status, reviewed_at desc);

create index if not exists idx_application_submissions_discord_user_id
  on public.application_submissions (discord_user_id);

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
  role text not null check (role in ('player', 'builder', 'event_team', 'media', 'qa_tester', 'helper', 'moderator', 'developer', 'admin', 'manager', 'owner')),
  updated_at timestamptz not null default now()
);

alter table public.user_roles
  drop constraint if exists user_roles_role_check;

update public.user_roles
set role = case lower(trim(role))
  when 'user' then 'player'
  when 'staff' then 'developer'
  when 'event team' then 'event_team'
  when 'event-team' then 'event_team'
  when 'qatester' then 'qa_tester'
  when 'qa tester' then 'qa_tester'
  when 'qa-tester' then 'qa_tester'
  else lower(trim(role))
end,
updated_at = now();

update public.user_roles
set role = 'player',
updated_at = now()
where role not in ('player', 'builder', 'event_team', 'media', 'qa_tester', 'helper', 'moderator', 'developer', 'admin', 'manager', 'owner');

alter table public.user_roles
  add constraint user_roles_role_check
  check (role in ('player', 'builder', 'event_team', 'media', 'qa_tester', 'helper', 'moderator', 'developer', 'admin', 'manager', 'owner'));

update public.user_roles
set role = case role
  when 'user' then 'player'
  when 'staff' then 'developer'
  else role
end,
updated_at = now()
where role in ('user', 'staff');

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$'),
  avatar_url text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.user_discord_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  discord_user_id text not null unique,
  discord_tag text,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.discord_link_codes (
  code text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_discord_user_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_user_profiles_username_lower
  on public.user_profiles (lower(username));

create unique index if not exists idx_user_discord_links_discord_user_id
  on public.user_discord_links (discord_user_id);

create unique index if not exists idx_discord_link_codes_user_id
  on public.discord_link_codes (user_id);

create table if not exists public.announcements (
  id text primary key,
  title text not null,
  message text not null,
  image_data_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_announcements_created_at
  on public.announcements (created_at desc);

create table if not exists public.site_notifications (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  link text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_site_notifications_user_id_created_at
  on public.site_notifications (user_id, created_at desc);

create index if not exists idx_site_notifications_created_by
  on public.site_notifications (created_by);

create table if not exists public.roadmap_cards (
  id text primary key,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'in_review', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roadmap_card_checklists (
  id text primary key,
  card_id text not null references public.roadmap_cards(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.roadmap_card_tasks (
  id text primary key,
  card_id text not null references public.roadmap_cards(id) on delete cascade,
  checklist_id text references public.roadmap_card_checklists(id) on delete cascade,
  title text not null,
  is_completed boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.roadmap_card_assignments (
  id text primary key,
  card_id text not null references public.roadmap_cards(id) on delete cascade,
  assigned_to uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_roadmap_cards_status
  on public.roadmap_cards (status);

create index if not exists idx_roadmap_cards_created_at
  on public.roadmap_cards (created_at desc);

create index if not exists idx_roadmap_card_checklists_card_id
  on public.roadmap_card_checklists (card_id);

create index if not exists idx_roadmap_card_tasks_card_id
  on public.roadmap_card_tasks (card_id);

create index if not exists idx_roadmap_card_tasks_checklist_id
  on public.roadmap_card_tasks (checklist_id);

create index if not exists idx_roadmap_card_assignments_card_id
  on public.roadmap_card_assignments (card_id);

create index if not exists idx_roadmap_card_assignments_assigned_to
  on public.roadmap_card_assignments (assigned_to);

alter table public.application_statuses enable row level security;
alter table public.application_submissions enable row level security;
alter table public.appeal_submissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_discord_links enable row level security;
alter table public.discord_link_codes enable row level security;
alter table public.announcements enable row level security;
alter table public.site_notifications enable row level security;
alter table public.roadmap_cards enable row level security;
alter table public.roadmap_card_checklists enable row level security;
alter table public.roadmap_card_tasks enable row level security;
alter table public.roadmap_card_assignments enable row level security;

create or replace function public.is_staff_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('builder', 'event_team', 'media', 'qa_tester', 'helper', 'moderator', 'developer', 'admin', 'manager', 'owner')
  );
$$;

create or replace function public.is_staff_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin', 'manager', 'owner')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin', 'manager', 'owner')
  );
$$;

create or replace function public.is_role_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin', 'manager', 'owner')
  );
$$;

drop function if exists public.list_public_staff_members();
drop function if exists public.list_staff_directory();

create function public.list_public_staff_members()
returns table (
  username text,
  role text,
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

create function public.list_staff_directory()
returns table (
  user_id uuid,
  username text,
  role text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    up.user_id,
    up.username,
    ur.role,
    up.avatar_url
  from public.user_profiles up
  join public.user_roles ur on ur.user_id = up.user_id
  where public.is_staff_member()
    and ur.role in ('builder', 'event_team', 'media', 'qa_tester', 'helper', 'moderator', 'developer', 'admin', 'manager', 'owner')
  order by
    case ur.role
      when 'owner' then 1
      when 'manager' then 2
      when 'admin' then 3
      when 'developer' then 4
      when 'moderator' then 5
      when 'helper' then 6
      when 'qa_tester' then 7
      when 'media' then 8
      when 'event_team' then 9
      when 'builder' then 10
      else 11
    end,
    lower(up.username);
$$;

revoke all on function public.is_staff_member() from public;
grant execute on function public.is_staff_member() to authenticated;

revoke all on function public.is_staff_or_admin() from public;
grant execute on function public.is_staff_or_admin() to anon, authenticated;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

revoke all on function public.is_role_manager() from public;
grant execute on function public.is_role_manager() to anon, authenticated;

revoke all on function public.list_public_staff_members() from public;
grant execute on function public.list_public_staff_members() to anon, authenticated;

revoke all on function public.list_staff_directory() from public;
grant execute on function public.list_staff_directory() to authenticated;

drop policy if exists application_statuses_read on public.application_statuses;
drop policy if exists application_statuses_write on public.application_statuses;
drop policy if exists application_statuses_write_staff on public.application_statuses;
drop policy if exists application_submissions_read on public.application_submissions;
drop policy if exists application_submissions_write on public.application_submissions;
drop policy if exists application_submissions_insert_public on public.application_submissions;
drop policy if exists application_submissions_read_staff on public.application_submissions;
drop policy if exists application_submissions_update_staff on public.application_submissions;
drop policy if exists appeal_submissions_read on public.appeal_submissions;
drop policy if exists appeal_submissions_write on public.appeal_submissions;
drop policy if exists appeal_submissions_insert_public on public.appeal_submissions;
drop policy if exists appeal_submissions_read_staff on public.appeal_submissions;
drop policy if exists appeal_submissions_update_staff on public.appeal_submissions;

drop policy if exists user_roles_select_self on public.user_roles;
drop policy if exists user_roles_select_staff on public.user_roles;
drop policy if exists user_roles_admin_write on public.user_roles;
drop policy if exists user_profiles_select_self on public.user_profiles;
drop policy if exists user_profiles_select_staff on public.user_profiles;
drop policy if exists user_profiles_insert_self on public.user_profiles;
drop policy if exists user_profiles_update_self on public.user_profiles;
drop policy if exists user_discord_links_select_self on public.user_discord_links;
drop policy if exists user_discord_links_select_staff on public.user_discord_links;
drop policy if exists user_discord_links_insert_self on public.user_discord_links;
drop policy if exists user_discord_links_update_self on public.user_discord_links;
drop policy if exists user_discord_links_delete_self on public.user_discord_links;
drop policy if exists discord_link_codes_select_self on public.discord_link_codes;
drop policy if exists discord_link_codes_insert_self on public.discord_link_codes;
drop policy if exists discord_link_codes_update_self on public.discord_link_codes;
drop policy if exists discord_link_codes_delete_self on public.discord_link_codes;
drop policy if exists announcements_read_public on public.announcements;
drop policy if exists announcements_write_staff on public.announcements;
drop policy if exists site_notifications_select_own on public.site_notifications;
drop policy if exists site_notifications_insert_staff on public.site_notifications;
drop policy if exists site_notifications_delete_own on public.site_notifications;
drop policy if exists roadmap_cards_select_staff on public.roadmap_cards;
drop policy if exists roadmap_cards_insert_staff on public.roadmap_cards;
drop policy if exists roadmap_cards_update_staff on public.roadmap_cards;
drop policy if exists roadmap_cards_delete_staff on public.roadmap_cards;
drop policy if exists roadmap_card_checklists_select_staff on public.roadmap_card_checklists;
drop policy if exists roadmap_card_checklists_insert_staff on public.roadmap_card_checklists;
drop policy if exists roadmap_card_checklists_update_staff on public.roadmap_card_checklists;
drop policy if exists roadmap_card_checklists_delete_staff on public.roadmap_card_checklists;
drop policy if exists roadmap_card_tasks_select_staff on public.roadmap_card_tasks;
drop policy if exists roadmap_card_tasks_insert_staff on public.roadmap_card_tasks;
drop policy if exists roadmap_card_tasks_update_staff on public.roadmap_card_tasks;
drop policy if exists roadmap_card_tasks_delete_staff on public.roadmap_card_tasks;
drop policy if exists roadmap_card_assignments_select_staff on public.roadmap_card_assignments;
drop policy if exists roadmap_card_assignments_insert_staff on public.roadmap_card_assignments;
drop policy if exists roadmap_card_assignments_delete_staff on public.roadmap_card_assignments;

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
  with check (auth.uid() is not null and user_id = auth.uid());

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
  using (public.is_role_manager())
  with check (public.is_role_manager());

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

create policy user_discord_links_select_self
  on public.user_discord_links
  for select
  using (auth.uid() = user_id);

create policy user_discord_links_select_staff
  on public.user_discord_links
  for select
  using (public.is_staff_or_admin());

create policy user_discord_links_insert_self
  on public.user_discord_links
  for insert
  with check (auth.uid() = user_id);

create policy user_discord_links_update_self
  on public.user_discord_links
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy user_discord_links_delete_self
  on public.user_discord_links
  for delete
  using (auth.uid() = user_id);

create policy discord_link_codes_select_self
  on public.discord_link_codes
  for select
  using (auth.uid() = user_id);

create policy discord_link_codes_insert_self
  on public.discord_link_codes
  for insert
  with check (auth.uid() = user_id);

create policy discord_link_codes_update_self
  on public.discord_link_codes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy discord_link_codes_delete_self
  on public.discord_link_codes
  for delete
  using (auth.uid() = user_id);

create policy announcements_read_public
  on public.announcements
  for select
  using (true);

create policy announcements_write_staff
  on public.announcements
  for all
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

create policy site_notifications_select_own
  on public.site_notifications
  for select
  using (auth.uid() = user_id);

create policy site_notifications_insert_staff
  on public.site_notifications
  for insert
  to authenticated
  with check (public.is_staff_member() and auth.uid() = created_by);

create policy site_notifications_delete_own
  on public.site_notifications
  for delete
  using (auth.uid() = user_id);

-- Roadmap cards policies (staff only)
create policy roadmap_cards_select_staff
  on public.roadmap_cards
  for select
  using (public.is_staff_member());

create policy roadmap_cards_insert_staff
  on public.roadmap_cards
  for insert
  to authenticated
  with check (public.is_staff_member() and auth.uid() = created_by);

create policy roadmap_cards_update_staff
  on public.roadmap_cards
  for update
  using (public.is_staff_member())
  with check (public.is_staff_member());

create policy roadmap_cards_delete_staff
  on public.roadmap_cards
  for delete
  using (public.is_staff_member());

-- Roadmap card checklists policies
create policy roadmap_card_checklists_select_staff
  on public.roadmap_card_checklists
  for select
  using (public.is_staff_member());

create policy roadmap_card_checklists_insert_staff
  on public.roadmap_card_checklists
  for insert
  to authenticated
  with check (public.is_staff_member());

create policy roadmap_card_checklists_update_staff
  on public.roadmap_card_checklists
  for update
  using (public.is_staff_member())
  with check (public.is_staff_member());

create policy roadmap_card_checklists_delete_staff
  on public.roadmap_card_checklists
  for delete
  using (public.is_staff_member());

-- Roadmap card tasks policies
create policy roadmap_card_tasks_select_staff
  on public.roadmap_card_tasks
  for select
  using (public.is_staff_member());

create policy roadmap_card_tasks_insert_staff
  on public.roadmap_card_tasks
  for insert
  to authenticated
  with check (public.is_staff_member());

create policy roadmap_card_tasks_update_staff
  on public.roadmap_card_tasks
  for update
  using (public.is_staff_member())
  with check (public.is_staff_member());

create policy roadmap_card_tasks_delete_staff
  on public.roadmap_card_tasks
  for delete
  using (public.is_staff_member());

-- Roadmap card assignments policies
create policy roadmap_card_assignments_select_staff
  on public.roadmap_card_assignments
  for select
  using (public.is_staff_member());

create policy roadmap_card_assignments_insert_staff
  on public.roadmap_card_assignments
  for insert
  to authenticated
  with check (public.is_staff_member() and auth.uid() = assigned_by);

create policy roadmap_card_assignments_delete_staff
  on public.roadmap_card_assignments
  for delete
  using (public.is_staff_member());

-- Bootstrap first admin manually (replace with your auth user UUID):
-- insert into public.user_roles (user_id, role)
-- values ('00000000-0000-0000-0000-000000000000', 'admin')
-- on conflict (user_id) do update set role = excluded.role, updated_at = now();

-- After applying this schema, existing users can create or update their username
-- from profile.html. Admin role assignment can resolve usernames via public.user_profiles,
-- while roles remain stored against immutable auth UUIDs in public.user_roles.
