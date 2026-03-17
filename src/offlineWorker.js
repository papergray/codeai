// offlineWorker.js — Web Worker for on-device AI inference
// Uses @huggingface/transformers WASM backend (works in Android WebView)
import { pipeline, env } from "@huggingface/transformers";

// Use browser Cache API to persist models across sessions
env.useBrowserCache = true;
env.allowLocalModels = false;
// Use WASM backend — guaranteed to work in Android WebView (no WebGPU needed)
env.backends.onnx.wasm.numThreads = 1;

let pipe = null;
let loadedModelId = null;

self.onmessage = async ({ data }) => {
  const { type, id, modelId, prompt, maxTokens } = data;

  if (type === "load") {
    await doLoad(id, modelId);
  } else if (type === "generate") {
    await doGenerate(id, prompt, maxTokens || 300);
  } else if (type === "status") {
    self.postMessage({ type: "status", id, loaded: !!pipe, modelId: loadedModelId });
  }
};

async function doLoad(id, modelId) {
  // Already loaded the same model
  if (pipe && loadedModelId === modelId) {
    self.postMessage({ type: "loaded", id, modelId });
    return;
  }

  // Reset if switching models
  pipe = null;
  loadedModelId = null;

  try {
    self.postMessage({ type: "progress", id, pct: 0, msg: "Starting download…" });

    pipe = await pipeline("text-generation", modelId, {
      dtype: "q4",
      device: "wasm",
      progress_callback: ({ status, file, loaded, total }) => {
        if (status === "downloading" && total) {
          const pct = Math.round((loaded / total) * 100);
          const fname = (file || "").split("/").pop();
          self.postMessage({ type: "progress", id, pct, msg: `${fname} ${pct}%` });
        } else if (status === "loading" || status === "initiate") {
          self.postMessage({ type: "progress", id, pct: 95, msg: "Loading into memory…" });
        } else if (status === "ready") {
          self.postMessage({ type: "progress", id, pct: 99, msg: "Almost ready…" });
        }
      },
    });

    loadedModelId = modelId;
    self.postMessage({ type: "loaded", id, modelId });
  } catch (err) {
    pipe = null;
    loadedModelId = null;
    self.postMessage({ type: "error", id, msg: err.message });
  }
}

async function doGenerate(id, prompt, maxNewTokens) {
  if (!pipe) {
    self.postMessage({ type: "error", id, msg: "No model loaded." });
    return;
  }
  try {
    self.postMessage({ type: "genStart", id });

    // Stream tokens
    let prevLen = prompt.length;
    const out = await pipe(prompt, {
      max_new_tokens: maxNewTokens,
      temperature: 0.7,
      do_sample: true,
      repetition_penalty: 1.1,
      streamer: undefined, // handled via callback below
      callback_function: (beams) => {
        const text = beams[0]?.output_token_ids
          ? null // token id mode — skip
          : beams[0]?.generated_text || "";
        if (text && text.length > prevLen) {
          self.postMessage({ type: "token", id, chunk: text.slice(prevLen) });
          prevLen = text.length;
        }
      },
    });

    const full = Array.isArray(out) ? out[0]?.generated_text : out?.generated_text;
    const response = (full || "").slice(prompt.length).trim();
    self.postMessage({ type: "done", id, text: response });
  } catch (err) {
    self.postMessage({ type: "error", id, msg: err.message });
  }
}
