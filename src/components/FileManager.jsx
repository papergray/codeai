import { useState, useRef, useCallback } from "react";
import { fileIcon } from "../github.js";

// Build nested tree from flat path list
const buildTree = (items) => {
  const root = {};
  for (const item of items) {
    const parts = item.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = { __dir: true, __children: {} };
      node = node[parts[i]].__children;
    }
    const last = parts[parts.length - 1];
    node[last] = { __dir: false, __item: item, __children: null };
  }
  return root;
};

const sortEntries = (entries) =>
  Object.entries(entries).sort(([, a], [, b]) => {
    if (a.__dir !== b.__dir) return a.__dir ? -1 : 1;
    return 0;
  });

// ── Individual tree node ──────────────────────────────────────────────────────
function TreeNode({ name, node, depth, activePath, modifiedPaths, onOpen, onContextMenu, dragTarget, onDragEnter, onDragLeave }) {
  const [open, setOpen] = useState(depth < 2);
  const isActive = !node.__dir && activePath === node.__item?.path;
  const isModified = !node.__dir && modifiedPaths?.has(node.__item?.path);
  const isDragOver = dragTarget === (node.__dir ? `dir:${name}` : node.__item?.path);

  if (node.__dir) return (
    <div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: `6px 8px 6px ${8 + depth * 14}px`,
          cursor: "pointer", fontSize: 12, color: "#8080a0",
          background: isDragOver ? "#1a2a1a" : "transparent",
          borderLeft: isDragOver ? "2px solid #22c55e" : "2px solid transparent",
          userSelect: "none",
        }}
        onClick={() => setOpen(o => !o)}
        onContextMenu={e => onContextMenu(e, null, name, true)}
        onDragOver={e => { e.preventDefault(); onDragEnter(`dir:${name}`); }}
        onDragLeave={() => onDragLeave()}
        onDrop={e => { e.preventDefault(); onDragLeave(); }}
      >
        <span style={{ fontSize: 14 }}>{open ? "📂" : "📁"}</span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        <span style={{ fontSize: 9, color: "#3a3a5c" }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div>
          {sortEntries(node.__children).map(([n, nd]) => (
            <TreeNode key={n} name={n} node={nd} depth={depth + 1}
              activePath={activePath} modifiedPaths={modifiedPaths}
              onOpen={onOpen} onContextMenu={onContextMenu}
              dragTarget={dragTarget} onDragEnter={onDragEnter} onDragLeave={onDragLeave}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div
      draggable
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: `6px 8px 6px ${8 + depth * 14}px`,
        cursor: "pointer", fontSize: 12,
        background: isActive ? "#1a1a3a" : "transparent",
        borderLeft: isActive ? "2px solid #7c3aed" : "2px solid transparent",
        color: isActive ? "#c0b0ff" : "#8080a0",
        userSelect: "none",
      }}
      onClick={() => onOpen(node.__item)}
      onContextMenu={e => onContextMenu(e, node.__item, name, false)}
    >
      <span style={{ fontSize: 13 }}>{fileIcon(name)}</span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      {isModified && <span style={{ color: "#f59e0b", fontSize: 10 }}>●</span>}
    </div>
  );
}

// ── Context menu ──────────────────────────────────────────────────────────────
function ContextMenu({ x, y, item, isDir, name, onRename, onDelete, onNewFile, onNewFolder, onUpload, onClose }) {
  const menuItems = [
    ...(isDir ? [
      { label: "📄 New File Here",   action: () => onNewFile(name) },
      { label: "📁 New Folder Here", action: () => onNewFolder(name) },
      { label: "⬆ Upload File Here", action: () => onUpload(name) },
    ] : [
      { label: "✏️ Rename",  action: () => onRename(item, name) },
      { label: "⬆ Replace", action: () => onUpload(null, item) },
    ]),
    { label: "🗑 Delete",  action: () => onDelete(item, name, isDir), danger: true },
  ];

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 999 }} onClick={onClose} />
      <div style={{
        position: "fixed", left: Math.min(x, window.innerWidth - 180), top: Math.min(y, window.innerHeight - 160),
        zIndex: 1000, background: "#0e0e1a", border: "1px solid #2a2a4a",
        borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 24px #000c",
        minWidth: 170,
      }}>
        {menuItems.map((mi, i) => (
          <button key={i} onClick={() => { mi.action(); onClose(); }} style={{
            display: "block", width: "100%", background: "transparent",
            border: "none", borderBottom: i < menuItems.length - 1 ? "1px solid #1a1a2e" : "none",
            padding: "10px 14px", color: mi.danger ? "#f87171" : "#c0c0e0",
            cursor: "pointer", fontSize: 12, textAlign: "left", fontFamily: "inherit",
          }}>{mi.label}</button>
        ))}
      </div>
    </>
  );
}

