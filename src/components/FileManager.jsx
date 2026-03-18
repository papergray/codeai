import { useState, useRef, useCallback, useMemo } from "react";
import { fileIcon } from "../github.js";

// ── File status helpers ───────────────────────────────────────────────────────
// repoPathSet  = Set of paths that exist in the GitHub repo
// openFilesMap = Map<path, {content, originalContent, isNew}> from App state
const getStatus = (path, repoPathSet, openFilesMap) => {
  const inRepo    = repoPathSet.has(path);
  const openFile  = openFilesMap.get(path);

  if (!inRepo) return "local";           // green — not in repo at all
  if (!openFile) return "synced";        // normal — in repo, not opened/changed
  if (openFile.isNew) return "local";    // green — brand new file
  if (openFile.content !== openFile.originalContent) return "modified"; // yellow
  return "synced";                       // normal
};

const STATUS_COLORS = {
  local:    { text: "#4ade80", bg: "#0a1f10", border: "#1a4a20", dot: "#4ade80", label: "local"    },
  modified: { text: "#fbbf24", bg: "#1a1200", border: "#3a2a00", dot: "#fbbf24", label: "modified" },
  synced:   { text: "#8080a0", bg: "transparent", border: "transparent", dot: null, label: null    },
};

// ── Build nested tree from flat path list ─────────────────────────────────────
const buildTree = (paths) => {
  const root = {};
  for (const path of paths) {
    const parts = path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = { __dir: true, __path: parts.slice(0, i + 1).join("/"), __children: {} };
      node = node[parts[i]].__children;
    }
    const last = parts[parts.length - 1];
    if (!node[last]) node[last] = { __dir: false, __path: path, __children: null };
  }
  return root;
};

const sortEntries = (entries) =>
  [...entries].sort(([, a], [, b]) => {
    if (a.__dir !== b.__dir) return a.__dir ? -1 : 1;
    return 0;
  });

// Highest-priority status in a subtree (local > modified > synced)
const PRIORITY = { local: 2, modified: 1, synced: 0 };
const subtreeStatus = (node, repoPathSet, openFilesMap) => {
  if (!node.__dir) return getStatus(node.__path, repoPathSet, openFilesMap);
  let best = "synced";
  for (const child of Object.values(node.__children)) {
    const s = subtreeStatus(child, repoPathSet, openFilesMap);
    if (PRIORITY[s] > PRIORITY[best]) best = s;
  }
  return best;
};

