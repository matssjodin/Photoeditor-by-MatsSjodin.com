// Editor shell: top bar, left toolbar, center canvas, right panels.
// Handles drag-and-drop file loading and first-run welcome state.

import { useEffect, useState } from "react";
import { TopBar } from "./TopBar";
import { Toolbar } from "./Toolbar";
import { RightPanels } from "./RightPanels";
import { EditorCanvas } from "./EditorCanvas";
import { actions, useEditor } from "./store";
import { ImagePlus, FilePlus2 } from "lucide-react";

export function Editor() {
  const s = useEditor();
  const [dragOver, setDragOver] = useState(false);
  const hasDoc = s.doc.layers.length > 0;

  // Initialize an empty document on first mount so the user sees something.
  useEffect(() => {
    if (s.doc.layers.length === 0) actions.newDocument(1200, 800, "#ffffff");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const prevent = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  return (
    <div
      className="grid h-screen w-screen grid-rows-[auto_1fr] bg-background text-foreground"
      onDragEnter={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          actions.loadImage(img);
          URL.revokeObjectURL(url);
        };
        img.src = url;
      }}
    >
      <TopBar />
      <div className="grid min-h-0 grid-cols-[auto_1fr_auto]">
        <Toolbar />
        <main className="relative min-w-0">
          <EditorCanvas />
          {!hasDoc && <Welcome />}
          {dragOver && (
            <div className="pointer-events-none absolute inset-4 grid place-items-center rounded-xl border-2 border-dashed border-primary/70 bg-primary/10 text-primary">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ImagePlus className="h-5 w-5" /> Drop image to open
              </div>
            </div>
          )}
        </main>
        <RightPanels />
      </div>
    </div>
  );
}

function Welcome() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-xl border border-border bg-card/80 px-6 py-5 text-center backdrop-blur">
        <FilePlus2 className="h-8 w-8 text-primary" />
        <p className="text-sm font-medium">Drop an image here, or use Open in the top bar</p>
        <p className="text-xs text-muted-foreground">
          Everything is processed locally in your browser.
        </p>
      </div>
    </div>
  );
}
