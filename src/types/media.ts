export type MediaKind = 'FILM' | 'SHOW' | 'BOOK' | 'ALBUM';

export type MediaItem = {
  id: string;
  kind: MediaKind;
  title: string;
  by: string;
  year: string;
  image: string;
  note: string;
  score?: number;
  genres?: string[];
};
