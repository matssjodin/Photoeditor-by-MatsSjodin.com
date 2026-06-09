// Right-hand panels: Layers + Adjustments + Tool options.

import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Type as TypeIcon,
  Bold,
  Italic,
} from "lucide-react";
import { useMemo } from "react";
import { actions, useEditor } from "./store";
import { DEFAULT_ADJUSTMENTS, type Adjustments, type BlendMode, type Layer } from "./types";
import { FONTS } from "./fonts";

const BLEND_MODES: BlendMode[] = [
  "source-over",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "soft-light",
  "hard-light",
  "difference",
  "exclusion",
];

export function RightPanels() {
  const s = useEditor();
  const active = s.doc.layers.find((l) => l.id === s.doc.activeLayerId) ?? null;

  return (
    <aside className="flex w-72 flex-col border-l border-border bg-[var(--color-panel)]">
      <ToolOptions />
      <Section title="Adjustments" defaultOpen>
        {active ? <AdjustmentsPanel layer={active} /> : <Empty>Select a layer</Empty>}
      </Section>
      <Section title="Layers" defaultOpen grow>
        <LayersPanel />
      </Section>
    </aside>
  );
}

function Section({
  title,
  children,
  defaultOpen = false,
  grow,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  grow?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className={"group border-b border-border " + (grow ? "flex min-h-0 flex-1 flex-col" : "")}
    >
      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
        {title}
        <ChevronDown className="h-3 w-3 transition group-open:rotate-180" />
      </summary>
      <div className={"px-3 pb-3 " + (grow ? "min-h-0 flex-1 overflow-auto" : "")}>{children}</div>
    </details>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-4 text-center text-xs text-muted-foreground">{children}</div>;
}

// ---------- Tool options ----------

function ToolOptions() {
  const s = useEditor();
  const t = s.tool;
  return (
    <div className="border-b border-border px-3 py-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {labelForTool(t.tool)}
      </div>
      {(t.tool === "brush" || t.tool === "eraser") && (
        <>
          <Slider
            label="Size"
            value={t.brushSize}
            min={1}
            max={400}
            onChange={(v) => actions.setTool({ brushSize: v })}
          />
          <Slider
            label="Hardness"
            value={Math.round(t.brushHardness * 100)}
            min={0}
            max={100}
            onChange={(v) => actions.setTool({ brushHardness: v / 100 })}
          />
        </>
      )}
      {t.tool === "fill" && (
        <>
          <Slider
            label="Tolerance"
            value={t.tolerance}
            min={0}
            max={128}
            onChange={(v) => actions.setTool({ tolerance: v })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Click to fill matching pixels. Limited to the current selection.
          </p>
        </>
      )}
      {t.tool === "select-rect" && <SelectionOptions hint="Drag to select. Esc to clear." />}
      {t.tool === "lasso" && (
        <SelectionOptions hint="Click and drag to trace a freehand region; release to close." />
      )}
      {t.tool === "wand" && (
        <>
          <SelectionOptions hint="Click a pixel to select all similar colours on the active layer." />
          <Slider
            label="Tolerance"
            value={t.tolerance}
            min={0}
            max={128}
            onChange={(v) => actions.setTool({ tolerance: v })}
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={t.wandContiguous}
              onChange={(e) => actions.setTool({ wandContiguous: e.target.checked })}
            />
            Contiguous
          </label>
        </>
      )}
      {t.tool === "shape" && <ShapeOptions />}
      {t.tool === "gradient" && <GradientOptions />}
      {t.tool === "text" && (
        <div className="space-y-2">
          <FontPicker value={t.fontFamily} onChange={(v) => actions.setTool({ fontFamily: v })} />
          <Slider
            label="Font size"
            value={t.fontSize}
            min={8}
            max={400}
            onChange={(v) => actions.setTool({ fontSize: v })}
          />
          <p className="text-xs text-muted-foreground">
            Click the canvas to start typing. Esc or ⌘↵ to finish.
          </p>
        </div>
      )}
      {t.tool === "crop" && <CropOptions />}
    </div>
  );
}

function labelForTool(t: string) {
  return (
    (
      {
        move: "Move",
        "select-rect": "Selection",
        lasso: "Lasso",
        wand: "Magic wand",
        brush: "Brush",
        eraser: "Eraser",
        fill: "Fill",
        shape: "Shape",
        gradient: "Gradient",
        clone: "Clone stamp",
        text: "Text",
        crop: "Crop",
        eyedropper: "Eyedropper",
      } as Record<string, string>
    )[t] ?? t
  );
}

function ShapeOptions() {
  const s = useEditor();
  const t = s.tool;
  const kinds: { id: typeof t.shapeKind; label: string }[] = [
    { id: "rectangle", label: "Rect" },
    { id: "ellipse", label: "Ellipse" },
    { id: "line", label: "Line" },
    { id: "arrow", label: "Arrow" },
  ];
  const linear = t.shapeKind === "line" || t.shapeKind === "arrow";
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {kinds.map((k) => (
          <button
            key={k.id}
            onClick={() => actions.setTool({ shapeKind: k.id })}
            className={
              "flex-1 rounded border px-1 py-1 text-[11px] " +
              (t.shapeKind === k.id
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border bg-secondary text-muted-foreground hover:text-foreground")
            }
          >
            {k.label}
          </button>
        ))}
      </div>
      {linear ? (
        <Slider
          label="Width"
          value={t.shapeStrokeWidth}
          min={1}
          max={60}
          onChange={(v) => actions.setTool({ shapeStrokeWidth: v })}
        />
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={t.shapeFill}
              onChange={(e) => actions.setTool({ shapeFill: e.target.checked })}
            />
            Fill with foreground colour
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={t.shapeStroke}
              onChange={(e) => actions.setTool({ shapeStroke: e.target.checked })}
            />
            Stroke
            <input
              type="color"
              value={t.secondaryColor}
              onChange={(e) => actions.setTool({ secondaryColor: e.target.value })}
              className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
              aria-label="Stroke colour"
            />
          </label>
          {t.shapeStroke && (
            <Slider
              label="Stroke width"
              value={t.shapeStrokeWidth}
              min={1}
              max={60}
              onChange={(v) => actions.setTool({ shapeStrokeWidth: v })}
            />
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Drag on the canvas to draw. Hold Shift for squares, circles and 45° lines.
      </p>
    </div>
  );
}

function GradientOptions() {
  const s = useEditor();
  const t = s.tool;
  const kinds: { id: typeof t.gradientKind; label: string }[] = [
    { id: "linear", label: "Linear" },
    { id: "radial", label: "Radial" },
  ];
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {kinds.map((k) => (
          <button
            key={k.id}
            onClick={() => actions.setTool({ gradientKind: k.id })}
            className={
              "flex-1 rounded border px-2 py-1 text-[11px] " +
              (t.gradientKind === k.id
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border bg-secondary text-muted-foreground hover:text-foreground")
            }
          >
            {k.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={t.gradientToTransparent}
          onChange={(e) => actions.setTool({ gradientToTransparent: e.target.checked })}
        />
        Fade to transparent
      </label>
      {!t.gradientToTransparent && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          End colour
          <input
            type="color"
            value={t.secondaryColor}
            onChange={(e) => actions.setTool({ secondaryColor: e.target.value })}
            className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
            aria-label="Gradient end colour"
          />
        </label>
      )}
      <p className="text-xs text-muted-foreground">
        Drag from the start to the end of the fade. Hold Shift to snap to 45°. Fills the layer (or
        the current selection).
      </p>
    </div>
  );
}

function SelectionOptions({ hint }: { hint: string }) {
  const s = useEditor();
  const mode = s.tool.selectionMode;
  const opts: { id: typeof mode; label: string }[] = [
    { id: "replace", label: "New" },
    { id: "add", label: "Add" },
    { id: "subtract", label: "Subtract" },
  ];
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {opts.map((o) => (
          <button
            key={o.id}
            onClick={() => actions.setTool({ selectionMode: o.id })}
            className={
              "flex-1 rounded border px-2 py-1 text-[11px] " +
              (mode === o.id
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border bg-secondary text-muted-foreground hover:text-foreground")
            }
          >
            {o.label}
          </button>
        ))}
      </div>
      <Slider
        label="Feather"
        value={s.tool.feather}
        min={0}
        max={100}
        step={0.5}
        onChange={(v) => actions.setTool({ feather: v })}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
      {s.doc.selection && (
        <button
          onClick={() => actions.setSelection(null)}
          className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs hover:bg-accent"
        >
          Deselect (Esc)
        </button>
      )}
    </div>
  );
}

function CropOptions() {
  const s = useEditor();
  const sel = s.doc.selection;
  return (
    <div className="space-y-2">
      <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
        <li>Drag on the canvas to mark the area to keep.</li>
        <li>Click Crop (or press Enter) to trim the image to it.</li>
      </ol>
      {sel ? (
        <p className="text-[11px] text-muted-foreground">
          Selected:{" "}
          <span className="tabular-nums text-foreground">
            {Math.round(sel.w)} × {Math.round(sel.h)} px
          </span>
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">No area marked yet.</p>
      )}
      <button
        onClick={() => actions.cropToSelection()}
        disabled={!sel}
        className="w-full rounded bg-primary px-2 py-1 text-sm text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Crop to selection
      </button>
      {sel && (
        <button
          onClick={() => actions.setSelection(null)}
          className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs hover:bg-accent"
        >
          Clear area (Esc)
        </button>
      )}
    </div>
  );
}

// ---------- Layers ----------

function LayersPanel() {
  const s = useEditor();
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex gap-1">
        <IconBtn title="Add layer" onClick={() => actions.addLayer("raster")}>
          <Plus className="h-4 w-4" />
        </IconBtn>
        <IconBtn title="Add text layer" onClick={() => actions.addLayer("text")}>
          <TypeIcon className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="Duplicate"
          onClick={() => s.doc.activeLayerId && actions.duplicateLayer(s.doc.activeLayerId)}
        >
          <Copy className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="Up"
          onClick={() => s.doc.activeLayerId && actions.reorderLayer(s.doc.activeLayerId, 1)}
        >
          <ChevronUp className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="Down"
          onClick={() => s.doc.activeLayerId && actions.reorderLayer(s.doc.activeLayerId, -1)}
        >
          <ChevronDown className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          title="Delete"
          onClick={() => s.doc.activeLayerId && actions.deleteLayer(s.doc.activeLayerId)}
        >
          <Trash2 className="h-4 w-4" />
        </IconBtn>
      </div>

      {s.doc.activeLayerId && (
        <LayerProperties layer={s.doc.layers.find((l) => l.id === s.doc.activeLayerId)!} />
      )}

      <div className="mt-2 flex-1 space-y-1 overflow-auto">
        {[...s.doc.layers].reverse().map((l) => (
          <LayerRow key={l.id} layer={l} active={l.id === s.doc.activeLayerId} />
        ))}
        {s.doc.layers.length === 0 && <Empty>No layers</Empty>}
      </div>
    </div>
  );
}

function LayerRow({ layer, active }: { layer: Layer; active: boolean }) {
  return (
    <div
      onClick={() => actions.setActiveLayer(layer.id)}
      className={
        "flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm " +
        (active ? "border-primary/60 bg-primary/10" : "border-transparent hover:bg-secondary")
      }
    >
      <button
        type="button"
        aria-label={layer.visible ? "Hide layer" : "Show layer"}
        aria-pressed={layer.visible}
        onClick={(e) => {
          e.stopPropagation();
          actions.updateLayer(layer.id, { visible: !layer.visible });
        }}
        className="text-muted-foreground hover:text-foreground"
      >
        {layer.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
      <div className="flex h-8 w-8 items-center justify-center rounded bg-black/30 text-[10px] uppercase text-muted-foreground">
        {layer.type === "text" ? "T" : <LayerThumb layer={layer} />}
      </div>
      <span className="flex-1 truncate">{layer.name}</span>
      <button
        type="button"
        aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
        aria-pressed={layer.locked}
        onClick={(e) => {
          e.stopPropagation();
          actions.updateLayer(layer.id, { locked: !layer.locked });
        }}
        className="text-muted-foreground hover:text-foreground"
      >
        {layer.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
      </button>
      <button
        type="button"
        aria-label="Delete layer"
        title="Delete layer (Del)"
        onClick={(e) => {
          e.stopPropagation();
          actions.deleteLayer(layer.id);
        }}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function LayerThumb({ layer }: { layer: Layer }) {
  const s = useEditor();
  const canvas = layer.type === "raster" ? layer.canvas : null;
  // Regenerating the data URL is relatively expensive (canvas alloc + toDataURL),
  // so cache it and only recompute when the bitmap could have changed: a new
  // canvas identity (resize/crop/rotate) or a store mutation (paint, filter bake).
  const url = useMemo(() => {
    if (!canvas) return "";
    try {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 32;
      c.getContext("2d")!.drawImage(canvas, 0, 0, 32, 32);
      return c.toDataURL();
    } catch {
      return "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, s.version]);
  if (!canvas) return null;
  return <img src={url} className="h-full w-full rounded object-cover" alt="" />;
}

function LayerProperties({ layer }: { layer: Layer }) {
  return (
    <div className="mb-2 rounded-md border border-border bg-card/40 p-2 text-xs">
      <input
        className="mb-2 w-full rounded bg-input px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
        value={layer.name}
        onChange={(e) => actions.updateLayer(layer.id, { name: e.target.value })}
      />
      <Slider
        label="Opacity"
        value={Math.round(layer.opacity * 100)}
        min={0}
        max={100}
        onChange={(v) => actions.updateLayer(layer.id, { opacity: v / 100 })}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Blend</span>
        <select
          value={layer.blendMode}
          onChange={(e) =>
            actions.updateLayer(layer.id, { blendMode: e.target.value as BlendMode })
          }
          className="flex-1 rounded bg-input px-1 py-1 text-xs"
        >
          {BLEND_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      {layer.type === "text" && (
        <div className="mt-2 space-y-2">
          <textarea
            className="w-full rounded bg-input px-2 py-1 text-sm outline-none"
            rows={2}
            value={layer.text}
            onChange={(e) => actions.updateLayer(layer.id, { text: e.target.value })}
          />
          <FontPicker
            value={layer.fontFamily}
            onChange={(v) => actions.updateLayer(layer.id, { fontFamily: v })}
          />
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={layer.color}
              onChange={(e) => actions.updateLayer(layer.id, { color: e.target.value })}
              className="h-7 w-10 rounded border border-border bg-transparent"
            />
            <input
              type="number"
              min={8}
              max={400}
              value={layer.fontSize}
              onChange={(e) => actions.updateLayer(layer.id, { fontSize: +e.target.value })}
              className="w-20 rounded bg-input px-2 py-1 text-sm"
            />
            <button
              onClick={() => actions.updateLayer(layer.id, { bold: !layer.bold })}
              title="Bold"
              className={
                "flex h-7 w-7 items-center justify-center rounded border " +
                (layer.bold
                  ? "border-primary bg-primary/15 text-foreground"
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
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground")
              }
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Adjustments ----------

function AdjustmentsPanel({ layer }: { layer: Layer }) {
  const a = layer.adjustments;
  const set = (patch: Partial<Adjustments>) => actions.updateAdjustments(layer.id, patch);

  return (
    <div className="space-y-1">
      <Slider
        label="Brightness"
        value={a.brightness}
        min={-100}
        max={100}
        onChange={(v) => set({ brightness: v })}
      />
      <Slider
        label="Contrast"
        value={a.contrast}
        min={-100}
        max={100}
        onChange={(v) => set({ contrast: v })}
      />
      <Slider
        label="Saturation"
        value={a.saturation}
        min={-100}
        max={100}
        onChange={(v) => set({ saturation: v })}
      />
      <Slider
        label="Exposure"
        value={a.exposure}
        min={-100}
        max={100}
        onChange={(v) => set({ exposure: v })}
      />
      <Slider label="Hue" value={a.hue} min={-180} max={180} onChange={(v) => set({ hue: v })} />
      <Slider
        label="Blur"
        value={a.blur}
        min={0}
        max={20}
        step={0.5}
        onChange={(v) => set({ blur: v })}
      />
      <Slider
        label="Grayscale"
        value={a.grayscale}
        min={0}
        max={100}
        onChange={(v) => set({ grayscale: v })}
      />
      <Slider label="Sepia" value={a.sepia} min={0} max={100} onChange={(v) => set({ sepia: v })} />
      <Slider
        label="Invert"
        value={a.invert}
        min={0}
        max={100}
        onChange={(v) => set({ invert: v })}
      />

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => actions.updateLayer(layer.id, { adjustments: { ...DEFAULT_ADJUSTMENTS } })}
          className="flex-1 rounded border border-border bg-secondary px-2 py-1 text-xs hover:bg-accent"
        >
          Reset
        </button>
        {layer.type === "raster" && (
          <button
            onClick={() => actions.bakeAdjustments(layer.id)}
            className="flex-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90"
          >
            Apply
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Generic primitives ----------

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-1 block">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(value * 10) / 10}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full accent-[var(--color-primary)]"
      />
    </label>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded border border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function FontPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] text-muted-foreground">Font family</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded bg-input px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
        style={{ fontFamily: value }}
      >
        {FONTS.map((f) => (
          <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>
            {f.label}
          </option>
        ))}
      </select>
    </label>
  );
}
