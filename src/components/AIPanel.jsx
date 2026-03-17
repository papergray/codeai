import { useState, useRef, useEffect } from "react";
import { useOfflineAI, OFFLINE_MODELS } from "../useOfflineAI.js";

const buildOfflinePrompt = (userText, lang, mode) => ({
  generate: `### ${lang} Code Task\n${userText}\n\n### Solution\n\`\`\`${lang}\n`,
  debug:    `### Buggy ${lang} Code\n${userText}\n\n### Fixed Code\n\`\`\`${lang}\n`,
  explain:  `### ${lang} Code to Explain\n${userText}\n\n### Explanation\n`,
  optimize: `### ${lang} Code to Optimize\n${userText}\n\n### Optimized Code\n\`\`\`${lang}\n`,
}[mode] || `${userText}\n\n### Answer\n`);

const onlineSystem = (lang, mode) => ({
  generate: `You are an expert ${lang} developer. Generate clean, well-commented code. Put code in \`\`\`${lang} blocks then give a brief explanation.`,
  debug:    `You are an expert ${lang} debugger. Find bugs, return the FIXED code in a \`\`\`${lang} block, then bullet-list what was wrong.`,
  explain:  `You are an expert ${lang} developer. Explain the code clearly. Highlight key concepts and gotchas.`,
  optimize: `You are an expert ${lang} developer. Optimize for performance and readability. Return improved code then summarize changes.`,
}[mode] || `You are an expert ${lang} developer. Be concise and practical.`);

const formatResponse = (text) => {
  if (!text?.trim()) return [];
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
  { id: "generate", icon: "⚡", label: "Generate" },
  { id: "debug",    icon: "🔍", label: "Debug" },
  { id: "explain",  icon: "💡", label: "Explain" },
  { id: "optimize", icon: "🚀", label: "Optimize" },
];

