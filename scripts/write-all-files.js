import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

function write(filePath, content) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, 'utf8');
  console.log('wrote:', filePath, '(' + content.length + ' bytes)');
}

const base = '/vercel/share/v0-project';

// ─── store/types.ts ──────────────────────────────────────────────────────────
write(`${base}/store/types.ts`, `
export type LayerType = 'image' | 'video' | 'text' | 'shape' | 'group' | 'adjustment';
export type ExportFormat = 'png' | 'jpeg' | 'gif' | 'mp4' | 'webm';
export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference'
  | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

export type ToolType =
  | 'select' | 'move' | 'brush' | 'eraser' | 'text' | 'shape'
  | 'crop' | 'eyedropper' | 'hand' | 'zoom' | 'pen' | 'lasso';

export interface CanvasSize { width: number; height: number; name?: string; }

export interface KeyframeValue { time: number; value: number | string | { x: number; y: number }; easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bounce'; }

export interface AnimationTrack {
  property: 'opacity' | 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'fillColor';
  keyframes: KeyframeValue[];
}

export interface LayerAnimation {
  layerId: string;
  tracks: AnimationTrack[];
  startTime: number;
  endTime: number;
  preset?: string;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  x: number; y: number;
  width: number; height: number;
  rotation: number; scaleX: number; scaleY: number;
  flipX: boolean; flipY: boolean;
  parentId: string | null;
  children?: string[];
  // Image/Video
  src?: string;
  videoStart?: number; videoEnd?: number;
  // Text
  text?: string;
  fontFamily?: string; fontSize?: number; fontWeight?: string | number;
  fontStyle?: string; textAlign?: string; lineHeight?: number;
  letterSpacing?: number;
  // Shape
  shapeType?: string;
  fillColor?: string; strokeColor?: string; strokeWidth?: number;
  cornerRadius?: number;
  // Adjustments
  adjustments?: {
    brightness: number; contrast: number; saturation: number; hue: number;
    exposure: number; highlights: number; shadows: number; whites: number;
    blacks: number; vibrance: number; temperature: number; tint: number;
    sharpness: number; clarity: number; dehaze: number; vignette: number;
  };
  effects?: {
    dropShadow: { enabled: boolean; offsetX: number; offsetY: number; blur: number; spread: number; color: string; opacity: number };
    innerShadow: { enabled: boolean; offsetX: number; offsetY: number; blur: number; spread: number; color: string; opacity: number };
    outerGlow: { enabled: boolean; color: string; blur: number; opacity: number; inner: boolean };
    innerGlow: { enabled: boolean; color: string; blur: number; opacity: number; inner: boolean };
    blur: null | { radius: number; type: 'gaussian' | 'motion' };
    colorOverlay: null | { color: string; opacity: number };
    stroke: null | { color: string; width: number; position: 'inside' | 'outside' | 'center' };
    bevelEmboss: null;
  };
  createdAt: number; updatedAt: number;
}

export interface Guide { id: string; orientation: 'vertical' | 'horizontal'; position: number; }

export interface Project {
  id: string; name: string;
  createdAt: number; updatedAt: number;
  canvas: CanvasSize;
  duration: number;
  backgroundColor: string;
  layers: Layer[];
  animations: LayerAnimation[];
  guides: Guide[];
}

export interface HistoryEntry { id: string; label: string; timestamp: number; projectSnapshot: Project; }

export interface ExportSettings {
  format: ExportFormat; quality: number; width: number; height: number;
  fps: number; includeAudio: boolean; transparent: boolean;
  loop: 'once' | 'infinite' | '3'; startTime: number; endTime: number;
}
`.trimStart());

