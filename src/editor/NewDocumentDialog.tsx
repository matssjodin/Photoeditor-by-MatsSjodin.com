import { useEffect, useState } from "react";
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
const PRESETS: { label: string; w: number; h: number }[] = [
  { label: "1080 × 1080", w: 1080, h: 1080 },
  { label: "1920 × 1080", w: 1920, h: 1080 },
  { label: "1200 × 800", w: 1200, h: 800 },
  { label: "1080 × 1350", w: 1080, h: 1350 },
];

export function NewDocumentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [width, setWidth] = useState(1200);
  const [height, setHeight] = useState(800);
  // Background is a CSS colour, or the literal "transparent".
  const [bg, setBg] = useState<string>("#ffffff");

  // Seed the form from the current document each time the dialog opens.
  useEffect(() => {
    if (open) {
      const doc = getState().doc;
      setWidth(doc.width);
      setHeight(doc.height);
    }
  }, [open]);

  const valid =
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= 1 &&
    height >= 1 &&
    width <= MAX_DIM &&
    height <= MAX_DIM;

  const create = () => {
    if (!valid) return;
    actions.newDocument(Math.round(width), Math.round(height), bg === "transparent" ? null : bg);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            create();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>New image</DialogTitle>
          <DialogDescription>Set the canvas size and background.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Size */}
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Width" value={width} onChange={setWidth} />
            <NumberField label="Height" value={height} onChange={setHeight} />
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setWidth(p.w);
                  setHeight(p.h);
                }}
                className="rounded-md border border-border bg-secondary px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Background */}
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Background</div>
            <div className="flex items-center gap-2">
              <BgSwatch
                label="Transparent"
                selected={bg === "transparent"}
                onClick={() => setBg("transparent")}
              >
                <span className="checker block h-full w-full rounded" />
              </BgSwatch>
              <BgSwatch label="White" selected={bg === "#ffffff"} onClick={() => setBg("#ffffff")}>
                <span className="block h-full w-full rounded bg-white" />
              </BgSwatch>
              <BgSwatch label="Black" selected={bg === "#000000"} onClick={() => setBg("#000000")}>
                <span className="block h-full w-full rounded bg-black" />
              </BgSwatch>
              <label
                className={
                  "relative h-8 w-8 cursor-pointer overflow-hidden rounded-md border-2 " +
                  (bg !== "transparent" && bg !== "#ffffff" && bg !== "#000000"
                    ? "border-primary"
                    : "border-border")
                }
                title="Custom colour"
              >
                <span
                  className="block h-full w-full"
                  style={{ background: bg === "transparent" ? "#888" : bg }}
                />
                <input
                  type="color"
                  value={bg === "transparent" ? "#3b82f6" : bg}
                  onChange={(e) => setBg(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Custom background colour"
                />
              </label>
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
            onClick={create}
            disabled={!valid}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Create
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
    <label className="block">
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

function BgSwatch({
  label,
  selected,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={
        "h-8 w-8 overflow-hidden rounded-md border-2 " +
        (selected ? "border-primary" : "border-border")
      }
    >
      {children}
    </button>
  );
}
