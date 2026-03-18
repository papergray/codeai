// useOfflineAI.js
// Runs @huggingface/transformers directly on the main thread.
// Web Workers with type:"module" are unreliable in Android Capacitor WebView,
// so we drive everything here and yield with requestAnimationFrame so the UI
// can still update progress and streaming tokens.

import { useState, useRef, useCallback } from "react";

export const OFFLINE_MODELS = [
  {
    key: "smollm",
    id:  "HuggingFaceTB/SmolLM2-135M-Instruct",
    label: "SmolLM2 135M",
    size:  "~270 MB",
    speed: "⚡⚡⚡ Fastest",
    desc:  "Quickest — good for simple tasks",
  },
  {
    key: "codegen",
    id:  "Xenova/codegen-350M-mono",
    label: "CodeGen 350M",
    size:  "~700 MB",
    speed: "⚡⚡ Fast",
    desc:  "Code specialist",
  },
  {
    key: "phi15",
    id:  "Xenova/phi-1_5",
    label: "Phi-1.5 (1.3B)",
    size:  "~1.3 GB",
    speed: "⚡ Good quality",
    desc:  "Best results, needs 4 GB+ RAM",
  },
];

// Module-level singleton so the pipeline survives React re-renders
let _pipe       = null;
let _loadedId   = null;
let _loading    = false;

// Yield control back to the browser for one animation frame
const tick = () => new Promise(r => requestAnimationFrame(r));

export function useOfflineAI() {
  const [status,      setStatus]      = useState("idle");   // idle|loading|ready|error
  const [progress,    setProgress]    = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [loadedKey,   setLoadedKey]   = useState(null);
  const [streamBuf,   setStreamBuf]   = useState("");

  // Rehydrate from singleton on first render
  const initialised = useRef(false);
  if (!initialised.current) {
    initialised.current = true;
    if (_pipe && _loadedId) {
      const info = OFFLINE_MODELS.find(m => m.id === _loadedId);
      if (info) {
        // Already loaded in this page session
        setTimeout(() => {
          setStatus("ready");
          setLoadedKey(info.key);
          setProgress(100);
          setProgressMsg(`${info.label} ready`);
        }, 0);
      }
    }
  }

  const loadModel = useCallback(async (modelKey) => {
    const info = OFFLINE_MODELS.find(m => m.key === modelKey);
    if (!info) return { ok: false, error: "Unknown model key" };

    // Already loaded
    if (_pipe && _loadedId === info.id) {
      setStatus("ready");
      setLoadedKey(modelKey);
      setProgress(100);
      setProgressMsg(`${info.label} ready`);
      return { ok: true };
    }

    if (_loading) return { ok: false, error: "Already loading a model" };
    _loading = true;

    setStatus("loading");
    setProgress(0);
    setProgressMsg("Importing AI library…");
    setLoadedKey(null);
    _pipe = null;
    _loadedId = null;

    try {
      // Lazy-import so it doesn't slow down initial app load
      await tick();
      const { pipeline, env } = await import("@huggingface/transformers");

      // Store models in Cache API → survives reloads without re-downloading
      env.useBrowserCache  = true;
      env.allowLocalModels = false;
      // Single-threaded WASM — guaranteed to work in Capacitor WebView
      env.backends.onnx.wasm.numThreads = 1;

      setProgressMsg("Connecting to model hub…");
      await tick();

      _pipe = await pipeline("text-generation", info.id, {
        dtype:  "q4",    // 4-bit quantized — smallest footprint for mobile
        device: "wasm",  // WASM backend, no WebGPU needed

        progress_callback: ({ status: s, file, loaded, total }) => {
          if (s === "downloading" && total) {
            const pct  = Math.round((loaded / total) * 100);
            const name = (file || "").split("/").pop();
            setProgress(pct);
            setProgressMsg(`${name}  ${pct}%`);
          } else if (s === "loading" || s === "initiate") {
            setProgress(90);
            setProgressMsg("Loading weights into WASM…");
          } else if (s === "ready") {
            setProgress(99);
            setProgressMsg("Finalizing…");
          }
        },
      });

      _loadedId = info.id;
      _loading  = false;

      setStatus("ready");
      setProgress(100);
      setProgressMsg(`${info.label} ready`);
      setLoadedKey(modelKey);
      return { ok: true };

    } catch (err) {
      _pipe     = null;
      _loadedId = null;
      _loading  = false;
      setStatus("error");
      setProgressMsg(err.message || "Load failed");
      return { ok: false, error: err.message };
    }
  }, []);

  const generate = useCallback(async (prompt, maxNewTokens = 300) => {
    if (!_pipe) return { ok: false, error: "No model loaded." };

    setStreamBuf("");
    await tick();

    try {
      let accumulated = "";

      const result = await _pipe(prompt, {
        max_new_tokens:     maxNewTokens,
        temperature:        0.7,
        do_sample:          true,
        repetition_penalty: 1.1,

        // Called after every token — update streaming buffer
        callback_function: async (beams) => {
          const full    = beams[0]?.generated_text || "";
          const newPart = full.slice(prompt.length);
          if (newPart !== accumulated) {
            accumulated = newPart;
            setStreamBuf(accumulated);
            // Yield so React can flush the state update and repaint
            await tick();
          }
        },
      });

      const full     = Array.isArray(result) ? result[0]?.generated_text : result?.generated_text;
      const response = (full || "").slice(prompt.length).trim();

      setStreamBuf("");
      return { ok: true, text: response };

    } catch (err) {
      setStreamBuf("");
      return { ok: false, error: err.message };
    }
  }, []);

  return { status, progress, progressMsg, loadedKey, streamBuf, loadModel, generate };
}