// ─── store/projectStore.ts ────────────────────────────────────────────────────
write(`${base}/store/projectStore.ts`, `'use client';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';
import type { Project, Layer, LayerAnimation, CanvasSize, ExportSettings, HistoryEntry, ExportFormat, BlendMode, LayerType } from './types';

const DEFAULT_EFFECTS = (): NonNullable<Layer['effects']> => ({
  dropShadow: { enabled: false, offsetX: 4, offsetY: 4, blur: 8, spread: 0, color: '#000000', opacity: 0.5 },
  innerShadow: { enabled: false, offsetX: 2, offsetY: 2, blur: 4, spread: 0, color: '#000000', opacity: 0.3 },
  outerGlow: { enabled: false, color: '#ffffff', blur: 10, opacity: 0.5, inner: false },
  innerGlow: { enabled: false, color: '#ffffff', blur: 5, opacity: 0.3, inner: true },
  blur: null, colorOverlay: null, stroke: null, bevelEmboss: null,
});

const DEFAULT_ADJ = (): NonNullable<Layer['adjustments']> => ({
  brightness: 0, contrast: 0, saturation: 0, hue: 0, exposure: 0,
  highlights: 0, shadows: 0, whites: 0, blacks: 0, vibrance: 0,
  temperature: 0, tint: 0, sharpness: 0, clarity: 0, dehaze: 0, vignette: 0,
});

function defaultProject(): Project {
  return { id: nanoid(), name: 'Новый проект', createdAt: Date.now(), updatedAt: Date.now(), canvas: { width: 1920, height: 1080, name: '1920×1080 Full HD' }, duration: 10000, backgroundColor: '#1a1a1f', layers: [], animations: [], guides: [] };
}

export function createLayer(partial: Partial<Layer> & { type: LayerType }): Layer {
  return { id: nanoid(), name: 'Слой', type: partial.type, visible: true, locked: false, opacity: 1, blendMode: 'normal' as BlendMode, x: 0, y: 0, width: 200, height: 200, rotation: 0, scaleX: 1, scaleY: 1, flipX: false, flipY: false, effects: DEFAULT_EFFECTS(), adjustments: DEFAULT_ADJ(), parentId: null, createdAt: Date.now(), updatedAt: Date.now(), ...partial };
}

interface ProjectState {
  project: Project; history: HistoryEntry[]; historyIndex: number; selection: string[]; exportSettings: ExportSettings; canUndo: boolean; canRedo: boolean;
  newProject: (canvas?: Partial<CanvasSize> & { name?: string }) => void;
  loadProject: (p: Project) => void;
  setProjectName: (name: string) => void;
  setCanvasSize: (size: CanvasSize) => void;
  setBackgroundColor: (color: string) => void;
  setDuration: (ms: number) => void;
  addLayer: (layer: Layer) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  reorderLayers: (ids: string[]) => void;
  groupLayers: (ids: string[], name?: string) => void;
  ungroupLayer: (id: string) => void;
  setSelection: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  addAnimation: (anim: LayerAnimation) => void;
  updateAnimation: (layerId: string, patch: Partial<LayerAnimation>) => void;
  removeAnimation: (layerId: string) => void;
  pushHistory: (label: string) => void;
  undo: () => void;
  redo: () => void;
  setExportSettings: (s: Partial<ExportSettings>) => void;
}

export const useProjectStore = create<ProjectState>()(
  immer((set, get) => ({
    project: defaultProject(), history: [], historyIndex: -1, selection: [], canUndo: false, canRedo: false,
    exportSettings: { format: 'png' as ExportFormat, quality: 95, width: 1920, height: 1080, fps: 30, includeAudio: true, transparent: false, loop: 'infinite', startTime: 0, endTime: 10000 },
    newProject: (canvas) => { set((s) => { s.project = defaultProject(); if (canvas) { if (canvas.width) s.project.canvas.width = canvas.width; if (canvas.height) s.project.canvas.height = canvas.height; if (canvas.name) s.project.canvas.name = canvas.name; } s.history = []; s.historyIndex = -1; s.selection = []; s.canUndo = false; s.canRedo = false; }); },
    loadProject: (p) => { set((s) => { s.project = p; s.history = []; s.historyIndex = -1; s.selection = []; }); },
    setProjectName: (name) => { set((s) => { s.project.name = name; }); },
    setCanvasSize: (size) => { get().pushHistory('Изменить размер холста'); set((s) => { s.project.canvas = size; }); },
    setBackgroundColor: (color) => { get().pushHistory('Цвет фона'); set((s) => { s.project.backgroundColor = color; }); },
    setDuration: (ms) => { set((s) => { s.project.duration = ms; }); },
    addLayer: (layer) => { set((s) => { s.project.layers.unshift(layer); s.selection = [layer.id]; s.project.updatedAt = Date.now(); }); },
    removeLayer: (id) => { get().pushHistory('Удалить слой'); set((s) => { s.project.layers = s.project.layers.filter((l) => l.id !== id); s.selection = s.selection.filter((sid) => sid !== id); }); },
    duplicateLayer: (id) => {
      const layer = get().project.layers.find((l) => l.id === id);
      if (!layer) return;
      get().pushHistory('Дублировать слой');
      const copy: Layer = { ...JSON.parse(JSON.stringify(layer)), id: nanoid(), name: layer.name + ' копия', x: layer.x + 20, y: layer.y + 20, createdAt: Date.now(), updatedAt: Date.now() };
      set((s) => { const idx = s.project.layers.findIndex((l) => l.id === id); s.project.layers.splice(idx, 0, copy); s.selection = [copy.id]; });
    },
    updateLayer: (id, patch) => { set((s) => { const l = s.project.layers.find((l) => l.id === id); if (l) Object.assign(l, patch, { updatedAt: Date.now() }); }); },
    reorderLayers: (ids) => { set((s) => { const map = new Map(s.project.layers.map((l) => [l.id, l])); s.project.layers = ids.map((id) => map.get(id)!).filter(Boolean); }); },
    groupLayers: (ids, name = 'Группа') => { if (ids.length < 2) return; get().pushHistory('Сгруппировать'); const gid = nanoid(); set((s) => { const group = createLayer({ id: gid, type: 'group', name, children: ids }); const fi = Math.min(...ids.map((id) => s.project.layers.findIndex((l) => l.id === id))); ids.forEach((id) => { const l = s.project.layers.find((ll) => ll.id === id); if (l) l.parentId = gid; }); s.project.layers.splice(fi, 0, group); }); },
    ungroupLayer: (id) => { get().pushHistory('Разгруппировать'); set((s) => { s.project.layers.forEach((l) => { if (l.parentId === id) l.parentId = null; }); s.project.layers = s.project.layers.filter((l) => l.id !== id); }); },
    setSelection: (ids) => { set((s) => { s.selection = ids; }); },
    toggleSelection: (id) => { set((s) => { const i = s.selection.indexOf(id); if (i >= 0) s.selection.splice(i, 1); else s.selection.push(id); }); },
    clearSelection: () => { set((s) => { s.selection = []; }); },
    addAnimation: (anim) => { set((s) => { const i = s.project.animations.findIndex((a) => a.layerId === anim.layerId); if (i >= 0) s.project.animations[i] = anim; else s.project.animations.push(anim); }); },
    updateAnimation: (layerId, patch) => { set((s) => { const a = s.project.animations.find((a) => a.layerId === layerId); if (a) Object.assign(a, patch); }); },
    removeAnimation: (layerId) => { set((s) => { s.project.animations = s.project.animations.filter((a) => a.layerId !== layerId); }); },
    pushHistory: (label) => {
      const { project, history, historyIndex } = get();
      const entry: HistoryEntry = { id: nanoid(), label, timestamp: Date.now(), projectSnapshot: JSON.parse(JSON.stringify(project)) };
      const h = history.slice(0, historyIndex + 1);
      h.push(entry);
      const trimmed = h.slice(-100);
      set((s) => { s.history = trimmed; s.historyIndex = trimmed.length - 1; s.canUndo = trimmed.length > 0; s.canRedo = false; });
    },
    undo: () => {
      const { history, historyIndex } = get();
      if (historyIndex <= 0) return;
      const entry = history[historyIndex - 1];
      set((s) => { s.project = { ...s.project, ...entry.projectSnapshot }; s.historyIndex = historyIndex - 1; s.canUndo = historyIndex - 1 > 0; s.canRedo = true; });
    },
    redo: () => {
      const { history, historyIndex } = get();
      if (historyIndex >= history.length - 1) return;
      const entry = history[historyIndex + 1];
      set((s) => { s.project = { ...s.project, ...entry.projectSnapshot }; s.historyIndex = historyIndex + 1; s.canUndo = true; s.canRedo = historyIndex + 1 < history.length - 1; });
    },
    setExportSettings: (settings) => { set((s) => { Object.assign(s.exportSettings, settings); }); },
  }))
);
`);

