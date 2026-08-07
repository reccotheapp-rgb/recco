alter table public.swipe_actions
  drop constraint if exists swipe_actions_action_check;

update public.swipe_actions
  set action = 'SAVE'
  where action = 'KEEP';

alter table public.swipe_actions
  add constraint swipe_actions_action_check
  check (action in ('LOVE', 'SAVE', 'PASS', 'NOT_FOR_ME'));

alter table public.swipe_actions
  add column if not exists media_kind text check (media_kind in ('FILM', 'SHOW', 'BOOK', 'ALBUM')),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.taste_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  feature_weights jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.taste_profiles enable row level security;

drop policy if exists "Users manage their own taste profile" on public.taste_profiles;
create policy "Users manage their own taste profile"
  on public.taste_profiles for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.taste_profiles to authenticated;

create index if not exists swipe_actions_user_kind_created_idx
  on public.swipe_actions (user_id, media_kind, created_at desc);
