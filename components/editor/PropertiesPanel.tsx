'use client';

import { useState } from 'react';
import { useProjectStore } from '@/store/projectStore';
import type { Layer, ColorAdjustments, LayerEffects, TextStyle } from '@/store/types';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  ChevronDown, ChevronRight, Wand2, RotateCw, FlipHorizontal, FlipVertical,
  SunMedium, Contrast, Droplets, Wind, Zap, Mountain, AlignLeft, AlignCenter,
  AlignRight, Bold, Italic, Underline, Plus, Trash2,
} from 'lucide-react';
import { nanoid } from 'nanoid';

// ---- Reusable UI pieces ----

function PanelSection({
  title, defaultOpen = true, children, badge,
}: { title: string; defaultOpen?: boolean; children: React.ReactNode; badge?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b panel-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          {open ? <ChevronDown size={11} className="text-muted-foreground" /> : <ChevronRight size={11} className="text-muted-foreground" />}
          <span className="text-[11px] font-semibold text-foreground tracking-wide uppercase">{title}</span>
        </div>
        {badge && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">{badge}</span>}
      </button>
      {open && <div className="px-2 pb-2 pt-0">{children}</div>}
    </div>
  );
}

function PropRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5" title={hint}>
      <span className="text-[11px] text-muted-foreground w-20 shrink-0 leading-tight">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function NumInput({
  value, onChange, min, max, step = 1, unit = '',
}: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      <input
        type="number"
        value={Math.round(value)}
        min={min} max={max} step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
        className="w-full bg-input border border-border rounded-sm px-1.5 py-0.5 text-[11px] text-foreground outline-none focus:border-primary font-mono"
      />
      {unit && <span className="text-[10px] text-muted-foreground shrink-0">{unit}</span>}
    </div>
  );
}

function ColorSwatch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="relative cursor-pointer">
        <div
          className="w-6 h-6 rounded-sm border border-border cursor-pointer hover:scale-110 transition-transform"
          style={{ backgroundColor: value }}
        />
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="sr-only" />
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={7}
        className="flex-1 bg-input border border-border rounded-sm px-1.5 py-0.5 text-[11px] text-foreground outline-none focus:border-primary font-mono uppercase"
      />
    </div>
  );
}

function SliderRow({
  label, value, onChange, min, max, step = 1, unit = '', hint,
}: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; hint?: string }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 group" title={hint}>
      <span className="text-[11px] text-muted-foreground w-20 shrink-0">{label}</span>
      <Slider
        value={[value]}
        min={min} max={max} step={step}
        onValueChange={([v]) => onChange(v)}
        className="flex-1"
      />
      <input
        type="number"
        value={value}
        min={min} max={max} step={step}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v))); }}
        className="w-10 bg-input border border-border rounded-sm px-1 py-0.5 text-[10px] text-foreground outline-none focus:border-primary font-mono text-right"
      />
      {unit && <span className="text-[10px] text-muted-foreground shrink-0 w-3">{unit}</span>}
    </div>
  );
}

// ---- Transform section ----
function TransformSection({ layer, update }: { layer: Layer; update: (p: Partial<Layer>) => void }) {
  return (
    <PanelSection title="Трансформация">
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className="text-[10px] text-muted-foreground">X</label>
          <NumInput value={layer.x} onChange={(v) => update({ x: v })} unit="px" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Y</label>
          <NumInput value={layer.y} onChange={(v) => update({ y: v })} unit="px" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Ширина</label>
          <NumInput value={layer.width} onChange={(v) => update({ width: v })} min={1} unit="px" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Высота</label>
          <NumInput value={layer.height} onChange={(v) => update({ height: v })} min={1} unit="px" />
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5">
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground">Поворот</label>
          <NumInput value={layer.rotation} onChange={(v) => update({ rotation: v })} min={-360} max={360} unit="°" />
        </div>
        <div className="flex items-center gap-1 mt-3">
          <button
            title="Отразить по горизонтали"
            onClick={() => update({ flipX: !layer.flipX })}
            className={cn('w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-foreground', layer.flipX && 'text-primary bg-primary/20')}
          ><FlipHorizontal size={13} /></button>
          <button
            title="Отразить по вертикали"
            onClick={() => update({ flipY: !layer.flipY })}
            className={cn('w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-foreground', layer.flipY && 'text-primary bg-primary/20')}
          ><FlipVertical size={13} /></button>
          <button
            title="Сбросить поворот"
            onClick={() => update({ rotation: 0, scaleX: 1, scaleY: 1, flipX: false, flipY: false })}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-foreground"
          ><RotateCw size={13} /></button>
        </div>
      </div>
    </PanelSection>
  );
}

