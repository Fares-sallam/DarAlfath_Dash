import {
  Award, BadgePercent, BookOpenText, Clock, CreditCard, Gift, GraduationCap, Headphones,
  Heart, MapPin, Package, Phone, ShieldCheck, Sparkles, Star, Truck, type LucideIcon,
} from 'lucide-react';

/**
 * The icons a box above the store's footer can carry. The key is what's saved (home_feature_boxes.icon_key);
 * the store has the same list (DarAlfath_Client src/lib/featureIcons.ts), so a key added here goes there too.
 */
export const FEATURE_ICONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'headphones', label: 'دعم', Icon: Headphones },
  { key: 'credit-card', label: 'دفع', Icon: CreditCard },
  { key: 'book-open-text', label: 'كتاب', Icon: BookOpenText },
  { key: 'truck', label: 'شحن', Icon: Truck },
  { key: 'gift', label: 'هدية', Icon: Gift },
  { key: 'shield-check', label: 'أمان', Icon: ShieldCheck },
  { key: 'badge-percent', label: 'خصم', Icon: BadgePercent },
  { key: 'clock', label: 'وقت', Icon: Clock },
  { key: 'phone', label: 'تليفون', Icon: Phone },
  { key: 'star', label: 'نجمة', Icon: Star },
  { key: 'award', label: 'جودة', Icon: Award },
  { key: 'heart', label: 'قلب', Icon: Heart },
  { key: 'map-pin', label: 'مكان', Icon: MapPin },
  { key: 'package', label: 'طرد', Icon: Package },
  { key: 'sparkles', label: 'مميز', Icon: Sparkles },
  { key: 'graduation-cap', label: 'تعليم', Icon: GraduationCap },
];

export const featureIcon = (key: string | null | undefined): LucideIcon =>
  FEATURE_ICONS.find((i) => i.key === key)?.Icon ?? BookOpenText;
