# SaveLink — Agent Guide

Floating always-on-top glass desktop widget that saves links, auto-fetches title & logo, and persists items locally.

> **AGENT WORKFLOW:** Read `docs/PROGRESS.md` before starting work; update it before finishing.

## Tech Stack & Versions
- **Runtime & Framework:** Electron `31.7.7`, React `18.3.1`, Vite `5.4.11` via `electron-vite 2.3.0`
- **Language & Styling:** JavaScript only (no TypeScript), Plain CSS with Windows 11 Acrylic blur tokens (Light, Dark, System)
- **Data & Scraping:** `better-sqlite3` (planned; currently `electron-store 8.2.0`), `cheerio 1.0.0-rc.12`

## Commands
```bash
npm install              # Install dependencies
npm run dev              # Start electron-vite development server with HMR
npm run build            # Compile main, preload, and renderer into /out
npx electron-rebuild     # Rebuild native modules (e.g. better-sqlite3) for Electron
```

## Folder Map
- `electron.vite.config.mjs`: Bundler config (externalizes main deps, React plugin)
- `package.json`: Project manifest (`name: "savelink"`, `productName: "SaveLink"`)
- `src/main/index.js`: Main process: window lifecycle (user-adjustable size, min 320x400, max 900x1100, 16px margin), nativeTheme, IPC handlers, metadata scraper, storage
- `src/preload/index.js`: Secure bridge exposing `window.api` (`contextIsolation: true`, `nodeIntegration: false`)
- `src/renderer/index.html`: Web template with CSP (`img-src 'self' https: data:;`)
- `src/renderer/src/main.jsx`: React DOM entry point
- `src/renderer/src/App.jsx`: State orchestrator (switches between CollapsedWidget and OpenContainer)
- `src/renderer/src/CollapsedWidget.jsx`: Collapsed screen notch dock component (drag grip, ⊞, 💼, 🕒, `+` buttons)
- `src/renderer/src/CollapsedWidget.css`: Isolated styles for collapsed screen notch dock
- `src/renderer/src/OpenContainer.jsx`: Expanded SaveLink compartment (header, theme switch, input bar, tabs, link cards)
- `src/renderer/src/OpenContainer.css`: Isolated styles for expanded acrylic compartment & pastel cards
- `src/renderer/src/index.css`: Windows 11 Acrylic frosted surface tokens, reset & root styles
- `docs/PROGRESS.md`: Current sprint status, handoff checklist, next tasks
- `docs/DECISIONS.md`: Architectural decisions and technical log

## Architecture Rules
1. **Separation of Concerns:** All network fetching (`fetchMeta`) and storage/DB operations happen strictly in the main process.
2. **IPC Boundary:** Renderer talks to main exclusively via `src/preload/index.js` `contextBridge`.
3. **Security:** `contextIsolation: true` and `nodeIntegration: false` must never be disabled.
4. **SQL Security:** All SQLite queries must use prepared statements (no raw string interpolation).
5. **Zero Bloat:** No external UI libraries, no TypeScript, no CDN assets, no external icon packages (inline SVGs only).

## IPC Channel Reference
| Channel | Type | Direction | Payload (Input) | Return / Output | Description |
|---|---|---|---|---|---|
| `close-app` | Send | Renderer &rarr; Main | `void` | `void` | Quits the application (`app.quit()`) |
| `get-dock-state` | Invoke | Renderer &rarr; Main | `void` | `{ collapsed, dockSide }` | Returns collapse state and current edge side |
| `expand-window` | Invoke | Renderer &rarr; Main | `targetTab?: string` | `void` | Restores window to full size |
| `collapse-window` | Invoke | Renderer &rarr; Main | `void` | `void` | Collapses window to notebook tab strip on screen edge |
| `dock-state-changed`| Event | Main &rarr; Renderer | `{ collapsed, dockSide, targetTab }` | N/A | Broadcasts collapse/expand transitions |
| `get-theme` | Invoke | Renderer &rarr; Main | `void` | `{ mode, resolved }` | Returns active theme mode and resolved OS color |
| `set-theme` | Invoke | Renderer &rarr; Main | `mode: string` | `{ mode, resolved }` | Sets `nativeTheme.themeSource`, persists in settings |
| `theme-changed`| Event | Main &rarr; Renderer | `{ mode, resolved }` | N/A | Broadcasts OS or user theme changes |
| `get-links` | Invoke | Renderer &rarr; Main | `void` | `Array<Link>` | Returns all saved link objects |
| `add-link` | Invoke | Renderer &rarr; Main | `url: string, tab?: string` | `Link` | Saves immediately with status 'loading', fetches meta in background |
| `delete-link` | Invoke | Renderer &rarr; Main | `id: string` | `Array<Link>` | Deletes item by ID, returns updated list |
| `open-link` | Invoke | Renderer &rarr; Main | `url: string` | `void` | Opens link in default browser (`shell.openExternal`) |
| `update-link-tab` | Invoke | Renderer &rarr; Main | `id: string, tab: string \| null` | `Link` | Updates link tab category and broadcasts update |
| `show-link-context-menu`| Send | Renderer &rarr; Main | `{ id, url, currentTab }` | `void` | Opens native context menu (Open, Copy, Move to Tab, Delete) |
| `link-updated`| Event | Main &rarr; Renderer | `updatedLink: Link` | N/A | Broadcasts background metadata updates |
| `link-added`| Event | Main &rarr; Renderer | `newLink: Link` | N/A | Broadcasts new link added via shortcut/clipboard |
| `link-deleted`| Event | Main &rarr; Renderer | `deletedId: string` | N/A | Broadcasts deletion from context menu |

## Database Schema
```sql
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  logo TEXT NOT NULL,
  status TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  tab TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```
*(Currently persisted in `electron-store`; SQLite table schema ready for migration).*

## Theme Tokens & Styling
- **Windows 11 Acrylic:** `backgroundMaterial: 'acrylic'` with `backgroundColor: '#00000000'`.
- **Light:** `--panel: rgba(240, 244, 255, 0.52)`, `--card: rgba(255, 255, 255, 0.58)`, `--text: #0d0f14`
- **Dark:** `--panel: rgba(20, 22, 28, 0.42)`, `--card: rgba(255, 255, 255, 0.08)`, `--text: #f4f5f8`
- **Input Bar:** Acrylic pill with link icon, Enter/click Save support, and invalid URL shake feedback.
- **Window Sizing:** Fixed widget proportion (expanded 380x520, collapsed notch 62x260, `resizable: false`).
- **Collapsed Notch:** True transparent edge notch (`transparent: true, hasShadow: false`) flush with screen bezel.

## Do Not List
- Do NOT convert project to TypeScript or add UI component/icon libraries.
- Do NOT disable `contextIsolation` or expose `ipcRenderer` directly to `window`.
- Do NOT re-enable manual window edge resizing.
