'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';
import type {
  Project, Layer, LayerAnimation, CanvasSize,
  ExportSettings, HistoryEntry, ExportFormat, BlendMode, LayerType
} from './types';

const DEFAULT_EFFECTS = (): Layer['effects'] => ({
  dropShadow: { enabled: false, offsetX: 4, offsetY: 4, blur: 8, spread: 0, color: '#000000', opacity: 0.5 },
  innerShadow: { enabled: false, offsetX: 2, offsetY: 2, blur: 4, spread: 0, color: '#000000', opacity: 0.3 },
  outerGlow: { enabled: false, color: '#ffffff', blur: 10, opacity: 0.5, inner: false },
  innerGlow: { enabled: false, color: '#ffffff', blur: 5, opacity: 0.3, inner: true },
  blur: null,
  colorOverlay: null,
  stroke: null,
  bevelEmboss: null,
});

const DEFAULT_ADJUSTMENTS = (): NonNullable<Layer['adjustments']> => ({
  brightness: 0, contrast: 0, saturation: 0, hue: 0, exposure: 0,
  highlights: 0, shadows: 0, whites: 0, blacks: 0, vibrance: 0,
  temperature: 0, tint: 0, sharpness: 0, clarity: 0, dehaze: 0, vignette: 0,
});

function createDefaultProject(): Project {
  return {
    id: nanoid(),
    name: 'Новый проект',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    canvas: { width: 1920, height: 1080, name: '1920×1080 Full HD' },
    duration: 10000, // 10s
    backgroundColor: '#1a1a1f',
    layers: [],
    animations: [],
    guides: [],
  };
}

