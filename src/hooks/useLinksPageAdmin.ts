import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/imageCompression';
import {
  BLOCK_COLUMNS, LEGACY_SETTINGS_COLUMNS, SETTINGS_COLUMNS, blockToRow, resolveBlock, resolveSettings, sortBlocks,
  type LinksBlock, type LinksPageSettings,
} from '@/lib/linksPage';

/* What the "إدارة الصفحة والروابط" page edits: the company links page the store shows at /links
   (links_page_settings: one row; links_page_blocks: one row per block). */

export interface LinksPageAdminData {
  settings: LinksPageSettings;
  /** Every block, on or off, in the order the store shows them. */
  blocks: LinksBlock[];
}

const KEY = ['links-page-admin'];

export function useLinksPageAdmin() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<LinksPageAdminData> => {
      const [first, blocks] = await Promise.all([
        supabase.from('links_page_settings').select(SETTINGS_COLUMNS).eq('id', 1).maybeSingle(),
        supabase.from('links_page_blocks').select(BLOCK_COLUMNS).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      ]);
      // Before the pattern migration is applied the two new columns do not exist (42703): ask without them.
      const settings = first.error?.code === '42703'
        ? await supabase.from('links_page_settings').select(LEGACY_SETTINGS_COLUMNS).eq('id', 1).maybeSingle()
        : first;
      if (settings.error) throw settings.error;
      if (blocks.error) throw blocks.error;
      return {
        settings: resolveSettings(settings.data),
        blocks: sortBlocks((blocks.data ?? []).map(resolveBlock).filter((b): b is LinksBlock => b !== null)),
      };
    },
    // Nothing else changes these rows behind the editor's back; a fresh read on every visit is enough.
    staleTime: 0,
  });
}

export interface SaveLinksPageInput {
  /** Rows are written in list order: the position in this array is the block's place on the page. Empty: leave the blocks alone. */
  blocks: LinksBlock[];
  settings: LinksPageSettings;
  settingsChanged: boolean;
  /** Blocks that were in the saved page and are no longer in the list. */
  removedIds: string[];
}

export function useSaveLinksPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ blocks, settings, settingsChanged, removedIds }: SaveLinksPageInput) => {
      if (settingsChanged) {
        const row = {
          id: 1,
          ...settings,
          title: settings.title.trim(),
          tagline: settings.tagline.trim(),
          footer_text: settings.footer_text.trim(),
          seo_title: settings.seo_title.trim(),
          seo_description: settings.seo_description.trim(),
          share_image_url: settings.share_image_url?.trim() || null,
        };
        let { error } = await supabase.from('links_page_settings').upsert(row);
        if (error && /pattern_(position|strength)/.test(error.message)) {
          // The database does not have the pattern columns yet: everything else still saves.
          const { pattern_position: _position, pattern_strength: _strength, ...legacy } = row;
          void _position; void _strength;
          ({ error } = await supabase.from('links_page_settings').upsert(legacy));
          if (!error) toast.warning('اتحفظت كل الإعدادات ماعدا مكان الباترن ودرجته، لأن تحديث قاعدة البيانات لسه ما اتطبقش.');
        }
        if (error) throw error;
      }

      if (blocks.length > 0) {
        const { error } = await supabase.from('links_page_blocks').upsert(blocks.map(blockToRow), { onConflict: 'id' });
        if (error) throw error;
      }

      if (removedIds.length > 0) {
        const { error } = await supabase.from('links_page_blocks').delete().in('id', removedIds);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEY });
      toast.success('اتحفظت. الصفحة اتحدّثت في الموقع');
    },
    onError: (e: Error) => toast.error(`تعذّر الحفظ: ${e.message}`),
  });
}

/**
 * A picture for an offer, a banner or the share preview. Shrunk in the browser first (a banner is shown
 * at most ~520px wide), then stored in the public site-assets bucket under links-page/.
 */
export async function uploadLinksImage(original: File): Promise<string> {
  const file = await compressImage(original, { maxSize: 1400, quality: 0.86, keepIfSmallerThan: 200 * 1024 });
  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
  const path = `links-page/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('site-assets').upload(path, file, { upsert: false, contentType: file.type });
  if (error) {
    throw new Error(/size|exceed|large/i.test(error.message) ? 'الصورة كبيرة، جرّب صورة أصغر من 2 ميجا' : error.message);
  }
  return supabase.storage.from('site-assets').getPublicUrl(path).data.publicUrl;
}
