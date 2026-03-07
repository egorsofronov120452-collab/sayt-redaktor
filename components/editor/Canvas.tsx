'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useProjectStore, createLayer } from '@/store/projectStore';
import { useEditorStore } from '@/store/editorStore';
import type { ToolType, Keyframe, AnimationTrack } from '@/store/types';

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

// ─── Keyframe interpolation ────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function interpolateTrack(track: AnimationTrack, time: number): number | null {
  const kfs = [...track.keyframes].sort((a, b) => a.time - b.time);
  if (kfs.length === 0) return null;
  if (time <= kfs[0].time) return kfs[0].value as number;
  if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value as number;

  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (time >= a.time && time <= b.time) {
      const t = (time - a.time) / (b.time - a.time);
      return lerp(a.value as number, b.value as number, t);
    }
  }
  return null;
}

// ─── Apply fabric Shadow/Glow from layer effects ──────────────────────────
async function applyEffectsToObject(obj: any, layer: import('@/store/types').Layer, fb: any) {
  const fx = layer.effects;
  if (!fx) return;

  // Drop Shadow
  if (fx.dropShadow?.enabled) {
    try {
      obj.shadow = new fb.Shadow({
        color: fx.dropShadow.color,
        blur: fx.dropShadow.blur,
        offsetX: fx.dropShadow.offsetX,
        offsetY: fx.dropShadow.offsetY,
        affectStroke: false,
      });
    } catch {
      // fabric v5 compat
      obj.set('shadow', `${fx.dropShadow.color} ${fx.dropShadow.offsetX}px ${fx.dropShadow.offsetY}px ${fx.dropShadow.blur}px`);
    }
  } else if (!fx.dropShadow?.enabled && obj.shadow) {
    obj.shadow = null;
  }

  // Outer Glow — implemented via large shadow with 0 offset
  if (fx.outerGlow?.enabled) {
    try {
      obj.shadow = new fb.Shadow({
        color: fx.outerGlow.color,
        blur: fx.outerGlow.blur * 2,
        offsetX: 0,
        offsetY: 0,
      });
    } catch {
      obj.set('shadow', `${fx.outerGlow.color} 0px 0px ${fx.outerGlow.blur * 2}px`);
    }
  }

  // Stroke from effects panel (overrides shape strokeWidth)
  if (fx.stroke?.enabled) {
    obj.set('stroke', fx.stroke.color);
    obj.set('strokeWidth', fx.stroke.width);
    obj.set('strokeUniform', true);
  }
}

