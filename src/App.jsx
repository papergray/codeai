import { useState, useCallback, useEffect, useRef } from "react";
import Editor from "./components/Editor.jsx";
import FileManager from "./components/FileManager.jsx";
import GitPanel from "./components/GitPanel.jsx";
import AIPanel from "./components/AIPanel.jsx";
import RunPanel, { canRun } from "./components/RunPanel.jsx";
import { github, detectLang, fileIcon } from "./github.js";

// ── Vertical resizable divider (for editor/run split) ─────────────────────────
function HDivider({ onDrag }) {
  const dragging = useRef(false);
  const start    = useRef(0);
  const onPointerDown = (e) => { e.preventDefault(); dragging.current = true; start.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); };
  const onPointerMove = (e) => { if (!dragging.current) return; const dy = e.clientY - start.current; start.current = e.clientY; onDrag(dy); };
  const onPointerUp   = () => { dragging.current = false; };
  return (
    <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      style={{ height: 4, flexShrink: 0, cursor: "row-resize", background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}
      onMouseEnter={e => e.currentTarget.style.background = "#7c3aed"}
      onMouseLeave={e => e.currentTarget.style.background = "#1a1a2e"}
    >
      <div style={{ width: 40, height: 2, borderRadius: 2, background: "inherit", opacity: 0.6 }} />
    </div>
  );
}