// ── TreeNode ──────────────────────────────────────────────────────────────────
function TreeNode({ name, node, depth, activePath, repoPathSet, openFilesMap, onOpen, onCtx, dropTarget, onDragEnter, onDragLeave }) {
  const [open, setOpen] = useState(depth < 2);

  if (node.__dir) {
    const dirStatus = subtreeStatus(node, repoPathSet, openFilesMap);
    const sc = STATUS_COLORS[dirStatus];
    return (
      <div>
        <div
          onClick={() => setOpen(o => !o)}
          onContextMenu={e => onCtx(e, null, node.__path || name, true)}
          onDragOver={e => { e.preventDefault(); onDragEnter(node.__path || name); }}
          onDragLeave={onDragLeave}
          onDrop={e => { e.preventDefault(); onDragLeave(); }}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: `6px 8px 6px ${8 + depth * 14}px`,
            cursor: "pointer", fontSize: 12,
            color: dirStatus !== "synced" ? sc.text : "#8080a0",
            background: dropTarget === (node.__path || name) ? "#0a1f10" : "transparent",
            borderLeft: dropTarget === (node.__path || name) ? "2px solid #22c55e" : "2px solid transparent",
            userSelect: "none",
          }}
        >
          <span style={{ fontSize: 14 }}>{open ? "📂" : "📁"}</span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          {dirStatus !== "synced" && (
            <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, flexShrink: 0 }}>
              {sc.label}
            </span>
          )}
          <span style={{ fontSize: 9, color: "#3a3a5c", flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
        </div>
        {open && (
          <div>
            {sortEntries(Object.entries(node.__children)).map(([n, nd]) => (
              <TreeNode key={n} name={n} node={nd} depth={depth + 1}
                activePath={activePath} repoPathSet={repoPathSet} openFilesMap={openFilesMap}
                onOpen={onOpen} onCtx={onCtx}
                dropTarget={dropTarget} onDragEnter={onDragEnter} onDragLeave={onDragLeave}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const status = getStatus(node.__path, repoPathSet, openFilesMap);
  const sc = STATUS_COLORS[status];
  const isActive = activePath === node.__path;

  return (
    <div
      draggable
      onClick={() => onOpen({ path: node.__path, type: "blob" })}
      onContextMenu={e => onCtx(e, { path: node.__path }, name, false)}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: `6px 8px 6px ${8 + depth * 14}px`,
        cursor: "pointer", fontSize: 12,
        background: isActive ? (status === "local" ? "#0a2210" : status === "modified" ? "#1a1200" : "#1a1a3a") : `${sc.bg}`,
        borderLeft: isActive ? `2px solid ${sc.dot || "#7c3aed"}` : "2px solid transparent",
        color: isActive ? (sc.dot || "#c0b0ff") : sc.text,
        userSelect: "none",
      }}
    >
      <span style={{ fontSize: 13 }}>{fileIcon(name)}</span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      {sc.dot && (
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: sc.dot, flexShrink: 0, boxShadow: `0 0 4px ${sc.dot}` }} />
      )}
    </div>
  );
}

// ── Context menu ──────────────────────────────────────────────────────────────
function CtxMenu({ x, y, item, isDir, name, onRename, onDelete, onNewFile, onNewFolder, onUpload, onClose }) {
  const items = [
    ...(isDir
      ? [
          { label: "📄 New File Here",    fn: () => onNewFile(name) },
          { label: "📁 New Folder Here",  fn: () => onNewFolder(name) },
          { label: "⬆ Upload File Here",  fn: () => onUpload(name, null) },
        ]
      : [
          { label: "✏️ Rename",           fn: () => onRename(item, name) },
          { label: "⬆ Replace File",      fn: () => onUpload(null, item) },
        ]),
    { label: "🗑 Delete", fn: () => onDelete(item, name, isDir), danger: true },
  ];
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 999 }} onClick={onClose} />
      <div style={{
        position: "fixed",
        left: Math.min(x, window.innerWidth  - 185),
        top:  Math.min(y, window.innerHeight - items.length * 40 - 8),
        zIndex: 1000, background: "#0e0e1a", border: "1px solid #2a2a4a",
        borderRadius: 9, overflow: "hidden", boxShadow: "0 8px 28px #000d", minWidth: 175,
      }}>
        {items.map((it, i) => (
          <button key={i} onClick={() => { it.fn(); onClose(); }} style={{
            display: "block", width: "100%", background: "transparent",
            border: "none", borderBottom: i < items.length - 1 ? "1px solid #1a1a2e" : "none",
            padding: "10px 14px", color: it.danger ? "#f87171" : "#c0c0e0",
            cursor: "pointer", fontSize: 12, textAlign: "left", fontFamily: "inherit",
          }}>{it.label}</button>
        ))}
      </div>
    </>
  );
}

