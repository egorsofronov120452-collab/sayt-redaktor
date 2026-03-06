'use client';

import { useState } from 'react';
import { useProjectStore } from '@/store/projectStore';
import type { AnimationPreset, EasingType } from '@/store/types';
import { nanoid } from 'nanoid';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { Zap, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCw, ZoomIn, Eye, Star, Type } from 'lucide-react';

interface PresetConfig {
  id: AnimationPreset;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  defaultDuration: number;
  tracks: { property: string; from: number; to: number }[];
}

const PRESETS: PresetConfig[] = [
  { id: 'fade-in', label: 'Появление', description: 'Плавное появление из прозрачности', icon: <Eye size={16} />, color: '#4d9bff', defaultDuration: 600, tracks: [{ property: 'opacity', from: 0, to: 1 }] },
  { id: 'fade-out', label: 'Исчезновение', description: 'Плавное затухание до прозрачности', icon: <Eye size={16} />, color: '#8b5cf6', defaultDuration: 600, tracks: [{ property: 'opacity', from: 1, to: 0 }] },
  { id: 'slide-in-top', label: 'Вылет сверху', description: 'Влетает сверху вниз', icon: <ArrowDown size={16} />, color: '#22c55e', defaultDuration: 500, tracks: [{ property: 'y', from: -200, to: 0 }, { property: 'opacity', from: 0, to: 1 }] },
  { id: 'slide-in-bottom', label: 'Вылет снизу', description: 'Влетает снизу вверх', icon: <ArrowUp size={16} />, color: '#22c55e', defaultDuration: 500, tracks: [{ property: 'y', from: 200, to: 0 }, { property: 'opacity', from: 0, to: 1 }] },
  { id: 'slide-in-left', label: 'Вылет слева', description: 'Влетает слева направо', icon: <ArrowRight size={16} />, color: '#f59e0b', defaultDuration: 500, tracks: [{ property: 'x', from: -200, to: 0 }, { property: 'opacity', from: 0, to: 1 }] },
  { id: 'slide-in-right', label: 'Вылет справа', description: 'Влетает справа налево', icon: <ArrowLeft size={16} />, color: '#f59e0b', defaultDuration: 500, tracks: [{ property: 'x', from: 200, to: 0 }, { property: 'opacity', from: 0, to: 1 }] },
  { id: 'scale-up', label: 'Увеличение', description: 'Появляется из маленького в нормальный размер', icon: <ZoomIn size={16} />, color: '#ec4899', defaultDuration: 600, tracks: [{ property: 'scaleX', from: 0.1, to: 1 }, { property: 'scaleY', from: 0.1, to: 1 }, { property: 'opacity', from: 0, to: 1 }] },
  { id: 'rotate-in', label: 'Вращение', description: 'Вращается при появлении', icon: <RotateCw size={16} />, color: '#06b6d4', defaultDuration: 700, tracks: [{ property: 'rotation', from: -180, to: 0 }, { property: 'opacity', from: 0, to: 1 }] },
  { id: 'bounce-in', label: 'Отскок', description: 'Появляется с эффектом отскока', icon: <Zap size={16} />, color: '#fbbf24', defaultDuration: 800, tracks: [{ property: 'scaleX', from: 0.3, to: 1 }, { property: 'scaleY', from: 0.3, to: 1 }, { property: 'opacity', from: 0, to: 1 }] },
  { id: 'glow-pulse', label: 'Пульсирующее свечение', description: 'Мигающее сияние вокруг объекта', icon: <Star size={16} />, color: '#a78bfa', defaultDuration: 1200, tracks: [{ property: 'opacity', from: 0.4, to: 1 }, { property: 'scaleX', from: 0.95, to: 1.05 }] },
  { id: 'letter-drop', label: 'Падение букв', description: 'Буквы падают сверху по очереди', icon: <Type size={16} />, color: '#f97316', defaultDuration: 1000, tracks: [{ property: 'y', from: -100, to: 0 }, { property: 'opacity', from: 0, to: 1 }] },
  { id: 'typewriter', label: 'Печатная машинка', description: 'Текст появляется посимвольно', icon: <Type size={16} />, color: '#6ee7b7', defaultDuration: 1500, tracks: [{ property: 'opacity', from: 0, to: 1 }] },
];

