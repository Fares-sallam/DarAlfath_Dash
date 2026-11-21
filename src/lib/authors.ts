// Author names: one list, so the same author is never spelled two ways. (The rules are in nameLists.ts.)
import { cleanName, findName, nameOptions, personKey } from '@/lib/nameLists';

export const cleanAuthorName = cleanName;
export const authorKey = personKey;
export const authorOptions = (listed: readonly string[], current: string) => nameOptions(listed, current, personKey);
export const findAuthor = (listed: readonly string[], typed: string) => findName(listed, typed, personKey);
