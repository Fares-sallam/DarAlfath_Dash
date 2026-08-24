import { useState } from 'react';
import Layout from '@/components/layout/Layout';
import {
  Youtube, Plus, Trash2, ArrowUp, ArrowDown, Eye, EyeOff,
  Loader2, AlertTriangle, ExternalLink, Save,
} from 'lucide-react';
import {
  useIntroVideos, useCreateIntroVideo, useUpdateIntroVideo,
  useReorderIntroVideo, useDeleteIntroVideo, type IntroVideo,
} from '@/hooks/useIntroVideos';

function toEmbedThumb(url: string): string | null {
  try {
    const parsed = new URL(url);
    let id = parsed.searchParams.get('v');
    if (!id && parsed.hostname.includes('youtu.be')) id = parsed.pathname.replace('/', '').trim();
    return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
  } catch {
    return null;
  }
}

export default function IntroVideos() {
  const { data: videos = [], isLoading, isError, error } = useIntroVideos();
  const createVideo = useCreateIntroVideo();
  const updateVideo = useUpdateIntroVideo();
  const reorderVideo = useReorderIntroVideo();
  const deleteVideo = useDeleteIntroVideo();

  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newTitle.trim() || !newUrl.trim()) return;
    setAdding(true);
    try {
      const nextOrder = videos.length ? Math.max(...videos.map((v) => v.sort_order)) + 1 : 0;
      await createVideo.mutateAsync({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        youtube_url: newUrl.trim(),
        duration: newDuration.trim() || undefined,
        sort_order: nextOrder,
      });
      setNewTitle('');
      setNewDescription('');
      setNewUrl('');
      setNewDuration('');
    } finally {
      setAdding(false);
    }
  };

  const move = (video: IntroVideo, dir: -1 | 1) => {
    const sorted = [...videos].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((v) => v.id === video.id);
    const neighbour = sorted[idx + dir];
    if (!neighbour) return;
    reorderVideo.mutate({ current: video, neighbour });
  };

  return (
    <Layout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Youtube className="text-red-600" size={24} />
            فيديوهات "من الدار"
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            مقاطع اليوتيوب المعروضة في قسم "من الدار" على الصفحة الرئيسية — أضِف، رتّب، أو أخفِ أي فيديو في أي وقت.
            التغيير يظهر في الموقع فورًا.
          </p>
        </div>

        {/* ── نموذج الإضافة ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-700">إضافة فيديو جديد</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="عنوان الفيديو *"
              className="px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
            />
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="رابط يوتيوب * (مثال: https://www.youtube.com/watch?v=xxxx)"
              className="px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
              dir="ltr"
            />
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="وصف مختصر (اختياري)"
              className="px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
            />
            <input
              value={newDuration}
              onChange={(e) => setNewDuration(e.target.value)}
              placeholder="المدة (اختياري — مثال: 05:20)"
              className="px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
              dir="ltr"
            />
          </div>

          <button
            onClick={handleAdd}
            disabled={adding || !newTitle.trim() || !newUrl.trim()}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            إضافة الفيديو
          </button>
        </div>

        {/* ── القائمة ── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
              <Loader2 className="animate-spin" size={28} />
              <p className="text-sm">جارٍ التحميل...</p>
            </div>
          ) : isError ? (
            <div className="py-16 flex flex-col items-center gap-2 text-red-500">
              <AlertTriangle size={28} />
              <p className="text-sm font-semibold">تعذّر تحميل الفيديوهات</p>
              <p className="text-xs text-gray-400">
                {error instanceof Error ? error.message : 'خطأ غير معروف'}
              </p>
            </div>
          ) : videos.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-gray-400">
              <Youtube size={28} />
              <p className="text-sm font-semibold text-gray-600">لا توجد فيديوهات بعد</p>
              <p className="text-xs">أضِف أول فيديو من الأعلى — قسم "من الدار" سيبقى مخفيًا حتى ذلك.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {videos
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((video, i, arr) => (
                  <VideoRow
                    key={video.id}
                    video={video}
                    isFirst={i === 0}
                    isLast={i === arr.length - 1}
                    onMoveUp={() => move(video, -1)}
                    onMoveDown={() => move(video, 1)}
                    onToggleActive={() =>
                      updateVideo.mutate({ id: video.id, is_active: !video.is_active })
                    }
                    onDelete={() => {
                      if (confirm('حذف هذا الفيديو نهائيًا؟')) deleteVideo.mutate(video);
                    }}
                    onSave={(patch) => updateVideo.mutate({ id: video.id, ...patch })}
                  />
                ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  );
}

/* ── صف واحد ── */
function VideoRow({
  video, isFirst, isLast, onMoveUp, onMoveDown, onToggleActive, onDelete, onSave,
}: {
  video: IntroVideo;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onSave: (patch: { title?: string; description?: string | null; youtube_url?: string; duration?: string | null }) => void;
}) {
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description ?? '');
  const [url, setUrl] = useState(video.youtube_url);
  const [duration, setDuration] = useState(video.duration ?? '');
  const dirty = title !== video.title || description !== (video.description ?? '')
    || url !== video.youtube_url || duration !== (video.duration ?? '');
  const thumb = toEmbedThumb(video.youtube_url);

  return (
    <li className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50/60 transition-colors">
      <div className="flex flex-col gap-1">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20 disabled:pointer-events-none"
          aria-label="نقل لأعلى"
        >
          <ArrowUp size={14} />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20 disabled:pointer-events-none"
          aria-label="نقل لأسفل"
        >
          <ArrowDown size={14} />
        </button>
      </div>

      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="w-16 h-11 rounded-lg object-cover bg-gray-50 border border-gray-100 flex-shrink-0"
        />
      ) : (
        <div className="w-16 h-11 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
          <Youtube size={16} className="text-gray-300" />
        </div>
      )}

      <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="العنوان"
          className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-200"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="رابط يوتيوب"
          dir="ltr"
          className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-200"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="وصف مختصر"
          className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-200"
        />
        <input
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="المدة (مثال: 05:20)"
          dir="ltr"
          className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-200"
        />
      </div>

      {dirty && (
        <button
          onClick={() => onSave({
            title: title.trim(),
            description: description.trim() || null,
            youtube_url: url.trim(),
            duration: duration.trim() || null,
          })}
          className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex-shrink-0"
          aria-label="حفظ"
          title="حفظ"
        >
          <Save size={16} />
        </button>
      )}

      <a
        href={video.youtube_url}
        target="_blank"
        rel="noreferrer"
        className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 flex-shrink-0"
        title="فتح على يوتيوب"
      >
        <ExternalLink size={15} />
      </a>

      <button
        onClick={onToggleActive}
        className={`p-2 rounded-lg flex-shrink-0 ${
          video.is_active
            ? 'text-green-600 hover:bg-green-50'
            : 'text-gray-300 hover:bg-gray-100'
        }`}
        title={video.is_active ? 'ظاهر — اضغط للإخفاء' : 'مخفي — اضغط للإظهار'}
      >
        {video.is_active ? <Eye size={17} /> : <EyeOff size={17} />}
      </button>

      <button
        onClick={onDelete}
        className="p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
        title="حذف"
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
}
