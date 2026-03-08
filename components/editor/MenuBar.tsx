'use client';

import { useState, useRef } from 'react';
import { useProjectStore, createLayer } from '@/store/projectStore';
import { useEditorStore } from '@/store/editorStore';
import {
  FolderOpen, Save, Download, FileImage, FileVideo, Settings,
  Undo2, Redo2, ZoomIn, ZoomOut, Grid3x3, Ruler,
  LayoutGrid, Eye, ChevronDown, Film, Image as ImageIcon,
  Layers, SlidersHorizontal, Plus, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MenuItemDef {
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  separator?: boolean;
  children?: MenuItemDef[];
  disabled?: boolean;
}

function MenuItem({ item, depth = 0, onClose }: { item: MenuItemDef; depth?: number; onClose: () => void }) {
  const [open, setOpen] = useState(false);

  if (item.separator) return <div className="h-px bg-border/50 my-0.5 mx-2" />;

  return (
    <div
      className="relative"
      onMouseEnter={() => item.children && setOpen(true)}
      onMouseLeave={() => item.children && setOpen(false)}
    >
      <button
        disabled={item.disabled}
        onClick={() => {
          if (item.onClick) { item.onClick(); onClose(); }
        }}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-1 text-xs text-foreground hover:bg-accent/50 transition-colors text-left',
          item.disabled && 'opacity-40 cursor-not-allowed',
        )}
      >
        {item.icon && <span className="w-4 text-muted-foreground">{item.icon}</span>}
        <span className="flex-1">{item.label}</span>
        {item.shortcut && <span className="text-[10px] text-muted-foreground font-mono ml-4">{item.shortcut}</span>}
        {item.children && <ChevronDown size={10} className="rotate-[-90deg] ml-1 text-muted-foreground" />}
      </button>
      {item.children && open && (
        <div className="absolute left-full top-0 bg-popover border border-border rounded-md shadow-xl py-1 z-[200] min-w-[180px]">
          {item.children.map((child, i) => (
            <MenuItem key={i} item={child} depth={depth + 1} onClose={onClose} />
          ))}
        </div>
      )}
    </div>
  );
}

