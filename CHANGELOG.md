# Changelog

All notable changes to the **Aether** Liquid Glass Markdown Editor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.6.1] - 2026-10-29

### Added
- **GitHub Flavored Markdown (GFM) Table Engine**: Full native parsing for markdown tables with or without outer boundary pipes (`|`).
- **Column Alignments**: Full support for left (`:---`), center (`:---:`), and right (`---:`) alignments using clean inline CSS.
- **Escaped Pipes & Inline Code**: Robust row scanner that prevents escaped pipes (`\|`) and code expressions containing pipes (e.g. `` `a | b` ``) from splitting columns.
- **Rich Inline Table Content**: Support for **bold**, *italic*, strikethrough, images, anchor links, and `<br>` multi-line cell linebreaks.
- **Liquid Glass Table Styling**: Semi-transparent table containers with frosted borders, subtle backdrop blur, Outfit font headers, cyan glowing row hover states, and alternating zebra stripes.
- **Horizontal Overflow Scrolling**: Automatic smooth horizontal scroll wrapper (`overflow-x: auto`) for wide datasets, preserving split pane layouts on all screen sizes.
- **Light Theme Table Styling**: Dedicated high-contrast borders, clean backgrounds, and tailored row hover effects in Light mode.
- **Toolbar Quick-Insert**: Added **📊 Table** action button in the main application header.
- **Keyboard Shortcut**: Added global <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd> hotkey to insert a markdown table template at the current cursor position.
- **Interactive Cheat Sheet & Guide**: Updated the help modal (`?`) and `Formatting_Guide.md` with table syntax examples and feature breakdown.
- **Standalone HTML Export Styling**: Exported HTML files now include responsive, clean table stylesheets.

### Fixed
- **Block Element Paragraph Isolation**: Updated compiler block tag boundaries so tables and adjacent block-level elements are never mistakenly wrapped in `<p>` tags.
- **List Boundary Parsing**: Fixed a greedy whitespace regex issue where consecutive list items could swallow trailing line breaks and merge into adjacent blocks.

---

## [1.6.0] - 2026-10-27

### Added
- **Zero-Flash Theme Pre-Hydration**: Pre-hydrates theme selection (Dark/Light) directly in the native Chromium initialization lifecycle via preload context bridge arguments, eliminating FOUC (flash of unstyled content) on startup.
- **Dual VFS Directory Models**: Switch seamlessly between **Fluid Stack View** (deep-dive folder browsing with breadcrumb navigation) and **Classic Tree View** (expanding collapsible hierarchy).
- **Referenced / External Document Mode**: Open standalone `.md` files from anywhere on disk without polluting the active workspace directory, complete with a floating "Referenced File" action bubble and Explorer reveal.
- **Rich Media & Paste Support**: Direct clipboard screenshot pasting (<kbd>Ctrl</kbd> + <kbd>V</kbd>), desktop drag-and-drop for images, workspace asset relative linking, and built-in Lightbox zoom modal.
- **Windows File Associations**: Added PowerShell registration scripts (`register-file-associations.ps1` and `unregister-file-associations.ps1`) for Windows context menu and "Open with" integration.
- **Multi-Instance Session Isolation**: Secondary application instances run in isolated Chromium user-data partitions to prevent SQLite database lockups.
- **High-Performance Large File Handling**: Lazy-loads large documents (>128 KB) on demand and debounces live preview parsing for documents over 40 KB for consistent 60 FPS typing.
- **Home Guides Workspace**: Added a one-click **🏠 Guides** button to return to the starter documentation sandbox and reset guide templates.

### Changed
- Refactored Electron main-to-renderer IPC layer into batched startup state queries for faster window paint times.
- Optimized line number gutter rendering with line count caching to eliminate redundant DOM node reallocations.

---

## [1.5.3] - 2026-06-14

### Added
- **Liquid Glass Aesthetic**: Translucent frosted glass workspace panels floating over dynamic ambient background canvas orbs (`orbs.js`).
- **Real-Time Split Preview**: Live markdown compilation alongside editor input with synchronized bidirectional scrolling.
- **Triple Viewport Modes**: Dedicated **Edit** (editor only), **Split** (side-by-side), and **Read** (full-width preview) modes.
- **Document Management**: Create, rename, delete, and search documents and folders within the workspace.
- **Markdown Typography Engine**: Custom compiled output for headings, blockquotes, lists, inline formatting, code spans, and syntax-highlighted code blocks with one-click copy buttons.
- **Line Wrap Toggle**: Instant toggle between soft-wrapped and horizontally scrollable code views.
- **Theme Switcher**: Dark and Light theme presets with persistent local state.
- **Export Capabilities**: Export documents as raw Markdown (`.md`) or standalone compiled HTML layouts (`.html`).
- **Markdown Cheat Sheet**: Modal reference guide covering core formatting syntax.
