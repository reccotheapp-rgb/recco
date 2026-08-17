alter table public.media_states
  drop constraint if exists media_states_media_kind_check;

alter table public.media_states
  add constraint media_states_media_kind_check
  check (media_kind in ('FILM', 'SHOW', 'BOOK', 'ALBUM', 'GAME'));
