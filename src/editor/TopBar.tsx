// Top menu bar: new doc, open, export, history info.

import {
  Download,
  FilePlus2,
  FolderOpen,
  Image as ImageIcon,
  Scaling,
  Undo2,
  Redo2,
  Layers as LayersIcon,
} from "lucide-react";
import { actions, useEditor } from "./store";
import { compositeDoc } from "./composite";
import { useRef, useState } from "react";
import { NewDocumentDialog } from "./NewDocumentDialog";
import { ResizeImageDialog } from "./ResizeImageDialog";

export function TopBar() {
  const s = useEditor();
  const fileInput = useRef<HTMLInputElement>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [resizeOpen, setResizeOpen] = useState(false);

  const onOpenFile = async (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      actions.loadImage(img);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const exportImage = (type: "png" | "jpeg" | "webp") => {
    const out = compositeDoc(s.doc, { background: type !== "png" ? "#ffffff" : undefined });
    const mime = `image/${type}`;
    out.toBlob(
      (blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `untitled.${type === "jpeg" ? "jpg" : type}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
      mime,
      0.92,
    );
  };

  return (
    <header className="flex h-12 items-center gap-2 border-b border-border bg-[var(--color-toolbar)] px-3">
      <div className="flex items-center gap-2 pr-2">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
          <LayersIcon className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Photo Editor</span>
        <a
          href="https://matssjodin.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline sm:inline"
        >
          by MatsSjodin.com
        </a>
      </div>

      <div className="mx-2 h-6 w-px bg-border" />

      <MenuButton onClick={() => setNewOpen(true)}>
        <FilePlus2 className="h-4 w-4" /> New
      </MenuButton>
      <NewDocumentDialog open={newOpen} onOpenChange={setNewOpen} />
      <MenuButton onClick={() => fileInput.current?.click()}>
        <FolderOpen className="h-4 w-4" /> Open
      </MenuButton>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onOpenFile(f);
          e.currentTarget.value = "";
        }}
      />
      <MenuButton onClick={() => setResizeOpen(true)} disabled={s.doc.layers.length === 0}>
        <Scaling className="h-4 w-4" /> Resize
      </MenuButton>
      <ResizeImageDialog open={resizeOpen} onOpenChange={setResizeOpen} />

      <div className="mx-2 h-6 w-px bg-border" />

      <MenuButton onClick={() => actions.undo()} disabled={s.historyIndex < 0}>
        <Undo2 className="h-4 w-4" /> Undo
      </MenuButton>
      <MenuButton onClick={() => actions.redo()} disabled={s.historyIndex >= s.history.length - 1}>
        <Redo2 className="h-4 w-4" /> Redo
      </MenuButton>

      <div className="ml-auto flex items-center gap-1">
        <MenuButton onClick={() => exportImage("png")}>
          <Download className="h-4 w-4" /> PNG
        </MenuButton>
        <MenuButton onClick={() => exportImage("jpeg")}>
          <ImageIcon className="h-4 w-4" /> JPEG
        </MenuButton>
        <MenuButton onClick={() => exportImage("webp")}>
          <ImageIcon className="h-4 w-4" /> WebP
        </MenuButton>
      </div>
    </header>
  );
}

function MenuButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-secondary disabled:opacity-40"
    >
      {children}
    </button>
  );
}
