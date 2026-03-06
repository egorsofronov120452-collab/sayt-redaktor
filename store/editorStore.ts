'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { ToolType, PanelId } from './types';

export interface BrushSettings {
  size: number;
  hardness: number;       // 0–100
  opacity: number;        // 0–1
  flow: number;           // 0–1
  spacing: number;        // 0–100
  roundness: number;      // 0–100
  angle: number;
  color: string;
  mode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'erase';
}

export interface EraserSettings {
  size: number;
  hardness: number;
  opacity: number;
}

export interface CloneStampSettings {
  size: number;
  hardness: number;
  opacity: number;
  sourcePoint: { x: number; y: number } | null;
}

export interface ShapeToolSettings {
  shapeType: 'rect' | 'circle' | 'line' | 'arrow' | 'polygon' | 'star' | 'triangle';
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius: number;
  sides: number;        // for polygon
  strokeDash: number[]; // for dashed line
}

export interface TextToolSettings {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  color: string;
  lineHeight: number;
  letterSpacing: number;
}

export interface BlurToolSettings {
  type: 'gaussian' | 'motion' | 'radial';
  radius: number;
  angle: number;
  strength: number;
}

export interface CropSettings {
  ratio: string;         // 'free', '16:9', '4:3', '1:1', '9:16', 'custom'
  customWidth: number;
  customHeight: number;
  active: boolean;
  bounds: { x: number; y: number; width: number; height: number } | null;
}

interface EditorState {
  activeTool: ToolType;
  activeColor: string;
  secondaryColor: string;
  zoom: number;
  panX: number;
  panY: number;
  showRulers: boolean;
  showGrid: boolean;
  showGuides: boolean;
  snapToGrid: boolean;
  snapToLayers: boolean;
  gridSize: number;
  openPanels: PanelId[];
  timelinePlaying: boolean;
  currentTime: number;  // ms
  timelineScale: number; // px per ms
  brushSettings: BrushSettings;
  eraserSettings: EraserSettings;
  cloneSettings: CloneStampSettings;
  shapeSettings: ShapeToolSettings;
  textSettings: TextToolSettings;
  blurToolSettings: BlurToolSettings;
  cropSettings: CropSettings;
  isCropActive: boolean;
  screenMode: 'editor' | 'fullscreen-preview';

