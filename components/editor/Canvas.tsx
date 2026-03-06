'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useProjectStore, createLayer } from '@/store/projectStore';
import { useEditorStore } from '@/store/editorStore';
import type { ToolType } from '@/store/types';

let fabric: typeof import('fabric') | null = null;

async function getFabric() {
  if (!fabric) {
    fabric = await import('fabric');
  }
  return fabric;
}

interface FabricCanvas extends InstanceType<(typeof import('fabric'))['Canvas']> {}

let canvasInstance: FabricCanvas | null = null;

export function getCanvasInstance() {
  return canvasInstance;
}

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const isDrawingRef = useRef(false);
  const initializedRef = useRef(false);

  const { project, addLayer, updateLayer, setSelection, pushHistory } = useProjectStore();
  const {
    activeTool, zoom, showGrid, gridSize,
    brushSettings, shapeSettings, textSettings,
    setZoom, setPan, setActiveTool,
  } = useEditorStore();

  // Initialize Fabric.js canvas once
  useEffect(() => {
    if (!canvasRef.current || initializedRef.current) return;
    initializedRef.current = true;
    let destroyed = false;

    (async () => {
      const fb = await getFabric();
      if (destroyed || !canvasRef.current) return;

      const canvas = new fb.Canvas(canvasRef.current, {
        width: project.canvas.width,
        height: project.canvas.height,
        backgroundColor: project.backgroundColor ?? '#1a1a1f',
        selection: true,
        preserveObjectStacking: true,
        stopContextMenu: true,
        enableRetinaScaling: false,
        renderOnAddRemove: true,
      });

      // Initialize PencilBrush immediately so freeDrawingBrush is never undefined
      canvas.freeDrawingBrush = new fb.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = brushSettings.color;
      canvas.freeDrawingBrush.width = brushSettings.size;

      fabricRef.current = canvas as unknown as FabricCanvas;
      canvasInstance = canvas as unknown as FabricCanvas;

      // Fit canvas to container on init
      fitCanvasToContainer(canvas, containerRef.current);

      // Mouse wheel zoom
      canvas.on('mouse:wheel', (opt) => {
        const delta = opt.e.deltaY;
        let newZoom = canvas.getZoom() * (delta > 0 ? 0.95 : 1.05);
        newZoom = Math.min(Math.max(newZoom, 0.05), 20);
        canvas.zoomToPoint(new (fb as any).Point(opt.e.offsetX, opt.e.offsetY), newZoom);
        setZoom(newZoom);
        opt.e.preventDefault();
        opt.e.stopPropagation();
      });

      // Object selection sync
      canvas.on('selection:created', (e) => {
        const ids = ((e as any).selected || []).map((o: any) => o.data?.layerId).filter(Boolean);
        setSelection(ids);
      });
      canvas.on('selection:updated', (e) => {
        const ids = ((e as any).selected || []).map((o: any) => o.data?.layerId).filter(Boolean);
        setSelection(ids);
      });
      canvas.on('selection:cleared', () => {
        setSelection([]);
      });

      // Object modified — sync back to store
      canvas.on('object:modified', (e) => {
        const obj = e.target as any;
        if (!obj?.data?.layerId) return;
        updateLayer(obj.data.layerId, {
          x: Math.round(obj.left ?? 0),
          y: Math.round(obj.top ?? 0),
          width: Math.round((obj.width ?? 0) * (obj.scaleX ?? 1)),
          height: Math.round((obj.height ?? 0) * (obj.scaleY ?? 1)),
          rotation: Math.round(obj.angle ?? 0),
          scaleX: obj.scaleX ?? 1,
          scaleY: obj.scaleY ?? 1,
        });
        pushHistory('Переместить объект');
      });

      // Render any layers already in the store (e.g. file opened from start screen)
      const currentLayers = useProjectStore.getState().project.layers;
      for (const layer of [...currentLayers].reverse()) {
        await renderLayerToCanvas(canvas, layer, fb);
      }

      canvas.requestRenderAll();
    })();

    return () => {
      destroyed = true;
      initializedRef.current = false;
      if (fabricRef.current) {
        (fabricRef.current as any).dispose();
        fabricRef.current = null;
        canvasInstance = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch project.layers — when a new layer is added to the store, add it to the canvas
  const prevLayerCountRef = useRef(0);
  useEffect(() => {
    const canvas = fabricRef.current as any;
    if (!canvas) return;
    const layers = project.layers;
    if (layers.length <= prevLayerCountRef.current) {
      prevLayerCountRef.current = layers.length;
      return;
    }
    prevLayerCountRef.current = layers.length;

    // Find newly added layers (ones not yet on canvas)
    const existingIds = new Set(
      canvas.getObjects().map((o: any) => o.data?.layerId).filter(Boolean)
    );
    const newLayers = layers.filter((l) => !existingIds.has(l.id));

    (async () => {
      const fb = await getFabric();
      for (const layer of newLayers) {
        await renderLayerToCanvas(canvas, layer, fb);
      }
      canvas.requestRenderAll();
    })();
  }, [project.layers]);

  // Fit canvas to container
  const fitCanvasToContainer = useCallback((canvas: any, container: HTMLDivElement | null) => {
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const scaleX = cw / project.canvas.width;
    const scaleY = ch / project.canvas.height;
    const scale = Math.min(scaleX, scaleY) * 0.85;
    canvas.setZoom(scale);
    canvas.setWidth(cw);
    canvas.setHeight(ch);
    const vpX = (cw - project.canvas.width * scale) / 2;
    const vpY = (ch - project.canvas.height * scale) / 2;
    canvas.viewportTransform = [scale, 0, 0, scale, vpX, vpY];
    canvas.requestRenderAll();
    setZoom(scale);
    setPan(vpX, vpY);
  }, [project.canvas.width, project.canvas.height, setZoom, setPan]);

  // Handle tool changes
  useEffect(() => {
    const canvas = fabricRef.current as any;
    if (!canvas) return;

    // Reset
    canvas.isDrawingMode = false;
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.selection = true;
    canvas.off('mouse:down');
    canvas.off('mouse:move');
    canvas.off('mouse:up');

    switch (activeTool) {
      case 'select':
      case 'move':
        canvas.selection = true;
        canvas.defaultCursor = 'default';
        break;

      case 'brush':
        canvas.isDrawingMode = true;
        // freeDrawingBrush is always initialized in the setup useEffect
        if (canvas.freeDrawingBrush) {
          canvas.freeDrawingBrush.color = brushSettings.color;
          canvas.freeDrawingBrush.width = brushSettings.size;
        }
        break;

      case 'eraser':
        canvas.isDrawingMode = true;
        try {
          const EraserBrush = (fabric as any)?.EraserBrush;
          if (EraserBrush) {
            canvas.freeDrawingBrush = new EraserBrush(canvas);
          }
          if (canvas.freeDrawingBrush) {
            canvas.freeDrawingBrush.width = useEditorStore.getState().eraserSettings.size;
          }
        } catch {
          // Fallback: use white pencil brush as eraser
          if (canvas.freeDrawingBrush) {
            canvas.freeDrawingBrush.color = '#1a1a1f';
            canvas.freeDrawingBrush.width = useEditorStore.getState().eraserSettings.size;
          }
        }
        break;

      case 'hand':
        canvas.defaultCursor = 'grab';
        canvas.selection = false;
        setupPanTool(canvas);
        break;

      case 'eyedropper':
        canvas.defaultCursor = 'crosshair';
        canvas.selection = false;
        setupEyedropper(canvas);
        break;

      case 'zoom':
        canvas.defaultCursor = 'zoom-in';
        canvas.selection = false;
        canvas.on('mouse:down', async (opt: any) => {
          const fb = await getFabric();
          const alt = opt.e.altKey;
          let z = canvas.getZoom() * (alt ? 0.8 : 1.25);
          z = Math.min(Math.max(z, 0.05), 20);
          canvas.zoomToPoint(new (fb as any).Point(opt.e.offsetX, opt.e.offsetY), z);
          setZoom(z);
        });
        break;

      case 'text':
        canvas.defaultCursor = 'text';
        canvas.selection = false;
        setupTextTool(canvas);
        break;

      case 'shape':
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        setupShapeTool(canvas);
        break;

      case 'crop':
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        break;
    }

    canvas.requestRenderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, brushSettings, shapeSettings, textSettings]);

  // Sync zoom from store
  useEffect(() => {
    const canvas = fabricRef.current as any;
    if (!canvas) return;
    const currentZoom = canvas.getZoom();
    if (Math.abs(currentZoom - zoom) > 0.001) {
      canvas.setZoom(zoom);
      canvas.requestRenderAll();
    }
  }, [zoom]);

  // Grid overlay
  useEffect(() => {
    const canvas = fabricRef.current as any;
    if (!canvas) return;
    renderGrid(canvas, showGrid, gridSize, project.canvas);
  }, [showGrid, gridSize, project.canvas]);

  // Drag and drop onto canvas container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const canvas = fabricRef.current as any;
      if (!canvas) return;
      const files = Array.from(e.dataTransfer?.files ?? []);
      const fb = await getFabric();
      for (const file of files) {
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
          await addFileToCanvas(canvas, file, fb);
        }
      }
    };

    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);
    return () => {
      container.removeEventListener('dragover', handleDragOver);
      container.removeEventListener('drop', handleDrop);
    };
  }, []);

  // ----- Helpers -----

  async function renderLayerToCanvas(canvas: any, layer: any, fb: any) {
    // Skip if already on canvas
    const existing = canvas.getObjects().find((o: any) => o.data?.layerId === layer.id);
    if (existing) return;

    if (layer.type === 'image' && layer.src) {
      return new Promise<void>((resolve) => {
        fb.Image.fromURL(
          layer.src,
          (img: any) => {
            if (!img) { resolve(); return; }
            // Scale to fit canvas if the image is larger
            const scaleX = layer.width ? layer.width / (img.width || 1) : 1;
            const scaleY = layer.height ? layer.height / (img.height || 1) : 1;
            img.set({
              left: layer.x ?? 0,
              top: layer.y ?? 0,
              scaleX,
              scaleY,
              opacity: layer.opacity ?? 1,
              angle: layer.rotation ?? 0,
              data: { layerId: layer.id },
            });
            canvas.add(img);
            resolve();
          },
          { crossOrigin: 'anonymous' }
        );
      });
    }

    if (layer.type === 'text') {
      const text = new (fb as any).IText(layer.text || 'Текст', {
        left: layer.x ?? 0,
        top: layer.y ?? 0,
        fontFamily: layer.fontFamily ?? 'Inter',
        fontSize: layer.fontSize ?? 48,
        fill: layer.fillColor ?? '#ffffff',
        opacity: layer.opacity ?? 1,
        angle: layer.rotation ?? 0,
        data: { layerId: layer.id },
      });
      canvas.add(text);
    }

    if (layer.type === 'shape') {
      let shape: any;
      const commonProps = {
        left: layer.x ?? 0,
        top: layer.y ?? 0,
        fill: layer.fillColor ?? '#4d9bff',
        stroke: layer.strokeColor,
        strokeWidth: layer.strokeWidth ?? 0,
        opacity: layer.opacity ?? 1,
        angle: layer.rotation ?? 0,
        data: { layerId: layer.id },
      };
      if (layer.shapeType === 'circle') {
        shape = new fb.Ellipse({ ...commonProps, rx: (layer.width ?? 100) / 2, ry: (layer.height ?? 100) / 2 });
      } else {
        shape = new fb.Rect({ ...commonProps, width: layer.width ?? 100, height: layer.height ?? 100 });
      }
      canvas.add(shape);
    }
  }

  async function addFileToCanvas(canvas: any, file: File, fb: any) {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('image/')) {
      return new Promise<void>((resolve) => {
        fb.Image.fromURL(
          url,
          (img: any) => {
            if (!img) { resolve(); return; }
            const w = img.width || 400;
            const h = img.height || 300;
            const layer = createLayer({
              type: 'image',
              name: file.name,
              src: url,
              x: 0, y: 0,
              width: w,
              height: h,
            });
            img.set({
              left: 0, top: 0,
              data: { layerId: layer.id },
            });
            canvas.add(img);
            useProjectStore.getState().addLayer(layer);
            // Mark as already on canvas so the layers watcher doesn't duplicate it
            prevLayerCountRef.current = useProjectStore.getState().project.layers.length;
            canvas.requestRenderAll();
            resolve();
          },
          { crossOrigin: 'anonymous' }
        );
      });
    }

    if (file.type.startsWith('video/')) {
      const videoEl = document.createElement('video');
      videoEl.src = url;
      videoEl.crossOrigin = 'anonymous';
      videoEl.loop = true;
      videoEl.muted = true;
      await new Promise<void>((res) => {
        videoEl.onloadedmetadata = () => res();
        videoEl.onerror = () => res();
      });
      const layer = createLayer({
        type: 'video',
        name: file.name,
        src: url,
        width: videoEl.videoWidth || 1280,
        height: videoEl.videoHeight || 720,
        videoEnd: (videoEl.duration || 10) * 1000,
      });
      const vidObj = new fb.Image(videoEl, {
        left: 0, top: 0,
        objectCaching: false,
        data: { layerId: layer.id },
      });
      canvas.add(vidObj);
      videoEl.play();
      const animate = () => {
        if (!fabricRef.current) return;
        canvas.requestRenderAll();
        requestAnimationFrame(animate);
      };
      animate();
      useProjectStore.getState().addLayer(layer);
      prevLayerCountRef.current = useProjectStore.getState().project.layers.length;
    }
  }

  function setupPanTool(canvas: any) {
    let isPanning = false;
    let lastX = 0, lastY = 0;
    canvas.on('mouse:down', (opt: any) => {
      isPanning = true;
      lastX = opt.e.clientX;
      lastY = opt.e.clientY;
      canvas.defaultCursor = 'grabbing';
    });
    canvas.on('mouse:move', (opt: any) => {
      if (!isPanning) return;
      const vpt = canvas.viewportTransform;
      vpt[4] += opt.e.clientX - lastX;
      vpt[5] += opt.e.clientY - lastY;
      lastX = opt.e.clientX;
      lastY = opt.e.clientY;
      canvas.requestRenderAll();
      setPan(vpt[4], vpt[5]);
    });
    canvas.on('mouse:up', () => {
      isPanning = false;
      canvas.defaultCursor = 'grab';
    });
  }

  function setupEyedropper(canvas: any) {
    canvas.on('mouse:down', (opt: any) => {
      const pointer = canvas.getPointer(opt.e);
      const ctx = (canvas as any).getContext?.();
      if (!ctx) return;
      const z = canvas.getZoom();
      const vpt = canvas.viewportTransform;
      const px = Math.round(pointer.x * z + vpt[4]);
      const py = Math.round(pointer.y * z + vpt[5]);
      const pixel = ctx.getImageData(px, py, 1, 1).data;
      const hex = `#${pixel[0].toString(16).padStart(2, '0')}${pixel[1].toString(16).padStart(2, '0')}${pixel[2].toString(16).padStart(2, '0')}`;
      useEditorStore.getState().setColor(hex);
      setActiveTool('select');
    });
  }

  function setupTextTool(canvas: any) {
    canvas.on('mouse:down', (opt: any) => {
      if (opt.target) return;
      const pointer = canvas.getPointer(opt.e);
      (async () => {
        const fb = await getFabric();
        const ts = useEditorStore.getState().textSettings;
        const text = new (fb as any).IText('Текст здесь', {
          left: pointer.x,
          top: pointer.y,
          fontFamily: ts.fontFamily,
          fontSize: ts.fontSize,
          fontWeight: ts.fontWeight,
          fontStyle: ts.fontStyle,
          textAlign: ts.textAlign,
          fill: ts.color,
          lineHeight: ts.lineHeight,
          charSpacing: ts.letterSpacing,
          editable: true,
        });
        const layer = createLayer({
          type: 'text',
          name: 'Текстовый слой',
          text: 'Текст здесь',
          x: Math.round(pointer.x),
          y: Math.round(pointer.y),
          width: 300, height: 60,
          fillColor: ts.color,
        });
        text.set({ data: { layerId: layer.id } });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        useProjectStore.getState().addLayer(layer);
        prevLayerCountRef.current = useProjectStore.getState().project.layers.length;
        setActiveTool('select');
      })();
    });
  }

  function setupShapeTool(canvas: any) {
    let startPoint: { x: number; y: number } | null = null;
    let activeShape: any = null;

    canvas.on('mouse:down', (opt: any) => {
      if (opt.target) return;
      const pointer = canvas.getPointer(opt.e);
      startPoint = pointer;
      isDrawingRef.current = true;

      (async () => {
        const fb = await getFabric();
        const settings = useEditorStore.getState().shapeSettings;
        const commonProps = {
          left: pointer.x, top: pointer.y,
          fill: settings.fillColor,
          stroke: settings.strokeWidth > 0 ? settings.strokeColor : undefined,
          strokeWidth: settings.strokeWidth,
          selectable: false,
          evented: false,
        };

        switch (settings.shapeType) {
          case 'rect':
            activeShape = new fb.Rect({ ...commonProps, width: 1, height: 1, rx: settings.cornerRadius });
            break;
          case 'circle':
            activeShape = new fb.Ellipse({ ...commonProps, rx: 1, ry: 1 });
            break;
          case 'line':
          case 'arrow':
            activeShape = new (fb as any).Line([pointer.x, pointer.y, pointer.x, pointer.y], {
              stroke: settings.strokeColor,
              strokeWidth: settings.strokeWidth || 2,
              selectable: false,
            });
            break;
          default:
            activeShape = new fb.Rect({ ...commonProps, width: 1, height: 1 });
        }
        if (activeShape) canvas.add(activeShape);
      })();
    });

    canvas.on('mouse:move', (opt: any) => {
      if (!isDrawingRef.current || !startPoint || !activeShape) return;
      const pointer = canvas.getPointer(opt.e);
      const w = pointer.x - startPoint.x;
      const h = pointer.y - startPoint.y;
      const settings = useEditorStore.getState().shapeSettings;

      if (settings.shapeType === 'rect') {
        activeShape.set({
          left: w < 0 ? pointer.x : startPoint.x,
          top: h < 0 ? pointer.y : startPoint.y,
          width: Math.abs(w),
          height: Math.abs(h),
        });
      } else if (settings.shapeType === 'circle') {
        activeShape.set({
          left: w < 0 ? pointer.x : startPoint.x,
          top: h < 0 ? pointer.y : startPoint.y,
          rx: Math.abs(w) / 2,
          ry: Math.abs(h) / 2,
        });
      } else if (['line', 'arrow'].includes(settings.shapeType)) {
        activeShape.set({ x2: pointer.x, y2: pointer.y });
      }
      canvas.requestRenderAll();
    });

    canvas.on('mouse:up', () => {
      if (!isDrawingRef.current || !activeShape) return;
      isDrawingRef.current = false;
      const settings = useEditorStore.getState().shapeSettings;
      const layer = createLayer({
        type: 'shape',
        name: settings.shapeType === 'rect' ? 'Прямоугольник' :
              settings.shapeType === 'circle' ? 'Эллипс' :
              settings.shapeType === 'line' ? 'Линия' : 'Фигура',
        shapeType: settings.shapeType,
        fillColor: settings.fillColor,
        strokeColor: settings.strokeColor,
        strokeWidth: settings.strokeWidth,
        x: Math.round(activeShape.left ?? 0),
        y: Math.round(activeShape.top ?? 0),
        width: Math.round(activeShape.width ?? 1),
        height: Math.round(activeShape.height ?? 1),
      });
      activeShape.set({ selectable: true, evented: true, data: { layerId: layer.id } });
      canvas.setActiveObject(activeShape);
      useProjectStore.getState().addLayer(layer);
      prevLayerCountRef.current = useProjectStore.getState().project.layers.length;
      pushHistory(`Добавить: ${layer.name}`);
      activeShape = null;
      startPoint = null;
      setActiveTool('select');
    });
  }

  function renderGrid(canvas: any, show: boolean, size: number, canvasSize: { width: number; height: number }) {
    const objs: any[] = canvas.getObjects().filter((o: any) => o.data?.isGrid);
    objs.forEach((o: any) => canvas.remove(o));
    if (!show) { canvas.requestRenderAll(); return; }

    (async () => {
      const fb = await getFabric();
      const lines: any[] = [];
      for (let x = 0; x <= canvasSize.width; x += size) {
        lines.push(new (fb as any).Line([x, 0, x, canvasSize.height], {
          stroke: '#3a3a4540', strokeWidth: 1,
          selectable: false, evented: false, data: { isGrid: true },
        }));
      }
      for (let y = 0; y <= canvasSize.height; y += size) {
        lines.push(new (fb as any).Line([0, y, canvasSize.width, y], {
          stroke: '#3a3a4540', strokeWidth: 1,
          selectable: false, evented: false, data: { isGrid: true },
        }));
      }
      lines.forEach((l) => canvas.add(l));
      if (lines[0]) canvas.sendToBack(lines[0]);
      canvas.requestRenderAll();
    })();
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full canvas-bg flex items-center justify-center overflow-hidden"
      style={{ cursor: getCursor(activeTool) }}
    >
      {/* Checkerboard transparency pattern */}
      <div className="absolute inset-0 transparency-bg opacity-30 pointer-events-none" />

      <canvas
        ref={canvasRef}
        className="relative z-10"
        style={{ display: 'block' }}
      />

      {/* Canvas size indicator */}
      <div className="absolute bottom-2 left-2 text-xs text-muted-foreground font-mono bg-black/50 px-2 py-0.5 rounded pointer-events-none z-20">
        {project.canvas.width} × {project.canvas.height} px &nbsp;|&nbsp; {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}

function getCursor(tool: ToolType): string {
  switch (tool) {
    case 'hand': return 'grab';
    case 'zoom': return 'zoom-in';
    case 'eyedropper': return 'crosshair';
    case 'text': return 'text';
    case 'crop': return 'crosshair';
    case 'brush': return 'crosshair';
    case 'eraser': return 'cell';
    case 'shape': return 'crosshair';
    default: return 'default';
  }
}
