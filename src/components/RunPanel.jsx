import { useState, useRef, useEffect, useCallback } from "react";

// Languages we can run and how
const RUNNERS = {
  html:       "webview",
  css:        "webview",
  javascript: "js",
  typescript: "js",
  python:     "python",
  json:       "json",
};

const canRun = (lang) => !!RUNNERS[lang];

// ── Build iframe srcdoc for different languages ───────────────────────────────
function buildSrcdoc(content, lang, consoleCb) {
  // Inject console capture + message bridge into every iframe
  const consoleBridge = `
    <script>
      const __log = [];
      const __send = (level, args) => {
        const msg = args.map(a => {
          try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }
          catch { return String(a); }
        }).join(' ');
        window.parent.postMessage({ type: 'console', level, msg }, '*');
      };
      ['log','info','warn','error','debug'].forEach(m => {
        const orig = console[m].bind(console);
        console[m] = (...a) => { __send(m, a); orig(...a); };
      });
      window.onerror = (msg, src, line, col) => {
        window.parent.postMessage({ type: 'console', level: 'error', msg: \`Error: \${msg} (line \${line})\` }, '*');
      };
      window.addEventListener('unhandledrejection', e => {
        window.parent.postMessage({ type: 'console', level: 'error', msg: 'Unhandled: ' + e.reason }, '*');
      });
    </script>
  `;

  if (lang === "html") {
    // Inject bridge into <head> if present, else prepend
    if (content.includes("<head>")) {
      return content.replace("<head>", `<head>${consoleBridge}`);
    }
    if (content.includes("<body>")) {
      return `<!DOCTYPE html><html><head>${consoleBridge}</head>${content.slice(content.indexOf("<body>"))}`;
    }
    return `<!DOCTYPE html><html><head>${consoleBridge}</head><body>${content}</body></html>`;
  }

  if (lang === "css") {
    return `<!DOCTYPE html><html><head>${consoleBridge}<style>${content}</style></head>
<body style="font-family:sans-serif;padding:20px;background:#fff;color:#333;">
  <h2>CSS Preview</h2>
  <p class="sample">Sample paragraph with your styles applied.</p>
  <button class="sample-btn">Sample Button</button>
  <div class="box">Sample Box</div>
  <ul><li>List item 1</li><li>List item 2</li></ul>
</body></html>`;
  }

  if (lang === "javascript" || lang === "typescript") {
    return `<!DOCTYPE html><html><head>${consoleBridge}</head><body
      style="background:#0a0a0f;color:#e0e0e0;font-family:'JetBrains Mono',monospace;padding:16px;margin:0;">
      <script type="module">
        ${content}
      </script>
    </body></html>`;
  }

  if (lang === "python") {
    const escaped = content.replace(/`/g, "\\`").replace(/\$/g, "\\$");
    return `<!DOCTYPE html><html><head>${consoleBridge}
    <style>
      body{background:#0a0a0f;color:#e0e0e0;font-family:'JetBrains Mono',monospace;padding:16px;margin:0;}
      #status{color:#a78bfa;margin-bottom:12px;font-size:12px;}
      #output{white-space:pre-wrap;font-size:12px;line-height:1.7;}
      .err{color:#f87171;}
    </style>
    </head><body>
      <div id="status">⏳ Loading Pyodide (Python runtime)…</div>
      <div id="output"></div>
      <script src="https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js"></script>
      <script>
        const statusEl = document.getElementById('status');
        const outputEl = document.getElementById('output');
        const append = (text, cls) => {
          const s = document.createElement('span');
          if(cls) s.className = cls;
          s.textContent = text + '\\n';
          outputEl.appendChild(s);
          window.parent.postMessage({ type: 'console', level: cls === 'err' ? 'error' : 'log', msg: text }, '*');
        };
        async function run() {
          try {
            const py = await loadPyodide();
            statusEl.textContent = '✅ Python ready';
            py.setStdout({ batched: (s) => append(s, '') });
            py.setStderr({ batched: (s) => append(s, 'err') });
            await py.runPythonAsync(\`${escaped}\`);
            statusEl.textContent = '✅ Done';
          } catch(e) {
            statusEl.textContent = '❌ Error';
            append(e.message, 'err');
          }
        }
        run();
      </script>
    </body></html>`;
  }

  if (lang === "json") {
    let parsed, display;
    try {
      parsed = JSON.parse(content);
      display = JSON.stringify(parsed, null, 2);
    } catch (e) {
      display = `JSON Parse Error: ${e.message}`;
    }
    const escaped = display.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<!DOCTYPE html><html><head>${consoleBridge}
    <style>
      body{background:#0a0a0f;color:#a5f3fc;font-family:'JetBrains Mono',monospace;padding:16px;margin:0;font-size:12px;line-height:1.7;}
      .key{color:#a78bfa;} .str{color:#4ade80;} .num{color:#fbbf24;} .bool{color:#f87171;}
    </style></head><body><pre>${escaped}</pre></body></html>`;
  }

  return null;
}

// ── Console log line component ────────────────────────────────────────────────
const LOG_COLORS = {
  log:   "#c0c0e0",
  info:  "#60a5fa",
  warn:  "#fbbf24",
  error: "#f87171",
  debug: "#a78bfa",
};

export default function RunPanel({ content, language, filePath, onClose }) {
  const [srcdoc,   setSrcdoc]   = useState(null);
  const [logs,     setLogs]     = useState([]);
  const [running,  setRunning]  = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [view,     setView]     = useState("output"); // "output" | "console"
  const iframeRef  = useRef(null);
  const logsEndRef = useRef(null);

  const runnable = canRun(language);
  const runner   = RUNNERS[language];

  // Listen for console messages from the iframe
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === "console") {
        setLogs(l => [...l, { level: e.data.level, msg: e.data.msg, ts: Date.now() }]);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const run = useCallback(() => {
    setLogs([]);
    setRunning(true);
    const doc = buildSrcdoc(content, language, null);
    if (doc) {
      setSrcdoc(doc);
      setView("output");
    } else {
      setLogs([{ level: "error", msg: `Cannot run ${language} files directly.`, ts: Date.now() }]);
      setView("console");
      setRunning(false);
    }
  }, [content, language]);

  // Auto-run when first opened
  useEffect(() => { if (runnable) run(); }, []); // eslint-disable-line

  const stop = () => {
    setSrcdoc(null);
    setRunning(false);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const fileName = filePath?.split("/").pop() || "file";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#070710", overflow: "hidden" }}>

      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
        background: "#060610", borderBottom: "1px solid #1a1a2e", flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          ▶ {fileName}
        </span>

        {/* View toggle */}
        <div style={{ display: "flex", background: "#111120", borderRadius: 6, padding: 2, border: "1px solid #1a1a2e" }}>
          {["output", "console"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "3px 9px", borderRadius: 4, border: "none",
              background: view === v ? "#1e1e3a" : "transparent",
              color: view === v ? "#a78bfa" : "#4a4a7a",
              cursor: "pointer", fontSize: 10, fontFamily: "inherit",
            }}>
              {v === "output" ? "Preview" : `Console${logs.length ? ` (${logs.length})` : ""}`}
            </button>
          ))}
        </div>

        {/* Copy button */}
        <button onClick={copyCode} title="Copy code" style={{
          background: copied ? "#0d2010" : "#111120",
          border: `1px solid ${copied ? "#22c55e" : "#2a2a3a"}`,
          borderRadius: 6, padding: "4px 9px", cursor: "pointer",
          color: copied ? "#22c55e" : "#6060a0", fontSize: 10, fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          {copied ? "✓ Copied" : "⎘ Copy"}
        </button>

        {/* Run / Stop */}
        {runnable ? (
          running && srcdoc ? (
            <button onClick={stop} style={{
              background: "#2a0d0d", border: "1px solid #5a1d1d",
              borderRadius: 6, padding: "4px 10px", cursor: "pointer",
              color: "#f87171", fontSize: 10, fontFamily: "inherit", fontWeight: 700,
            }}>■ Stop</button>
          ) : (
            <button onClick={run} style={{
              background: "linear-gradient(135deg,#7c3aed,#3b82f6)",
              border: "none", borderRadius: 6, padding: "4px 10px",
              cursor: "pointer", color: "#fff", fontSize: 10, fontFamily: "inherit", fontWeight: 700,
              boxShadow: "0 0 10px #7c3aed44",
            }}>▶ Run</button>
          )
        ) : (
          <span style={{ fontSize: 9, color: "#3a3a5c", padding: "4px 8px" }}>
            {language} — preview only
          </span>
        )}

        {/* Close */}
        <button onClick={onClose} style={{
          background: "transparent", border: "none", color: "#4a4a7a",
          cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px",
        }}>×</button>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* Output / Preview iframe */}
        {view === "output" && (
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            {srcdoc ? (
              <iframe
                ref={iframeRef}
                srcDoc={srcdoc}
                sandbox="allow-scripts allow-same-origin allow-modals"
                style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
                onLoad={() => setRunning(false)}
                title="code-output"
              />
            ) : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: 28, opacity: 0.2 }}>
                  {runnable ? "▶" : "👁"}
                </span>
                <span style={{ fontSize: 11, color: "#3a3a5c" }}>
                  {runnable ? "Tap Run to execute" : `${language} files can't be run in the browser`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Console log output */}
        {view === "console" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", background: "#050508" }}>
            {logs.length === 0 ? (
              <div style={{ color: "#2a2a4a", fontSize: 11, padding: "8px 0" }}>
                No console output yet. Run the file to see output here.
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  padding: "3px 0", borderBottom: "1px solid #0d0d14",
                }}>
                  <span style={{ fontSize: 9, color: "#3a3a5c", flexShrink: 0, marginTop: 2, minWidth: 30 }}>
                    {log.level.toUpperCase().slice(0, 3)}
                  </span>
                  <pre style={{
                    margin: 0, fontSize: 11, lineHeight: 1.6,
                    color: LOG_COLORS[log.level] || "#c0c0e0",
                    whiteSpace: "pre-wrap", wordBreak: "break-all", flex: 1,
                    fontFamily: "inherit",
                  }}>{log.msg}</pre>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}

// Export helper so App can check if a file is runnable
export { canRun };
