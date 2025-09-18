// scripts/formatting-toolbar.js
(() => {
  const bar          = document.getElementById('formatBar');
  const select       = document.getElementById('formatBlockSelect');
  const btnInlineCode= document.getElementById('btnInlineCode');
  const btnCheckbox  = document.getElementById('btnCheckbox');
  const btnCreateLink= document.getElementById('btnCreateLink');

  let activeCE = null; // last-focused .block .block-content[contenteditable]

  // Track focus inside blocks so toolbar knows where to act
  document.addEventListener('focusin', (e) => {
    const ce = e.target.closest('.block .block-content[contenteditable="true"]');
    if (ce) activeCE = ce;
  });

  function focusActiveCE() {
    if (!activeCE || !document.body.contains(activeCE)) return false;
    activeCE.focus();
    return true;
  }

  // ----- Toolbar: execCommand buttons (bold/italic/underline/strike, lists, etc.)
  bar?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    // alignment buttons use data-align
    const align = btn.dataset.align;
    if (align) {
      e.preventDefault();
      if (!focusActiveCE()) return;
      // Set per-block alignment via data attribute (CSS controls rendering)
      activeCE.setAttribute('data-align', align);
      return;
    }

    const cmd = btn.dataset.cmd;
    if (!cmd) return;

    e.preventDefault();
    if (!focusActiveCE()) return;

    // execCommand is deprecated but still the simplest for CE usage in all browsers you target
    document.execCommand(cmd, false, null);
  });

  // ----- Heading / paragraph / quote (block format)
  select?.addEventListener('change', () => {
    if (!focusActiveCE()) return;
    const tag   = select.value.toLowerCase();
    const value = tag === 'p' ? 'P' : tag === 'blockquote' ? 'blockquote' : tag.toUpperCase();
    document.execCommand('formatBlock', false, value);
  });

  // ----- Inline code toggle (<code>)
  btnInlineCode?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!focusActiveCE()) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const anchorEl = (sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement));
    const inCode   = anchorEl?.closest('code');

    if (inCode) {
      // unwrap code
      const parent = inCode.parentNode;
      while (inCode.firstChild) parent.insertBefore(inCode.firstChild, inCode);
      parent.removeChild(inCode);
      return;
    }

    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      const code = document.createElement('code');
      code.appendChild(document.createTextNode('code'));
      range.insertNode(code);
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

  // ----- Insert checkbox
  btnCheckbox?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!focusActiveCE()) return;

    const sel = window.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;

    const wrap = document.createElement('span');
    wrap.className = 'cb';
    wrap.innerHTML = `<input type="checkbox"> <span></span>`;

    if (range && !range.collapsed) range.deleteContents();
    const ins = range || document.createRange();
    if (!range) {
      ins.selectNodeContents(activeCE);
      ins.collapse(false);
    }
    ins.insertNode(wrap);

    // move caret after
    sel.removeAllRanges();
    const r = document.createRange();
    r.setStartAfter(wrap);
    r.collapse(true);
    sel.addRange(r);
  });

  // ----- Create link
  btnCreateLink?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!focusActiveCE()) return;

    const url = prompt('Enter URL (https://...)');
    if (!url) return;

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

  // ----- Keep block-format select roughly in sync with caret
  document.addEventListener('selectionchange', () => {
    if (!activeCE || !document.body.contains(activeCE)) return;
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode || !activeCE.contains(sel.anchorNode)) return;
    let block = (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    block = block?.closest('h1,h2,h3,h4,h5,h6,blockquote,p,div');
    const tag = (block?.tagName || 'P').toLowerCase();
    const value = ['h1','h2','h3','h4','h5','h6','blockquote'].includes(tag) ? tag : 'p';
    if (select && select.value !== value) select.value = value;
  });

  // ===== Backspace helpers =====
  function isAtLineStart(range) {
    if (!range || !range.collapsed) return false;
    const r = range.cloneRange();
    r.setStart(range.startContainer, 0);
    return r.toString().trim().length === 0;
  }

  function tryRemovePrevCheckbox(range) {
    if (!range || !range.collapsed) return false;
    let node = range.startContainer;

    // If we're inside a text node, check the previous sibling of its parent when at offset 0
    if (node.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
      const prev = node.previousSibling;
      if (prev && prev.classList && prev.classList.contains('cb')) {
        prev.remove();
        return true;
      }
    }

    // If caret is at start of an element node
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = /** @type {Element} */ (node);
      const before = el.childNodes[range.startOffset - 1];
      if (before && before.classList && before.classList.contains('cb')) {
        before.remove();
        return true;
      }
    }

    // Or if just after a .cb wrapper (the wrapper may be the previousSibling of a text node we’re inside)
    if (node.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
      // normal backspace will handle text; do nothing
      return false;
    }

    // Walk up once and check previousSibling
    const parent = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const prev = parent?.previousSibling;
    if (prev && prev.classList && prev.classList.contains('cb')) {
      prev.remove();
      return true;
    }

    return false;
  }

  function tryUnwrapEmptyListItem(range) {
    if (!range || !range.collapsed) return false;
    let el = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    if (!el) return false;
    const li = el.closest('li');
    if (!li) return false;

    const list = li.parentElement;
    if (!list || (list.tagName !== 'UL' && list.tagName !== 'OL')) return false;

    // If at line start and LI is empty (or just whitespace/BR), unwrap
    const text = li.textContent.replace(/\u200B/g, '').trim(); // remove zero-width
    if (!isAtLineStart(range)) return false;
    if (text.length > 0) return false;

    // unwrap LI -> replace with plain paragraph
    const p = document.createElement('p');
    p.innerHTML = ''; // empty paragraph
    list.insertBefore(p, li);
    li.remove();

    // If list becomes empty, remove the list
    if (!list.querySelector('li')) list.remove();

    // place caret in new paragraph
    const sel = window.getSelection();
    sel.removeAllRanges();
    const r = document.createRange();
    r.selectNodeContents(p);
    r.collapse(true);
    sel.addRange(r);
    return true;
  }

  // Install a keydown guard on any contenteditable inside blocks
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Backspace') return;
    const ce = e.target.closest?.('.block .block-content[contenteditable="true"]');
    if (!ce) return;

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    // 1) If immediately after our checkbox wrapper, remove the wrapper
    if (tryRemovePrevCheckbox(range)) {
      e.preventDefault();
      return;
    }

    // 2) If at start of an empty list item, unwrap to paragraph
    if (tryUnwrapEmptyListItem(range)) {
      e.preventDefault();
      return;
    }
  });
})();