  // Actions
  setActiveTool: (tool: ToolType) => void;
  setColor: (primary: string, secondary?: string) => void;
  swapColors: () => void;
  setZoom: (z: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
  setPan: (x: number, y: number) => void;
  togglePanel: (panel: PanelId) => void;
  openPanel: (panel: PanelId) => void;
  closePanel: (panel: PanelId) => void;
  toggleRulers: () => void;
  toggleGrid: () => void;
  toggleGuides: () => void;
  toggleSnapToGrid: () => void;
  setGridSize: (size: number) => void;
  setPlaying: (v: boolean) => void;
  setCurrentTime: (ms: number) => void;
  setTimelineScale: (s: number) => void;
  updateBrush: (p: Partial<BrushSettings>) => void;
  updateEraser: (p: Partial<EraserSettings>) => void;
  updateClone: (p: Partial<CloneStampSettings>) => void;
  updateShape: (p: Partial<ShapeToolSettings>) => void;
  updateText: (p: Partial<TextToolSettings>) => void;
  updateBlurTool: (p: Partial<BlurToolSettings>) => void;
  updateCrop: (p: Partial<CropSettings>) => void;
  setScreenMode: (m: EditorState['screenMode']) => void;
}

const ZOOM_STEPS = [0.05, 0.1, 0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 32];

export const useEditorStore = create<EditorState>()(
  immer((set, get) => ({
    activeTool: 'select',
    activeColor: '#4d9bff',
    secondaryColor: '#ffffff',
    zoom: 1,
    panX: 0,
    panY: 0,
    showRulers: true,
    showGrid: false,
    showGuides: true,
    snapToGrid: false,
    snapToLayers: true,
    gridSize: 20,
    openPanels: ['layers', 'properties', 'timeline'],
    timelinePlaying: false,
    currentTime: 0,
    timelineScale: 0.05, // 0.05 px per ms → 1000px per 20s
    screenMode: 'editor',
    brushSettings: {
      size: 20, hardness: 80, opacity: 1, flow: 1,
      spacing: 10, roundness: 100, angle: 0,
      color: '#4d9bff', mode: 'normal',
    },
    eraserSettings: { size: 20, hardness: 50, opacity: 1 },
    cloneSettings: { size: 30, hardness: 80, opacity: 1, sourcePoint: null },
    shapeSettings: {
      shapeType: 'rect',
      fillColor: '#4d9bff',
      strokeColor: '#ffffff',
      strokeWidth: 0,
      cornerRadius: 0,
      sides: 6,
      strokeDash: [],
    },
    textSettings: {
      fontFamily: 'Inter',
      fontSize: 48,
      fontWeight: '700',
      fontStyle: 'normal',
      textAlign: 'left',
      color: '#ffffff',
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    blurToolSettings: { type: 'gaussian', radius: 5, angle: 0, strength: 50 },
    cropSettings: {
      ratio: 'free', customWidth: 1920, customHeight: 1080,
      active: false, bounds: null,
    },
    isCropActive: false,

    setActiveTool: (tool) => {
      set((s) => { s.activeTool = tool; });
    },

    setColor: (primary, secondary) => {
      set((s) => {
        s.activeColor = primary;
        if (secondary !== undefined) s.secondaryColor = secondary;
      });
    },

    swapColors: () => {
      set((s) => {
        const tmp = s.activeColor;
        s.activeColor = s.secondaryColor;
        s.secondaryColor = tmp;
      });
    },

    setZoom: (z) => {
      set((s) => { s.zoom = Math.min(Math.max(z, 0.02), 32); });
    },

    zoomIn: () => {
      const z = get().zoom;
      const next = ZOOM_STEPS.find((s) => s > z) ?? 32;
      get().setZoom(next);
    },

    zoomOut: () => {
      const z = get().zoom;
      const prev = [...ZOOM_STEPS].reverse().find((s) => s < z) ?? 0.05;
      get().setZoom(prev);
    },

    zoomFit: () => {
      set((s) => { s.zoom = 1; s.panX = 0; s.panY = 0; });
    },

    setPan: (x, y) => {
      set((s) => { s.panX = x; s.panY = y; });
    },

    togglePanel: (panel) => {
      set((s) => {
        const idx = s.openPanels.indexOf(panel);
        if (idx >= 0) s.openPanels.splice(idx, 1);
        else s.openPanels.push(panel);
      });
    },

    openPanel: (panel) => {
      set((s) => {
        if (!s.openPanels.includes(panel)) s.openPanels.push(panel);
      });
    },

    closePanel: (panel) => {
      set((s) => {
        s.openPanels = s.openPanels.filter((p) => p !== panel);
      });
    },

    toggleRulers: () => set((s) => { s.showRulers = !s.showRulers; }),
    toggleGrid: () => set((s) => { s.showGrid = !s.showGrid; }),
    toggleGuides: () => set((s) => { s.showGuides = !s.showGuides; }),
    toggleSnapToGrid: () => set((s) => { s.snapToGrid = !s.snapToGrid; }),

    setGridSize: (size) => set((s) => { s.gridSize = size; }),

    setPlaying: (v) => set((s) => { s.timelinePlaying = v; }),

    setCurrentTime: (ms) => set((s) => { s.currentTime = Math.max(0, ms); }),

    setTimelineScale: (sc) => set((s) => { s.timelineScale = sc; }),

    updateBrush: (p) => set((s) => { Object.assign(s.brushSettings, p); }),
    updateEraser: (p) => set((s) => { Object.assign(s.eraserSettings, p); }),
    updateClone: (p) => set((s) => { Object.assign(s.cloneSettings, p); }),
    updateShape: (p) => set((s) => { Object.assign(s.shapeSettings, p); }),
    updateText: (p) => set((s) => { Object.assign(s.textSettings, p); }),
    updateBlurTool: (p) => set((s) => { Object.assign(s.blurToolSettings, p); }),
    updateCrop: (p) => set((s) => { Object.assign(s.cropSettings, p); }),

    setScreenMode: (m) => set((s) => { s.screenMode = m; }),
  }))
);
