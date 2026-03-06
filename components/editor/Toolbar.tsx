'use client';

import { useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { useProjectStore } from '@/store/projectStore';
import type { ToolType } from '@/store/types';
import {
  MousePointer2, Move, Crop, Brush, Eraser, Type,
  Square, Circle, Minus, ArrowRight, Triangle,
  ZoomIn, Hand, Pipette, Wand2, Scissors, Pen,
  Layers, Blend, SunMedium, Gauge,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ToolDef {
  id: ToolType;
  icon: React.ReactNode;
  label: string;
  hint: string;
  shortcut?: string;
  group?: string;
}

const TOOL_GROUPS: { label: string; tools: ToolDef[] }[] = [
  {
    label: 'Выделение',
    tools: [
      {
        id: 'select', icon: <MousePointer2 size={16} />,
        label: 'Выделение', hint: 'Выбирает и перемещает объекты. Зажмите Shift для множественного выделения.', shortcut: 'V',
      },
      {
        id: 'move', icon: <Move size={16} />,
        label: 'Перемещение', hint: 'Перемещает выделенные объекты по холсту.', shortcut: 'W',
      },
      {
        id: 'lasso', icon: <Pen size={16} />,
        label: 'Лассо', hint: 'Рисует произвольную область выделения мышью.', shortcut: 'L',
      },
      {
        id: 'magic-wand', icon: <Wand2 size={16} />,
        label: 'Волшебная палочка', hint: 'Автоматически выделяет область одного цвета.', shortcut: 'W',
      },
    ],
  },
  {
    label: 'Обрезка',
    tools: [
      {
        id: 'crop', icon: <Crop size={16} />,
        label: 'Обрезка', hint: 'Кадрирует холст. Поддерживает соотношения сторон: 16:9, 4:3, 1:1.', shortcut: 'C',
      },
    ],
  },
  {
    label: 'Ретушь',
    tools: [
      {
        id: 'brush', icon: <Brush size={16} />,
        label: 'Кисть', hint: 'Рисует на активном слое. Настройте размер, жёсткость и непрозрачность справа.', shortcut: 'B',
      },
      {
        id: 'eraser', icon: <Eraser size={16} />,
        label: 'Ластик', hint: 'Стирает пиксели активного слоя до прозрачности.', shortcut: 'E',
      },
      {
        id: 'clone', icon: <Layers size={16} />,
        label: 'Штамп', hint: 'Alt+клик задаёт источник, затем закрашивает пикселями из источника.', shortcut: 'S',
      },
      {
        id: 'heal', icon: <Gauge size={16} />,
        label: 'Восстанавл. кисть', hint: 'Убирает пятна и дефекты, интеллектуально смешивая с окружением.', shortcut: 'J',
      },
      {
        id: 'blur', icon: <Blend size={16} />,
        label: 'Размытие', hint: 'Размывает область на слое. Выберите тип: Гаусс, Движение, Радиальное.', shortcut: 'R',
      },
    ],
  },
  {
    label: 'Объекты',
    tools: [
      {
        id: 'text', icon: <Type size={16} />,
        label: 'Текст', hint: 'Кликните на холст чтобы добавить текстовый слой. Двойной клик для редактирования.', shortcut: 'T',
      },
      {
        id: 'shape', icon: <Square size={16} />,
        label: 'Фигура', hint: 'Рисует прямоугольник, эллипс, линию или стрелку. Выберите тип в панели свойств.', shortcut: 'U',
      },
      {
        id: 'pen', icon: <Pen size={16} />,
        label: 'Перо', hint: 'Создаёт кривые Безье и векторные контуры для точной маски или фигуры.', shortcut: 'P',
      },
      {
        id: 'gradient', icon: <SunMedium size={16} />,
        label: 'Градиент', hint: 'Заливает слой или выделение градиентом. Настройте цвета и тип в свойствах.', shortcut: 'G',
      },
    ],
  },
  {
    label: 'Навигация',
    tools: [
      {
        id: 'eyedropper', icon: <Pipette size={16} />,
        label: 'Пипетка', hint: 'Берёт цвет с любой точки холста и устанавливает его как основной цвет.', shortcut: 'I',
      },
      {
        id: 'hand', icon: <Hand size={16} />,
        label: 'Рука', hint: 'Перемещает вид холста. Зажмите Пробел для временной активации из любого инструмента.', shortcut: 'H',
      },
      {
        id: 'zoom', icon: <ZoomIn size={16} />,
        label: 'Масштаб', hint: 'Клик — увеличить. Alt+клик — уменьшить. Или используйте Ctrl+/- .', shortcut: 'Z',
      },
    ],
  },
];

export default function Toolbar() {
  const { activeTool, setActiveTool, activeColor, secondaryColor, swapColors } = useEditorStore();

  const handleKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
    const shortcuts: Record<string, ToolType> = {
      'v': 'select', 'b': 'brush', 'e': 'eraser', 't': 'text',
      'u': 'shape', 'i': 'eyedropper', 'h': 'hand', 'z': 'zoom',
      'c': 'crop', 'g': 'gradient', 's': 'clone', 'j': 'heal',
      'p': 'pen', 'l': 'lasso', 'r': 'blur',
    };
    if (shortcuts[e.key.toLowerCase()]) {
      setActiveTool(shortcuts[e.key.toLowerCase()]);
    }
    // Space bar for hand tool
    if (e.code === 'Space' && !e.repeat) {
      setActiveTool('hand');
    }
  };

  // Register keyboard shortcuts
  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setActiveTool]);

  return (
    <TooltipProvider delayDuration={600}>
      <aside className="flex flex-col items-center w-12 h-full toolbar-bg border-r panel-border py-2 gap-0.5 overflow-y-auto no-select">

        {/* Color Swatches — like Photoshop */}
        <div className="relative w-9 h-9 mb-3 cursor-pointer group" title="Осн./доп. цвет">
          {/* Secondary color (background) */}
          <div
            className="absolute bottom-0 right-0 w-5 h-5 rounded-sm border-2 border-panel-border"
            style={{ backgroundColor: secondaryColor }}
            onClick={() => {
              const el = document.getElementById('secondary-color-input');
              el?.click();
            }}
          />
          {/* Primary color (foreground) */}
          <div
            className="absolute top-0 left-0 w-5 h-5 rounded-sm border-2 border-panel-border"
            style={{ backgroundColor: activeColor }}
            onClick={() => {
              const el = document.getElementById('primary-color-input');
              el?.click();
            }}
          />
          {/* Swap arrows */}
          <button
            className="absolute top-0 right-0 w-3 h-3 bg-muted-foreground/40 rounded-sm hover:bg-primary text-white flex items-center justify-center"
            onClick={swapColors}
            title="Поменять цвета местами (X)"
            style={{ fontSize: 7 }}
          >
            ⇄
          </button>
          <input id="primary-color-input" type="color" value={activeColor} className="sr-only"
            onChange={(e) => useEditorStore.getState().setColor(e.target.value)} />
          <input id="secondary-color-input" type="color" value={secondaryColor} className="sr-only"
            onChange={(e) => useEditorStore.getState().setColor(useEditorStore.getState().activeColor, e.target.value)} />
        </div>

        {/* Separator */}
        <div className="w-8 h-px bg-border mb-2" />

        {/* Tool Groups */}
        {TOOL_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col items-center gap-0.5 w-full mb-1">
            {group.tools.map((tool) => (
              <Tooltip key={tool.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setActiveTool(tool.id)}
                    aria-label={tool.label}
                    className={cn(
                      'w-9 h-9 flex items-center justify-center rounded-md transition-all duration-100',
                      'text-muted-foreground hover:text-foreground hover:bg-white/10',
                      activeTool === tool.id && 'bg-primary/20 text-primary ring-1 ring-primary/50',
                    )}
                  >
                    {tool.icon}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px] bg-tooltip-bg border-border">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-foreground text-xs">{tool.label}</span>
                    {tool.shortcut && (
                      <kbd className="text-[10px] bg-border px-1 py-0.5 rounded text-muted-foreground font-mono">{tool.shortcut}</kbd>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{tool.hint}</p>
                </TooltipContent>
              </Tooltip>
            ))}
            <div className="w-6 h-px bg-border/50 my-0.5" />
          </div>
        ))}
      </aside>
    </TooltipProvider>
  );
}
