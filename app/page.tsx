'use client';

import { useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useProjectStore, createLayer } from '@/store/projectStore';
import type { CanvasSize } from '@/store/types';
import {
  Film, Image as ImageIcon, Plus, FolderOpen, Upload,
  Clock, Maximize2, Instagram, Monitor, Smartphone, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Dynamically import heavy editor
const EditorShell = dynamic(() => import('@/components/editor/EditorShell'), {
  ssr: false,
  loading: () => (
    <div className="w-screen h-screen bg-[#1a1a1f] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-white/60">
        <div className="w-10 h-10 border-2 border-[#4d9bff] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Загрузка редактора...</span>
      </div>
    </div>
  ),
});

const CANVAS_PRESETS: { name: string; width: number; height: number; icon: React.ReactNode; category: string }[] = [
  { name: '1920×1080 Full HD', width: 1920, height: 1080, icon: <Monitor size={16} />, category: 'Видео' },
  { name: '3840×2160 4K UHD', width: 3840, height: 2160, icon: <Monitor size={16} />, category: 'Видео' },
  { name: '1280×720 HD', width: 1280, height: 720, icon: <Monitor size={16} />, category: 'Видео' },
  { name: '1080×1080 Instagram', width: 1080, height: 1080, icon: <Instagram size={16} />, category: 'Социальные сети' },
  { name: '1080×1920 Reels/Stories', width: 1080, height: 1920, icon: <Smartphone size={16} />, category: 'Социальные сети' },
  { name: '1200×628 Facebook/OG', width: 1200, height: 628, icon: <Maximize2 size={16} />, category: 'Социальные сети' },
  { name: '2480×3508 A4 (300 dpi)', width: 2480, height: 3508, icon: <Maximize2 size={16} />, category: 'Печать' },
  { name: '1920×1080 Презентация', width: 1920, height: 1080, icon: <Monitor size={16} />, category: 'Дизайн' },
];

const RECENT_PROJECTS = [
  { name: 'Рекламный баннер', date: '2 часа назад', size: '1920×1080', icon: '🖼️' },
  { name: 'Intro видео', date: 'Вчера', size: '3840×2160', icon: '🎬' },
  { name: 'Логотип компании', date: '3 дня назад', size: '1080×1080', icon: '✨' },
];

export default function Home() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [customW, setCustomW] = useState(1920);
  const [customH, setCustomH] = useState(1080);
  const [selectedPreset, setSelectedPreset] = useState(CANVAS_PRESETS[0]);
  const [draggingOver, setDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { newProject, addLayer } = useProjectStore();

  const openWithPreset = (preset: typeof CANVAS_PRESETS[0]) => {
    newProject({ width: preset.width, height: preset.height, name: preset.name });
    setEditorOpen(true);
  };

  const openWithCustom = () => {
    newProject({ width: customW, height: customH, name: `${customW}×${customH}` });
    setEditorOpen(true);
  };

  const handleFilesOpen = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];
    const isVideo = file.type.startsWith('video/');

    let w = 1920, h = 1080;
    const url = URL.createObjectURL(file);

    if (!isVideo) {
      const img = new window.Image();
      img.src = url;
      await new Promise<void>((res) => {
        img.onload = () => res();
        img.onerror = () => res();
      });
      w = img.naturalWidth || 1920;
      h = img.naturalHeight || 1080;
    }

    newProject({ width: w, height: h, name: file.name });

    const layer = createLayer({
      type: isVideo ? 'video' : 'image',
      name: file.name,
      src: url,
      x: 0, y: 0,
      width: w,
      height: h,
    });
    addLayer(layer);
    setEditorOpen(true);
  };

  const handleFileOpen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    await handleFilesOpen(files);
    e.target.value = '';
  };

  const handlePageDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingOver(true);
  };
  const handlePageDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDraggingOver(false);
  };
  const handlePageDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    await handleFilesOpen(files);
  };

  if (editorOpen) return <EditorShell />;

  const categories = [...new Set(CANVAS_PRESETS.map((p) => p.category))];

  return (
    <div
      className="min-h-screen bg-[#141418] flex flex-col items-center justify-center p-8 font-sans"
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      {draggingOver && (
        <div className="fixed inset-0 bg-[#4d9bff]/10 border-4 border-dashed border-[#4d9bff] z-50 flex items-center justify-center pointer-events-none rounded-xl m-4">
          <div className="text-[#4d9bff] text-2xl font-semibold">Отпустите файл для открытия</div>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col items-center mb-10 text-center">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-[#4d9bff] rounded-xl flex items-center justify-center shadow-lg shadow-[#4d9bff]/30">
            <Film size={24} className="text-white" />
          </div>
          <div className="text-left">
            <h1 className="text-2xl font-bold text-white leading-tight">MotionCraft</h1>
            <p className="text-sm text-white/50">Редактор изображений и видео</p>
          </div>
        </div>
        <p className="text-white/40 text-sm max-w-md leading-relaxed">
          Профессиональный редактор с мощными инструментами Photoshop и After Effects.
          Работает прямо в браузере — данные хранятся локально.
        </p>
      </div>

      <div className="w-full max-w-5xl grid grid-cols-3 gap-5">
        {/* New project panel */}
        <div className="col-span-2 bg-[#1e1e24] border border-[#3a3a45] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#3a3a45] flex items-center gap-2">
            <Plus size={14} className="text-[#4d9bff]" />
            <span className="text-sm font-semibold text-white">Новый проект</span>
          </div>

          <div className="p-5">
            {/* Preset grid */}
            {categories.map((cat) => (
              <div key={cat} className="mb-4">
                <h3 className="text-[11px] text-white/40 uppercase tracking-wider mb-2">{cat}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {CANVAS_PRESETS.filter((p) => p.category === cat).map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => setSelectedPreset(preset)}
                      onDoubleClick={() => openWithPreset(preset)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all',
                        selectedPreset.name === preset.name
                          ? 'border-[#4d9bff] bg-[#4d9bff]/10 text-white'
                          : 'border-[#3a3a45] bg-black/20 text-white/60 hover:text-white hover:border-[#4d9bff]/40',
                      )}
                    >
                      <span className="text-white/40 shrink-0">{preset.icon}</span>
                      <div>
                        <div className="text-xs font-medium leading-tight">{preset.name.split(' ').slice(1).join(' ') || preset.name}</div>
                        <div className="text-[10px] font-mono text-white/30">{preset.width}×{preset.height}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Custom size */}
            <div className="border border-[#3a3a45] rounded-lg p-3 bg-black/20 mb-4">
              <h3 className="text-[11px] text-white/40 uppercase tracking-wider mb-2">Произвольный размер</h3>
              <div className="flex items-center gap-2">
                <input
                  type="number" value={customW} onChange={(e) => setCustomW(+e.target.value)}
                  className="flex-1 bg-[#1a1a1f] border border-[#3a3a45] rounded px-2 py-1.5 text-xs text-white outline-none focus:border-[#4d9bff] font-mono"
                  placeholder="Ширина"
                />
                <span className="text-white/30 text-xs">×</span>
                <input
                  type="number" value={customH} onChange={(e) => setCustomH(+e.target.value)}
                  className="flex-1 bg-[#1a1a1f] border border-[#3a3a45] rounded px-2 py-1.5 text-xs text-white outline-none focus:border-[#4d9bff] font-mono"
                  placeholder="Высота"
                />
                <span className="text-[10px] text-white/30">px</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => openWithPreset(selectedPreset)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#4d9bff] hover:bg-[#4d9bff]/90 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus size={14} />
                Создать: {selectedPreset.width}×{selectedPreset.height}
              </button>
              <button
                onClick={openWithCustom}
                className="px-3 py-2.5 border border-[#3a3a45] text-white/60 hover:text-white hover:border-[#4d9bff]/40 text-xs rounded-lg transition-colors"
                title="Создать с произвольным размером"
              >
                {customW}×{customH}
              </button>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">
          {/* Open file */}
          <div className="bg-[#1e1e24] border border-[#3a3a45] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#3a3a45] flex items-center gap-2">
              <FolderOpen size={14} className="text-[#4d9bff]" />
              <span className="text-sm font-semibold text-white">Открыть файл</span>
            </div>
            <div className="p-4 space-y-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const files = Array.from(e.dataTransfer.files);
                  await handleFilesOpen(files);
                }}
                className="w-full flex items-center justify-center gap-2 py-8 border-2 border-dashed border-[#3a3a45] rounded-lg text-white/40 hover:text-white hover:border-[#4d9bff]/40 transition-all group"
              >
                <div className="flex flex-col items-center gap-2">
                  <Upload size={20} className="group-hover:text-[#4d9bff] transition-colors" />
                  <span className="text-xs">Перетащите или кликните</span>
                  <span className="text-[11px] text-white/25">JPG, PNG, GIF, MP4, MOV, WEBM</span>
                </div>
              </button>
              <input ref={fileInputRef} type="file" multiple
                accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,image/tiff,video/mp4,video/mov,video/avi,video/mkv,video/webm"
                className="sr-only" onChange={handleFileOpen} />
            </div>
          </div>

          {/* Recent projects (UI only for now) */}
          <div className="bg-[#1e1e24] border border-[#3a3a45] rounded-xl overflow-hidden flex-1">
            <div className="px-4 py-3 border-b border-[#3a3a45] flex items-center gap-2">
              <Clock size={14} className="text-[#4d9bff]" />
              <span className="text-sm font-semibold text-white">Недавние</span>
            </div>
            <div className="p-2">
              {RECENT_PROJECTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => {
                    newProject({ width: parseInt(p.size), height: parseInt(p.size.split('×')[1]) });
                    setEditorOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-white/5 transition-colors text-left group"
                >
                  <span className="text-base">{p.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white/80 truncate">{p.name}</div>
                    <div className="text-[10px] text-white/30 font-mono">{p.size} &middot; {p.date}</div>
                  </div>
                  <ChevronRight size={12} className="text-white/20 group-hover:text-white/50 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* PWA install hint */}
          <div className="bg-[#1a2a3a] border border-[#2a3a4a] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 bg-[#4d9bff] rounded flex items-center justify-center">
                <Film size={11} className="text-white" />
              </div>
              <span className="text-xs font-semibold text-[#4d9bff]">Установить как приложение</span>
            </div>
            <p className="text-[11px] text-white/40 leading-relaxed">
              В браузере Chrome/Edge нажмите{' '}
              <kbd className="bg-white/10 px-1 py-0.5 rounded text-white/60">⋮</kbd>
              {' '}→ <strong className="text-white/60">«Установить MotionCraft»</strong>.
              Появится ярлык на рабочем столе и в меню приложений. Работает офлайн.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
