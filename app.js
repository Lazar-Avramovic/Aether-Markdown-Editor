// Aether: Main Application Controller

class AetherApp {
  constructor() {
    this.documents = [];
    this.activeDocId = null;
    this.compiler = new MarkdownCompiler();
    
    // DOM Cache
    this.fileList = document.getElementById('file-list');
    this.textarea = document.getElementById('editor-textarea');
    this.preview = document.getElementById('preview-content');
    this.gutter = document.getElementById('line-numbers-gutter');
    this.docNameInput = document.getElementById('doc-name-input');
    
    this.newDocBtn = document.getElementById('new-doc-btn');
    this.newFolderBtn = document.getElementById('new-folder-btn');
    this.searchInput = document.getElementById('search-input');
    
    this.btnExportMd = document.getElementById('btn-export-md');
    this.btnExportHtml = document.getElementById('btn-export-html');
    this.btnHelp = document.getElementById('btn-help');
    this.btnLineWrap = document.getElementById('btn-line-wrap');
    this.btnInsertTable = document.getElementById('btn-insert-table');
    this.btnInsertImage = document.getElementById('btn-insert-image');
    this.imageFileInput = document.getElementById('image-file-input');
    this.btnThemeToggle = document.getElementById('btn-theme-toggle');
    this.btnSidebarView = document.getElementById('btn-sidebar-view');
    this.btnOpenWorkspace = document.getElementById('btn-open-workspace');
    this.btnHomeWorkspace = document.getElementById('btn-home-workspace');
    this.btnAutoRestore = document.getElementById('btn-auto-restore');
    
    this.btnModeEdit = document.getElementById('btn-mode-edit');
    this.btnModeSplit = document.getElementById('btn-mode-split');
    this.btnModeRead = document.getElementById('btn-mode-read');
    
    this.sidebarNavHeader = document.getElementById('sidebar-nav-header');
    this.btnNavBack = document.getElementById('btn-nav-back');
    this.breadcrumbPath = document.getElementById('breadcrumb-path');
    
    this.modalHelp = document.getElementById('modal-help');
    this.modalClose = document.getElementById('modal-close');
    this.modalLightbox = document.getElementById('modal-lightbox');
    this.lightboxImg = document.getElementById('lightbox-img');
    this.lightboxTitle = document.getElementById('lightbox-title');
    this.lightboxClose = document.getElementById('lightbox-close');
    this.lightboxCopyBtn = document.getElementById('lightbox-copy-btn');
    this.toastContainer = document.getElementById('toast-container');
    
    this.saveIndicator = document.getElementById('save-indicator');
    this.wordCountNode = document.getElementById('word-count');
    this.charCountNode = document.getElementById('char-count');
    this.workspacePanel = document.getElementById('main-workspace-panel');
    this.workspacePathDisplay = document.getElementById('workspace-path-display');
    
    // Floating bubble elements for referenced/dropped files
    this.referencedFiles = [];
    this.floatingDocBubble = document.getElementById('floating-doc-bubble');
    this.floatingBubblePath = document.getElementById('floating-bubble-path');
    this.btnBubbleReveal = document.getElementById('btn-bubble-reveal');
    this.btnBubbleClose = document.getElementById('btn-bubble-close');
    
    // View Settings & Flags
    this.lineWrapEnabled = false;
    this.theme = 'dark';
    this.sidebarLayoutMode = 'stack'; // 'stack' (Fluid Stack) or 'tree' (Classic Tree)
    this.currentDirPath = '/'; // Current directory in Stack navigation
    this.expandedFolders = new Set(['/Guides']); // Collapsible folders expanded

    // Desktop Filesystem properties
    this.isDesktop = false;
    this.workspaceRootPath = '';
    this.isPrimarySession = true;

    // Create debounced save function (300ms delay)
    this.debouncedSave = this.debounce(() => this.saveToStorage(), 300);
    // Debounce heavy markdown preview compilation for large files (>50KB)
    this.debouncedCompileLargePreview = this.debounce((content, docDir) => {
      this.preview.innerHTML = this.compiler.compile(content, docDir);
    }, 150);

    this.init();
  }

