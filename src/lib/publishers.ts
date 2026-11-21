// Publisher names: one list, so the same house is never spelled two ways. (The rules are in nameLists.ts.)
import { cleanName, findName, nameKey, nameOptions } from '@/lib/nameLists';

export const cleanPublisherName = cleanName;
export const publisherKey = nameKey;
export const publisherOptions = (listed: readonly string[], current: string) => nameOptions(listed, current, nameKey);
export const findPublisher = (listed: readonly string[], typed: string) => findName(listed, typed, nameKey);
