revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles for insert with check ((select auth.uid()) = id);

drop policy if exists "Users manage their own media states" on public.media_states;
create policy "Users manage their own media states"
  on public.media_states for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own swipe actions" on public.swipe_actions;
create policy "Users manage their own swipe actions"
  on public.swipe_actions for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists media_states_user_status_updated_idx
  on public.media_states (user_id, status, updated_at desc);
create index if not exists swipe_actions_user_created_idx
  on public.swipe_actions (user_id, created_at desc);
