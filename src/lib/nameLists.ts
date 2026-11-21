// Names chosen from one list (publishers, authors), so the same name is never written two ways. Pure helpers.

/** A name as it is stored: no extra spaces at the ends or between words. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

const MARKS = /[ً-ٰٟـ]/g; // vowel marks and the stretching dash

/**
 * What two spellings of one name have in common: no vowel marks, the hamza forms of alef are one letter, the dotless and
 * dotted ya are one, the ta marbuta and ha are one, spaces collapse, latin letters lower-case. The same rule as the
 * database's publisher_key(), which refuses a second name with the same key.
 */
export function nameKey(name: string): string {
  return cleanName(
    name
      .toLowerCase()
      .replace(MARKS, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه'),
  );
}

/** For a person: the same key, and a title in front («د / », «دكتور », «أ. ») does not make another person. Same rule as author_key(). */
export function personKey(name: string): string {
  return nameKey(name).replace(/^(د|dr|prof|ا|دكتور|دكتوره|استاذ|استاذه)(\s*[./]\s*|\s+)/, '').trim();
}

export type KeyFn = (name: string) => string;

/**
 * The names to choose from: the list, without two names of one key, in Arabic order. A name a book already carries that is
 * not in the list (written before the list existed) is kept as it is, so opening a book never drops it.
 */
export function nameOptions(listed: readonly string[], current: string, keyOf: KeyFn = nameKey): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of listed.map(cleanName).filter(Boolean)) {
    const key = keyOf(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  out.sort((a, b) => a.localeCompare(b, 'ar'));
  const own = cleanName(current);
  if (own && !seen.has(keyOf(own))) out.unshift(own);
  return out;
}

/** The listed name a typed name is the same as (by key), or null when it is new. */
export function findName(listed: readonly string[], typed: string, keyOf: KeyFn = nameKey): string | null {
  const key = keyOf(typed);
  if (!key) return null;
  return listed.find((name) => keyOf(name) === key) ?? null;
}
