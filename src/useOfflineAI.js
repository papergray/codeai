import { useState, useRef, useEffect, useCallback } from "react";

export const OFFLINE_MODELS = [
  { key: "smollm",    id: "HuggingFaceTB/SmolLM2-135M-Instruct", label: "SmolLM2 135M", size: "~270 MB", speed: "⚡⚡⚡ Fastest" },
  { key: "codegen",   id: "Xenova/codegen-350M-mono",             label: "CodeGen 350M",  size: "~700 MB", speed: "⚡⚡ Fast"    },
  { key: "phi15",     id: "Xenova/phi-1_5",                       label: "Phi-1.5 (1.3B)", size: "~1.3 GB", speed: "⚡ Good"   },
];

const CACHE_KEY = "offline_ai_loaded_model";

let _worker = null;
let _cbMap  = {};  // id → { resolve, onToken }

function getWorker() {
  if (!_worker) {
    _worker = new Worker(new URL("./offlineWorker.js", import.meta.url), { type: "module" });
    _worker.onmessage = ({ data }) => {
      const cb = _cbMap[data.id];
      if (!cb) return;
      if (data.type === "progress") {
        cb.onProgress?.(data.pct, data.msg);
      } else if (data.type === "loaded") {
        localStorage.setItem(CACHE_KEY, data.modelId);
        cb.resolve({ ok: true });
        delete _cbMap[data.id];
      } else if (data.type === "token") {
        cb.onToken?.(data.chunk);
      } else if (data.type === "done") {
        cb.resolve({ ok: true, text: data.text });
        delete _cbMap[data.id];
      } else if (data.type === "error") {
        cb.resolve({ ok: false, error: data.msg });
        delete _cbMap[data.id];
      }
    };
  }
  return _worker;
}

let _reqId = 0;
const nextId = () => String(++_reqId);

export function useOfflineAI() {
  // Restore last loaded model from localStorage so UI reflects reality
  const savedModel = localStorage.getItem(CACHE_KEY);
  const savedInfo = OFFLINE_MODELS.find(m => m.id === savedModel);

  const [status,      setStatus]      = useState(savedInfo ? "cached" : "idle");
  const [progress,    setProgress]    = useState(0);
  const [progressMsg, setProgressMsg] = useState(savedInfo ? `${savedInfo.label} cached` : "");
  const [loadedKey,   setLoadedKey]   = useState(savedInfo?.key || null);
  const [streamBuf,   setStreamBuf]   = useState("");

  // On mount, verify the cached model is actually still in memory (worker may have been killed)
  useEffect(() => {
    if (savedInfo) {
      const id = nextId();
      _cbMap[id] = {
        onProgress: () => {},
        resolve: (r) => {
          if (r.ok) {
            setStatus("ready");
            setLoadedKey(savedInfo.key);
          } else {
            // Worker doesn't have it loaded — show as cached but needs reload
            setStatus("cached");
          }
        },
      };
      getWorker().postMessage({ type: "status", id });
    }
  }, []); // eslint-disable-line

  const loadModel = useCallback((modelKey) => {
    const info = OFFLINE_MODELS.find(m => m.key === modelKey);
    if (!info) return Promise.resolve({ ok: false, error: "Unknown model" });

    return new Promise((resolve) => {
      setStatus("loading");
      setProgress(0);
      setProgressMsg("Starting…");
      setLoadedKey(null);

      const id = nextId();
      _cbMap[id] = {
        onProgress: (pct, msg) => { setProgress(pct); setProgressMsg(msg); },
        resolve: (r) => {
          if (r.ok) {
            setStatus("ready");
            setProgress(100);
            setProgressMsg(`${info.label} ready`);
            setLoadedKey(modelKey);
          } else {
            setStatus("error");
            setProgressMsg(r.error || "Failed");
          }
          resolve(r);
        },
      };
      getWorker().postMessage({ type: "load", id, modelId: info.id });
    });
  }, []);

  const generate = useCallback((prompt, maxTokens = 350) => {
    return new Promise((resolve) => {
      setStreamBuf("");
      const id = nextId();
      _cbMap[id] = {
        onToken: (chunk) => setStreamBuf(b => b + chunk),
        resolve: (r) => { setStreamBuf(""); resolve(r); },
      };
      getWorker().postMessage({ type: "generate", id, prompt, maxTokens });
    });
  }, []);

  return { status, progress, progressMsg, loadedKey, streamBuf, loadModel, generate };
}