// ── Main FileManager ──────────────────────────────────────────────────────────
export default function FileManager({
  repoFiles,        // [{path, type, sha}] — what's in the repo right now
  localPaths,       // [string] — ALL paths to show (repo + open local files)
  openFilesMap,     // Map<path, {content, originalContent, isNew}>
  activePath,
  onOpen,
  onUploadFile,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onRenameFile,
  onRefreshRepo,    // only refreshes repo, never touches local files
  loading,
}) {
  const [search,     setSearch]    = useState("");
  const [dropTarget, setDropTarget] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [ctx,        setCtx]       = useState(null);
  const fileInputRef   = useRef(null);
  const folderInputRef = useRef(null);
  const uploadCtxRef   = useRef(null);
  const rootRef        = useRef(null);

  // Build a Set of repo paths for O(1) lookup
  const repoPathSet = useMemo(() => new Set((repoFiles || []).map(f => f.path)), [repoFiles]);

  // All unique paths = repo paths + local-only open files
  const allPaths = useMemo(() => {
    const all = new Set(repoPathSet);
    for (const p of localPaths || []) all.add(p);
    return Array.from(all);
  }, [repoPathSet, localPaths]);

  const filtered = search.trim()
    ? allPaths.filter(p => p.toLowerCase().includes(search.toLowerCase()))
    : allPaths;

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  // ── Legend counts ─────────────────────────────────────────────────────────
  const localCount    = useMemo(() => allPaths.filter(p => !repoPathSet.has(p)).length, [allPaths, repoPathSet]);
  const modifiedCount = useMemo(() => {
    let n = 0;
    for (const [, f] of openFilesMap) {
      if (repoPathSet.has(f.path) && !f.isNew && f.content !== f.originalContent) n++;
    }
    return n;
  }, [openFilesMap, repoPathSet]);

  // ── Drag from device ──────────────────────────────────────────────────────
  const onRootDragOver  = e => { e.preventDefault(); setIsDragging(true); };
  const onRootDragLeave = e => { if (!rootRef.current?.contains(e.relatedTarget)) setIsDragging(false); };
  const onRootDrop = async (e) => {
    e.preventDefault(); setIsDragging(false); setDropTarget(null);
    const items = Array.from(e.dataTransfer.items || []);
    for (const item of items) {
      if (item.kind !== "file") continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) { await traverseDir(entry, ""); }
      else { const f = item.getAsFile(); if (f) onUploadFile(f, ""); }
    }
  };

  const traverseDir = async (dirEntry, prefix) => {
    const reader = dirEntry.createReader();
    const entries = await new Promise(res => reader.readEntries(res));
    for (const entry of entries) {
      const p = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory) { await traverseDir(entry, p); }
      else { const file = await new Promise(res => entry.file(res)); onUploadFile(file, prefix ? `${prefix}/` : ""); }
    }
  };

  // ── File input handlers ───────────────────────────────────────────────────
  const onFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    const { prefix, replaceItem } = uploadCtxRef.current || {};
    if (replaceItem) { if (files[0]) onUploadFile(files[0], null, replaceItem); }
    else { for (const f of files) onUploadFile(f, prefix || ""); }
    e.target.value = "";
  };

  const onFolderChange = (e) => {
    for (const f of Array.from(e.target.files || [])) {
      const rel    = f.webkitRelativePath || f.name;
      const prefix = rel.includes("/") ? rel.split("/").slice(0, -1).join("/") + "/" : "";
      onUploadFile(f, prefix);
    }
    e.target.value = "";
  };

  const triggerUpload = (prefix = "", replaceItem = null) => {
    uploadCtxRef.current = { prefix, replaceItem };
    fileInputRef.current?.click();
  };

  const promptNewFile   = (prefix = "") => { const n = prompt("New file path:", prefix ? `${prefix}/` : ""); if (n?.trim()) onCreateFile(n.trim()); };
  const promptNewFolder = (prefix = "") => { const n = prompt("New folder name:", prefix ? `${prefix}/` : ""); if (n?.trim()) onCreateFolder(n.trim()); };
  const handleRename    = (item, old) => { const n = prompt("Rename to:", item?.path || old); if (n?.trim() && n !== item?.path) onRenameFile(item, n.trim()); };
  const handleDelete    = (item, name, isDir) => { if (confirm(`Delete "${name}"?`)) onDeleteFile(item, isDir); };

  return (
    <div
      ref={rootRef}
      style={{ height: "100%", display: "flex", flexDirection: "column", background: "#080810", overflow: "hidden", position: "relative" }}
      onDragOver={onRootDragOver}
      onDragLeave={onRootDragLeave}
      onDrop={onRootDrop}
    >
      <input ref={fileInputRef}   type="file" multiple style={{ display: "none" }} onChange={onFileChange} />
      <input ref={folderInputRef} type="file" multiple webkitdirectory style={{ display: "none" }} onChange={onFolderChange} />

      {/* Header */}
      <div style={{ padding: "8px 8px 6px", borderBottom: "1px solid #1a1a2e", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#4a4a7a", flex: 1 }}>EXPLORER</span>
          {/* Toolbar buttons */}
          {[
            { icon: "📄", title: "New File",      fn: () => promptNewFile() },
            { icon: "📁", title: "New Folder",    fn: () => promptNewFolder() },
            { icon: "⬆",  title: "Upload File",   fn: () => triggerUpload() },
            { icon: "📦", title: "Upload Folder", fn: () => { uploadCtxRef.current = { prefix: "" }; folderInputRef.current?.click(); } },
          ].map(b => (
            <button key={b.title} title={b.title} onClick={b.fn} style={{
              background: "#111120", border: "1px solid #2a2a3a", borderRadius: 5,
              padding: "3px 6px", color: "#6060a0", cursor: "pointer", fontSize: 11,
            }}>{b.icon}</button>
          ))}
          {/* Refresh repo — does NOT affect local files */}
          <button
            title="Refresh repo (keeps local files)"
            onClick={onRefreshRepo}
            disabled={loading}
            style={{
              background: "#0d1f10", border: "1px solid #1d4a20", borderRadius: 5,
              padding: "3px 6px", color: loading ? "#2a4a2a" : "#22c55e",
              cursor: loading ? "wait" : "pointer", fontSize: 11,
              animation: loading ? "spin 1s linear infinite" : "none",
            }}
          >⟳</button>
        </div>

        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter files…"
          style={{ width: "100%", background: "#111120", border: "1px solid #1a1a2e", borderRadius: 5, padding: "5px 8px", color: "#c0c0e0", fontSize: 11, fontFamily: "inherit", outline: "none" }}
        />
      </div>

      {/* Legend */}
      {(localCount > 0 || modifiedCount > 0) && (
        <div style={{ padding: "5px 8px", borderBottom: "1px solid #1a1a2e", display: "flex", gap: 10, flexShrink: 0 }}>
          {localCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#4ade80" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 4px #4ade80", flexShrink: 0 }} />
              {localCount} local only
            </div>
          )}
          {modifiedCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#fbbf24" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", boxShadow: "0 0 4px #fbbf24", flexShrink: 0 }} />
              {modifiedCount} modified
            </div>
          )}
        </div>
      )}

      {/* Drop overlay */}
      {isDragging && (
        <div style={{ position: "absolute", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,20,10,0.88)", pointerEvents: "none" }}>
          <div style={{ textAlign: "center", color: "#22c55e" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📂</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Drop to upload</div>
            <div style={{ fontSize: 10, color: "#3a7a3a", marginTop: 4 }}>Supports files and folders</div>
          </div>
        </div>
      )}

      {/* Tree */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {loading && allPaths.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "#3a3a5c", fontSize: 11 }}>Loading…</div>
        ) : allPaths.length === 0 ? (
          <div style={{ padding: "20px 12px", textAlign: "center", color: "#2a2a4a", fontSize: 11, lineHeight: 1.9 }}>
            Open a repo to browse files<br/>
            <span style={{ fontSize: 9, color: "#1a1a3a" }}>or drag files to upload them</span>
          </div>
        ) : (
          sortEntries(Object.entries(tree)).map(([n, nd]) => (
            <TreeNode key={n} name={n} node={nd} depth={0}
              activePath={activePath}
              repoPathSet={repoPathSet}
              openFilesMap={openFilesMap}
              onOpen={onOpen}
              onCtx={(e, item, name, isDir) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, item, name, isDir }); }}
              dropTarget={dropTarget}
              onDragEnter={setDropTarget}
              onDragLeave={() => setDropTarget(null)}
            />
          ))
        )}
      </div>

      {/* Status bar */}
      <div style={{ padding: "4px 8px", borderTop: "1px solid #1a1a2e", fontSize: 9, color: "#2a2a3a", display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
        <span>{allPaths.length} files</span>
        <span>Drag files to upload · Right-click for options</span>
      </div>

      {/* Context menu */}
      {ctx && (
        <CtxMenu
          {...ctx}
          onRename={handleRename}
          onDelete={handleDelete}
          onNewFile={promptNewFile}
          onNewFolder={promptNewFolder}
          onUpload={triggerUpload}
          onClose={() => setCtx(null)}
        />
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
