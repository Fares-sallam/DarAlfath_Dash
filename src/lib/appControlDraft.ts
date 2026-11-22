// The form for «التحكم في التطبيق» as plain data: what stops a half-finished setting from being saved (reading what is saved
// silently drops a bad address or an empty pop-up, so the form has to say so first), and the pieces the form computes.
// Pure, so it is tested without a screen.
import {
  BUTTON_MAX, MESSAGE_MAX, TITLE_MAX, cleanStoreUrl, newCampaignId, safeAppLink, safeImageUrl,
  type AppControl, type PopupSettings,
} from '@/lib/appControl';

/** What is wrong with the form, in the owner's words; empty when it can be saved. */
export function appControlProblems(draft: AppControl): string[] {
  const problems: string[] = [];
  const m = draft.maintenance;
  const p = draft.popup;
  const u = draft.update;

  if (m.startsAt && m.endsAt && Date.parse(m.endsAt) <= Date.parse(m.startsAt)) problems.push('الصيانة: وقت النهاية لازم يكون بعد وقت البداية.');
  if (m.title.length > TITLE_MAX || m.titleEn.length > TITLE_MAX) problems.push(`الصيانة: العنوان أطول من ${TITLE_MAX} حرف.`);
  if (m.message.length > MESSAGE_MAX || m.messageEn.length > MESSAGE_MAX) problems.push(`الصيانة: الرسالة أطول من ${MESSAGE_MAX} حرف.`);

  for (const [label, value] of [['iOS', u.storeUrl.ios], ['أندرويد', u.storeUrl.android]] as const) {
    if (value.trim() !== '' && cleanStoreUrl(value) === '') problems.push(`التحديث: رابط المتجر لـ ${label} لازم يبدأ بـ https://`);
  }
  for (const [label, key] of [['iOS', 'ios'], ['أندرويد', 'android']] as const) {
    const min = u.minBuild[key];
    const rec = u.recommendedBuild[key];
    if (min !== null && rec !== null && rec < min) problems.push(`التحديث (${label}): رقم «مقترح» أقل من «إجباري»، فمالوش لازمة.`);
  }

  if (p.startsAt && p.endsAt && Date.parse(p.endsAt) <= Date.parse(p.startsAt)) problems.push('النافذة: وقت النهاية لازم يكون بعد وقت البداية.');
  if (p.enabled) {
    if (!p.title.trim() && !p.message.trim() && !p.imageUrl) problems.push('النافذة: اكتب عنوان أو رسالة أو حط صورة.');
  }
  if (p.title.length > TITLE_MAX || p.titleEn.length > TITLE_MAX) problems.push(`النافذة: العنوان أطول من ${TITLE_MAX} حرف.`);
  if (p.message.length > MESSAGE_MAX || p.messageEn.length > MESSAGE_MAX) problems.push(`النافذة: الرسالة أطول من ${MESSAGE_MAX} حرف.`);
  if (p.buttonLabel.length > BUTTON_MAX || p.buttonLabelEn.length > BUTTON_MAX) problems.push(`النافذة: كلمة الزر أطول من ${BUTTON_MAX} حرف.`);
  if (p.linkUrl && p.linkUrl.trim() !== '' && safeAppLink(p.linkUrl) === null) problems.push('النافذة: الرابط لازم يبدأ بـ / (صفحة جوه التطبيق) أو https://');
  if (p.imageUrl && p.imageUrl.trim() !== '' && safeImageUrl(p.imageUrl) === null) problems.push('النافذة: رابط الصورة لازم يبدأ بـ https://');

  return problems;
}

/** The pop-up as it is saved: a switched-on pop-up always has a campaign (a fresh one when it never had one). */
export function withCampaign(popup: PopupSettings, now: number = Date.now(), random: () => number = Math.random): PopupSettings {
  return popup.enabled && !popup.campaign ? { ...popup, campaign: newCampaignId(now, random) } : popup;
}

/** Does saving raise a minimum build that was lower (or absent) before: the one change that can lock people out. */
export function raisesMinimum(saved: AppControl, draft: AppControl): { platform: 'ios' | 'android'; label: string; build: number }[] {
  const out: { platform: 'ios' | 'android'; label: string; build: number }[] = [];
  for (const [platform, label] of [['ios', 'iOS'], ['android', 'أندرويد']] as const) {
    const next = draft.update.minBuild[platform];
    const before = saved.update.minBuild[platform];
    if (next !== null && (before === null || next > before)) out.push({ platform, label, build: next });
  }
  return out;
}
