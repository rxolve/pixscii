import { describe, it, expect } from 'vitest';
import { matchQuery, findById, filterByCategory, pickRandom, uniqueCategories } from './searchable.js';

const entries = [
  { id: 'sword', name: 'Sword', category: 'items', tags: ['weapon', 'melee'] },
  { id: 'shield', name: 'Shield', category: 'items', tags: ['armor', 'defense'] },
  { id: 'grass', name: 'Grass', category: 'tiles', tags: ['ground', 'nature'] },
  { id: 'heart-full', name: 'Heart Full', category: 'ui', tags: ['health', 'hp'] },
];

describe('matchQuery', () => {
  it('matches by id', () => {
    expect(matchQuery(entries, 'sword')).toHaveLength(1);
  });

  it('matches by tag', () => {
    expect(matchQuery(entries, 'weapon')).toHaveLength(1);
  });

  it('matches by category', () => {
    expect(matchQuery(entries, 'items')).toHaveLength(2);
  });

  it('is case-insensitive', () => {
    expect(matchQuery(entries, 'SWORD')).toHaveLength(1);
  });

  it('returns empty for no matches', () => {
    expect(matchQuery(entries, 'zzz')).toHaveLength(0);
  });
});

describe('findById', () => {
  it('finds entry by exact id', () => {
    expect(findById(entries, 'grass')?.name).toBe('Grass');
  });

  it('returns undefined for missing id', () => {
    expect(findById(entries, 'nonexistent')).toBeUndefined();
  });
});

describe('filterByCategory', () => {
  it('returns entries in category', () => {
    expect(filterByCategory(entries, 'items')).toHaveLength(2);
  });
});

describe('pickRandom', () => {
  it('returns an entry from the array', () => {
    const picked = pickRandom(entries);
    expect(entries).toContain(picked);
  });

  it('throws on empty array', () => {
    expect(() => pickRandom([])).toThrow();
  });
});

describe('uniqueCategories', () => {
  it('returns unique categories', () => {
    const cats = uniqueCategories(entries);
    expect(cats).toContain('items');
    expect(cats).toContain('tiles');
    expect(cats).toContain('ui');
    expect(cats).toHaveLength(3);
  });
});
