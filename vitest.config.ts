import { defineConfig } from "vitest/config";

// Standalone test config (kept separate from the app's vite.config so the
// TanStack Start / Nitro plugin chain isn't loaded during unit tests). The
// editor's pixel logic runs in a Node environment with a canvas polyfill.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
