import { useState, useMemo } from "react";
import { fileIcon } from "../github.js";

const T = {
  sidebar: { background: "#080810", borderRight: "1px solid #1a1a2e", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" },
  header: { padding: "10px 12px", borderBottom: "1px solid #1a1a2e", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 },
  headerLabel: { fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "#4a4a7a" },
  scroll: { flex: 1, overflowY: "auto", overflowX: "hidden" },
  entry: (active, depth) => ({
    display: "flex", alignItems: "center", gap: 5,
    padding: `5px 10px 5px ${10 + depth * 14}px`,
    cursor: "pointer", fontSize: 12, lineHeight: 1.3,
    background: active ? "#1a1a3a" : "transparent",
    borderLeft: active ? "2px solid #7c3aed" : "2px solid transparent",
    color: active ? "#c0b0ff" : "#9090b0",
    transition: "background 0.1s",
    userSelect: "none",
  }),
  icon: { fontSize: 13, flexShrink: 0 },
  name: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 },
  badge: (color) => ({
    fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
    background: `${color}22`, color, border: `1px solid ${color}44`,
    flexShrink: 0,
  }),
};

// Build tree structure from flat path list
const buildTree = (files) => {
  const root = {};
  files.forEach((f) => {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!node[p]) {
        node[p] = i === parts.length - 1
          ? { __file: f, __children: null }
          : { __file: null, __children: {} };
      }
      if (node[p].__children !== null) node = node[p].__children;
    }
  });
  return root;
};

const TreeNode = ({ name, node, depth = 0, onOpen, openFile, modifiedPaths, activePath }) => {
  const [open, setOpen] = useState(depth < 2);
  const isDir = node.__children !== null;
  const isActive = activePath === node.__file?.path;
  const isModified = !isDir && modifiedPaths?.has(node.__file?.path);

  if (isDir) {
    return (
      <div>
        <div style={T.entry(false, depth)} onClick={() => setOpen(!open)}>
          <span style={T.icon}>{open ? "📂" : "📁"}</span>
          <span style={T.name}>{name}</span>
          <span style={{ fontSize: 9, color: "#3a3a5c" }}>{open ? "▾" : "▸"}</span>
        </div>
        {open && node.__children && (
          <div>
            {Object.entries(node.__children)
              .sort(([, a], [, b]) => {
                const aDir = a.__children !== null;
                const bDir = b.__children !== null;
                if (aDir !== bDir) return aDir ? -1 : 1;
                return 0;
              })
              .map(([childName, childNode]) => (
                <TreeNode key={childName} name={childName} node={childNode}
                  depth={depth + 1} onOpen={onOpen} openFile={openFile}
                  modifiedPaths={modifiedPaths} activePath={activePath} />
              ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={T.entry(isActive, depth)} onClick={() => onOpen(node.__file)}>
      <span style={T.icon}>{fileIcon(name)}</span>
      <span style={T.name}>{name}</span>
      {isModified && <span style={T.badge("#f59e0b")}>M</span>}
    </div>
  );
};

export default function FileTree({ files, activePath, onOpen, modifiedPaths, onNewFile, onRefresh, loading }) {
  const [search, setSearch] = useState("");

  const filteredFiles = useMemo(() => {
    if (!search.trim()) return files;
    return files.filter(f => f.path.toLowerCase().includes(search.toLowerCase()));
  }, [files, search]);

  const tree = useMemo(() => buildTree(filteredFiles.filter(f => f.type !== "tree")), [filteredFiles]);

  if (loading) return (
    <div style={{ ...T.sidebar, alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#3a3a5c", fontSize: 11 }}>Loading files…</div>
    </div>
  );

  return (
    <div style={T.sidebar}>
      <div style={T.header}>
        <span style={T.headerLabel}>EXPLORER</span>
        <div style={{ display: "flex", gap: 6 }}>
          {onNewFile && (
            <button onClick={onNewFile} title="New file" style={{
              background: "transparent", border: "none", color: "#6060a0",
              cursor: "pointer", fontSize: 14, padding: 2,
            }}>+</button>
          )}
          {onRefresh && (
            <button onClick={onRefresh} title="Refresh" style={{
              background: "transparent", border: "none", color: "#6060a0",
              cursor: "pointer", fontSize: 12, padding: 2,
            }}>↻</button>
          )}
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: "6px 10px", borderBottom: "1px solid #1a1a2e", flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter files…"
          style={{
            width: "100%", background: "#111120", border: "1px solid #2a2a3a",
            borderRadius: 5, padding: "5px 8px", color: "#c0c0e0",
            fontSize: 11, fontFamily: "inherit", outline: "none",
          }}
        />
      </div>

      <div style={T.scroll}>
        {files.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "#3a3a5c", fontSize: 11 }}>
            No files found.<br />
            <span style={{ color: "#6060a0" }}>Open a repo to browse files.</span>
          </div>
        ) : (
          Object.entries(tree)
            .sort(([, a], [, b]) => {
              const aDir = a.__children !== null;
              const bDir = b.__children !== null;
              if (aDir !== bDir) return aDir ? -1 : 1;
              return 0;
            })
            .map(([name, node]) => (
              <TreeNode key={name} name={name} node={node} depth={0}
                onOpen={onOpen} openFile={activePath}
                modifiedPaths={modifiedPaths} activePath={activePath} />
            ))
        )}
      </div>

      {modifiedPaths?.size > 0 && (
        <div style={{
          padding: "8px 12px", borderTop: "1px solid #1a1a2e",
          fontSize: 10, color: "#f59e0b", display: "flex", alignItems: "center", gap: 5,
        }}>
          <span>●</span>
          {modifiedPaths.size} unsaved {modifiedPaths.size === 1 ? "file" : "files"}
        </div>
      )}
    </div>
  );
}
