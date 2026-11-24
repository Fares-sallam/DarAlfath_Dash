import type { ReactNode } from 'react';
import type { CatalogNode, ProductLink } from '@/lib/catalogTree';
import { bookPlacement } from '@/lib/bookPlacement';

export type ChipKind = 'section' | 'primary' | 'extra' | 'series' | 'series-inherited';
export const CHIP_STYLE: Record<ChipKind, { label: string; box: string; tag: string }> = {
  section: { label: 'قسم', box: 'bg-violet-100 text-violet-800', tag: 'bg-violet-200/70' },
  primary: { label: 'تصنيف أساسي', box: 'bg-emerald-100 text-emerald-800', tag: 'bg-emerald-200/70' },
  extra: { label: 'تصنيف إضافي', box: 'bg-gray-100 text-gray-700', tag: 'bg-gray-200/80' },
  series: { label: 'سلسلة', box: 'bg-blue-100 text-blue-800', tag: 'bg-blue-200/70' },
  'series-inherited': { label: 'سلسلة (من التصنيف)', box: 'bg-blue-50 text-blue-700 border border-dashed border-blue-300', tag: 'bg-blue-100/70' },
};

/** One place a book sits: what kind of place it is, then its name. */
export function PlaceChip({ kind, children }: { kind: ChipKind; children: ReactNode }) {
  const style = CHIP_STYLE[kind];
  return (
    <span className={`inline-flex items-stretch rounded-md overflow-hidden text-[11px] font-bold ${style.box}`} data-testid={`chip-${kind}`}>
      <span className={`px-1.5 py-0.5 font-semibold ${style.tag}`}>{style.label}</span>
      <span className="px-2 py-0.5">{children}</span>
    </span>
  );
}

/** The whole path in reading order: section, primary category, extra categories, series. Same everywhere a book's places are shown. */
export function PlacementChips({ links, byId, empty }: { links: ProductLink[]; byId: ReadonlyMap<string, CatalogNode>; empty?: ReactNode }) {
  const place = bookPlacement(links, byId);
  const nothing = !place.primary && place.sections.length + place.extras.length + place.series.length + place.inheritedSeries.length === 0;
  return (
    <div className="flex flex-wrap gap-1">
      {place.sections.map((n) => <PlaceChip key={`sec-${n.id}`} kind="section">{n.name_ar}</PlaceChip>)}
      {place.primary
        ? <PlaceChip kind="primary">{place.primary.name_ar}</PlaceChip>
        : <span className="text-[11px] px-2 py-0.5 rounded-md bg-red-50 text-red-500" data-testid="chip-no-primary">بلا تصنيف أساسي</span>}
      {place.extras.map((n) => <PlaceChip key={`ex-${n.id}`} kind="extra">{n.name_ar}</PlaceChip>)}
      {place.series.map((n) => <PlaceChip key={`se-${n.id}`} kind="series">{n.name_ar}</PlaceChip>)}
      {place.inheritedSeries.map((n) => <PlaceChip key={`si-${n.id}`} kind="series-inherited">{n.name_ar}</PlaceChip>)}
      {nothing && empty}
    </div>
  );
}
