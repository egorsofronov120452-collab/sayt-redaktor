'use client';

import { useState, useRef, useCallback } from 'react';
import { useProjectStore, createLayer } from '@/store/projectStore';
import { useEditorStore } from '@/store/editorStore';
import type { Layer, BlendMode } from '@/store/types';
import {
  Eye, EyeOff, Lock, LockOpen, Trash2, Copy, ChevronDown, ChevronRight,
  Plus, Layers, Image as ImageIcon, Type, Square, Film, FolderOpen,
  MoveUp, MoveDown, Merge, Group, SlidersHorizontal, Palette,
} from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Нормальный' },
  { value: 'multiply', label: 'Умножение' },
  { value: 'screen', label: 'Осветление' },
  { value: 'overlay', label: 'Перекрытие' },
  { value: 'darken', label: 'Затемнение' },
  { value: 'lighten', label: 'Осветление цвета' },
  { value: 'color-dodge', label: 'Осветл. основы' },
  { value: 'color-burn', label: 'Затемн. основы' },
  { value: 'hard-light', label: 'Жёсткий свет' },
  { value: 'soft-light', label: 'Мягкий свет' },
  { value: 'difference', label: 'Разница' },
  { value: 'exclusion', label: 'Исключение' },
  { value: 'hue', label: 'Тон' },
  { value: 'saturation', label: 'Насыщенность' },
  { value: 'color', label: 'Цвет' },
  { value: 'luminosity', label: 'Яркость' },
];

function LayerIcon({ type }: { type: Layer['type'] }) {
  const cls = 'w-3.5 h-3.5 shrink-0';
  switch (type) {
    case 'image': return <ImageIcon className={cls} />;
    case 'video': return <Film className={cls} />;
    case 'text': return <Type className={cls} />;
    case 'shape': return <Square className={cls} />;
    case 'group': return <FolderOpen className={cls} />;
    case 'adjustment': return <SlidersHorizontal className={cls} />;
    case 'gradient': return <Palette className={cls} />;
    default: return <Layers className={cls} />;
  }
}

function LayerRow({
  layer, depth, isSelected, isExpanded, onSelect, onToggleExpand,
}: {
  layer: Layer;
  depth: number;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: (id: string, multi: boolean) => void;
  onToggleExpand: (id: string) => void;
}) {
  const { updateLayer, removeLayer, duplicateLayer } = useProjectStore();
  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal] = useState(layer.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleVisibility = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateLayer(layer.id, { visible: !layer.visible });
  };
  const handleLock = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateLayer(layer.id, { locked: !layer.locked });
  };
  const handleRename = () => {
    setRenaming(true);
    setTimeout(() => inputRef.current?.select(), 10);
  };
  const commitRename = () => {
    setRenaming(false);
    if (nameVal.trim()) updateLayer(layer.id, { name: nameVal.trim() });
    else setNameVal(layer.name);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-1 px-1 py-0.5 cursor-pointer rounded-sm text-xs group transition-colors',
        'layer-hover select-none',
        isSelected && 'layer-selected',
        !layer.visible && 'opacity-40',
      )}
      style={{ paddingLeft: `${4 + depth * 14}px` }}
      onClick={(e) => onSelect(layer.id, e.shiftKey || e.ctrlKey || e.metaKey)}
      onDoubleClick={handleRename}
    >
      {/* Expand toggle for groups */}
      {layer.type === 'group' ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand(layer.id); }}
          className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </button>
      ) : (
        <div className="w-4" />
      )}

      {/* Visibility */}
      <button onClick={handleVisibility} className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
        {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>

      {/* Layer type icon */}
      <div className="text-muted-foreground"><LayerIcon type={layer.type} /></div>

      {/* Layer thumbnail */}
      <div className="w-7 h-7 rounded-sm border border-border/50 bg-black/20 flex items-center justify-center overflow-hidden shrink-0 transparency-bg">
        {layer.src && layer.type === 'image' ? (
          <img src={layer.src} alt="" className="w-full h-full object-cover" />
        ) : layer.type === 'text' ? (
          <span className="text-[8px] text-foreground font-bold overflow-hidden">T</span>
        ) : layer.type === 'shape' ? (
          <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: layer.fillColor ?? '#4d9bff' }} />
        ) : null}
      </div>

      {/* Layer name */}
      <div className="flex-1 min-w-0 mx-1">
        {renaming ? (
          <input
            ref={inputRef}
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenaming(false); setNameVal(layer.name); } }}
            className="w-full bg-input border border-primary rounded-sm px-1 py-0.5 text-xs text-foreground outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={cn('text-xs truncate block', isSelected ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')}>
            {layer.name}
          </span>
        )}
      </div>

      {/* Lock */}
      <button onClick={handleLock} className="w-5 h-5 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground transition-colors opacity-0 group-hover:opacity-100">
        {layer.locked ? <Lock size={11} /> : <LockOpen size={11} />}
      </button>

      {/* Delete (only on hover, selected row) */}
      {isSelected && (
        <button
          onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }}
          className="w-5 h-5 flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-colors"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}

