-- One-time migration for expanded IslesOfDawnMC rank model
-- Safe to run on an existing project that already has public.user_roles and related policies.

begin;

-- 1) Expand allowed roles on public.user_roles
alter table public.user_roles
  drop constraint if exists user_roles_role_check;

alter table public.user_roles
  add constraint user_roles_role_check
  check (role in ('player', 'builder', 'event_team', 'media', 'qa_tester', 'helper', 'moderator', 'developer', 'admin', 'manager', 'owner'));

-- 2) Migrate legacy values to new canonical roles
update public.user_roles
set role = case role
  when 'user' then 'player'
  when 'staff' then 'developer'
  else role
end,
updated_at = now()
where role in ('user', 'staff');

-- 3) Update helper functions for portal access and role management
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

revoke all on function public.is_staff_or_admin() from public;
grant execute on function public.is_staff_or_admin() to anon, authenticated;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

revoke all on function public.is_role_manager() from public;
grant execute on function public.is_role_manager() to anon, authenticated;

revoke all on function public.list_public_staff_members() from public;
grant execute on function public.list_public_staff_members() to anon, authenticated;

-- 4) Ensure user role writes are limited to manager-level ranks
-- Existing policy name in this project is user_roles_admin_write.
drop policy if exists user_roles_admin_write on public.user_roles;

create policy user_roles_admin_write
  on public.user_roles
  for all
  using (public.is_role_manager())
  with check (public.is_role_manager());

commit;
