// =============================================
// Core Types for MotionCraft Editor
// =============================================

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'hard-light' | 'soft-light' | 'difference' | 'exclusion'
  | 'hue' | 'saturation' | 'color' | 'luminosity';

export type LayerType =
  | 'image' | 'video' | 'text' | 'shape'
  | 'group' | 'adjustment' | 'gradient' | 'mask';

export type ShapeType = 'rect' | 'circle' | 'line' | 'arrow' | 'polygon' | 'star' | 'triangle';

export type ToolType =
  | 'select' | 'move' | 'crop' | 'brush' | 'eraser'
  | 'text' | 'shape' | 'gradient' | 'eyedropper'
  | 'blur' | 'sharpen' | 'smudge' | 'clone' | 'heal'
  | 'zoom' | 'hand' | 'mask' | 'pen' | 'lasso' | 'magic-wand';

export type EasingType =
  | 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out'
  | 'bounce' | 'elastic' | 'back' | 'cubic-bezier';

export type AnimationPreset =
  | 'fade-in' | 'fade-out' | 'slide-in-top' | 'slide-in-bottom'
  | 'slide-in-left' | 'slide-in-right' | 'scale-up' | 'scale-down'
  | 'rotate-in' | 'bounce-in' | 'letter-drop' | 'glow-pulse'
  | 'typewriter' | 'blur-in' | 'flip-in';

export interface ColorStop {
  id: string;
  offset: number; // 0–1
  color: string;  // hex
  opacity: number; // 0–1
}

export interface Gradient {
  type: 'linear' | 'radial';
  angle: number;
  stops: ColorStop[];
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  fontStyle: 'normal' | 'italic' | 'oblique';
  textDecoration: string;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  lineHeight: number;
  letterSpacing: number;
  color: string;
  stroke: string;
  strokeWidth: number;
  shadow: TextShadow | null;
}

export interface TextShadow {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}

export interface DropShadow {
  enabled: boolean;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: string;
  opacity: number;
}

export interface GlowEffect {
  enabled: boolean;
  color: string;
  blur: number;
  opacity: number;
  inner: boolean;
}

export interface ColorAdjustments {
  brightness: number;   // -100 to 100
  contrast: number;     // -100 to 100
  saturation: number;   // -100 to 100
  hue: number;          // -180 to 180
  exposure: number;     // -100 to 100
  highlights: number;   // -100 to 100
  shadows: number;      // -100 to 100
  whites: number;       // -100 to 100
  blacks: number;       // -100 to 100
  vibrance: number;     // -100 to 100
  temperature: number;  // -100 to 100 (warm/cool)
  tint: number;         // -100 to 100
  sharpness: number;    // 0 to 100
  clarity: number;      // -100 to 100
  dehaze: number;       // -100 to 100
  vignette: number;     // 0 to 100
}

export interface BlurEffect {
  type: 'gaussian' | 'motion' | 'radial' | 'tilt-shift' | 'lens';
  radius: number;
  angle?: number;
  quality: number;
}

export interface LayerEffects {
  dropShadow: DropShadow;
  innerShadow: DropShadow;
  outerGlow: GlowEffect;
  innerGlow: GlowEffect;
  blur: BlurEffect | null;
  colorOverlay: { enabled: boolean; color: string; opacity: number; mode: BlendMode } | null;
  stroke: { enabled: boolean; width: number; color: string; position: 'inside' | 'outside' | 'center' } | null;
  bevelEmboss: { enabled: boolean; depth: number; size: number; soften: number } | null;
}

export interface Keyframe {
  id: string;
  time: number; // ms
  value: number | string | { x: number; y: number } | boolean;
  easing: EasingType;
  bezierHandles?: [number, number, number, number];
}

export interface AnimationTrack {
  property: string; // 'x' | 'y' | 'opacity' | 'scaleX' | 'scaleY' | 'rotation' | 'width' | 'height' | string
  keyframes: Keyframe[];
  enabled: boolean;
}

export interface LayerAnimation {
  layerId: string;
  tracks: AnimationTrack[];
  presets: AnimationPresetConfig[];
}

export interface AnimationPresetConfig {
  id: string;
  preset: AnimationPreset;
  startTime: number;
  duration: number;
  delay: number;
  easing: EasingType;
  direction: 'in' | 'out' | 'in-out';
  params: Record<string, number | string | boolean>;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number;       // 0–1
  blendMode: BlendMode;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  flipX: boolean;
  flipY: boolean;
  fabricId?: string;   // fabric.js object id

  // Type-specific
  src?: string;          // image / video URL
  text?: string;
  textStyle?: TextStyle;
  shapeType?: ShapeType;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  gradient?: Gradient | null;

  // Effects
  effects: LayerEffects;
  adjustments?: ColorAdjustments;

  // Mask
  maskLayerId?: string;
  isClippingMask?: boolean;

  // Grouping
  parentId?: string | null;
  children?: string[];  // child layer ids

  // Video-specific
  videoStart?: number;   // ms
  videoEnd?: number;     // ms
  videoSpeed?: number;   // 1x default
  videoVolume?: number;

  // Meta
  createdAt: number;
  updatedAt: number;
}

export interface CanvasSize {
  width: number;
  height: number;
  name?: string; // e.g. '1920×1080 Full HD'
}

export interface Selection {
  layerIds: string[];
  bounds?: { x: number; y: number; width: number; height: number };
}

export type ExportFormat = 'jpeg' | 'png' | 'gif' | 'mp4' | 'webm' | 'mov';

export interface ExportSettings {
  format: ExportFormat;
  quality: number;       // 0–100
  width: number;
  height: number;
  fps: number;
  includeAudio: boolean;
  transparent: boolean;
  loop: 'once' | 'infinite' | '3' | number;
  startTime: number;
  endTime: number;
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  canvas: CanvasSize;
  duration: number; // ms
}

export interface Project extends ProjectMeta {
  layers: Layer[];
  animations: LayerAnimation[];
  guides: { x?: number; y?: number; id: string }[];
  backgroundColor: string;
}

export interface HistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  projectSnapshot: Partial<Project>;
}

export type PanelId = 'layers' | 'properties' | 'timeline' | 'color' | 'history' | 'animations' | 'export' | 'templates';
