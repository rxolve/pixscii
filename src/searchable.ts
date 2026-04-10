export interface Searchable {
  id: string;
  name: string;
  category: string;
  tags: string[];
}

export function matchQuery<T extends Searchable>(entries: T[], query: string, extraMatch?: (e: T, q: string) => boolean): T[] {
  const q = query.toLowerCase();
  return entries.filter(
    (e) =>
      e.id.includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q)) ||
      extraMatch?.(e, q)
  );
}

export function findById<T extends Searchable>(entries: T[], id: string): T | undefined {
  return entries.find((e) => e.id === id);
}

export function filterByCategory<T extends Searchable>(entries: T[], category: string): T[] {
  return entries.filter((e) => e.category === category);
}

export function pickRandom<T>(entries: T[]): T {
  if (entries.length === 0) throw new Error('No entries available');
  return entries[Math.floor(Math.random() * entries.length)];
}

export function uniqueCategories<T extends Searchable>(entries: T[]): string[] {
  return [...new Set(entries.map((e) => e.category))];
}
