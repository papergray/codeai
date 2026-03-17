// GitHub REST API wrapper — no external dependencies needed

const BASE = "https://api.github.com";

const headers = (token) => ({
  Authorization: `token ${token}`,
  "Content-Type": "application/json",
  Accept: "application/vnd.github.v3+json",
});

const req = async (token, path, opts = {}) => {
  const res = await fetch(`${BASE}${path}`, { headers: headers(token), ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `GitHub API error ${res.status}`);
  return data;
};

export const github = (token) => ({
  // Auth
  getUser: () => req(token, "/user"),

  // Repos
  listRepos: () => req(token, "/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator"),
  searchRepos: (q) => req(token, `/search/repositories?q=${encodeURIComponent(q)}+user:me&sort=updated`),

  // Branches
  getBranches: (owner, repo) => req(token, `/repos/${owner}/${repo}/branches`),
  createBranch: async (owner, repo, branchName, fromBranch = "main") => {
    // Get the SHA of the source branch
    const ref = await req(token, `/repos/${owner}/${repo}/git/ref/heads/${fromBranch}`);
    return req(token, `/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: ref.object.sha }),
    });
  },

  // File tree
  getTree: async (owner, repo, branch = "main") => {
    const branchData = await req(token, `/repos/${owner}/${repo}/branches/${branch}`);
    const treeSha = branchData.commit.commit.tree.sha;
    return req(token, `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`);
  },

  // File content
  getFile: (owner, repo, path, branch = "main") =>
    req(token, `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`),

  // Create or update a file (this IS a commit + push in one API call)
  saveFile: (owner, repo, path, content, sha, commitMsg, branch = "main") =>
    req(token, `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
      method: "PUT",
      body: JSON.stringify({
        message: commitMsg,
        content: btoa(unescape(encodeURIComponent(content))), // utf-8 safe base64
        sha: sha || undefined, // undefined = create new, sha = update existing
        branch,
      }),
    }),

  // Delete a file
  deleteFile: (owner, repo, path, sha, commitMsg, branch = "main") =>
    req(token, `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
      method: "DELETE",
      body: JSON.stringify({ message: commitMsg, sha, branch }),
    }),

  // Commit history
  getCommits: (owner, repo, branch = "main", path = "") =>
    req(token, `/repos/${owner}/${repo}/commits?sha=${branch}&path=${path}&per_page=20`),

  // Create repo
  createRepo: (name, description = "", isPrivate = false) =>
    req(token, "/user/repos", {
      method: "POST",
      body: JSON.stringify({ name, description, private: isPrivate, auto_init: true }),
    }),
});

// Detect language from file extension
export const detectLang = (filename = "") => {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map = {
    js: "javascript", jsx: "javascript", ts: "javascript", tsx: "javascript",
    mjs: "javascript", cjs: "javascript",
    py: "python", pyw: "python",
    java: "java",
    kt: "kotlin", kts: "kotlin",
    cpp: "cpp", cc: "cpp", cxx: "cpp", c: "cpp", h: "cpp", hpp: "cpp",
    cs: "csharp",
    go: "go",
    rs: "rust",
    rb: "ruby",
    php: "php",
    swift: "swift",
    dart: "dart",
    html: "html", htm: "html",
    css: "css", scss: "css", sass: "css", less: "css",
    json: "json",
    md: "markdown", mdx: "markdown",
    sql: "sql",
    sh: "shell", bash: "shell", zsh: "shell",
    yaml: "yaml", yml: "yaml",
    xml: "xml",
    toml: "toml",
    txt: "text",
  };
  return map[ext] || "text";
};

// File icon helper
export const fileIcon = (path = "", isDir = false) => {
  if (isDir) return "📁";
  const ext = path.split(".").pop()?.toLowerCase();
  const icons = {
    js: "🟨", jsx: "⚛️", ts: "🔷", tsx: "⚛️",
    py: "🐍", java: "☕", kt: "🎯", cpp: "⚙️", c: "⚙️",
    cs: "💜", go: "🐹", rs: "🦀", rb: "💎", php: "🐘",
    swift: "🧡", dart: "🎯", html: "🌐", css: "🎨",
    json: "📋", md: "📝", sql: "🗄️", sh: "🖥️",
    yaml: "⚙️", yml: "⚙️", xml: "📄", txt: "📄",
    png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️", svg: "🖼️",
    mp4: "🎬", mp3: "🎵", pdf: "📕", zip: "📦",
  };
  return icons[ext] || "📄";
};
