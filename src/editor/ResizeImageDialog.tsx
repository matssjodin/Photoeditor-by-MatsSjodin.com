import { useEffect, useState } from "react";
import { Link2, Link2Off } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { actions, getState } from "./store";

const MAX_DIM = 8000;
const SCALE_PRESETS = [25, 50, 100, 200];

export function ResizeImageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Original dimensions captured when the dialog opens; the scale % and the
  // aspect-ratio lock are both computed relative to these.
  const [orig, setOrig] = useState({ w: 1, h: 1 });
  const [width, setWidth] = useState(1);
  const [height, setHeight] = useState(1);
  const [lock, setLock] = useState(true);

  useEffect(() => {
    if (open) {
      const { width: w, height: h } = getState().doc;
      setOrig({ w, h });
      setWidth(w);
      setHeight(h);
      setLock(true);
    }
  }, [open]);

  const aspect = orig.w / orig.h;

  const onWidth = (v: number) => {
    const w = clampDim(v);
    setWidth(w);
    if (lock && Number.isFinite(w)) setHeight(clampDim(Math.round(w / aspect)));
  };
  const onHeight = (v: number) => {
    const h = clampDim(v);
    setHeight(h);
    if (lock && Number.isFinite(h)) setWidth(clampDim(Math.round(h * aspect)));
  };
  const applyScale = (pct: number) => {
    setWidth(clampDim(Math.round((orig.w * pct) / 100)));
    setHeight(clampDim(Math.round((orig.h * pct) / 100)));
  };

  const valid = isValidDim(width) && isValidDim(height);
  const changed = Math.round(width) !== orig.w || Math.round(height) !== orig.h;
  const pct = orig.w ? Math.round((width / orig.w) * 100) : 100;

  const apply = () => {
    if (!valid || !changed) {
      onOpenChange(false);
      return;
    }
    actions.resizeDocument(Math.round(width), Math.round(height));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Resize image</DialogTitle>
          <DialogDescription>
            Scale the whole image and everything on it. Current size: {orig.w} × {orig.h} px.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Width / Height with a lock toggle between them */}
          <div className="flex items-end gap-2">
            <NumberField label="Width" value={width} onChange={onWidth} />
            <button
              type="button"
              onClick={() => setLock((l) => !l)}
              aria-pressed={lock}
              aria-label={lock ? "Unlock aspect ratio" : "Lock aspect ratio"}
              title={lock ? "Proportions locked" : "Proportions unlocked"}
              className={
                "mb-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border " +
                (lock
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground")
              }
            >
              {lock ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
            </button>
            <NumberField label="Height" value={height} onChange={onHeight} />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
            Keep proportions
          </label>

          {/* Scale by percentage */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Scale</span>
              <span className="tabular-nums text-foreground">{pct}%</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SCALE_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyScale(p)}
                  className="rounded-md border border-border bg-secondary px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>

          {!valid && (
            <p className="text-xs text-destructive">
              Enter a width and height between 1 and {MAX_DIM} px.
            </p>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!valid || !changed}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Resize
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function clampDim(v: number) {
  if (!Number.isFinite(v)) return v;
  return Math.min(MAX_DIM, Math.max(1, Math.floor(v)));
}

function isValidDim(v: number) {
  return Number.isFinite(v) && v >= 1 && v <= MAX_DIM;
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block flex-1">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center rounded-md border border-border bg-input">
        <input
          type="number"
          min={1}
          max={MAX_DIM}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(Math.floor(+e.target.value))}
          className="w-full bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        <span className="px-2 text-xs text-muted-foreground">px</span>
      </div>
    </label>
  );
}
