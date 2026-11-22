// The form for «تفاصيل العرض» as plain data: the checks that stop a half-written footer link or badge being saved (reading
// what is saved silently drops them, so the form has to say so first) and the small list moves. Pure, so it is tested
// without a screen.
import {
  FOOTER_LABEL_MAX, FOOTER_MAX_COLUMNS, FOOTER_MAX_LINKS, TRUST_MAX_ITEMS, TRUST_TEXT_MAX, safeFooterUrl,
  type DisplaySettings, type FooterColumn, type FooterLink, type TrustItem,
} from '@/lib/displaySettings';

/** What is wrong with the form, in the owner's words; empty when it can be saved. */
export function displayProblems(draft: DisplaySettings): string[] {
  const problems: string[] = [];

  draft.page.trust.forEach((item, i) => {
    if (item.text.trim().length === 0) problems.push(`شارة الثقة رقم ${i + 1}: اكتب كلمة أو احذفها.`);
    else if (item.text.trim().length > TRUST_TEXT_MAX) problems.push(`شارة الثقة رقم ${i + 1}: أطول من ${TRUST_TEXT_MAX} حرف.`);
  });
  if (draft.page.trust.length > TRUST_MAX_ITEMS) problems.push(`شارات الثقة أكتر من ${TRUST_MAX_ITEMS}.`);

  if (draft.footer.columns.length > FOOTER_MAX_COLUMNS) problems.push(`أعمدة التذييل أكتر من ${FOOTER_MAX_COLUMNS}.`);
  draft.footer.columns.forEach((column, c) => {
    const where = column.title.trim() ? `عمود «${column.title.trim()}»` : `العمود رقم ${c + 1}`;
    if (column.links.length > FOOTER_MAX_LINKS) problems.push(`${where}: أكتر من ${FOOTER_MAX_LINKS} روابط.`);
    column.links.forEach((link, l) => {
      const label = link.label.trim();
      const url = link.url.trim();
      if (!label && !url) {
        problems.push(`${where}، الرابط رقم ${l + 1}: فاضي، اكتب بياناته أو احذفه.`);
      } else if (!label) {
        problems.push(`${where}، الرابط رقم ${l + 1}: اكتب كلمة الرابط.`);
      } else if (label.length > FOOTER_LABEL_MAX) {
        problems.push(`${where}، «${label}»: الكلمة أطول من ${FOOTER_LABEL_MAX} حرف.`);
      } else if (safeFooterUrl(url) === null) {
        problems.push(`${where}، «${label}»: العنوان لازم يبدأ بـ / (صفحة في المتجر) أو https:// أو mailto: أو tel:`);
      }
    });
  });

  return problems;
}

/** A list with the item at `index` moved one place (−1 up, +1 down); the same list when it cannot move. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export const replaceAt = <T,>(list: readonly T[], index: number, value: T): T[] => list.map((item, i) => (i === index ? value : item));
export const removeAt = <T,>(list: readonly T[], index: number): T[] => list.filter((_, i) => i !== index);

export const blankLink = (): FooterLink => ({ label: '', url: '' });
export const blankColumn = (): FooterColumn => ({ title: '', links: [blankLink()] });
export const blankTrust = (): TrustItem => ({ icon: 'check', text: '' });
