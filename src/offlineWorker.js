// offlineWorker.js — runs in a Web Worker so inference never blocks the UI
// Uses @huggingface/transformers (WASM backend, works in Android WebView)

import { pipeline, env } from "@huggingface/transformers";

// Store models in Cache API so they survive app restarts
env.useBrowserCache = true;
env.allowLocalModels = false;

// Available offline models (downloaded from HuggingFace on first use, cached forever)
const MODELS = {
  "tiny-starcoder": {
    id: "HuggingFaceTB/SmolLM2-135M-Instruct",   // ~270 MB — fast, general coding
    task: "text-generation",
    label: "SmolLM2 135M",
    size: "~270 MB",
  },
  "phi-1_5": {
    id: "Xenova/phi-1_5",                          // ~1.3 GB — great code quality
    task: "text-generation",
    label: "Phi-1.5 (1.3B)",
    size: "~1.3 GB",
  },
  "codegen-350m": {
    id: "Xenova/codegen-350M-mono",                // ~700 MB — code specialist
    task: "text-generation",
    label: "CodeGen 350M",
    size: "~700 MB",
  },
};

let currentPipeline = null;
let currentModelKey = null;

// ── Message handler ─────────────────────────────────────────────────────────
self.onmessage = async (e) => {
  const { type, payload } = e.data;

  switch (type) {
    case "load":
      await loadModel(payload.modelKey);
      break;
    case "generate":
      await generate(payload.prompt, payload.maxTokens);
      break;
    case "status":
      self.postMessage({ type: "status", ready: !!currentPipeline, model: currentModelKey });
      break;
  }
};

async function loadModel(modelKey) {
  const modelInfo = MODELS[modelKey];
  if (!modelInfo) {
    self.postMessage({ type: "error", message: `Unknown model: ${modelKey}` });
    return;
  }

  // Already loaded
  if (currentModelKey === modelKey && currentPipeline) {
    self.postMessage({ type: "loaded", modelKey });
    return;
  }

  try {
    self.postMessage({ type: "loading", progress: 0, message: `Loading ${modelInfo.label}…` });

    currentPipeline = await pipeline(modelInfo.task, modelInfo.id, {
      dtype: "q4",           // 4-bit quantized — smallest/fastest for mobile
      device: "wasm",        // WASM backend — guaranteed to work in WebView
      progress_callback: (p) => {
        if (p.status === "downloading") {
          const pct = p.total ? Math.round((p.loaded / p.total) * 100) : 0;
          self.postMessage({
            type: "loading",
            progress: pct,
            message: `Downloading ${p.file?.split("/").pop() || "model"} ${pct}%`,
          });
        } else if (p.status === "loading") {
          self.postMessage({ type: "loading", progress: 95, message: "Initializing WASM…" });
        }
      },
    });

    currentModelKey = modelKey;
    self.postMessage({ type: "loaded", modelKey });

  } catch (err) {
    currentPipeline = null;
    currentModelKey = null;
    self.postMessage({ type: "error", message: err.message });
  }
}

async function generate(prompt, maxNewTokens = 400) {
  if (!currentPipeline) {
    self.postMessage({ type: "error", message: "No model loaded. Load a model first." });
    return;
  }

  try {
    self.postMessage({ type: "generating" });

    const result = await currentPipeline(prompt, {
      max_new_tokens: maxNewTokens,
      temperature: 0.7,
      do_sample: true,
      repetition_penalty: 1.1,
      // Stream tokens back as they generate
      callback_function: (tokens) => {
        // Decode partial output
        const partial = tokens[0]?.generated_text || "";
        // Only send the new part (after the prompt)
        const newText = partial.slice(prompt.length);
        if (newText) {
          self.postMessage({ type: "token", text: newText });
        }
      },
    });

    const fullText = Array.isArray(result)
      ? result[0]?.generated_text || ""
      : result?.generated_text || "";

    // Send the complete response (trimmed after the prompt)
    const response = fullText.slice(prompt.length).trim();
    self.postMessage({ type: "done", text: response });

  } catch (err) {
    self.postMessage({ type: "error", message: err.message });
  }
}

export { MODELS };