// ---- Color adjustments ----
function AdjustmentsSection({ layer, update }: { layer: Layer; update: (p: Partial<Layer>) => void }) {
  const adj = layer.adjustments!;
  const set = (key: keyof ColorAdjustments) => (v: number) =>
    update({ adjustments: { ...adj, [key]: v } });

  return (
    <PanelSection title="Цветокоррекция" defaultOpen={false}>
      <button
        className="flex items-center gap-1.5 mb-2 text-[11px] text-primary hover:text-primary/80"
        onClick={() => update({ adjustments: { brightness: 0, contrast: 0, saturation: 0, hue: 0, exposure: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, vibrance: 0, temperature: 0, tint: 0, sharpness: 0, clarity: 0, dehaze: 0, vignette: 0 } })}
      >
        <Wand2 size={11} /> Автоулучшение
      </button>
      <SliderRow label="Яркость" value={adj.brightness} onChange={set('brightness')} min={-100} max={100} hint="Изменяет общую яркость изображения" />
      <SliderRow label="Контраст" value={adj.contrast} onChange={set('contrast')} min={-100} max={100} />
      <SliderRow label="Насыщенность" value={adj.saturation} onChange={set('saturation')} min={-100} max={100} />
      <SliderRow label="Тон (Hue)" value={adj.hue} onChange={set('hue')} min={-180} max={180} unit="°" />
      <SliderRow label="Экспозиция" value={adj.exposure} onChange={set('exposure')} min={-100} max={100} />
      <SliderRow label="Света" value={adj.highlights} onChange={set('highlights')} min={-100} max={100} hint="Восстанавливает детали в пересвеченных областях" />
      <SliderRow label="Тени" value={adj.shadows} onChange={set('shadows')} min={-100} max={100} hint="Поднимает детали в тенях" />
      <SliderRow label="Белые" value={adj.whites} onChange={set('whites')} min={-100} max={100} />
      <SliderRow label="Чёрные" value={adj.blacks} onChange={set('blacks')} min={-100} max={100} />
      <SliderRow label="Вибрация" value={adj.vibrance} onChange={set('vibrance')} min={-100} max={100} hint="Как насыщенность, но не трогает уже насыщенные цвета" />
      <SliderRow label="Температура" value={adj.temperature} onChange={set('temperature')} min={-100} max={100} hint="Тёплые/холодные оттенки" />
      <SliderRow label="Оттенок" value={adj.tint} onChange={set('tint')} min={-100} max={100} />
      <SliderRow label="Чёткость" value={adj.sharpness} onChange={set('sharpness')} min={0} max={100} />
      <SliderRow label="Ясность" value={adj.clarity} onChange={set('clarity')} min={-100} max={100} />
      <SliderRow label="Устр. дымки" value={adj.dehaze} onChange={set('dehaze')} min={-100} max={100} />
      <SliderRow label="Виньетирование" value={adj.vignette} onChange={set('vignette')} min={0} max={100} />
    </PanelSection>
  );
}

