import { useState, useCallback, useEffect } from "react";
import Editor from "./components/Editor.jsx";
import FileTree from "./components/FileTree.jsx";
import GitPanel from "./components/GitPanel.jsx";
import AIPanel from "./components/AIPanel.jsx";
import { github, detectLang, fileIcon } from "./github.js";

// ── Helpers ──────────────────────────────────────────────────────────────────
const LS = {
  get: (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};
const decode = (b64) => {
  try { return decodeURIComponent(escape(atob(b64.replace(/\n/g, "")))); } catch { return atob(b64.replace(/\n/g, "")); }
};

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // Persisted settings
  const [ghToken,  setGhToken]  = useState(() => LS.get("gh_token", ""));
  const [apiKey,   setApiKey]   = useState(() => LS.get("claude_key", ""));

  // GitHub data
  const [ghUser,   setGhUser]   = useState(null);
  const [repos,    setRepos]    = useState([]);
  const [currentRepo, setCurrentRepo] = useState(null); // {owner,name,branch}
  const [branches, setBranches] = useState([]);
  const [fileList, setFileList] = useState([]); // [{path,type,sha}]
  const [commits,  setCommits]  = useState([]);

  // Editor state
  const [openFiles, setOpenFiles] = useState([]); // [{path,content,originalContent,sha,isNew}]
  const [activeIdx, setActiveIdx] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  // UI
  const [sidebarTab, setSidebarTab] = useState("git"); // "files" | "git" | "ai" | null
  const [showSettings, setShowSettings] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState({ git: false, files: false, commits: false });

  // Derived
  const activeFile = openFiles[activeIdx] || null;
  const activeLang = activeFile ? detectLang(activeFile.path) : "javascript";
  const modifiedFiles = openFiles.filter(f => f.content !== f.originalContent || f.isNew);
  const modifiedPaths = new Set(modifiedFiles.map(f => f.path));

  const api = () => github(ghToken);

  // ── Toast helper ─────────────────────────────────────────────────────────
  const toast = useCallback((msg, type = "info") => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  const setLoad = (key, val) => setLoading(l => ({ ...l, [key]: val }));

  // ── Connect GitHub ────────────────────────────────────────────────────────
  const connectGitHub = async (token) => {
    setLoad("git", true);
    try {
      const user = await github(token).getUser();
      if (user.login) {
        setGhToken(token);
        LS.set("gh_token", token);
        setGhUser(user);
        const r = await github(token).listRepos();
        setRepos(r);
        toast(`Connected as @${user.login}`, "success");
      } else throw new Error("Invalid token");
    } catch (e) {
      toast(`GitHub: ${e.message}`, "error");
    }
    setLoad("git", false);
  };

  // Auto-load user on startup if token exists
  useEffect(() => {
    if (ghToken) connectGitHub(ghToken);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Select repo ───────────────────────────────────────────────────────────
  const selectRepo = async (repo) => {
    setLoad("git", true);
    setLoad("files", true);
    try {
      const br = await api().getBranches(repo.owner?.login || repo.full_name.split("/")[0], repo.name);
      setBranches(br);
      const defaultBranch = repo.default_branch || br[0]?.name || "main";
      const owner = repo.owner?.login || repo.full_name.split("/")[0];
      const repoObj = { owner, name: repo.name, branch: defaultBranch };
      setCurrentRepo(repoObj);
      await loadFileTree(owner, repo.name, defaultBranch);
      setOpenFiles([]);
      setActiveIdx(0);
      toast(`Opened ${repo.name}`, "success");
    } catch (e) {
      toast(`Failed to open repo: ${e.message}`, "error");
    }
    setLoad("git", false);
    setLoad("files", false);
  };

  const loadFileTree = async (owner, name, branch) => {
    setLoad("files", true);
    try {
      const tree = await api().getTree(owner, name, branch);
      setFileList(tree.tree || []);
    } catch (e) {
      toast(`File tree error: ${e.message}`, "error");
    }
    setLoad("files", false);
  };

  // ── Switch branch ─────────────────────────────────────────────────────────
  const switchBranch = async (branchName) => {
    if (!currentRepo) return;
    setCurrentRepo(r => ({ ...r, branch: branchName }));
    setOpenFiles([]);
    setActiveIdx(0);
    await loadFileTree(currentRepo.owner, currentRepo.name, branchName);
    toast(`Switched to ${branchName}`, "info");
  };

  // ── Create branch ─────────────────────────────────────────────────────────
  const createBranch = async (branchName) => {
    if (!currentRepo) return;
    setLoad("git", true);
    try {
      await api().createBranch(currentRepo.owner, currentRepo.name, branchName, currentRepo.branch);
      const br = await api().getBranches(currentRepo.owner, currentRepo.name);
      setBranches(br);
      setCurrentRepo(r => ({ ...r, branch: branchName }));
      toast(`Created and switched to branch: ${branchName}`, "success");
    } catch (e) {
      toast(`Branch error: ${e.message}`, "error");
    }
    setLoad("git", false);
  };

  // ── Open file ─────────────────────────────────────────────────────────────
  const openFile = async (fileMeta) => {
    // Already open?
    const existing = openFiles.findIndex(f => f.path === fileMeta.path);
    if (existing !== -1) { setActiveIdx(existing); return; }

    // Only open text files
    const lang = detectLang(fileMeta.path);
    const imageExts = ["png","jpg","jpeg","gif","svg","ico","webp","mp4","mp3","pdf","zip","woff","ttf"];
    if (imageExts.includes(fileMeta.path.split(".").pop()?.toLowerCase())) {
      toast("Binary files can't be edited", "info");
      return;
    }

    setLoad("files", true);
    try {
      const data = await api().getFile(currentRepo.owner, currentRepo.name, fileMeta.path, currentRepo.branch);
      const content = decode(data.content);
      const newFile = { path: fileMeta.path, content, originalContent: content, sha: data.sha, isNew: false };
      setOpenFiles(prev => {
        const next = [...prev, newFile];
        setActiveIdx(next.length - 1);
        return next;
      });
    } catch (e) {
      toast(`Can't open file: ${e.message}`, "error");
    }
    setLoad("files", false);
  };

  // ── New file ──────────────────────────────────────────────────────────────
  const newFile = () => {
    const name = prompt("New file name (e.g. src/utils.js):");
    if (!name?.trim()) return;
    const f = { path: name.trim(), content: "", originalContent: "__NEW__", sha: null, isNew: true };
    setOpenFiles(prev => {
      const next = [...prev, f];
      setActiveIdx(next.length - 1);
      return next;
    });
  };

  // ── Update open file content ──────────────────────────────────────────────
  const updateContent = useCallback((content) => {
    setOpenFiles(prev => prev.map((f, i) => i === activeIdx ? { ...f, content } : f));
  }, [activeIdx]);

  // ── Close tab ─────────────────────────────────────────────────────────────
  const closeTab = (idx) => {
    const file = openFiles[idx];
    if (file.content !== file.originalContent) {
      if (!confirm(`Discard changes to ${file.path}?`)) return;
    }
    setOpenFiles(prev => {
      const next = prev.filter((_, i) => i !== idx);
      setActiveIdx(i => Math.min(i, Math.max(0, next.length - 1)));
      return next;
    });
  };

  // ── Insert code from AI ───────────────────────────────────────────────────
  const insertCode = useCallback((code) => {
    setOpenFiles(prev => prev.map((f, i) => i === activeIdx
      ? { ...f, content: f.content + "\n" + code }
      : f
    ));
    toast("Code inserted at end of file", "success");
  }, [activeIdx]);

  // ── Commit & Push ─────────────────────────────────────────────────────────
  const commitAndPush = async (message) => {
    if (!currentRepo || modifiedFiles.length === 0) return;
    setLoad("git", true);
    let pushed = 0, failed = 0;
    for (const file of modifiedFiles) {
      try {
        const result = await api().saveFile(
          currentRepo.owner, currentRepo.name,
          file.path, file.content,
          file.sha || null,
          message,
          currentRepo.branch,
        );
        const newSha = result.content?.sha;
        setOpenFiles(prev => prev.map(f =>
          f.path === file.path
            ? { ...f, originalContent: f.content, sha: newSha || f.sha, isNew: false }
            : f
        ));
        // Update sha in fileList too
        setFileList(prev => prev.map(fl =>
          fl.path === file.path ? { ...fl, sha: newSha || fl.sha } : fl
        ));
        pushed++;
      } catch (e) {
        failed++;
        toast(`Failed to push ${file.path}: ${e.message}`, "error");
      }
    }
    if (pushed > 0) toast(`✓ Committed & pushed ${pushed} file${pushed > 1 ? "s" : ""}`, "success");
    if (failed === 0) {
      // Refresh commits
      loadCommits();
    }
    setLoad("git", false);
  };

  // ── Pull ──────────────────────────────────────────────────────────────────
  const pull = async () => {
    if (!currentRepo) return;
    toast("Pulling from remote…", "info");
    setLoad("files", true);
    try {
      await loadFileTree(currentRepo.owner, currentRepo.name, currentRepo.branch);
      // Reload open files
      for (const file of openFiles) {
        try {
          const data = await api().getFile(currentRepo.owner, currentRepo.name, file.path, currentRepo.branch);
          const content = decode(data.content);
          setOpenFiles(prev => prev.map(f =>
            f.path === file.path
              ? { ...f, content, originalContent: content, sha: data.sha }
              : f
          ));
        } catch {}
      }
      toast("Pulled latest changes", "success");
    } catch (e) {
      toast(`Pull error: ${e.message}`, "error");
    }
    setLoad("files", false);
  };

  // ── Load commits ──────────────────────────────────────────────────────────
  const loadCommits = async () => {
    if (!currentRepo) return;
    setLoad("commits", true);
    try {
      const c = await api().getCommits(currentRepo.owner, currentRepo.name, currentRepo.branch);
      setCommits(c);
    } catch {}
    setLoad("commits", false);
  };

  useEffect(() => { if (currentRepo) loadCommits(); }, [currentRepo?.branch]); // eslint-disable-line

  // ── Save (Ctrl+S) ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (modifiedFiles.length > 0) {
          const msg = prompt("Commit message:", `Update ${activeFile?.path || "files"}`);
          if (msg) commitAndPush(msg);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modifiedFiles, activeFile]); // eslint-disable-line

  // ── All panels are OVERLAYS on mobile ────────────────────────────────────
  const panelOpen = !!sidebarTab; // any panel (files, git, ai) is open

  const closePanel = () => setSidebarTab(null);

  // Panel widths: sidebar=75vw capped 280px, AI=85vw capped 340px
  const SIDEBAR_W = "min(280px, 78vw)";
  const AI_W      = "min(340px, 88vw)";

  return (
    <div style={{
      height: "100vh", width: "100vw", display: "flex", flexDirection: "column",
      background: "#0a0a0f", color: "#e0e0e0",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      overflow: "hidden",
    }}>

      {/* ── TOP BAR ── */}
      <div style={{
        height: 44, background: "#060608", borderBottom: "1px solid #1a1a2e",
        display: "flex", alignItems: "center", flexShrink: 0, zIndex: 10,
        position: "relative",
      }}>
        {/* Logo */}
        <div style={{
          width: 44, height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          borderRight: "1px solid #1a1a2e", flexShrink: 0,
        }}>
          <span style={{ fontSize: 18 }}>⟨/⟩</span>
        </div>

        {/* Repo + branch info */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", overflow: "hidden", minWidth: 0 }}>
          {currentRepo ? (
            <>
              <span style={{ fontSize: 10, color: "#c0c0e0", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {currentRepo.name}
              </span>
              <span style={{ color: "#22c55e", fontSize: 10, display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", flexShrink: 0 }}>
                🌿 {currentRepo.branch}
              </span>
              {modifiedFiles.length > 0 && (
                <span style={{
                  fontSize: 9, padding: "1px 5px", borderRadius: 8, flexShrink: 0,
                  background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44",
                }}>
                  {modifiedFiles.length}●
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: 10, color: "#3a3a5c" }}>No repo open</span>
          )}
        </div>

        {/* Settings button */}
        <button onClick={() => setShowSettings(s => !s)} style={{
          height: "100%", width: 44, background: showSettings ? "#1a1a2e" : "transparent",
          border: "none", borderLeft: "1px solid #1a1a2e", color: "#6060a0",
          cursor: "pointer", fontSize: 16, flexShrink: 0,
        }}>⚙</button>

        {/* ── SETTINGS DROPDOWN — full width, never overflows ── */}
        {showSettings && (
          <div style={{
            position: "absolute", top: 44, left: 44, right: 0, zIndex: 200,
            background: "#0e0e1a", borderBottom: "1px solid #2a2a4a",
            borderLeft: "1px solid #2a2a4a",
            padding: 14, boxShadow: "0 8px 32px #000c",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 9, color: "#7c3aed", letterSpacing: "0.1em", fontWeight: 700 }}>SETTINGS</span>
              <button onClick={() => setShowSettings(false)} style={{
                background: "transparent", border: "none", color: "#4a4a7a", cursor: "pointer", fontSize: 16,
              }}>×</button>
            </div>

            <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>Claude API Key</div>
            <input
              type="password"
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); LS.set("claude_key", e.target.value); }}
              placeholder="sk-ant-api03-..."
              style={{
                width: "100%", background: "#111120", border: "1px solid #2a2a3a",
                borderRadius: 6, padding: "9px 10px", color: "#c0c0ff",
                fontSize: 12, fontFamily: "inherit", outline: "none", marginBottom: 10,
              }}
            />
            <div style={{ fontSize: 9, color: "#3a3a5c", marginBottom: 10 }}>
              Get key at console.anthropic.com · Stored locally on device only
            </div>
            {ghToken && (
              <button onClick={() => {
                setGhToken(""); LS.set("gh_token", "");
                setGhUser(null); setRepos([]); setCurrentRepo(null);
                setFileList([]); setOpenFiles([]);
                setShowSettings(false);
                toast("Disconnected from GitHub", "info");
              }} style={{
                width: "100%", background: "#2a0d0d", border: "1px solid #5a1d1d",
                borderRadius: 6, padding: "9px", color: "#f87171",
                cursor: "pointer", fontSize: 11, fontFamily: "inherit",
              }}>Disconnect GitHub (@{ghUser?.login})</button>
            )}
          </div>
        )}
      </div>

      {/* ── MAIN LAYOUT ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {/* ── ACTIVITY BAR ── */}
        <div style={{
          width: 44, background: "#060608", borderRight: "1px solid #1a1a2e",
          display: "flex", flexDirection: "column", alignItems: "center",
          paddingTop: 6, gap: 4, flexShrink: 0, zIndex: 20,
        }}>
          {[
            { id: "files", icon: "🗂", title: "Explorer" },
            { id: "git",   icon: "🐙", title: "Git" },
            { id: "ai",    icon: "🤖", title: "AI" },
          ].map(b => (
            <button key={b.id} title={b.title}
              onClick={() => { setSidebarTab(s => s === b.id ? null : b.id); setShowSettings(false); }}
              style={{
                width: 36, height: 40, borderRadius: 8, border: "none",
                background: sidebarTab === b.id ? "#1a1a2e" : "transparent",
                borderLeft: sidebarTab === b.id ? "2px solid #7c3aed" : "2px solid transparent",
                cursor: "pointer", fontSize: 18,
                display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative",
              }}>
              {b.icon}
              {b.id === "git" && modifiedFiles.length > 0 && (
                <span style={{
                  position: "absolute", top: 4, right: 4, width: 7, height: 7,
                  background: "#f59e0b", borderRadius: "50%", border: "1px solid #060608",
                }} />
              )}
            </button>
          ))}

          <div style={{ flex: 1 }} />

          {/* Quick commit button */}
          {modifiedFiles.length > 0 && (
            <button title="Commit & Push" onClick={() => {
              const msg = prompt(`Commit message:`, `Update ${activeFile?.path?.split("/").pop() || "files"}`);
              if (msg) commitAndPush(msg);
            }} style={{
              width: 36, height: 36, borderRadius: 8, border: "none",
              background: "#0d2010", cursor: "pointer", fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 6,
            }}>⬆</button>
          )}
        </div>

        {/* ── EDITOR (always full area behind overlay) ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* File tabs */}
          {openFiles.length > 0 && (
            <div style={{
              height: 38, background: "#060610", borderBottom: "1px solid #1a1a2e",
              display: "flex", alignItems: "center", overflowX: "auto", flexShrink: 0,
              scrollbarWidth: "none",
            }}>
              {openFiles.map((f, i) => {
                const name = f.path.split("/").pop();
                const isModified = f.content !== f.originalContent || f.isNew;
                return (
                  <div key={f.path} onClick={() => { setActiveIdx(i); closePanel(); }} style={{
                    height: "100%", display: "flex", alignItems: "center", gap: 5,
                    padding: "0 12px", flexShrink: 0, cursor: "pointer",
                    background: i === activeIdx ? "#0d0d14" : "transparent",
                    borderBottom: i === activeIdx ? "2px solid #7c3aed" : "2px solid transparent",
                    borderRight: "1px solid #1a1a2e",
                    color: i === activeIdx ? "#e0e0ff" : "#6060a0",
                    fontSize: 12, userSelect: "none",
                  }}>
                    <span style={{ fontSize: 13 }}>{fileIcon(f.path)}</span>
                    <span style={{ whiteSpace: "nowrap" }}>{name}</span>
                    {isModified && <span style={{ color: "#f59e0b", fontSize: 14, lineHeight: 1 }}>●</span>}
                    <span onClick={(e) => { e.stopPropagation(); closeTab(i); }} style={{
                      fontSize: 16, color: "#4a4a6a", padding: "0 2px", lineHeight: 1,
                    }}>×</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Editor / empty state */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            {openFiles.length === 0 ? (
              <div style={{
                height: "100%", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 14, padding: 24,
              }}>
                <div style={{ fontSize: 52, opacity: 0.1 }}>⟨/⟩</div>
                <div style={{ fontSize: 12, color: "#3a3a5c", textAlign: "center", lineHeight: 2 }}>
                  {currentRepo
                    ? "Tap 🗂 to browse files"
                    : "Tap 🐙 to connect GitHub\nor 🤖 for AI coding help"}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  <button onClick={() => setSidebarTab("git")} style={{
                    background: "#111120", border: "1px solid #2a2a4a",
                    borderRadius: 10, padding: "10px 16px", color: "#8080c0",
                    cursor: "pointer", fontSize: 13, fontFamily: "inherit",
                  }}>🐙 GitHub</button>
                  <button onClick={() => setSidebarTab("ai")} style={{
                    background: "#111120", border: "1px solid #2a2a4a",
                    borderRadius: 10, padding: "10px 16px", color: "#8080c0",
                    cursor: "pointer", fontSize: 13, fontFamily: "inherit",
                  }}>🤖 AI Help</button>
                  {currentRepo && (
                    <button onClick={() => setSidebarTab("files")} style={{
                      background: "#111120", border: "1px solid #2a2a4a",
                      borderRadius: 10, padding: "10px 16px", color: "#8080c0",
                      cursor: "pointer", fontSize: 13, fontFamily: "inherit",
                    }}>🗂 Browse Files</button>
                  )}
                </div>
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
        </div>

        {/* ── OVERLAY BACKDROP (tap to close any panel) ── */}
        {panelOpen && (
          <div
            onClick={closePanel}
            style={{
              position: "absolute", inset: 0, zIndex: 29,
              background: "rgba(0,0,0,0.5)",
            }}
          />
        )}

        {/* ── SIDEBAR PANEL OVERLAY (Files / Git) — slides from left ── */}
        {(sidebarTab === "files" || sidebarTab === "git") && (
          <div style={{
            position: "absolute", top: 0, left: 0, bottom: 0,
            width: SIDEBAR_W, zIndex: 30, overflow: "hidden",
            boxShadow: "4px 0 24px #000c",
            animation: "slideInLeft 0.2s ease",
          }}>
            {sidebarTab === "files" && (
              <FileTree
                files={fileList}
                activePath={activeFile?.path}
                onOpen={(f) => { openFile(f); closePanel(); }}
                modifiedPaths={modifiedPaths}
                onNewFile={currentRepo ? newFile : null}
                onRefresh={currentRepo ? () => loadFileTree(currentRepo.owner, currentRepo.name, currentRepo.branch) : null}
                loading={loading.files}
              />
            )}
            {sidebarTab === "git" && (
              <GitPanel
                token={ghToken}
                user={ghUser}
                repos={repos}
                currentRepo={currentRepo}
                branches={branches}
                modifiedFiles={modifiedFiles}
                onConnect={connectGitHub}
                onSelectRepo={(r) => { selectRepo(r); }}
                onSelectBranch={switchBranch}
                onCommitPush={commitAndPush}
                onCreateBranch={createBranch}
                onPull={pull}
                commits={commits}
                loading={loading}
              />
            )}
          </div>
        )}

        {/* ── AI PANEL OVERLAY — slides from right ── */}
        {sidebarTab === "ai" && (
          <div style={{
            position: "absolute", top: 0, right: 0, bottom: 0,
            width: AI_W, zIndex: 30, overflow: "hidden",
            boxShadow: "-4px 0 24px #000c",
            animation: "slideInRight 0.2s ease",
          }}>
            <AIPanel
              apiKey={apiKey}
              currentLang={activeLang}
              onInsertCode={openFiles.length > 0 ? (code) => { insertCode(code); closePanel(); } : null}
            />
          </div>
        )}
      </div>

      {/* ── STATUS BAR ── */}
      <div style={{
        height: 24, background: "#060608", borderTop: "1px solid #1a1a2e",
        display: "flex", alignItems: "center", gap: 10, padding: "0 10px",
        flexShrink: 0, fontSize: 10, color: "#4a4a7a", overflow: "hidden",
      }}>
        {activeFile ? (
          <>
            <span style={{ color: "#7c3aed", whiteSpace: "nowrap" }}>{activeLang}</span>
            <span style={{ whiteSpace: "nowrap" }}>Ln {cursor.line}:{cursor.col}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{activeFile.path}</span>
          </>
        ) : (
          <span style={{ flex: 1 }}>CodeAI IDE</span>
        )}
        {currentRepo && (
          <span style={{ color: "#22c55e", display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", flexShrink: 0 }}>
            🌿 {currentRepo.branch}
          </span>
        )}
        {loading.git && <span style={{ color: "#7c3aed", flexShrink: 0 }}>⟳</span>}
      </div>

      {/* ── TOAST NOTIFICATIONS ── */}
      <div style={{
        position: "fixed", bottom: 36, left: "50%", transform: "translateX(-50%)",
        zIndex: 300, display: "flex", flexDirection: "column", gap: 6, alignItems: "center",
        pointerEvents: "none", width: "calc(100vw - 60px)", maxWidth: 380,
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.type === "error" ? "#2a0d0d" : t.type === "success" ? "#0d2010" : "#111120",
            border: `1px solid ${t.type === "error" ? "#5a1d1d" : t.type === "success" ? "#1d5a2d" : "#2a2a4a"}`,
            color: t.type === "error" ? "#f87171" : t.type === "success" ? "#86efac" : "#c0c0e0",
            borderRadius: 10, padding: "10px 16px", fontSize: 12,
            boxShadow: "0 4px 20px #0009", animation: "fadeUp 0.3s ease",
            width: "100%", textAlign: "center",
          }}>{t.msg}</div>
        ))}
      </div>

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 2px; }
        ::-webkit-scrollbar-track { background: transparent; }
        input::placeholder, textarea::placeholder { color: #333355; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideInLeft { from { transform:translateX(-100%); } to { transform:translateX(0); } }
        @keyframes slideInRight { from { transform:translateX(100%); } to { transform:translateX(0); } }
      `}</style>
    </div>
  );
}