  async init() {
    // 1. Detect environment and apply immediate synchronous UI state BEFORE any async IPC awaits
    this.isDesktop = !!(window.aetherAPI && window.aetherAPI.isElectron());
    const syncCfg = (this.isDesktop && window.aetherAPI.getSyncStartupConfig) ? window.aetherAPI.getSyncStartupConfig() : null;

    if (syncCfg && syncCfg.appVersion) {
      const badge = document.querySelector('.logo-badge');
      if (badge) badge.innerText = `V${syncCfg.appVersion}`;
    }

    // Apply Theme immediately on first tick (no flash, no IPC wait)
    this.theme = (syncCfg && syncCfg.theme) || localStorage.getItem('aether_theme') || 'dark';
    this.setTheme(this.theme, true);

    // Apply Sidebar view layout immediately
    this.sidebarLayoutMode = (syncCfg && syncCfg.sidebarLayout) || localStorage.getItem('aether_sidebar_layout') || 'stack';
    this.updateSidebarViewButtonLabel();

    // Apply Editor/Preview view mode split immediately
    let savedLayoutMode = (syncCfg && syncCfg.layoutMode) || localStorage.getItem('aether_layout_mode') || 'split';
    if (savedLayoutMode !== 'edit' && savedLayoutMode !== 'split' && savedLayoutMode !== 'read') {
      savedLayoutMode = 'split';
    }
    this.setViewMode(savedLayoutMode, true);

    // Load autoRestore preference setting
    this.autoRestore = localStorage.getItem('aether_auto_restore') === 'true';
    this.updateAutoRestoreButtonLabel();

    // Bind event listeners and resizer immediately so UI is responsive right away
    this.setupEventListeners();
    this.setupSplitResizer();
    initScrollSync(this.textarea, this.preview, this.gutter);

    if (this.isDesktop) {
      if (this.btnExportMd) this.btnExportMd.style.display = 'none';
      if (this.btnExportHtml) this.btnExportHtml.style.display = 'none';
      if (this.btnOpenWorkspace) this.btnOpenWorkspace.style.display = 'inline-block';

      // Fetch complete startup state in a single batched IPC call
      let initState = null;
      try {
        initState = await window.aetherAPI.getInitialState();
      } catch (err) {
        console.error("Aether: Error loading initial state:", err);
      }

      const sharedSettings = initState ? initState.sharedSettings : null;
      const isPrimary = initState ? initState.isPrimary : true;
      this.isPrimarySession = isPrimary;
      this.defaultWorkspace = (initState && initState.defaultWorkspace) || await window.aetherAPI.getDefaultWorkspace();

      if (initState && initState.appVersion) {
        const badge = document.querySelector('.logo-badge');
        if (badge) badge.innerText = `V${initState.appVersion}`;
      }

      if (sharedSettings) {
        if (sharedSettings.theme && sharedSettings.theme !== this.theme) {
          this.setTheme(sharedSettings.theme, true);
        }
        if (sharedSettings.sidebarLayout && sharedSettings.sidebarLayout !== this.sidebarLayoutMode) {
          this.sidebarLayoutMode = sharedSettings.sidebarLayout;
          localStorage.setItem('aether_sidebar_layout', this.sidebarLayoutMode);
          this.updateSidebarViewButtonLabel();
        }
        if (sharedSettings.layoutMode && sharedSettings.layoutMode !== this.currentMode) {
          this.setViewMode(sharedSettings.layoutMode, true);
        }
        if (sharedSettings.autoRestore !== undefined) {
          this.autoRestore = sharedSettings.autoRestore;
          localStorage.setItem('aether_auto_restore', this.autoRestore ? 'true' : 'false');
          this.updateAutoRestoreButtonLabel();
        }
        
        // Restore session path and document ONLY if this is the primary session
        if (isPrimary && sharedSettings.primarySession) {
          if (sharedSettings.primarySession.workspacePath) {
            localStorage.setItem('aether_workspace_path', sharedSettings.primarySession.workspacePath);
          }
          if (sharedSettings.primarySession.activeDocId) {
            localStorage.setItem('aether_active_doc_id', sharedSettings.primarySession.activeDocId);
          }
        }
      }

      // Restore persisted referenced/dropped files in parallel (metadata first if huge, or concurrent read)
      let persistedRefPaths = [];
      try {
        if (sharedSettings && Array.isArray(sharedSettings.referencedFiles)) {
          persistedRefPaths = sharedSettings.referencedFiles;
        } else {
          const stored = localStorage.getItem('aether_referenced_files');
          if (stored) persistedRefPaths = JSON.parse(stored);
        }
      } catch (e) {}

      if (Array.isArray(persistedRefPaths) && persistedRefPaths.length > 0) {
        const uniquePaths = [...new Set(persistedRefPaths.filter(Boolean))];
        const refResults = await Promise.all(
          uniquePaths.map(fullPath => window.aetherAPI.readFileAbsolute(fullPath).catch(() => null))
        );
        refResults.forEach((fileData) => {
          if (fileData && fileData.fullPath) {
            const b64Key = btoa(unescape(encodeURIComponent(fileData.fullPath))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
            this.referencedFiles.push({
              id: 'ref_' + b64Key,
              name: fileData.name,
              fullPath: fileData.fullPath,
              dirPath: fileData.dir,
              content: fileData.content,
              isExternal: true,
              isFolder: false,
              updatedAt: fileData.updatedAt
            });
          }
        });
      }

      const launchFile = initState ? initState.launchFile : null;

      if (launchFile && launchFile.filePath) {
        this.workspaceRootPath = launchFile.dirPath;
        this.targetStartupDoc = launchFile.fileName;
        await this.loadWorkspaceFromDisk(true);
      } else {
        const lastWorkspace = isPrimary ? (localStorage.getItem('aether_workspace_path') || '') : '';
        const normDefault = this.normalizePath(this.defaultWorkspace);
        const normLast = this.normalizePath(lastWorkspace);
        
        if (this.autoRestore && normLast && normLast !== normDefault) {
          this.workspaceRootPath = lastWorkspace;
          await this.loadWorkspaceFromDisk(true);
        } else {
          this.workspaceRootPath = this.defaultWorkspace;
          await this.loadWorkspaceFromDisk(true);
          
          if (isPrimary && normLast && normLast !== normDefault) {
            this.showRestoreSessionBanner(lastWorkspace);
          }
        }
      }
    } else {
      if (this.btnOpenWorkspace) this.btnOpenWorkspace.style.display = 'none';
      this.loadDocuments();
      this.checkVFSInitialization();
      this.selectActiveDocumentOnStartup();
      this.updateWorkspacePathDisplay();
      this.renderFileList();
    }
  }

  // Open any disk folder as the active workspace
  async openWorkspaceFolder(folderPath) {
    if (!folderPath) return;
    try {
      this.currentDirPath = '/';
      this.workspaceRootPath = folderPath;
      localStorage.setItem('aether_workspace_path', folderPath);
      await this.loadWorkspaceFromDisk(false);
      await this.saveSharedSettings();
      this.showToast(`Opened workspace: ${folderPath}`, "success");
    } catch (err) {
      console.error("Failed to open workspace folder:", err);
      this.showToast("Failed to open workspace folder", "error");
    }
  }

  // Load files from physical disk
  async loadWorkspaceFromDisk(isSilentStartup = false) {
    try {
      this.currentDirPath = '/';
      if (!isSilentStartup) {
        this.showToast(`Loading workspace: ${this.workspaceRootPath}`, "success");
      }
      const list = await window.aetherAPI.readDirectory(this.workspaceRootPath);
      this.documents = list;
      
      const defaultWorkspace = this.defaultWorkspace || await window.aetherAPI.getDefaultWorkspace();
      this.defaultWorkspace = defaultWorkspace;
      const normDefault = this.normalizePath(defaultWorkspace);
      const normCurrent = this.normalizePath(this.workspaceRootPath);
      
      const isDefault = this.isDesktop && (normCurrent === normDefault);
      if (this.newDocBtn) {
        this.newDocBtn.disabled = isDefault;
        this.newDocBtn.style.opacity = isDefault ? '0.5' : '1';
        this.newDocBtn.style.pointerEvents = isDefault ? 'none' : 'auto';
      }
      if (this.newFolderBtn) {
        this.newFolderBtn.disabled = isDefault;
        this.newFolderBtn.style.opacity = isDefault ? '0.5' : '1';
        this.newFolderBtn.style.pointerEvents = isDefault ? 'none' : 'auto';
      }
      
      if (normCurrent === normDefault) {
        await this.checkDesktopVFSInitialization(false);
      }
      
      await this.selectActiveDocumentOnStartup();
      this.renderFileList();
      this.updateWorkspacePathDisplay();
    } catch (err) {
      console.error("Failed to read workspace folder on disk", err);
      this.showToast("Failed to open selected workspace folder", "error");
    }
  }

  // Provision default guides on disk only when missing or explicitly refreshed
  async checkDesktopVFSInitialization(forceOverwrite = false) {
    let modified = false;

    // 0. Ensure starter assets are available in default workspace
    if (window.aetherAPI && window.aetherAPI.copyDefaultAssets) {
      await window.aetherAPI.copyDefaultAssets(this.workspaceRootPath);
    }

    // 1. Check folder /Guides
    let guidesFolder = this.documents.find(d => d.isFolder && d.path === '/' && d.name === 'Guides');
    if (!guidesFolder) {
      await window.aetherAPI.createFolder('/', 'Guides');
      modified = true;
    }

    const hasWelcome = this.documents.some(d => !d.isFolder && d.path === '/Guides' && d.name.toLowerCase() === 'welcome_guide.md');
    const hasFormatting = this.documents.some(d => !d.isFolder && d.path === '/Guides' && d.name.toLowerCase() === 'formatting_guide.md');

    if (!forceOverwrite && !modified && hasWelcome && hasFormatting) {
      return; // Already initialized, skip redundant disk writes & re-scans on every launch!
    }

    const welcomeContent = `# Welcome to Aether 🌌 (v1.6.0)

Aether is a premium, zero-gravity workspace featuring a Liquid Glass styling system and a Hierarchical Virtual File System (VFS).

## 1. Design Presets: Light Glass Mode
- Use the **🌓 Theme Toggle** in the header to switch styles.
- Canvas backdrops transition to a frosted light gray (\`#eef2f7\`) in Light mode.
- Glass panels update to \`background: rgba(255, 255, 255, 0.45)\` with high-contrast text to maintain AAA guidelines.

## 2. Directory Navigation: VFS Models
Toggle between navigation models using the **View Mode button** at the bottom of the sidebar.
- **Fluid Stack View**: Shows files and folders in the current directory level. Click a folder to navigate down. Use the back arrow button to navigate up.
- **Classic Tree View**: Displays a vertically expanding tree directory structure with foldout arrows.

## 3. Rich Image Support 🖼️
Aether supports full Markdown image rendering, clipboard screenshots, and drag-and-drop:
- Paste screenshots directly from your clipboard with **Ctrl+V**!
- Drag image files from your computer and drop them into the editor.
- Click any image in the preview to zoom in with the **Lightbox** modal!

## 4. Help & Sandbox
- Default guides (\`welcome_guide.md\`, \`Formatting_Guide.md\`) are kept clean and read-only in this introductory workspace.
- To write your own documents, click the **📂 Open** button in the sidebar and select any folder on your hard drive!
`;

    const formattingContent = `# Formatting Guide 📝

Here is a quick cheat sheet for writing Markdown in Aether.

## Headings
# Header 1
## Header 2
### Header 3

## Inline Styling
- **Bold Typography**: Wrap text in \`**double asterisks**\`
- *Italic Accent*: Wrap text in \`*single asterisks*\`
- ~~Strikethrough~~: Wrap text in \`~~double tildes~~\`

## Blockquotes
> "This is a premium quote styled with light neon left borders."

## Code Formats
Use single backticks for \`const system = "Aether";\` inline code.
Use triple backticks for blocks:
\`\`\`javascript
function calculateOrbs() {
  return 5;
}
\`\`\`

## Images 🖼️
Aether includes complete image support with responsive layout, liquid glass borders, and interactive lightbox zoom.

### Remote Images
![Liquid Atmosphere](https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80 "Liquid Atmosphere Art")

### Image Resizing
Resize images with \`![Alt|WidthxHeight](url)\` or \`![Alt|Width](url)\`:
![Resized Tech Visual|420](https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80 "Retro Tech Art")

### Local Workspace Images
Reference images relative to your document on disk:
\`\`\`markdown
![Aether Logo](../assets/logo.png)
\`\`\`
![Aether Logo|260](../assets/logo.png "Aether Logo")

### Interactive Features
- **Click to Zoom**: Click any image in the preview pane to open the high-res Lightbox modal.
- **Clipboard Paste**: Paste screenshots directly from your clipboard (**Ctrl+V**).
- **Drag & Drop**: Drag image files from Windows Explorer right into the editor.
- **Insert Button**: Click **🖼️ Image** in the header or press **Ctrl+Shift+I**.

## Tables 📊
Aether provides full support for GitHub Flavored Markdown (GFM) tables with custom alignments, liquid glass borders, and responsive horizontal scrolling.

| Feature | Type | Status |
| :--- | :---: | ---: |
| Left-aligned column | Text | Ready |
| Centered column | Icon | ✨ Active |
| Right-aligned column | Numeric | \$1,250.00 |

### Inline Elements in Tables
You can include **bold**, *italic*, \`code\`, and [links](https://github.com) directly inside table cells:

| Syntax | Description | Example |
| :--- | :--- | :--- |
| \`**Bold**\` | Strong typography | **Priority High** |
| \`*Italic*\` | Emphasized typography | *Review needed* |
| \`\`Code\`\` | Inline code / commands | \`git commit -m "fix"\` |
| \`<br>\` | Multi-line row cell | Line 1<br>Line 2 |
`;

    // 2. Overwrite/save welcome_guide.md on startup
    await window.aetherAPI.saveFile('/Guides', 'welcome_guide.md', welcomeContent);
    // 3. Overwrite/save Formatting_Guide.md on startup
    await window.aetherAPI.saveFile('/Guides', 'Formatting_Guide.md', formattingContent);

    // Refresh list from disk
    const list = await window.aetherAPI.readDirectory(this.workspaceRootPath);
    this.documents = list;
  }

  async selectActiveDocumentOnStartup() {
    const activeId = localStorage.getItem('aether_active_doc_id');
    const filesOnly = this.documents.filter(d => !d.isFolder);
    let docToSelect = null;
    if (this.targetStartupDoc) {
      docToSelect = filesOnly.find(d => d.name.toLowerCase() === this.targetStartupDoc.toLowerCase());
      this.targetStartupDoc = null;
    }
    if (!docToSelect) {
      docToSelect = (this.referencedFiles && this.referencedFiles.find(d => d.id === activeId)) ||
                    filesOnly.find(d => d.id === activeId) || 
                    filesOnly.find(d => d.name === 'welcome_guide.md') || 
                    filesOnly[0] ||
                    (this.referencedFiles && this.referencedFiles[0]);
    }
    if (docToSelect) {
      if (docToSelect.path && docToSelect.path !== '/') {
        this.currentDirPath = docToSelect.path;
      }
      await this.selectDocument(docToSelect.id);
    } else {
      const normDefault = this.normalizePath(this.defaultWorkspace || '');
      const normCurrent = this.normalizePath(this.workspaceRootPath || '');
      const isDefault = this.isDesktop && (normCurrent === normDefault);

      if (!isDefault && this.isDesktop) {
        // Automatically create a new untitled document so user can immediately write in new folder
        await this.createNewDocument();
        return;
      }

      this.activeDocId = null;
      this.textarea.value = '';
      this.docNameInput.value = '';
      this.preview.innerHTML = '';
      this.textarea.readOnly = true;
      this.docNameInput.disabled = true;
      this.updateFloatingDocBubble(null);
      this.updateCounts();
      updateLineNumbers(this.textarea, this.gutter);
    }
  }

  // Load from LocalStorage VFS (Web fallback)
  loadDocuments() {
    try {
      const stored = localStorage.getItem('aether_documents');
      if (stored) {
        this.documents = JSON.parse(stored);
      } else {
        this.loadTemplates();
      }
    } catch (e) {
      console.error("Failed to load documents", e);
      this.showToast("Failed to load saved VFS documents from cache.", "error");
      this.loadTemplates();
    }
  }

  // Initial provision for system directories and guide files (Web fallback)
  checkVFSInitialization() {
    let modified = false;

    // 1. Ensure /Guides directory exists
    let guidesFolder = this.documents.find(d => d.isFolder && d.path === '/' && d.name === 'Guides');
    if (!guidesFolder) {
      guidesFolder = {
        id: 'dir_guides',
        name: 'Guides',
        path: '/',
        isFolder: true,
        isReadOnly: false,
        updatedAt: new Date().toISOString()
      };
      this.documents.push(guidesFolder);
      modified = true;
    }

    const welcomeContent = `# Welcome to Aether 🌌 (v1.6.0)

Aether is a premium, zero-gravity workspace featuring a Liquid Glass styling system and a Hierarchical Virtual File System (VFS).

## 1. Design Presets: Light Glass Mode
- Use the **🌓 Theme Toggle** in the header to switch styles.
- Canvas backdrops transition to a frosted light gray (\`#eef2f7\`) in Light mode.
- Glass panels update to \`background: rgba(255, 255, 255, 0.45)\` with high-contrast text to maintain AAA guidelines.

## 2. Directory Navigation: VFS Models
Toggle between navigation models using the **View Mode button** at the bottom of the sidebar.
- **Fluid Stack View**: Shows files and folders in the current directory level. Click a folder to navigate down. Use the back arrow button to navigate up.
- **Classic Tree View**: Displays a vertically expanding tree directory structure with foldout arrows.

## 3. Rich Image Support 🖼️
Aether supports full Markdown image rendering, clipboard screenshots, and drag-and-drop:
- Paste screenshots directly from your clipboard with **Ctrl+V**!
- Drag image files from your computer and drop them into the editor.
- Click any image in the preview to zoom in with the **Lightbox** modal!

## 4. Help & Sandbox
- Default guides (\`welcome_guide.md\`, \`Formatting_Guide.md\`) are kept clean and read-only in this introductory workspace.
- To write your own documents, click the **📂 Open** button in the sidebar and select any folder on your hard drive!
`;

    const formattingContent = `# Formatting Guide 📝

Here is a quick cheat sheet for writing Markdown in Aether.

## Headings
# Header 1
## Header 2
### Header 3

## Inline Styling
- **Bold Typography**: Wrap text in \`**double asterisks**\`
- *Italic Accent*: Wrap text in \`*single asterisks*\`
- ~~Strikethrough~~: Wrap text in \`~~double tildes~~\`

## Blockquotes
> "This is a premium quote styled with light neon left borders."

## Code Formats
Use single backticks for \`const system = "Aether";\` inline code.
Use triple backticks for blocks:
\`\`\`javascript
function calculateOrbs() {
  return 5;
}
\`\`\`

## Images 🖼️
Aether includes complete image support with responsive layout, liquid glass borders, and interactive lightbox zoom.

### Remote Images
![Liquid Atmosphere](https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80 "Liquid Atmosphere Art")

### Image Resizing
Resize images with \`![Alt|WidthxHeight](url)\` or \`![Alt|Width](url)\`:
![Resized Tech Visual|420](https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80 "Retro Tech Art")

### Local Workspace Images
Reference images relative to your document on disk:
\`\`\`markdown
![Aether Logo](../assets/logo.png)
\`\`\`
![Aether Logo|260](../assets/logo.png "Aether Logo")

### Interactive Features
- **Click to Zoom**: Click any image in the preview pane to open the high-res Lightbox modal.
- **Clipboard Paste**: Paste screenshots directly from your clipboard (**Ctrl+V**).
- **Drag & Drop**: Drag image files from Windows Explorer right into the editor.
- **Insert Button**: Click **🖼️ Image** in the header or press **Ctrl+Shift+I**.

## Tables 📊
Aether provides full support for GitHub Flavored Markdown (GFM) tables with custom alignments, liquid glass borders, and responsive horizontal scrolling.

| Feature | Type | Status |
| :--- | :---: | ---: |
| Left-aligned column | Text | Ready |
| Centered column | Icon | ✨ Active |
| Right-aligned column | Numeric | \$1,250.00 |

### Inline Elements in Tables
You can include **bold**, *italic*, \`code\`, and [links](https://github.com) directly inside table cells:

| Syntax | Description | Example |
| :--- | :--- | :--- |
| \`**Bold**\` | Strong typography | **Priority High** |
| \`*Italic*\` | Emphasized typography | *Review needed* |
| \`\`Code\`\` | Inline code / commands | \`git commit -m "fix"\` |
| \`<br>\` | Multi-line row cell | Line 1<br>Line 2 |
`;

    // 2. Overwrite / regenerate welcome_guide.md on startup
    let welcomeFile = this.documents.find(d => !d.isFolder && d.path === '/Guides' && d.id === 'welcome_guide.md');
    if (!welcomeFile) {
      welcomeFile = {
        id: 'welcome_guide.md',
        name: 'welcome_guide.md',
        content: welcomeContent,
        path: '/Guides',
        isFolder: false,
        isReadOnly: false,
        updatedAt: new Date().toISOString()
      };
      this.documents.push(welcomeFile);
      modified = true;
    } else {
      welcomeFile.content = welcomeContent;
      welcomeFile.isReadOnly = false;
      welcomeFile.updatedAt = new Date().toISOString();
      modified = true;
    }

    // 3. Overwrite / regenerate Formatting_Guide.md on startup
    let formattingFile = this.documents.find(d => !d.isFolder && d.path === '/Guides' && d.name === 'Formatting_Guide.md');
    if (!formattingFile) {
      formattingFile = {
        id: 'formatting_guide.md',
        name: 'Formatting_Guide.md',
        content: formattingContent,
        path: '/Guides',
        isFolder: false,
        isReadOnly: false,
        updatedAt: new Date().toISOString()
      };
      this.documents.push(formattingFile);
      modified = true;
    } else {
      formattingFile.content = formattingContent;
      formattingFile.isReadOnly = false;
      formattingFile.updatedAt = new Date().toISOString();
      modified = true;
    }

    if (modified) {
      this.saveToStorage();
    }
  }

  loadTemplates() {
    this.documents = [];
    this.checkVFSInitialization();
    
    // Add default user notes inside root "/"
    this.documents.push({
      id: 'doc_notes',
      name: 'My_Notes.md',
      content: '# My Notes ✏️\n\nWelcome! This is an editable document in your root directory. Feel free to modify or delete it.',
      path: '/',
      isFolder: false,
      isReadOnly: false,
      updatedAt: new Date().toISOString()
    });
    this.saveToStorage();
  }

  setupEventListeners() {
    // Editor Input
    this.textarea.addEventListener('input', () => {
      this.updateActiveDocumentContent();
      this.updateCounts();
      this.updateStateIndicator('Syncing...');
      this.debouncedSave();
    });

    // Handle Tab key in Textarea (insert spaces)
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const val = this.textarea.value;
        this.textarea.value = val.substring(0, start) + "  " + val.substring(end);
        this.textarea.selectionStart = this.textarea.selectionEnd = start + 2;
        this.textarea.dispatchEvent(new Event('input'));
      }
    });

    // Document Title Name Input Edit (Renames on Enter or Blur to avoid file-system race conditions)
    const performRename = async () => {
      if (!this.activeDocId) return;
      const isDefault = this.isDesktop && (this.normalizePath(this.workspaceRootPath) === this.normalizePath(this.defaultWorkspace));
      if (isDefault) return;

      const doc = this.documents.find(d => d.id === this.activeDocId) || this.referencedFiles.find(d => d.id === this.activeDocId);
      if (!doc) return;

      let name = this.docNameInput.value.trim();
      if (!name) {
        this.docNameInput.value = doc.name;
        return;
      }
      if (name === doc.name) return; // No name change

      // Verify alphanumeric + dots/dashes/underscores to prevent VFS path escapes
      if (!/^[a-zA-Z0-9_\-\s\.]+$/.test(name)) {
        this.showToast("Invalid characters in file name!", "error");
        this.docNameInput.value = doc.name;
        return;
      }

      // Ensure it ends with .md
      if (!name.endsWith('.md')) {
        name += '.md';
      }
      this.docNameInput.value = name;

      const oldName = doc.name;
      doc.name = name;
      doc.updatedAt = new Date().toISOString();

      if (this.isDesktop) {
        this.updateStateIndicator('Syncing...');

        if (doc.isExternal && doc.fullPath) {
          const oldFullPath = doc.fullPath;
          const dir = doc.dirPath || '';
          const newFullPath = (dir.endsWith('\\') || dir.endsWith('/')) ? dir + name : dir + '\\' + name;
          const success = await window.aetherAPI.renamePathAbsolute(oldFullPath, newFullPath);
          if (!success) {
            this.showToast("Failed to rename file on disk", "error");
            doc.name = oldName;
            this.docNameInput.value = oldName;
            this.updateStateIndicator('Saved');
            return;
          }

          doc.name = name;
          doc.fullPath = newFullPath;
          const newKey = btoa(unescape(encodeURIComponent(newFullPath))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
          doc.id = 'ref_' + newKey;
          this.activeDocId = doc.id;
          localStorage.setItem('aether_active_doc_id', doc.id);
          this.savePersistedReferencedFiles();
          await this.saveSharedSettings();
          this.updateFloatingDocBubble(doc);
          this.renderFileList();
          this.showToast(`Renamed to ${name}`, "success");
          this.updateStateIndicator('Saved');
          return;
        }

        const success = await window.aetherAPI.renamePath(doc.path, oldName, name, false);
        if (!success) {
          this.showToast("Failed to rename file on disk", "error");
          doc.name = oldName;
          this.docNameInput.value = oldName;
          this.updateStateIndicator('Saved');
          return;
        }

        // Update the ID to match the new deterministic ID
        const newRelPath = doc.path === '/' ? '/' + name : doc.path + '/' + name;
        const newId = 'file_' + btoa(unescape(encodeURIComponent(newRelPath))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        doc.id = newId;
        this.activeDocId = newId;
        localStorage.setItem('aether_active_doc_id', newId);
        await this.saveSharedSettings();
      } else {
        this.saveToStorage();
      }

      this.renderFileList();
      this.showToast(`Renamed to ${name}`, "success");
      this.updateStateIndicator('Saved');
    };

    this.docNameInput.addEventListener('change', performRename);
    this.docNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.docNameInput.blur();
      }
    });

    // Search Input
    this.searchInput.addEventListener('input', () => {
      this.renderFileList();
    });

    // New Document Action
    this.newDocBtn.addEventListener('click', () => {
      this.createNewDocument();
    });

    // New Folder Action
    this.newFolderBtn.addEventListener('click', () => {
      this.createNewFolder();
    });

    // Open Workspace Action
    if (this.btnOpenWorkspace) {
      this.btnOpenWorkspace.addEventListener('click', async () => {
        const folder = await window.aetherAPI.selectDirectory();
        if (folder) {
          await this.openWorkspaceFolder(folder);
        }
      });
    }

    // Export Actions
    this.btnExportMd.addEventListener('click', () => {
      this.exportDocument('md');
    });

    this.btnExportHtml.addEventListener('click', () => {
      this.exportDocument('html');
    });

    // Line Wrap Action
    this.btnLineWrap.addEventListener('click', () => {
      this.lineWrapEnabled = !this.lineWrapEnabled;
      if (this.lineWrapEnabled) {
        this.textarea.style.whiteSpace = 'pre-wrap';
        this.textarea.style.wordWrap = 'break-word';
        this.btnLineWrap.classList.add('btn-primary');
        this.btnLineWrap.innerHTML = 'Wrap: ON';
      } else {
        this.textarea.style.whiteSpace = 'pre';
        this.textarea.style.wordWrap = 'normal';
        this.btnLineWrap.classList.remove('btn-primary');
        this.btnLineWrap.innerHTML = 'Wrap: OFF';
      }
      updateLineNumbers(this.textarea, this.gutter);
    });

    // Theme Switch Toggle Action
    this.btnThemeToggle.addEventListener('click', () => {
      const nextTheme = this.theme === 'dark' ? 'light' : 'dark';
      this.setTheme(nextTheme);
    });

    // Sidebar Layout Model View Switch Action
    this.btnSidebarView.addEventListener('click', () => {
      this.sidebarLayoutMode = this.sidebarLayoutMode === 'stack' ? 'tree' : 'stack';
      localStorage.setItem('aether_sidebar_layout', this.sidebarLayoutMode);
      this.updateSidebarViewButtonLabel();
      this.renderFileList();
      this.saveSharedSettings();
    });

    // Back button in Stack directory view
    this.btnNavBack.addEventListener('click', () => {
      if (this.currentDirPath === '/') return;
      const parts = this.currentDirPath.split('/');
      parts.pop();
      let parentPath = parts.join('/');
      if (parentPath === '') parentPath = '/';
      this.currentDirPath = parentPath;
      this.renderFileList();
    });

    // Help Modal Triggers
    this.btnHelp.addEventListener('click', () => {
      this.modalHelp.classList.add('active');
    });

    this.modalClose.addEventListener('click', () => {
      this.modalHelp.classList.remove('active');
    });

    this.modalHelp.addEventListener('click', (e) => {
      if (e.target === this.modalHelp) {
        this.modalHelp.classList.remove('active');
      }
    });

    // View Mode Layout Selectors - FIXED: events wired up cleanly
    this.btnModeEdit.addEventListener('click', () => this.setViewMode('edit'));
    this.btnModeSplit.addEventListener('click', () => this.setViewMode('split'));
    this.btnModeRead.addEventListener('click', () => this.setViewMode('read'));

    // Restore Session Banner Actions
    const btnRestore = document.getElementById('btn-restore-session');
    const btnDismissRestore = document.getElementById('btn-dismiss-restore');
    const restoreBanner = document.getElementById('restore-banner');
    
    if (btnRestore && btnDismissRestore && restoreBanner) {
      btnRestore.addEventListener('click', async () => {
        const lastWorkspace = btnRestore.getAttribute('data-path');
        if (lastWorkspace) {
          this.workspaceRootPath = lastWorkspace;
          localStorage.setItem('aether_workspace_path', lastWorkspace);
          restoreBanner.classList.remove('active');
          await this.loadWorkspaceFromDisk();
        }
      });
      
      btnDismissRestore.addEventListener('click', () => {
        restoreBanner.classList.remove('active');
        if (this.defaultWorkspace) {
          localStorage.setItem('aether_workspace_path', this.defaultWorkspace);
        }
      });
    }

    // Home Guides reset event listener
    if (this.btnHomeWorkspace) {
      this.btnHomeWorkspace.addEventListener('click', async () => {
        const defaultWorkspace = this.defaultWorkspace || await window.aetherAPI.getDefaultWorkspace();
        this.defaultWorkspace = defaultWorkspace;
        this.workspaceRootPath = defaultWorkspace;
        localStorage.setItem('aether_workspace_path', defaultWorkspace);
        // Hide restore banner if active
        const banner = document.getElementById('restore-banner');
        if (banner) banner.classList.remove('active');
        
        await this.checkDesktopVFSInitialization(true);
        await this.loadWorkspaceFromDisk(true);
        this.showToast("Returned to Guides Workspace", "success");
      });
    }

    // Auto-Restore Toggle event listener
    if (this.btnAutoRestore) {
      this.btnAutoRestore.addEventListener('click', () => {
        this.autoRestore = !this.autoRestore;
        localStorage.setItem('aether_auto_restore', this.autoRestore ? 'true' : 'false');
        this.updateAutoRestoreButtonLabel();
        this.showToast(this.autoRestore ? "Auto-Restore enabled" : "Auto-Restore disabled", "success");
        this.saveSharedSettings();
      });
    }

    // Global Ctrl+A event listener to restrict selection to text box
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.modalLightbox && this.modalLightbox.classList.contains('active')) {
          this.closeImageLightbox();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        this.insertTableTemplate();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
        e.preventDefault();
        this.handleInsertImageAction();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.id === 'doc-name-input' || activeEl.id === 'search-input' || activeEl.id === 'prompt-input')) {
          return;
        }
        e.preventDefault();
        this.textarea.focus();
        this.textarea.select();
      }
    });

    // Table Insert Button Trigger
    if (this.btnInsertTable) {
      this.btnInsertTable.addEventListener('click', () => {
        this.insertTableTemplate();
      });
    }

    // Image Insert Button & File Input Triggers
    if (this.btnInsertImage) {
      this.btnInsertImage.addEventListener('click', () => {
        this.handleInsertImageAction();
      });
    }

    if (this.imageFileInput) {
      this.imageFileInput.addEventListener('change', () => {
        const file = this.imageFileInput.files && this.imageFileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const altText = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
          this.insertTextAtCursor(`\n![${altText}](${reader.result})\n`);
          this.showToast(`Inserted ${file.name}`, "success");
        };
        reader.readAsDataURL(file);
        this.imageFileInput.value = '';
      });
    }

    // Clipboard Paste Listener for Images (Ctrl+V)
    this.textarea.addEventListener('paste', async (e) => {
      if (!e.clipboardData || !e.clipboardData.items) return;
      const items = Array.from(e.clipboardData.items);
      const imageItem = items.find(item => item.type && item.type.startsWith('image/'));
      if (imageItem) {
        e.preventDefault();
        const file = imageItem.getAsFile();
        if (!file) return;

        const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `image_${timestamp}.${ext}`;

        if (this.isDesktop && window.aetherAPI && window.aetherAPI.saveImageBuffer) {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64Data = reader.result.split(',')[1];
            const activeDoc = this.documents.find(d => d.id === this.activeDocId);
            const docFolder = (activeDoc && activeDoc.path) ? activeDoc.path : '/';
            const targetRelFolder = docFolder === '/' ? 'assets' : `${docFolder.replace(/^\//, '')}/assets`;

            const savedRel = await window.aetherAPI.saveImageBuffer(targetRelFolder, filename, base64Data);
            if (savedRel) {
              this.insertTextAtCursor(`\n![Pasted Image](${targetRelFolder}/${filename})\n`);
              this.showToast("Image pasted & saved to assets", "success");
            } else {
              this.showToast("Failed to save pasted image", "error");
            }
          };
          reader.readAsDataURL(file);
        } else {
          const reader = new FileReader();
          reader.onload = () => {
            this.insertTextAtCursor(`\n![Pasted Image](${reader.result})\n`);
            this.showToast("Image pasted as Data URL", "success");
          };
          reader.readAsDataURL(file);
        }
      }
    });

    // Global and Workspace Drag-and-Drop Handlers (Drop in files, drop in text, drop in folders)
    const handleDragOver = (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      if (this.workspacePanel) this.workspacePanel.classList.add('image-drag-active');
    };

    const handleDragLeave = (e) => {
      if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
        if (this.workspacePanel) this.workspacePanel.classList.remove('image-drag-active');
      }
    };

    const handleDrop = async (e) => {
      e.preventDefault();
      if (this.workspacePanel) this.workspacePanel.classList.remove('image-drag-active');

      const hasFiles = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0;
      if (hasFiles) {
        const files = Array.from(e.dataTransfer.files);
        for (const file of files) {
          await this.handleDroppedFile(file, e.target);
        }
      } else if (e.dataTransfer) {
        // Dropped text snippet
        const textData = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/markdown');
        if (textData) {
          this.handleDroppedText(textData, e.target);
        }
      }
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);

    // Floating Doc Bubble Actions
    if (this.btnBubbleReveal) {
      this.btnBubbleReveal.addEventListener('click', () => {
        const doc = this.referencedFiles.find(d => d.id === this.activeDocId);
        if (doc && doc.fullPath && window.aetherAPI) {
          window.aetherAPI.openInExplorer(doc.fullPath);
        }
      });
    }

    if (this.btnBubbleClose) {
      this.btnBubbleClose.addEventListener('click', () => {
        if (this.activeDocId) {
          this.closeReferencedFile(this.activeDocId);
        }
      });
    }

    // Preview Image Click -> Lightbox Zoom Modal
    if (this.preview) {
      this.preview.addEventListener('click', (e) => {
        if (e.target && e.target.tagName === 'IMG' && !e.target.closest('a') && !e.target.classList.contains('img-broken')) {
          this.openImageLightbox(e.target.src, e.target.alt, e.target.title);
        }
      });
    }

    // Lightbox Controls
    if (this.lightboxClose) {
      this.lightboxClose.addEventListener('click', () => this.closeImageLightbox());
    }

    if (this.modalLightbox) {
      this.modalLightbox.addEventListener('click', (e) => {
        if (e.target === this.modalLightbox) {
          this.closeImageLightbox();
        }
      });
    }

    if (this.lightboxCopyBtn) {
      this.lightboxCopyBtn.addEventListener('click', () => {
        if (!this.lightboxImg || !this.lightboxImg.src) return;
        navigator.clipboard.writeText(this.lightboxImg.src).then(() => {
          this.showToast("Image link copied to clipboard", "success");
        });
      });
    }
  }

  // Setup Split resizer draggable line listener
  setupSplitResizer() {
    const resizer = document.getElementById('pane-resizer');
    const editorPane = document.getElementById('editor-pane');
    const previewPane = document.getElementById('preview-pane');

    if (resizer && editorPane && previewPane) {
      let isDragging = false;

      resizer.addEventListener('mousedown', (e) => {
        isDragging = true;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const containerRect = resizer.parentElement.getBoundingClientRect();
        const relativeX = e.clientX - containerRect.left;
        let percentage = (relativeX / containerRect.width) * 100;

        if (percentage < 20) percentage = 20;
        if (percentage > 80) percentage = 80;

        editorPane.style.flex = `0 0 ${percentage}%`;
        previewPane.style.flex = `0 0 ${100 - percentage}%`;
      });

      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          resizer.classList.remove('dragging');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      });
    }
  }

  // Set Theme colors and attribute properties
  setTheme(theme, skipSave = false) {
    this.theme = theme;
    localStorage.setItem('aether_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    
    if (this.btnThemeToggle) {
      if (theme === 'dark') {
        this.btnThemeToggle.innerHTML = '🌓 Theme: Dark';
      } else {
        this.btnThemeToggle.innerHTML = '🌓 Theme: Light';
      }
    }
    if (!skipSave) {
      this.saveSharedSettings();
    }
  }

  updateSidebarViewButtonLabel() {
    if (this.btnSidebarView) {
      this.btnSidebarView.innerHTML = this.sidebarLayoutMode === 'stack' ? 'View: Stack' : 'View: Tree';
    }
  }

  // Update layout mode
  setViewMode(mode, skipSave = false) {
    this.currentMode = mode;
    localStorage.setItem('aether_layout_mode', mode);
    
    // Reset layout classes
    if (this.workspacePanel) {
      this.workspacePanel.classList.remove('mode-edit', 'mode-split', 'mode-read');
      this.workspacePanel.classList.add(`mode-${mode}`);
    }
    
    // Toggle active styling
    if (this.btnModeEdit) this.btnModeEdit.classList.toggle('active', mode === 'edit');
    if (this.btnModeSplit) this.btnModeSplit.classList.toggle('active', mode === 'split');
    if (this.btnModeRead) this.btnModeRead.classList.toggle('active', mode === 'read');
    
    // Recalculate scroll gutter
    updateLineNumbers(this.textarea, this.gutter);
    if (!skipSave) {
      this.saveSharedSettings();
    }
  }

  // Get absolute directory path of the active document on disk
  getCurrentDocumentDirectory() {
    if (!this.isDesktop || !this.workspaceRootPath) return '';
    const doc = this.documents.find(d => d.id === this.activeDocId);
    if (!doc) return this.workspaceRootPath;

    const docRelDir = (doc.path || '/').replace(/^\//, '');
    if (!docRelDir) return this.workspaceRootPath;
    return `${this.workspaceRootPath.replace(/\\/g, '/')}/${docRelDir}`.replace(/\/+/g, '/');
  }

  // Insert markdown text at editor cursor position
  insertTextAtCursor(textToInsert) {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    const currentVal = this.textarea.value;

    const newVal = currentVal.substring(0, start) + textToInsert + currentVal.substring(end);
    this.textarea.value = newVal;

    const newCursorPos = start + textToInsert.length;
    this.textarea.selectionStart = this.textarea.selectionEnd = newCursorPos;
    this.textarea.focus();

    this.updateActiveDocumentContent();
    this.updateCounts();
    this.updateStateIndicator('Syncing...');
    this.debouncedSave();
  }

  // Insert markdown table template at cursor position
  insertTableTemplate() {
    const tableTemplate = `\n| Column 1 | Column 2 | Column 3 |\n| :--- | :---: | ---: |\n| Item 1 | Details | $10.00 |\n| Item 2 | Details | $20.00 |\n`;
    this.insertTextAtCursor(tableTemplate);
    this.showToast("Table template inserted", "success");
  }

  // Open Lightbox image zoom modal
  openImageLightbox(src, alt = '', title = '') {
    if (!this.modalLightbox || !this.lightboxImg) return;
    this.lightboxImg.src = src;
    this.lightboxImg.alt = alt || 'Preview';
    if (this.lightboxTitle) {
      this.lightboxTitle.innerText = title || alt || 'Image Preview';
    }
    this.modalLightbox.classList.add('active');
  }

  // Close Lightbox image zoom modal
  closeImageLightbox() {
    if (!this.modalLightbox) return;
    this.modalLightbox.classList.remove('active');
    if (this.lightboxImg) {
      this.lightboxImg.src = '';
    }
  }

  // Handle Image Insert Toolbar Action
  async handleInsertImageAction() {
    const isDefault = this.isDesktop && (this.normalizePath(this.workspaceRootPath) === this.normalizePath(this.defaultWorkspace));
    if (isDefault) {
      this.showToast("Default guide documents are read-only. Open your own folder to edit!", "info");
      return;
    }

    if (this.isDesktop && window.aetherAPI && window.aetherAPI.selectImage) {
      const filePath = await window.aetherAPI.selectImage();
      if (filePath) {
        const fileName = filePath.split(/[/\\]/).pop();
        const normWs = this.normalizePath(this.workspaceRootPath);
        const normFile = this.normalizePath(filePath);

        let imgMarkdownPath = '';
        if (normFile.startsWith(normWs)) {
          const activeDoc = this.documents.find(d => d.id === this.activeDocId);
          const docRelPath = activeDoc ? activeDoc.path : '/';
          const rel = await window.aetherAPI.getRelativeImagePath(filePath, docRelPath);
          imgMarkdownPath = rel || fileName;
        } else {
          const activeDoc = this.documents.find(d => d.id === this.activeDocId);
          const docFolder = (activeDoc && activeDoc.path) ? activeDoc.path : '/';
          const targetSubdir = docFolder === '/' ? 'assets' : `${docFolder.replace(/^\//, '')}/assets`;
          const savedRel = await window.aetherAPI.importImageFile(filePath, targetSubdir);
          imgMarkdownPath = savedRel || fileName;
        }

        const altText = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        this.insertTextAtCursor(`\n![${altText}](${imgMarkdownPath})\n`);
        this.showToast(`Inserted ${fileName}`, "success");
      } else {
        const url = await this.showPrompt("Insert Image URL", "https://example.com/image.png");
        if (url && url.trim()) {
          this.insertTextAtCursor(`\n![Image](${url.trim()})\n`);
          this.showToast("Image URL inserted", "success");
        }
      }
    } else {
      const url = await this.showPrompt("Insert Image", "Enter image URL (https://...) or leave blank to browse file");
      if (url && url.trim()) {
        this.insertTextAtCursor(`\n![Image](${url.trim()})\n`);
        this.showToast("Image URL inserted", "success");
      } else if (this.imageFileInput) {
        this.imageFileInput.click();
      }
    }
  }

  // Update in-memory copy content
  updateActiveDocumentContent() {
    if (!this.activeDocId) return;
    const doc = this.documents.find(d => d.id === this.activeDocId) || (this.referencedFiles && this.referencedFiles.find(d => d.id === this.activeDocId));
    if (doc) {
      doc.content = this.textarea.value;
      doc.updatedAt = new Date().toISOString();
      const docDir = doc.isExternal ? (doc.dirPath || '') : this.getCurrentDocumentDirectory();
      // For large documents (>40KB), debounce preview compilation so typing stays 60fps
      if (doc.content.length > 40000) {
        this.debouncedCompileLargePreview(doc.content, docDir);
      } else {
        this.preview.innerHTML = this.compiler.compile(doc.content, docDir);
      }
      updateLineNumbers(this.textarea, this.gutter);
    }
  }

  updateFloatingDocBubble(doc) {
    if (!this.floatingDocBubble || !this.floatingBubblePath) return;

    if (doc && doc.isExternal && doc.fullPath) {
      this.floatingBubblePath.innerText = doc.fullPath;
      this.floatingBubblePath.title = doc.fullPath;
      this.floatingDocBubble.style.display = 'flex';
    } else {
      this.floatingDocBubble.style.display = 'none';
    }
  }

  closeReferencedFile(id) {
    const idx = this.referencedFiles.findIndex(f => f.id === id);
    if (idx === -1) return;
    const closedDoc = this.referencedFiles[idx];
    this.referencedFiles.splice(idx, 1);
    this.savePersistedReferencedFiles();
    this.saveSharedSettings();

    if (this.activeDocId === id) {
      const nextDoc = this.referencedFiles[0] || this.documents.filter(d => !d.isFolder)[0];
      if (nextDoc) {
        this.selectDocument(nextDoc.id);
      } else {
        this.activeDocId = null;
        this.textarea.value = '';
        this.docNameInput.value = '';
        this.preview.innerHTML = '';
        this.updateFloatingDocBubble(null);
        this.updateCounts();
        updateLineNumbers(this.textarea, this.gutter);
      }
    }
    this.renderFileList();
    this.showToast(`Unreferenced ${closedDoc.name}`, "info");
  }

  handleDroppedText(text, target) {
    if (!text) return;
    if (this.textarea.readOnly) {
      this.createNewDocument().then(() => {
        this.insertTextAtCursor(text);
        this.showToast("Dropped text into new document", "success");
      });
      return;
    }
    this.insertTextAtCursor(text);
    this.updateActiveDocumentContent();
    this.updateCounts();
    this.updateStateIndicator('Syncing...');
    this.debouncedSave();
    this.showToast("Text dropped in!", "success");
  }

  async handleDroppedFile(file, target) {
    const filePath = (window.aetherAPI && window.aetherAPI.getPathForFile)
      ? window.aetherAPI.getPathForFile(file)
      : (file.path || '');

    if (!this.isDesktop || !filePath) {
      if (file.type && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          const altText = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
          this.insertTextAtCursor(`\n![${altText}](${reader.result})\n`);
          this.showToast(`Inserted ${file.name}`, "success");
        };
        reader.readAsDataURL(file);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const refDoc = {
          id: 'ref_' + Date.now(),
          name: file.name,
          fullPath: file.name,
          dirPath: 'Referenced',
          content: ev.target.result,
          isExternal: true,
          isFolder: false,
          updatedAt: new Date().toISOString()
        };
        this.referencedFiles.push(refDoc);
        this.selectDocument(refDoc.id);
        this.renderFileList();
        this.showToast(`Referenced ${file.name}`, "success");
      };
      reader.readAsText(file);
      return;
    }

    const info = await window.aetherAPI.inspectPath(filePath);
    if (!info) return;

    if (info.isDirectory) {
      // Dropping in a folder opens it as workspace!
      await this.openWorkspaceFolder(filePath);
      return;
    }

    // Check if image AND dropped directly on editor or preview
    const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(info.name);
    const droppedOnEditorOrPreview = target && (this.textarea.contains(target) || this.preview.contains(target));

    if (isImage && droppedOnEditorOrPreview) {
      const fileName = info.name;
      const normWs = this.normalizePath(this.workspaceRootPath);
      const normFile = this.normalizePath(filePath);
      let imgPath = '';

      if (normFile.startsWith(normWs)) {
        const activeDoc = this.documents.find(d => d.id === this.activeDocId) || (this.referencedFiles && this.referencedFiles.find(d => d.id === this.activeDocId));
        const docRelPath = (activeDoc && !activeDoc.isExternal) ? activeDoc.path : '/';
        const rel = await window.aetherAPI.getRelativeImagePath(filePath, docRelPath);
        imgPath = rel || fileName;
      } else {
        const activeDoc = this.documents.find(d => d.id === this.activeDocId);
        const docFolder = (activeDoc && activeDoc.path) ? activeDoc.path : '/';
        const targetSubdir = docFolder === '/' ? 'assets' : `${docFolder.replace(/^\//, '')}/assets`;
        const imported = await window.aetherAPI.importImageFile(filePath, targetSubdir);
        imgPath = imported || fileName;
      }

      const altText = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      this.insertTextAtCursor(`\n![${altText}](${imgPath})\n`);
      this.showToast(`Inserted ${fileName}`, "success");
      return;
    }

    // Dropped file for editing: does not move its location to active folder, references it!
    const fileData = await window.aetherAPI.readFileAbsolute(filePath);
    if (!fileData) {
      this.showToast(`Failed to open ${info.name}`, "error");
      return;
    }

    let existing = this.referencedFiles.find(f => this.normalizePath(f.fullPath) === this.normalizePath(filePath));
    if (!existing) {
      const b64Key = btoa(unescape(encodeURIComponent(filePath))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      existing = {
        id: 'ref_' + b64Key,
        name: info.name,
        fullPath: filePath,
        dirPath: info.dir,
        content: fileData.content,
        isExternal: true,
        isFolder: false,
        updatedAt: fileData.updatedAt || new Date().toISOString()
      };
      this.referencedFiles.push(existing);
      this.savePersistedReferencedFiles();
      await this.saveSharedSettings();
    } else {
      existing.content = fileData.content;
      existing.updatedAt = fileData.updatedAt;
    }

    this.selectDocument(existing.id);
    this.renderFileList();
    this.showToast(`Referenced file: ${info.name}`, "success");
  }

  updateCounts() {
    const text = this.textarea.value;
    const charCount = text.length;
    const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
    
    this.wordCountNode.innerText = `${wordCount} words`;
    this.charCountNode.innerText = `${charCount} chars`;
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Storage writer (Desktop write file to disk, Browser write to localStorage)
  async saveToStorage(specificDocId = null, specificContent = null) {
    try {
      const docId = specificDocId || this.activeDocId;
      const content = specificContent !== null ? specificContent : this.textarea.value;

      if (this.isDesktop) {
        if (docId) {
          const doc = this.documents.find(d => d.id === docId) || (this.referencedFiles && this.referencedFiles.find(d => d.id === docId));
          if (doc && !doc.isFolder) {
            let success = false;
            if (doc.isExternal && doc.fullPath) {
              // Write directly to referenced file path on disk
              success = await window.aetherAPI.saveFileAbsolute(doc.fullPath, content);
            } else {
              // Write to workspace directory
              success = await window.aetherAPI.saveFile(doc.path, doc.name, content);
            }
            if (!success) {
              throw new Error("Failed to write file to disk");
            }
            doc.content = content;
            doc.updatedAt = new Date().toISOString();
          }
        }
        await this.saveSharedSettings();
      } else {
        // Web fallback: update in-memory content first
        if (docId) {
          const doc = this.documents.find(d => d.id === docId) || (this.referencedFiles && this.referencedFiles.find(d => d.id === docId));
          if (doc && !doc.isFolder) {
            doc.content = content;
            doc.updatedAt = new Date().toISOString();
          }
        }
        const payload = JSON.stringify(this.documents);
        
        if (payload.length > 4.5 * 1024 * 1024) {
          throw new Error("QuotaExceededError: LocalStorage payload too large.");
        }
        
        localStorage.setItem('aether_documents', payload);
      }
      
      if (this.activeDocId) {
        localStorage.setItem('aether_active_doc_id', this.activeDocId);
      }
      if (!docId || docId === this.activeDocId) {
        this.updateStateIndicator('Saved');
      }
    } catch (error) {
      console.error("VFS sync error:", error);
      this.updateStateIndicator('Sync Error');
      this.showToast("Failed to save changes to disk file", "error");
    }
  }

  async saveSharedSettings() {
    if (!this.isDesktop || !window.aetherAPI || !window.aetherAPI.saveSharedSettings) return;
    try {
      const isDefault = (this.normalizePath(this.workspaceRootPath) === this.normalizePath(this.defaultWorkspace));
      const refPaths = this.referencedFiles ? this.referencedFiles.map(f => f.fullPath) : [];
      const settings = {
        theme: this.theme,
        sidebarLayout: this.sidebarLayoutMode,
        layoutMode: this.currentMode || localStorage.getItem('aether_layout_mode') || 'split',
        autoRestore: this.autoRestore,
        referencedFiles: refPaths
      };

      if (this.isPrimarySession) {
        settings.primarySession = {
          workspacePath: isDefault ? '' : this.workspaceRootPath,
          activeDocId: this.activeDocId
        };
      }
      await window.aetherAPI.saveSharedSettings(settings);
    } catch (err) {
      console.error("Failed to save shared settings:", err);
    }
  }

  savePersistedReferencedFiles() {
    try {
      const paths = this.referencedFiles ? this.referencedFiles.map(f => f.fullPath) : [];
      localStorage.setItem('aether_referenced_files', JSON.stringify(paths));
    } catch (e) {}
  }

  updateStateIndicator(state) {
    this.saveIndicator.innerText = state;
    if (state === 'Saved') {
      this.saveIndicator.style.color = 'var(--accent-cyan)';
    } else if (state === 'Syncing...') {
      this.saveIndicator.style.color = 'var(--text-secondary)';
    } else {
      this.saveIndicator.style.color = 'var(--accent-magenta)';
    }
  }

  // Sidebar File Manager List Renderer Routing
  renderFileList() {
    if (this.sidebarLayoutMode === 'stack') {
      this.renderStackView();
    } else {
      this.renderTreeView();
    }
  }

  // Render Referenced / Dropped Files Nodes
  renderReferencedFilesNodes() {
    if (!this.referencedFiles || this.referencedFiles.length === 0) return null;

    const query = this.searchInput.value.toLowerCase().trim();
    const filteredRefs = query 
      ? this.referencedFiles.filter(r => r.name.toLowerCase().includes(query))
      : this.referencedFiles;

    if (filteredRefs.length === 0) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'referenced-files-section';

    filteredRefs.forEach(ref => {
      const isSelected = ref.id === this.activeDocId;
      const groupEl = document.createElement('div');
      groupEl.className = 'referenced-file-group';
      
      const timeStr = ref.updatedAt ? new Date(ref.updatedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      }) : 'Referenced';

      groupEl.innerHTML = `
        <div class="workspace-path-display referenced-path-bubble" title="Referenced location: ${this.escapeHTML(ref.fullPath)}">
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9.5px;">
              <span style="color: var(--accent-cyan); font-weight: 600;">Ref:</span> ${this.escapeHTML(ref.dirPath || ref.fullPath)}
            </span>
            <span style="font-size: 8.5px; opacity: 0.75; margin-left: 4px; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;">External</span>
          </div>
        </div>
        <div class="file-item referenced-file-node ${isSelected ? 'active' : ''}">
          <div class="file-item-left">
            <svg class="file-icon" style="color: var(--accent-cyan);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <div class="file-info">
              <span class="file-title" style="font-weight: 500;">${this.escapeHTML(ref.name)}</span>
              <span class="file-date">${timeStr}</span>
            </div>
          </div>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button class="btn-ref-explorer file-delete-btn" style="opacity: 1;" title="Show file in Explorer">
              <svg style="width: 12px; height: 12px; color: #4caf50;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
              </svg>
            </button>
            <button class="btn-ref-close file-delete-btn" title="Close reference (keeps file on disk)">
              <svg style="width: 12px; height: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
      `;

      groupEl.querySelector('.file-item-left').addEventListener('click', () => {
        this.selectDocument(ref.id);
      });
      groupEl.querySelector('.btn-ref-explorer').addEventListener('click', (e) => {
        e.stopPropagation();
        window.aetherAPI.openInExplorer(ref.fullPath);
      });
      groupEl.querySelector('.btn-ref-close').addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeReferencedFile(ref.id);
      });

      wrapper.appendChild(groupEl);
    });

    return wrapper;
  }

  // Fluid Stack View layout with programmatically bound listeners
  renderStackView() {
    const isDefault = this.isDesktop && (this.normalizePath(this.workspaceRootPath) === this.normalizePath(this.defaultWorkspace));
    this.sidebarNavHeader.style.display = 'flex';
    this.breadcrumbPath.innerText = this.currentDirPath === '/' ? 'Root' : `Root${this.currentDirPath.replace(/\//g, ' / ')}`;
    this.fileList.innerHTML = '';

    // 1. Render Referenced / Dropped Files (each with floating bubble specifically above it)
    const refSection = this.renderReferencedFilesNodes();
    if (refSection) {
      this.fileList.appendChild(refSection);
    }

    const query = this.searchInput.value.toLowerCase().trim();
    const levelItems = this.documents.filter(d => d.path === this.currentDirPath);
    
    let itemsToRender = levelItems;
    if (query !== '') {
      itemsToRender = this.documents.filter(d => !d.isFolder && d.name.toLowerCase().includes(query));
      this.sidebarNavHeader.style.display = 'none'; // hide nav header in search mode
    }

    // Sort folders first
    const folders = itemsToRender.filter(d => d.isFolder);
    const files = itemsToRender.filter(d => !d.isFolder);
    const sorted = [...folders, ...files];

    if (sorted.length === 0) {
      if (!refSection) {
        this.fileList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 16px;">No items in folder</div>`;
      } else {
        const emptyNotice = document.createElement('div');
        emptyNotice.style.cssText = 'text-align: center; color: var(--text-muted); font-size: 11px; padding: 12px; font-style: italic;';
        emptyNotice.innerText = 'No workspace items in this folder';
        this.fileList.appendChild(emptyNotice);
      }
      return;
    }

    sorted.forEach(item => {
      const node = document.createElement('div');
      const isSelected = item.id === this.activeDocId && !item.isFolder;
      node.className = `file-item ${isSelected ? 'active' : ''}`;
      
      const timeStr = new Date(item.updatedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      });

      if (item.isFolder) {
        node.innerHTML = `
          <div class="file-item-left">
            <span class="file-icon folder-item" style="font-size: 16px;">📁</span>
            <div class="file-info">
              <span class="file-title" style="font-weight: 600;">${this.escapeHTML(item.name)}</span>
              <span class="file-date">Directory</span>
            </div>
          </div>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button class="btn-open-folder file-delete-btn" style="opacity: 1;" title="Open as Workspace folder">
              <svg style="width: 14px; height: 14px; color: var(--accent-cyan);" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-8m-4-2l-2 2H4"></path>
              </svg>
            </button>
            <button class="btn-explorer file-delete-btn" style="opacity: 1;" title="Open folder location in Explorer">
              <svg style="width: 12px; height: 12px; color: #4caf50;" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
              </svg>
            </button>
            <button class="btn-delete-folder file-delete-btn" title="Delete directory">
              <svg style="width: 14px; height: 14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          </div>
        `;

        // Programmatic Event Listeners
        node.querySelector('.file-item-left').addEventListener('click', () => {
          this.navigateIntoFolder(item.name);
        });
        node.querySelector('.btn-open-folder').addEventListener('click', (e) => {
          e.stopPropagation();
          const sep = (this.workspaceRootPath.endsWith('\\') || this.workspaceRootPath.endsWith('/')) ? '' : '\\';
          const targetDir = item.path === '/' 
            ? (this.workspaceRootPath + sep + item.name)
            : (this.workspaceRootPath + item.path.replace(/\//g, '\\') + '\\' + item.name);
          this.openWorkspaceFolder(targetDir);
        });
        if (this.isDesktop) {
          node.querySelector('.btn-explorer').addEventListener('click', (e) => {
            e.stopPropagation();
            window.aetherAPI.openInExplorer(item.path, item.name);
          });
        } else {
          node.querySelector('.btn-explorer').style.display = 'none';
        }
        if (isDefault) {
          node.querySelector('.btn-delete-folder').style.display = 'none';
        }
        node.querySelector('.btn-delete-folder').addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteDocument(item.id);
        });
      } else {
        node.innerHTML = `
          <div class="file-item-left">
            <svg class="file-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <div class="file-info">
              <span class="file-title">${this.escapeHTML(item.name)}</span>
              <span class="file-date">${timeStr}</span>
            </div>
          </div>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button class="btn-explorer file-delete-btn" style="opacity: 1;" title="Show file in Explorer">
              <svg style="width: 12px; height: 12px; color: #4caf50;" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
              </svg>
            </button>
            <button class="btn-delete-file file-delete-btn" title="Delete document">
              <svg style="width: 14px; height: 14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          </div>
        `;

        // Programmatic Event Listeners
        node.querySelector('.file-item-left').addEventListener('click', () => {
          this.selectDocument(item.id);
        });
        if (this.isDesktop) {
          node.querySelector('.btn-explorer').addEventListener('click', (e) => {
            e.stopPropagation();
            window.aetherAPI.openInExplorer(item.path, item.name);
          });
        } else {
          node.querySelector('.btn-explorer').style.display = 'none';
        }
        if (isDefault) {
          node.querySelector('.btn-delete-file').style.display = 'none';
        }
        node.querySelector('.btn-delete-file').addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteDocument(item.id);
        });
      }
      this.fileList.appendChild(node);
    });
  }

  // Classic Tree View layout
  renderTreeView() {
    this.sidebarNavHeader.style.display = 'none';
    
    const query = this.searchInput.value.toLowerCase().trim();
    if (query !== '') {
      this.renderStackView();
      this.sidebarNavHeader.style.display = 'none';
      return;
    }

    this.fileList.innerHTML = '';

    // Render referenced files at top of Tree View as well
    const refSection = this.renderReferencedFilesNodes();
    if (refSection) {
      this.fileList.appendChild(refSection);
    }

    const treeRoot = this.renderTreeRecursive('/', 0);
    this.fileList.appendChild(treeRoot);
  }

  // Recursive walk renderer generating DOM elements programmatically
  renderTreeRecursive(currentPath, depth) {
    const isDefault = this.isDesktop && (this.normalizePath(this.workspaceRootPath) === this.normalizePath(this.defaultWorkspace));
    const container = document.createElement('div');
    container.className = currentPath === '/' ? 'tree-list-root' : 'tree-children';
    
    const items = this.documents.filter(d => d.path === currentPath);
    const folders = items.filter(i => i.isFolder);
    const files = items.filter(i => !i.isFolder);

    // Render Folders
    folders.forEach(folder => {
      const folderFullPath = currentPath === '/' ? '/' + folder.name : currentPath + '/' + folder.name;
      const isExpanded = this.expandedFolders.has(folderFullPath);
      
      const nodeEl = document.createElement('div');
      nodeEl.className = 'tree-node';
      
      const rowEl = document.createElement('div');
      rowEl.className = 'tree-row';
      rowEl.style.paddingLeft = `${depth * 10}px`;
      rowEl.innerHTML = `
        <span class="tree-toggle-arrow ${isExpanded ? 'expanded' : ''}">▸</span>
        <span class="tree-icon folder-item">📁</span>
        <span class="tree-label" style="font-weight: 500;">${this.escapeHTML(folder.name)}</span>
        <div style="display:flex; gap:2px; align-items:center;">
          <button class="btn-tree-open file-delete-btn" style="padding: 2px 4px; border:none; opacity: 1;" title="Open as Workspace folder">
            <svg style="width: 12px; height: 12px; color: var(--accent-cyan);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-8m-4-2l-2 2H4"></path></svg>
          </button>
          <button class="btn-tree-explorer file-delete-btn" style="padding: 2px 4px; border:none; opacity: 1;" title="Show folder in Explorer">
            <svg style="width: 11px; height: 11px; color: #4caf50;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
          </button>
          <button class="btn-tree-delete file-delete-btn" style="padding: 2px 4px; border:none;" title="Delete directory">✕</button>
        </div>
      `;
      
      // Programmatic listeners
      rowEl.addEventListener('click', () => {
        this.toggleTreeFolder(folderFullPath);
      });
      rowEl.querySelector('.btn-tree-open').addEventListener('click', (e) => {
        e.stopPropagation();
        const sep = (this.workspaceRootPath.endsWith('\\') || this.workspaceRootPath.endsWith('/')) ? '' : '\\';
        const targetDir = folder.path === '/' 
          ? (this.workspaceRootPath + sep + folder.name)
          : (this.workspaceRootPath + folder.path.replace(/\//g, '\\') + '\\' + folder.name);
        this.openWorkspaceFolder(targetDir);
      });
      if (this.isDesktop) {
        rowEl.querySelector('.btn-tree-explorer').addEventListener('click', (e) => {
          e.stopPropagation();
          window.aetherAPI.openInExplorer(folder.path, folder.name);
        });
      } else {
        rowEl.querySelector('.btn-tree-open').style.display = 'none';
        rowEl.querySelector('.btn-tree-explorer').style.display = 'none';
      }
      if (isDefault) {
        rowEl.querySelector('.btn-tree-delete').style.display = 'none';
      }
      rowEl.querySelector('.btn-tree-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteDocument(folder.id);
      });

      nodeEl.appendChild(rowEl);

      const childrenEl = this.renderTreeRecursive(folderFullPath, depth + 1);
      if (isExpanded) {
        childrenEl.classList.add('expanded');
      }
      nodeEl.appendChild(childrenEl);
      container.appendChild(nodeEl);
    });

    // Render Files
    files.forEach(file => {
      const isSelected = file.id === this.activeDocId;
      const fileRow = document.createElement('div');
      fileRow.className = `tree-row ${isSelected ? 'active' : ''}`;
      fileRow.style.paddingLeft = `${(depth + 1) * 10 + 6}px`;
      fileRow.innerHTML = `
        <span class="tree-icon" style="color: var(--text-muted);">📄</span>
        <span class="tree-label">${this.escapeHTML(file.name)}</span>
        <div style="display:flex; gap:2px; align-items:center;">
          <button class="btn-tree-explorer file-delete-btn" style="padding: 2px 4px; border:none;" title="Show file in Explorer">📂</button>
          <button class="btn-tree-delete file-delete-btn" style="padding: 2px 4px; border:none;" title="Delete document">✕</button>
        </div>
      `;
      
      // Programmatic listeners
      fileRow.addEventListener('click', () => {
        this.selectDocument(file.id);
      });
      if (this.isDesktop) {
        fileRow.querySelector('.btn-tree-explorer').addEventListener('click', (e) => {
          e.stopPropagation();
          window.aetherAPI.openInExplorer(file.path, file.name);
        });
      } else {
        fileRow.querySelector('.btn-tree-explorer').style.display = 'none';
      }
      if (isDefault) {
        fileRow.querySelector('.btn-tree-delete').style.display = 'none';
      }
      fileRow.querySelector('.btn-tree-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteDocument(file.id);
      });
      
      container.appendChild(fileRow);
    });

    if (items.length === 0 && currentPath !== '/') {
      const emptyEl = document.createElement('div');
      emptyEl.style.paddingLeft = `${(depth + 1) * 10}px`;
      emptyEl.style.fontSize = '11px';
      emptyEl.style.color = 'var(--text-muted)';
      emptyEl.style.fontStyle = 'italic';
      emptyEl.innerText = 'Empty';
      container.appendChild(emptyEl);
    }

    return container;
  }

  toggleTreeFolder(path) {
    if (this.expandedFolders.has(path)) {
      this.expandedFolders.delete(path);
    } else {
      this.expandedFolders.add(path);
    }
    this.renderFileList();
  }

  navigateIntoFolder(folderName) {
    this.currentDirPath = this.currentDirPath === '/' ? '/' + folderName : this.currentDirPath + '/' + folderName;
    this.renderFileList();
  }

  // Load document context (supports lazy-loading large files on demand)
  async selectDocument(id) {
    if (this.activeDocId && this.activeDocId !== id) {
      // Save current document immediately in the background before switching
      this.saveToStorage(this.activeDocId, this.textarea.value);
    }

    const doc = this.documents.find(d => d.id === id) || (this.referencedFiles && this.referencedFiles.find(d => d.id === id));
    if (!doc || doc.isFolder) return;

    this.activeDocId = id;

    // Lazy load content from disk if not yet loaded (files > 128KB)
    if (doc.content === null && this.isDesktop && window.aetherAPI && window.aetherAPI.readFileRelative) {
      this.updateStateIndicator('Loading...');
      const loaded = await window.aetherAPI.readFileRelative(doc.path, doc.name);
      doc.content = loaded !== null ? loaded : '';
    }
    
    // Set text contents
    this.textarea.value = doc.content || '';
    this.docNameInput.value = doc.name;
    const docDir = doc.isExternal ? (doc.dirPath || '') : this.getCurrentDocumentDirectory();
    this.preview.innerHTML = this.compiler.compile(this.textarea.value, docDir);
    
    this.updateCounts();
    updateLineNumbers(this.textarea, this.gutter);
    
    // Ensure editability
    const isDefault = !doc.isExternal && this.isDesktop && (this.normalizePath(this.workspaceRootPath) === this.normalizePath(this.defaultWorkspace));
    this.textarea.readOnly = isDefault;
    this.docNameInput.disabled = isDefault;

    const paneTitle = document.querySelector('#editor-pane .pane-title');
    if (paneTitle) {
      if (doc.isExternal) {
        paneTitle.innerText = 'Editor (Referenced File)';
      } else {
        paneTitle.innerText = isDefault ? 'Editor (Read-Only Guide)' : 'Editor';
      }
    }

    // Update Floating Bubble specifically above it
    this.updateFloatingDocBubble(doc);

    this.renderFileList();
    localStorage.setItem('aether_active_doc_id', id);
    this.updateStateIndicator('Saved');
  }

  async createNewDocument() {
    const id = 'doc_' + Date.now();
    const path = this.sidebarLayoutMode === 'stack' ? this.currentDirPath : '/';
    let name = 'untitled.md';
    let counter = 1;
    while (this.documents.some(d => !d.isFolder && d.path === path && d.name.toLowerCase() === name.toLowerCase())) {
      name = `untitled_${counter}.md`;
      counter++;
    }
    const content = '# Untitled Document\n\nStart writing markdown here...';

    if (this.isDesktop) {
      await window.aetherAPI.saveFile(path, name, content);
      const list = await window.aetherAPI.readDirectory(this.workspaceRootPath);
      this.documents = list;
      
      // Locate the created document in refreshed VFS
      const created = this.documents.find(d => !d.isFolder && d.path === path && d.name === name);
      if (created) {
        this.selectDocument(created.id);
      }
    } else {
      const newDoc = {
        id: id,
        name: name,
        content: content,
        path: path,
        isFolder: false,
        isReadOnly: false,
        updatedAt: new Date().toISOString()
      };
      this.documents.unshift(newDoc);
      this.saveToStorage();
      this.selectDocument(id);
    }
    
    this.renderFileList();
    this.showToast("Document created!", "success");
  }

  async createNewFolder() {
    const folderName = await this.showPrompt("Create New Folder", "Enter folder name...");
    if (!folderName) return;
    const trimmed = folderName.trim();
    if (!trimmed) return;
    
    // Verify alphanumeric to prevent VFS path syntax escapes
    if (!/^[a-zA-Z0-9_\-\s]+$/.test(trimmed)) {
      this.showToast("Invalid characters in folder name!", "error");
      return;
    }

    const path = this.sidebarLayoutMode === 'stack' ? this.currentDirPath : '/';
    
    // Check duplication
    const duplicate = this.documents.find(d => d.isFolder && d.path === path && d.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      this.showToast("A folder with this name already exists here!", "error");
      return;
    }

    if (this.isDesktop) {
      await window.aetherAPI.createFolder(path, trimmed);
      const list = await window.aetherAPI.readDirectory(this.workspaceRootPath);
      this.documents = list;
    } else {
      const id = 'dir_' + Date.now();
      const newFolder = {
        id: id,
        name: trimmed,
        path: path,
        isFolder: true,
        isReadOnly: false,
        updatedAt: new Date().toISOString()
      };
      this.documents.push(newFolder);
      this.saveToStorage();
    }
    
    this.renderFileList();
    this.showToast("Folder created!", "success");
  }

  // Deletion cascades that clean up child documents and nested structures
  async deleteDocument(id) {
    const isRef = this.referencedFiles && this.referencedFiles.some(f => f.id === id);
    if (isRef) {
      this.closeReferencedFile(id);
      return;
    }

    const isDefault = this.isDesktop && (this.normalizePath(this.workspaceRootPath) === this.normalizePath(this.defaultWorkspace));
    if (isDefault) {
      this.showToast("Default Guide files cannot be deleted.", "error");
      return;
    }

    const doc = this.documents.find(d => d.id === id);
    if (!doc) return;

    const docName = doc.name;
    
    if (this.isDesktop) {
      // Physical delete on hard drive
      await window.aetherAPI.deletePath(doc.path, doc.name, doc.isFolder);
      
      const folderPath = doc.path === '/' ? '/' + doc.name : doc.path + '/' + doc.name;
      if (doc.isFolder && (this.currentDirPath === folderPath || this.currentDirPath.startsWith(folderPath + '/'))) {
        this.currentDirPath = '/';
      }
      
      const list = await window.aetherAPI.readDirectory(this.workspaceRootPath);
      this.documents = list;
    } else {
      if (doc.isFolder) {
        const folderPath = doc.path === '/' ? '/' + doc.name : doc.path + '/' + doc.name;
        // Delete parent directory + all items starting with that path
        this.documents = this.documents.filter(d => d.id !== id && d.path !== folderPath && !d.path.startsWith(folderPath + '/'));
        
        if (this.currentDirPath === folderPath || this.currentDirPath.startsWith(folderPath + '/')) {
          this.currentDirPath = '/';
        }
      } else {
        this.documents = this.documents.filter(d => d.id !== id);
      }
    }

    // Fallback if active file is deleted
    if (id === this.activeDocId) {
      const filesOnly = this.documents.filter(d => !d.isFolder);
      if (filesOnly.length > 0) {
        this.activeDocId = filesOnly[0].id;
      } else {
        if (this.isDesktop) {
          await this.checkDesktopVFSInitialization();
        } else {
          this.loadTemplates();
        }
        this.activeDocId = this.documents.filter(d => !d.isFolder)[0].id;
      }
    }

    if (!this.isDesktop) {
      this.saveToStorage();
    }
    this.selectDocument(this.activeDocId);
    this.showToast(`Deleted ${docName}`, "success");
  }

  exportDocument(format) {
    if (!this.activeDocId) return;
    const doc = this.documents.find(d => d.id === this.activeDocId) || (this.referencedFiles && this.referencedFiles.find(d => d.id === this.activeDocId));
    if (!doc) return;

    let blob, filename;
    if (format === 'md') {
      blob = new Blob([doc.content], { type: 'text/markdown;charset=utf-8' });
      filename = doc.name.endsWith('.md') ? doc.name : `${doc.name}.md`;
    } else {
      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${doc.name}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      color: #333;
    }
    pre {
      background: #f4f4f4;
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 16px;
      overflow-x: auto;
    }
    code {
      font-family: monospace;
      background: #f4f4f4;
      padding: 2px 4px;
      border-radius: 4px;
    }
    blockquote {
      border-left: 4px solid #00f0ff;
      background: #f9f9f9;
      margin: 0;
      padding: 10px 20px;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 16px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 14px;
    }
    th, td {
      padding: 10px 14px;
      border: 1px solid #ddd;
    }
    th {
      background: #f7f7f7;
      font-weight: 600;
      text-align: left;
    }
    tr:nth-child(even) {
      background: #fafafa;
    }
  </style>
</head>
<body>
  ${this.compiler.compile(doc.content, this.getCurrentDocumentDirectory())}
</body>
</html>`;
      blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      filename = doc.name.endsWith('.md') ? doc.name.replace(/\.md$/, '.html') : `${doc.name}.html`;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    this.showToast(`Exported as ${format.toUpperCase()}`, "success");
  }

  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconHTML = '';
    if (type === 'success') {
      iconHTML = `
        <svg class="toast-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
      `;
    } else {
      iconHTML = `
        <svg class="toast-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
        </svg>
      `;
    }

    toast.innerHTML = `${iconHTML}<span>${this.escapeHTML(message)}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 2500);
  }

  escapeHTML(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  updateWorkspacePathDisplay() {
    if (this.workspacePathDisplay) {
      if (this.isDesktop) {
        this.workspacePathDisplay.innerText = `Workspace: ${this.workspaceRootPath}`;
        this.workspacePathDisplay.title = this.workspaceRootPath;
        this.workspacePathDisplay.style.display = 'block';
      } else {
        this.workspacePathDisplay.innerText = 'Workspace: Browser Cache (Local VFS)';
        this.workspacePathDisplay.title = 'Web fallback local storage VFS';
        this.workspacePathDisplay.style.display = 'block';
      }
    }
  }

  showPrompt(title, placeholder, defaultValue = '') {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-prompt');
      const titleEl = document.getElementById('prompt-title');
      const inputEl = document.getElementById('prompt-input');
      const closeBtn = document.getElementById('prompt-close');
      const cancelBtn = document.getElementById('prompt-cancel-btn');
      const submitBtn = document.getElementById('prompt-submit-btn');

      if (!modal || !inputEl) {
        // Fallback if elements don't exist
        resolve(defaultValue);
        return;
      }

      titleEl.innerText = title;
      inputEl.placeholder = placeholder;
      inputEl.value = defaultValue;
      
      modal.classList.add('active');
      inputEl.focus();
      inputEl.select();

      const cleanup = () => {
        modal.classList.remove('active');
        submitBtn.removeEventListener('click', handleSubmit);
        cancelBtn.removeEventListener('click', handleCancel);
        closeBtn.removeEventListener('click', handleCancel);
        inputEl.removeEventListener('keydown', handleKeyDown);
      };

      function handleSubmit() {
        const val = inputEl.value;
        cleanup();
        resolve(val);
      }

      function handleCancel() {
        cleanup();
        resolve(null);
      }

      function handleKeyDown(e) {
        if (e.key === 'Enter') {
          handleSubmit();
        } else if (e.key === 'Escape') {
          handleCancel();
        }
      }

      submitBtn.addEventListener('click', handleSubmit);
      cancelBtn.addEventListener('click', handleCancel);
      closeBtn.addEventListener('click', handleCancel);
      inputEl.addEventListener('keydown', handleKeyDown);
    });
  }

  showRestoreSessionBanner(lastWorkspace) {
    const banner = document.getElementById('restore-banner');
    const pathEl = document.getElementById('restore-banner-path');
    const btnRestore = document.getElementById('btn-restore-session');
    
    if (banner && pathEl && btnRestore) {
      pathEl.innerText = lastWorkspace;
      pathEl.title = lastWorkspace;
      btnRestore.setAttribute('data-path', lastWorkspace);
      
      // Slide up banner after a brief delay
      setTimeout(() => {
        banner.classList.add('active');
      }, 1200);
    }
  }

  normalizePath(p) {
    if (!p) return '';
    return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase();
  }

  updateAutoRestoreButtonLabel() {
    if (this.btnAutoRestore) {
      this.btnAutoRestore.innerHTML = this.autoRestore ? 'Auto-Restore: ON' : 'Auto-Restore: OFF';
      this.btnAutoRestore.classList.toggle('btn-primary', this.autoRestore);
    }
  }
}

// Instantiate App on DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AetherApp();
});
