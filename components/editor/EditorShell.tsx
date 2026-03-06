'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useProjectStore } from '@/store/projectStore';
import { useEditorStore } from '@/store/editorStore';
import MenuBar from './MenuBar';
import Toolbar from './Toolbar';
import LayersPanel from './LayersPanel';
import PropertiesPanel from './PropertiesPanel';
import Timeline from './Timeline';
import { cn } from '@/lib/utils';
import {
  Layers, SlidersHorizontal, Clock, Zap, Download,
  History, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  PanelRightClose, PanelRightOpen, PanelBottomClose, PanelBottomOpen,
} from 'lucide-react';
import AnimationWizard from './AnimationWizard';

// Dynamically import Canvas to avoid SSR
const Canvas = dynamic(() => import('./Canvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full canvas-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">Загрузка холста...</span>
      </div>
    </div>
  ),
});

// Resizable divider component
function Divider({ orientation, onDrag }: { orientation: 'vertical' | 'horizontal'; onDrag: (delta: number) => void }) {
  const dragging = useRef(false);
  const lastPos = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    lastPos.current = orientation === 'vertical' ? e.clientX : e.clientY;
    e.preventDefault();
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const pos = orientation === 'vertical' ? e.clientX : e.clientY;
      onDrag(pos - lastPos.current);
      lastPos.current = pos;
    };
    const onMouseUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [orientation, onDrag]);

  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        'bg-border/50 hover:bg-primary/50 transition-colors flex-shrink-0 z-10 cursor-grab active:cursor-grabbing group',
        orientation === 'vertical' ? 'w-1 hover:w-1.5 h-full cursor-col-resize' : 'h-1 hover:h-1.5 w-full cursor-row-resize',
      )}
    />
  );
}

// Tab definitions for right panel
const RIGHT_TABS = [
  { id: 'layers', label: 'Слои', icon: <Layers size={13} /> },
  { id: 'properties', label: 'Свойства', icon: <SlidersHorizontal size={13} /> },
] as const;

type RightTab = typeof RIGHT_TABS[number]['id'];