export function createLayer(partial: Partial<Layer> & { type: LayerType }): Layer {
  return {
    id: nanoid(),
    name: 'Слой',
    type: partial.type,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal' as BlendMode,
    x: 0, y: 0,
    width: 200, height: 200,
    rotation: 0, scaleX: 1, scaleY: 1,
    flipX: false, flipY: false,
    effects: DEFAULT_EFFECTS(),
    adjustments: DEFAULT_ADJUSTMENTS(),
    parentId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
}

interface ProjectState {
  project: Project;
  history: HistoryEntry[];
  historyIndex: number;
  selection: string[];
  exportSettings: ExportSettings;
  canUndo: boolean;
  canRedo: boolean;

  // Project actions
  newProject: (canvas?: CanvasSize) => void;
  loadProject: (p: Project) => void;
  setProjectName: (name: string) => void;
  setCanvasSize: (size: CanvasSize) => void;
  setBackgroundColor: (color: string) => void;
  setDuration: (ms: number) => void;

  // Layer actions
  addLayer: (layer: Layer) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  reorderLayers: (ids: string[]) => void;
  groupLayers: (ids: string[], name?: string) => void;
  ungroupLayer: (id: string) => void;
  mergeDown: (id: string) => void;
  flattenAll: () => void;

  // Selection
  setSelection: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;

  // Animation
  addAnimation: (anim: LayerAnimation) => void;
  updateAnimation: (layerId: string, patch: Partial<LayerAnimation>) => void;
  removeAnimation: (layerId: string) => void;

  // History
  pushHistory: (label: string) => void;
  undo: () => void;
  redo: () => void;

  // Export
  setExportSettings: (s: Partial<ExportSettings>) => void;
}

export const useProjectStore = create<ProjectState>()(
  immer((set, get) => ({
    project: createDefaultProject(),
    history: [],
    historyIndex: -1,
    selection: [],
    canUndo: false,
    canRedo: false,
    exportSettings: {
      format: 'png' as ExportFormat,
      quality: 95,
      width: 1920,
      height: 1080,
      fps: 30,
      includeAudio: true,
      transparent: false,
      loop: 'infinite',
      startTime: 0,
      endTime: 10000,
    },

    newProject: (canvas) => {
      set((s) => {
        s.project = createDefaultProject();
        if (canvas) s.project.canvas = canvas;
        s.history = [];
        s.historyIndex = -1;
        s.selection = [];
        s.canUndo = false;
        s.canRedo = false;
      });
    },

    loadProject: (p) => {
      set((s) => {
        s.project = p;
        s.history = [];
        s.historyIndex = -1;
        s.selection = [];
      });
    },

    setProjectName: (name) => {
      set((s) => { s.project.name = name; s.project.updatedAt = Date.now(); });
    },

    setCanvasSize: (size) => {
      get().pushHistory('Изменить размер холста');
      set((s) => { s.project.canvas = size; });
    },

    setBackgroundColor: (color) => {
      get().pushHistory('Цвет фона');
      set((s) => { s.project.backgroundColor = color; });
    },

    setDuration: (ms) => {
      set((s) => { s.project.duration = ms; });
    },

    addLayer: (layer) => {
      get().pushHistory(`Добавить слой: ${layer.name}`);
      set((s) => {
        s.project.layers.unshift(layer);
        s.selection = [layer.id];
        s.project.updatedAt = Date.now();
      });
    },

    removeLayer: (id) => {
      get().pushHistory('Удалить слой');
      set((s) => {
        s.project.layers = s.project.layers.filter((l) => l.id !== id);
        s.selection = s.selection.filter((sid) => sid !== id);
        s.project.updatedAt = Date.now();
      });
    },

    duplicateLayer: (id) => {
      const layer = get().project.layers.find((l) => l.id === id);
      if (!layer) return;
      get().pushHistory('Дублировать слой');
      const copy: Layer = { ...JSON.parse(JSON.stringify(layer)), id: nanoid(), name: layer.name + ' копия', x: layer.x + 20, y: layer.y + 20, createdAt: Date.now(), updatedAt: Date.now() };
      set((s) => {
        const idx = s.project.layers.findIndex((l) => l.id === id);
        s.project.layers.splice(idx, 0, copy);
        s.selection = [copy.id];
      });
    },

    updateLayer: (id, patch) => {
      set((s) => {
        const layer = s.project.layers.find((l) => l.id === id);
        if (layer) {
          Object.assign(layer, patch, { updatedAt: Date.now() });
          s.project.updatedAt = Date.now();
        }
      });
    },

    reorderLayers: (ids) => {
      set((s) => {
        const map = new Map(s.project.layers.map((l) => [l.id, l]));
        s.project.layers = ids.map((id) => map.get(id)!).filter(Boolean);
      });
    },

    groupLayers: (ids, name = 'Группа') => {
      if (ids.length < 2) return;
      get().pushHistory('Сгруппировать слои');
      const groupId = nanoid();
      set((s) => {
        const group = createLayer({ id: groupId, type: 'group', name, children: ids });
        const firstIdx = Math.min(...ids.map((id) => s.project.layers.findIndex((l) => l.id === id)));
        ids.forEach((id) => {
          const l = s.project.layers.find((ll) => ll.id === id);
          if (l) l.parentId = groupId;
        });
        s.project.layers.splice(firstIdx, 0, group);
      });
    },

    ungroupLayer: (id) => {
      get().pushHistory('Разгруппировать');
      set((s) => {
        const group = s.project.layers.find((l) => l.id === id && l.type === 'group');
        if (!group) return;
        s.project.layers.forEach((l) => { if (l.parentId === id) l.parentId = null; });
        s.project.layers = s.project.layers.filter((l) => l.id !== id);
      });
    },

    mergeDown: (id) => {
      get().pushHistory('Объединить вниз');
      // Stub — actual pixel merging done in canvas engine
      set((s) => { s.project.updatedAt = Date.now(); });
    },

    flattenAll: () => {
      get().pushHistory('Свести слои');
      set((s) => { s.project.updatedAt = Date.now(); });
    },

    setSelection: (ids) => {
      set((s) => { s.selection = ids; });
    },

    toggleSelection: (id) => {
      set((s) => {
        const idx = s.selection.indexOf(id);
        if (idx >= 0) s.selection.splice(idx, 1);
        else s.selection.push(id);
      });
    },

    clearSelection: () => {
      set((s) => { s.selection = []; });
    },

    addAnimation: (anim) => {
      set((s) => {
        const idx = s.project.animations.findIndex((a) => a.layerId === anim.layerId);
        if (idx >= 0) s.project.animations[idx] = anim;
        else s.project.animations.push(anim);
      });
    },

    updateAnimation: (layerId, patch) => {
      set((s) => {
        const anim = s.project.animations.find((a) => a.layerId === layerId);
        if (anim) Object.assign(anim, patch);
      });
    },

    removeAnimation: (layerId) => {
      set((s) => {
        s.project.animations = s.project.animations.filter((a) => a.layerId !== layerId);
      });
    },

    pushHistory: (label) => {
      const { project, history, historyIndex } = get();
      const entry: HistoryEntry = {
        id: nanoid(),
        label,
        timestamp: Date.now(),
        projectSnapshot: JSON.parse(JSON.stringify(project)),
      };
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(entry);
      const trimmed = newHistory.slice(-100);
      set((s) => {
        s.history = trimmed;
        s.historyIndex = trimmed.length - 1;
        s.canUndo = trimmed.length > 0;
        s.canRedo = false;
      });
    },

    undo: () => {
      const { history, historyIndex } = get();
      if (historyIndex <= 0) return;
      const entry = history[historyIndex - 1];
      set((s) => {
        s.project = { ...s.project, ...entry.projectSnapshot } as Project;
        s.historyIndex = historyIndex - 1;
        s.canUndo = historyIndex - 1 > 0;
        s.canRedo = true;
      });
    },

    redo: () => {
      const { history, historyIndex } = get();
      if (historyIndex >= history.length - 1) return;
      const entry = history[historyIndex + 1];
      set((s) => {
        s.project = { ...s.project, ...entry.projectSnapshot } as Project;
        s.historyIndex = historyIndex + 1;
        s.canUndo = true;
        s.canRedo = historyIndex + 1 < history.length - 1;
      });
    },

    setExportSettings: (settings) => {
      set((s) => { Object.assign(s.exportSettings, settings); });
    },
  }))
);
