# Aether — Liquid Glass Markdown Editor

A sleek, responsive zero-gravity desktop workspace designed for writing Markdown without friction. Features frosted liquid glass aesthetics, real-time split previewing, fast directory navigation, and instant launch performance.

## Features

- **Near-Instant Launch & Zero-Flash Hydration**: Pre-hydrated theme selection (Dark/Light) directly in the native Chromium initialization lifecycle, preventing FOUC (flash of unstyled content) and eliminating cold startup bottlenecks.
- **Real-Time Split Preview**: Synchronized bidirectional scrolling between the editor gutter, raw markdown source, and compiled HTML output.
- **High-Performance Large File Handling**: Lazy-loads large documents (>128 KB) on demand and debounces live preview parsing for documents over 40 KB so typing remains butter-smooth at 60 FPS.
- **Dual VFS Directory Models**: Switch between **Fluid Stack View** (deep dive folder browsing) and **Classic Tree View** (expanding collapsible hierarchy).
- **Referenced / External Document Mode**: Drag & drop or "Open with" any standalone markdown file on your drive without polluting your primary workspace folder.
- **Rich Media & Paste Support**: Direct clipboard screenshot pasting (`Ctrl+V`), image drag-and-drop, workspace asset relative linking, and built-in Lightbox zoom preview.
- **Multi-Instance Isolation**: Secondary application instances run in safe isolated sessions to prevent Chromium SQLite database lockups.
- **Customizable Glassmorphism Themes**: Frosted glass panels over dynamic ambient background canvas orbs with dark and light presets.
- **GFM Markdown Tables**: Full support for GitHub Flavored Markdown tables with column alignments (left, center, right), responsive horizontal scrolling, quick toolbar insertion, keyboard shortcut (`Ctrl+Shift+T`), and liquid glass frosted styling.

<img width="1583" height="992" alt="image" src="https://github.com/user-attachments/assets/03df5711-a6fb-44e9-b12d-5a9af0a131ec" />

<img width="1583" height="992" alt="image" src="https://github.com/user-attachments/assets/8dfb46e1-3517-4466-96f2-dafa5b97232a" />



## How to Run from Source

1. Install dependencies:
   ```bash
   npm install
   ```
2. Launch the app:
   ```bash
   npm start
   ```

*(To launch with DevTools enabled, append `-- --devtools`)*

## Packaging

To compile and package into a standalone Windows x64 executable:
```bash
npm run build
```
The output will be placed in `dist/Aether-win32-x64/`.

## Windows File Associations (.md Integration)

To register Aether into Windows UI (for "Open with", context menu, and Windows Settings "Default Apps"):
```bash
npm run register-associations
```

To remove the registration:
```bash
npm run unregister-associations
```

### Setting Aether as Default Markdown Editor in Windows:
- **Option 1 (Context Menu)**: Right-click any `.md` file $\rightarrow$ **Open with Aether**.
- **Option 2 (Explorer "Open with")**: Right-click any `.md` file $\rightarrow$ **Open with** $\rightarrow$ **Choose another app** $\rightarrow$ select **Aether** $\rightarrow$ select **Always**.
- **Option 3 (Windows Settings)**: Open **Settings** $\rightarrow$ **Apps** $\rightarrow$ **Default apps** $\rightarrow$ search `.md` $\rightarrow$ set to **Aether**.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for full release history and milestone notes.
