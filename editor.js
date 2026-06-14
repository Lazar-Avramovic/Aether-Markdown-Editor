// Aether: Markdown Compiler & Editor Utilities

class MarkdownCompiler {
  constructor() {
    this.codeBlocks = [];
    this.inlineCode = [];
  }

  // Pre-processor to strictly escape raw HTML tags to prevent XSS
  escapeHTML(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  compile(markdownText) {
    this.codeBlocks = [];
    this.inlineCode = [];

    if (!markdownText) return '';

    // 1. Escape all raw HTML first (XSS mitigation)
    let html = this.escapeHTML(markdownText);

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
    html = html.replace(/((?:<li-u>.*<\/li-u>\s*)+)/g, '<ul>$1</ul>');
    html = html.replace(/<li-u>/g, '<li>').replace(/<\/li-u>/g, '</li>');

    // Ordered Lists (1. or 2.)
    html = html.replace(/^\s*\d+\.\s+(.*)$/gm, '<li-o>$1</li-o>');
    html = html.replace(/((?:<li-o>.*<\/li-o>\s*)+)/g, '<ol>$1</ol>');
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

    // 9. Links: [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 10. Paragraphs
    // Split by two or more newlines to identify paragraphs, wrapping untagged blocks in <p>
    const blocks = html.split(/\n{2,}/);
    const parsedBlocks = blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // If it already starts with a block tag, return as is
      const blockTags = /^(<h[1-6]|<ul|<ol|<blockquote|<pre|<hr|<div|<p)/i;
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

// Line Number Gutter Synchronization Utility
function updateLineNumbers(textarea, gutter) {
  if (!textarea || !gutter) return;
  
  const text = textarea.value;
  const lineCount = text.split('\n').length;
  
  let html = '';
  for (let i = 1; i <= lineCount; i++) {
    html += `<span class="line-number-node">${i}</span>`;
  }
  gutter.innerHTML = html;
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
