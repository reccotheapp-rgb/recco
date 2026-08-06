import type { MediaItem } from '../types/media';

export const picks: MediaItem[] = [
  { id: 'after-yang', kind: 'FILM', title: 'After Yang', by: 'Kogonada', year: '2021', image: 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=900&q=85', note: 'A quiet, beautiful story about memory, family and what makes us human.' },
  { id: 'station-eleven', kind: 'BOOK', title: 'Station Eleven', by: 'Emily St. John Mandel', year: '2014', image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=85', note: 'For your love of art-filled worlds and stories with a pulse.' },
  { id: 'ethel', kind: 'ALBUM', title: 'Preacher’s Daughter', by: 'Ethel Cain', year: '2022', image: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=85', note: 'Cinematic, melancholic and completely absorbing.' },
  { id: 'past-lives', kind: 'FILM', title: 'Past Lives', by: 'Celine Song', year: '2023', image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=85', note: 'A precise, tender reflection on connection and time.' },
];

export const continueItems: MediaItem[] = [
  { id: 'severance', kind: 'SHOW', title: 'Severance', by: 'S2 · Episode 4', year: '62% watched', image: 'https://images.unsplash.com/photo-1519608487953-e999c86e7452?auto=format&fit=crop&w=600&q=85', note: '' },
  { id: 'klara', kind: 'BOOK', title: 'Klara and the Sun', by: 'Kazuo Ishiguro', year: 'Page 146 of 320', image: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=600&q=85', note: '' },
  { id: 'bloom', kind: 'ALBUM', title: 'Bloom', by: 'Beach House', year: 'On repeat', image: 'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=600&q=85', note: '' },
];

export const upcomingItems: MediaItem[] = [
  { id: 'slow-horses', kind: 'SHOW', title: 'Slow Horses', by: 'Season 5 · Episode 1', year: 'Tomorrow', image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=600&q=85', note: '' },
  { id: 'solenoid', kind: 'BOOK', title: 'The Ministry of Time', by: 'Kaliane Bradley', year: 'This weekend', image: 'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=600&q=85', note: '' },
  { id: 'lorde', kind: 'ALBUM', title: 'Virgin', by: 'Lorde', year: 'Friday', image: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=600&q=85', note: '' },
];

export type Episode = { id: string; number: number; title: string; runtime: string; released: boolean };

export const showEpisodes: Record<string, Episode[]> = {
  severance: [
    { id: 'severance-s2e1', number: 1, title: 'Hello, Ms. Cobel', runtime: '57 min', released: true },
    { id: 'severance-s2e2', number: 2, title: 'Goodbye, Mrs. Selvig', runtime: '48 min', released: true },
    { id: 'severance-s2e3', number: 3, title: 'Who Is Alive?', runtime: '55 min', released: true },
    { id: 'severance-s2e4', number: 4, title: "Woe's Hollow", runtime: '51 min', released: true },
    { id: 'severance-s2e5', number: 5, title: 'Trojan’s Horse', runtime: 'Coming Aug 04', released: false },
  ],
  'slow-horses': [
    { id: 'slow-horses-s5e1', number: 1, title: 'Season premiere', runtime: 'Tomorrow', released: false },
  ],
};