// ---- Layer Effects ----
function EffectsSection({ layer, update }: { layer: Layer; update: (p: Partial<Layer>) => void }) {
  const fx = layer.effects;
  const setFx = (key: keyof LayerEffects, val: unknown) =>
    update({ effects: { ...fx, [key]: val } });

  return (
    <PanelSection title="Эффекты слоя" defaultOpen={false}>
      {/* Drop Shadow */}
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-1">
          <Switch
            checked={fx.dropShadow.enabled}
            onCheckedChange={(v) => setFx('dropShadow', { ...fx.dropShadow, enabled: v })}
          />
          <span className="text-[11px] text-foreground">Тень</span>
        </div>
        {fx.dropShadow.enabled && (
          <div className="pl-5 space-y-0.5">
            <SliderRow label="Смещение X" value={fx.dropShadow.offsetX} onChange={(v) => setFx('dropShadow', { ...fx.dropShadow, offsetX: v })} min={-50} max={50} />
            <SliderRow label="Смещение Y" value={fx.dropShadow.offsetY} onChange={(v) => setFx('dropShadow', { ...fx.dropShadow, offsetY: v })} min={-50} max={50} />
            <SliderRow label="Размытие" value={fx.dropShadow.blur} onChange={(v) => setFx('dropShadow', { ...fx.dropShadow, blur: v })} min={0} max={50} />
            <SliderRow label="Непрозрачность" value={Math.round(fx.dropShadow.opacity * 100)} onChange={(v) => setFx('dropShadow', { ...fx.dropShadow, opacity: v / 100 })} min={0} max={100} unit="%" />
            <PropRow label="Цвет">
              <ColorSwatch value={fx.dropShadow.color} onChange={(v) => setFx('dropShadow', { ...fx.dropShadow, color: v })} />
            </PropRow>
          </div>
        )}
      </div>

      {/* Outer Glow */}
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-1">
          <Switch
            checked={fx.outerGlow.enabled}
            onCheckedChange={(v) => setFx('outerGlow', { ...fx.outerGlow, enabled: v })}
          />
          <span className="text-[11px] text-foreground">Внешнее свечение</span>
        </div>
        {fx.outerGlow.enabled && (
          <div className="pl-5 space-y-0.5">
            <SliderRow label="Размытие" value={fx.outerGlow.blur} onChange={(v) => setFx('outerGlow', { ...fx.outerGlow, blur: v })} min={0} max={100} />
            <SliderRow label="Непрозрачность" value={Math.round(fx.outerGlow.opacity * 100)} onChange={(v) => setFx('outerGlow', { ...fx.outerGlow, opacity: v / 100 })} min={0} max={100} unit="%" />
            <PropRow label="Цвет">
              <ColorSwatch value={fx.outerGlow.color} onChange={(v) => setFx('outerGlow', { ...fx.outerGlow, color: v })} />
            </PropRow>
          </div>
        )}
      </div>

      {/* Stroke */}
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-1">
          <Switch
            checked={!!(fx.stroke?.enabled)}
            onCheckedChange={(v) => setFx('stroke', { enabled: v, width: fx.stroke?.width ?? 2, color: fx.stroke?.color ?? '#ffffff', position: 'outside' })}
          />
          <span className="text-[11px] text-foreground">Обводка</span>
        </div>
        {fx.stroke?.enabled && (
          <div className="pl-5 space-y-0.5">
            <SliderRow label="Толщина" value={fx.stroke.width} onChange={(v) => setFx('stroke', { ...fx.stroke!, width: v })} min={1} max={30} unit="px" />
            <PropRow label="Цвет">
              <ColorSwatch value={fx.stroke.color} onChange={(v) => setFx('stroke', { ...fx.stroke!, color: v })} />
            </PropRow>
          </div>
        )}
      </div>
    </PanelSection>
  );
}

