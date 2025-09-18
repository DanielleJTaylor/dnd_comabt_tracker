
(() => {
  const bar = document.getElementById('formatBar');
  const select = document.getElementById('formatBlockSelect');
  const btnInlineCode = document.getElementById('btnInlineCode');
  const btnCheckbox   = document.getElementById('btnCheckbox');
  const btnCreateLink = document.getElementById('btnCreateLink');

  let activeCE = null; // last-focused contenteditable within .block .block-content

  // Track focus inside blocks
  document.addEventListener('focusin', (e) => {
    const ce = e.target.closest('.block .block-content[contenteditable="true"]');
    if (ce) activeCE = ce;
  });

  // Helper: ensure we act on the right element
  function focusActiveCE() {
    if (!activeCE || !document.body.contains(activeCE)) return false;
    activeCE.focus();
    return true;
  }

  // Basic commands (bold, lists, alignment, etc.)
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-cmd]');
    if (!btn) return;
    e.preventDefault();
    if (!focusActiveCE()) return;
    const cmd = btn.dataset.cmd;
    document.execCommand(cmd, false, null);
  });

  // Block format (headings / paragraph / quote)
  select.addEventListener('change', () => {
    if (!focusActiveCE()) return;
    const tag = select.value.toLowerCase();
    // execCommand expects HTML-ish names like 'H1' or 'blockquote'
    const value = tag === 'p' ? 'P' : tag.toUpperCase();
    document.execCommand('formatBlock', false, value);
  });

  // Inline code — wrap selection in <code>
  btnInlineCode.addEventListener('click', (e) => {
    e.preventDefault();
    if (!focusActiveCE()) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    // If selection already inside <code>, toggle it off
    const codeAncestor = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest('code');
    if (codeAncestor) {
      // unwrap <code>
      const parent = codeAncestor.parentNode;
      while (codeAncestor.firstChild) parent.insertBefore(codeAncestor.firstChild, codeAncestor);
      parent.removeChild(codeAncestor);
      return;
    }

    // Otherwise, wrap selection
    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      // Insert empty code tag user can type in
      const code = document.createElement('code');
      code.appendChild(document.createTextNode('code'));
      range.insertNode(code);
      // place caret after inserted node
      sel.removeAllRanges();
      const r = document.createRange();
      r.setStartAfter(code);
      r.collapse(true);
      sel.addRange(r);
    } else {
      const code = document.createElement('code');
      code.appendChild(range.cloneContents());
      range.deleteContents();
      range.insertNode(code);
      sel.removeAllRanges();
      const r = document.createRange();
      r.selectNodeContents(code);
      r.collapse(false);
      sel.addRange(r);
    }
  });

  // Insert checkbox
  btnCheckbox.addEventListener('click', (e) => {
    e.preventDefault();
    if (!focusActiveCE()) return;

    const sel = window.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    const label = document.createElement('span');
    label.className = 'cb';
    label.innerHTML = `<input type="checkbox"> <span></span>`;
    if (range && !range.collapsed) range.deleteContents();
    const insertionPoint = range || document.createRange();
    if (!range) {
      insertionPoint.selectNodeContents(activeCE);
      insertionPoint.collapse(false);
    }
    insertionPoint.insertNode(label);
    // move caret after the checkbox wrapper
    sel.removeAllRanges();
    const r = document.createRange();
    r.setStartAfter(label);
    r.collapse(true);
    sel.addRange(r);
  });

  // Create link (wrap selection or insert at caret)
  btnCreateLink.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!focusActiveCE()) return;

    const url = prompt('Enter URL (https://...)');
    if (!url) return;

    // If there is a selection, wrap it; else insert link text = URL
    const sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.getRangeAt(0).collapsed) {
      document.execCommand('createLink', false, url);
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.textContent = url;
      const r = sel.getRangeAt(0);
      r.insertNode(a);
      r.setStartAfter(a);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  });

  // Keep select in sync-ish with caret position (optional, lightweight)
  document.addEventListener('selectionchange', () => {
    if (!activeCE || !document.body.contains(activeCE)) return;
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode || !activeCE.contains(sel.anchorNode)) return;

    let block = (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    block = block && block.closest('h1,h2,h3,h4,h5,h6,blockquote,p,div');
    const tag = (block?.tagName || 'P').toLowerCase();
    const value = ['h1','h2','h3','h4','h5','h6','blockquote'].includes(tag) ? tag : 'p';
    if (select.value !== value) select.value = value;
  });
})();

