import { useState } from "react";

const T = {
  panel: { background: "#080810", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" },
  section: { borderBottom: "1px solid #1a1a2e", padding: "10px 12px" },
  label: { fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "#4a4a7a", marginBottom: 8, display: "block" },
  input: {
    width: "100%", background: "#111120", border: "1px solid #2a2a3a",
    borderRadius: 6, padding: "8px 10px", color: "#c0c0e0",
    fontSize: 11, fontFamily: "inherit", outline: "none", marginBottom: 6,
  },
  btn: (color = "#7c3aed", disabled = false) => ({
    width: "100%", padding: "8px", borderRadius: 6, border: "none",
    background: disabled ? "#1a1a2e" : `linear-gradient(135deg, ${color}, ${color}aa)`,
    color: disabled ? "#3a3a5c" : "#fff", cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 11, fontWeight: 700, fontFamily: "inherit",
    boxShadow: disabled ? "none" : `0 0 12px ${color}44`,
    marginBottom: 5, transition: "all 0.2s",
  }),
  fileRow: (modified) => ({
    display: "flex", alignItems: "center", gap: 6, padding: "4px 8px",
    borderRadius: 4, marginBottom: 3, fontSize: 11, cursor: "pointer",
    background: modified ? "#1a1204" : "#101018",
  }),
  commitEntry: { padding: "8px 10px", borderBottom: "1px solid #12121e", fontSize: 11 },
  tag: (color) => ({
    fontSize: 9, padding: "1px 5px", borderRadius: 3,
    background: `${color}22`, color, border: `1px solid ${color}44`,
  }),
};

export default function GitPanel({
  token, user, repos, currentRepo, branches, modifiedFiles,
  onConnect, onSelectRepo, onSelectBranch, onCommitPush,
  onCreateBranch, onPull, commits, loading,
}) {
  const [pat, setPat] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [showCommits, setShowCommits] = useState(false);
  const [showRepos, setShowRepos] = useState(false);
  const [showBranches, setShowBranches] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");

  const filteredRepos = repos.filter(r =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase())
  );

  const handleCommit = () => {
    if (!commitMsg.trim()) return;
    onCommitPush(commitMsg.trim());
    setCommitMsg("");
  };

  const handleCreateBranch = () => {
    if (!newBranch.trim()) return;
    onCreateBranch(newBranch.trim());
    setNewBranch("");
  };

  if (!token) return (
    <div style={T.panel}>
      <div style={{ ...T.section, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🐙</div>
          <div style={{ fontSize: 13, color: "#c0c0e0", fontWeight: 700, marginBottom: 4 }}>Connect GitHub</div>
          <div style={{ fontSize: 10, color: "#4a4a7a", lineHeight: 1.6 }}>
            Use a Personal Access Token to<br />
            commit & push from your phone.
          </div>
        </div>
        <span style={T.label}>GitHub Personal Access Token</span>
        <input
          type="password"
          value={pat}
          onChange={e => setPat(e.target.value)}
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          style={T.input}
          onKeyDown={e => e.key === "Enter" && pat && onConnect(pat)}
        />
        <div style={{ fontSize: 9, color: "#3a3a5c", marginBottom: 10, lineHeight: 1.6 }}>
          Create at: github.com → Settings → Developer settings<br />
          → Personal access tokens → Generate new token<br />
          Scopes needed: <span style={{ color: "#7c3aed" }}>repo</span>
        </div>
        <button
          style={T.btn("#7c3aed", !pat.trim())}
          disabled={!pat.trim() || loading.git}
          onClick={() => onConnect(pat)}
        >
          {loading.git ? "Connecting…" : "→ Connect to GitHub"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={T.panel}>
      <div style={{ overflowY: "auto", flex: 1 }}>

        {/* User info */}
        <div style={{ ...T.section, display: "flex", alignItems: "center", gap: 8 }}>
          {user?.avatar_url && (
            <img src={user.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid #2a2a4a" }} />
          )}
          <div>
            <div style={{ fontSize: 11, color: "#c0c0e0", fontWeight: 700 }}>{user?.name || user?.login}</div>
            <div style={{ fontSize: 9, color: "#4a4a7a" }}>@{user?.login}</div>
          </div>
        </div>

        {/* Repo selector */}
        <div style={T.section}>
          <span style={T.label}>REPOSITORY</span>
          {currentRepo ? (
            <div>
              <div style={{
                background: "#111120", border: "1px solid #2a2a4a", borderRadius: 6,
                padding: "8px 10px", marginBottom: 6,
              }}>
                <div style={{ fontSize: 11, color: "#a78bfa", fontWeight: 700 }}>{currentRepo.name}</div>
                <div style={{ fontSize: 9, color: "#4a4a7a" }}>{currentRepo.owner}/{currentRepo.name}</div>
              </div>
              <button onClick={() => setShowRepos(!showRepos)} style={{
                ...T.btn("#3b82f6", false), background: "#1a1a2e",
                border: "1px solid #2a2a4a", boxShadow: "none", color: "#6090f0",
              }}>
                {showRepos ? "Hide repos ▲" : "Switch repo ▼"}
              </button>
            </div>
          ) : (
            <button onClick={() => setShowRepos(true)} style={T.btn("#3b82f6")}>
              {loading.git ? "Loading…" : "Select a repository ▼"}
            </button>
          )}

          {showRepos && (
            <div style={{ marginTop: 6 }}>
              <input
                value={repoSearch}
                onChange={e => setRepoSearch(e.target.value)}
                placeholder="Search repos…"
                style={{ ...T.input, marginBottom: 4 }}
              />
              <div style={{ maxHeight: 160, overflowY: "auto", borderRadius: 6, border: "1px solid #2a2a3a" }}>
                {filteredRepos.map(r => (
                  <button key={r.id} onClick={() => { onSelectRepo(r); setShowRepos(false); }} style={{
                    width: "100%", background: currentRepo?.name === r.name ? "#1e1e3a" : "#111120",
                    border: "none", borderBottom: "1px solid #1a1a2e",
                    padding: "8px 10px", color: "#c0c0e0",
                    textAlign: "left", cursor: "pointer", fontSize: 11, fontFamily: "inherit",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span>{r.name}</span>
                    {r.private && <span style={T.tag("#f59e0b")}>private</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Branch selector */}
        {currentRepo && (
          <div style={T.section}>
            <span style={T.label}>BRANCH</span>
            <div style={{
              background: "#111120", border: "1px solid #1d2a1d",
              borderRadius: 6, padding: "7px 10px", marginBottom: 6,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ color: "#22c55e", fontSize: 12 }}>🌿</span>
              <span style={{ fontSize: 11, color: "#86efac", fontWeight: 700 }}>{currentRepo.branch}</span>
            </div>

            <button onClick={() => setShowBranches(!showBranches)} style={{
              ...T.btn(), background: "#1a1a2e", border: "1px solid #2a2a4a", boxShadow: "none", color: "#6060a0",
            }}>
              {showBranches ? "Hide branches ▲" : "Switch branch ▼"}
            </button>

            {showBranches && (
              <div style={{ marginTop: 6 }}>
                <div style={{ maxHeight: 120, overflowY: "auto", borderRadius: 6, border: "1px solid #2a2a3a", marginBottom: 6 }}>
                  {branches.map(b => (
                    <button key={b.name} onClick={() => { onSelectBranch(b.name); setShowBranches(false); }} style={{
                      width: "100%", background: currentRepo?.branch === b.name ? "#1e1e3a" : "#111120",
                      border: "none", borderBottom: "1px solid #1a1a2e",
                      padding: "7px 10px", color: currentRepo?.branch === b.name ? "#a78bfa" : "#c0c0e0",
                      textAlign: "left", cursor: "pointer", fontSize: 11, fontFamily: "inherit",
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span>{currentRepo?.branch === b.name ? "● " : "  "}</span>
                      {b.name}
                    </button>
                  ))}
                </div>
                {/* New branch */}
                <div style={{ display: "flex", gap: 5 }}>
                  <input
                    value={newBranch}
                    onChange={e => setNewBranch(e.target.value)}
                    placeholder="new-branch-name"
                    style={{ ...T.input, marginBottom: 0, flex: 1 }}
                  />
                  <button
                    onClick={handleCreateBranch}
                    disabled={!newBranch.trim()}
                    style={{
                      ...T.btn("#22c55e", !newBranch.trim()),
                      width: "auto", padding: "8px 12px", marginBottom: 0,
                    }}
                  >+</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Changes */}
        {currentRepo && (
          <div style={T.section}>
            <span style={T.label}>CHANGES ({modifiedFiles.length})</span>
            {modifiedFiles.length === 0 ? (
              <div style={{ fontSize: 11, color: "#3a3a5c", padding: "4px 0" }}>
                No uncommitted changes
              </div>
            ) : (
              <div style={{ marginBottom: 8 }}>
                {modifiedFiles.map(f => (
                  <div key={f.path} style={T.fileRow(true)}>
                    <span style={{ color: "#f59e0b", fontSize: 10, fontWeight: 700 }}>M</span>
                    <span style={{ fontSize: 11, color: "#c0c0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.path.split("/").pop()}
                    </span>
                    <span style={{ fontSize: 9, color: "#4a4a7a", marginLeft: "auto" }}>
                      {f.path.split("/").slice(0, -1).join("/")}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <textarea
              value={commitMsg}
              onChange={e => setCommitMsg(e.target.value)}
              placeholder="Commit message…"
              rows={3}
              style={{
                ...T.input, resize: "vertical", height: 70, marginBottom: 6,
              }}
            />
            <button
              onClick={handleCommit}
              disabled={!commitMsg.trim() || modifiedFiles.length === 0 || loading.git}
              style={T.btn("#22c55e", !commitMsg.trim() || modifiedFiles.length === 0 || loading.git)}
            >
              {loading.git ? "Pushing…" : `⬆ Commit & Push (${modifiedFiles.length} files)`}
            </button>
            {currentRepo && (
              <button onClick={onPull} disabled={loading.git} style={{
                ...T.btn("#3b82f6", loading.git), background: "#0d1f2a",
                border: "1px solid #1d3a5a", boxShadow: "none",
              }}>
                ⬇ Pull (sync from remote)
              </button>
            )}
          </div>
        )}

        {/* Commit history */}
        {currentRepo && (
          <div style={T.section}>
            <button onClick={() => setShowCommits(!showCommits)} style={{
              ...T.btn(), background: "transparent", border: "none",
              color: "#4a4a7a", boxShadow: "none", textAlign: "left",
              width: "100%", padding: 0, marginBottom: 0,
            }}>
              <span style={T.label}>COMMIT HISTORY {showCommits ? "▲" : "▼"}</span>
            </button>
            {showCommits && (
              <div>
                {loading.commits ? (
                  <div style={{ fontSize: 11, color: "#3a3a5c" }}>Loading…</div>
                ) : commits.length === 0 ? (
                  <div style={{ fontSize: 11, color: "#3a3a5c" }}>No commits found</div>
                ) : (
                  commits.map((c, i) => (
                    <div key={i} style={T.commitEntry}>
                      <div style={{ fontSize: 11, color: "#c0c0e0", marginBottom: 3, lineHeight: 1.4 }}>
                        {c.commit.message.split("\n")[0].slice(0, 60)}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={T.tag("#7c3aed")}>{c.sha.slice(0, 7)}</span>
                        <span style={{ fontSize: 9, color: "#4a4a7a" }}>
                          {c.commit.author.name} · {new Date(c.commit.author.date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