export default function LayersPanel() {
  const { project, selection, setSelection, toggleSelection, addLayer, removeLayer,
    duplicateLayer, reorderLayers, groupLayers, updateLayer } = useProjectStore();
  const layers = project.layers;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Blend mode and opacity for selected layer
  const selectedLayer = layers.find((l) => l.id === selection[0]);

  const handleSelect = useCallback((id: string, multi: boolean) => {
    if (multi) toggleSelection(id);
    else setSelection([id]);
  }, [setSelection, toggleSelection]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Drag and drop reorder
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverId(id);
  };
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    const ids = layers.map((l) => l.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    const newIds = [...ids];
    newIds.splice(from, 1);
    newIds.splice(to, 0, dragId);
    reorderLayers(newIds);
    setDragId(null);
    setDragOverId(null);
  };

  const addNewLayer = (type: Layer['type']) => {
    const layer = createLayer({
      type,
      name: type === 'text' ? 'Текстовый слой' :
            type === 'shape' ? 'Фигура' :
            type === 'adjustment' ? 'Корректирующий слой' : 'Новый слой',
      x: 100, y: 100,
      width: type === 'text' ? 300 : 200,
      height: type === 'text' ? 60 : 200,
      fillColor: useEditorStore.getState().activeColor,
    });
    addLayer(layer);
  };

  const renderLayers = (parentId: string | null = null, depth = 0): React.ReactNode[] => {
    return layers
      .filter((l) => (l.parentId ?? null) === parentId)
      .map((layer) => {
        const isSelected = selection.includes(layer.id);
        const isExpanded = expanded.has(layer.id);
        const hasChildren = layer.type === 'group' && layers.some((l) => l.parentId === layer.id);
        return (
          <div
            key={layer.id}
            draggable
            onDragStart={(e) => handleDragStart(e, layer.id)}
            onDragOver={(e) => handleDragOver(e, layer.id)}
            onDrop={(e) => handleDrop(e, layer.id)}
            onDragLeave={() => setDragOverId(null)}
            className={cn(dragOverId === layer.id && 'ring-1 ring-primary rounded-sm')}
          >
            <LayerRow
              layer={layer}
              depth={depth}
              isSelected={isSelected}
              isExpanded={isExpanded}
              onSelect={handleSelect}
              onToggleExpand={toggleExpand}
            />
            {hasChildren && isExpanded && renderLayers(layer.id, depth + 1)}
          </div>
        );
      });
  };

  return (
    <div className="flex flex-col h-full panel-bg text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b panel-border panel-header shrink-0">
        <span className="text-xs font-semibold text-foreground tracking-wide uppercase">Слои</span>
        <div className="flex items-center gap-0.5">
          {selection.length > 1 && (
            <button
              title="Сгруппировать"
              onClick={() => groupLayers(selection)}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-foreground"
            >
              <Group size={13} />
            </button>
          )}
          <button
            title="Дублировать слой"
            onClick={() => { if (selection[0]) duplicateLayer(selection[0]); }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-foreground"
          >
            <Copy size={13} />
          </button>
          <button
            title="Удалить слой"
            onClick={() => { if (selection[0]) removeLayer(selection[0]); }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-destructive"
          >
            <Trash2 size={13} />
          </button>
          {/* Add layer dropdown */}
          <AddLayerMenu onAdd={addNewLayer} />
        </div>
      </div>

      {/* Blend mode + Opacity row for selected layer */}
      {selectedLayer && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b panel-border shrink-0">
          <Select
            value={selectedLayer.blendMode}
            onValueChange={(v) => updateLayer(selectedLayer.id, { blendMode: v as BlendMode })}
          >
            <SelectTrigger className="h-6 text-[11px] bg-input border-border flex-1 min-w-0 px-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border max-h-48">
              {BLEND_MODES.map((bm) => (
                <SelectItem key={bm.value} value={bm.value} className="text-xs py-0.5">{bm.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 w-24 shrink-0">
            <span className="text-[10px] text-muted-foreground w-4 shrink-0">Непр.</span>
            <Slider
              value={[Math.round(selectedLayer.opacity * 100)]}
              min={0} max={100} step={1}
              onValueChange={([v]) => updateLayer(selectedLayer.id, { opacity: v / 100 })}
              className="flex-1"
            />
            <span className="text-[10px] text-muted-foreground w-7 text-right">{Math.round(selectedLayer.opacity * 100)}%</span>
          </div>
        </div>
      )}

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto py-1 min-h-0">
        {layers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-8">
            <Layers size={24} className="opacity-30" />
            <p className="text-xs">Слои отсутствуют</p>
            <p className="text-[11px] opacity-60">Перетащите файл или нажмите +</p>
          </div>
        ) : (
          renderLayers()
        )}
      </div>

      {/* Footer stats */}
      <div className="px-2 py-1 border-t panel-border shrink-0 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {layers.length} {layers.length === 1 ? 'слой' : layers.length < 5 ? 'слоя' : 'слоёв'}
        </span>
        {selection.length > 0 && (
          <span className="text-[10px] text-primary">Выбрано: {selection.length}</span>
        )}
      </div>
    </div>
  );
}

function AddLayerMenu({ onAdd }: { onAdd: (type: Layer['type']) => void }) {
  const [open, setOpen] = useState(false);
  const items: { type: Layer['type']; label: string; icon: React.ReactNode }[] = [
    { type: 'shape', label: 'Фигура', icon: <Square size={12} /> },
    { type: 'text', label: 'Текст', icon: <Type size={12} /> },
    { type: 'gradient', label: 'Градиент', icon: <Palette size={12} /> },
    { type: 'adjustment', label: 'Корректирующий', icon: <SlidersHorizontal size={12} /> },
  ];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Добавить слой"
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-foreground"
      >
        <Plus size={13} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-xl z-50 py-1 w-44">
          {items.map((item) => (
            <button
              key={item.type}
              onClick={() => { onAdd(item.type); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 transition-colors"
            >
              <span className="text-muted-foreground">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
