import { useState, useRef, useEffect } from "react";
import { useOfflineAI, OFFLINE_MODELS } from "../useOfflineAI.js";

const buildOfflinePrompt = (text, lang, mode) => ({
  generate: `### Task\nWrite ${lang} code for: ${text}\n### Code\n\`\`\`${lang}\n`,
  debug:    `### Buggy Code\n${text}\n### Fixed Code\n\`\`\`${lang}\n`,
  explain:  `### Code\n${text}\n### Explanation\n`,
  optimize: `### Code to Optimize\n${text}\n### Optimized\n\`\`\`${lang}\n`,
})[mode] || `${text}\n### Answer\n`;

const onlineSystem = (lang, mode) => ({
  generate: `Expert ${lang} developer. Generate clean well-commented code in \`\`\`${lang} blocks, then brief explanation.`,
  debug:    `Expert ${lang} debugger. Return FIXED code in \`\`\`${lang} block, then bullet-list bugs found.`,
  explain:  `Expert ${lang} developer. Explain code clearly. Note key patterns and gotchas.`,
  optimize: `Expert ${lang} developer. Optimize for performance. Return improved code then summarize changes.`,
})[mode] || `Expert ${lang} developer. Be concise.`;

const fmtResponse = (text) => {
  const parts = [];
  const re = /```[\w]*\n?([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", content: text.slice(last, m.index) });
    parts.push({ type: "code", content: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", content: text.slice(last) });
  return parts.filter(p => p.content.trim());
};

const MODES = [
  { id: "generate", icon: "⚡", label: "Gen" },
  { id: "debug",    icon: "🔍", label: "Debug" },
  { id: "explain",  icon: "💡", label: "Explain" },
  { id: "optimize", icon: "🚀", label: "Opt" },
];

export default function AIPanel({ apiKey, currentLang, onInsertCode }) {
  const [aiMode,    setAiMode]    = useState(() => localStorage.getItem("ai_mode")   || "online");
  const [codeMode,  setCodeMode]  = useState("generate");
  const [msgs,      setMsgs]      = useState([]);
  const [input,     setInput]     = useState("");
  const [busy,      setBusy]      = useState(false);
  const [copied,    setCopied]    = useState(null);
  const [showPicker,setShowPicker] = useState(false);
  const [selModel,  setSelModel]  = useState(() => localStorage.getItem("sel_model") || "smollm");
  const bottomRef = useRef(null);
  const offline   = useOfflineAI();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy, offline.streamBuf]);
  useEffect(() => { localStorage.setItem("ai_mode",   aiMode);    }, [aiMode]);
  useEffect(() => { localStorage.setItem("sel_model", selModel);  }, [selModel]);

  const copy = (txt, id) => {
    navigator.clipboard.writeText(txt).then(() => { setCopied(id); setTimeout(() => setCopied(null), 2000); });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput(""); setBusy(true);
    const userMsg = { role: "user", content: text };
    setMsgs(p => [...p, userMsg]);
    try {
      let reply = "";
      if (aiMode === "online") {
        const key = apiKey?.trim();
        if (!key) throw new Error("No Claude API key. Tap ⚙ Settings.");
        const history = [...msgs, userMsg].map(m => ({ role: m.role, content: m.content }));
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500, system: onlineSystem(currentLang, codeMode), messages: history }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        reply = data.content?.map(b => b.text || "").join("") || "No response.";
      } else {
        if (offline.status !== "ready") throw new Error("Model not loaded. Load one below.");
        const prompt = buildOfflinePrompt(text, currentLang, codeMode);
        const result = await offline.generate(prompt, 350);
        if (!result.ok) throw new Error(result.error || "Generation failed.");
        reply = result.text || "(empty response)";
      }
      setMsgs(p => [...p, { role: "assistant", content: reply }]);
    } catch (e) {
      setMsgs(p => [...p, { role: "assistant", content: `⚠️ ${e.message}` }]);
    }
    setBusy(false);
  };

  const doLoad = async (key) => {
    setShowPicker(false);
    setSelModel(key);
    const result = await offline.loadModel(key);
    if (!result.ok) setMsgs(p => [...p, { role: "assistant", content: `⚠️ Load failed: ${result.error}` }]);
  };

  const isStreaming   = busy || (aiMode === "offline" && !!offline.streamBuf);
  const offlineBlocked = aiMode === "offline" && offline.status !== "ready";
  const loadedInfo   = OFFLINE_MODELS.find(m => m.key === offline.loadedKey);
  const selInfo      = OFFLINE_MODELS.find(m => m.key === selModel);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#090912", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid #1a1a2e", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: "linear-gradient(135deg,#7c3aed,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 700 }}>AI</div>
          <span style={{ fontSize: 11, color: "#c0c0e0", fontWeight: 700 }}>Code Assistant</span>
          {msgs.length > 0 && <button onClick={() => setMsgs([])} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#3a3a5c", cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>Clear</button>}
        </div>
        <div style={{ display: "flex", background: "#0d0d18", borderRadius: 7, padding: 2, border: "1px solid #1a1a2e" }}>
          {["online", "offline"].map(m => (
            <button key={m} onClick={() => setAiMode(m)} style={{
              flex: 1, padding: "5px 0", borderRadius: 5, border: "none",
              background: aiMode === m ? (m === "online" ? "#0a1f0c" : "#14143a") : "transparent",
              color: aiMode === m ? (m === "online" ? "#22c55e" : "#a78bfa") : "#3a3a5c",
              cursor: "pointer", fontSize: 10, fontWeight: 700, fontFamily: "inherit",
            }}>{m === "online" ? "🌐 Online" : "📴 Offline"}</button>
          ))}
        </div>
      </div>

      {/* Mode pills */}
      <div style={{ display: "flex", gap: 3, padding: "5px 8px", borderBottom: "1px solid #1a1a2e", flexShrink: 0 }}>
        {MODES.map(m => (
          <button key={m.id} onClick={() => setCodeMode(m.id)} style={{
            flex: 1, padding: "5px 2px", borderRadius: 6, border: `1px solid ${codeMode === m.id ? "#4a3a8a" : "#1a1a2e"}`,
            background: codeMode === m.id ? "#1e1e3a" : "transparent",
            color: codeMode === m.id ? "#a78bfa" : "#4a4a7a",
            cursor: "pointer", fontSize: 10, fontFamily: "inherit", fontWeight: codeMode === m.id ? 700 : 400,
          }}>{m.icon} {m.label}</button>
        ))}
      </div>

      {/* Offline section */}
      {aiMode === "offline" && (
        <div style={{ padding: "8px", borderBottom: "1px solid #1a1a2e", background: "#07070e", flexShrink: 0 }}>
          {offline.status === "ready" ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#0a1a0a", border: "1px solid #1a3a1a", borderRadius: 8, padding: "7px 10px", marginBottom: showPicker ? 6 : 0 }}>
                <span>✅</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#86efac", fontWeight: 700 }}>{loadedInfo?.label}</div>
                  <div style={{ fontSize: 9, color: "#3a5a3a" }}>Fully offline</div>
                </div>
                <button onClick={() => setShowPicker(p => !p)} style={{ background: "#1a2a1a", border: "1px solid #2a4a2a", borderRadius: 5, padding: "3px 8px", color: "#86efac", cursor: "pointer", fontSize: 9, fontFamily: "inherit" }}>
                  Switch {showPicker ? "▲" : "▼"}
                </button>
              </div>
              {showPicker && OFFLINE_MODELS.filter(m => m.key !== offline.loadedKey).map(m => (
                <button key={m.key} onClick={() => doLoad(m.key)} style={{
                  width: "100%", background: "#0f0f18", border: "1px solid #1a1a2e", borderRadius: 7, padding: "7px 10px", marginBottom: 4,
                  display: "flex", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit",
                }}>
                  <span style={{ fontSize: 11, color: "#8080a0", fontWeight: 700 }}>{m.label}</span>
                  <span style={{ fontSize: 9, color: "#7c3aed" }}>{m.size}</span>
                </button>
              ))}
            </div>
          ) : offline.status === "loading" ? (
            <div style={{ background: "#0d0d20", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: "#a78bfa", flex: 1, paddingRight: 6 }}>{offline.progressMsg}</span>
                <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700 }}>{offline.progress}%</span>
              </div>
              <div style={{ background: "#1a1a2e", borderRadius: 5, height: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${offline.progress}%`, background: "linear-gradient(90deg,#7c3aed,#3b82f6)", transition: "width .3s", borderRadius: 5 }} />
              </div>
              <div style={{ fontSize: 9, color: "#3a3a5c", marginTop: 4, textAlign: "center" }}>Cached after first download</div>
            </div>
          ) : (
            <div>
              {offline.status === "cached" && <div style={{ fontSize: 10, color: "#f59e0b", marginBottom: 6, padding: "5px 8px", background: "#1a1205", borderRadius: 6, border: "1px solid #3a2a10" }}>⚠ Cached but unloaded. Tap Reload.</div>}
              {offline.status === "error"  && <div style={{ fontSize: 10, color: "#f87171", marginBottom: 6, padding: "5px 8px", background: "#1a0505", borderRadius: 6, border: "1px solid #3a1515" }}>⚠ {offline.progressMsg}</div>}
              {OFFLINE_MODELS.map(m => (
                <button key={m.key} onClick={() => setSelModel(m.key)} style={{
                  width: "100%", marginBottom: 4, background: selModel === m.key ? "#141428" : "#0d0d18",
                  border: `1px solid ${selModel === m.key ? "#4a3a8a" : "#1a1a2e"}`,
                  borderRadius: 7, padding: "7px 10px", cursor: "pointer", fontFamily: "inherit",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: selModel === m.key ? "#a78bfa" : "#7070a0" }}>{m.label}</div>
                    <div style={{ fontSize: 9, color: "#3a3a5c" }}>{m.speed}</div>
                  </div>
                  <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 700 }}>{m.size}</div>
                </button>
              ))}
              <button onClick={() => doLoad(selModel)} style={{
                width: "100%", padding: "10px", borderRadius: 8, border: "none",
                background: "linear-gradient(135deg,#7c3aed,#3b82f6)", color: "#fff",
                cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit",
              }}>
                {offline.status === "cached" ? "♻ Reload" : "⬇ Download & Load"} {selInfo?.label}
              </button>
              <div style={{ fontSize: 9, color: "#2a2a3a", textAlign: "center", marginTop: 4 }}>
                Internet needed once · offline forever after
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px", display: "flex", flexDirection: "column", gap: 8 }}>
        {msgs.length === 0 && !isStreaming && (
          <div style={{ padding: "20px 6px", textAlign: "center" }}>
            <div style={{ fontSize: 28, opacity: 0.15, marginBottom: 8 }}>{aiMode === "offline" ? "📴" : "🤖"}</div>
            <div style={{ fontSize: 10, color: "#2a2a4a", lineHeight: 1.9 }}>
              {offlineBlocked ? "← Load a model to start" : codeMode === "generate" ? `Describe ${currentLang} code to write` : codeMode === "debug" ? "Paste code to debug" : codeMode === "explain" ? "Paste code to explain" : "Paste code to optimize"}
            </div>
          </div>
        )}
        {msgs.map((msg, i) => {
          if (msg.role === "user") return (
            <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ background: "linear-gradient(135deg,#3b0764,#1e3a8a)", border: "1px solid #4c1d95", borderRadius: "12px 12px 3px 12px", padding: "8px 11px", maxWidth: "92%", fontSize: 11, lineHeight: 1.6, color: "#ddd6fe", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.content}</div>
            </div>
          );
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {fmtResponse(msg.content).map((p, j) => p.type === "code" ? (
                <div key={j} style={{ background: "#050508", border: "1px solid #1e1e3a", borderRadius: 7, overflow: "hidden" }}>
                  <div style={{ background: "#0a0a12", borderBottom: "1px solid #1a1a2e", padding: "4px 10px", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 9, color: "#3a3a5c" }}>{currentLang?.toUpperCase()}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {onInsertCode && <button onClick={() => onInsertCode(p.content)} style={{ background: "#1a2a1a", border: "1px solid #2a4a2a", borderRadius: 3, padding: "2px 7px", cursor: "pointer", color: "#22c55e", fontSize: 9, fontFamily: "inherit" }}>Insert</button>}
                      <button onClick={() => copy(p.content, `${i}-${j}`)} style={{ background: copied === `${i}-${j}` ? "#22c55e22" : "#1a1a2e", border: `1px solid ${copied === `${i}-${j}` ? "#22c55e" : "#2a2a4a"}`, borderRadius: 3, padding: "2px 7px", cursor: "pointer", color: copied === `${i}-${j}` ? "#22c55e" : "#666", fontSize: 9, fontFamily: "inherit" }}>{copied === `${i}-${j}` ? "✓" : "Copy"}</button>
                    </div>
                  </div>
                  <pre style={{ margin: 0, padding: "9px 12px", overflowX: "auto", fontSize: 11, lineHeight: 1.7, color: "#a5f3fc", fontFamily: "inherit", whiteSpace: "pre" }}>{p.content}</pre>
                </div>
              ) : (
                <div key={j} style={{ background: "#0e0e1a", border: "1px solid #1a1a2e", borderRadius: 7, padding: "7px 10px", fontSize: 11, lineHeight: 1.7, color: "#c0c0e0", whiteSpace: "pre-wrap" }}>{p.content.trim()}</div>
              ))}
            </div>
          );
        })}
        {aiMode === "offline" && offline.streamBuf && (
          <div style={{ background: "#0e0e1a", border: "1px solid #1a1a2e", borderRadius: 7, padding: "7px 10px", fontSize: 11, lineHeight: 1.7, color: "#c0c0e0", whiteSpace: "pre-wrap" }}>
            {offline.streamBuf}<span style={{ display: "inline-block", width: 5, height: 12, background: "#7c3aed", marginLeft: 2, animation: "blink .8s infinite", verticalAlign: "text-bottom" }} />
          </div>
        )}
        {busy && aiMode === "online" && (
          <div style={{ display: "flex", gap: 4, padding: "4px 6px" }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#7c3aed", animation: `bounce 1s ${i*.18}s infinite` }} />)}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "6px 8px 10px", borderTop: "1px solid #1a1a2e", flexShrink: 0 }}>
        <div style={{ background: "#111120", border: "1px solid #2a2a3a", borderRadius: 9, display: "flex", alignItems: "flex-end", gap: 5, padding: "5px 5px 5px 9px", opacity: offlineBlocked ? 0.4 : 1 }}>
          <textarea
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={offlineBlocked ? "Load a model first ↑" : codeMode === "generate" ? `Describe ${currentLang} code…` : "Paste code here…"}
            disabled={offlineBlocked} rows={1}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e0e0f0", fontSize: 11, lineHeight: 1.6, resize: "none", fontFamily: "inherit", minHeight: 30, maxHeight: 90, overflowY: "auto" }}
          />
          <button onClick={send} disabled={isStreaming || !input.trim() || offlineBlocked} style={{
            width: 30, height: 30, borderRadius: 7, border: "none", flexShrink: 0,
            background: isStreaming || !input.trim() || offlineBlocked ? "#1a1a2e" : "linear-gradient(135deg,#7c3aed,#3b82f6)",
            color: isStreaming || !input.trim() || offlineBlocked ? "#2a2a4a" : "#fff",
            cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
          }}>↑</button>
        </div>
      </div>
      <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </div>
  );
}
