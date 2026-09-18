// Editor shell: top bar, left toolbar, center canvas, right panels.
// Handles drag-and-drop file loading and first-run welcome state.

import { useEffect, useRef, useState } from "react";
import { TopBar } from "./TopBar";
import { Toolbar } from "./Toolbar";
import { RightPanels } from "./RightPanels";
import { EditorCanvas } from "./EditorCanvas";
import { actions, getState, useEditor } from "./store";
import { imageFromClipboardEvent, pasteBlobAsLayer } from "./clipboard";
import { openUserFile } from "./open-file";
import {
  clearAutosave,
  deserializeDoc,
  loadAutosave,
  saveAutosave,
  serializeDoc,
  type ProjectFile,
} from "./project";
import { ImagePlus, FilePlus2, Monitor, History, X } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export function Editor() {
  const s = useEditor();
  const [dragOver, setDragOver] = useState(false);
  const [restorable, setRestorable] = useState<ProjectFile | null>(null);
  const [autosaveReady, setAutosaveReady] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const hasDoc = s.doc.layers.length > 0;

  // Initialize an empty document on first mount so the user sees something,
  // and offer to restore the last autosaved session if one exists.
  useEffect(() => {
    let cancelled = false;
    if (s.doc.layers.length === 0) actions.newDocument(1200, 800, "#ffffff");
    loadAutosave()
      .then((file) => {
        if (cancelled) return;
        if (file && file.layers.length > 0) setRestorable(file);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAutosaveReady(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave to IndexedDB, debounced after the last change.
  const autosaveTimer = useRef<number | null>(null);
  useEffect(() => {
    // Preserve the previous session until the user restores or dismisses it.
    if (typeof window === "undefined" || !autosaveReady || restorable) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      try {
        void saveAutosave(serializeDoc(getState().doc)).catch(() => {});
      } catch {
        // Serialization can fail on exotic canvas states; never break editing.
      }
    }, 2000);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
  }, [s.version, autosaveReady, restorable]);

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

  // Ctrl/⌘+V pastes a clipboard image as a new layer (unless typing in a field).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      )
        return;
      const blob = imageFromClipboardEvent(e);
      if (!blob) return;
      e.preventDefault();
      void pasteBlobAsLayer(blob).catch(() => {
        toast.error("Couldn't paste the image from the clipboard.");
      });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
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
        void openUserFile(file);
      }}
    >
      <TopBar />
      <div className="grid min-h-0 grid-cols-[auto_1fr_auto]">
        <Toolbar />
        <main className="relative min-w-0">
          <EditorCanvas />
          {!hasDoc && <Welcome />}
          {restorable && (
            <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-card/95 px-4 py-2 text-sm shadow-lg backdrop-blur">
              <History className="h-4 w-4 text-primary" />
              <span>
                Restore your previous session
                {restorable.savedAt
                  ? ` (saved ${new Date(restorable.savedAt).toLocaleString()})`
                  : ""}
                ?
              </span>
              <button
                onClick={async () => {
                  const file = restorable;
                  setRestoring(true);
                  try {
                    actions.loadProject(await deserializeDoc(file));
                    setRestorable(null);
                  } catch {
                    toast.error("Couldn't restore the previous session.");
                  } finally {
                    setRestoring(false);
                  }
                }}
                disabled={restoring}
                className="rounded bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:opacity-90"
              >
                Restore
              </button>
              <button
                onClick={async () => {
                  await clearAutosave().catch(() => {});
                  setRestorable(null);
                }}
                disabled={restoring}
                aria-label="Dismiss"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
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
      <MobileNotice />
      <Toaster position="bottom-center" />
    </div>
  );
}

/**
 * The editor relies on fixed-width panels and precise pointer input, so it isn't
 * usable on phones. Rather than break silently, cover small viewports with a
 * clear "use a larger screen" message. Shown below the `md` breakpoint.
 */
function MobileNotice() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background px-6 text-center md:hidden">
      <div className="flex max-w-xs flex-col items-center gap-3">
        <Monitor className="h-10 w-10 text-primary" />
        <h1 className="text-lg font-semibold">Best on a larger screen</h1>
        <p className="text-sm text-muted-foreground">
          Photo Editor needs a tablet or desktop-sized screen and a mouse or trackpad. Open this
          page on a bigger device to start editing.
        </p>
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
