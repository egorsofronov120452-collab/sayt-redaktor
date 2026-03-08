'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { useEditorStore } from '@/store/editorStore';
import type { Layer, Keyframe, AnimationTrack, EasingType } from '@/store/types';
import {
  Play, Pause, SkipBack, SkipForward, ChevronDown, ChevronRight,
  Plus, Diamond, Trash2, ZoomIn, ZoomOut, Clock, Volume2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { nanoid } from 'nanoid';

const TRACK_HEIGHT = 28; // px
const HEADER_WIDTH = 180; // px

function msToTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const frames = Math.floor((ms % 1000) / (1000 / 30)); // 30fps
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')};${frames.toString().padStart(2, '0')}`;
}

function msToSeconds(ms: number) {
  return (ms / 1000).toFixed(2);
}

const EASING_LABELS: Record<EasingType, string> = {
  linear: 'Линейный',
  ease: 'Плавный',
  'ease-in': 'Разгон',
  'ease-out': 'Торможение',
  'ease-in-out': 'Разгон+Торм.',
  bounce: 'Отскок',
  elastic: 'Упругий',
  back: 'С отдачей',
  'cubic-bezier': 'Безье',
};

// Timeline ruler component
function Ruler({ duration, scale, offsetX }: { duration: number; scale: number; offsetX: number }) {
  const tickInterval = scale < 0.02 ? 5000 : scale < 0.05 ? 2000 : scale < 0.1 ? 1000 : 500;
  const ticks: number[] = [];
  for (let ms = 0; ms <= duration + tickInterval; ms += tickInterval) {
    ticks.push(ms);
  }

  return (
    <div className="relative h-6 bg-timeline-header border-b panel-border overflow-hidden" style={{ marginLeft: HEADER_WIDTH }}>
      {ticks.map((ms) => {
        const x = ms * scale + offsetX;
        if (x < -50 || x > 4000) return null;
        const isMajor = ms % (tickInterval * 2) === 0;
        return (
          <div key={ms} className="absolute top-0 flex flex-col items-start" style={{ left: x }}>
            <div className={cn('w-px bg-border/60', isMajor ? 'h-4' : 'h-2')} />
            {isMajor && (
              <span className="text-[9px] text-muted-foreground font-mono pl-0.5" style={{ marginTop: 2 }}>
                {msToTime(ms)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Single keyframe diamond
function KeyframeDot({
  keyframe, isSelected, scale, offsetX,
  onSelect, onDelete, onDragStart,
}: {
  keyframe: Keyframe;
  isSelected: boolean;
  scale: number;
  offsetX: number;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: (e: React.MouseEvent, id: string) => void;
}) {
  const x = keyframe.time * scale + offsetX;
  return (
    <div
      className={cn(
        'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rotate-45 cursor-pointer z-10 transition-colors',
        'hover:scale-125',
        isSelected ? 'bg-primary border border-white shadow-md shadow-primary/50' : 'bg-keyframe-color border border-amber-400/40 hover:bg-amber-300',
      )}
      style={{ left: x, backgroundColor: isSelected ? 'var(--keyframe-selected)' : 'var(--keyframe-color)' }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onContextMenu={(e) => { e.preventDefault(); onDelete(); }}
      onMouseDown={(e) => onDragStart(e, keyframe.id)}
      title={`t=${msToTime(keyframe.time)} | ${EASING_LABELS[keyframe.easing]}`}
    />
  );
}

// Single track row
function TrackRow({
  layer, track, scale, offsetX, duration, currentTime, selectedKeyframes, onSelectKf, onDeleteKf, onAddKf, onDragKfStart,
}: {
  layer: Layer;
  track: AnimationTrack;
  scale: number;
  offsetX: number;
  duration: number;
  currentTime: number;
  selectedKeyframes: Set<string>;
  onSelectKf: (id: string, multi: boolean) => void;
  onDeleteKf: (trackProp: string, id: string) => void;
  onAddKf: (trackProp: string, time: number) => void;
  onDragKfStart: (e: React.MouseEvent, kfId: string, trackProp: string) => void;
}) {
  const PROP_LABELS: Record<string, string> = {
    opacity: 'Непрозрачность', x: 'Позиция X', y: 'Позиция Y',
    scaleX: 'Масштаб X', scaleY: 'Масштаб Y', rotation: 'Вращение',
    width: 'Ширина', height: 'Высота', fillColor: 'Цвет заливки',
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.round((x - offsetX) / scale);
    if (time >= 0 && time <= duration) {
      onAddKf(track.property, time);
    }
  };

  return (
    <div
      className="relative flex items-center border-b border-border/20"
      style={{ height: TRACK_HEIGHT }}
    >
      {/* Track label */}
      <div
        className="absolute left-0 flex items-center gap-1 px-2 text-[10px] text-muted-foreground bg-timeline-header border-r panel-border z-10 shrink-0 h-full"
        style={{ width: HEADER_WIDTH, paddingLeft: 28 }}
      >
        <Diamond size={8} className="text-amber-400 shrink-0" />
        <span className="truncate">{PROP_LABELS[track.property] ?? track.property}</span>
      </div>

      {/* Track area */}
      <div
        className="absolute left-0 right-0 h-full cursor-crosshair"
        style={{ marginLeft: HEADER_WIDTH }}
        onDoubleClick={handleTrackClick}
        title="Двойной клик — добавить ключевой кадр"
      >
        {/* Track bar */}
        <div className="absolute inset-0 hover:bg-white/[0.02] transition-colors" />

        {/* Keyframes */}
        {track.keyframes.map((kf) => (
          <KeyframeDot
            key={kf.id}
            keyframe={kf}
            isSelected={selectedKeyframes.has(kf.id)}
            scale={scale}
            offsetX={0}
            onSelect={() => onSelectKf(kf.id, false)}
            onDelete={() => onDeleteKf(track.property, kf.id)}
            onDragStart={(e, id) => onDragKfStart(e, id, track.property)}
          />
        ))}
      </div>
    </div>
  );
}

// Layer header row in timeline
function LayerTrack({
  layer, expanded, onToggle, scale, offsetX, duration, animations,
  currentTime, selectedKeyframes, onSelectKf, onDeleteKf, onAddKf, onDragKfStart, onSelectLayer,
}: {
  layer: Layer;
  expanded: boolean;
  onToggle: () => void;
  scale: number;
  offsetX: number;
  duration: number;
  animations: import('@/store/types').LayerAnimation[];
  currentTime: number;
  selectedKeyframes: Set<string>;
  onSelectKf: (id: string, multi: boolean) => void;
  onDeleteKf: (layerId: string, trackProp: string, id: string) => void;
  onAddKf: (layerId: string, trackProp: string, time: number) => void;
  onDragKfStart: (e: React.MouseEvent, kfId: string, layerId: string, trackProp: string) => void;
  onSelectLayer: (id: string) => void;
}) {
  const anim = animations.find((a) => a.layerId === layer.id);

  return (
    <div className="border-b panel-border">
      {/* Layer header */}
      <div
        className="flex items-center h-7 cursor-pointer hover:bg-white/5 group"
        onClick={() => onSelectLayer(layer.id)}
      >
        <div
          className="flex items-center gap-1.5 px-1 border-r panel-border shrink-0 h-full"
          style={{ width: HEADER_WIDTH }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>
          <span className="text-[11px] text-foreground truncate">{layer.name}</span>
          {anim && anim.tracks.length > 0 && (
            <Diamond size={8} className="text-amber-400 shrink-0 ml-auto" />
          )}
        </div>

        {/* Layer bar — colored based on layer type */}
        <div className="flex-1 relative h-full overflow-hidden" style={{ marginLeft: 0 }}>
          <div
            className="absolute top-2 bottom-2 rounded-sm opacity-40"
            style={{
              left: 0,
              width: duration * scale,
              backgroundColor: layer.type === 'text' ? '#4d9bff' :
                               layer.type === 'image' ? '#22c55e' :
                               layer.type === 'video' ? '#f59e0b' :
                               layer.type === 'shape' ? '#ec4899' : '#8b5cf6',
            }}
          />
        </div>
      </div>

      {/* Expanded tracks */}
      {expanded && anim && anim.tracks.map((track) => (
        <TrackRow
          key={`${layer.id}-${track.property}`}
          layer={layer}
          track={track}
          scale={scale}
          offsetX={offsetX}
          duration={duration}
          currentTime={currentTime}
          selectedKeyframes={selectedKeyframes}
          onSelectKf={onSelectKf}
          onDeleteKf={(prop, id) => onDeleteKf(layer.id, prop, id)}
          onAddKf={(prop, time) => onAddKf(layer.id, prop, time)}
          onDragKfStart={(e, id, prop) => onDragKfStart(e, id, layer.id, prop)}
        />
      ))}
      {expanded && (!anim || anim.tracks.length === 0) && (
        <div className="h-7 flex items-center border-b border-border/20" style={{ paddingLeft: HEADER_WIDTH + 8 }}>
          <span className="text-[10px] text-muted-foreground italic">Нет анимации — двойной клик на дорожке выше</span>
        </div>
      )}
    </div>
  );
}

export default function Timeline() {
  const { project, selection, setSelection, addAnimation, updateAnimation } = useProjectStore();
  const { currentTime, timelinePlaying, timelineScale, setCurrentTime, setPlaying, setTimelineScale } = useEditorStore();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedKeyframes, setSelectedKeyframes] = useState<Set<string>>(new Set());
  const [offsetX] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const startRealTimeRef = useRef(0);

  const duration = project.duration;
  const scale = timelineScale; // px per ms

  // Playback
  useEffect(() => {
    if (timelinePlaying) {
      startRealTimeRef.current = Date.now();
      startTimeRef.current = currentTime;
      playIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startRealTimeRef.current;
        const newTime = startTimeRef.current + elapsed;
        if (newTime >= duration) {
          setCurrentTime(0);
          setPlaying(false);
        } else {
          setCurrentTime(newTime);
        }
      }, 16);
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    }
    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelinePlaying]);

  const togglePlay = () => setPlaying(!timelinePlaying);
  const goToStart = () => { setCurrentTime(0); setPlaying(false); };
  const goToEnd = () => { setCurrentTime(duration); setPlaying(false); };

  // Playhead drag / scrub
  const isScrubbing = useRef(false);

  const getTimeFromEvent = (e: React.MouseEvent | MouseEvent, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - HEADER_WIDTH - offsetX;
    return Math.max(0, Math.min(duration, Math.round(x / scale)));
  };

  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isScrubbing.current = true;
    const time = getTimeFromEvent(e, e.currentTarget);
    setCurrentTime(time);
  };

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const time = getTimeFromEvent(e, e.currentTarget);
    setCurrentTime(time);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isScrubbing.current || !timelineRef.current) return;
      const ruler = timelineRef.current.parentElement?.querySelector('.ruler-area') as HTMLElement;
      if (!ruler) return;
      const x = e.clientX - ruler.getBoundingClientRect().left - HEADER_WIDTH - offsetX;
      const time = Math.max(0, Math.min(duration, Math.round(x / scale)));
      setCurrentTime(time);
    };
    const onMouseUp = () => { isScrubbing.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, scale, offsetX]);

  // Keyframe management
  const handleAddKeyframe = useCallback((layerId: string, prop: string, time: number) => {
    const anims = project.animations;
    const existing = anims.find((a) => a.layerId === layerId);
    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const defaultValue = (p: string): number | string => {
      if (p === 'opacity') return layer.opacity;
      if (p === 'x') return layer.x;
      if (p === 'y') return layer.y;
      if (p === 'rotation') return layer.rotation;
      if (p === 'scaleX') return layer.scaleX;
      if (p === 'scaleY') return layer.scaleY;
      return 1;
    };

    const newKf: Keyframe = { id: nanoid(), time, value: defaultValue(prop), easing: 'ease-in-out' };

    if (existing) {
      const trackIdx = existing.tracks.findIndex((t) => t.property === prop);
      if (trackIdx >= 0) {
        updateAnimation(layerId, {
          tracks: existing.tracks.map((t, i) =>
            i === trackIdx ? { ...t, keyframes: [...t.keyframes, newKf].sort((a, b) => a.time - b.time) } : t
          ),
        });
      } else {
        updateAnimation(layerId, {
          tracks: [...existing.tracks, { property: prop, keyframes: [newKf], enabled: true }],
        });
      }
    } else {
      addAnimation({ layerId, tracks: [{ property: prop, keyframes: [newKf], enabled: true }], presets: [] });
      setExpanded((prev) => new Set([...prev, layerId]));
    }
  }, [project, addAnimation, updateAnimation]);

  const handleDeleteKeyframe = useCallback((layerId: string, prop: string, kfId: string) => {
    const anim = project.animations.find((a) => a.layerId === layerId);
    if (!anim) return;
    updateAnimation(layerId, {
      tracks: anim.tracks.map((t) =>
        t.property === prop ? { ...t, keyframes: t.keyframes.filter((k) => k.id !== kfId) } : t
      ),
    });
  }, [project, updateAnimation]);

  // Add standard properties to a layer
  const addAnimProperties = (layerId: string) => {
    const props = ['opacity', 'x', 'y', 'rotation', 'scaleX', 'scaleY'];
    const anim = project.animations.find((a) => a.layerId === layerId);
    if (!anim) {
      addAnimation({
        layerId,
        tracks: props.map((p) => ({ property: p, keyframes: [], enabled: true })),
        presets: [],
      });
    }
    setExpanded((prev) => new Set([...prev, layerId]));
  };

  const playheadX = currentTime * scale + offsetX;
  const visibleDuration = duration;

  return (
    <div className="flex flex-col h-full timeline-bg">
      {/* Transport controls */}
      <div className="flex items-center gap-1 px-2 py-1 border-b panel-border shrink-0">
        <button onClick={goToStart} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-foreground" title="В начало">
          <SkipBack size={13} />
        </button>
        <button
          onClick={togglePlay}
          className={cn('w-7 h-7 flex items-center justify-center rounded text-foreground transition-colors', timelinePlaying ? 'bg-primary/20 text-primary hover:bg-primary/30' : 'hover:bg-white/10')}
          title={timelinePlaying ? 'Пауза (Пробел)' : 'Воспроизвести (Пробел)'}
        >
          {timelinePlaying ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button onClick={goToEnd} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-foreground" title="В конец">
          <SkipForward size={13} />
        </button>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Time display — AE style */}
        <div className="flex items-center gap-1.5 bg-black/30 px-2 py-0.5 rounded font-mono">
          <Clock size={10} className="text-muted-foreground" />
          <span className="text-[12px] text-foreground">{msToTime(currentTime)}</span>
          <span className="text-[10px] text-muted-foreground">/ {msToTime(duration)}</span>
        </div>

        <div className="flex-1" />

        {/* Zoom controls */}
        <span className="text-[10px] text-muted-foreground">Масштаб:</span>
        <button onClick={() => setTimelineScale(Math.max(scale / 1.5, 0.005))} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground"><ZoomOut size={12} /></button>
        <button onClick={() => setTimelineScale(Math.min(scale * 1.5, 2))} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground"><ZoomIn size={12} /></button>

        {/* Add keyframe at current time for selected layer */}
        {selection[0] && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <button
              onClick={() => { if (selection[0]) addAnimProperties(selection[0]); }}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-primary/20 text-primary text-[11px] hover:bg-primary/30 transition-colors"
              title="Добавить анимационные дорожки к выбранному слою"
            >
              <Plus size={11} /> Анимировать
            </button>
          </>
        )}
      </div>

      {/* Main timeline area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Ruler */}
        <div className="ruler-area relative cursor-col-resize shrink-0" onMouseDown={handleRulerMouseDown} onClick={handleRulerClick}>
          <Ruler duration={duration} scale={scale} offsetX={offsetX} />
        </div>

        {/* Scrollable tracks */}
        <div ref={timelineRef} className="flex-1 overflow-auto relative">
          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-primary z-30 pointer-events-none"
            style={{ left: HEADER_WIDTH + playheadX }}
          >
            <div className="w-3 h-3 -translate-x-[5px] bg-primary rotate-45 -translate-y-0.5" />
          </div>

          {/* Empty state */}
          {project.layers.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-xs gap-2 opacity-50">
              <Clock size={16} />
              Добавьте слои для анимации
            </div>
          )}

          {/* Layer tracks */}
          {project.layers.map((layer) => (
            <LayerTrack
              key={layer.id}
              layer={layer}
              expanded={expanded.has(layer.id)}
              onToggle={() => setExpanded((prev) => {
                const next = new Set(prev);
                next.has(layer.id) ? next.delete(layer.id) : next.add(layer.id);
                return next;
              })}
              scale={scale}
              offsetX={offsetX}
              duration={duration}
              animations={project.animations}
              currentTime={currentTime}
              selectedKeyframes={selectedKeyframes}
              onSelectKf={(id, multi) => setSelectedKeyframes((prev) => {
                const next = new Set(multi ? prev : []);
                next.has(id) ? next.delete(id) : next.add(id);
                return next;
              })}
              onDeleteKf={(layerId, prop, id) => handleDeleteKeyframe(layerId, prop, id)}
              onAddKf={(layerId, prop, time) => handleAddKeyframe(layerId, prop, time)}
              onDragKfStart={() => {}}
              onSelectLayer={(id) => setSelection([id])}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
