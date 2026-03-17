// useOfflineAI.js — React hook wrapping the Web Worker
import { useState, useRef, useCallback, useEffect } from "react";

export const OFFLINE_MODELS = [
  {
    key: "tiny-starcoder",
    label: "SmolLM2 135M",
    size: "~270 MB",
    speed: "⚡⚡⚡ Very Fast",
    desc: "Fastest, lightest — good for simple code tasks",
  },
  {
    key: "codegen-350m",
    label: "CodeGen 350M",
    size: "~700 MB",
    speed: "⚡⚡ Fast",
    desc: "Code specialist — better completions",
  },
  {
    key: "phi-1_5",
    label: "Phi-1.5 (1.3B)",
    size: "~1.3 GB",
    speed: "⚡ Moderate",
    desc: "Best quality — needs 4 GB+ RAM phone",
  },
];

export function useOfflineAI() {
  const workerRef = useRef(null);
  const resolveRef = useRef(null);
  const [status, setStatus]     = useState("idle");     // idle | loading | ready | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [loadedModel, setLoadedModel] = useState(null);
  const [streamText, setStreamText]   = useState("");

  // Create worker once
  useEffect(() => {
    const worker = new Worker(
      new URL("./offlineWorker.js", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (e) => {
      const { type, ...data } = e.data;
      switch (type) {
        case "loading":
          setStatus("loading");
          setProgress(data.progress || 0);
          setProgressMsg(data.message || "Loading…");
          break;
        case "loaded":
          setStatus("ready");
          setProgress(100);
          setLoadedModel(data.modelKey);
          setProgressMsg("Model ready");
          resolveRef.current?.({ ok: true });
          resolveRef.current = null;
          break;
        case "generating":
          setStreamText("");
          break;
        case "token":
          setStreamText(t => t + data.text);
          break;
        case "done":
          setStreamText("");
          resolveRef.current?.({ ok: true, text: data.text });
          resolveRef.current = null;
          break;
        case "error":
          setStatus("error");
          setProgressMsg(data.message);
          resolveRef.current?.({ ok: false, error: data.message });
          resolveRef.current = null;
          break;
      }
    };

    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const loadModel = useCallback((modelKey) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setStatus("loading");
      setProgress(0);
      setProgressMsg("Starting…");
      workerRef.current?.postMessage({ type: "load", payload: { modelKey } });
    });
  }, []);

  const generate = useCallback((prompt, maxTokens = 400) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      workerRef.current?.postMessage({ type: "generate", payload: { prompt, maxTokens } });
    });
  }, []);

  return {
    status,        // "idle" | "loading" | "ready" | "error"
    progress,      // 0-100
    progressMsg,
    loadedModel,
    streamText,    // partial tokens while generating
    loadModel,
    generate,
  };
}
