// Publisher names: one list, so the same house is never spelled two ways. Pure helpers.

/** A name as it is stored: no extra spaces at the ends or between words. */
export function cleanPublisherName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

const MARKS = /[ً-ٰٟـ]/g; // vowel marks and the stretching dash

/**
 * What two spellings of one name have in common: no vowel marks, the hamza forms of alef are one letter, the dotless and
 * dotted ya are one, the ta marbuta and ha are one, spaces collapse, latin letters lower-case. The same rule as the
 * database's publisher_key(), which refuses a second name with the same key.
 */
export function publisherKey(name: string): string {
  return cleanPublisherName(
    name
      .toLowerCase()
      .replace(MARKS, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه'),
  );
}

/**
 * The names to choose from: the list, without two names of one key, in Arabic order. A name a book already carries that is
 * not in the list (written before the list existed) is kept as it is, so opening a book never drops its publisher.
 */
export function publisherOptions(listed: readonly string[], current: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of listed.map(cleanPublisherName).filter(Boolean)) {
    const key = publisherKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  out.sort((a, b) => a.localeCompare(b, 'ar'));
  const own = cleanPublisherName(current);
  if (own && !seen.has(publisherKey(own))) out.unshift(own);
  return out;
}

/** The listed name a typed name is the same as (by key), or null when it is new. */
export function findPublisher(listed: readonly string[], typed: string): string | null {
  const key = publisherKey(typed);
  if (!key) return null;
  return listed.find((name) => publisherKey(name) === key) ?? null;
}
