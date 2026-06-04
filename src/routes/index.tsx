import { createFileRoute } from "@tanstack/react-router";
import { Editor } from "@/editor/Editor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lumen — Browser Image Editor" },
      {
        name: "description",
        content:
          "A fast, private image editor that runs entirely in your browser. Layers, adjustments, brushes, and more.",
      },
      { property: "og:title", content: "Lumen — Browser Image Editor" },
      {
        property: "og:description",
        content: "Edit images locally in your browser with layers, adjustments, and pro tools.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <Editor />;
}
