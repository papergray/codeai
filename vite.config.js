import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  build: {
    outDir: "dist",
    assetsDir: "assets",
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks: {
          "react":        ["react", "react-dom"],
          "codemirror":   ["codemirror", "@codemirror/state", "@codemirror/view"],
          "cm-langs": [
            "@codemirror/lang-javascript", "@codemirror/lang-python",
            "@codemirror/lang-java",       "@codemirror/lang-cpp",
            "@codemirror/lang-rust",       "@codemirror/lang-php",
            "@codemirror/lang-sql",        "@codemirror/lang-html",
            "@codemirror/lang-css",        "@codemirror/lang-json",
            "@codemirror/lang-markdown",   "@codemirror/lang-xml",
          ],
          // Keep transformers.js in its own chunk — it's large
          // but lazy-imported so it only loads when user picks Offline mode
          "transformers": ["@huggingface/transformers"],
        },
      },
    },
  },

  // Exclude transformers.js from Vite's pre-bundling —
  // it ships its own WASM files that must stay alongside the JS
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },

  server: {
    port: 3000,
  },
});
