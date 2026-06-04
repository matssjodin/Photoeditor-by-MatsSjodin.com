import { createFileRoute } from "@tanstack/react-router";
import { Editor } from "@/editor/Editor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Photo Editor by MatsSjodin.com — Browser Image Editor" },
      {
        name: "description",
        content:
          "Free online image editor with layers, selections, adjustments, brushes, and text. Runs entirely in your browser — your images never leave your device.",
      },
      { property: "og:title", content: "Photo Editor by MatsSjodin.com — Browser Image Editor" },
      {
        property: "og:description",
        content:
          "Edit images privately in your browser with layers, masks, adjustments, and pro tools. Nothing is uploaded.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <Editor />;
}
