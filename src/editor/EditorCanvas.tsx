// The interactive canvas. Composites layers and handles tool input.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { actions, getState, useEditor } from "./store";
import {
  makeCanvas,
  type Layer,
  type RasterLayer,
  type Selection,
  type TextLayer,
  type ToolId,
} from "./types";
import { compositeDoc, drawLayer, layerSizeOf } from "./composite";
import {
  HANDLE_UNITS,
  localToDoc,
  rotateDrag,
  scaleDrag,
  type HandleId,
  type Point,
  type TransformProps,
} from "./transform";
import {
  combineMasks,
  featherMask,
  maskFromPolygon,
  maskFromWand,
  selectionFromMask,
} from "./selection";
import {
  clippedLayerDraw,
  constrainShape,
  drawGradient,
  drawShape,
  hexToRgba,
  type GradientStyle,
  type ShapeStyle,
} from "./draw";
import { copyToClipboard } from "./clipboard";
import { FONTS } from "./fonts";
import { Bold, Italic, Check } from "lucide-react";

interface ViewState {
  zoom: number;
  tx: number;
  ty: number;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 16;

// Single-key tool shortcuts, matching the (X) hints in the toolbar tooltips.
const TOOL_KEYS: Record<string, ToolId> = {
  v: "move",
  m: "select-rect",
  l: "lasso",
  w: "wand",
  b: "brush",
  e: "eraser",
  g: "fill",
  u: "shape",
  d: "gradient",
  s: "clone",
  i: "eyedropper",
  t: "text",
  c: "crop",
};

export function EditorCanvas() {
  const s = useEditor();
  const { doc, tool } = s;
  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const [view, setView] = useState<ViewState>({ zoom: 1, tx: 0, ty: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const interaction = useRef<InteractionState | null>(null);
  // Live preview of the lasso polygon while the user is drawing it.
  const [lassoPreview, setLassoPreview] = useState<{ x: number; y: number }[] | null>(null);
  // Live preview of a shape or gradient being dragged out.
  const [shapePreview, setShapePreview] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const [gradientPreview, setGradientPreview] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  // In-canvas text editor (replaces the old window.prompt flow).
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const textEditorRef = useRef<HTMLTextAreaElement>(null);

  // Fit on first mount / when doc size changes drastically
  useEffect(() => {
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.width, doc.height]);

  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const pad = 64;
    const cw = el.clientWidth - pad;
    const ch = el.clientHeight - pad;
    const zoom = Math.min(cw / doc.width, ch / doc.height, 1);
    setView({
      zoom,
      tx: (el.clientWidth - doc.width * zoom) / 2,
      ty: (el.clientHeight - doc.height * zoom) / 2,
    });
  }, [doc.width, doc.height]);

  // Composite all layers into the display canvas
  useEffect(() => {
    const display = displayRef.current;
    if (!display) return;
    display.width = doc.width;
    display.height = doc.height;
    const ctx = display.getContext("2d")!;
    ctx.clearRect(0, 0, doc.width, doc.height);
    for (const layer of doc.layers) {
      if (!layer.visible) continue;
      // While a text layer is being edited, the live <textarea> overlay shows
      // its text; skip compositing it here so the two don't render on top of
      // each other (the "double text" ghost).
      if (layer.id === editingTextId) continue;
      drawLayer(ctx, layer);
    }
  }, [s.version, doc, editingTextId]);

  // Draw selection overlay (marching-ants for rect, contour tint for mask,
  // and a live preview while drawing a lasso).
  useEffect(() => {
    const ov = overlayRef.current;
    if (!ov) return;
    ov.width = doc.width;
    ov.height = doc.height;
    const ctx = ov.getContext("2d")!;
    ctx.clearRect(0, 0, ov.width, ov.height);

    if (doc.selection) {
      const { x, y, w, h, mask } = doc.selection;
      if (mask) {
        // Tint the selected pixels and stroke the bounding rect.
        const tinted = makeCanvas(doc.width, doc.height);
        const tctx = tinted.getContext("2d")!;
        tctx.fillStyle = "#7cc4ff";
        tctx.fillRect(0, 0, doc.width, doc.height);
        tctx.globalCompositeOperation = "destination-in";
        tctx.drawImage(mask, 0, 0);
        ctx.globalAlpha = 0.28;
        ctx.drawImage(tinted, 0, 0);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = "#7cc4ff";
      ctx.lineWidth = 2 / view.zoom;
      ctx.setLineDash([8 / view.zoom, 6 / view.zoom]);
      ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    }

    if (lassoPreview && lassoPreview.length > 1) {
      ctx.strokeStyle = "#7cc4ff";
      ctx.lineWidth = 1.5 / view.zoom;
      ctx.setLineDash([6 / view.zoom, 4 / view.zoom]);
      ctx.beginPath();
      ctx.moveTo(lassoPreview[0].x, lassoPreview[0].y);
      for (let i = 1; i < lassoPreview.length; i++)
        ctx.lineTo(lassoPreview[i].x, lassoPreview[i].y);
      ctx.stroke();
    }

    if (gradientPreview) {
      // WYSIWYG preview of the gradient across the doc, clipped to the selection.
      ctx.save();
      if (doc.selection) {
        ctx.beginPath();
        ctx.rect(doc.selection.x, doc.selection.y, doc.selection.w, doc.selection.h);
        ctx.clip();
      }
      drawGradient(
        ctx,
        gradientStyleOf(tool),
        gradientPreview.x0,
        gradientPreview.y0,
        gradientPreview.x1,
        gradientPreview.y1,
        doc.width,
        doc.height,
      );
      ctx.restore();
      ctx.strokeStyle = "#7cc4ff";
      ctx.lineWidth = 1.5 / view.zoom;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(gradientPreview.x0, gradientPreview.y0);
      ctx.lineTo(gradientPreview.x1, gradientPreview.y1);
      ctx.stroke();
    }

    if (shapePreview) {
      drawShape(
        ctx,
        shapeStyleOf(tool),
        shapePreview.x0,
        shapePreview.y0,
        shapePreview.x1,
        shapePreview.y1,
      );
    }

    // Clone-stamp source marker.
    if (tool.tool === "clone" && tool.cloneSource) {
      const c = tool.cloneSource;
      const r = 7 / view.zoom;
      ctx.strokeStyle = "#7cc4ff";
      ctx.lineWidth = 1.5 / view.zoom;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.moveTo(c.x - r * 1.6, c.y);
      ctx.lineTo(c.x + r * 1.6, c.y);
      ctx.moveTo(c.x, c.y - r * 1.6);
      ctx.lineTo(c.x, c.y + r * 1.6);
      ctx.stroke();
    }

    // Free-transform handles around the active layer while the Move tool is up.
    if (tool.tool === "move" && !editingTextId) {
      const active = doc.layers.find((l) => l.id === doc.activeLayerId);
      if (active && active.visible && !active.locked) {
        drawTransformHandles(ctx, active, view.zoom);
      }
    }
  }, [
    doc.selection,
    doc.width,
    doc.height,
    view.zoom,
    s.version,
    lassoPreview,
    shapePreview,
    gradientPreview,
    tool,
    editingTextId,
    doc.layers,
    doc.activeLayerId,
  ]);

  // Keyboard: space-to-pan, undo/redo, delete selection, single-key tool switching
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Never hijack keys while typing in a field or editing canvas text.
      const target = e.target as HTMLElement | null;
      const typing =
        !!editingTextId ||
        (target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable));

      if (e.code === "Space" && !typing) {
        setSpaceDown(true);
        e.preventDefault();
      }
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) actions.redo();
        else actions.undo();
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        actions.redo();
      }
      if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        actions.setSelection(null);
      }
      // Copy/Cut the flattened selection (or whole doc) as a PNG.
      if (meta && (e.key.toLowerCase() === "c" || e.key.toLowerCase() === "x") && !typing) {
        e.preventDefault();
        void copyToClipboard(e.key.toLowerCase() === "x").catch(() => {});
      }
      if (e.key === "Escape") actions.setSelection(null);
      if (e.key === "0" && meta) {
        e.preventDefault();
        fitView();
      }
      // Delete the active layer (Photoshop-style), unless typing/editing text.
      // Read live state so the handler never holds a stale active layer.
      if ((e.key === "Delete" || e.key === "Backspace") && !meta && !typing) {
        const active = actions.activeLayer();
        if (active) {
          e.preventDefault();
          actions.deleteLayer(active.id);
        }
      }
      // Enter applies the crop when the Crop tool has a marked area.
      if (e.key === "Enter" && !meta && !typing) {
        const st = getState();
        if (st.tool.tool === "crop" && st.doc.selection) {
          e.preventDefault();
          actions.cropToSelection();
        }
      }

      // Single-key tool shortcuts (no modifier, not while typing). These match
      // the hints shown in the toolbar tooltips.
      if (!meta && !e.altKey && !typing) {
        const tool = TOOL_KEYS[e.key.toLowerCase()];
        if (tool) {
          e.preventDefault();
          actions.setTool({ tool });
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [fitView, editingTextId]);

  // Wheel zoom
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const el = containerRef.current!;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const next = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const docX = (mx - view.tx) / view.zoom;
    const docY = (my - view.ty) / view.zoom;
    setView({ zoom: next, tx: mx - docX * next, ty: my - docY * next });
  };

  // Pointer interactions
  const toDocPos = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - view.tx) / view.zoom,
      y: (e.clientY - rect.top - view.ty) / view.zoom,
    };
  };

  const commitSelection = (newMask: HTMLCanvasElement | null) => {
    if (!newMask) {
      if (tool.selectionMode === "replace") actions.setSelection(null);
      return;
    }
    if (tool.feather > 0) featherMask(newMask, tool.feather);
    const combined = combineMasks(
      doc.selection?.mask,
      newMask,
      tool.selectionMode,
      doc.width,
      doc.height,
    );
    actions.setSelection(selectionFromMask(combined));
  };

  const commitTextEdit = useCallback(() => {
    setEditingTextId((id) => {
      if (!id) return null;
      const l = actions.activeLayer();
      if (l && l.id === id && l.type === "text" && l.text.trim() === "") {
        actions.deleteLayer(id);
      }
      return null;
    });
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    // Clicking anywhere outside the text editor first commits the edit.
    if (editingTextId) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag !== "TEXTAREA") {
        commitTextEdit();
        // Don't process this click further â€” let user place a new cursor next time.
        return;
      }
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    if (spaceDown || e.button === 1) {
      setPanning(true);
      interaction.current = {
        kind: "pan",
        startX: e.clientX,
        startY: e.clientY,
        tx: view.tx,
        ty: view.ty,
      };
      return;
    }
    const p = toDocPos(e);

    // Text tool runs before the "no active layer" guard so it always works.
    if (tool.tool === "text") {
      actions.addLayer("text");
      const layer = actions.activeLayer() as TextLayer | null;
      if (!layer) return;
      actions.updateLayer(layer.id, {
        text: "Your text",
        x: p.x,
        y: p.y,
        fontFamily: tool.fontFamily,
        fontSize: tool.fontSize,
        color: tool.brushColor,
      });
      setEditingTextId(layer.id);
      requestAnimationFrame(() => {
        const ta = textEditorRef.current;
        if (ta) {
          ta.focus();
          ta.select();
        }
      });
      return;
    }

    const active = actions.activeLayer();

    if (tool.tool === "lasso") {
      interaction.current = { kind: "lasso", points: [p] };
      setLassoPreview([p]);
      return;
    }
    if (tool.tool === "wand") {
      const raster = state_activeRaster();
      if (!raster) return;
      const mask = maskFromWand(
        raster.canvas,
        p.x,
        p.y,
        tool.tolerance,
        tool.wandContiguous,
        { x: raster.x, y: raster.y },
        doc.width,
        doc.height,
      );
      commitSelection(mask);
      return;
    }

    if (!active) return;

    if (tool.tool === "brush" || tool.tool === "eraser") {
      const raster = actions.activeRaster();
      if (!raster) return;
      const onMask = tool.maskEdit && !!raster.mask;
      actions.beginStroke(raster.id, onMask ? "mask" : "pixels");
      paintStamp(
        raster,
        p.x,
        p.y,
        tool.tool === "eraser",
        tool,
        doc.selection,
        onMask ? raster.mask : undefined,
      );
      interaction.current = {
        kind: "paint",
        lastX: p.x,
        lastY: p.y,
        layerId: raster.id,
        erase: tool.tool === "eraser",
        onMask,
      };
    } else if (tool.tool === "fill") {
      const raster = actions.activeRaster();
      if (!raster) return;
      actions.recordRaster("Fill", raster.id, () => {
        floodFill(
          raster.canvas,
          Math.floor(p.x),
          Math.floor(p.y),
          tool.brushColor,
          doc.selection,
          tool.tolerance,
        );
      });
    } else if (tool.tool === "shape") {
      const raster = actions.activeRaster();
      if (!raster) return;
      interaction.current = {
        kind: "shape",
        layerId: raster.id,
        x0: p.x,
        y0: p.y,
        x1: p.x,
        y1: p.y,
      };
      setShapePreview({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    } else if (tool.tool === "clone") {
      const raster = actions.activeRaster();
      if (!raster) return;
      if (e.altKey) {
        actions.setTool({ cloneSource: { x: p.x, y: p.y } });
        return;
      }
      if (!tool.cloneSource) return;
      // Snapshot the layer at stroke start so we don't re-clone fresh paint.
      const source = makeCanvas(raster.canvas.width, raster.canvas.height);
      source.getContext("2d")!.drawImage(raster.canvas, 0, 0);
      const offsetX = p.x - tool.cloneSource.x;
      const offsetY = p.y - tool.cloneSource.y;
      actions.beginStroke(raster.id);
      cloneStamp(raster, source, p.x, p.y, offsetX, offsetY, tool, doc.selection);
      interaction.current = {
        kind: "clone",
        layerId: raster.id,
        lastX: p.x,
        lastY: p.y,
        source,
        offsetX,
        offsetY,
      };
    } else if (tool.tool === "gradient") {
      const raster = actions.activeRaster();
      if (!raster) return;
      interaction.current = {
        kind: "gradient",
        layerId: raster.id,
        x0: p.x,
        y0: p.y,
        x1: p.x,
        y1: p.y,
      };
      setGradientPreview({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    } else if (tool.tool === "select-rect" || tool.tool === "crop") {
      // Crop reuses the rectangular-selection drag: the user marks the area to
      // keep, then applies via the panel button or Enter.
      interaction.current = { kind: "select", startX: p.x, startY: p.y };
      actions.setSelection({ x: p.x, y: p.y, w: 0, h: 0 });
    } else if (tool.tool === "move") {
      // Grabbing a transform handle scales/rotates; anywhere else drags.
      if (!active.locked) {
        const handle = hitTestHandle(active, p, view.zoom);
        if (handle) {
          interaction.current = {
            kind: "transform",
            layerId: active.id,
            handle,
            size: layerSizeOf(active),
            start: snapshotProps(active),
          };
          return;
        }
      }
      interaction.current = {
        kind: "move",
        layerId: active.id,
        startX: p.x,
        startY: p.y,
        origX: active.x,
        origY: active.y,
      };
    } else if (tool.tool === "eyedropper") {
      const px = sampleColor(doc.layers, Math.floor(p.x), Math.floor(p.y), doc.width, doc.height);
      if (px) actions.setTool({ brushColor: px });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const it = interaction.current;
    if (!it) return;
    if (it.kind === "pan") {
      setView((v) => ({
        ...v,
        tx: it.tx + (e.clientX - it.startX),
        ty: it.ty + (e.clientY - it.startY),
      }));
      return;
    }
    const p = toDocPos(e);
    if (it.kind === "paint") {
      const raster = actions.activeLayer() as RasterLayer;
      if (!raster) return;
      const maskTarget = it.onMask ? raster.mask : undefined;
      if (it.onMask && !maskTarget) return;
      const dx = p.x - it.lastX;
      const dy = p.y - it.lastY;
      const dist = Math.hypot(dx, dy);
      const step = Math.max(1, tool.brushSize * 0.2);
      const n = Math.max(1, Math.floor(dist / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        paintStamp(
          raster,
          it.lastX + dx * t,
          it.lastY + dy * t,
          it.erase,
          tool,
          doc.selection,
          maskTarget,
        );
      }
      it.lastX = p.x;
      it.lastY = p.y;
      actions.setTool({});
    } else if (it.kind === "select") {
      const x = Math.min(it.startX, p.x);
      const y = Math.min(it.startY, p.y);
      const w = Math.abs(p.x - it.startX);
      const h = Math.abs(p.y - it.startY);
      actions.setSelection({ x, y, w, h });
    } else if (it.kind === "move") {
      actions.updateLayer(it.layerId, {
        x: it.origX + (p.x - it.startX),
        y: it.origY + (p.y - it.startY),
      });
    } else if (it.kind === "transform") {
      const corner = it.handle.length === 2; // nw/ne/se/sw
      const next =
        it.handle === "rotate"
          ? rotateDrag(it.start, it.size, p, e.shiftKey)
          : scaleDrag(it.start, it.size, it.handle, p, corner ? !e.shiftKey : false);
      actions.updateLayer(it.layerId, next);
    } else if (it.kind === "shape") {
      const end = e.shiftKey
        ? constrainShape(tool.shapeKind, it.x0, it.y0, p.x, p.y)
        : { x1: p.x, y1: p.y };
      it.x1 = end.x1;
      it.y1 = end.y1;
      setShapePreview({ x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1 });
    } else if (it.kind === "clone") {
      const raster = actions.activeRaster();
      if (!raster || raster.id !== it.layerId) return;
      const dx = p.x - it.lastX;
      const dy = p.y - it.lastY;
      const dist = Math.hypot(dx, dy);
      const step = Math.max(1, tool.brushSize * 0.2);
      const n = Math.max(1, Math.floor(dist / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        cloneStamp(
          raster,
          it.source,
          it.lastX + dx * t,
          it.lastY + dy * t,
          it.offsetX,
          it.offsetY,
          tool,
          doc.selection,
        );
      }
      it.lastX = p.x;
      it.lastY = p.y;
      actions.setTool({});
    } else if (it.kind === "gradient") {
      const end = e.shiftKey
        ? constrainShape("line", it.x0, it.y0, p.x, p.y)
        : { x1: p.x, y1: p.y };
      it.x1 = end.x1;
      it.y1 = end.y1;
      setGradientPreview({ x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1 });
    } else if (it.kind === "lasso") {
      // Append point if it has moved enough â€” keeps polygon light.
      const last = it.points[it.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 2 / view.zoom) {
        it.points.push(p);
        setLassoPreview([...it.points]);
      }
    }
  };

  const onPointerUp = () => {
    const it = interaction.current;
    if (it?.kind === "paint") actions.endStroke(it.erase ? "Erase" : "Paint");
    if (it?.kind === "clone") actions.endStroke("Clone");
    if (it?.kind === "move") {
      const l = doc.layers.find((x) => x.id === it.layerId);
      if (l) actions.recordProps("Move", l.id, { x: it.origX, y: it.origY }, { x: l.x, y: l.y });
    }
    if (it?.kind === "transform") {
      const l = doc.layers.find((x) => x.id === it.layerId);
      if (l) actions.recordProps("Transform", l.id, it.start, snapshotProps(l));
    }
    if (it?.kind === "select") {
      const sel = doc.selection;
      if (sel && (sel.w < 2 || sel.h < 2)) {
        actions.setSelection(null);
      } else if (sel && tool.feather > 0) {
        // Convert rect selection to a feathered mask for soft edges.
        const m = makeCanvas(doc.width, doc.height);
        const mctx = m.getContext("2d")!;
        mctx.fillStyle = "#ffffff";
        mctx.fillRect(sel.x, sel.y, sel.w, sel.h);
        featherMask(m, tool.feather);
        const combined = combineMasks(undefined, m, "replace", doc.width, doc.height);
        actions.setSelection(selectionFromMask(combined));
      }
    }
    if (it?.kind === "lasso") {
      if (it.points.length >= 3) {
        const mask = maskFromPolygon(doc.width, doc.height, it.points);
        commitSelection(mask);
      }
      setLassoPreview(null);
    }
    if (it?.kind === "gradient") {
      setGradientPreview(null);
      const raster = actions.activeRaster();
      if (raster && raster.id === it.layerId && Math.hypot(it.x1 - it.x0, it.y1 - it.y0) >= 2) {
        const style = gradientStyleOf(tool);
        actions.recordRaster("Gradient", raster.id, () => {
          clippedLayerDraw(raster, doc.selection, (ctx) =>
            drawGradient(ctx, style, it.x0, it.y0, it.x1, it.y1, doc.width, doc.height),
          );
        });
      }
    }
    if (it?.kind === "shape") {
      setShapePreview(null);
      const raster = actions.activeRaster();
      const style = shapeStyleOf(tool);
      if (
        raster &&
        raster.id === it.layerId &&
        Math.hypot(it.x1 - it.x0, it.y1 - it.y0) >= 2 &&
        (style.fill || style.stroke)
      ) {
        actions.recordRaster("Shape", raster.id, () => {
          clippedLayerDraw(raster, doc.selection, (ctx) =>
            drawShape(ctx, style, it.x0, it.y0, it.x1, it.y1),
          );
        });
      }
    }
    interaction.current = null;
    setPanning(false);
  };

  const cursor = useMemo(() => {
    if (spaceDown || panning) return "grab";
    if (tool.tool === "move") return "move";
    if (tool.tool === "eyedropper" || tool.tool === "wand") return "crosshair";
    if (tool.tool === "text") return "text";
    return "crosshair";
  }, [spaceDown, panning, tool.tool]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[var(--color-canvas-bg)]"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ cursor }}
    >
      {/* Canvas stage */}
      <div
        className="absolute origin-top-left shadow-2xl"
        style={{
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.zoom})`,
          width: doc.width,
          height: doc.height,
        }}
      >
        <div className="checker absolute inset-0" />
        <canvas
          ref={displayRef}
          className="absolute inset-0"
          style={{ width: doc.width, height: doc.height }}
        />
        <canvas
          ref={overlayRef}
          className="pointer-events-none absolute inset-0"
          style={{ width: doc.width, height: doc.height }}
        />
        {editingTextId &&
          (() => {
            const layer = doc.layers.find((l) => l.id === editingTextId);
            if (!layer || layer.type !== "text") return null;
            const invZ = 1 / view.zoom;
            return (
              <>
                {/* Floating formatting toolbar â€” counter-scaled so it stays a comfortable size */}
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  onWheel={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    left: layer.x,
                    top: layer.y,
                    transform: `translateY(calc(-100% - ${10 * invZ}px)) scale(${invZ})`,
                    transformOrigin: "top left",
                    zIndex: 10,
                  }}
                >
                  <div className="flex items-center gap-1 rounded-md border border-border bg-popover/95 p-1 shadow-lg backdrop-blur">
                    <select
                      value={layer.fontFamily}
                      onChange={(e) =>
                        actions.updateLayer(layer.id, { fontFamily: e.target.value })
                      }
                      className="h-7 max-w-[160px] rounded bg-input px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                      style={{ fontFamily: layer.fontFamily }}
                    >
                      {FONTS.map((f) => (
                        <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={8}
                      max={400}
                      value={layer.fontSize}
                      onChange={(e) =>
                        actions.updateLayer(layer.id, { fontSize: +e.target.value || 12 })
                      }
                      className="h-7 w-14 rounded bg-input px-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                    />
                    <input
                      type="color"
                      value={layer.color}
                      onChange={(e) => actions.updateLayer(layer.id, { color: e.target.value })}
                      className="h-7 w-8 cursor-pointer rounded border border-border bg-transparent"
                    />
                    <button
                      onClick={() => actions.updateLayer(layer.id, { bold: !layer.bold })}
                      title="Bold"
                      className={
                        "flex h-7 w-7 items-center justify-center rounded border " +
                        (layer.bold
                          ? "border-primary bg-primary/15"
                          : "border-border bg-secondary text-muted-foreground hover:text-foreground")
                      }
                    >
                      <Bold className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => actions.updateLayer(layer.id, { italic: !layer.italic })}
                      title="Italic"
                      className={
                        "flex h-7 w-7 items-center justify-center rounded border " +
                        (layer.italic
                          ? "border-primary bg-primary/15"
                          : "border-border bg-secondary text-muted-foreground hover:text-foreground")
                      }
                    >
                      <Italic className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => commitTextEdit()}
                      title="Done (Esc)"
                      className="flex h-7 items-center gap-1 rounded bg-primary px-2 text-xs text-primary-foreground hover:opacity-90"
                    >
                      <Check className="h-3.5 w-3.5" /> Done
                    </button>
                  </div>
                </div>
                <textarea
                  ref={textEditorRef}
                  value={layer.text}
                  autoFocus
                  spellCheck={false}
                  placeholder="Type your textâ€¦"
                  onChange={(e) => actions.updateLayer(layer.id, { text: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                  onWheel={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") commitTextEdit();
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commitTextEdit();
                  }}
                  style={{
                    position: "absolute",
                    left: layer.x,
                    top: layer.y,
                    minWidth: Math.max(120, layer.fontSize * 4),
                    minHeight: layer.fontSize * 1.4,
                    padding: `${layer.fontSize * 0.1}px ${layer.fontSize * 0.2}px`,
                    margin: 0,
                    background: "transparent",
                    color: layer.color,
                    font: `${layer.italic ? "italic " : ""}${layer.bold ? "700 " : "400 "}${layer.fontSize}px ${layer.fontFamily}`,
                    lineHeight: 1.2,
                    border: "none",
                    outline: `${Math.max(1, 2 / view.zoom)}px dashed oklch(0.72 0.18 250)`,
                    outlineOffset: `${4 / view.zoom}px`,
                    borderRadius: `${4 / view.zoom}px`,
                    boxShadow: `0 0 ${24 / view.zoom}px oklch(0.72 0.18 250 / 0.35)`,
                    resize: "none",
                    overflow: "hidden",
                    whiteSpace: "pre",
                    caretColor: "oklch(0.72 0.18 250)",
                  }}
                />
              </>
            );
          })()}
      </div>

      {/* HUD */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/50 px-2 py-1 text-xs text-white/80 backdrop-blur">
        {Math.round(view.zoom * 100)}% Â· {doc.width}Ã—{doc.height}px
      </div>
      <div className="absolute bottom-3 right-3 flex gap-1 text-xs">
        <button
          onClick={() => setView((v) => ({ ...v, zoom: clamp(v.zoom / 1.25, MIN_ZOOM, MAX_ZOOM) }))}
          className="rounded bg-secondary px-2 py-1"
        >
          âˆ’
        </button>
        <button onClick={fitView} className="rounded bg-secondary px-2 py-1">
          Fit
        </button>
        <button
          onClick={() => setView({ zoom: 1, tx: 32, ty: 32 })}
          className="rounded bg-secondary px-2 py-1"
        >
          100%
        </button>
        <button
          onClick={() => setView((v) => ({ ...v, zoom: clamp(v.zoom * 1.25, MIN_ZOOM, MAX_ZOOM) }))}
          className="rounded bg-secondary px-2 py-1"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ---------- helpers ----------

type InteractionState =
  | { kind: "pan"; startX: number; startY: number; tx: number; ty: number }
  | {
      kind: "paint";
      lastX: number;
      lastY: number;
      layerId: string;
      erase: boolean;
      onMask: boolean;
    }
  | { kind: "select"; startX: number; startY: number }
  | { kind: "move"; layerId: string; startX: number; startY: number; origX: number; origY: number }
  | {
      kind: "transform";
      layerId: string;
      handle: HandleId;
      size: { w: number; h: number };
      start: TransformProps;
    }
  | { kind: "shape"; layerId: string; x0: number; y0: number; x1: number; y1: number }
  | { kind: "gradient"; layerId: string; x0: number; y0: number; x1: number; y1: number }
  | {
      kind: "clone";
      layerId: string;
      lastX: number;
      lastY: number;
      source: HTMLCanvasElement;
      offsetX: number;
      offsetY: number;
    }
  | { kind: "lasso"; points: { x: number; y: number }[] };

/** Resolve the gradient tool's options into a concrete gradient style. */
function gradientStyleOf(tool: {
  gradientKind: GradientStyle["kind"];
  gradientToTransparent: boolean;
  brushColor: string;
  secondaryColor: string;
}): GradientStyle {
  return {
    kind: tool.gradientKind,
    from: tool.brushColor,
    to: tool.gradientToTransparent ? null : tool.secondaryColor,
  };
}

/** Resolve the shape tool's options into concrete fill/stroke colours. */
function shapeStyleOf(tool: {
  shapeKind: ShapeStyle["kind"];
  shapeFill: boolean;
  shapeStroke: boolean;
  shapeStrokeWidth: number;
  brushColor: string;
  secondaryColor: string;
}): ShapeStyle {
  const linear = tool.shapeKind === "line" || tool.shapeKind === "arrow";
  return {
    kind: tool.shapeKind,
    fill: !linear && tool.shapeFill ? tool.brushColor : null,
    stroke: linear ? tool.brushColor : tool.shapeStroke ? tool.secondaryColor : null,
    strokeWidth: tool.shapeStrokeWidth,
  };
}

function snapshotProps(l: Layer): TransformProps {
  return {
    x: l.x,
    y: l.y,
    rotation: l.rotation,
    scaleX: l.scaleX,
    scaleY: l.scaleY,
    flipX: l.flipX,
    flipY: l.flipY,
  };
}

/** Doc-space positions of the 8 scale handles + the rotate handle. */
function handlePositions(layer: Layer, zoom: number): { id: HandleId; pos: Point }[] {
  const size = layerSizeOf(layer);
  const t = snapshotProps(layer);
  const out: { id: HandleId; pos: Point }[] = (
    Object.keys(HANDLE_UNITS) as (keyof typeof HANDLE_UNITS)[]
  ).map((id) => ({
    id,
    pos: localToDoc(t, { x: HANDLE_UNITS[id].x * size.w, y: HANDLE_UNITS[id].y * size.h }),
  }));
  // Rotate handle floats a fixed screen distance beyond the top-centre edge.
  const top = localToDoc(t, { x: size.w / 2, y: 0 });
  const center = localToDoc(t, { x: size.w / 2, y: size.h / 2 });
  const len = Math.hypot(top.x - center.x, top.y - center.y) || 1;
  const dir = { x: (top.x - center.x) / len, y: (top.y - center.y) / len };
  out.push({
    id: "rotate",
    pos: { x: top.x + dir.x * (28 / zoom), y: top.y + dir.y * (28 / zoom) },
  });
  return out;
}

function hitTestHandle(layer: Layer, p: Point, zoom: number): HandleId | null {
  const hit = 9 / zoom;
  for (const h of handlePositions(layer, zoom)) {
    if (Math.hypot(p.x - h.pos.x, p.y - h.pos.y) <= hit) return h.id;
  }
  return null;
}

function drawTransformHandles(ctx: CanvasRenderingContext2D, layer: Layer, zoom: number) {
  const size = layerSizeOf(layer);
  const t = snapshotProps(layer);
  const corners = [
    { x: 0, y: 0 },
    { x: size.w, y: 0 },
    { x: size.w, y: size.h },
    { x: 0, y: size.h },
  ].map((p) => localToDoc(t, p));

  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = "#7cc4ff";
  ctx.lineWidth = 1.5 / zoom;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.stroke();

  const handles = handlePositions(layer, zoom);
  const rotate = handles.find((h) => h.id === "rotate")!;
  const top = localToDoc(t, { x: size.w / 2, y: 0 });
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(rotate.pos.x, rotate.pos.y);
  ctx.stroke();

  const hs = 4.5 / zoom;
  ctx.fillStyle = "#ffffff";
  for (const h of handles) {
    if (h.id === "rotate") {
      ctx.beginPath();
      ctx.arc(h.pos.x, h.pos.y, hs, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(h.pos.x - hs, h.pos.y - hs, hs * 2, hs * 2);
      ctx.strokeRect(h.pos.x - hs, h.pos.y - hs, hs * 2, hs * 2);
    }
  }
  ctx.restore();
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Active raster layer ignoring lock state â€” wand only reads pixels. */
function state_activeRaster(): RasterLayer | null {
  const l = actions.activeLayer();
  return l && l.type === "raster" ? l : null;
}

/**
 * Stamp a soft brush dab on `layer`, clipped to the current selection
 * (rectangular OR mask-based). Uses a temp canvas + destination-in for mask
 * clipping so freehand/wand selections work.
 *
 * When `maskCanvas` is given the dab targets the layer's mask instead:
 * brushing reveals (paints opaque white), erasing hides (clears alpha).
 */
function paintStamp(
  layer: RasterLayer,
  x: number,
  y: number,
  erase: boolean,
  tool: { brushSize: number; brushHardness: number; brushColor: string },
  selection: Selection | null,
  maskCanvas?: HTMLCanvasElement,
) {
  const target = maskCanvas ?? layer.canvas;
  const ctx = target.getContext("2d")!;
  const r = tool.brushSize / 2;
  const hardness = tool.brushHardness;
  const paintColor = maskCanvas ? "#ffffff" : tool.brushColor;
  const color = erase ? "rgba(0,0,0,1)" : paintColor;

  if (selection?.mask) {
    // Render the stamp to a temp canvas, mask it, then composite onto layer.
    const tmp = makeCanvas(target.width, target.height);
    const tctx = tmp.getContext("2d")!;
    const grad = tctx.createRadialGradient(x, y, r * hardness, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, erase ? "rgba(0,0,0,0)" : hexToRgba(paintColor, 0));
    tctx.fillStyle = grad;
    tctx.beginPath();
    tctx.arc(x, y, r, 0, Math.PI * 2);
    tctx.fill();
    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(selection.mask, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
    return;
  }

  ctx.save();
  if (selection) {
    ctx.beginPath();
    ctx.rect(selection.x, selection.y, selection.w, selection.h);
    ctx.clip();
  }
  const grad = ctx.createRadialGradient(x, y, r * hardness, x, y, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, erase ? "rgba(0,0,0,0)" : hexToRgba(paintColor, 0));
  ctx.fillStyle = grad;
  ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Stamp one clone-brush dab at (x, y), copying pixels from the stroke-start
 * snapshot shifted by the stroke's source offset. Soft edge via a radial
 * alpha falloff; clipped to the current selection like the brush.
 */
function cloneStamp(
  layer: RasterLayer,
  source: HTMLCanvasElement,
  x: number,
  y: number,
  offsetX: number,
  offsetY: number,
  tool: { brushSize: number; brushHardness: number },
  selection: Selection | null,
) {
  const r = tool.brushSize / 2;
  const tmp = makeCanvas(layer.canvas.width, layer.canvas.height);
  const tctx = tmp.getContext("2d")!;
  // Shift the snapshot so the source pixel lands under the brush.
  tctx.drawImage(source, offsetX, offsetY);
  // Keep only a soft disc of it.
  const grad = tctx.createRadialGradient(x, y, r * tool.brushHardness, x, y, r);
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  tctx.globalCompositeOperation = "destination-in";
  tctx.fillStyle = grad;
  tctx.beginPath();
  tctx.arc(x, y, r, 0, Math.PI * 2);
  tctx.fill();
  if (selection?.mask) {
    tctx.drawImage(selection.mask, 0, 0);
  }
  const ctx = layer.canvas.getContext("2d")!;
  ctx.save();
  if (selection && !selection.mask) {
    ctx.beginPath();
    ctx.rect(selection.x, selection.y, selection.w, selection.h);
    ctx.clip();
  }
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}

function floodFill(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  hex: string,
  selection: Selection | null,
  tolerance: number,
) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;
  const w = canvas.width;
  const h = canvas.height;
  const i0 = (y * w + x) * 4;
  const target = [data[i0], data[i0 + 1], data[i0 + 2], data[i0 + 3]];
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const rgb = m ? parseInt(m[1], 16) : 0;
  const fill = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255];
  if (target.every((v, i) => v === fill[i])) return;
  const tol = tolerance;

  // Pre-read the selection mask once (if any) for fast per-pixel lookup.
  let maskData: Uint8ClampedArray | null = null;
  if (selection?.mask) {
    maskData = selection.mask.getContext("2d")!.getImageData(0, 0, w, h).data;
  }
  const inSel = (px: number, py: number) => {
    if (!selection) return true;
    if (maskData) return maskData[(py * w + px) * 4 + 3] > 0;
    return (
      px >= selection.x &&
      py >= selection.y &&
      px < selection.x + selection.w &&
      py < selection.y + selection.h
    );
  };

  const stack: number[] = [x, y];
  while (stack.length) {
    const py = stack.pop()!;
    const px = stack.pop()!;
    if (px < 0 || py < 0 || px >= w || py >= h) continue;
    if (!inSel(px, py)) continue;
    const idx = (py * w + px) * 4;
    if (
      Math.abs(data[idx] - target[0]) > tol ||
      Math.abs(data[idx + 1] - target[1]) > tol ||
      Math.abs(data[idx + 2] - target[2]) > tol ||
      Math.abs(data[idx + 3] - target[3]) > tol
    )
      continue;
    data[idx] = fill[0];
    data[idx + 1] = fill[1];
    data[idx + 2] = fill[2];
    data[idx + 3] = fill[3];
    stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
  }
  ctx.putImageData(img, 0, 0);
}

function sampleColor(layers: Layer[], x: number, y: number, w: number, h: number): string | null {
  const flat = compositeDoc({ width: w, height: h, layers, activeLayerId: null, selection: null });
  const d = flat.getContext("2d")!.getImageData(x, y, 1, 1).data;
  return "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
}
