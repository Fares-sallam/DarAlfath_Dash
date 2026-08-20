import { useState, useRef } from 'react';
import { escapeHtml } from '@/lib/utils';
import * as XLSX from 'xlsx';
import Layout from '@/components/layout/Layout';
import {
  Search, Plus, Edit, Trash2, BookOpen, Copy, ToggleLeft,
  ToggleRight, BarChart2, X, Upload, Tag, DollarSign, Package,
  FileText, Loader2, AlertCircle, ImageIcon, Star,
  Download, Filter, Globe2
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useProducts, useCategories, useBookSeries,
  useUpsertProduct, useDeleteProduct, useToggleProductStatus,
  useProductImages, useDeleteProductImage, useSetPrimaryImage,
  uploadCoverImage, uploadEbookFile, uploadProductImage,
  type Product, type UpsertProductInput,
} from '@/hooks/useBooks';
import { useCountry } from '@/contexts/CountryContext';

interface VariantForm {
  _key: string;
  variant_name: string;
  variant_type: 'مادي' | 'رقمي';
  sku: string;
  cost_price: string;
  base_price: string;
  sale_price: string;
  stock: string;
  min_stock: string;
  weight_kg: string;
}

interface BookForm {
  title: string;
  author: string;
  description: string;
  category_id: string;
  isbn: string;
  keywords: string;
  cost_price: string;
  base_price: string;
  sale_price: string;
  cover_url: string;
  seriesIds: string[];
}

const emptyForm: BookForm = {
  title: '',
  author: '',
  description: '',
  category_id: '',
  isbn: '',
  keywords: '',
  cost_price: '',
  base_price: '',
  sale_price: '',
  cover_url: '',
  seriesIds: [],
};

const emptyVariant = (): VariantForm => ({
  _key: Date.now().toString() + Math.random(),
  variant_name: 'ورق عادي',
  variant_type: 'مادي',
  sku: '',
  cost_price: '',
  base_price: '',
  sale_price: '',
  stock: '0',
  min_stock: '5',
  weight_kg: '0.3',
});

const VARIANT_NAMES = ['ورق عادي', 'ورق فاخر', 'A4', 'كوشيه', 'إلكتروني'];

const typeConfig: Record<string, string> = {
  'ورقي': 'bg-blue-100 text-blue-700',
  'رقمي': 'bg-purple-100 text-purple-700',
  'ورقي ورقمي': 'bg-teal-100 text-teal-700',
};

function deriveType(variants: VariantForm[]): Product['type'] {
  const hasD = variants.some((v) => v.variant_type === 'رقمي');
  const hasP = variants.some((v) => v.variant_type === 'مادي');
  return hasD && hasP ? 'ورقي ورقمي' : hasD ? 'رقمي' : 'ورقي';
}

