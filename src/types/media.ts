export type MediaKind = 'FILM' | 'SHOW' | 'BOOK' | 'ALBUM' | 'GAME';

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
  /** A short, transparent explanation returned by Recco's recommendation service. */
  reason?: string;
};
