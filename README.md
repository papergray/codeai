# ⟨/⟩ CodeAI IDE

A full mobile code editor with GitHub integration and AI assistance — built as an Android APK via GitHub Actions.

```
┌─────────────────────────────────────────────────────────┐
│ ⟨/⟩  owner/my-repo  🌿 main   ● 2 modified        ⚙   │
├──┬──────────┬────────────────────────────┬──────────────┤
│🗂│          │ 📄 App.jsx  📄 index.js × │              │
│🐙│ EXPLORER │─────────────────────────── │  🤖 AI       │
│🤖│  📁 src  │                            │  Assistant   │
│  │   📄App  │   C O D E M I R R O R      │              │
│  │   📄main │   (Syntax highlight,       │  Chat about  │
│  │  📄utils │    autocomplete, fold)     │  your code   │
│  │  📁 api  │                            │              │
│  │   📄gh   │                            │  [Insert] ↑  │
├──┴──────────┴────────────────────────────┴──────────────┤
│ javascript  Ln 42, Col 18  src/App.jsx   🌿 main  ⟳    │
└─────────────────────────────────────────────────────────┘
```

## ✨ Features

### Code Editor (CodeMirror 6)
- Syntax highlighting for 13 languages
- Autocomplete, code folding, bracket matching
- Line numbers with active line highlight
- Multi-tab editing with unsaved indicators
- Ctrl+S to commit & push

### GitHub Integration
- Connect with Personal Access Token
- Browse all your repositories
- Full file tree with search
- Edit any text file
- Create new files
- **Commit & Push** (all modified files in one click)
- **Pull** (sync from remote)
- Create & switch branches
- View commit history

### AI Assistant (Claude API)
- Generate, debug, explain, optimize code
- Context-aware (knows your current language)
- "Insert" button to add AI code directly into your file
- Chat history in session

### 16 Languages
JavaScript, TypeScript, Python, Java, Kotlin, C++, C#, Go, Rust, PHP, Ruby, SQL, HTML/CSS, Markdown, XML, and more.

---

## 🚀 Build APK via GitHub (No Setup Required)

### Step 1 — Fork this repo
Click **Fork** on this GitHub page.

### Step 2 — Enable Actions
Actions tab → **"Enable GitHub Actions"**

### Step 3 — Trigger a build
Actions → **📱 Build Android APK** → **Run workflow** → **Run workflow**

### Step 4 — Download (5–10 min)
Finished run → **Artifacts** section → Download **CodeAI-IDE-APK**

### Step 5 — Install
Unzip → transfer APK to Android → tap to install.
*(Allow "Install from unknown sources" in Settings → Security)*

---

## 📲 First Launch

### Connect GitHub
1. Tap 🐙 in the sidebar
2. Enter your Personal Access Token
   - github.com → Settings → Developer settings → Personal access tokens
   - Scopes: `repo` (full repository access)
3. Select a repository
4. Browse files in 🗂 Explorer

### Connect AI Assistant
1. Tap ⚙ (top right)
2. Paste your Claude API key (`sk-ant-...`)
   - Get it at: console.anthropic.com
3. Open 🤖 AI panel and start chatting

---

## 🛠 Local Development

```bash
npm install
npm run dev           # Browser preview at localhost:3000
npm run build         # Build for production

# First time Android setup (needs Android Studio or SDK)
npx cap add android
npx cap sync android
npx cap open android  # Opens Android Studio
```

### Prerequisites for local Android builds
- Node.js 18+
- Java 17+
- Android Studio (or Android SDK + Gradle)

---

## 📦 Release APKs

Tag a commit to auto-create a GitHub Release with the APK:

```bash
git tag v1.0.0
git push origin v1.0.0
```

---

## 🔒 Security

- GitHub PAT and Claude API key are stored **only in localStorage** on your device
- No backend server — all API calls go directly to GitHub/Anthropic
- The PAT is sent only to `api.github.com`

---

## 📁 Project Structure

```
codeai-ide/
├── src/
│   ├── App.jsx                 # Main IDE shell + state
│   ├── github.js               # GitHub REST API wrapper
│   ├── main.jsx                # React entry
│   └── components/
│       ├── Editor.jsx          # CodeMirror 6 editor
│       ├── FileTree.jsx        # File explorer sidebar
│       ├── GitPanel.jsx        # GitHub operations
│       └── AIPanel.jsx         # AI chat assistant
├── index.html
├── vite.config.js
├── capacitor.config.js
├── package.json
└── .github/
    └── workflows/
        └── build-apk.yml       # ← CI/CD: builds APK on push
```

---

## 📜 License

MIT