// ─── store/editorStore.ts ─────────────────────────────────────────────────────
write(`${base}/store/editorStore.ts`, `'use client';
import { create } from 'zustand';
import type { ToolType } from './types';

interface BrushSettings { color: string; size: number; opacity: number; hardness: number; flow: number; mode: string; }
interface EraserSettings { size: number; hardness: number; }
interface ShapeSettings { shapeType: 'rect' | 'circle' | 'line' | 'arrow' | 'polygon'; fillColor: string; strokeColor: string; strokeWidth: number; cornerRadius: number; }
interface TextSettings { fontFamily: string; fontSize: number; fontWeight: string; fontStyle: string; textAlign: string; color: string; lineHeight: number; letterSpacing: number; }

interface EditorState {
  activeTool: ToolType;
  zoom: number; panX: number; panY: number;
  activeColor: string; secondaryColor: string;
  showGrid: boolean; gridSize: number; snapToGrid: boolean;
  showRulers: boolean; showGuides: boolean;
  currentTime: number; timelinePlaying: boolean;
  openPanels: Record<string, boolean>;
  brushSettings: BrushSettings;
  eraserSettings: EraserSettings;
  shapeSettings: ShapeSettings;
  textSettings: TextSettings;
  setActiveTool: (t: ToolType) => void;
  setZoom: (z: number) => void;
  setPan: (x: number, y: number) => void;
  setColor: (c: string) => void;
  setSecondaryColor: (c: string) => void;
  toggleGrid: () => void; setGridSize: (n: number) => void;
  toggleRulers: () => void; toggleGuides: () => void;
  setCurrentTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  togglePanel: (name: string) => void;
  setBrushSettings: (p: Partial<BrushSettings>) => void;
  setEraserSettings: (p: Partial<EraserSettings>) => void;
  setShapeSettings: (p: Partial<ShapeSettings>) => void;
  setTextSettings: (p: Partial<TextSettings>) => void;
}

export const useEditorStore = create<EditorState>()((set) => ({
  activeTool: 'select', zoom: 1, panX: 0, panY: 0,
  activeColor: '#4d9bff', secondaryColor: '#ffffff',
  showGrid: false, gridSize: 50, snapToGrid: false,
  showRulers: false, showGuides: true,
  currentTime: 0, timelinePlaying: false,
  openPanels: { layers: true, properties: true, timeline: true },
  brushSettings: { color: '#4d9bff', size: 15, opacity: 1, hardness: 0.8, flow: 1, mode: 'normal' },
  eraserSettings: { size: 20, hardness: 0.9 },
  shapeSettings: { shapeType: 'rect', fillColor: '#4d9bff', strokeColor: '#ffffff', strokeWidth: 0, cornerRadius: 0 },
  textSettings: { fontFamily: 'Inter', fontSize: 48, fontWeight: '700', fontStyle: 'normal', textAlign: 'left', color: '#ffffff', lineHeight: 1.2, letterSpacing: 0 },
  setActiveTool: (t) => set({ activeTool: t }),
  setZoom: (z) => set({ zoom: z }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  setColor: (c) => set({ activeColor: c }),
  setSecondaryColor: (c) => set({ secondaryColor: c }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  setGridSize: (n) => set({ gridSize: n }),
  toggleRulers: () => set((s) => ({ showRulers: !s.showRulers })),
  toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),
  setCurrentTime: (t) => set({ currentTime: t }),
  setPlaying: (p) => set({ timelinePlaying: p }),
  togglePanel: (name) => set((s) => ({ openPanels: { ...s.openPanels, [name]: !s.openPanels[name] } })),
  setBrushSettings: (p) => set((s) => ({ brushSettings: { ...s.brushSettings, ...p } })),
  setEraserSettings: (p) => set((s) => ({ eraserSettings: { ...s.eraserSettings, ...p } })),
  setShapeSettings: (p) => set((s) => ({ shapeSettings: { ...s.shapeSettings, ...p } })),
  setTextSettings: (p) => set((s) => ({ textSettings: { ...s.textSettings, ...p } })),
}));
`);

console.log('All store files written!');