const EASINGS: { value: EasingType; label: string }[] = [
  { value: 'linear', label: 'Линейный' },
  { value: 'ease', label: 'Плавный' },
  { value: 'ease-in', label: 'Разгон' },
  { value: 'ease-out', label: 'Торможение' },
  { value: 'ease-in-out', label: 'Разгон+Торм.' },
  { value: 'bounce', label: 'Отскок' },
  { value: 'elastic', label: 'Упругий' },
  { value: 'back', label: 'С отдачей' },
];

interface Props {
  onClose: () => void;
}

export default function AnimationWizard({ onClose }: Props) {
  const { selection, project, addAnimation, updateAnimation } = useProjectStore();
  const [step, setStep] = useState(1);
  const [selectedPreset, setSelectedPreset] = useState<PresetConfig | null>(null);
  const [duration, setDuration] = useState(600);
  const [delay, setDelay] = useState(0);
  const [easing, setEasing] = useState<EasingType>('ease-out');
  const [direction, setDirection] = useState<'in' | 'out' | 'in-out'>('in');
  const [startTime, setStartTime] = useState(0);

  const layerName = project.layers.find((l) => l.id === selection[0])?.name ?? 'Выбранный слой';

  const applyPreset = () => {
    if (!selectedPreset || !selection[0]) return;
    const layerId = selection[0];
    const existing = project.animations.find((a) => a.layerId === layerId);

    const newTracks = selectedPreset.tracks.map((t) => ({
      property: t.property,
      enabled: true,
      keyframes: [
        { id: nanoid(), time: startTime + delay, value: t.from, easing },
        { id: nanoid(), time: startTime + delay + duration, value: t.to, easing },
      ],
    }));

    if (existing) {
      // Merge tracks
      const mergedTracks = [...existing.tracks];
      newTracks.forEach((nt) => {
        const idx = mergedTracks.findIndex((t) => t.property === nt.property);
        if (idx >= 0) mergedTracks[idx] = nt;
        else mergedTracks.push(nt);
      });
      updateAnimation(layerId, { tracks: mergedTracks });
    } else {
      addAnimation({ layerId, tracks: newTracks, presets: [] });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-popover border border-border rounded-xl shadow-2xl w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Мастер анимации</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Слой: <span className="text-primary">{layerName}</span></p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Шаг {step} из 3</span>
            <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground">✕</button>
          </div>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-1 px-5 py-2 border-b border-border/50">
          {['Выбор эффекта', 'Настройка', 'Применение'].map((label, i) => (
            <div key={label} className="flex items-center gap-1 flex-1">
              <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors',
                step > i + 1 ? 'bg-primary text-white' : step === i + 1 ? 'bg-primary text-white' : 'bg-border text-muted-foreground'
              )}>{i + 1}</div>
              <span className={cn('text-[11px] transition-colors', step === i + 1 ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
              {i < 2 && <div className="flex-1 h-px bg-border ml-1" />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Step 1 — choose preset */}
          {step === 1 && (
            <div>
              <p className="text-xs text-muted-foreground mb-3">Выберите тип анимации для слоя:</p>
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => { setSelectedPreset(preset); setDuration(preset.defaultDuration); }}
                    className={cn(
                      'flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-all hover:border-primary/50',
                      selectedPreset?.id === preset.id ? 'border-primary bg-primary/10' : 'border-border bg-black/20 hover:bg-white/5',
                    )}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: preset.color + '33', color: preset.color }}>
                      {preset.icon}
                    </div>
                    <span className="text-xs font-medium text-foreground">{preset.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{preset.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2 — configure */}
          {step === 2 && selectedPreset && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg border border-primary/30">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: selectedPreset.color + '33', color: selectedPreset.color }}>
                  {selectedPreset.icon}
                </div>
                <div>
                  <span className="text-sm font-semibold text-foreground">{selectedPreset.label}</span>
                  <p className="text-[11px] text-muted-foreground">{selectedPreset.description}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-muted-foreground">Длительность</label>
                  <span className="text-xs font-mono text-foreground">{duration} мс ({(duration / 1000).toFixed(1)} с)</span>
                </div>
                <Slider value={[duration]} min={100} max={5000} step={50} onValueChange={([v]) => setDuration(v)} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-muted-foreground">Задержка</label>
                  <span className="text-xs font-mono text-foreground">{delay} мс</span>
                </div>
                <Slider value={[delay]} min={0} max={5000} step={50} onValueChange={([v]) => setDelay(v)} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-muted-foreground">Старт на таймлайне</label>
                  <span className="text-xs font-mono text-foreground">{startTime} мс</span>
                </div>
                <Slider value={[startTime]} min={0} max={useProjectStore.getState().project.duration - duration} step={100} onValueChange={([v]) => setStartTime(v)} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Смягчение (easing)</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {EASINGS.map((e) => (
                    <button key={e.value} onClick={() => setEasing(e.value)}
                      className={cn('px-2 py-1.5 rounded-md text-[11px] border transition-colors', easing === e.value ? 'border-primary bg-primary/20 text-primary' : 'border-border bg-black/20 text-muted-foreground hover:text-foreground hover:border-border/80')}>
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Направление</label>
                <div className="flex gap-1.5">
                  {(['in', 'out', 'in-out'] as const).map((d) => (
                    <button key={d} onClick={() => setDirection(d)}
                      className={cn('flex-1 py-1.5 rounded-md text-[11px] border transition-colors', direction === d ? 'border-primary bg-primary/20 text-primary' : 'border-border bg-black/20 text-muted-foreground hover:text-foreground')}>
                      {d === 'in' ? 'Вход' : d === 'out' ? 'Выход' : 'Вход+Выход'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — summary */}
          {step === 3 && selectedPreset && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Итоговая конфигурация анимации:</p>
              <div className="bg-black/30 rounded-lg p-3 space-y-2 border border-border">
                <div className="flex justify-between"><span className="text-xs text-muted-foreground">Эффект:</span><span className="text-xs text-foreground font-medium">{selectedPreset.label}</span></div>
                <div className="flex justify-between"><span className="text-xs text-muted-foreground">Длительность:</span><span className="text-xs font-mono text-foreground">{duration} мс</span></div>
                <div className="flex justify-between"><span className="text-xs text-muted-foreground">Задержка:</span><span className="text-xs font-mono text-foreground">{delay} мс</span></div>
                <div className="flex justify-between"><span className="text-xs text-muted-foreground">Старт:</span><span className="text-xs font-mono text-foreground">{startTime} мс</span></div>
                <div className="flex justify-between"><span className="text-xs text-muted-foreground">Смягчение:</span><span className="text-xs text-foreground">{EASINGS.find((e) => e.value === easing)?.label}</span></div>
                <div className="flex justify-between"><span className="text-xs text-muted-foreground">Дорожки:</span><span className="text-xs text-foreground">{selectedPreset.tracks.map((t) => t.property).join(', ')}</span></div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Анимация будет добавлена на таймлайн. Вы сможете отредактировать ключевые кадры вручную.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <button
            onClick={() => { if (step > 1) setStep(step - 1); else onClose(); }}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 rounded transition-colors"
          >
            {step === 1 ? 'Отмена' : 'Назад'}
          </button>
          <button
            onClick={() => {
              if (step < 3) { if (step === 1 && !selectedPreset) return; setStep(step + 1); }
              else applyPreset();
            }}
            disabled={step === 1 && !selectedPreset}
            className={cn(
              'px-4 py-1.5 text-xs font-medium rounded transition-colors',
              step === 3 ? 'bg-primary text-white hover:bg-primary/90' : 'bg-primary/20 text-primary hover:bg-primary/30',
              step === 1 && !selectedPreset && 'opacity-40 cursor-not-allowed',
            )}
          >
            {step < 3 ? 'Далее' : 'Применить анимацию'}
          </button>
        </div>
      </div>
    </div>
  );
}
