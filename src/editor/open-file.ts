// Shared file-open flow for the Open button and drag-drop: .lumen/JSON files
// restore the full layered project, anything else is decoded as an image.
// Failures surface as toasts instead of silently doing nothing.

import { toast } from "sonner";
import { actions } from "./store";
import { deserializeDoc, readProjectFile } from "./project";

/** True when the file should be treated as a project file, not an image. */
export function looksLikeProject(file: File): boolean {
  return /\.(lumen|json)$/i.test(file.name) || file.type === "application/json";
}

/** Open a user-supplied file (project or image) into the editor. */
export async function openUserFile(file: File): Promise<void> {
  if (looksLikeProject(file)) {
    const project = await readProjectFile(file);
    if (!project) {
      toast.error("This doesn't look like a valid project file.");
      return;
    }
    try {
      actions.loadProject(await deserializeDoc(project));
    } catch {
      toast.error("Couldn't restore the layers from this project file.");
    }
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    actions.loadImage(img);
  } catch {
    toast.error("Couldn't open this file as an image.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = src;
  });
}