// ── Main FileManager ──────────────────────────────────────────────────────────
export default function FileManager({ files, activePath, modifiedPaths, onOpen, onUploadFile, onCreateFile, onCreateFolder, onDeleteFile, onRenameFile, loading }) {
  const [search, setSearch]       = useState("");
  const [dragTarget, setDragTarget] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [ctx, setCtx] = useState(null); // context menu state
  const fileInputRef  = useRef(null);
  const folderInputRef = useRef(null);
  const uploadCtxRef  = useRef(null); // {prefix, replaceItem}
  const rootRef = useRef(null);

  const filtered = search.trim()
    ? files.filter(f => f.path.toLowerCase().includes(search.toLowerCase()))
    : files;

  const tree = buildTree(filtered.filter(f => f.type !== "tree"));

  // ── Drag files from device onto the file manager ──────────────────────────
  const onRootDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onRootDragLeave = (e) => {
    if (!rootRef.current?.contains(e.relatedTarget)) setIsDragging(false);
  };
  const onRootDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    setDragTarget(null);
    const items = Array.from(e.dataTransfer.items || []);
    for (const item of items) {
      if (item.kind === "file") {
        const entry = item.webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          await traverseDirectory(entry, "");
        } else {
          const file = item.getAsFile();
          if (file) onUploadFile(file, "");
        }
      }
    }
  };

  const traverseDirectory = async (dirEntry, prefix) => {
    const reader = dirEntry.createReader();
    const entries = await new Promise(res => reader.readEntries(res));
    for (const entry of entries) {
      const p = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory) {
        await traverseDirectory(entry, p);
      } else {
        const file = await new Promise(res => entry.file(res));
        onUploadFile(file, prefix ? `${prefix}/` : "");
      }
    }
  };

  // ── File input change handlers ────────────────────────────────────────────
  const onFileInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    const { prefix, replaceItem } = uploadCtxRef.current || {};
    if (replaceItem) {
      // Replace specific file
      if (files[0]) onUploadFile(files[0], null, replaceItem);
    } else {
      // Upload to prefix
      for (const f of files) onUploadFile(f, prefix || "");
    }
    e.target.value = "";
  };

  const onFolderInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      const relPath = f.webkitRelativePath || f.name;
      const prefix  = relPath.includes("/") ? relPath.split("/").slice(0, -1).join("/") + "/" : "";
      onUploadFile(f, prefix);
    }
    e.target.value = "";
  };

  // ── Toolbar actions ───────────────────────────────────────────────────────
  const triggerUpload = (prefix = "", replaceItem = null) => {
    uploadCtxRef.current = { prefix, replaceItem };
    fileInputRef.current?.click();
  };
  const triggerFolderUpload = () => {
    uploadCtxRef.current = { prefix: "" };
    folderInputRef.current?.click();
  };

  const promptNewFile = (prefix = "") => {
    const name = prompt(`New file name:`, prefix ? `${prefix}/` : "");
    if (name?.trim()) onCreateFile(name.trim());
  };
  const promptNewFolder = (prefix = "") => {
    const name = prompt(`New folder name:`, prefix ? `${prefix}/` : "");
    if (name?.trim()) onCreateFolder(name.trim());
  };
  const handleRename = (item, oldName) => {
    const newName = prompt("Rename to:", item.path);
    if (newName?.trim() && newName !== item.path) onRenameFile(item, newName.trim());
  };
  const handleDelete = (item, name, isDir) => {
    if (!confirm(`Delete "${name}"?`)) return;
    onDeleteFile(item, isDir);
  };
  const openCtxMenu = (e, item, name, isDir) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, item, name, isDir });
  };

  return (
    <div
      ref={rootRef}
      style={{
        height: "100%", display: "flex", flexDirection: "column",
        background: "#080810", overflow: "hidden",
        outline: isDragging ? "2px dashed #22c55e" : "none",
        outlineOffset: -2,
      }}
      onDragOver={onRootDragOver}
      onDragLeave={onRootDragLeave}
      onDrop={onRootDrop}
    >
      {/* Hidden inputs */}
      <input ref={fileInputRef}   type="file" multiple  style={{ display: "none" }} onChange={onFileInputChange} />
      <input ref={folderInputRef} type="file" multiple webkitdirectory style={{ display: "none" }} onChange={onFolderInputChange} />

      {/* Header */}
      <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid #1a1a2e", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "#4a4a7a" }}>EXPLORER</span>
          <div style={{ display: "flex", gap: 4 }}>
            {[
              { icon: "📄+", title: "New File",      action: () => promptNewFile() },
              { icon: "📁+", title: "New Folder",    action: () => promptNewFolder() },
              { icon: "⬆",   title: "Upload File",   action: () => triggerUpload() },
              { icon: "📦",  title: "Upload Folder", action: triggerFolderUpload },
            ].map(b => (
              <button key={b.title} title={b.title} onClick={b.action} style={{
                background: "#111120", border: "1px solid #2a2a3a", borderRadius: 5,
                padding: "3px 6px", color: "#6060a0", cursor: "pointer", fontSize: 11,
              }}>{b.icon}</button>
            ))}
          </div>
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter files…"
          style={{
            width: "100%", background: "#111120", border: "1px solid #1a1a2e",
            borderRadius: 5, padding: "5px 8px", color: "#c0c0e0",
            fontSize: 11, fontFamily: "inherit", outline: "none",
          }}
        />
      </div>

      {/* Drop hint */}
      {isDragging && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 50, display: "flex",
          alignItems: "center", justifyContent: "center", pointerEvents: "none",
          background: "rgba(10,10,20,0.85)",
        }}>
          <div style={{ textAlign: "center", color: "#22c55e" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📂</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Drop to upload</div>
          </div>
        </div>
      )}

      {/* Tree */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative" }}>
        {loading ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "#3a3a5c", fontSize: 11 }}>Loading…</div>
        ) : files.length === 0 ? (
          <div style={{ padding: "24px 12px", textAlign: "center", color: "#3a3a5c", fontSize: 11, lineHeight: 1.8 }}>
            Open a GitHub repo<br/>to browse files here<br/>
            <span style={{ fontSize: 10, color: "#2a2a4a" }}>or drag files to upload</span>
          </div>
        ) : (
          sortEntries(tree).map(([n, nd]) => (
            <TreeNode key={n} name={n} node={nd} depth={0}
              activePath={activePath} modifiedPaths={modifiedPaths}
              onOpen={onOpen} onContextMenu={openCtxMenu}
              dragTarget={dragTarget}
              onDragEnter={setDragTarget}
              onDragLeave={() => setDragTarget(null)}
            />
          ))
        )}
      </div>

      {/* Context menu */}
      {ctx && (
        <ContextMenu
          {...ctx}
          onRename={handleRename}
          onDelete={handleDelete}
          onNewFile={promptNewFile}
          onNewFolder={promptNewFolder}
          onUpload={(prefix, replaceItem) => triggerUpload(prefix || "", replaceItem)}
          onClose={() => setCtx(null)}
        />
      )}

      {/* Bottom: drag hint */}
      <div style={{ padding: "5px 10px", borderTop: "1px solid #1a1a2e", fontSize: 9, color: "#2a2a3a", textAlign: "center", flexShrink: 0 }}>
        Drag files here to upload · Long-press for options
      </div>
    </div>
  );
}