// ---- Text properties ----
function TextSection({ layer, update }: { layer: Layer; update: (p: Partial<Layer>) => void }) {
  const ts = layer.textStyle ?? { fontFamily: 'Inter', fontSize: 48, fontWeight: 700, fontStyle: 'normal', textDecoration: '', textAlign: 'left', lineHeight: 1.2, letterSpacing: 0, color: '#ffffff', stroke: '', strokeWidth: 0, shadow: null };
  const set = (key: keyof TextStyle, v: unknown) => update({ textStyle: { ...ts, [key]: v } });

  const FONTS = ['Inter', 'Arial', 'Georgia', 'Impact', 'Montserrat', 'Roboto', 'Open Sans', 'Playfair Display', 'Oswald', 'Raleway', 'Bebas Neue'];

  return (
    <PanelSection title="Текст">
      <PropRow label="Текст">
        <textarea
          value={layer.text ?? ''}
          onChange={(e) => update({ text: e.target.value })}
          className="w-full bg-input border border-border rounded-sm px-1.5 py-1 text-xs text-foreground outline-none focus:border-primary resize-none"
          rows={2}
        />
      </PropRow>
      <PropRow label="Шрифт">
        <select
          value={ts.fontFamily}
          onChange={(e) => set('fontFamily', e.target.value)}
          className="w-full bg-input border border-border rounded-sm px-1.5 py-0.5 text-[11px] text-foreground outline-none"
        >
          {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </PropRow>
      <div className="grid grid-cols-2 gap-1 mt-1">
        <div>
          <label className="text-[10px] text-muted-foreground">Размер</label>
          <NumInput value={ts.fontSize} onChange={(v) => set('fontSize', v)} min={1} max={999} unit="px" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Межстрочный</label>
          <NumInput value={ts.lineHeight * 100} onChange={(v) => set('lineHeight', v / 100)} min={50} max={300} unit="%" />
        </div>
      </div>
      <div className="flex items-center gap-1 mt-1.5">
        <button onClick={() => set('fontWeight', ts.fontWeight === 700 ? 400 : 700)}
          className={cn('w-7 h-7 flex items-center justify-center rounded text-xs font-bold hover:bg-white/10', ts.fontWeight === 700 && 'bg-primary/20 text-primary')}>
          <Bold size={13} />
        </button>
        <button onClick={() => set('fontStyle', ts.fontStyle === 'italic' ? 'normal' : 'italic')}
          className={cn('w-7 h-7 flex items-center justify-center rounded hover:bg-white/10', ts.fontStyle === 'italic' && 'bg-primary/20 text-primary')}>
          <Italic size={13} />
        </button>
        <button onClick={() => set('textDecoration', ts.textDecoration === 'underline' ? '' : 'underline')}
          className={cn('w-7 h-7 flex items-center justify-center rounded hover:bg-white/10', ts.textDecoration === 'underline' && 'bg-primary/20 text-primary')}>
          <Underline size={13} />
        </button>
        <div className="w-px h-5 bg-border mx-0.5" />
        {(['left', 'center', 'right'] as const).map((align) => {
          const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
          return (
            <button key={align} onClick={() => set('textAlign', align)}
              className={cn('w-7 h-7 flex items-center justify-center rounded hover:bg-white/10', ts.textAlign === align && 'bg-primary/20 text-primary')}>
              <Icon size={13} />
            </button>
          );
        })}
      </div>
      <PropRow label="Цвет" hint="Цвет текста">
        <ColorSwatch value={ts.color} onChange={(v) => set('color', v)} />
      </PropRow>
      <SliderRow label="Межбуквенный" value={ts.letterSpacing} onChange={(v) => set('letterSpacing', v)} min={-100} max={500} unit="px" />
    </PanelSection>
  );
}

// ---- Shape properties ----
function ShapeSection({ layer, update }: { layer: Layer; update: (p: Partial<Layer>) => void }) {
  return (
    <PanelSection title="Фигура">
      <PropRow label="Заливка">
        <ColorSwatch value={layer.fillColor ?? '#4d9bff'} onChange={(v) => update({ fillColor: v })} />
      </PropRow>
      <PropRow label="Обводка">
        <ColorSwatch value={layer.strokeColor ?? '#ffffff'} onChange={(v) => update({ strokeColor: v })} />
      </PropRow>
      <SliderRow label="Толщина обводки" value={layer.strokeWidth ?? 0} onChange={(v) => update({ strokeWidth: v })} min={0} max={50} unit="px" />
    </PanelSection>
  );
}

// ---- Gradient editor ----
function GradientSection({ layer, update }: { layer: Layer; update: (p: Partial<Layer>) => void }) {
  const g = layer.gradient ?? {
    type: 'linear' as const,
    angle: 0,
    stops: [
      { id: nanoid(), offset: 0, color: '#4d9bff', opacity: 1 },
      { id: nanoid(), offset: 1, color: '#000000', opacity: 1 },
    ],
  };

  const setGradient = (patch: Partial<typeof g>) =>
    update({ gradient: { ...g, ...patch } });

  const setStop = (id: string, patch: Partial<(typeof g.stops)[0]>) =>
    setGradient({ stops: g.stops.map((s) => s.id === id ? { ...s, ...patch } : s) });

  const addStop = () =>
    setGradient({ stops: [...g.stops, { id: nanoid(), offset: 0.5, color: '#ffffff', opacity: 1 }] });

  const removeStop = (id: string) =>
    setGradient({ stops: g.stops.filter((s) => s.id !== id) });

  return (
    <PanelSection title="Градиент" defaultOpen={false}>
      <PropRow label="Тип">
        <div className="flex gap-1">
          {(['linear', 'radial'] as const).map((t) => (
            <button key={t} onClick={() => setGradient({ type: t })}
              className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${g.type === t ? 'border-primary bg-primary/20 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              {t === 'linear' ? 'Линейный' : 'Радиальный'}
            </button>
          ))}
        </div>
      </PropRow>
      {g.type === 'linear' && (
        <SliderRow label="Угол" value={g.angle} onChange={(v) => setGradient({ angle: v })} min={0} max={360} unit="°" />
      )}
      <div className="mt-1.5 space-y-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground">Точки градиента</span>
          <button onClick={addStop} className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-primary">
            <Plus size={11} />
          </button>
        </div>
        {/* Preview bar */}
        <div className="h-4 rounded-sm w-full" style={{
          background: `linear-gradient(90deg, ${[...g.stops].sort((a, b) => a.offset - b.offset).map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`,
        }} />
        {g.stops.map((stop) => (
          <div key={stop.id} className="flex items-center gap-1.5">
            <label className="relative cursor-pointer">
              <div className="w-5 h-5 rounded-sm border border-border" style={{ backgroundColor: stop.color }} />
              <input type="color" value={stop.color} onChange={(e) => setStop(stop.id, { color: e.target.value })} className="sr-only" />
            </label>
            <input
              type="range" min={0} max={100} value={Math.round(stop.offset * 100)}
              onChange={(e) => setStop(stop.id, { offset: +e.target.value / 100 })}
              className="flex-1 accent-primary h-1"
            />
            <span className="text-[10px] font-mono text-muted-foreground w-6 text-right">{Math.round(stop.offset * 100)}%</span>
            <SliderRow label="A" value={Math.round(stop.opacity * 100)} onChange={(v) => setStop(stop.id, { opacity: v / 100 })} min={0} max={100} unit="%" />
            {g.stops.length > 2 && (
              <button onClick={() => removeStop(stop.id)} className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-destructive">
                <Trash2 size={10} />
              </button>
            )}
          </div>
        ))}
      </div>
    </PanelSection>
  );
}

// ---- Blur tool properties ----
function BlurSection({ layer, update }: { layer: Layer; update: (p: Partial<Layer>) => void }) {
  const blur = layer.effects.blur;
  return (
    <PanelSection title="Размытие" defaultOpen={false}>
      <PropRow label="Тип">
        <select
          value={blur?.type ?? 'gaussian'}
          onChange={(e) => update({ effects: { ...layer.effects, blur: { type: e.target.value as any, radius: blur?.radius ?? 5, angle: blur?.angle ?? 0, quality: blur?.quality ?? 3 } } })}
          className="w-full bg-input border border-border rounded-sm px-1.5 py-0.5 text-[11px] text-foreground outline-none"
        >
          <option value="gaussian">По Гауссу</option>
          <option value="motion">В движении</option>
          <option value="radial">Радиальное</option>
          <option value="tilt-shift">Наклон-сдвиг</option>
          <option value="lens">Объективное</option>
        </select>
      </PropRow>
      <SliderRow label="Радиус" value={blur?.radius ?? 0} onChange={(v) => update({ effects: { ...layer.effects, blur: { ...(blur ?? { type: 'gaussian', angle: 0, quality: 3 }), radius: v } } })} min={0} max={100} unit="px" />
      {blur?.type === 'motion' && (
        <SliderRow label="Угол" value={blur?.angle ?? 0} onChange={(v) => update({ effects: { ...layer.effects, blur: { ...blur, angle: v } } })} min={0} max={360} unit="°" />
      )}
    </PanelSection>
  );
}

// ---- Main PropertiesPanel ----
export default function PropertiesPanel() {
  const { project, selection, updateLayer } = useProjectStore();
  const layer = project.layers.find((l) => l.id === selection[0]);

  if (!layer) {
    return (
      <div className="flex flex-col h-full panel-bg items-center justify-center gap-2 text-muted-foreground">
        <SunMedium size={24} className="opacity-30" />
        <p className="text-xs">Выберите слой</p>
        <p className="text-[11px] opacity-60 text-center px-4">Кликните на слой в панели слоёв или на объект на холсте</p>
      </div>
    );
  }

  const update = (patch: Partial<Layer>) => updateLayer(layer.id, patch);

  return (
    <div className="flex flex-col h-full panel-bg overflow-y-auto text-xs">
      {/* Header with layer name */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b panel-border shrink-0 panel-header">
        <span className="text-xs font-semibold text-foreground tracking-wide uppercase">Свойства</span>
        <span className="text-[11px] text-muted-foreground truncate max-w-28">{layer.name}</span>
      </div>

      {/* Canvas size display */}
      <div className="px-2 py-1 border-b panel-border bg-black/10 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Холст:</span>
          <span className="text-[10px] text-foreground font-mono">{project.canvas.width}×{project.canvas.height} px</span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] text-muted-foreground">Выделение:</span>
          <span className="text-[10px] text-primary font-mono">{layer.width}×{layer.height} px</span>
        </div>
      </div>

      {/* Transform always shown */}
      <TransformSection layer={layer} update={update} />

      {/* Type-specific */}
      {layer.type === 'text' && <TextSection layer={layer} update={update} />}
      {layer.type === 'shape' && <ShapeSection layer={layer} update={update} />}
      {(layer.type === 'shape' || layer.type === 'image' || layer.type === 'gradient') && (
        <GradientSection layer={layer} update={update} />
      )}
      {layer.adjustments && <AdjustmentsSection layer={layer} update={update} />}
      <EffectsSection layer={layer} update={update} />
      <BlurSection layer={layer} update={update} />
    </div>
  );
}
