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
      obj.set('shadow', `${fx.dropShadow.color} ${fx.dropShadow.offsetX}px ${fx.dropShadow.offsetY}px ${fx.dropShadow.blur}px`);
    }
  } else if (obj.shadow && !fx.dropShadow?.enabled) {
    obj.shadow = null;
  }

  if (fx.outerGlow?.enabled) {
    obj.shadow = new fb.Shadow({
      color: fx.outerGlow.color,
      blur: fx.outerGlow.blur * 2,
      offsetX: 0,
      offsetY: 0,
    });
  }

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
  const blurBrushRef = useRef(false);
  const animRafRef = useRef<number | null>(null);
  const videoElemsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const videoRafRef = useRef<number | null>(null);
  const cloneSourceRef = useRef<{ x: number; y: number } | null>(null);
  // For eraser: raw canvas context strokes
  const eraserLastPosRef = useRef<{ x: number; y: number } | null>(null);
  // For blur brush: raw canvas context
  const blurLastPosRef = useRef<{ x: number; y: number } | null>(null);

  const { project, addLayer, updateLayer, setSelection, pushHistory, setDuration } = useProjectStore();
  const {
    activeTool, zoom, showGrid, gridSize,
    brushSettings, eraserSettings, shapeSettings, textSettings,
    blurToolSettings,
    setZoom, setPan, setActiveTool, currentTime, timelinePlaying, setCurrentTime,
  } = useEditorStore();

  const prevLayerCountRef = useRef(0);

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

      // Brush: stroke-based, round caps, no fill
      const brush = new fb.PencilBrush(canvas);
      brush.color = brushSettings.color;
      brush.width = brushSettings.size;
      canvas.freeDrawingBrush = brush;

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
      canvas.on('selection:cleared', () => setSelection([]));

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

      // Snap-to-objects while moving — snap to edges AND centers of all nearby objects
      canvas.on('object:moving', (e: any) => {
        const { snapToLayers } = useEditorStore.getState();
        if (!snapToLayers) return;
        const obj = e.target as any;
        const SNAP = 10;
        const others = canvas.getObjects().filter((o: any) => o !== obj && !o.data?.isGrid);
        const objB = obj.getBoundingRect(true);

        const objCX = objB.left + objB.width / 2;
        const objCY = objB.top + objB.height / 2;
        const objRight = objB.left + objB.width;
        const objBottom = objB.top + objB.height;

        for (const other of others) {
          const otherB = (other as any).getBoundingRect(true);
          const otherRight = otherB.left + otherB.width;
          const otherBottom = otherB.top + otherB.height;
          const otherCX = otherB.left + otherB.width / 2;
          const otherCY = otherB.top + otherB.height / 2;

          // Horizontal snapping (X axis)
          // left edge to left
          if (Math.abs(objB.left - otherB.left) < SNAP) {
            obj.set('left', otherB.left);
          }
          // left edge to right
          else if (Math.abs(objB.left - otherRight) < SNAP) {
            obj.set('left', otherRight);
          }
          // right edge to left
          else if (Math.abs(objRight - otherB.left) < SNAP) {
            obj.set('left', otherB.left - objB.width);
          }
          // right edge to right
          else if (Math.abs(objRight - otherRight) < SNAP) {
            obj.set('left', otherRight - objB.width);
          }
          // center to center X
          else if (Math.abs(objCX - otherCX) < SNAP) {
            obj.set('left', otherCX - objB.width / 2);
          }

          // Vertical snapping (Y axis)
          if (Math.abs(objB.top - otherB.top) < SNAP) {
            obj.set('top', otherB.top);
          }
          else if (Math.abs(objB.top - otherBottom) < SNAP) {
            obj.set('top', otherBottom);
          }
          else if (Math.abs(objBottom - otherB.top) < SNAP) {
            obj.set('top', otherB.top - objB.height);
          }
          else if (Math.abs(objBottom - otherBottom) < SNAP) {
            obj.set('top', otherBottom - objB.height);
          }
          else if (Math.abs(objCY - otherCY) < SNAP) {
            obj.set('top', otherCY - objB.height / 2);
          }
        }
        obj.setCoords();
      });

      // path:created — register brush stroke as a layer (NOT eraser — eraser is handled via raw canvas)
      canvas.on('path:created', (e: any) => {
        const path = e.path;
        if (!path) return;
        const wasEraser = eraserModeRef.current;
        const wasBlur = blurBrushRef.current;

        if (wasEraser || wasBlur) {
          // Eraser/blur paths are handled at pixel level — remove the fabric path
          canvas.remove(path);
          canvas.requestRenderAll();
          return;
        }

        // Brush stroke: transparent fill, colored stroke with round caps
        const bs = useEditorStore.getState().brushSettings;
        const hex6 = bs.color.replace('#', '').padStart(6, '0');
        const r = parseInt(hex6.substring(0, 2), 16);
        const g = parseInt(hex6.substring(2, 4), 16);
        const b = parseInt(hex6.substring(4, 6), 16);
        const strokeColor = `rgba(${r},${g},${b},${bs.opacity})`;
        path.set({
          fill: 'transparent',
          stroke: strokeColor,
          strokeWidth: bs.size,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          opacity: 1,
          selectable: true,
          evented: true,
          data: { layerId: '', isBrushStroke: true },
        });

        const layer = createLayer({
          type: 'shape',
          name: 'Мазок кисти',
          x: Math.round(path.left ?? 0),
          y: Math.round(path.top ?? 0),
          width: Math.round(path.width ?? 10),
          height: Math.round(path.height ?? 10),
          strokeColor: brushSettings.color,
          strokeWidth: brushSettings.size,
          fillColor: undefined,
        });
        path.set({ data: { layerId: layer.id, isBrushStroke: true } });
        useProjectStore.getState().addLayer(layer);
        prevLayerCountRef.current = useProjectStore.getState().project.layers.length;
        pushHistory('Мазок кисти');
        useEditorStore.getState().setActiveTool('select');
      });

      // Render layers from persisted store
      const currentLayers = useProjectStore.getState().project.layers;
      for (const layer of [...currentLayers].reverse()) {
        await renderLayerToCanvas(canvas, layer, fb);
      }
      prevLayerCountRef.current = currentLayers.length;
      canvas.requestRenderAll();

      // Start video render loop
      startVideoLoop(canvas);
    })();

    return () => {
      destroyed = true;
      initializedRef.current = false;
      if (videoRafRef.current) cancelAnimationFrame(videoRafRef.current);
      if (fabricRef.current) {
        (fabricRef.current as any).dispose();
        fabricRef.current = null;
        canvasInstance = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Video render loop — marks all video fabric objects dirty each frame
  function startVideoLoop(canvas: any) {
    const tick = () => {
      if (!canvas || canvas.disposed) return;
      let hasVideo = false;
      canvas.getObjects().forEach((obj: any) => {
        const el = obj.getElement?.();
        if (el && (el.nodeName === 'VIDEO' || el.tagName === 'VIDEO')) {
          obj.set('dirty', true);
          hasVideo = true;
        }
      });
      if (hasVideo) canvas.requestRenderAll();
      videoRafRef.current = requestAnimationFrame(tick);
    };
    videoRafRef.current = requestAnimationFrame(tick);
  }

  // Watch project.layers — add new layers to canvas
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

  // Remove deleted layers from canvas
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

  // Sync store layer properties → existing fabric objects
  useEffect(() => {
    const canvas = fabricRef.current as any;
    if (!canvas) return;

    (async () => {
      const fb = await getFabric();
      for (const layer of project.layers) {
        const obj = canvas.getObjects().find((o: any) => o.data?.layerId === layer.id);
        if (!obj) continue;

        // Skip brush strokes — they manage their own appearance
        if (obj.data?.isBrushStroke) continue;

        let needsRender = false;

        if (obj.opacity !== (layer.opacity ?? 1)) { obj.set('opacity', layer.opacity ?? 1); needsRender = true; }
        const shouldVisible = layer.visible !== false;
        if (obj.visible !== shouldVisible) { obj.set('visible', shouldVisible); needsRender = true; }
        if (obj.flipX !== (layer.flipX ?? false)) { obj.set('flipX', layer.flipX ?? false); needsRender = true; }
        if (obj.flipY !== (layer.flipY ?? false)) { obj.set('flipY', layer.flipY ?? false); needsRender = true; }

        if (layer.type === 'shape') {
          const newFill = layer.fillColor ?? '#4d9bff';
          if (obj.fill !== newFill && layer.fillColor) { obj.set('fill', newFill); needsRender = true; }
          const newStroke = layer.strokeColor ?? null;
          const newStrokeWidth = layer.strokeWidth ?? 0;
          if (obj.stroke !== newStroke) { obj.set('stroke', newStroke); obj.set('strokeUniform', true); needsRender = true; }
          if (obj.strokeWidth !== newStrokeWidth) { obj.set('strokeWidth', newStrokeWidth); needsRender = true; }
        }

        if (layer.type === 'text' && obj.text !== undefined) {
          if (layer.text !== undefined && obj.text !== layer.text) { obj.set('text', layer.text); needsRender = true; }
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
            if (ts.strokeWidth > 0) {
              obj.set('stroke', ts.stroke || '#000000');
              obj.set('strokeWidth', ts.strokeWidth);
            } else {
              obj.set('stroke', null);
              obj.set('strokeWidth', 0);
            }
          }
          if (layer.fillColor && !layer.textStyle) { obj.set('fill', layer.fillColor); needsRender = true; }
        }

        await applyEffectsToObject(obj, layer, fb);
        if (needsRender) obj.setCoords?.();
      }
      canvas.requestRenderAll();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.layers]);

  // Update canvas background color when changed
  useEffect(() => {
    const canvas = fabricRef.current as any;
    if (!canvas) return;
    if (canvas.backgroundColor !== project.backgroundColor) {
      canvas.setBackgroundColor(project.backgroundColor ?? '#1a1a1f', () => {
        canvas.requestRenderAll();
      });
    }
  }, [project.backgroundColor]);

  // Update Fabric canvas dimensions when project.canvas size changes
  useEffect(() => {
    const canvas = fabricRef.current as any;
    if (!canvas) return;
    const { width, height } = project.canvas;
    if (canvas._fw === width && canvas._fh === height) return;
    canvas._fw = width;
    canvas._fh = height;
    // Re-fit: update the internal canvas size and refit to container
    fitCanvasToContainer(canvas, containerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.canvas.width, project.canvas.height]);

  // Fit canvas to container (also updates Fabric's internal canvas size)
  const fitCanvasToContainer = useCallback((canvas: any, container: HTMLDivElement | null) => {
    if (!container) return;
    const { width: pw, height: ph } = useProjectStore.getState().project.canvas;
    const cw = container.clientWidth || pw;
    const ch = container.clientHeight || ph;
    const scaleX = cw / pw;
    const scaleY = ch / ph;
    const scale = Math.min(scaleX, scaleY) * 0.85;
    canvas.setWidth(cw);
    canvas.setHeight(ch);
    const vpX = (cw - pw * scale) / 2;
    const vpY = (ch - ph * scale) / 2;
    canvas.viewportTransform = [scale, 0, 0, scale, vpX, vpY];
    canvas.requestRenderAll();
    setZoom(scale);
    setPan(vpX, vpY);
  }, [setZoom, setPan]);

  // Animation playback RAF loop
  useEffect(() => {
    if (animRafRef.current) { cancelAnimationFrame(animRafRef.current); animRafRef.current = null; }
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
          const pEnd = preset.startTime + preset.duration;
          if (t < preset.startTime || t > pEnd) continue;
          const pt = (t - preset.startTime) / preset.duration;
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

      // Sync video elements to current time
      videoElemsRef.current.forEach((vid) => {
        if (!vid.paused) return;
        const targetSecs = t / 1000;
        if (Math.abs(vid.currentTime - targetSecs) > 0.5) {
          vid.currentTime = targetSecs;
        }
      });

      canvas.requestRenderAll();
      animRafRef.current = requestAnimationFrame(tick);
    };

    animRafRef.current = requestAnimationFrame(tick);
    return () => { if (animRafRef.current) cancelAnimationFrame(animRafRef.current); animRafRef.current = null; };
  }, [timelinePlaying]);

  // Handle tool changes
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
    blurBrushRef.current = false;
    eraserLastPosRef.current = null;
    blurLastPosRef.current = null;
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
        blurBrushRef.current = false;
        (async () => {
          const fb = await getFabric();
          const brush = new fb.PencilBrush(canvas);
          const hex = brushSettings.color.replace('#', '').padStart(6, '0');
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          brush.color = `rgba(${r},${g},${b},${brushSettings.opacity})`;
          brush.width = brushSettings.size;
          // Set fill to transparent via decorate after path is created (handled in path:created)
          canvas.freeDrawingBrush = brush;
        })();
        break;
      }

      case 'eraser': {
        // Eraser: draw directly on the raw 2D canvas context using destination-out
        canvas.isDrawingMode = false;
        eraserModeRef.current = true;
        blurBrushRef.current = false;
        canvas.defaultCursor = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='${eraserSettings.size}' height='${eraserSettings.size}' viewBox='0 0 ${eraserSettings.size} ${eraserSettings.size}'><circle cx='${eraserSettings.size/2}' cy='${eraserSettings.size/2}' r='${eraserSettings.size/2-1}' fill='none' stroke='white' stroke-width='1.5'/></svg>") ${eraserSettings.size/2} ${eraserSettings.size/2}, crosshair`;
        canvas.selection = false;
        canvas.getObjects().forEach((o: any) => { o.selectable = false; o.evented = false; });
        setupEraserTool(canvas);
        break;
      }

      case 'blur': {
        // Blur brush: paint blur on the canvas
        canvas.isDrawingMode = false;
        blurBrushRef.current = true;
        eraserModeRef.current = false;
        canvas.defaultCursor = 'crosshair';
        canvas.selection = false;
        canvas.getObjects().forEach((o: any) => { o.selectable = false; o.evented = false; });
        setupBlurBrushTool(canvas);
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
  }, [activeTool, brushSettings, eraserSettings, shapeSettings, textSettings, blurToolSettings]);

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
          scaleX, scaleY,
          opacity: layer.opacity ?? 1,
          angle: layer.rotation ?? 0,
          data: { layerId: layer.id },
        });
        await applyEffectsToObject(img, layer, fb);
        canvas.add(img);
        canvas.requestRenderAll();
      } catch (err) {
        console.error('[Canvas] renderLayerToCanvas image error:', err);
      }
      return;
    }

    if (layer.type === 'video' && layer.src) {
      // Blob URLs become stale after page reload — skip them silently
      if (layer.src.startsWith('blob:')) {
        // Try to verify the blob URL is still valid
        const isAlive = await fetch(layer.src, { method: 'HEAD' }).then(() => true).catch(() => false);
        if (!isAlive) return;
      }

      let videoEl = videoElemsRef.current.get(layer.id);
      if (!videoEl) {
        videoEl = document.createElement('video');
        const isBlobUrl = layer.src.startsWith('blob:');
        if (!isBlobUrl) videoEl.crossOrigin = 'anonymous';
        videoEl.src = layer.src;
        videoEl.loop = true;
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.preload = 'auto';
        videoEl.load();
        videoElemsRef.current.set(layer.id, videoEl);
      }

      await new Promise<void>((res) => {
        if (videoEl!.readyState >= 2) { res(); return; }
        videoEl!.oncanplay = () => res();
        videoEl!.onloadeddata = () => res();
        videoEl!.onerror = () => res();
        setTimeout(res, 8000);
      });

      const vw = videoEl.videoWidth || layer.width || 1280;
      const vh = videoEl.videoHeight || layer.height || 720;
      const scaleX = layer.width ? layer.width / vw : 1;
      const scaleY = layer.height ? layer.height / vh : 1;

      let vidObj: any;
      try {
        vidObj = new fb.Image(videoEl, {
          left: layer.x ?? 0,
          top: layer.y ?? 0,
          width: vw,
          height: vh,
          scaleX,
          scaleY,
          opacity: layer.opacity ?? 1,
          angle: layer.rotation ?? 0,
          objectCaching: false,
          data: { layerId: layer.id },
        });
      } catch {
        return;
      }

      canvas.add(vidObj);
      // Attempt autoplay — might be blocked by browser policy
      videoEl.play().catch(() => {
        // On first user interaction, try again
        const tryPlay = () => {
          videoEl!.play().catch(() => {});
          document.removeEventListener('click', tryPlay);
          document.removeEventListener('keydown', tryPlay);
        };
        document.addEventListener('click', tryPlay, { once: true });
        document.addEventListener('keydown', tryPlay, { once: true });
      });
      canvas.requestRenderAll();

      const vidDurationMs = (videoEl.duration && isFinite(videoEl.duration)) ? videoEl.duration * 1000 : 0;
      if (vidDurationMs > 0) {
        // Always set duration to the video's real duration
        const currentDuration = useProjectStore.getState().project.duration;
        if (vidDurationMs > currentDuration) {
          useProjectStore.getState().setDuration(Math.ceil(vidDurationMs));
        }
        // Also update the layer's videoEnd to the real duration
        useProjectStore.getState().updateLayer(layer.id, { videoEnd: Math.ceil(vidDurationMs) });
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
      // Brush stroke paths are stored with type 'shape' but are Path objects
      // They should NOT be re-created as Rect — skip and let fabric handle via path:created
      if (layer.name === 'Мазок кисти') return;

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

      const gradientDef = buildFabricGradient(fb, g, layer.width ?? project.canvas.width, layer.height ?? project.canvas.height);
      rect.set('fill', gradientDef);
      canvas.add(rect);
    }
  }

  // Build a fabric gradient object from our Gradient type
  function buildFabricGradient(fb: any, g: import('@/store/types').Gradient, w: number, h: number) {
    const angle = (g.angle ?? 0) * (Math.PI / 180);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    if (g.type === 'linear') {
      return new fb.Gradient({
        type: 'linear',
        gradientUnits: 'pixels',
        coords: {
          x1: w / 2 - cos * w / 2,
          y1: h / 2 - sin * h / 2,
          x2: w / 2 + cos * w / 2,
          y2: h / 2 + sin * h / 2,
        },
        colorStops: [...g.stops]
          .sort((a, b) => a.offset - b.offset)
          .map((s) => ({
            offset: s.offset,
            color: s.color,
            opacity: s.opacity ?? 1,
          })),
      });
    } else {
      return new fb.Gradient({
        type: 'radial',
        gradientUnits: 'pixels',
        coords: { x1: w / 2, y1: h / 2, r1: 0, x2: w / 2, y2: h / 2, r2: Math.max(w, h) / 2 },
        colorStops: [...g.stops]
          .sort((a, b) => a.offset - b.offset)
          .map((s) => ({ offset: s.offset, color: s.color, opacity: s.opacity ?? 1 })),
      });
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
        img.set({ left: 0, top: 0, data: { layerId: layer.id } });
        canvas.add(img);
        canvas.setActiveObject(img);
        useProjectStore.getState().addLayer(layer);
        prevLayerCountRef.current = useProjectStore.getState().project.layers.length;
        canvas.requestRenderAll();
      } catch (err) {
        console.error('[Canvas] addFileToCanvas image error:', err);
      }
      return;
    }

    if (file.type.startsWith('video/')) {
      const videoEl = document.createElement('video');
      // Blob URLs don't need crossOrigin
      videoEl.src = url;
      videoEl.loop = true;
      videoEl.muted = true;
      videoEl.playsInline = true;

      await new Promise<void>((res) => {
        videoEl.onloadedmetadata = () => res();
        videoEl.onerror = () => res();
        setTimeout(res, 5000);
      });

      const vw = videoEl.videoWidth || 1280;
      const vh = videoEl.videoHeight || 720;
      const durationMs = (videoEl.duration && isFinite(videoEl.duration)) ? Math.ceil(videoEl.duration * 1000) : 10000;

      const layer = createLayer({
        type: 'video',
        name: file.name,
        src: url,
        width: vw,
        height: vh,
        videoStart: 0,
        videoEnd: durationMs,
      });

      let vidObj: any;
      try {
        vidObj = new fb.Image(videoEl, {
          left: 0, top: 0,
          width: vw,
          height: vh,
          objectCaching: false,
          data: { layerId: layer.id },
        });
      } catch {
        return;
      }

      canvas.add(vidObj);
      canvas.setActiveObject(vidObj);
      videoElemsRef.current.set(layer.id, videoEl);

      videoEl.play().catch(() => {
        const tryPlay = () => {
          videoEl.play().catch(() => {});
          document.removeEventListener('click', tryPlay);
        };
        document.addEventListener('click', tryPlay, { once: true });
      });

      useProjectStore.getState().addLayer(layer);
      prevLayerCountRef.current = useProjectStore.getState().project.layers.length;

      // Extend project duration if video is longer
      const currentDuration = useProjectStore.getState().project.duration;
      if (durationMs > currentDuration) {
        useProjectStore.getState().setDuration(durationMs);
      }

      canvas.requestRenderAll();
    }
  }

  // ─── Tool setups ────────────────────────────────────────────────────────────

  // Get the lower canvas element (actual drawing surface in Fabric.js)
  function getLowerCanvas(canvas: any): HTMLCanvasElement | null {
    // Fabric keeps the actual drawing canvas as lowerCanvasEl
    return canvas.lowerCanvasEl ?? canvas.getElement?.() ?? canvasRef.current;
  }

  // Convert a DOM mouse event to canvas-space coordinates (accounting for zoom/pan)
  function domToCanvasCoords(canvas: any, e: MouseEvent): { x: number; y: number } {
    const pointer = canvas.getPointer(e, true); // true = ignore transform, gives raw canvas px
    return { x: pointer.x, y: pointer.y };
  }

  function setupEraserTool(canvas: any) {
    const getPoint = (opt: any) => domToCanvasCoords(canvas, opt.e);

    canvas.on('mouse:down', (opt: any) => {
      isDrawingRef.current = true;
      const pt = getPoint(opt);
      eraserLastPosRef.current = pt;
      eraserPaintAt(canvas, pt.x, pt.y, pt.x, pt.y);
    });

    canvas.on('mouse:move', (opt: any) => {
      if (!isDrawingRef.current) return;
      const pt = getPoint(opt);
      const last = eraserLastPosRef.current ?? pt;
      eraserPaintAt(canvas, last.x, last.y, pt.x, pt.y);
      eraserLastPosRef.current = pt;
    });

    canvas.on('mouse:up', () => {
      isDrawingRef.current = false;
      eraserLastPosRef.current = null;
    });
  }

  function eraserPaintAt(canvas: any, x1: number, y1: number, x2: number, y2: number) {
    const lowerEl = getLowerCanvas(canvas);
    if (!lowerEl) return;
    const ctx = lowerEl.getContext('2d');
    if (!ctx) return;
    const { eraserSettings: es } = useEditorStore.getState();
    const vpt = canvas.viewportTransform as number[];
    const zoom = vpt ? vpt[0] : 1;
    // Convert from viewport coords to canvas coords
    const cx1 = vpt ? x1 * zoom + vpt[4] : x1;
    const cy1 = vpt ? y1 * zoom + vpt[5] : y1;
    const cx2 = vpt ? x2 * zoom + vpt[4] : x2;
    const cy2 = vpt ? y2 * zoom + vpt[5] : y2;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = `rgba(0,0,0,${es.opacity})`;
    ctx.lineWidth = es.size * zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx1, cy1);
    ctx.lineTo(cx2, cy2);
    ctx.stroke();
    ctx.restore();
  }

  function setupBlurBrushTool(canvas: any) {
    const getPoint = (opt: any) => domToCanvasCoords(canvas, opt.e);

    canvas.on('mouse:down', (opt: any) => {
      isDrawingRef.current = true;
      const pt = getPoint(opt);
      blurLastPosRef.current = pt;
      blurPaintAt(canvas, pt.x, pt.y);
    });

    canvas.on('mouse:move', (opt: any) => {
      if (!isDrawingRef.current) return;
      const pt = getPoint(opt);
      blurPaintAt(canvas, pt.x, pt.y);
      blurLastPosRef.current = pt;
    });

    canvas.on('mouse:up', () => {
      isDrawingRef.current = false;
      blurLastPosRef.current = null;
    });
  }

  function blurPaintAt(canvas: any, x: number, y: number) {
    const lowerEl = getLowerCanvas(canvas);
    if (!lowerEl) return;
    const ctx = lowerEl.getContext('2d');
    if (!ctx) return;
    const { blurToolSettings: bts } = useEditorStore.getState();
    const vpt = canvas.viewportTransform as number[];
    const zoom = vpt ? vpt[0] : 1;
    // Convert to screen-space for pixel operations on the lower canvas
    const cx = vpt ? x * zoom + vpt[4] : x;
    const cy = vpt ? y * zoom + vpt[5] : y;
    const r = Math.max(1, Math.round(bts.radius * zoom));
    const strength = bts.strength / 100;
    const diameter = r * 2;

    try {
      const sx = Math.round(cx - r);
      const sy = Math.round(cy - r);
      if (sx < 0 || sy < 0 || sx + diameter > lowerEl.width || sy + diameter > lowerEl.height) return;
      const imageData = ctx.getImageData(sx, sy, diameter, diameter);
      const passes = Math.max(1, Math.ceil(strength * 5));
      const blurred = boxBlur(imageData, passes);
      ctx.putImageData(blurred, sx, sy);
    } catch {
      // Possible cross-origin error — skip silently
    }
  }

  function boxBlur(imageData: ImageData, passes: number): ImageData {
    const { data, width, height } = imageData;
    const result = new Uint8ClampedArray(data);
    const temp = new Uint8ClampedArray(data);

    for (let p = 0; p < passes; p++) {
      // Horizontal pass
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let r = 0, g = 0, b = 0, a = 0, count = 0;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const idx = (y * width + nx) * 4;
            r += temp[idx]; g += temp[idx + 1]; b += temp[idx + 2]; a += temp[idx + 3];
            count++;
          }
          const idx = (y * width + x) * 4;
          result[idx] = r / count;
          result[idx + 1] = g / count;
          result[idx + 2] = b / count;
          result[idx + 3] = a / count;
        }
      }
      temp.set(result);
    }

    return new ImageData(result, width, height);
  }

  function setupPanTool(canvas: any) {
    let isPanning = false;
    let lastX = 0, lastY = 0;
    canvas.on('mouse:down', (opt: any) => {
      isPanning = true; lastX = opt.e.clientX; lastY = opt.e.clientY;
      canvas.defaultCursor = 'grabbing';
    });
    canvas.on('mouse:move', (opt: any) => {
      if (!isPanning) return;
      const vpt = canvas.viewportTransform;
      vpt[4] += opt.e.clientX - lastX;
      vpt[5] += opt.e.clientY - lastY;
      lastX = opt.e.clientX; lastY = opt.e.clientY;
      canvas.requestRenderAll();
      setPan(vpt[4], vpt[5]);
    });
    canvas.on('mouse:up', () => { isPanning = false; canvas.defaultCursor = 'grab'; });
  }

  function setupEyedropper(canvas: any) {
    canvas.on('mouse:down', (opt: any) => {
      const el: HTMLCanvasElement = (canvas as any).getElement?.() ?? canvasRef.current;
      if (!el) return;
      const ctx = el.getContext('2d');
      if (!ctx) return;
      const pointer = canvas.getPointer(opt.e);
      const z = canvas.getZoom();
      const vpt = canvas.viewportTransform;
      const px = Math.round(pointer.x * z + vpt[4]);
      const py = Math.round(pointer.y * z + vpt[5]);
      try {
        const pixel = ctx.getImageData(px, py, 1, 1).data;
        const hex = '#' +
          pixel[0].toString(16).padStart(2, '0') +
          pixel[1].toString(16).padStart(2, '0') +
          pixel[2].toString(16).padStart(2, '0');
        useEditorStore.getState().setColor(hex);
        useEditorStore.getState().updateBrush({ color: hex });
      } catch { /* cross-origin */ }
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
          left: pointer.x, top: pointer.y,
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
          selectable: false, evented: false,
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
          width: Math.abs(w), height: Math.abs(h),
        });
      } else if (settings.shapeType === 'circle') {
        activeShape.set({
          left: w < 0 ? pointer.x : startPoint.x,
          top: h < 0 ? pointer.y : startPoint.y,
          rx: Math.abs(w) / 2, ry: Math.abs(h) / 2,
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
        settings.shapeType === 'circle' ? (activeShape.rx ?? 1) * 2 :
        (settings.shapeType === 'line' || settings.shapeType === 'arrow') ? Math.abs((activeShape.x2 ?? 0) - (activeShape.x1 ?? 0)) :
        activeShape.width ?? 1
      );
      const h = Math.round(settings.shapeType === 'circle' ? (activeShape.ry ?? 1) * 2 : activeShape.height ?? 1);
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
      activeShape = null; startPoint = null;
      setActiveTool('select');
    });
  }

  function setupLassoTool(canvas: any) {
    let points: { x: number; y: number }[] = [];
    let polygon: any = null;
    let isDown = false;

    canvas.on('mouse:down', (opt: any) => {
      isDown = true; points = [];
      points.push(canvas.getPointer(opt.e));
    });
    canvas.on('mouse:move', (opt: any) => {
      if (!isDown) return;
      points.push(canvas.getPointer(opt.e));
      if (polygon) canvas.remove(polygon);
      if (points.length < 2) return;
      (async () => {
        const fb = await getFabric();
        polygon = new fb.Polyline(points, {
          stroke: '#4d9bff', strokeWidth: 1,
          fill: 'rgba(77,155,255,0.15)',
          selectable: false, evented: false,
          strokeDashArray: [4, 4],
        });
        canvas.add(polygon);
        canvas.requestRenderAll();
      })();
    });
    canvas.on('mouse:up', () => {
      isDown = false;
      if (polygon) canvas.remove(polygon);
      polygon = null; points = [];
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
          stroke: '#ffffff', strokeWidth: 1,
          strokeDashArray: [5, 5],
          fill: 'rgba(255,255,255,0.08)',
          selectable: false, evented: false,
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
        width: Math.abs(w), height: Math.abs(h),
      });
      canvas.requestRenderAll();
    });
    canvas.on('mouse:up', () => {
      if (cropRect) {
        const cropL = cropRect.left ?? 0;
        const cropT = cropRect.top ?? 0;
        const cropW = cropRect.width ?? 0;
        const cropH = cropRect.height ?? 0;

        if (cropW > 5 && cropH > 5) {
          const activeObj = canvas.getActiveObject() as any;
          (async () => {
            const fb = await getFabric();
            if (activeObj && activeObj.data?.layerId) {
              // Use absolutePositioned: true so clip is in canvas (world) coordinates
              const clip = new fb.Rect({
                left: cropL,
                top: cropT,
                width: cropW,
                height: cropH,
                absolutePositioned: true,
              });
              activeObj.clipPath = clip;
              // Update layer bounds in store to reflect the cropped region
              const layerId = activeObj.data.layerId;
              useProjectStore.getState().updateLayer(layerId, {
                x: Math.round(cropL),
                y: Math.round(cropT),
                width: Math.round(cropW),
                height: Math.round(cropH),
              });
              pushHistory('Обрезать');
              canvas.requestRenderAll();
            }
          })();
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
        cloneSourceRef.current = { x: pointer.x, y: pointer.y };
        return;
      }
      if (!cloneSourceRef.current) return;
      (async () => {
        const fb = await getFabric();
        const settings = useEditorStore.getState().cloneSettings;
        const circle = new fb.Circle({
          left: pointer.x - settings.size / 2,
          top: pointer.y - settings.size / 2,
          radius: settings.size / 2,
          fill: 'rgba(100,200,255,0.3)',
          stroke: '#4d9bff', strokeWidth: 1,
          selectable: false, evented: false,
        });
        canvas.add(circle);
        canvas.requestRenderAll();
        setTimeout(() => { canvas.remove(circle); canvas.requestRenderAll(); }, 200);
      })();
    });
  }

  function setupGradientTool(canvas: any) {
    let startPoint: { x: number; y: number } | null = null;
    let previewLine: any = null;

    canvas.on('mouse:down', (opt: any) => {
      startPoint = canvas.getPointer(opt.e);
      if (previewLine) { canvas.remove(previewLine); previewLine = null; }
    });

    canvas.on('mouse:move', (opt: any) => {
      if (!startPoint) return;
      const endPoint = canvas.getPointer(opt.e);
      (async () => {
        const fb = await getFabric();
        if (previewLine) canvas.remove(previewLine);
        previewLine = new (fb as any).Line([startPoint!.x, startPoint!.y, endPoint.x, endPoint.y], {
          stroke: '#4d9bff', strokeWidth: 1,
          strokeDashArray: [4, 4],
          selectable: false, evented: false,
        });
        canvas.add(previewLine);
        canvas.requestRenderAll();
      })();
    });

    canvas.on('mouse:up', (opt: any) => {
      if (previewLine) { canvas.remove(previewLine); previewLine = null; }
      if (!startPoint) return;
      const endPoint = canvas.getPointer(opt.e);
      const activeObj = canvas.getActiveObject() as any;

      const primaryColor = useEditorStore.getState().activeColor;
      const secondaryColor = useEditorStore.getState().secondaryColor;

      if (activeObj) {
        (async () => {
          const fb = await getFabric();
          const w = (activeObj.width ?? 100) * (activeObj.scaleX ?? 1);
          const h = (activeObj.height ?? 100) * (activeObj.scaleY ?? 1);
          const objLeft = activeObj.left ?? 0;
          const objTop = activeObj.top ?? 0;

          // Normalize drag coords relative to the object
          let x1 = (startPoint!.x - objLeft) / w;
          let y1 = (startPoint!.y - objTop) / h;
          let x2 = (endPoint.x - objLeft) / w;
          let y2 = (endPoint.y - objTop) / h;

          // If no drag, default to left→right
          const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
          if (dist < 0.02) { x1 = 0; y1 = 0.5; x2 = 1; y2 = 0.5; }

          const gradient = new fb.Gradient({
            type: 'linear',
            gradientUnits: 'percentage',
            coords: { x1, y1, x2, y2 },
            colorStops: [
              { offset: 0, color: primaryColor },
              { offset: 1, color: secondaryColor },
            ],
          });
          activeObj.set('fill', gradient);
          canvas.requestRenderAll();

          const layerId = activeObj.data?.layerId;
          if (layerId) {
            useProjectStore.getState().updateLayer(layerId, {
              gradient: {
                type: 'linear', angle: 0,
                stops: [
                  { id: '1', offset: 0, color: primaryColor, opacity: 1 },
                  { id: '2', offset: 1, color: secondaryColor, opacity: 1 },
                ],
              },
            });
          }
        })();
      } else {
        // No object selected: create a new gradient layer covering the canvas
        (async () => {
          const fb = await getFabric();
          const w = project.canvas.width;
          const h = project.canvas.height;

          const gradientDef = new fb.Gradient({
            type: 'linear',
            gradientUnits: 'pixels',
            coords: {
              x1: startPoint!.x,
              y1: startPoint!.y,
              x2: endPoint.x,
              y2: endPoint.y,
            },
            colorStops: [
              { offset: 0, color: primaryColor },
              { offset: 1, color: secondaryColor },
            ],
          });

          const rect = new fb.Rect({
            left: 0, top: 0, width: w, height: h, selectable: true,
          });
          rect.set('fill', gradientDef);

          const layer = createLayer({
            type: 'gradient', name: 'Градиент',
            x: 0, y: 0, width: w, height: h,
            gradient: { type: 'linear', angle: 0, stops: [
              { id: '1', offset: 0, color: primaryColor, opacity: 1 },
              { id: '2', offset: 1, color: secondaryColor, opacity: 1 },
            ]},
          });
          rect.set({ data: { layerId: layer.id } });
          canvas.add(rect);
          canvas.sendToBack(rect);
          useProjectStore.getState().addLayer(layer);
          prevLayerCountRef.current = useProjectStore.getState().project.layers.length;
          canvas.requestRenderAll();
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
      <div className="absolute inset-0 transparency-bg opacity-30 pointer-events-none" />
      <canvas ref={canvasRef} className="relative z-10" style={{ display: 'block' }} />
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
    case 'blur': return 'crosshair';
    default: return 'default';
  }
}