function toNumber(value: string, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getVariantSalePrice(v: VariantForm) {
  const base = toNumber(v.base_price);
  const sale = toNumber(v.sale_price, base);
  return sale > 0 ? sale : base;
}

function getVariantSummary(variants: VariantForm[]) {
  const valid = variants
    .map((v) => ({
      cost: toNumber(v.cost_price),
      base: toNumber(v.base_price),
      sale: getVariantSalePrice(v),
    }))
    .filter((v) => v.base > 0 && v.sale > 0);

  if (valid.length === 0) {
    return {
      minPrice: 0,
      maxPrice: 0,
      minCost: 0,
      minProfit: 0,
      hasDiscount: false,
    };
  }

  const minPrice = Math.min(...valid.map((v) => v.sale));
  const maxPrice = Math.max(...valid.map((v) => v.sale));
  const minCost = Math.min(...valid.map((v) => v.cost));
  const minProfit = Math.min(...valid.map((v) => v.sale - v.cost));
  const hasDiscount = valid.some((v) => v.sale < v.base);

  return { minPrice, maxPrice, minCost, minProfit, hasDiscount };
}

function formatPriceRange(min: number, max: number, currencySymbol: string) {
  if (!min && !max) return '—';
  if (min === max) return `${min.toLocaleString()} ${currencySymbol}`;
  return `من ${min.toLocaleString()} إلى ${max.toLocaleString()} ${currencySymbol}`;
}

function getProductVariantSummary(product: Product) {
  const variants = product.product_variants ?? [];
  const prices = variants
    .map((v) => Number(v.sale_price ?? v.price ?? v.base_price ?? 0))
    .filter((price) => price > 0);

  if (prices.length === 0) {
    const fallback = Number(product.sale_price ?? product.base_price ?? 0);
    return {
      minPrice: fallback,
      maxPrice: fallback,
      count: 0,
    };
  }

  return {
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    count: variants.length,
  };
}

function exportCsv(products: Product[], currencySymbol: string) {
  const headers = ['العنوان', 'المؤلف', 'النوع', 'التصنيف', `سعر التكلفة (${currencySymbol})`, `سعر البيع (${currencySymbol})`, 'الحالة', 'ISBN'];
  const rows = products.map((p) => [
    p.title,
    p.author,
    p.type,
    p.categories?.name ?? '',
    p.cost_price,
    p.sale_price ?? p.base_price,
    p.is_active ? 'نشط' : 'مخفي',
    p.isbn ?? '',
  ]);

  const bom = '\uFEFF';
  const csv = bom + [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `books-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportExcel(products: Product[], currencySymbol: string) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['العنوان', 'المؤلف', 'النوع', 'التصنيف', `سعر التكلفة (${currencySymbol})`, `سعر البيع (${currencySymbol})`, 'الحالة', 'ISBN', 'تاريخ الإضافة'],
    ...products.map((p) => [
      p.title,
      p.author,
      p.type,
      p.categories?.name ?? '',
      p.cost_price,
      p.sale_price ?? p.base_price,
      p.is_active ? 'نشط' : 'مخفي',
      p.isbn ?? '',
      new Date(p.created_at).toLocaleDateString('ar-EG'),
    ]),
  ]);
  ws['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, 'الكتب');
  XLSX.writeFile(wb, `كتب-دار-الفتح-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportPdf(products: Product[], currencySymbol: string, countryName?: string) {
  const pw = window.open('', '_blank', 'width=900,height=700');
  if (!pw) return;
  const rows = products.map((p) => `
    <tr>
      <td>${escapeHtml(p.title)}</td>
      <td>${escapeHtml(p.author)}</td>
      <td>${escapeHtml(p.type)}</td>
      <td>${escapeHtml(p.categories?.name ?? '—')}</td>
      <td>${(p.sale_price ?? p.base_price).toLocaleString()} ${currencySymbol}</td>
      <td class="${p.is_active ? 'active' : 'inactive'}">${p.is_active ? 'نشط' : 'مخفي'}</td>
    </tr>`).join('');
  pw.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/>
    <title>كتالوج الكتب</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Cairo',Arial,sans-serif;direction:rtl;padding:24px;font-size:12px;color:#1e293b}
      h1{font-size:18px;font-weight:900;color:#1d4ed8;margin-bottom:4px}
      .meta{color:#64748b;font-size:11px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}
      th{background:#1d4ed8;color:#fff;padding:8px;text-align:right;font-size:11px}
      td{padding:7px 8px;border-bottom:1px solid #f1f5f9;font-size:11px}
      tr:nth-child(even) td{background:#f8fafc}
      .active{color:#16a34a;font-weight:700}
      .inactive{color:#dc2626}
      @media print{body{padding:12px}}
    </style></head><body>
    <h1>كتالوج الكتب — دار الفتح</h1>
    <p class="meta">إجمالي الكتب: ${products.length} · ${countryName ?? 'كل الدول'} · ${new Date().toLocaleDateString('ar-EG')}</p>
    <table>
      <tr><th>العنوان</th><th>المؤلف</th><th>النوع</th><th>التصنيف</th><th>سعر البيع</th><th>الحالة</th></tr>
      ${rows}
    </table>
    <script>setTimeout(()=>window.print(),600);<\/script></body></html>`);
  pw.document.close();
}

function ImageGallery({
  productId,
  onNewCoverUrl,
}: {
  productId: string;
  onNewCoverUrl: (url: string) => void;
}) {
  const { data: images = [], isLoading } = useProductImages(productId);
  const deleteMutation = useDeleteProductImage();
  const setPrimaryMutation = useSetPrimaryImage();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    setUploading(true);
    try {
      for (const file of files) {
        const url = await uploadProductImage(file, productId);
        const { supabase } = await import('@/lib/supabase');

        await supabase.from('product_images').insert({
          product_id: productId,
          url,
          sort_order: images.length,
          is_primary: images.length === 0,
        });

        if (images.length === 0) onNewCoverUrl(url);
      }

      toast.success(`تم رفع ${files.length} صورة بنجاح`);
    } catch (err: unknown) {
      toast.error('فشل رفع الصورة: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-700">{images.length} صورة مضافة</p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-60"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          رفع صور جديدة
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
      </div>

      {images.length === 0 ? (
        <div
          className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center cursor-pointer hover:border-blue-300 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <ImageIcon size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">اضغط لرفع صور المنتج</p>
          <p className="text-xs text-gray-300 mt-1">يمكنك رفع أكثر من صورة في نفس الوقت</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {images.map((img) => (
            <div key={img.id} className="relative group aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
              <img src={img.url} alt={img.alt_text ?? ''} className="w-full h-full object-cover" />
              {img.is_primary && (
                <div className="absolute top-1.5 right-1.5 bg-amber-400 text-white text-xs px-1.5 py-0.5 rounded-lg flex items-center gap-1">
                  <Star size={9} fill="white" />
                  رئيسية
                </div>
              )}

              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {!img.is_primary && (
                  <button
                    onClick={() => {
                      setPrimaryMutation.mutate({ imageId: img.id, productId, imageUrl: img.url });
                      onNewCoverUrl(img.url);
                    }}
                    title="تعيين كرئيسية"
                    className="p-1.5 bg-amber-400 rounded-lg text-white hover:bg-amber-500"
                  >
                    <Star size={13} />
                  </button>
                )}

                <button
                  onClick={() => deleteMutation.mutate({ id: img.id, url: img.url })}
                  title="حذف"
                  className="p-1.5 bg-red-500 rounded-lg text-white hover:bg-red-600"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          <div
            className="aspect-[3/4] rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-blue-300 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <div className="text-center">
              <Plus size={20} className="text-gray-300 mx-auto mb-1" />
              <p className="text-xs text-gray-400">إضافة</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Books() {
  const { selectedCountry, currencySymbol } = useCountry();

  const { data: products = [], isLoading, isError } = useProducts();
  const { data: categories = [] } = useCategories();
  const { data: allSeries = [] } = useBookSeries();

  const upsertMutation = useUpsertProduct();
  const deleteMutation = useDeleteProduct();
  const toggleMutation = useToggleProductStatus();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('الكل');
  const [filterActive, setFilterActive] = useState('الكل');
  const [filterCategory, setFilterCategory] = useState('الكل');
  const [sortBy, setSortBy] = useState('created_at');
  const [showFilters, setShowFilters] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<BookForm>(emptyForm);
  const [variants, setVariants] = useState<VariantForm[]>([]);
  const [activeTab, setActiveTab] = useState<'info' | 'variants' | 'media'>('info');

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const [ebookFile, setEbookFile] = useState<File | null>(null);
  const [ebookPath, setEbookPath] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const ebookInputRef = useRef<HTMLInputElement>(null);

  const variantSummary = getVariantSummary(variants);

  const filtered = products
    .filter((p) => {
      const s = search.toLowerCase();
      const ms =
        p.title.toLowerCase().includes(s) ||
        p.author.toLowerCase().includes(s) ||
        (p.isbn ?? '').includes(s);
      const mt = filterType === 'الكل' || p.type === filterType;
      const ma = filterActive === 'الكل' || (filterActive === 'نشط' ? p.is_active : !p.is_active);
      const mc = filterCategory === 'الكل' || p.category_id === filterCategory;
      return ms && mt && ma && mc;
    })
    .sort((a, b) => {
      if (sortBy === 'base_price') return b.base_price - a.base_price;
      if (sortBy === 'title') return a.title.localeCompare(b.title, 'ar');
      return b.created_at.localeCompare(a.created_at);
    });

  const openAdd = () => {
    setEditProduct(null);
    setForm(emptyForm);
    setVariants([]);
    setCoverFile(null);
    setCoverPreview('');
    setEbookFile(null);
    setEbookPath('');
    setActiveTab('info');
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditProduct(p);
    setForm({
      title: p.title,
      author: p.author,
      description: p.description ?? '',
      category_id: p.category_id ?? '',
      isbn: p.isbn ?? '',
      keywords: (p.keywords ?? []).join('، '),
      cost_price: String(p.cost_price),
      base_price: String(p.base_price),
      sale_price: String(p.sale_price ?? ''),
      cover_url: p.cover_url ?? '',
      seriesIds: (p.product_series ?? []).map((s) => s.series_id),
    });
    setVariants(
      (p.product_variants ?? []).map((v) => ({
        _key: v.id,
        variant_name: v.variant_name,
        variant_type: v.variant_type,
        sku: v.sku ?? '',
        cost_price: String(v.cost_price ?? 0),
        base_price: String(v.base_price ?? v.price ?? 0),
        sale_price: String(v.sale_price ?? v.price ?? v.base_price ?? 0),
        stock: String(v.stock ?? 0),
        min_stock: String(v.min_stock ?? 5),
        weight_kg: String(v.weight_kg ?? 0.3),
      }))
    );
    const existingEbook = p.electronic_books?.[0];
    setEbookPath(existingEbook?.file_path ?? '');
    setCoverFile(null);
    setCoverPreview('');
    setEbookFile(null);
    setActiveTab('info');
    setShowModal(true);
  };

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const handleEbookSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEbookFile(file);
    toast.success(`تم اختيار الملف: ${file.name}`);
  };

  const handleSave = async () => {
    if (!form.title || !form.author) {
      toast.error('العنوان والمؤلف إلزاميان');
      return;
    }

    if (variants.length === 0) {
      toast.error('يجب إضافة نسخة واحدة على الأقل للكتاب');
      setActiveTab('variants');
      return;
    }

    for (const variant of variants) {
      const basePrice = toNumber(variant.base_price);
      const salePrice = getVariantSalePrice(variant);

      if (!variant.variant_name.trim()) {
        toast.error('اسم النسخة مطلوب');
        setActiveTab('variants');
        return;
      }

      if (basePrice <= 0 || salePrice <= 0) {
        toast.error(`أدخل السعر الأساسي وسعر البيع للنسخة: ${variant.variant_name}`);
        setActiveTab('variants');
        return;
      }

      if (salePrice > basePrice) {
        toast.error(`سعر البيع لا يجب أن يكون أكبر من السعر الأساسي في النسخة: ${variant.variant_name}`);
        setActiveTab('variants');
        return;
      }

      if (variant.variant_type === 'مادي' && toNumber(variant.stock) < 0) {
        toast.error(`المخزون لا يمكن أن يكون سالبًا للنسخة: ${variant.variant_name}`);
        setActiveTab('variants');
        return;
      }
    }

    setUploading(true);

    let finalCoverUrl = form.cover_url;
    let finalEbookPath = ebookPath;
    const tempId = editProduct?.id || `temp-${Date.now()}`;

    if (coverFile) {
      finalCoverUrl = await uploadCoverImage(coverFile, tempId).catch((err) => {
        toast.error('فشل رفع صورة الغلاف: ' + err.message);
        return finalCoverUrl;
      });
    }

    const hasDigitalVariant = variants.some((v) => v.variant_type === 'رقمي');
    if (ebookFile && hasDigitalVariant) {
      finalEbookPath = await uploadEbookFile(ebookFile, tempId).catch((err) => {
        toast.error('فشل رفع ملف الكتاب: ' + err.message);
        return finalEbookPath;
      });
    }

    setUploading(false);

    const input: UpsertProductInput = {
      id: editProduct?.id,
      title: form.title,
      author: form.author,
      description: form.description || undefined,
      cover_url: finalCoverUrl || undefined,
      category_id: form.category_id || undefined,
      isbn: form.isbn || undefined,
      keywords: form.keywords
        ? form.keywords.split('،').map((k) => k.trim()).filter(Boolean)
        : [],
      type: deriveType(variants),
      cost_price: variantSummary.minCost,
      base_price: variantSummary.maxPrice,
      sale_price: variantSummary.minPrice || undefined,
      is_active: true,
      variants: variants.map((v) => {
        const basePrice = toNumber(v.base_price);
        const salePrice = getVariantSalePrice(v);

        return {
          id: v._key,
          variant_name: v.variant_name,
          variant_type: v.variant_type,
          sku: v.sku || undefined,
          cost_price: toNumber(v.cost_price),
          base_price: basePrice,
          sale_price: salePrice,
          price: salePrice,
          stock: v.variant_type === 'مادي' ? toNumber(v.stock) : null,
          reserved_stock: 0,
          min_stock: v.variant_type === 'مادي' ? toNumber(v.min_stock, 5) : 0,
          weight_kg: toNumber(v.weight_kg, 0.3),
        };
      }),
      ebookFilePath: finalEbookPath || undefined,
      seriesIds: form.seriesIds,
    };

    await upsertMutation.mutateAsync(input);
    setShowModal(false);
  };

  const handleCopy = async (p: Product) => {
    await upsertMutation.mutateAsync({
      title: `${p.title} (نسخة)`,
      author: p.author,
      description: p.description,
      cover_url: p.cover_url,
      category_id: p.category_id,
      isbn: undefined,
      keywords: p.keywords,
      type: p.type,
      cost_price: p.cost_price,
      base_price: p.base_price,
      sale_price: p.sale_price,
      variants: (p.product_variants ?? []).map((v) => ({
        ...v,
        id: undefined,
        sku: undefined,
        cost_price: v.cost_price ?? 0,
        base_price: v.base_price ?? v.price,
        sale_price: v.sale_price ?? v.price,
        price: v.sale_price ?? v.price,
        stock: v.variant_type === 'مادي' ? v.stock ?? 0 : null,
        reserved_stock: 0,
        min_stock: v.variant_type === 'مادي' ? v.min_stock ?? 5 : 0,
      })),
    });
  };

  const tabBtn = (key: 'info' | 'variants' | 'media', label: string) => (
    <button
      onClick={() => setActiveTab(key)}
      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
        activeTab === key ? 'bg-blue-700 text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );

  const isBusy = upsertMutation.isPending || uploading;
  const hasFilters =
    filterType !== 'الكل' ||
    filterActive !== 'الكل' ||
    filterCategory !== 'الكل' ||
    search;

  const resetFilters = () => {
    setSearch('');
    setFilterType('الكل');
    setFilterActive('الكل');
    setFilterCategory('الكل');
  };

  return (
    <Layout>
      <div className="fade-in" dir="rtl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="section-title">إدارة الكتب</h1>
            <p className="section-subtitle">
              إضافة وتعديل وحذف الكتب — {selectedCountry?.name ? `كتب ${selectedCountry.name}` : 'جميع الكتب'}
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-xl bg-blue-50 text-blue-700">
              <Globe2 size={12} />
              {selectedCountry?.name ?? 'كل الدول'} · {currencySymbol}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowFilters((f) => !f)}
              className={`btn-secondary flex items-center gap-2 text-sm ${
                showFilters ? 'bg-blue-50 text-blue-700 border-blue-200' : ''
              }`}
            >
              <Filter size={14} />
              فلترة
              {hasFilters && (
                <span className="w-4 h-4 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center">
                  !
                </span>
              )}
            </button>

            <button onClick={() => exportCsv(filtered, currencySymbol)} className="btn-secondary flex items-center gap-2 text-sm">
              <Download size={14} /> CSV
            </button>
            <button
              onClick={() => { exportExcel(filtered, currencySymbol); toast.success('تم تصدير Excel'); }}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Download size={14} /> Excel
            </button>
            <button
              onClick={() => { exportPdf(filtered, currencySymbol, selectedCountry?.name); toast.success('جارٍ فتح نافذة الطباعة — اختر "حفظ كـ PDF"'); }}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Download size={14} /> PDF
            </button>

            <button onClick={openAdd} className="btn-primary flex items-center gap-2">
              <Plus size={16} />
              إضافة كتاب جديد
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'إجمالي الكتب', value: products.length, color: 'text-blue-700', bg: 'bg-blue-50' },
            { label: 'نشط', value: products.filter((b) => b.is_active).length, color: 'text-green-700', bg: 'bg-green-50' },
            { label: 'غير نشط', value: products.filter((b) => !b.is_active).length, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'كتب رقمية', value: products.filter((b) => b.type !== 'ورقي').length, color: 'text-purple-700', bg: 'bg-purple-50' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <div className={`w-10 h-10 ${s.bg} rounded-xl mx-auto flex items-center justify-center mb-2`}>
                <BookOpen size={18} className={s.color} />
              </div>
              <p className={`text-xl font-bold ${s.color}`}>{isLoading ? '—' : s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder="ابحث بالعنوان، المؤلف، ISBN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pr-10"
            />
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-field">
                <option>الكل</option>
                <option>ورقي</option>
                <option>رقمي</option>
                <option>ورقي ورقمي</option>
              </select>

              <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)} className="input-field">
                <option>الكل</option>
                <option>نشط</option>
                <option>مخفي</option>
              </select>

              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="input-field">
                <option value="الكل">كل التصنيفات</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <div className="flex gap-2">
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="input-field flex-1">
                  <option value="created_at">الأحدث</option>
                  <option value="title">العنوان</option>
                  <option value="base_price">السعر</option>
                </select>

                <button onClick={resetFilters} className="btn-secondary whitespace-nowrap">
                  إعادة
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {isLoading && (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
              <Loader2 size={22} className="animate-spin" />
              <span>جارٍ تحميل الكتب...</span>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-red-400">
              <AlertCircle size={28} />
              <span>تعذّر تحميل الكتب</span>
            </div>
          )}

          {!isLoading && !isError && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="text-right px-4 py-3">الكتاب</th>
                    <th className="text-right px-4 py-3">التصنيف</th>
                    <th className="text-right px-4 py-3">النوع</th>
                    <th className="text-right px-4 py-3">النسخ</th>
                    <th className="text-right px-4 py-3">التكلفة</th>
                    <th className="text-right px-4 py-3">السعر</th>
                    <th className="text-right px-4 py-3">الربح</th>
                    <th className="text-right px-4 py-3">الحالة</th>
                    <th className="text-right px-4 py-3">إجراء</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((product) => {
                    const summary = getProductVariantSummary(product);
                    const displayPrice = formatPriceRange(summary.minPrice, summary.maxPrice, currencySymbol);
                    const variantCount = summary.count;
                    const variantCosts = (product.product_variants ?? []).map((v) => Number(v.cost_price ?? 0)).filter((v) => v >= 0);
                    const minCost = variantCosts.length > 0 ? Math.min(...variantCosts) : product.cost_price ?? 0;
                    const minProfit = summary.minPrice ? summary.minPrice - minCost : 0;

                    return (
                      <tr key={product.id} className="table-row">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {product.cover_url ? (
                              <img
                                src={product.cover_url}
                                alt={product.title}
                                className="w-10 h-14 rounded-lg object-cover flex-shrink-0 border border-gray-200"
                              />
                            ) : (
                              <div className="w-10 h-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-200">
                                <BookOpen size={16} className="text-gray-300" />
                              </div>
                            )}

                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{product.title}</p>
                              <p className="text-xs text-gray-400">{product.author}</p>
                              {product.isbn && (
                                <p className="text-xs text-gray-300 mt-0.5 font-mono">{product.isbn}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-600">
                          {product.categories?.name ?? '—'}
                        </td>

                        <td className="px-4 py-3">
                          <span className={`status-badge ${typeConfig[product.type] ?? 'bg-gray-100 text-gray-600'}`}>
                            {product.type}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-600">
                          {variantCount}
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-600">
                          حسب النسخ
                        </td>

                        <td className="px-4 py-3 text-sm font-bold text-blue-700">
                          {displayPrice}
                        </td>

                        <td className="px-4 py-3">
                          <span className={`text-sm font-bold ${minProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {summary.minPrice ? `${minProfit >= 0 ? '+' : ''}${minProfit.toLocaleString()} ${currencySymbol}` : '—'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`status-badge ${product.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {product.is_active ? 'نشط' : 'مخفي'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toast.info(`عرض أداء ${product.title}`)}
                              title="الأداء"
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                            >
                              <BarChart2 size={14} />
                            </button>

                            <button
                              onClick={() => openEdit(product)}
                              title="تعديل"
                              className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600"
                            >
                              <Edit size={14} />
                            </button>

                            <button
                              onClick={() => handleCopy(product)}
                              title="نسخ"
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"
                            >
                              <Copy size={14} />
                            </button>

                            <button
                              onClick={() => toggleMutation.mutate({ id: product.id, is_active: !product.is_active })}
                              title={product.is_active ? 'إخفاء' : 'تفعيل'}
                              className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600"
                            >
                              {product.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                            </button>

                            <button
                              onClick={() => deleteMutation.mutate(product.id)}
                              title="حذف"
                              className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-16 text-gray-400">
                        <BookOpen size={40} className="mx-auto mb-3 text-gray-200" />
                        <p className="font-semibold">لا توجد كتب</p>
                        <p className="text-sm mt-1">لا توجد كتب مرتبطة بهذه الدولة بعد</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl my-6">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <BookOpen size={18} className="text-blue-700" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-800">{editProduct ? 'تعديل الكتاب' : 'إضافة كتاب جديد'}</h2>
                  <p className="text-xs text-gray-400">
                    {selectedCountry?.name
                      ? `الأسعار المعروضة تخص ${selectedCountry.name}`
                      : 'أدخل بيانات الكتاب بالكامل'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex gap-2 px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              {tabBtn('info', '📋 المعلومات الأساسية')}
              {tabBtn('variants', '📦 أنواع النسخ')}
              {tabBtn('media', '🖼️ الصور والملفات')}
            </div>

            <div className="p-6">
              {activeTab === 'info' && (
                <div className="space-y-4">
                  {selectedCountry?.name && (
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-700 font-semibold">
                      الأسعار التالية مرتبطة بالدولة الحالية: {selectedCountry.name} · {currencySymbol}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        اسم الكتاب <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={form.title}
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        className="input-field"
                        placeholder="مثال: ذاكرة الجسد"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        المؤلف <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={form.author}
                        onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                        className="input-field"
                        placeholder="اسم المؤلف"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">الوصف</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      className="input-field resize-none"
                      rows={3}
                      placeholder="وصف مختصر للكتاب..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">التصنيف</label>
                      <select
                        value={form.category_id}
                        onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                        className="input-field"
                      >
                        <option value="">اختر التصنيف</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">رقم ISBN</label>
                      <input
                        value={form.isbn}
                        onChange={(e) => setForm((f) => ({ ...f, isbn: e.target.value }))}
                        className="input-field"
                        placeholder="978-XXXXXXXXXX"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">السلاسل</label>
                    <div className="flex flex-wrap gap-2">
                      {allSeries.map((s) => {
                        const selected = form.seriesIds.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                seriesIds: selected
                                  ? f.seriesIds.filter((id) => id !== s.id)
                                  : [...f.seriesIds, s.id],
                              }))
                            }
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                              selected
                                ? 'bg-blue-700 text-white border-blue-700'
                                : 'border-gray-200 text-gray-600 hover:border-blue-300'
                            }`}
                          >
                            {s.name}
                          </button>
                        );
                      })}
                      {allSeries.length === 0 && (
                        <p className="text-xs text-gray-400">لا توجد سلاسل، أضف من صفحة السلاسل</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                      <Tag size={14} />
                      الكلمات المفتاحية
                    </label>
                    <input
                      value={form.keywords}
                      onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
                      className="input-field"
                      placeholder="رواية، أدب، تاريخ — مفصولة بـ ،"
                    />
                  </div>

                  <div className="bg-blue-50 rounded-2xl p-4">
                    <h4 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
                      <DollarSign size={15} />
                      ملخص أسعار النسخ
                    </h4>

                    <p className="text-xs text-blue-700 mb-3 leading-relaxed">
                      السعر الحقيقي للعميل يتم تحديده من تبويب <b>أنواع النسخ</b>. 
                      المعلومات الأساسية لا تستخدم كسعر شراء مباشر حتى لا يحدث تكرار أو لخبطة بين النسخة الورقية والرقمية.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="bg-white rounded-xl p-3">
                        <p className="text-xs text-gray-500 mb-1">عدد النسخ</p>
                        <p className="text-lg font-bold text-gray-800">{variants.length}</p>
                      </div>

                      <div className="bg-white rounded-xl p-3">
                        <p className="text-xs text-gray-500 mb-1">أقل سعر</p>
                        <p className="text-lg font-bold text-blue-700">
                          {variantSummary.minPrice ? `${variantSummary.minPrice.toLocaleString()} ${currencySymbol}` : '—'}
                        </p>
                      </div>

                      <div className="bg-white rounded-xl p-3">
                        <p className="text-xs text-gray-500 mb-1">أعلى سعر</p>
                        <p className="text-lg font-bold text-blue-700">
                          {variantSummary.maxPrice ? `${variantSummary.maxPrice.toLocaleString()} ${currencySymbol}` : '—'}
                        </p>
                      </div>

                      <div className="bg-white rounded-xl p-3">
                        <p className="text-xs text-gray-500 mb-1">أقل ربح</p>
                        <p className={`text-lg font-bold ${variantSummary.minProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {variantSummary.minPrice ? `${variantSummary.minProfit.toLocaleString()} ${currencySymbol}` : '—'}
                        </p>
                      </div>
                    </div>

                    {variants.length === 0 && (
                      <div className="mt-3 bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-600 font-semibold">
                        يجب إضافة نسخة واحدة على الأقل من تبويب أنواع النسخ قبل حفظ الكتاب.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'variants' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-700">نسخ الكتاب <span className="text-red-500">*</span></p>
                      <p className="text-xs text-gray-400">
                        كل نسخة لها سعرها وخصمها ومخزونها. لا يمكن حفظ كتاب بدون نسخة واحدة على الأقل.
                      </p>
                    </div>
                    <button
                      onClick={() => setVariants((v) => [...v, emptyVariant()])}
                      className="btn-primary text-sm flex items-center gap-1.5"
                    >
                      <Plus size={14} />
                      إضافة نسخة
                    </button>
                  </div>

                  {variants.length === 0 ? (
                    <div className="text-center py-10 bg-red-50 border border-red-100 rounded-2xl">
                      <Package size={32} className="text-red-300 mx-auto mb-2" />
                      <p className="text-sm text-red-600 font-semibold">يجب إضافة نسخة واحدة على الأقل</p>
                      <p className="text-xs text-red-400 mt-1">
                        مثال: إلكتروني / رقمي أو ورق عادي / مادي
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {variants.map((v, idx) => {
                        const basePrice = toNumber(v.base_price);
                        const salePrice = getVariantSalePrice(v);
                        const costPrice = toNumber(v.cost_price);
                        const discountPercent =
                          basePrice > 0 && salePrice > 0 && salePrice < basePrice
                            ? Math.round(((basePrice - salePrice) / basePrice) * 100)
                            : 0;
                        const variantProfit = salePrice - costPrice;

                        return (
                          <div key={v._key} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex gap-2 flex-wrap">
                                <select
                                  value={v.variant_name}
                                  onChange={(e) =>
                                    setVariants((prev) =>
                                      prev.map((x, i) => (i === idx ? { ...x, variant_name: e.target.value } : x))
                                    )
                                  }
                                  className="input-field text-sm py-1.5 h-auto w-36"
                                >
                                  {VARIANT_NAMES.map((t) => (
                                    <option key={t}>{t}</option>
                                  ))}
                                </select>

                                <select
                                  value={v.variant_type}
                                  onChange={(e) =>
                                    setVariants((prev) =>
                                      prev.map((x, i) =>
                                        i === idx
                                          ? { ...x, variant_type: e.target.value as 'مادي' | 'رقمي' }
                                          : x
                                      )
                                    )
                                  }
                                  className="input-field text-sm py-1.5 h-auto w-28"
                                >
                                  <option value="مادي">مادي</option>
                                  <option value="رقمي">رقمي</option>
                                </select>

                                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                                  v.variant_type === 'رقمي'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {v.variant_type === 'رقمي' ? 'غير محدود المخزون' : 'له مخزون منفصل'}
                                </span>
                              </div>

                              <button
                                onClick={() => setVariants((prev) => prev.filter((_, i) => i !== idx))}
                                className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"
                                title="حذف النسخة"
                              >
                                <X size={14} />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                              <div>
                                <label className="text-xs text-gray-500 block mb-1">
                                  سعر التكلفة ({currencySymbol})
                                </label>
                                <input
                                  type="number"
                                  value={v.cost_price}
                                  onChange={(e) =>
                                    setVariants((prev) =>
                                      prev.map((x, i) => (i === idx ? { ...x, cost_price: e.target.value } : x))
                                    )
                                  }
                                  className="input-field text-sm py-1.5 h-auto"
                                  placeholder="0.00"
                                />
                              </div>

                              <div>
                                <label className="text-xs text-gray-500 block mb-1">
                                  السعر الأساسي قبل الخصم ({currencySymbol})
                                </label>
                                <input
                                  type="number"
                                  value={v.base_price}
                                  onChange={(e) =>
                                    setVariants((prev) =>
                                      prev.map((x, i) => {
                                        if (i !== idx) return x;
                                        const nextBase = e.target.value;
                                        return {
                                          ...x,
                                          base_price: nextBase,
                                          sale_price: x.sale_price || nextBase,
                                        };
                                      })
                                    )
                                  }
                                  className="input-field text-sm py-1.5 h-auto"
                                  placeholder="0.00"
                                />
                              </div>

                              <div>
                                <label className="text-xs text-gray-500 block mb-1">
                                  سعر البيع بعد الخصم ({currencySymbol})
                                </label>
                                <input
                                  type="number"
                                  value={v.sale_price}
                                  onChange={(e) =>
                                    setVariants((prev) =>
                                      prev.map((x, i) => (i === idx ? { ...x, sale_price: e.target.value } : x))
                                    )
                                  }
                                  className="input-field text-sm py-1.5 h-auto"
                                  placeholder="0.00"
                                />
                              </div>

                              <div>
                                <label className="text-xs text-gray-500 block mb-1">SKU</label>
                                <input
                                  value={v.sku}
                                  onChange={(e) =>
                                    setVariants((prev) =>
                                      prev.map((x, i) => (i === idx ? { ...x, sku: e.target.value } : x))
                                    )
                                  }
                                  className="input-field text-sm py-1.5 h-auto"
                                  placeholder="BOOK-001-A"
                                />
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="bg-white rounded-xl p-3">
                                <p className="text-xs text-gray-500 mb-1">خصم النسخة</p>
                                <p className="text-sm font-bold text-amber-600">
                                  {discountPercent > 0 ? `${discountPercent}%` : 'لا يوجد خصم'}
                                </p>
                              </div>

                              <div className="bg-white rounded-xl p-3">
                                <p className="text-xs text-gray-500 mb-1">ربح النسخة</p>
                                <p className={`text-sm font-bold ${variantProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  {salePrice > 0 ? `${variantProfit.toLocaleString()} ${currencySymbol}` : '—'}
                                </p>
                              </div>

                              {v.variant_type === 'مادي' ? (
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="bg-white rounded-xl p-3">
                                    <label className="text-xs text-gray-500 block mb-1">المخزون</label>
                                    <input
                                      type="number"
                                      value={v.stock}
                                      onChange={(e) =>
                                        setVariants((prev) =>
                                          prev.map((x, i) => (i === idx ? { ...x, stock: e.target.value } : x))
                                        )
                                      }
                                      className="input-field text-sm py-1.5 h-auto"
                                      placeholder="0"
                                    />
                                  </div>

                                  <div className="bg-white rounded-xl p-3">
                                    <label className="text-xs text-gray-500 block mb-1">حد التنبيه</label>
                                    <input
                                      type="number"
                                      value={v.min_stock}
                                      onChange={(e) =>
                                        setVariants((prev) =>
                                          prev.map((x, i) => (i === idx ? { ...x, min_stock: e.target.value } : x))
                                        )
                                      }
                                      className="input-field text-sm py-1.5 h-auto"
                                      placeholder="5"
                                    />
                                  </div>

                                  <div className="bg-white rounded-xl p-3">
                                    <label className="text-xs text-gray-500 block mb-1">الوزن (كجم)</label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="any"
                                      value={v.weight_kg}
                                      onChange={(e) =>
                                        setVariants((prev) =>
                                          prev.map((x, i) => (i === idx ? { ...x, weight_kg: e.target.value } : x))
                                        )
                                      }
                                      className="input-field text-sm py-1.5 h-auto"
                                      placeholder="0.3"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
                                  <p className="text-xs font-semibold text-purple-700">
                                    نسخة رقمية — تظهر في المخزون كـ غير محدود
                                  </p>
                                  <p className="text-xs text-purple-500 mt-1">
                                    لا يتم خصم كمية فعلية منها.
                                  </p>
                                </div>
                              )}
                            </div>

                            {v.variant_type === 'رقمي' && (
                              <div className="mt-3 p-3 bg-purple-50 rounded-xl border border-purple-100">
                                <p className="text-xs font-semibold text-purple-700 mb-2 flex items-center gap-1.5">
                                  <FileText size={13} />
                                  ملف الكتاب الرقمي (PDF / EPUB)
                                </p>
                                <div className="flex items-center gap-3 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => ebookInputRef.current?.click()}
                                    className="flex items-center gap-2 px-4 py-2 bg-white border border-purple-200 rounded-xl text-sm text-purple-700 hover:bg-purple-50 transition-colors"
                                  >
                                    <Upload size={14} />
                                    {ebookFile ? ebookFile.name : 'رفع ملف'}
                                  </button>

                                  {(ebookFile || ebookPath) && (
                                    <span className="text-xs text-purple-600 font-mono">
                                      {ebookFile ? '✓ ملف جديد' : '✓ ملف مرفوع'}
                                    </span>
                                  )}
                                </div>

                                <div className="flex gap-3 text-xs text-purple-600 mt-2 flex-wrap">
                                  <span>✓ يباع مرة واحدة لكل عميل</span>
                                  <span>✓ رابط تحميل مؤقت (24 ساعة)</span>
                                  <span>✓ حماية بعلامة مائية</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'media' && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      صورة الغلاف الرئيسية
                    </label>

                    <div className="flex gap-4 items-start">
                      <div className="w-24 h-32 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-200">
                        {coverPreview || form.cover_url ? (
                          <img
                            src={coverPreview || form.cover_url}
                            alt="غلاف"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <BookOpen size={24} className="text-gray-300" />
                        )}
                      </div>

                      <div className="flex-1 space-y-3">
                        <button
                          type="button"
                          onClick={() => coverInputRef.current?.click()}
                          className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700 hover:bg-blue-100 transition-colors w-full justify-center"
                        >
                          <Upload size={15} />
                          {coverFile ? `تم اختيار: ${coverFile.name}` : 'رفع صورة الغلاف'}
                        </button>

                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">
                            أو أدخل رابط الصورة
                          </label>
                          <input
                            value={form.cover_url}
                            onChange={(e) => setForm((f) => ({ ...f, cover_url: e.target.value }))}
                            className="input-field text-sm py-2 h-auto"
                            placeholder="https://..."
                            dir="ltr"
                          />
                        </div>

                        <p className="text-xs text-gray-400">JPG، PNG، WEBP — حتى 5MB</p>
                      </div>
                    </div>
                  </div>

                  {editProduct ? (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <ImageIcon size={15} className="text-gray-600" />
                        <label className="text-sm font-semibold text-gray-700">معرض صور المنتج</label>
                        <span className="text-xs text-gray-400">(يمكن رفع أكثر من صورة)</span>
                      </div>

                      <ImageGallery
                        productId={editProduct.id}
                        onNewCoverUrl={(url) => setForm((f) => ({ ...f, cover_url: url }))}
                      />
                    </div>
                  ) : (
                    <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                      <p className="text-sm font-semibold text-amber-800">معرض الصور المتعددة</p>
                      <p className="text-xs text-amber-600 mt-1">
                        بعد حفظ الكتاب، يمكنك العودة لتعديله ورفع صور إضافية للمنتج من هذا التبويب.
                      </p>
                    </div>
                  )}

                  <div className="bg-purple-50 rounded-2xl p-4 flex items-start gap-3">
                    <FileText size={16} className="text-purple-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-purple-800">ملفات الكتب الرقمية</p>
                      <p className="text-xs text-purple-600 mt-0.5">
                        يتم رفع ملفات PDF/EPUB من تبويب "أنواع النسخ" عند اختيار نوع "رقمي".
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-3xl">
              <button onClick={() => setShowModal(false)} className="btn-secondary">
                إلغاء
              </button>

              <button
                onClick={handleSave}
                disabled={isBusy}
                className="btn-primary flex items-center gap-2 disabled:opacity-60"
              >
                {isBusy ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : editProduct ? (
                  <Edit size={15} />
                ) : (
                  <Plus size={15} />
                )}
                {isBusy ? 'جارٍ الحفظ...' : editProduct ? 'حفظ التعديلات' : 'إضافة الكتاب'}
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCoverSelect}
      />
      <input
        ref={ebookInputRef}
        type="file"
        accept=".pdf,.epub,.mobi"
        className="hidden"
        onChange={handleEbookSelect}
      />
    </Layout>
  );
}