// ── Middle panel: editor + optional run panel below ───────────────────────────
function MiddlePanel({ openFiles, activeIdx, activeFile, activeLang, loading, setActiveIdx, closeTab, updateContent, setCursor, setLeftTab, currentRepo }) {
  const [showRun,  setShowRun]  = useState(false);
  const [runH,     setRunH]     = useState(280);
  const [copied,   setCopied]   = useState(false);

  const dragRunH = useCallback((dy) => setRunH(h => Math.max(80, Math.min(600, h - dy))), []);

  const copyFile = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

      {/* ── TOOLBAR: file tabs + copy + run ── */}
      <div style={{ background: "#060608", borderBottom: "1px solid #1a1a2e", flexShrink: 0 }}>

        {/* Top row: label + copy + run buttons */}
        <div style={{ display: "flex", alignItems: "center", height: 32, paddingLeft: 10, paddingRight: 8, borderBottom: "1px solid #0d0d18", gap: 6 }}>
          <span style={{ fontSize: 9, color: "#3a3a5c", letterSpacing: "0.1em", fontWeight: 700, flex: 1 }}>EDITOR</span>

          {loading.git && <span style={{ fontSize: 9, color: "#7c3aed" }}>⟳</span>}

          {/* Copy whole file */}
          {activeFile && (
            <button onClick={copyFile} title="Copy file contents" style={{
              background: copied ? "#0d2010" : "#111120",
              border: `1px solid ${copied ? "#22c55e" : "#2a2a3a"}`,
              borderRadius: 5, padding: "3px 9px", cursor: "pointer",
              color: copied ? "#22c55e" : "#6060a0",
              fontSize: 10, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4,
            }}>
              {copied ? "✓ Copied" : "⎘ Copy"}
            </button>
          )}

          {/* Run button */}
          {activeFile && (
            <button
              onClick={() => setShowRun(s => !s)}
              title={canRun(activeLang) ? "Run file" : "Preview file"}
              style={{
                background: showRun ? "linear-gradient(135deg,#7c3aed,#3b82f6)" : "#111120",
                border: `1px solid ${showRun ? "#7c3aed" : canRun(activeLang) ? "#2a4a2a" : "#2a2a3a"}`,
                borderRadius: 5, padding: "3px 10px", cursor: "pointer",
                color: showRun ? "#fff" : canRun(activeLang) ? "#4ade80" : "#6060a0",
                fontSize: 10, fontFamily: "inherit", fontWeight: 700,
                boxShadow: showRun ? "0 0 8px #7c3aed44" : "none",
              }}
            >
              {showRun ? "■ Close" : canRun(activeLang) ? "▶ Run" : "👁 Preview"}
            </button>
          )}
        </div>

        {/* File tabs row */}
        {openFiles.length > 0 && (
          <div style={{ display: "flex", overflowX: "auto", height: 32, scrollbarWidth: "none" }}>
            {openFiles.map((f, i) => {
              const name = f.path.split("/").pop();
              const isModified = f.content !== f.originalContent || f.isNew;
              return (
                <div key={f.path} onClick={() => setActiveIdx(i)} style={{
                  height: "100%", display: "flex", alignItems: "center", gap: 5,
                  padding: "0 10px", flexShrink: 0, cursor: "pointer",
                  background: i === activeIdx ? "#0d0d14" : "transparent",
                  borderBottom: i === activeIdx ? "2px solid #7c3aed" : "2px solid transparent",
                  borderRight: "1px solid #1a1a2e",
                  color: i === activeIdx ? "#e0e0ff" : "#4a4a7a",
                  fontSize: 11, userSelect: "none",
                }}>
                  <span style={{ fontSize: 12 }}>{fileIcon(f.path)}</span>
                  <span style={{ whiteSpace: "nowrap", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                  {isModified && <span style={{ color: "#f59e0b", fontSize: 12 }}>●</span>}
                  <span onClick={e => { e.stopPropagation(); closeTab(i); }} style={{ fontSize: 14, color: "#3a3a5c", lineHeight: 1 }}>×</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── EDITOR (fills remaining space above run panel) ── */}
      <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
        {openFiles.length === 0 ? (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }}>
            <div style={{ fontSize: 48, opacity: 0.08 }}>⟨/⟩</div>
            <div style={{ fontSize: 12, color: "#2a2a4a", textAlign: "center", lineHeight: 2 }}>
              {currentRepo ? "Open a file from Files panel" : "Connect GitHub to start"}
            </div>
            {!currentRepo && (
              <button onClick={() => setLeftTab("git")} style={{ background: "#111120", border: "1px solid #2a2a4a", borderRadius: 8, padding: "9px 16px", color: "#8080c0", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                🐙 Connect GitHub
              </button>
            )}
          </div>
        ) : (
          <Editor
            key={activeFile?.path}
            content={activeFile?.content || ""}
            language={activeLang}
            onChange={updateContent}
            onCursorChange={setCursor}
          />
        )}
      </div>

      {/* ── RUN PANEL (slides up from bottom) ── */}
      {showRun && activeFile && (
        <>
          <HDivider onDrag={dragRunH} />
          <div style={{ height: runH, flexShrink: 0, overflow: "hidden", borderTop: "1px solid #1a1a2e" }}>
            <RunPanel
              content={activeFile.content}
              language={activeLang}
              filePath={activeFile.path}
              onClose={() => setShowRun(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};
const decode = (b64) => {
  try { return decodeURIComponent(escape(atob(b64.replace(/\n/g, "")))); } catch { return atob(b64.replace(/\n/g, "")); }
};

// ── Resizable divider ─────────────────────────────────────────────────────────
function Divider({ onDrag }) {
  const dragging = useRef(false);
  const start    = useRef(0);

  const onPointerDown = (e) => {
    e.preventDefault();
    dragging.current = true;
    start.current    = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const dx = e.clientX - start.current;
    start.current = e.clientX;
    onDrag(dx);
  };
  const onPointerUp = () => { dragging.current = false; };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        width: 4, flexShrink: 0, cursor: "col-resize",
        background: "#1a1a2e", position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background .15s",
        zIndex: 5,
      }}
      onMouseEnter={e => e.currentTarget.style.background = "#7c3aed"}
      onMouseLeave={e => e.currentTarget.style.background = "#1a1a2e"}
    >
      <div style={{ width: 2, height: 40, borderRadius: 2, background: "inherit", opacity: 0.6 }} />
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────
function TabBtn({ label, active, badge, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "7px 4px", border: "none", cursor: "pointer",
      background: active ? "#0d0d18" : "transparent",
      borderBottom: active ? "2px solid #7c3aed" : "2px solid transparent",
      color: active ? "#c0c0ff" : "#4a4a7a",
      fontSize: 10, fontFamily: "inherit", fontWeight: active ? 700 : 400,
      position: "relative", transition: "all .15s",
    }}>
      {label}
      {badge > 0 && (
        <span style={{
          position: "absolute", top: 3, right: 6,
          width: 7, height: 7, borderRadius: "50%",
          background: "#f59e0b", border: "1px solid #0d0d18",
        }} />
      )}
    </button>
  );
}

export default function App() {
  // ── Settings ─────────────────────────────────────────────────────────────
  const [ghToken,  setGhToken]  = useState(() => LS.get("gh_token",  ""));
  const [apiKey,   setApiKey]   = useState(() => LS.get("claude_key", ""));

  // ── GitHub state ──────────────────────────────────────────────────────────
  const [ghUser,     setGhUser]    = useState(null);
  const [repos,      setRepos]     = useState([]);
  const [currentRepo,setCurrentRepo] = useState(null);
  const [branches,   setBranches]  = useState([]);
  const [fileList,   setFileList]  = useState([]);
  const [commits,    setCommits]   = useState([]);

  // ── Editor state ───────────────────────────────────────────────────────────
  const [openFiles,  setOpenFiles] = useState([]);
  const [activeIdx,  setActiveIdx] = useState(0);
  const [cursor,     setCursor]    = useState({ line: 1, col: 1 });

  // ── Panel sizes (px) — persisted ─────────────────────────────────────────
  const containerRef = useRef(null);
  const [leftW,  setLeftW]  = useState(() => LS.get("panel_left",  220));
  const [rightW, setRightW] = useState(() => LS.get("panel_right", 280));
  useEffect(() => { LS.set("panel_left",  leftW);  }, [leftW]);
  useEffect(() => { LS.set("panel_right", rightW); }, [rightW]);

  // ── Active tabs within each panel ─────────────────────────────────────────
  const [leftTab,  setLeftTab]  = useState("files"); // "files" | "git"
  const [showSettings, setShowSettings] = useState(false);

  // ── Loading flags ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState({ git: false, files: false, commits: false });
  const [toasts,  setToasts]  = useState([]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeFile    = openFiles[activeIdx] || null;
  const activeLang    = activeFile ? detectLang(activeFile.path) : "javascript";
  const modifiedFiles = openFiles.filter(f => f.content !== f.originalContent || f.isNew);
  const modifiedPaths = new Set(modifiedFiles.map(f => f.path));

  const api = () => github(ghToken);
  const setLoad = (k, v) => setLoading(l => ({ ...l, [k]: v }));

  const toast = useCallback((msg, type = "info") => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);

  // ── Connect GitHub ────────────────────────────────────────────────────────
  const connectGitHub = async (token) => {
    setLoad("git", true);
    try {
      const user = await github(token).getUser();
      setGhToken(token); LS.set("gh_token", token);
      setGhUser(user);
      const r = await github(token).listRepos();
      setRepos(r);
      toast(`Connected as @${user.login}`, "success");
    } catch (e) { toast(`GitHub: ${e.message}`, "error"); }
    setLoad("git", false);
  };

  useEffect(() => { if (ghToken) connectGitHub(ghToken); }, []); // eslint-disable-line

  // ── Select repo ───────────────────────────────────────────────────────────
  const selectRepo = async (repo) => {
    setLoad("git", true); setLoad("files", true);
    try {
      const owner = repo.owner?.login || repo.full_name.split("/")[0];
      const br = await api().getBranches(owner, repo.name);
      setBranches(br);
      const branch = repo.default_branch || br[0]?.name || "main";
      const repoObj = { owner, name: repo.name, branch };
      setCurrentRepo(repoObj);
      await loadTree(owner, repo.name, branch);
      setOpenFiles([]); setActiveIdx(0);
      toast(`Opened ${repo.name}`, "success");
    } catch (e) { toast(`Failed: ${e.message}`, "error"); }
    setLoad("git", false); setLoad("files", false);
  };

  const loadTree = async (owner, name, branch) => {
    setLoad("files", true);
    try {
      const tree = await api().getTree(owner, name, branch);
      setFileList(tree.tree || []);
    } catch (e) { toast(`Tree error: ${e.message}`, "error"); }
    setLoad("files", false);
  };

  const switchBranch = async (branch) => {
    if (!currentRepo) return;
    setCurrentRepo(r => ({ ...r, branch }));
    setOpenFiles([]); setActiveIdx(0);
    await loadTree(currentRepo.owner, currentRepo.name, branch);
    toast(`Branch: ${branch}`, "info");
  };

  const createBranch = async (name) => {
    if (!currentRepo) return;
    setLoad("git", true);
    try {
      await api().createBranch(currentRepo.owner, currentRepo.name, name, currentRepo.branch);
      const br = await api().getBranches(currentRepo.owner, currentRepo.name);
      setBranches(br);
      setCurrentRepo(r => ({ ...r, branch: name }));
      toast(`Created branch: ${name}`, "success");
    } catch (e) { toast(`Branch error: ${e.message}`, "error"); }
    setLoad("git", false);
  };

  // ── Open file ─────────────────────────────────────────────────────────────
  const openFile = async (fileMeta) => {
    const existing = openFiles.findIndex(f => f.path === fileMeta.path);
    if (existing !== -1) { setActiveIdx(existing); return; }
    const binaryExts = ["png","jpg","jpeg","gif","svg","ico","webp","mp4","mp3","pdf","zip","woff","ttf","eot","bin"];
    if (binaryExts.includes(fileMeta.path.split(".").pop()?.toLowerCase())) {
      toast("Binary files can't be edited", "info"); return;
    }
    setLoad("files", true);
    try {
      const data = await api().getFile(currentRepo.owner, currentRepo.name, fileMeta.path, currentRepo.branch);
      const content = decode(data.content);
      const f = { path: fileMeta.path, content, originalContent: content, sha: data.sha, isNew: false };
      setOpenFiles(prev => { const next = [...prev, f]; setActiveIdx(next.length - 1); return next; });
    } catch (e) { toast(`Can't open: ${e.message}`, "error"); }
    setLoad("files", false);
  };

  // ── Create file ───────────────────────────────────────────────────────────
  const createFile = (path) => {
    const existing = openFiles.findIndex(f => f.path === path);
    if (existing !== -1) { setActiveIdx(existing); return; }
    const f = { path, content: "", originalContent: "__NEW__", sha: null, isNew: true };
    setOpenFiles(prev => { const next = [...prev, f]; setActiveIdx(next.length - 1); return next; });
  };

  // ── Create folder (GitHub needs a placeholder file) ───────────────────────
  const createFolder = (folderPath) => {
    const placeholder = `${folderPath.replace(/\/$/, "")}/.gitkeep`;
    createFile(placeholder);
    toast(`Created folder: ${folderPath}`, "success");
  };

  // ── Upload file (from device → GitHub) ───────────────────────────────────
  const uploadFile = async (file, prefix = "", replaceItem = null) => {
    if (!currentRepo) { toast("Open a repo first", "error"); return; }
    const targetPath = replaceItem ? replaceItem.path : `${prefix}${file.name}`;
    const text = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = rej;
      // Try reading as text first; binary files will be base64 encoded below
      reader.readAsText(file);
    });
    setLoad("git", true);
    try {
      const sha = replaceItem?.sha || fileList.find(f => f.path === targetPath)?.sha || null;
      const msg = replaceItem ? `Replace ${targetPath}` : `Upload ${targetPath}`;
      await api().saveFile(currentRepo.owner, currentRepo.name, targetPath, text, sha, msg, currentRepo.branch);
      await loadTree(currentRepo.owner, currentRepo.name, currentRepo.branch);
      toast(`Uploaded ${file.name}`, "success");
    } catch (e) { toast(`Upload failed: ${e.message}`, "error"); }
    setLoad("git", false);
  };

  // ── Delete file ───────────────────────────────────────────────────────────
  const deleteFile = async (item, isDir) => {
    if (!currentRepo || !item) return;
    setLoad("git", true);
    try {
      if (!isDir) {
        await api().deleteFile(currentRepo.owner, currentRepo.name, item.path, item.sha, `Delete ${item.path}`, currentRepo.branch);
        // Close tab if open
        setOpenFiles(prev => prev.filter(f => f.path !== item.path));
        toast(`Deleted ${item.path}`, "success");
      } else {
        // Delete all files in this dir
        const dirFiles = fileList.filter(f => f.path.startsWith(item + "/") && f.type === "blob");
        for (const f of dirFiles) {
          await api().deleteFile(currentRepo.owner, currentRepo.name, f.path, f.sha, `Delete ${f.path}`, currentRepo.branch);
        }
        toast(`Deleted folder`, "success");
      }
      await loadTree(currentRepo.owner, currentRepo.name, currentRepo.branch);
    } catch (e) { toast(`Delete failed: ${e.message}`, "error"); }
    setLoad("git", false);
  };

  // ── Rename file ───────────────────────────────────────────────────────────
  const renameFile = async (item, newPath) => {
    if (!currentRepo) return;
    setLoad("git", true);
    try {
      // Read old content
      const data = await api().getFile(currentRepo.owner, currentRepo.name, item.path, currentRepo.branch);
      const content = decode(data.content);
      // Create at new path
      await api().saveFile(currentRepo.owner, currentRepo.name, newPath, content, null, `Rename ${item.path} to ${newPath}`, currentRepo.branch);
      // Delete old path
      await api().deleteFile(currentRepo.owner, currentRepo.name, item.path, item.sha, `Rename (delete old)`, currentRepo.branch);
      await loadTree(currentRepo.owner, currentRepo.name, currentRepo.branch);
      // Update any open tab
      setOpenFiles(prev => prev.map(f => f.path === item.path ? { ...f, path: newPath } : f));
      toast(`Renamed to ${newPath}`, "success");
    } catch (e) { toast(`Rename failed: ${e.message}`, "error"); }
    setLoad("git", false);
  };

  // ── Update editor content ─────────────────────────────────────────────────
  const updateContent = useCallback((content) => {
    setOpenFiles(prev => prev.map((f, i) => i === activeIdx ? { ...f, content } : f));
  }, [activeIdx]);

  const closeTab = (idx) => {
    const f = openFiles[idx];
    if ((f.content !== f.originalContent || f.isNew) && !confirm(`Discard changes to ${f.path.split("/").pop()}?`)) return;
    setOpenFiles(prev => {
      const next = prev.filter((_, i) => i !== idx);
      setActiveIdx(i => Math.max(0, Math.min(i, next.length - 1)));
      return next;
    });
  };

  const insertCode = useCallback((code) => {
    setOpenFiles(prev => prev.map((f, i) => i === activeIdx ? { ...f, content: f.content + "\n" + code } : f));
    toast("Code inserted", "success");
  }, [activeIdx]);

  // ── Commit & Push ─────────────────────────────────────────────────────────
  const commitAndPush = async (message) => {
    if (!currentRepo || modifiedFiles.length === 0) return;
    setLoad("git", true);
    let ok = 0;
    for (const file of modifiedFiles) {
      try {
        const result = await api().saveFile(currentRepo.owner, currentRepo.name, file.path, file.content, file.sha || null, message, currentRepo.branch);
        const newSha = result.content?.sha;
        setOpenFiles(prev => prev.map(f => f.path === file.path ? { ...f, originalContent: f.content, sha: newSha || f.sha, isNew: false } : f));
        setFileList(prev => prev.map(fl => fl.path === file.path ? { ...fl, sha: newSha || fl.sha } : fl));
        ok++;
      } catch (e) { toast(`Failed ${file.path}: ${e.message}`, "error"); }
    }
    if (ok > 0) { toast(`Pushed ${ok} file${ok > 1 ? "s" : ""}`, "success"); loadCommits(); }
    setLoad("git", false);
  };

  const pull = async () => {
    if (!currentRepo) return;
    setLoad("files", true);
    try {
      await loadTree(currentRepo.owner, currentRepo.name, currentRepo.branch);
      for (const file of openFiles) {
        try {
          const data = await api().getFile(currentRepo.owner, currentRepo.name, file.path, currentRepo.branch);
          const content = decode(data.content);
          setOpenFiles(prev => prev.map(f => f.path === file.path ? { ...f, content, originalContent: content, sha: data.sha } : f));
        } catch {}
      }
      toast("Pulled latest", "success");
    } catch (e) { toast(`Pull error: ${e.message}`, "error"); }
    setLoad("files", false);
  };

  const loadCommits = async () => {
    if (!currentRepo) return;
    setLoad("commits", true);
    try { const c = await api().getCommits(currentRepo.owner, currentRepo.name, currentRepo.branch); setCommits(c); } catch {}
    setLoad("commits", false);
  };

  useEffect(() => { if (currentRepo) loadCommits(); }, [currentRepo?.branch]); // eslint-disable-line

  // ── Divider drag handlers ─────────────────────────────────────────────────
  const dragLeft = useCallback((dx) => {
    setLeftW(w => Math.max(140, Math.min(400, w + dx)));
  }, []);
  const dragRight = useCallback((dx) => {
    setRightW(w => Math.max(180, Math.min(420, w - dx)));
  }, []);

  // ── Ctrl+S shortcut ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (modifiedFiles.length > 0) {
          const msg = prompt("Commit message:", `Update ${activeFile?.path?.split("/").pop() || "files"}`);
          if (msg) commitAndPush(msg);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modifiedFiles, activeFile]); // eslint-disable-line

  return (
    <div style={{
      height: "100vh", width: "100vw", display: "flex", flexDirection: "column",
      background: "#0a0a0f", color: "#e0e0e0",
      fontFamily: "'JetBrains Mono','Fira Code',monospace", overflow: "hidden",
    }}>

      {/* ── TOP BAR ── */}
      <div style={{
        height: 42, background: "#060608", borderBottom: "1px solid #1a1a2e",
        display: "flex", alignItems: "center", flexShrink: 0, zIndex: 20, position: "relative",
      }}>
        <div style={{ width: 36, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid #1a1a2e", flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>⟨/⟩</span>
        </div>

        {/* Repo info */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", overflow: "hidden", minWidth: 0 }}>
          {currentRepo ? (
            <>
              <span style={{ fontSize: 10, color: "#c0c0e0", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentRepo.owner}/{currentRepo.name}</span>
              <span style={{ color: "#22c55e", fontSize: 10, whiteSpace: "nowrap", flexShrink: 0 }}>🌿 {currentRepo.branch}</span>
              {modifiedFiles.length > 0 && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8, background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44", flexShrink: 0 }}>●{modifiedFiles.length}</span>}
            </>
          ) : (
            <span style={{ fontSize: 10, color: "#2a2a4a" }}>No repo open — connect GitHub →</span>
          )}
        </div>

        {/* Commit button */}
        {modifiedFiles.length > 0 && (
          <button onClick={() => { const m = prompt("Commit:", `Update files`); if (m) commitAndPush(m); }} style={{
            height: "100%", padding: "0 12px", background: "#0d2010", border: "none",
            borderLeft: "1px solid #1a3a1a", color: "#22c55e", cursor: "pointer",
            fontSize: 11, fontFamily: "inherit", fontWeight: 700, flexShrink: 0,
          }}>⬆ Push</button>
        )}

        {/* Settings */}
        <button onClick={() => setShowSettings(s => !s)} style={{
          height: "100%", width: 40, background: showSettings ? "#1a1a2e" : "transparent",
          border: "none", borderLeft: "1px solid #1a1a2e", color: "#6060a0",
          cursor: "pointer", fontSize: 15, flexShrink: 0,
        }}>⚙</button>

        {/* Settings dropdown */}
        {showSettings && (
          <div style={{
            position: "absolute", top: 42, right: 0, left: 36, zIndex: 200,
            background: "#0e0e1a", borderBottom: "1px solid #2a2a4a",
            borderLeft: "1px solid #2a2a4a", padding: 14, boxShadow: "0 8px 32px #000d",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 9, color: "#7c3aed", letterSpacing: "0.12em", fontWeight: 700 }}>SETTINGS</span>
              <button onClick={() => setShowSettings(false)} style={{ background: "transparent", border: "none", color: "#4a4a7a", cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>Claude API Key (for online AI)</div>
            <input type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); LS.set("claude_key", e.target.value); }} placeholder="sk-ant-api03-…"
              style={{ width: "100%", background: "#111120", border: "1px solid #2a2a3a", borderRadius: 6, padding: "8px 10px", color: "#c0c0ff", fontSize: 11, fontFamily: "inherit", outline: "none", marginBottom: 8 }} />
            {ghToken && (
              <button onClick={() => {
                setGhToken(""); LS.set("gh_token", ""); setGhUser(null); setRepos([]); setCurrentRepo(null); setFileList([]); setOpenFiles([]);
                setShowSettings(false); toast("Disconnected from GitHub", "info");
              }} style={{ width: "100%", background: "#2a0d0d", border: "1px solid #5a1d1d", borderRadius: 6, padding: "8px", color: "#f87171", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                Disconnect GitHub (@{ghUser?.login})
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── THREE PANEL LAYOUT ── */}
      <div ref={containerRef} style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── LEFT PANEL: Files + Git tabs ── */}
        <div style={{ width: leftW, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid #1a1a2e" }}>
          {/* Tab bar */}
          <div style={{ display: "flex", background: "#060608", borderBottom: "1px solid #1a1a2e", flexShrink: 0 }}>
            <TabBtn label="🗂 Files" active={leftTab === "files"} onClick={() => setLeftTab("files")} />
            <TabBtn label="🐙 Git"   active={leftTab === "git"}   onClick={() => setLeftTab("git")}   badge={modifiedFiles.length} />
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            {leftTab === "files" ? (
              <FileManager
                repoFiles={fileList}
                localPaths={openFiles.map(f => f.path)}
                openFilesMap={new Map(openFiles.map(f => [f.path, f]))}
                activePath={activeFile?.path}
                onOpen={openFile}
                onUploadFile={uploadFile}
                onCreateFile={createFile}
                onCreateFolder={createFolder}
                onDeleteFile={deleteFile}
                onRenameFile={renameFile}
                onRefreshRepo={() => currentRepo && loadTree(currentRepo.owner, currentRepo.name, currentRepo.branch)}
                loading={loading.files}
              />
            ) : (
              <GitPanel
                token={ghToken} user={ghUser} repos={repos}
                currentRepo={currentRepo} branches={branches}
                modifiedFiles={modifiedFiles}
                onConnect={connectGitHub} onSelectRepo={selectRepo}
                onSelectBranch={switchBranch} onCommitPush={commitAndPush}
                onCreateBranch={createBranch} onPull={pull}
                commits={commits} loading={loading}
              />
            )}
          </div>
        </div>

        {/* ── LEFT DIVIDER ── */}
        <Divider onDrag={dragLeft} />

        {/* ── MIDDLE PANEL: Code Editor + Run ── */}
        <MiddlePanel
          openFiles={openFiles}
          activeIdx={activeIdx}
          activeFile={activeFile}
          activeLang={activeLang}
          loading={loading}
          setActiveIdx={setActiveIdx}
          closeTab={closeTab}
          updateContent={updateContent}
          setCursor={setCursor}
          setLeftTab={setLeftTab}
          currentRepo={currentRepo}
        />

        {/* ── RIGHT DIVIDER ── */}
        <Divider onDrag={dragRight} />

        {/* ── RIGHT PANEL: AI Assistant ── */}
        <div style={{ width: rightW, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Tab label */}
          <div style={{ background: "#060608", borderBottom: "1px solid #1a1a2e", height: 32, display: "flex", alignItems: "center", paddingLeft: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 9, color: "#7c3aed", letterSpacing: "0.1em", fontWeight: 700 }}>🤖 AI ASSISTANT</span>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <AIPanel
              apiKey={apiKey}
              currentLang={activeLang}
              onInsertCode={openFiles.length > 0 ? insertCode : null}
            />
          </div>
        </div>
      </div>

      {/* ── STATUS BAR ── */}
      <div style={{
        height: 22, background: "#040406", borderTop: "1px solid #1a1a2e",
        display: "flex", alignItems: "center", gap: 10, padding: "0 10px",
        flexShrink: 0, fontSize: 10, color: "#4a4a7a", overflow: "hidden",
      }}>
        {activeFile ? (
          <>
            <span style={{ color: "#7c3aed" }}>{activeLang}</span>
            <span>Ln {cursor.line}:{cursor.col}</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeFile.path}</span>
          </>
        ) : <span style={{ flex: 1 }}>CodeAI IDE</span>}
        {currentRepo && <span style={{ color: "#22c55e", whiteSpace: "nowrap", flexShrink: 0 }}>🌿 {currentRepo.branch}</span>}
      </div>

      {/* ── TOASTS ── */}
      <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", zIndex: 300, display: "flex", flexDirection: "column", gap: 5, alignItems: "center", pointerEvents: "none" }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.type === "error" ? "#2a0d0d" : t.type === "success" ? "#0d2010" : "#111120",
            border: `1px solid ${t.type === "error" ? "#5a1d1d" : t.type === "success" ? "#1d5a2d" : "#2a2a4a"}`,
            color: t.type === "error" ? "#f87171" : t.type === "success" ? "#86efac" : "#c0c0e0",
            borderRadius: 8, padding: "8px 16px", fontSize: 11, whiteSpace: "nowrap",
            boxShadow: "0 4px 16px #0009", animation: "fadeUp .25s ease",
          }}>{t.msg}</div>
        ))}
      </div>

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 2px; }
        input::placeholder, textarea::placeholder { color: #333355; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