function Menu({ label, items }: { label: string; items: MenuItemDef[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen(!open)}
        onMouseEnter={() => open && setOpen(true)}
        className={cn(
          'px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 rounded transition-colors',
          open && 'bg-white/10 text-foreground',
        )}
      >
        {label}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-0.5 bg-popover border border-border rounded-md shadow-xl py-1 z-[200] min-w-[200px]">
          {items.map((item, i) => (
            <MenuItem key={i} item={item} onClose={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CanvasSizePresets({ onSelect, onClose }: { onSelect: (w: number, h: number, name: string) => void; onClose: () => void }) {
  const PRESETS = [
    { name: '1920×1080 Full HD', w: 1920, h: 1080 },
    { name: '3840×2160 4K UHD', w: 3840, h: 2160 },
    { name: '1280×720 HD', w: 1280, h: 720 },
    { name: '1080×1080 Instagram', w: 1080, h: 1080 },
    { name: '1080×1920 Reels/Stories', w: 1080, h: 1920 },
    { name: '1200×628 OG/Facebook', w: 1200, h: 628 },
    { name: '2560×1440 2K', w: 2560, h: 1440 },
    { name: 'A4 (300dpi)', w: 2480, h: 3508 },
  ];
  return (
    <div className="absolute left-full top-0 bg-popover border border-border rounded-md shadow-xl py-1 z-[200] min-w-[240px]">
      {PRESETS.map((p) => (
        <button key={p.name} onClick={() => { onSelect(p.w, p.h, p.name); onClose(); }}
          className="flex items-center justify-between w-full px-3 py-1 text-xs text-foreground hover:bg-accent/50 transition-colors">
          <span>{p.name}</span>
          <span className="text-[10px] text-muted-foreground font-mono">{p.w}×{p.h}</span>
        </button>
      ))}
    </div>
  );
}

export default function MenuBar() {
  const { project, canUndo, canRedo, undo, redo, setProjectName, setCanvasSize, newProject } = useProjectStore();
  const { showRulers, showGrid, toggleRulers, toggleGrid, zoom, zoomIn, zoomOut, zoomFit } = useEditorStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileOpen = () => fileInputRef.current?.click();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const type = file.type.startsWith('video/') ? 'video' as const : 'image' as const;
      const layer = createLayer({
        type,
        name: file.name,
        src: url,
        x: 0, y: 0,
        width: type === 'image' ? 1920 : 1920,
        height: type === 'image' ? 1080 : 1080,
      });
      useProjectStore.getState().addLayer(layer);
    }
    e.target.value = '';
  };

  const MENUS = [
    {
      label: 'Файл',
      items: [
        { label: 'Новый проект', icon: <Plus size={12} />, shortcut: 'Ctrl+N', onClick: () => { if (confirm('Создать новый проект? Несохранённые изменения будут потеряны.')) newProject(); } },
        { separator: true },
        { label: 'Открыть файл...', icon: <FolderOpen size={12} />, shortcut: 'Ctrl+O', onClick: handleFileOpen },
        { label: 'Открыть проект...', icon: <FolderOpen size={12} />, disabled: true },
        { separator: true },
        { label: 'Сохранить проект', icon: <Save size={12} />, shortcut: 'Ctrl+S', onClick: () => alert('Сохранение в IndexedDB — скоро') },
        { separator: true },
        { label: 'Экспорт изображения...', icon: <ImageIcon size={12} />, shortcut: 'Ctrl+E', onClick: () => window.dispatchEvent(new CustomEvent('open-export')) },
        { label: 'Экспорт видео...', icon: <Film size={12} />, onClick: () => window.dispatchEvent(new CustomEvent('open-export')) },
      ] as MenuItemDef[],
    },
    {
      label: 'Правка',
      items: [
        { label: 'Отменить', icon: <Undo2 size={12} />, shortcut: 'Ctrl+Z', onClick: undo, disabled: !canUndo },
        { label: 'Повторить', icon: <Redo2 size={12} />, shortcut: 'Ctrl+Y', onClick: redo, disabled: !canRedo },
        { separator: true },
        { label: 'Копировать', shortcut: 'Ctrl+C', disabled: true },
        { label: 'Вставить', shortcut: 'Ctrl+V', disabled: true },
        { label: 'Дублировать', shortcut: 'Ctrl+D', onClick: () => { const sel = useProjectStore.getState().selection; if (sel[0]) useProjectStore.getState().duplicateLayer(sel[0]); } },
        { separator: true },
        { label: 'Выделить всё', shortcut: 'Ctrl+A', onClick: () => useProjectStore.getState().setSelection(project.layers.map((l) => l.id)) },
        { label: 'Снять выделение', shortcut: 'Escape', onClick: () => useProjectStore.getState().clearSelection() },
      ] as MenuItemDef[],
    },
    {
      label: 'Изображение',
      items: [
        { label: 'Размер холста...', icon: <LayoutGrid size={12} />, onClick: () => { const s = prompt('Размер холста (ш×в):', `${project.canvas.width}x${project.canvas.height}`); if (s) { const [w, h] = s.split(/[x×]/).map(Number); if (w && h) setCanvasSize({ width: w, height: h }); } } },
        { label: 'Цвет фона...', onClick: () => { const c = prompt('Цвет фона (hex):', project.backgroundColor); if (c) useProjectStore.getState().setBackgroundColor(c); } },
        { separator: true },
        { label: 'Свести слои', onClick: () => useProjectStore.getState().flattenAll() },
      ] as MenuItemDef[],
    },
    {
      label: 'Просмотр',
      items: [
        { label: 'Увеличить', icon: <ZoomIn size={12} />, shortcut: 'Ctrl++', onClick: zoomIn },
        { label: 'Уменьшить', icon: <ZoomOut size={12} />, shortcut: 'Ctrl+-', onClick: zoomOut },
        { label: 'Под экран', shortcut: 'Ctrl+0', onClick: zoomFit },
        { label: '100%', shortcut: 'Ctrl+1', onClick: () => useEditorStore.getState().setZoom(1) },
        { separator: true },
        { label: 'Линейки', icon: <Ruler size={12} />, shortcut: 'Ctrl+R', onClick: toggleRulers },
        { label: 'Сетка', icon: <Grid3x3 size={12} />, shortcut: "Ctrl+'", onClick: toggleGrid },
      ] as MenuItemDef[],
    },
  ];

  return (
    <header className="flex items-center h-8 toolbar-bg border-b panel-border px-2 gap-1 shrink-0 no-select">
      {/* App logo */}
      <div className="flex items-center gap-1.5 mr-2">
        <div className="w-5 h-5 bg-primary rounded-sm flex items-center justify-center shrink-0">
          <Film size={11} className="text-white" />
        </div>
      </div>

      {/* Menus */}
      {MENUS.map((m) => (
        <Menu key={m.label} label={m.label} items={m.items} />
      ))}

      <div className="flex-1" />

      {/* Center: Project name editable */}
      <input
        type="text"
        value={project.name}
        onChange={(e) => setProjectName(e.target.value)}
        className="bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-0.5 text-xs text-foreground text-center outline-none transition-colors max-w-48"
      />

      <div className="flex-1" />

      {/* Quick actions */}
      <div className="flex items-center gap-0.5">
        <button onClick={undo} disabled={!canUndo} title="Отменить (Ctrl+Z)"
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-foreground disabled:opacity-30">
          <Undo2 size={13} />
        </button>
        <button onClick={redo} disabled={!canRedo} title="Повторить (Ctrl+Y)"
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-foreground disabled:opacity-30">
          <Redo2 size={13} />
        </button>

        <div className="w-px h-4 bg-border mx-1" />

        {/* Zoom */}
        <div className="flex items-center gap-0.5 bg-black/20 rounded px-1.5 py-0.5">
          <button onClick={zoomOut} className="text-muted-foreground hover:text-foreground"><ZoomOut size={12} /></button>
          <button onClick={zoomFit} className="text-[11px] font-mono text-foreground hover:text-primary w-10 text-center">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={zoomIn} className="text-muted-foreground hover:text-foreground"><ZoomIn size={12} /></button>
        </div>

        {/* Canvas size pill */}
        <div className="flex items-center gap-1 bg-black/20 rounded px-2 py-0.5 ml-1">
          <LayoutGrid size={10} className="text-muted-foreground" />
          <span className="text-[11px] font-mono text-muted-foreground">{project.canvas.width}×{project.canvas.height}</span>
        </div>
      </div>

      <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="sr-only" onChange={handleFileSelect} />
    </header>
  );
}
