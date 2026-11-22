// The columns of each report the owner can switch on or off (the buttons in «تنزيل تقرير»). One group per sheet, in the order the
// sheets come; a button is named by the column's own header (without the currency), so the report itself needs no changes. A
// sheet other than the first can be left out. Everything is on until the owner turns it off (the books report has its own
// standard, in builders/books.ts).
import { labelGroup, type ColumnGroup } from './columnChoices';

export const ORDERS_REPORT_GROUPS: readonly ColumnGroup[] = [
  labelGroup('orders', 'ورقة «سجل الطلبات»', [
    'رقم الطلب', 'التاريخ', 'العميل', 'الهاتف', 'العنوان', 'الكتب', 'النسخ', 'الشحن', 'الخصم', 'الإجمالي', 'طريقة الدفع', 'حالة الدفع', 'حالة الطلب', 'شركة الشحن', 'رقم التتبع', 'الكوبون',
  ], { locked: 'رقم الطلب' }),
  labelGroup('byStatus', 'ورقة «ملخص حسب حالة الطلب»', ['الحالة', 'عدد الطلبات', 'النسبة', 'القيمة'], { optional: true, locked: 'الحالة' }),
  labelGroup('byPayment', 'ورقة «ملخص حسب طريقة الدفع»', ['طريقة الدفع', 'عدد الطلبات', 'النسبة', 'القيمة'], { optional: true, locked: 'طريقة الدفع' }),
];

export const SHIPPING_REPORT_GROUPS: readonly ColumnGroup[] = [
  labelGroup('shipments', 'ورقة «قائمة الشحنات»', [
    'رقم الطلب', 'التاريخ', 'العميل', 'الهاتف', 'المحافظة', 'المدينة', 'العنوان التفصيلي', 'شركة الشحن', 'رقم التتبع', 'النسخ', 'رسوم الشحن', 'قيمة الطلب', 'الدفع', 'الحالة', 'ملاحظات العميل',
  ], { locked: 'رقم الطلب' }),
  labelGroup('companies', 'ورقة «أداء شركات الشحن»', ['شركة الشحن', 'الشحنات', 'تم التوصيل', 'جاري الشحن', 'مرتجعة', 'نسبة التوصيل', 'رسوم الشحن', 'قيمة الطلبات'], { optional: true, locked: 'شركة الشحن' }),
  labelGroup('regions', 'ورقة «الشحنات حسب المحافظة»', ['المحافظة', 'الشحنات', 'تم التوصيل', 'رسوم الشحن', 'قيمة الطلبات'], { optional: true, locked: 'المحافظة' }),
];

export const INVENTORY_REPORT_GROUPS: readonly ColumnGroup[] = [
  labelGroup('balances', 'ورقة «أرصدة المخزون»', [
    'الكتاب', 'المؤلف', 'النسخة', 'النوع', 'المخزون الفعلي', 'المحجوز', 'المتاح', 'حد التنبيه', 'الحالة', 'المبيع خلال الفترة', 'سعر التكلفة', 'سعر البيع', 'قيمة المخزون (تكلفة)', 'قيمة المخزون (بيع)', 'آخر تحديث',
  ], { locked: 'الكتاب' }),
  labelGroup('restock', 'ورقة «نسخ تحتاج إعادة توريد»', ['الكتاب', 'النسخة', 'المتاح', 'حد التنبيه', 'النقص عن الحد', 'المبيع خلال الفترة', 'الحالة'], { optional: true, locked: 'الكتاب' }),
];

export const COUPONS_REPORT_GROUPS: readonly ColumnGroup[] = [
  labelGroup('coupons', 'ورقة «الكوبونات»', [
    'الكود', 'النوع', 'يعمل في', 'القيمة', 'الحد الأدنى للطلب', 'مخصص لكتاب', 'الاستخدام الكلي', 'الحد الأقصى', 'الحالة', 'يبدأ', 'ينتهي', 'استخدامات الفترة', 'خصم الفترة', 'مبيعات الفترة',
  ], { locked: 'الكود' }),
];

export const CUSTOMERS_REPORT_GROUPS: readonly ColumnGroup[] = [
  labelGroup('customers', 'ورقة «العملاء»', [
    'العميل', 'البريد الإلكتروني', 'الهاتف', 'الدولة', 'آخر مدينة', 'تاريخ التسجيل', 'طلبات الفترة', 'إنفاق الفترة', 'عميل جديد', 'إجمالي الطلبات', 'إجمالي الإنفاق', 'متوسط الطلب', 'آخر طلب', 'الحالة',
  ], { locked: 'العميل' }),
];

export const ANALYTICS_REPORT_GROUPS: readonly ColumnGroup[] = [
  labelGroup('timeline', 'ورقة «الأداء عبر الزمن»', ['الفترة', 'الطلبات', 'النسخ المباعة', 'الإيرادات', 'التكلفة', 'صافي الربح', 'هامش الربح'], { optional: true, locked: 'الفترة' }),
  labelGroup('topBooks', 'ورقة «الكتب الأكثر مبيعًا»', ['#', 'الكتاب', 'المؤلف', 'النسخ المباعة', 'الإيرادات', 'التكلفة', 'الربح', 'من إجمالي المبيعات'], { optional: true, locked: 'الكتاب' }),
  labelGroup('statuses', 'ورقة «الطلبات حسب الحالة»', ['الحالة', 'عدد الطلبات', 'النسبة', 'القيمة'], { optional: true, locked: 'الحالة' }),
  labelGroup('payments', 'ورقة «طرق الدفع»', ['طريقة الدفع', 'عدد الطلبات', 'النسبة', 'القيمة'], { optional: true, locked: 'طريقة الدفع' }),
  labelGroup('regions', 'ورقة «التوزيع الجغرافي»', ['المحافظة', 'عدد الطلبات', 'النسبة', 'الإيرادات'], { optional: true, locked: 'المحافظة' }),
  labelGroup('topCustomers', 'ورقة «العملاء الأعلى إنفاقًا»', ['العميل', 'الهاتف', 'المنطقة', 'عدد الطلبات', 'إجمالي الإنفاق', 'متوسط الطلب', 'آخر طلب'], { optional: true, locked: 'العميل' }),
];

export const ACTIVITY_REPORT_GROUPS: readonly ColumnGroup[] = [
  labelGroup('log', 'ورقة «السجل التفصيلي»', ['التاريخ والوقت', 'المستخدم', 'البريد', 'الإجراء', 'القسم', 'رقم السجل', 'الحقول المعدلة', 'عنوان IP'], { locked: 'التاريخ والوقت' }),
  labelGroup('byUser', 'ورقة «النشاط حسب المستخدم»', ['المستخدم', 'البريد', 'إضافة', 'تعديل', 'حذف', 'الإجمالي', 'آخر نشاط'], { optional: true, locked: 'المستخدم' }),
  labelGroup('byTable', 'ورقة «النشاط حسب القسم»', ['القسم', 'إضافة', 'تعديل', 'حذف', 'الإجمالي'], { optional: true, locked: 'القسم' }),
];