// ─── Canvas component ──────────────────────────────────────────────────────
export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const isDrawingRef = useRef(false);
  const initializedRef = useRef(false);
  const eraserModeRef = useRef(false);
  const animRafRef = useRef<number | null>(null);
  // clone stamp source point
  const cloneSourceRef = useRef<{ x: number; y: number } | null>(null);
  const cloneImageDataRef = useRef<ImageData | null>(null);

  const { project, addLayer, updateLayer, setSelection, pushHistory } = useProjectStore();
  const {
    activeTool, zoom, showGrid, gridSize,
    brushSettings, eraserSettings, shapeSettings, textSettings,
    setZoom, setPan, setActiveTool, currentTime, timelinePlaying, setCurrentTime,
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

      canvas.freeDrawingBrush = new fb.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = brushSettings.color;
      canvas.freeDrawingBrush.width = brushSettings.size;

      fabricRef.current = canvas as unknown as FabricCanvas;
      canvasInstance = canvas as unknown as FabricCanvas;

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

      // path:created — register brush/eraser stroke as a layer
      canvas.on('path:created', (e: any) => {
        const path = e.path;
        if (!path) return;
        const wasEraser = eraserModeRef.current;
        if (wasEraser) {
          path.set({
            globalCompositeOperation: 'destination-out',
            selectable: true,
            evented: true,
          });
        }
        const layerName = wasEraser ? 'Ластик' : 'Мазок кисти';
        const layer = createLayer({
          type: 'shape',
          name: layerName,
          x: Math.round(path.left ?? 0),
          y: Math.round(path.top ?? 0),
          width: Math.round(path.width ?? 10),
          height: Math.round(path.height ?? 10),
          fillColor: wasEraser ? 'transparent' : brushSettings.color,
        });
        path.set({ data: { layerId: layer.id } });
        useProjectStore.getState().addLayer(layer);
        prevLayerCountRef.current = useProjectStore.getState().project.layers.length;
        pushHistory(layerName);
        // Return to select after drawing
        useEditorStore.getState().setActiveTool('select');
      });

      // Render layers from store (persisted project)
      const currentLayers = useProjectStore.getState().project.layers;
      for (const layer of [...currentLayers].reverse()) {
        await renderLayerToCanvas(canvas, layer, fb);
      }
      prevLayerCountRef.current = currentLayers.length;
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

  // ── Watch project.layers — add new layers to canvas ──────────────────────
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

    const existingIds = new Set(
      canvas.getObjects().map((o: any) => o.data?.layerId).filter(Boolean)
    );
    const newLayers = layers.filter((l: any) => !existingIds.has(l.id));

    (async () => {
      const fb = await getFabric();
      for (const layer of newLayers) {
        await renderLayerToCanvas(canvas, layer, fb);
      }
      canvas.requestRenderAll();
    })();
  }, [project.layers]);

  // ── Remove deleted layers from canvas ─────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current as any;
    if (!canvas) return;
    const layerIds = new Set(project.layers.map((l: any) => l.id));
    const toRemove = canvas.getObjects().filter((o: any) => o.data?.layerId && !layerIds.has(o.data.layerId));
    if (toRemove.length > 0) {
      toRemove.forEach((o: any) => canvas.remove(o));
      canvas.requestRenderAll();
    }
  }, [project.layers]);

  // ── Sync store layer properties → existing fabric objects ─────────────────
  useEffect(() => {
    const canvas = fabricRef.current as any;
    if (!canvas) return;

    (async () => {
      const fb = await getFabric();
      for (const layer of project.layers) {
        const obj = canvas.getObjects().find((o: any) => o.data?.layerId === layer.id);
        if (!obj) continue;

        let needsRender = false;

        // Opacity
        if (obj.opacity !== (layer.opacity ?? 1)) {
          obj.set('opacity', layer.opacity ?? 1);
          needsRender = true;
        }

        // Visibility
        const shouldVisible = layer.visible !== false;
        if (obj.visible !== shouldVisible) {
          obj.set('visible', shouldVisible);
          needsRender = true;
        }

        // Flip
        if (obj.flipX !== (layer.flipX ?? false)) { obj.set('flipX', layer.flipX ?? false); needsRender = true; }
        if (obj.flipY !== (layer.flipY ?? false)) { obj.set('flipY', layer.flipY ?? false); needsRender = true; }

        // Shape: fill / stroke (only update fill, don't change stroke blindly)
        if (layer.type === 'shape') {
          const newFill = layer.fillColor ?? '#4d9bff';
          if (obj.fill !== newFill && layer.fillColor) {
            obj.set('fill', newFill);
            needsRender = true;
          }
          // Only apply strokeColor if it's explicitly set on the layer (not from effects)
          const newStroke = layer.strokeColor ?? null;
          const newStrokeWidth = layer.strokeWidth ?? 0;
          if (obj.stroke !== newStroke) { obj.set('stroke', newStroke); obj.set('strokeUniform', true); needsRender = true; }
          if (obj.strokeWidth !== newStrokeWidth) { obj.set('strokeWidth', newStrokeWidth); needsRender = true; }
        }

        // Text: content + style
        if (layer.type === 'text' && obj.text !== undefined) {
          if (layer.text !== undefined && obj.text !== layer.text) {
            obj.set('text', layer.text);
            needsRender = true;
          }
          const ts = layer.textStyle;
          if (ts) {
            if (obj.fill !== ts.color) { obj.set('fill', ts.color); needsRender = true; }
            if (obj.fontFamily !== ts.fontFamily) { obj.set('fontFamily', ts.fontFamily); needsRender = true; }
            if (obj.fontSize !== ts.fontSize) { obj.set('fontSize', ts.fontSize); needsRender = true; }
            if (obj.fontWeight !== String(ts.fontWeight)) { obj.set('fontWeight', String(ts.fontWeight)); needsRender = true; }
            if (obj.fontStyle !== ts.fontStyle) { obj.set('fontStyle', ts.fontStyle); needsRender = true; }
            if (obj.textAlign !== ts.textAlign) { obj.set('textAlign', ts.textAlign); needsRender = true; }
            if (obj.charSpacing !== ts.letterSpacing) { obj.set('charSpacing', ts.letterSpacing); needsRender = true; }
            if (obj.underline !== (ts.textDecoration === 'underline')) { obj.set('underline', ts.textDecoration === 'underline'); needsRender = true; }
            // Text stroke (outline)
            if (ts.strokeWidth > 0) {
              obj.set('stroke', ts.stroke || '#000000');
              obj.set('strokeWidth', ts.strokeWidth);
            } else {
              obj.set('stroke', null);
              obj.set('strokeWidth', 0);
            }
          }
          // fillColor on text as fallback
          if (layer.fillColor && !layer.textStyle) {
            obj.set('fill', layer.fillColor);
            needsRender = true;
          }
        }

        // Apply layer effects (shadow, glow, stroke from effects panel)
        await applyEffectsToObject(obj, layer, fb);

        if (needsRender) {
          obj.setCoords?.();
        }
      }
      canvas.requestRenderAll();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.layers]);

  // ── Fit canvas to container ───────────────────────────────────────────────
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

  // ── Animation playback RAF loop ───────────────────────────────────────────
  useEffect(() => {
    if (animRafRef.current) {
      cancelAnimationFrame(animRafRef.current);
      animRafRef.current = null;
    }
    if (!timelinePlaying) return;

    const duration = useProjectStore.getState().project.duration;
    let lastTs: number | null = null;

    const tick = (ts: number) => {
      if (!fabricRef.current) return;
      const canvas = fabricRef.current as any;
      if (lastTs === null) lastTs = ts;
      const dt = ts - lastTs;
      lastTs = ts;

      const store = useProjectStore.getState();
      let t = useEditorStore.getState().currentTime + dt;
      if (t >= duration) t = 0;
      useEditorStore.getState().setCurrentTime(t);

      for (const anim of store.project.animations) {
        const obj = canvas.getObjects().find((o: any) => o.data?.layerId === anim.layerId);
        if (!obj) continue;
        for (const track of anim.tracks) {
          if (!track.enabled) continue;
          const val = interpolateTrack(track, t);
          if (val === null) continue;
          switch (track.property) {
            case 'opacity': obj.set('opacity', Math.max(0, Math.min(1, val))); break;
            case 'x': obj.set('left', val); break;
            case 'y': obj.set('top', val); break;
            case 'scaleX': obj.set('scaleX', val); break;
            case 'scaleY': obj.set('scaleY', val); break;
            case 'rotation': obj.set('angle', val); break;
          }
          obj.setCoords?.();
        }
        for (const preset of anim.presets) {
          const pStart = preset.startTime;
          const pEnd = preset.startTime + preset.duration;
          if (t < pStart || t > pEnd) continue;
          const pt = (t - pStart) / preset.duration;
          switch (preset.preset) {
            case 'fade-in': obj.set('opacity', pt); break;
            case 'fade-out': obj.set('opacity', 1 - pt); break;
            case 'scale-up': obj.set('scaleX', pt); obj.set('scaleY', pt); break;
            case 'slide-in-left': obj.set('left', lerp(-obj.width, (obj as any)._origLeft ?? obj.left, pt)); break;
            case 'slide-in-right': obj.set('left', lerp(canvas.getWidth(), (obj as any)._origLeft ?? obj.left, pt)); break;
            case 'rotate-in': obj.set('angle', lerp(-180, 0, pt)); break;
          }
          obj.setCoords?.();
        }
      }
      canvas.requestRenderAll();
      animRafRef.current = requestAnimationFrame(tick);
    };

    animRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRafRef.current) cancelAnimationFrame(animRafRef.current);
      animRafRef.current = null;
    };
  }, [timelinePlaying]);

  // ── Handle tool changes ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current as any;
    if (!canvas) return;

    // Reset all modes
    canvas.isDrawingMode = false;
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.selection = true;
    canvas.off('mouse:down');
    canvas.off('mouse:move');
    canvas.off('mouse:up');
    eraserModeRef.current = false;
    // Re-enable object interactivity for non-drawing tools
    canvas.getObjects().forEach((o: any) => {
      if (o.data?.isGrid) return;
      o.selectable = true;
      o.evented = true;
    });

    switch (activeTool) {
      case 'select':
      case 'move':
        canvas.selection = true;
        canvas.defaultCursor = 'default';
        break;

      case 'brush': {
        canvas.isDrawingMode = true;
        eraserModeRef.current = false;
        (async () => {
          const fb = await getFabric();
          const brush = new fb.PencilBrush(canvas);
          brush.color = brushSettings.color;
          brush.width = brushSettings.size;
          (brush as any).opacity = brushSettings.opacity;
          canvas.freeDrawingBrush = brush;
        })();
        break;
      }

      case 'eraser': {
        canvas.isDrawingMode = true;
        eraserModeRef.current = true;
        (async () => {
          const fb = await getFabric();
          const brush = new fb.PencilBrush(canvas);
          brush.color = 'rgba(0,0,0,1)';
          brush.width = eraserSettings.size;
          canvas.freeDrawingBrush = brush;
        })();
        break;
      }

      case 'hand':
        canvas.defaultCursor = 'grab';
        canvas.selection = false;
        canvas.getObjects().forEach((o: any) => { o.selectable = false; o.evented = false; });
        setupPanTool(canvas);
        break;

      case 'eyedropper':
        canvas.defaultCursor = 'crosshair';
        canvas.selection = false;
        canvas.getObjects().forEach((o: any) => { o.selectable = false; o.evented = false; });
        setupEyedropper(canvas);
        break;

      case 'zoom':
        canvas.defaultCursor = 'zoom-in';
        canvas.selection = false;
        canvas.getObjects().forEach((o: any) => { o.selectable = false; o.evented = false; });
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

      case 'lasso':
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        setupLassoTool(canvas);
        break;

      case 'crop':
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        setupCropTool(canvas);
        break;

      case 'clone':
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        setupCloneTool(canvas);
        break;

      case 'magic-wand':
        // Magic wand selects similar color areas; for now just select clicked object
        canvas.selection = true;
        canvas.defaultCursor = 'crosshair';
        break;

      case 'gradient':
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        setupGradientTool(canvas);
        break;
    }

    canvas.requestRenderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, brushSettings, eraserSettings, shapeSettings, textSettings]);

  // ── Sync zoom from store ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current as any;
    if (!canvas) return;
    const currentZoom = canvas.getZoom();
    if (Math.abs(currentZoom - zoom) > 0.001) {
      canvas.setZoom(zoom);
      canvas.requestRenderAll();
    }
  }, [zoom]);

  // ── Grid overlay ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current as any;
    if (!canvas) return;
    renderGrid(canvas, showGrid, gridSize, project.canvas);
  }, [showGrid, gridSize, project.canvas]);

  // ── Drag and drop onto canvas container ──────────────────────────────────
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

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async function renderLayerToCanvas(canvas: any, layer: any, fb: any) {
    const existing = canvas.getObjects().find((o: any) => o.data?.layerId === layer.id);
    if (existing) return;

    if (layer.type === 'image' && layer.src) {
      try {
        let img: any;
        try {
          img = await fb.Image.fromURL(layer.src, { crossOrigin: 'anonymous' });
        } catch {
          img = await new Promise<any>((resolve) => {
            fb.Image.fromURL(layer.src, (i: any) => resolve(i), { crossOrigin: 'anonymous' });
          });
        }
        if (!img) return;
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
        await applyEffectsToObject(img, layer, fb);
        canvas.add(img);
        canvas.requestRenderAll();
      } catch (err) {
        console.error('[v0] renderLayerToCanvas image error:', err);
      }
      return;
    }

    if (layer.type === 'text') {
      const ts = layer.textStyle;
      const text = new (fb as any).IText(layer.text || 'Текст', {
        left: layer.x ?? 0,
        top: layer.y ?? 0,
        fontFamily: ts?.fontFamily ?? 'Inter',
        fontSize: ts?.fontSize ?? 48,
        fontWeight: ts?.fontWeight ? String(ts.fontWeight) : '700',
        fontStyle: ts?.fontStyle ?? 'normal',
        textAlign: ts?.textAlign ?? 'left',
        fill: ts?.color ?? layer.fillColor ?? '#ffffff',
        opacity: layer.opacity ?? 1,
        angle: layer.rotation ?? 0,
        editable: true,
        data: { layerId: layer.id },
      });
      await applyEffectsToObject(text, layer, fb);
      canvas.add(text);
    }

    if (layer.type === 'shape') {
      let shape: any;
      const commonProps = {
        left: layer.x ?? 0,
        top: layer.y ?? 0,
        fill: layer.fillColor ?? '#4d9bff',
        stroke: layer.strokeColor ?? null,
        strokeWidth: layer.strokeWidth ?? 0,
        strokeUniform: true,
        opacity: layer.opacity ?? 1,
        angle: layer.rotation ?? 0,
        data: { layerId: layer.id },
      };
      if (layer.shapeType === 'circle') {
        shape = new fb.Ellipse({ ...commonProps, rx: (layer.width ?? 100) / 2, ry: (layer.height ?? 100) / 2 });
      } else if (['line', 'arrow'].includes(layer.shapeType)) {
        shape = new (fb as any).Line([0, 0, layer.width ?? 100, 0], { ...commonProps });
      } else {
        shape = new fb.Rect({ ...commonProps, width: layer.width ?? 100, height: layer.height ?? 100 });
      }
      await applyEffectsToObject(shape, layer, fb);
      canvas.add(shape);
    }

    // Gradient layer
    if (layer.type === 'gradient' && layer.gradient) {
      const g = layer.gradient;
      const rect = new fb.Rect({
        left: layer.x ?? 0, top: layer.y ?? 0,
        width: layer.width ?? project.canvas.width,
        height: layer.height ?? project.canvas.height,
        opacity: layer.opacity ?? 1,
        angle: layer.rotation ?? 0,
        selectable: true,
        data: { layerId: layer.id },
      });
      if (g.type === 'linear') {
        rect.set('fill', new fb.Gradient({
          type: 'linear',
          gradientUnits: 'percentage',
          coords: { x1: 0, y1: 0, x2: 1, y2: 0 },
          colorStops: g.stops.map((s: any) => ({ offset: s.offset, color: s.color, opacity: s.opacity })),
        }));
      } else {
        rect.set('fill', new fb.Gradient({
          type: 'radial',
          gradientUnits: 'percentage',
          coords: { x1: 0.5, y1: 0.5, r1: 0, x2: 0.5, y2: 0.5, r2: 0.5 },
          colorStops: g.stops.map((s: any) => ({ offset: s.offset, color: s.color, opacity: s.opacity })),
        }));
      }
      canvas.add(rect);
    }
  }

  async function addFileToCanvas(canvas: any, file: File, fb: any) {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('image/')) {
      try {
        let img: any;
        try {
          img = await fb.Image.fromURL(url, { crossOrigin: 'anonymous' });
        } catch {
          img = await new Promise<any>((resolve) => {
            fb.Image.fromURL(url, (i: any) => resolve(i), { crossOrigin: 'anonymous' });
          });
        }
        if (!img) return;
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
        canvas.setActiveObject(img);
        useProjectStore.getState().addLayer(layer);
        prevLayerCountRef.current = useProjectStore.getState().project.layers.length;
        canvas.requestRenderAll();
      } catch (err) {
        console.error('[v0] addFileToCanvas error:', err);
      }
      return;
    }

    if (file.type.startsWith('video/')) {
      const videoEl = document.createElement('video');
      videoEl.src = url;
      videoEl.crossOrigin = 'anonymous';
      videoEl.loop = true;
      videoEl.muted = true;
      videoEl.playsInline = true;
      await new Promise<void>((res) => {
        videoEl.onloadedmetadata = () => res();
        videoEl.onerror = () => res();
        setTimeout(res, 3000);
      });
      const vw = videoEl.videoWidth || 1280;
      const vh = videoEl.videoHeight || 720;
      const layer = createLayer({
        type: 'video',
        name: file.name,
        src: url,
        width: vw,
        height: vh,
        videoEnd: (videoEl.duration || 10) * 1000,
      });
      const vidObj = new fb.Image(videoEl, {
        left: 0, top: 0,
        width: vw,
        height: vh,
        objectCaching: false,
        data: { layerId: layer.id },
      });
      canvas.add(vidObj);
      canvas.setActiveObject(vidObj);

      // Video render loop
      const animate = () => {
        if (!fabricRef.current) return;
        vidObj.set('dirty', true);
        canvas.requestRenderAll();
        requestAnimationFrame(animate);
      };

      videoEl.play().then(() => animate()).catch(() => {
        // autoplay blocked — user must click play
        animate();
      });

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
      // Get the underlying HTML canvas element and read pixel color
      const el: HTMLCanvasElement = (canvas as any).getElement?.() ?? canvasRef.current;
      if (!el) return;
      const ctx = el.getContext('2d');
      if (!ctx) return;
      const pointer = canvas.getPointer(opt.e);
      const zoom = canvas.getZoom();
      const vpt = canvas.viewportTransform;
      // Convert canvas coordinates to screen pixel coordinates
      const px = Math.round(pointer.x * zoom + vpt[4]);
      const py = Math.round(pointer.y * zoom + vpt[5]);
      try {
        const pixel = ctx.getImageData(px, py, 1, 1).data;
        const hex = '#' +
          pixel[0].toString(16).padStart(2, '0') +
          pixel[1].toString(16).padStart(2, '0') +
          pixel[2].toString(16).padStart(2, '0');
        useEditorStore.getState().setColor(hex);
        useEditorStore.getState().updateBrush({ color: hex });
      } catch {
        // cross-origin pixel read may fail
      }
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
          fontWeight: String(ts.fontWeight),
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
          textStyle: {
            fontFamily: ts.fontFamily,
            fontSize: ts.fontSize,
            fontWeight: ts.fontWeight as number,
            fontStyle: ts.fontStyle,
            textDecoration: '',
            textAlign: ts.textAlign,
            lineHeight: ts.lineHeight,
            letterSpacing: ts.letterSpacing,
            color: ts.color,
            stroke: '',
            strokeWidth: 0,
            shadow: null,
          },
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
          stroke: settings.strokeWidth > 0 ? settings.strokeColor : null,
          strokeWidth: settings.strokeWidth,
          strokeUniform: true,
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
      const w = Math.round(
        settings.shapeType === 'circle'
          ? (activeShape.rx ?? 1) * 2
          : settings.shapeType === 'line' || settings.shapeType === 'arrow'
            ? Math.abs((activeShape.x2 ?? 0) - (activeShape.x1 ?? 0))
            : activeShape.width ?? 1
      );
      const h = Math.round(
        settings.shapeType === 'circle'
          ? (activeShape.ry ?? 1) * 2
          : activeShape.height ?? 1
      );
      const layer = createLayer({
        type: 'shape',
        name: settings.shapeType === 'rect' ? 'Прямоугольник' :
              settings.shapeType === 'circle' ? 'Эллипс' :
              settings.shapeType === 'line' ? 'Линия' : 'Фигура',
        shapeType: settings.shapeType,
        fillColor: settings.fillColor,
        strokeColor: settings.strokeWidth > 0 ? settings.strokeColor : undefined,
        strokeWidth: settings.strokeWidth,
        x: Math.round(activeShape.left ?? 0),
        y: Math.round(activeShape.top ?? 0),
        width: Math.max(w, 1),
        height: Math.max(h, 1),
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

  function setupLassoTool(canvas: any) {
    let points: { x: number; y: number }[] = [];
    let polygon: any = null;
    let isDown = false;

    canvas.on('mouse:down', (opt: any) => {
      isDown = true;
      points = [];
      const pointer = canvas.getPointer(opt.e);
      points.push(pointer);
    });

    canvas.on('mouse:move', (opt: any) => {
      if (!isDown) return;
      const pointer = canvas.getPointer(opt.e);
      points.push(pointer);

      if (polygon) canvas.remove(polygon);
      if (points.length < 2) return;

      (async () => {
        const fb = await getFabric();
        polygon = new fb.Polyline(points, {
          stroke: '#4d9bff',
          strokeWidth: 1,
          fill: 'rgba(77,155,255,0.15)',
          selectable: false,
          evented: false,
          strokeDashArray: [4, 4],
        });
        canvas.add(polygon);
        canvas.requestRenderAll();
      })();
    });

    canvas.on('mouse:up', () => {
      isDown = false;
      if (polygon) canvas.remove(polygon);
      polygon = null;
      points = [];
      setActiveTool('select');
    });
  }

  function setupCropTool(canvas: any) {
    let startPoint: { x: number; y: number } | null = null;
    let cropRect: any = null;

    canvas.on('mouse:down', (opt: any) => {
      if (cropRect) { canvas.remove(cropRect); cropRect = null; }
      const pointer = canvas.getPointer(opt.e);
      startPoint = pointer;

      (async () => {
        const fb = await getFabric();
        cropRect = new fb.Rect({
          left: pointer.x, top: pointer.y,
          width: 1, height: 1,
          stroke: '#ffffff',
          strokeWidth: 1,
          strokeDashArray: [5, 5],
          fill: 'rgba(255,255,255,0.05)',
          selectable: false,
          evented: false,
        });
        canvas.add(cropRect);
      })();
    });

    canvas.on('mouse:move', (opt: any) => {
      if (!startPoint || !cropRect) return;
      const pointer = canvas.getPointer(opt.e);
      const w = pointer.x - startPoint.x;
      const h = pointer.y - startPoint.y;
      cropRect.set({
        left: w < 0 ? pointer.x : startPoint.x,
        top: h < 0 ? pointer.y : startPoint.y,
        width: Math.abs(w),
        height: Math.abs(h),
      });
      canvas.requestRenderAll();
    });

    canvas.on('mouse:up', () => {
      if (cropRect) {
        // Apply crop to canvas background
        const bounds = {
          x: Math.round(cropRect.left ?? 0),
          y: Math.round(cropRect.top ?? 0),
          width: Math.round(cropRect.width ?? 0),
          height: Math.round(cropRect.height ?? 0),
        };
        if (bounds.width > 10 && bounds.height > 10) {
          useProjectStore.getState().setCanvasSize({ width: bounds.width, height: bounds.height });
        }
        canvas.remove(cropRect);
        cropRect = null;
      }
      startPoint = null;
      setActiveTool('select');
    });
  }

  function setupCloneTool(canvas: any) {
    canvas.on('mouse:down', (opt: any) => {
      const pointer = canvas.getPointer(opt.e);
      if (opt.e.altKey) {
        // Alt+click sets source
        cloneSourceRef.current = { x: pointer.x, y: pointer.y };
        // Capture canvas pixel data at source
        const el: HTMLCanvasElement = (canvas as any).getElement?.() ?? canvasRef.current;
        const ctx = el?.getContext('2d');
        if (ctx) {
          const zoom = canvas.getZoom();
          const vpt = canvas.viewportTransform;
          const px = Math.round(pointer.x * zoom + vpt[4]);
          const py = Math.round(pointer.y * zoom + vpt[5]);
          const size = useEditorStore.getState().cloneSettings.size;
          try {
            cloneImageDataRef.current = ctx.getImageData(px - size / 2, py - size / 2, size, size);
          } catch { /* ignore cross-origin */ }
        }
        return;
      }

      if (!cloneSourceRef.current) return;

      // Draw clone brush stroke at destination
      (async () => {
        const fb = await getFabric();
        const settings = useEditorStore.getState().cloneSettings;
        // Draw a circle at destination as clone indicator
        const circle = new fb.Circle({
          left: pointer.x - settings.size / 2,
          top: pointer.y - settings.size / 2,
          radius: settings.size / 2,
          fill: 'rgba(100,200,255,0.4)',
          stroke: '#4d9bff',
          strokeWidth: 1,
          selectable: false,
          evented: false,
        });
        canvas.add(circle);
        canvas.requestRenderAll();
        setTimeout(() => { canvas.remove(circle); canvas.requestRenderAll(); }, 300);
      })();
    });
  }

  function setupGradientTool(canvas: any) {
    let startPoint: { x: number; y: number } | null = null;

    canvas.on('mouse:down', (opt: any) => {
      startPoint = canvas.getPointer(opt.e);
    });

    canvas.on('mouse:up', (opt: any) => {
      if (!startPoint) return;
      const endPoint = canvas.getPointer(opt.e);
      const activeObj = canvas.getActiveObject() as any;

      if (activeObj) {
        (async () => {
          const fb = await getFabric();
          const w = activeObj.width ?? 100;
          const h = activeObj.height ?? 100;
          const primaryColor = useEditorStore.getState().activeColor;
          const secondaryColor = useEditorStore.getState().secondaryColor;

          const gradient = new fb.Gradient({
            type: 'linear',
            gradientUnits: 'percentage',
            coords: {
              x1: (startPoint!.x - (activeObj.left ?? 0)) / w,
              y1: (startPoint!.y - (activeObj.top ?? 0)) / h,
              x2: (endPoint.x - (activeObj.left ?? 0)) / w,
              y2: (endPoint.y - (activeObj.top ?? 0)) / h,
            },
            colorStops: [
              { offset: 0, color: primaryColor },
              { offset: 1, color: secondaryColor },
            ],
          });
          activeObj.set('fill', gradient);
          canvas.requestRenderAll();

          // Update layer in store
          const layerId = activeObj.data?.layerId;
          if (layerId) {
            useProjectStore.getState().updateLayer(layerId, {
              gradient: {
                type: 'linear',
                angle: 0,
                stops: [
                  { id: '1', offset: 0, color: primaryColor, opacity: 1 },
                  { id: '2', offset: 1, color: secondaryColor, opacity: 1 },
                ],
              },
            });
          }
        })();
      }

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
    case 'lasso': return 'crosshair';
    case 'gradient': return 'crosshair';
    case 'clone': return 'copy';
    default: return 'default';
  }
}