export default function AIPanel({ apiKey, currentLang, onInsertCode }) {
  const [aiMode, setAiMode]   = useState("online");
  const [codeMode, setCodeMode] = useState("generate");
  const [messages, setMessages] = useState([]);
  const [input, setInput]     = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied]   = useState(null);
  const [selectedModel, setSelectedModel] = useState("tiny-starcoder");
  const bottomRef = useRef(null);
  const offline = useOfflineAI();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, offline.streamText]);

  const copy = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    const userMsg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    try {
      let reply = "";
      if (aiMode === "online") {
        const key = apiKey?.trim();
        if (!key) throw new Error("No API key. Tap ⚙ Settings to add your Claude API key.");
        const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            system: onlineSystem(currentLang, codeMode),
            messages: history,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        reply = data.content?.map(b => b.text || "").join("") || "No response.";
      } else {
        if (offline.status !== "ready") throw new Error("Model not loaded. Tap 'Download & Load' below.");
        const prompt = buildOfflinePrompt(text, currentLang, codeMode);
        const result = await offline.generate(prompt, 400);
        if (!result.ok) throw new Error(result.error || "Generation failed.");
        reply = result.text || "No output generated.";
      }
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: `⚠️ ${e.message}` }]);
    }
    setSending(false);
  };

  const loadModel = async () => {
    const result = await offline.loadModel(selectedModel);
    if (!result.ok) {
      setMessages(prev => [...prev, { role: "assistant", content: `⚠️ Load failed: ${result.error}` }]);
    }
  };

  const busy = sending || (aiMode === "offline" && !!offline.streamText);
  const offlineDisabled = aiMode === "offline" && offline.status !== "ready";
  const modelInfo = OFFLINE_MODELS.find(m => m.key === selectedModel);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#090912" }}>

      {/* Header */}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid #1a1a2e", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 7, flexShrink: 0,
            background: "linear-gradient(135deg,#7c3aed,#3b82f6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, color: "#fff", fontWeight: 700,
          }}>AI</div>
          <span style={{ fontSize: 11, color: "#c0c0e0", fontWeight: 700 }}>Code Assistant</span>
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} style={{
              marginLeft: "auto", background: "transparent", border: "none",
              color: "#3a3a5c", cursor: "pointer", fontSize: 10, fontFamily: "inherit",
            }}>Clear</button>
          )}
        </div>

        {/* Online / Offline toggle */}
        <div style={{ display: "flex", background: "#0d0d18", borderRadius: 8, padding: 2, border: "1px solid #1a1a2e" }}>
          <button onClick={() => setAiMode("online")} style={{
            flex: 1, padding: "5px 0", borderRadius: 6, border: "none",
            background: aiMode === "online" ? "#0d1f10" : "transparent",
            color: aiMode === "online" ? "#22c55e" : "#3a3a5c",
            cursor: "pointer", fontSize: 10, fontWeight: 700, fontFamily: "inherit",
            border: aiMode === "online" ? "1px solid #1d4a20" : "1px solid transparent",
          }}>🌐 Online</button>
          <button onClick={() => setAiMode("offline")} style={{
            flex: 1, padding: "5px 0", borderRadius: 6, border: "none",
            background: aiMode === "offline" ? "#1a1a3a" : "transparent",
            color: aiMode === "offline" ? "#a78bfa" : "#3a3a5c",
            cursor: "pointer", fontSize: 10, fontWeight: 700, fontFamily: "inherit",
            border: aiMode === "offline" ? "1px solid #3a2a7a" : "1px solid transparent",
          }}>📴 Offline</button>
        </div>
      </div>

      {/* Mode pills */}
      <div style={{ display: "flex", gap: 4, padding: "6px 10px", borderBottom: "1px solid #1a1a2e", flexShrink: 0, overflowX: "auto", scrollbarWidth: "none" }}>
        {MODES.map(m => (
          <button key={m.id} onClick={() => setCodeMode(m.id)} style={{
            padding: "5px 10px", borderRadius: 7, flexShrink: 0,
            background: codeMode === m.id ? "#1e1e3a" : "transparent",
            border: `1px solid ${codeMode === m.id ? "#4a3a8a" : "#1a1a2e"}`,
            color: codeMode === m.id ? "#a78bfa" : "#4a4a7a",
            cursor: "pointer", fontSize: 10, fontFamily: "inherit",
            fontWeight: codeMode === m.id ? 700 : 400,
          }}>{m.icon} {m.label}</button>
        ))}
      </div>

      {/* Offline model section */}
      {aiMode === "offline" && (
        <div style={{ padding: "8px 10px", borderBottom: "1px solid #1a1a2e", background: "#07070f", flexShrink: 0 }}>
          {offline.status === "ready" ? (
            <div style={{ background: "#0a1a0a", border: "1px solid #1a3a1a", borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>✅</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#86efac", fontWeight: 700 }}>
                  {OFFLINE_MODELS.find(m => m.key === offline.loadedModel)?.label}
                </div>
                <div style={{ fontSize: 9, color: "#3a5a3a" }}>Running fully offline · no internet needed</div>
              </div>
            </div>
          ) : offline.status === "loading" ? (
            <div style={{ background: "#0d0d20", borderRadius: 8, padding: "9px 10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "#a78bfa", flex: 1, paddingRight: 8 }}>{offline.progressMsg}</span>
                <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, flexShrink: 0 }}>{offline.progress}%</span>
              </div>
              <div style={{ background: "#1a1a2e", borderRadius: 6, height: 6, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${offline.progress}%`,
                  background: "linear-gradient(90deg,#7c3aed,#3b82f6)",
                  transition: "width 0.3s ease", borderRadius: 6,
                }} />
              </div>
              <div style={{ fontSize: 9, color: "#3a3a5c", marginTop: 5, textAlign: "center" }}>
                Model will be cached · never re-downloads
              </div>
            </div>
          ) : (
            /* idle or error */
            <div>
              {offline.status === "error" && (
                <div style={{ fontSize: 10, color: "#f87171", marginBottom: 6, padding: "6px 8px",
                  background: "#1a0505", borderRadius: 6, border: "1px solid #4a1a1a" }}>
                  ⚠ Error: {offline.progressMsg}
                </div>
              )}
              {/* Model cards */}
              {OFFLINE_MODELS.map(m => (
                <button key={m.key} onClick={() => setSelectedModel(m.key)} style={{
                  width: "100%", marginBottom: 5,
                  background: selectedModel === m.key ? "#141428" : "#0e0e1a",
                  border: `1px solid ${selectedModel === m.key ? "#4a3a8a" : "#1a1a2e"}`,
                  borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontFamily: "inherit",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: selectedModel === m.key ? "#a78bfa" : "#8080a0", marginBottom: 2 }}>{m.label}</div>
                    <div style={{ fontSize: 9, color: "#3a3a5c" }}>{m.desc}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 10 }}>
                    <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 700 }}>{m.size}</div>
                    <div style={{ fontSize: 9, color: "#3a3a5c" }}>{m.speed}</div>
                  </div>
                </button>
              ))}
              <button onClick={loadModel} style={{
                width: "100%", marginTop: 2, padding: "10px",
                background: "linear-gradient(135deg,#7c3aed,#3b82f6)",
                border: "none", borderRadius: 8, color: "#fff",
                cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                boxShadow: "0 2px 16px #7c3aed55",
              }}>
                ⬇ Download & Load {modelInfo?.label}
              </button>
              <div style={{ fontSize: 9, color: "#2a2a3a", textAlign: "center", marginTop: 5 }}>
                Needs internet to download once → works forever offline
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 9 }}>
        {messages.length === 0 && !busy && (
          <div style={{ padding: "24px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 32, opacity: 0.2, marginBottom: 8 }}>
              {aiMode === "offline" ? "📴" : "🤖"}
            </div>
            {aiMode === "offline" && offline.status !== "ready" ? (
              <div style={{ fontSize: 11, color: "#2a2a4a", lineHeight: 1.8 }}>
                ↑ Choose a model and tap<br/>"Download & Load" to start
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "#2a2a4a", lineHeight: 1.8 }}>
                {codeMode === "generate" ? `Describe ${currentLang} code to generate`
                 : codeMode === "debug"   ? "Paste buggy code to fix"
                 : codeMode === "explain" ? "Paste code to understand"
                 : "Paste code to optimize"}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "user") return (
            <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{
                background: "linear-gradient(135deg,#3b0764,#1e3a8a)",
                border: "1px solid #4c1d95", borderRadius: "12px 12px 3px 12px",
                padding: "8px 12px", maxWidth: "90%",
                fontSize: 11, lineHeight: 1.6, color: "#ddd6fe",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>{msg.content}</div>
            </div>
          );
          const parts = formatResponse(msg.content);
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {parts.map((p, j) => p.type === "code" ? (
                <div key={j} style={{ background: "#050508", border: "1px solid #1e1e3a", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ background: "#0a0a12", borderBottom: "1px solid #1a1a2e", padding: "5px 10px", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 9, color: "#3a3a5c" }}>{currentLang?.toUpperCase()}</span>
                    <div style={{ display: "flex", gap: 5 }}>
                      {onInsertCode && (
                        <button onClick={() => onInsertCode(p.content)} style={{
                          background: "#1a2a1a", border: "1px solid #2a4a2a", borderRadius: 4,
                          padding: "2px 8px", cursor: "pointer", color: "#22c55e", fontSize: 9, fontFamily: "inherit",
                        }}>Insert ↗</button>
                      )}
                      <button onClick={() => copy(p.content, `${i}-${j}`)} style={{
                        background: copied === `${i}-${j}` ? "#22c55e22" : "#1a1a2e",
                        border: `1px solid ${copied === `${i}-${j}` ? "#22c55e" : "#2a2a4a"}`,
                        borderRadius: 4, padding: "2px 8px", cursor: "pointer",
                        color: copied === `${i}-${j}` ? "#22c55e" : "#666", fontSize: 9, fontFamily: "inherit",
                      }}>{copied === `${i}-${j}` ? "✓" : "Copy"}</button>
                    </div>
                  </div>
                  <pre style={{ margin: 0, padding: "10px 12px", overflowX: "auto", fontSize: 11, lineHeight: 1.7, color: "#a5f3fc", fontFamily: "inherit", whiteSpace: "pre" }}>{p.content}</pre>
                </div>
              ) : (
                <div key={j} style={{ background: "#0e0e1a", border: "1px solid #1a1a2e", borderRadius: 8, padding: "8px 11px", fontSize: 11, lineHeight: 1.7, color: "#c0c0e0", whiteSpace: "pre-wrap" }}>{p.content.trim()}</div>
              ))}
            </div>
          );
        })}

        {/* Streaming offline tokens */}
        {aiMode === "offline" && offline.streamText && (
          <div style={{ background: "#0e0e1a", border: "1px solid #1a1a2e", borderRadius: 8, padding: "8px 11px", fontSize: 11, lineHeight: 1.7, color: "#c0c0e0", whiteSpace: "pre-wrap" }}>
            {offline.streamText}
            <span style={{ display: "inline-block", width: 6, height: 12, background: "#7c3aed", marginLeft: 2, animation: "blink 0.9s infinite", verticalAlign: "text-bottom" }} />
          </div>
        )}

        {/* Online loading indicator */}
        {sending && aiMode === "online" && (
          <div style={{ display: "flex", gap: 5, padding: 6 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#7c3aed", animation: `bounce 1s ${i*0.18}s infinite` }} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "8px 10px 12px", borderTop: "1px solid #1a1a2e", flexShrink: 0 }}>
        <div style={{
          background: "#111120", border: "1px solid #2a2a3a", borderRadius: 10,
          display: "flex", alignItems: "flex-end", gap: 6, padding: "6px 6px 6px 10px",
          opacity: offlineDisabled ? 0.4 : 1,
        }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={offlineDisabled ? "Load a model above first…"
              : codeMode === "generate" ? `Describe ${currentLang} code to write…`
              : `Paste your ${currentLang} code…`}
            disabled={offlineDisabled}
            rows={1}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "#e0e0f0", fontSize: 11, lineHeight: 1.6, resize: "none",
              fontFamily: "inherit", minHeight: 32, maxHeight: 100, overflowY: "auto",
            }}
          />
          <button onClick={send} disabled={busy || !input.trim() || offlineDisabled} style={{
            width: 32, height: 32, borderRadius: 8, border: "none", flexShrink: 0,
            background: busy || !input.trim() || offlineDisabled ? "#1a1a2e" : "linear-gradient(135deg,#7c3aed,#3b82f6)",
            color: busy || !input.trim() || offlineDisabled ? "#2a2a4a" : "#fff",
            cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center",
          }}>↑</button>
        </div>
      </div>

      <style>{`
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}