// Export dialog
function ExportDialog({ onClose }: { onClose: () => void }) {
  const { project, exportSettings, setExportSettings } = useProjectStore();

  const FORMATS = ['png', 'jpeg', 'gif', 'mp4', 'webm'] as const;
  const RESOLUTIONS = [
    { label: 'Оригинал', w: project.canvas.width, h: project.canvas.height },
    { label: '4K (3840×2160)', w: 3840, h: 2160 },
    { label: 'Full HD (1920×1080)', w: 1920, h: 1080 },
    { label: 'HD (1280×720)', w: 1280, h: 720 },
    { label: '480p (854×480)', w: 854, h: 480 },
  ];

  const isVideo = ['mp4', 'webm', 'gif'].includes(exportSettings.format);

  const handleExport = () => {
    // Stub: in production this would use canvas.toDataURL() or ffmpeg.wasm
    alert(`Экспорт в ${exportSettings.format.toUpperCase()} (${exportSettings.width}×${exportSettings.height}) запущен.\n\nВ полной версии здесь будет обработка через Canvas API / FFmpeg.wasm.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-popover border border-border rounded-xl shadow-2xl w-[480px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Download size={15} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Экспорт</h2>
          </div>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Format */}
          <div>
            <label className="text-xs text-muted-foreground block mb-2">Формат файла</label>
            <div className="flex gap-1.5">
              {FORMATS.map((fmt) => (
                <button key={fmt} onClick={() => setExportSettings({ format: fmt })}
                  className={cn('flex-1 py-1.5 rounded-md text-xs font-medium border uppercase transition-colors',
                    exportSettings.format === fmt ? 'border-primary bg-primary/20 text-primary' : 'border-border bg-black/20 text-muted-foreground hover:text-foreground')}>
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Resolution */}
          <div>
            <label className="text-xs text-muted-foreground block mb-2">Разрешение</label>
            <div className="grid grid-cols-2 gap-1.5">
              {RESOLUTIONS.map((res) => (
                <button key={res.label} onClick={() => setExportSettings({ width: res.w, height: res.h })}
                  className={cn('px-2 py-1.5 rounded-md text-xs border transition-colors text-left',
                    exportSettings.width === res.w && exportSettings.height === res.h ? 'border-primary bg-primary/20 text-foreground' : 'border-border bg-black/20 text-muted-foreground hover:text-foreground')}>
                  <div className="font-medium">{res.label}</div>
                  <div className="text-[10px] font-mono opacity-70">{res.w}×{res.h}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground">Ширина</label>
                <input type="number" value={exportSettings.width} onChange={(e) => setExportSettings({ width: +e.target.value })}
                  className="w-full bg-input border border-border rounded px-2 py-0.5 text-xs text-foreground outline-none focus:border-primary font-mono" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground">Высота</label>
                <input type="number" value={exportSettings.height} onChange={(e) => setExportSettings({ height: +e.target.value })}
                  className="w-full bg-input border border-border rounded px-2 py-0.5 text-xs text-foreground outline-none focus:border-primary font-mono" />
              </div>
            </div>
          </div>

          {/* Quality */}
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-muted-foreground">Качество</label>
              <span className="text-xs font-mono text-foreground">{exportSettings.quality}%</span>
            </div>
            <input type="range" min={10} max={100} value={exportSettings.quality}
              onChange={(e) => setExportSettings({ quality: +e.target.value })}
              className="w-full" />
          </div>

          {/* Video-specific */}
          {isVideo && (
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs text-muted-foreground">Частота кадров</label>
                <span className="text-xs font-mono text-foreground">{exportSettings.fps} FPS</span>
              </div>
              <div className="flex gap-1.5">
                {[24, 25, 30, 60].map((fps) => (
                  <button key={fps} onClick={() => setExportSettings({ fps })}
                    className={cn('flex-1 py-1 rounded-md text-xs border transition-colors',
                      exportSettings.fps === fps ? 'border-primary bg-primary/20 text-primary' : 'border-border bg-black/20 text-muted-foreground hover:text-foreground')}>
                    {fps}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* GIF loop */}
          {exportSettings.format === 'gif' && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Зацикливание</label>
              <div className="flex gap-1.5">
                {[{ value: 'once', label: 'Один раз' }, { value: 'infinite', label: 'Бесконечно' }, { value: '3', label: '3 цикла' }].map((opt) => (
                  <button key={opt.value} onClick={() => setExportSettings({ loop: opt.value as any })}
                    className={cn('flex-1 py-1.5 rounded-md text-xs border transition-colors',
                      exportSettings.loop === opt.value ? 'border-primary bg-primary/20 text-primary' : 'border-border bg-black/20 text-muted-foreground hover:text-foreground')}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PNG transparency */}
          {['png', 'gif'].includes(exportSettings.format) && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="transparent" checked={exportSettings.transparent} onChange={(e) => setExportSettings({ transparent: e.target.checked })}
                className="accent-primary" />
              <label htmlFor="transparent" className="text-xs text-foreground cursor-pointer">Прозрачный фон (Alpha)</label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <span className="text-[11px] text-muted-foreground">
            ~{Math.round(exportSettings.width * exportSettings.height * exportSettings.quality / 1000000 * 3)} МБ (оценка)
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 rounded transition-colors">Отмена</button>
            <button onClick={handleExport} className="px-4 py-1.5 text-xs font-medium bg-primary text-white hover:bg-primary/90 rounded transition-colors flex items-center gap-1.5">
              <Download size={12} /> Экспорт
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EditorShell() {
  const { project } = useProjectStore();
  const { openPanels, togglePanel, currentTime, timelinePlaying } = useEditorStore();

  // Panel sizes (px)
  const [rightWidth, setRightWidth] = useState(280);
  const [timelineHeight, setTimelineHeight] = useState(200);
  const [rightTab, setRightTab] = useState<RightTab>('layers');
  const [showTimeline, setShowTimeline] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showAnimWizard, setShowAnimWizard] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      // Ctrl+Z / Ctrl+Y
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); useProjectStore.getState().undo(); }
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); useProjectStore.getState().redo(); }

      // Ctrl+D duplicate
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        const sel = useProjectStore.getState().selection;
        if (sel[0]) useProjectStore.getState().duplicateLayer(sel[0]);
      }

      // Delete selected layer
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey) {
        const sel = useProjectStore.getState().selection;
        if (sel[0]) useProjectStore.getState().removeLayer(sel[0]);
      }

      // Space = play/pause
      if (e.code === 'Space' && !e.ctrlKey) {
        e.preventDefault();
        useEditorStore.getState().setPlaying(!useEditorStore.getState().timelinePlaying);
      }

      // Ctrl+E = export
      if (e.ctrlKey && e.key === 'e') { e.preventDefault(); setShowExport(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleRightDrag = useCallback((delta: number) => {
    setRightWidth((w) => Math.min(Math.max(w - delta, 200), 500));
  }, []);

  const handleTimelineDrag = useCallback((delta: number) => {
    setTimelineHeight((h) => Math.min(Math.max(h - delta, 100), 500));
  }, []);

  // Selection info for status bar
  const { selection, project: proj } = useProjectStore();
  const selectedLayer = proj.layers.find((l) => l.id === selection[0]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      {/* Menu Bar */}
      <MenuBar />

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Toolbar */}
        <Toolbar />

        {/* Center: Canvas + Timeline */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Canvas area */}
          <div className="flex-1 overflow-hidden relative">
            <Canvas />

            {/* Floating animation wizard trigger */}
            {selection.length > 0 && (
              <div className="absolute top-3 right-3 z-20 flex gap-1.5">
                <button
                  onClick={() => setShowAnimWizard(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/60 backdrop-blur-sm border border-border/50 rounded-md text-xs text-foreground hover:border-primary/50 hover:bg-black/80 transition-all"
                  title="Мастер анимации"
                >
                  <Zap size={12} className="text-amber-400" />
                  Анимировать
                </button>
                <button
                  onClick={() => setShowExport(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/60 backdrop-blur-sm border border-border/50 rounded-md text-xs text-foreground hover:border-primary/50 hover:bg-black/80 transition-all"
                  title="Экспортировать (Ctrl+E)"
                >
                  <Download size={12} className="text-green-400" />
                  Экспорт
                </button>
              </div>
            )}

            {!selection.length && (
              <div className="absolute top-3 right-3 z-20">
                <button
                  onClick={() => setShowExport(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/60 backdrop-blur-sm border border-border/50 rounded-md text-xs text-foreground hover:border-primary/50 hover:bg-black/80 transition-all"
                >
                  <Download size={12} className="text-green-400" />
                  Экспорт
                </button>
              </div>
            )}
          </div>

          {/* Timeline toggle bar */}
          <div
            className="flex items-center h-5 bg-timeline-bg border-t panel-border cursor-pointer hover:bg-white/5 transition-colors shrink-0 group"
            onClick={() => setShowTimeline(!showTimeline)}
          >
            <div className="flex items-center gap-1.5 px-2">
              <Clock size={10} className="text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Таймлайн</span>
              {timelinePlaying && <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />}
            </div>
            <div className="ml-auto pr-2 text-muted-foreground group-hover:text-foreground">
              {showTimeline ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </div>
          </div>

          {/* Timeline */}
          {showTimeline && (
            <>
              <Divider orientation="horizontal" onDrag={handleTimelineDrag} />
              <div style={{ height: timelineHeight }} className="shrink-0 overflow-hidden">
                <Timeline />
              </div>
            </>
          )}
        </div>

        {/* Right panel divider */}
        {showRightPanel && <Divider orientation="vertical" onDrag={handleRightDrag} />}

        {/* Right panel */}
        {showRightPanel && (
          <div style={{ width: rightWidth }} className="flex flex-col overflow-hidden border-l panel-border shrink-0">
            {/* Tab bar */}
            <div className="flex items-center h-8 border-b panel-border toolbar-bg shrink-0">
              {RIGHT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setRightTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 h-full text-[11px] transition-colors border-b-2',
                    rightTab === tab.id
                      ? 'border-primary text-foreground bg-black/20'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5',
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={() => setShowRightPanel(false)}
                className="w-7 h-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                title="Скрыть панель"
              >
                <PanelRightClose size={13} />
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              {rightTab === 'layers' && <LayersPanel />}
              {rightTab === 'properties' && <PropertiesPanel />}
            </div>
          </div>
        )}

        {/* Right panel toggle when hidden */}
        {!showRightPanel && (
          <button
            onClick={() => setShowRightPanel(true)}
            className="w-5 h-full flex items-center justify-center border-l panel-border toolbar-bg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
            title="Показать панели"
          >
            <PanelRightOpen size={12} />
          </button>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center h-5 bg-status-bar border-t panel-border px-3 gap-4 shrink-0">
        <span className="text-[10px] font-mono text-muted-foreground">
          Холст: {project.canvas.width}×{project.canvas.height} px
        </span>
        {selectedLayer && (
          <span className="text-[10px] font-mono text-muted-foreground">
            Слой: {selectedLayer.x},{selectedLayer.y} &nbsp;|&nbsp; {selectedLayer.width}×{selectedLayer.height} px
          </span>
        )}
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground">
          {proj.layers.length} сл. &nbsp;|&nbsp; {proj.animations.length} аним.
        </span>
        <div className="w-px h-3 bg-border" />
        <span className="text-[10px] text-muted-foreground font-mono">
          {(currentTime / 1000).toFixed(2)}s / {(project.duration / 1000).toFixed(1)}s
        </span>
      </div>

      {/* Modals */}
      {showAnimWizard && <AnimationWizard onClose={() => setShowAnimWizard(false)} />}
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </div>
  );
}
