create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.media_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id text not null,
  media_kind text not null check (media_kind in ('FILM', 'SHOW', 'BOOK', 'ALBUM')),
  title text not null,
  image_url text,
  status text not null default 'SAVED' check (status in ('SAVED', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'PAUSED', 'DROPPED')),
  rating smallint check (rating between 1 and 5),
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, media_id)
);

create table if not exists public.swipe_actions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id text not null,
  action text not null check (action in ('KEEP', 'PASS')),
  created_at timestamptz not null default now(),
  unique (user_id, media_id)
);

alter table public.profiles enable row level security;
alter table public.media_states enable row level security;
alter table public.swipe_actions enable row level security;

create policy "Users can read their own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can create their own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users manage their own media states" on public.media_states for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage their own swipe actions" on public.swipe_actions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
