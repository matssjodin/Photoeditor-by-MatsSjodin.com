// Left toolbar — tool selection and quick actions.
import {
  MousePointer2,
  Square,
  Brush,
  Eraser,
  PaintBucket,
  Type,
  Crop,
  Pipette,
  RotateCcw,
  RotateCw,
  FlipHorizontal2,
  FlipVertical2,
  Undo2,
  Redo2,
  Lasso,
  Wand2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { actions, useEditor } from "./store";
import type { ToolId } from "./types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const SWATCHES = [
  "#000000",
  "#ffffff",
  "#7f7f7f",
  "#c0c0c0",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#78350f",
  "#1e3a8a",
  "#064e3b",
];

const tools: { id: ToolId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "move", label: "Move (V)", icon: MousePointer2 },
  { id: "select-rect", label: "Rectangular select (M)", icon: Square },
  { id: "lasso", label: "Freehand lasso (L)", icon: Lasso },
  { id: "wand", label: "Magic wand (W)", icon: Wand2 },
  { id: "brush", label: "Brush (B)", icon: Brush },
  { id: "eraser", label: "Eraser (E)", icon: Eraser },
  { id: "fill", label: "Fill (G)", icon: PaintBucket },
  { id: "eyedropper", label: "Eyedropper (I)", icon: Pipette },
  { id: "text", label: "Text (T)", icon: Type },
  { id: "crop", label: "Crop (C)", icon: Crop },
];

export function Toolbar() {
  const s = useEditor();
  return (
    <aside className="flex w-14 flex-col items-center gap-1 border-r border-border bg-[var(--color-toolbar)] py-2">
      {tools.map((t) => (
        <ToolButton
          key={t.id}
          active={s.tool.tool === t.id}
          title={t.label}
          onClick={() => {
            actions.setTool({ tool: t.id });
            if (t.id === "crop") {
              if (s.doc.selection) actions.cropToSelection();
              else actions.setTool({ tool: "select-rect" });
            }
          }}
        >
          <t.icon className="h-5 w-5" />
        </ToolButton>
      ))}
      <div className="my-1 h-px w-8 bg-border" />
      <ToolButton title="Rotate -90°" onClick={() => actions.rotateActive(-90)}>
        <RotateCcw className="h-5 w-5" />
      </ToolButton>
      <ToolButton title="Rotate 90°" onClick={() => actions.rotateActive(90)}>
        <RotateCw className="h-5 w-5" />
      </ToolButton>
      <ToolButton title="Flip horizontal" onClick={() => actions.flipActive("x")}>
        <FlipHorizontal2 className="h-5 w-5" />
      </ToolButton>
      <ToolButton title="Flip vertical" onClick={() => actions.flipActive("y")}>
        <FlipVertical2 className="h-5 w-5" />
      </ToolButton>
      <div className="my-1 h-px w-8 bg-border" />
      <ToolButton title="Undo (⌘Z)" onClick={() => actions.undo()}>
        <Undo2 className="h-5 w-5" />
      </ToolButton>
      <ToolButton title="Redo (⌘⇧Z)" onClick={() => actions.redo()}>
        <Redo2 className="h-5 w-5" />
      </ToolButton>

      <div className="mt-auto flex flex-col items-center gap-2 pb-1">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Foreground color"
              aria-label={`Foreground color, currently ${s.tool.brushColor}`}
              className="h-8 w-8 rounded-full border-2 border-border shadow-inner ring-1 ring-black/20 transition hover:scale-105"
              style={{ background: s.tool.brushColor }}
            />
          </PopoverTrigger>
          <PopoverContent side="right" align="end" className="w-56 space-y-3">
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Color wheel</div>
              <input
                type="color"
                value={s.tool.brushColor}
                onChange={(e) => actions.setTool({ brushColor: e.target.value })}
                className="h-10 w-full cursor-pointer rounded-md border border-border bg-transparent p-1"
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Swatches</div>
              <div className="grid grid-cols-8 gap-1">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    aria-label={`Use color ${c}`}
                    onClick={() => actions.setTool({ brushColor: c })}
                    className={
                      "h-5 w-5 rounded-full border transition hover:scale-110 " +
                      (s.tool.brushColor.toLowerCase() === c.toLowerCase()
                        ? "ring-2 ring-primary border-primary"
                        : "border-border")
                    }
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="hex-color" className="text-xs text-muted-foreground">
                Hex
              </label>
              <HexInput
                value={s.tool.brushColor}
                onChange={(v) => actions.setTool({ brushColor: v })}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </aside>
  );
}

function ToolButton({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={
        "flex h-10 w-10 items-center justify-center rounded-md transition " +
        (active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

/**
 * Hex colour text field. Keeps a local draft so the user can type partial
 * values, but only commits to the store when the text is a valid #RRGGBB.
 */
function HexInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);

  // Sync the draft when the colour changes elsewhere (swatch, picker, eyedropper).
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (HEX_RE.test(draft)) onChange(draft.toLowerCase());
    else setDraft(value); // revert invalid input
  };

  return (
    <input
      id="hex-color"
      type="text"
      inputMode="text"
      autoComplete="off"
      spellCheck={false}
      aria-label="Foreground colour hex value"
      value={draft}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        if (HEX_RE.test(v)) onChange(v.toLowerCase());
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
    />
  );
}
