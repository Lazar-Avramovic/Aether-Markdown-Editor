// Aether: Markdown Compiler & Editor Utilities

class MarkdownCompiler {
  constructor() {
    this.codeBlocks = [];
    this.inlineCode = [];
    this.rawImages = [];
  }

  // Pre-processor to strictly escape raw HTML tags to prevent XSS
  escapeHTML(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Parse markdown image syntax: ![alt](url) with support for titles, sizes, and local paths
  parseImages(text, basePath = '') {
    let result = '';
    let i = 0;
    while (i < text.length) {
      if (text[i] === '!' && text[i + 1] === '[') {
        let closeBracket = text.indexOf(']', i + 2);
        if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
          let openParen = closeBracket + 1;
          let depth = 1;
          let j = openParen + 1;
          while (j < text.length && depth > 0) {
            if (text[j] === '(') depth++;
            else if (text[j] === ')') depth--;
            if (depth > 0) j++;
          }
          if (depth === 0) {
            let alt = text.slice(i + 2, closeBracket);
            let target = text.slice(openParen + 1, j).trim();

            let url = '';
            let title = '';
            let width = '';
            let height = '';

            // Check for angle bracket URL: <url>
            if (target.startsWith('&lt;')) {
              const closeAngle = target.indexOf('&gt;');
              if (closeAngle !== -1) {
                url = target.slice(4, closeAngle).trim();
                target = target.slice(closeAngle + 4).trim();
              }
            } else if (target.startsWith('<')) {
              const closeAngle = target.indexOf('>');
              if (closeAngle !== -1) {
                url = target.slice(1, closeAngle).trim();
                target = target.slice(closeAngle + 1).trim();
              }
            }

            if (!url) {
              const titleMatch = target.match(/\s+["'](.*?)["']$/);
              if (titleMatch) {
                title = titleMatch[1];
                target = target.slice(0, titleMatch.index).trim();
              }

              const sizeMatch = target.match(/\s+=([0-9]+)?x([0-9]+)?$/);
              if (sizeMatch) {
                if (sizeMatch[1]) width = sizeMatch[1];
                if (sizeMatch[2]) height = sizeMatch[2];
                target = target.slice(0, sizeMatch.index).trim();
              }

              url = target.trim();
            } else {
              const titleMatch = target.match(/["'](.*?)["']/);
              if (titleMatch) title = titleMatch[1];
              const sizeMatch = target.match(/=([0-9]+)?x([0-9]+)?/);
              if (sizeMatch) {
                if (sizeMatch[1]) width = sizeMatch[1];
                if (sizeMatch[2]) height = sizeMatch[2];
              }
            }

            // Check for size in alt: ![alt|300x200](url) or ![alt|300](url)
            if (alt.includes('|')) {
              const parts = alt.split('|');
              const sizePart = parts[parts.length - 1].trim();
              const altSizeMatch = sizePart.match(/^(\d+)(?:x(\d+))?$/);
              if (altSizeMatch) {
                parts.pop();
                alt = parts.join('|').trim();
                if (!width) width = altSizeMatch[1];
                if (!height && altSizeMatch[2]) height = altSizeMatch[2];
              }
            }

            let src = url;
            // Block unsafe protocols
            if (/^\s*(?:javascript|vbscript|data:(?!image\/)):/i.test(src)) {
              src = '#';
            } else if (basePath && !/^(?:[a-z]+:|\/\/)/i.test(src) && !src.startsWith('data:image/')) {
              // Relative local file - resolve against active document directory
              let cleanRel = src.replace(/^\.\//, '');
              let resolved = (basePath.replace(/\\/g, '/') + '/' + cleanRel.replace(/\\/g, '/')).replace(/\/+/g, '/');
              src = 'aether-media://file/' + resolved;
            } else if (/^[a-zA-Z]:[\\\/]/.test(src)) {
              let resolved = src.replace(/\\/g, '/');
              src = 'aether-media://file/' + resolved;
            } else if (src.startsWith('file:///')) {
              let clean = src.replace(/^file:\/\/\/?/, '');
              src = 'aether-media://file/' + clean.replace(/\\/g, '/');
            }

            const safeAlt = alt.replace(/"/g, '&quot;');
            const safeTitle = title.replace(/"/g, '&quot;');
            const safeSrc = src.replace(/"/g, '&quot;');

            let attrs = `src="${safeSrc}" alt="${safeAlt}"`;
            if (safeTitle) attrs += ` title="${safeTitle}"`;
            if (width) attrs += ` width="${width}"`;
            if (height) attrs += ` height="${height}"`;
            attrs += ' loading="lazy" class="markdown-image" onerror="this.classList.add(\'img-broken\');"';

            result += `<img ${attrs}>`;
            i = j + 1;
            continue;
          }
        }
      }
      result += text[i];
      i++;
    }
    return result;
  }

  // Split a markdown table row into cells, respecting escaped pipes \|
  splitTableRow(row) {
    let trimmed = row.trim();
    if (trimmed.startsWith('|')) {
      trimmed = trimmed.slice(1);
    }
    if (trimmed.endsWith('|')) {
      let backslashes = 0;
      for (let j = trimmed.length - 2; j >= 0 && trimmed[j] === '\\'; j--) {
        backslashes++;
      }
      if (backslashes % 2 === 0) {
        trimmed = trimmed.slice(0, -1);
      }
    }

    const cells = [];
    let current = '';
    let backslashes = 0;

    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];
      if (char === '\\') {
        backslashes++;
        current += char;
      } else if (char === '|' && backslashes % 2 === 0) {
        cells.push(current.trim());
        current = '';
        backslashes = 0;
      } else {
        current += char;
        backslashes = 0;
      }
    }
    cells.push(current.trim());

    return cells.map(cell => {
      // Unescape escaped pipes
      let unescaped = cell.replace(/\\\|/g, '|');
      // Support manual <br> tags within table cells
      unescaped = unescaped.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
      return unescaped;
    });
  }

  // Validate delimiter row (e.g. | :--- | :---: | ---: |)
  isDelimiterRow(row) {
    if (!row || !row.includes('-')) return false;
    const cells = this.splitTableRow(row);
    if (cells.length === 0) return false;
    return cells.every(c => /^\s*:?-{1,}:?\s*$/.test(c));
  }

  // Extract alignment styles from delimiter cells
  parseAlignments(delimCells) {
    return delimCells.map(cell => {
      const trimmed = cell.trim();
      const left = trimmed.startsWith(':');
      const right = trimmed.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      if (left) return 'left';
      return '';
    });
  }

  // Parse GFM Markdown Tables into HTML tables wrapped in a responsive scroll container
  parseTables(html) {
    const lines = html.split('\n');
    const result = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const nextLine = (i + 1 < lines.length) ? lines[i + 1] : null;

      // Check if current line and next line form a valid table header and delimiter
      if (nextLine !== null && (line.includes('|') || nextLine.includes('|')) && this.isDelimiterRow(nextLine)) {
        const headerCells = this.splitTableRow(line);
        const delimCells = this.splitTableRow(nextLine);

        if (headerCells.length > 0 && delimCells.length > 0 && headerCells.length === delimCells.length) {
          const colCount = delimCells.length;
          const alignments = this.parseAlignments(delimCells);

          let tableHtml = '<div class="table-container"><table class="markdown-table"><thead><tr>';
          for (let c = 0; c < colCount; c++) {
            const alignStyle = alignments[c] ? ` style="text-align: ${alignments[c]};"` : '';
            tableHtml += `<th${alignStyle}>${headerCells[c] || ''}</th>`;
          }
          tableHtml += '</tr></thead>';

          // Collect body rows
          const bodyRows = [];
          let j = i + 2;
          while (j < lines.length) {
            const rowLine = lines[j];
            const trimmedRow = rowLine.trim();

            if (trimmedRow === '') break;
            // Stop if another block begins (e.g. code block or heading)
            if (/^```/.test(trimmedRow) || /^#{1,6}\s/.test(trimmedRow)) break;
            // Must contain pipe to be a valid table row
            if (!rowLine.includes('|')) break;

            const rowCells = this.splitTableRow(rowLine);
            // Pad or clamp to column count
            const normalizedCells = [];
            for (let c = 0; c < colCount; c++) {
              normalizedCells.push(rowCells[c] !== undefined ? rowCells[c] : '');
            }
            bodyRows.push(normalizedCells);
            j++;
          }

          if (bodyRows.length > 0) {
            tableHtml += '<tbody>';
            for (const row of bodyRows) {
              tableHtml += '<tr>';
              for (let c = 0; c < colCount; c++) {
                const alignStyle = alignments[c] ? ` style="text-align: ${alignments[c]};"` : '';
                tableHtml += `<td${alignStyle}>${row[c]}</td>`;
              }
              tableHtml += '</tr>';
            }
            tableHtml += '</tbody>';
          }

          tableHtml += '</table></div>';

          // Separate with blank lines so surrounding paragraphs are clean
          result.push('');
          result.push(tableHtml);
          result.push('');

          i = j;
          continue;
        }
      }

      result.push(line);
      i++;
    }

    return result.join('\n');
  }

  compile(markdownText, basePath = '') {
    this.codeBlocks = [];
    this.inlineCode = [];
    this.rawImages = [];

    if (!markdownText) return '';

    // 0. Protect safe raw <img> tags before HTML escaping
    let text = markdownText.replace(/<img\s+([^>]*?)\s*\/?>/gi, (match, attrs) => {
      if (/\bon\w+\s*=/i.test(attrs) || /javascript:/i.test(attrs)) {
        return '';
      }
      const srcMatch = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      if (!srcMatch) return '';
      let src = (srcMatch[1] || srcMatch[2] || srcMatch[3] || '').trim();

      if (basePath && !/^(?:[a-z]+:|\/\/)/i.test(src) && !src.startsWith('data:image/')) {
        let cleanRel = src.replace(/^\.\//, '');
        let resolved = (basePath.replace(/\\/g, '/') + '/' + cleanRel.replace(/\\/g, '/')).replace(/\/+/g, '/');
        src = 'aether-media://file/' + resolved;
      } else if (/^[a-zA-Z]:[\\\/]/.test(src)) {
        let resolved = src.replace(/\\/g, '/');
        src = 'aether-media://file/' + resolved;
      }

      let safeTag = match.replace(/\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, `src="${src.replace(/"/g, '&quot;')}"`);
      if (!safeTag.includes('class=')) {
        safeTag = safeTag.replace(/<img/i, '<img class="markdown-image" onerror="this.classList.add(\'img-broken\');"');
      }
      if (!safeTag.includes('loading=')) {
        safeTag = safeTag.replace(/<img/i, '<img loading="lazy"');
      }
      const index = this.rawImages.length;
      this.rawImages.push(safeTag);
      return `RAWIMAGEPLACEHOLDER${index}PLACEHOLDER`;
    });

    // 1. Escape all raw HTML first (XSS mitigation)
    let html = this.escapeHTML(text);

    // 2. Protect Code Blocks (parse them first so their markdown content isn't converted)
    // Match ```lang\ncode\n```
    html = html.replace(/```(\w*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
      const index = this.codeBlocks.length;
      this.codeBlocks.push({ lang: lang || 'code', code: code });
      return `CODEBLOCKPLACEHOLDER${index}PLACEHOLDER`;
    });

    // 3. Protect Inline Code (match `code`)
    html = html.replace(/`([^`\n]+)`/g, (match, code) => {
      const index = this.inlineCode.length;
      this.inlineCode.push(code);
      return `INLINECODEPLACEHOLDER${index}PLACEHOLDER`;
    });

    // 3.5 Tables (GFM Markdown Tables - parsed before lists, rules, and inline styling)
    html = this.parseTables(html);

    // 4. Headers (matched only at beginning of lines)
    html = html.replace(/^###### (.*)$/gm, '<h6>$1</h6>');
    html = html.replace(/^##### (.*)$/gm, '<h5>$1</h5>');
    html = html.replace(/^#### (.*)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');

    // 5. Blockquotes (lines starting with >)
    html = html.replace(/^\s*>\s+(.*)$/gm, '<blockquote><p>$1</p></blockquote>');
    // Merge consecutive blockquotes
    html = html.replace(/<\/blockquote>\s*<blockquote>/g, '\n');

    // 6. Lists
    // Unordered Lists (* or -)
    html = html.replace(/^\s*[\*\-]\s+(.*)$/gm, '<li-u>$1</li-u>');
    html = html.replace(/((?:<li-u>.*<\/li-u>\s*)+)/g, (match) => {
      const items = match.trim().replace(/<\/li-u>\s*<li-u>/g, '</li-u>\n<li-u>');
      return `\n\n<ul>\n${items}\n</ul>\n\n`;
    });
    html = html.replace(/<li-u>/g, '<li>').replace(/<\/li-u>/g, '</li>');

    // Ordered Lists (1. or 2.)
    html = html.replace(/^\s*\d+\.\s+(.*)$/gm, '<li-o>$1</li-o>');
    html = html.replace(/((?:<li-o>.*<\/li-o>\s*)+)/g, (match) => {
      const items = match.trim().replace(/<\/li-o>\s*<li-o>/g, '</li-o>\n<li-o>');
      return `\n\n<ol>\n${items}\n</ol>\n\n`;
    });
    html = html.replace(/<li-o>/g, '<li>').replace(/<\/li-o>/g, '</li>');

    // 7. Horizontal Rules (--- or *** or ___)
    html = html.replace(/^[\*\-\_]{3,}$/gm, '<hr>');

    // 8. Inline Styling (Bold, Italic, Strikethrough)
    // Bold: **text** or __text__
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // Italic: *text* or _text_
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    // Strikethrough: ~~text~~
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // 8.5 Images: ![alt](url) (Parsed before links so [![alt](img)](link) works and ![alt](img) is not mistaken for a link)
    html = this.parseImages(html, basePath);

    // 9. Links: [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 10. Paragraphs
    // Split by two or more newlines to identify paragraphs, wrapping untagged blocks in <p>
    const blocks = html.split(/\n{2,}/);
    const parsedBlocks = blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // If it already starts with a block tag, return as is
      const blockTags = /^(<h[1-6]|<ul|<ol|<blockquote|<pre|<hr|<div|<p|<figure|<img|<table|CODEBLOCKPLACEHOLDER)/i;
      if (blockTags.test(trimmed)) {
        return trimmed;
      }
      // Otherwise wrap in paragraph, transforming single newlines to breaks
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    });
    html = parsedBlocks.join('\n');

    // 11. Restore protected Inline Code
    html = html.replace(/INLINECODEPLACEHOLDER(\d+)PLACEHOLDER/g, (match, index) => {
      return `<code>${this.inlineCode[parseInt(index)]}</code>`;
    });

    // 12. Restore protected Code Blocks
    html = html.replace(/CODEBLOCKPLACEHOLDER(\d+)PLACEHOLDER/g, (match, index) => {
      const block = this.codeBlocks[parseInt(index)];
      return `
        <div class="code-block-header">
          <span>${block.lang}</span>
          <button class="copy-code-btn" onclick="copyCode(this)">Copy</button>
        </div>
        <pre><code class="language-${block.lang}">${block.code}</code></pre>
      `;
    });

    // 13. Restore protected raw images
    html = html.replace(/RAWIMAGEPLACEHOLDER(\d+)PLACEHOLDER/g, (match, index) => {
      return this.rawImages[parseInt(index)] || '';
    });

    return html;
  }
}

// Global copy function for markdown code blocks
window.copyCode = function(button) {
  const pre = button.parentElement.nextElementSibling;
  if (!pre) return;
  const code = pre.querySelector('code');
  if (!code) return;

  navigator.clipboard.writeText(code.innerText).then(() => {
    button.innerText = 'Copied!';
    button.style.color = '#00f0ff';
    button.style.borderColor = 'rgba(0, 240, 255, 0.4)';
    setTimeout(() => {
      button.innerText = 'Copy';
      button.style.color = '';
      button.style.borderColor = '';
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy code: ', err);
  });
};

// Line Number Gutter Synchronization Utility (Optimized with count caching)
function updateLineNumbers(textarea, gutter) {
  if (!textarea || !gutter) return;
  
  const text = textarea.value;
  let lineCount = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lineCount++;
  }
  
  if (gutter._lastLineCount === lineCount) return;
  gutter._lastLineCount = lineCount;

  const chunks = new Array(lineCount);
  for (let i = 0; i < lineCount; i++) {
    chunks[i] = `<span class="line-number-node">${i + 1}</span>`;
  }
  gutter.innerHTML = chunks.join('');
}

// Bidirectional Scroll Sync Manager
function initScrollSync(textarea, preview, gutter) {
  let activeScrollSource = null;

  textarea.addEventListener('mouseenter', () => {
    activeScrollSource = 'editor';
  });

  preview.addEventListener('mouseenter', () => {
    activeScrollSource = 'preview';
  });

  textarea.addEventListener('scroll', () => {
    // Keep gutter line numbers locked in place vertically
    if (gutter) {
      gutter.scrollTop = textarea.scrollTop;
    }
    
    if (activeScrollSource === 'editor') {
      const scrollableHeightTextarea = textarea.scrollHeight - textarea.clientHeight;
      if (scrollableHeightTextarea <= 0) return;
      
      const ratio = textarea.scrollTop / scrollableHeightTextarea;
      const scrollableHeightPreview = preview.scrollHeight - preview.clientHeight;
      preview.scrollTop = ratio * scrollableHeightPreview;
    }
  });

  preview.addEventListener('scroll', () => {
    if (activeScrollSource === 'preview') {
      const scrollableHeightPreview = preview.scrollHeight - preview.clientHeight;
      if (scrollableHeightPreview <= 0) return;
      
      const ratio = preview.scrollTop / scrollableHeightPreview;
      const scrollableHeightTextarea = textarea.scrollHeight - textarea.clientHeight;
      textarea.scrollTop = ratio * scrollableHeightTextarea;
      
      if (gutter) {
        gutter.scrollTop = textarea.scrollTop;
      }
    }
  });
}
