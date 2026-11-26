# Technical Decisions Log

### 2026-11-16: Windows 11 Native Acrylic Desktop Blur
- **Context:** User requested the exact deep desktop blur shown in the Windows 11 Start menu (`backgroundMaterial: 'acrylic'`). CSS `backdrop-filter: blur(...)` in Chromium can only blur DOM elements inside the browser window, not the Windows OS desktop behind a transparent window.
- **Decision:** Configured `backgroundMaterial: 'acrylic'`, `backgroundColor: '#00000000'`, and `transparent: false` on Windows 11 in `src/main/index.js`, combined with a translucent tinted panel (`rgba(20, 22, 28, 0.42)` in dark mode) and `border-radius: 20px`.
- **Why:** Enables Windows 11's native Desktop Window Manager (DWM) Acrylic material, which heavily blurs whatever is behind the window on the desktop (wallpaper, open windows, taskbar) identical to the Windows 11 Start menu.

### 2026-11-16: User-Adjustable Window Resizing
- **Context:** Users needed flexibility to make the widget larger to see more links or more compact based on their monitor resolution and workflow.
- **Decision:** Set `resizable: true` on the Electron window, added boundary constraints (`minWidth: 320, minHeight: 400, maxWidth: 900, maxHeight: 1100`), and automatically saved user-resized dimensions to settings with a debounce timer.
- **Why:** Lets users comfortably resize the widget by dragging any edge or corner from the desktop, while remembering their preferred dimensions across app restarts without breaking the widget's layout.

### 2026-11-16: Big List Design Overhaul
- **Context:** The initial widget was very compact (320x420) with minimal affordances. Users needed better readability, quick tab-based segmentation (Work vs. Later), larger logo visibility, and a fast frictionless paste flow.
- **Decision:** Expanded window to 400x540 with 36px border radius, introduced a prominent 40px header, tab filters ("All", "Work", "Later"), 34px logos with domain-color-hashed fallback tiles, and a floating "+ Paste link" pill button with clipboard detection.
- **Why:** The expanded size accommodates rich metadata without cluttering the screen, while the floating pill button enables single-click saving directly from the clipboard without having to focus and paste into an input field.

### 2026-11-16: Theme Engine Driven by nativeTheme
- **Context:** Supporting Light, Dark, and System theme modes that seamlessly match the host OS (Windows & macOS).
- **Decision:** Controlled theme mode through Electron's `nativeTheme.themeSource` in the main process, persisting the user's choice in settings, and broadcasting updates via `nativeTheme.on('updated')`.
- **Why:** `nativeTheme.themeSource` directly hooks into Windows/macOS native dark mode APIs. In "system" mode, any change to the Windows or macOS color scheme automatically triggers `nativeTheme.on('updated')`, which pushes the resolved theme to the renderer without needing window reloads or fragile DOM media query polling.

### 2026-11-16: Electron + electron-vite over Tauri
- **Context:** Needed a frameless, transparent, always-on-top floating desktop widget with rapid iteration.
- **Decision:** Chose Electron with `electron-vite` rather than Tauri.
- **Why:** Electron provides mature, reliable cross-platform window transparency (`transparent: true`), stable multi-monitor coordinate math (`screen.getPrimaryDisplay()`), direct Chromium devtools inspection, and zero Rust toolchain requirement for quick feature addition.

### 2026-11-16: Dependency Pinning (cheerio@1.0.0-rc.12 & electron-store@8.2.0)
- **Context:** Electron 31 embeds Node.js 20. Modern versions of `cheerio` (1.2+) pull in `undici@7+`, which unconditionally attempts to require `node:sqlite` (introduced in Node.js 22.5+), crashing Electron on startup.
- **Decision:** Pinned `cheerio@1.0.0-rc.12` (pure HTML parser without Undici) and `electron-store@8.2.0` (CJS compatible), and enabled `externalizeDepsPlugin()` in `electron.vite.config.mjs`.
- **Why:** Eliminates the `node:sqlite` startup crash and reduces the main bundle size from 2.1 MB to 7 kB.
