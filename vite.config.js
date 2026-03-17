import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    assetsDir: "assets",
    target: "esnext",             // needed for top-level await in workers
    rollupOptions: {
      output: {
        manualChunks: {
          "react":      ["react", "react-dom"],
          "codemirror": ["codemirror", "@codemirror/state", "@codemirror/view"],
          "cm-langs": [
            "@codemirror/lang-javascript", "@codemirror/lang-python",
            "@codemirror/lang-java", "@codemirror/lang-cpp",
            "@codemirror/lang-rust", "@codemirror/lang-php",
            "@codemirror/lang-sql", "@codemirror/lang-html",
            "@codemirror/lang-css", "@codemirror/lang-json",
            "@codemirror/lang-markdown", "@codemirror/lang-xml",
          ],
          // transformers.js is large — keep it in its own chunk
          "transformers": ["@huggingface/transformers"],
        },
      },
    },
  },
  // Allow SharedArrayBuffer (needed for WASM threading in transformers.js)
  server: {
    port: 3000,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  // Optimise transformers.js - it ships its own WASM
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
  worker: {
    format: "es",
  },
});
