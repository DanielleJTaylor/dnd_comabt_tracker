// dashboard-sheet.js
// Hold-to-drag, ghost previews, collision pushing, right/bottom/corner resize,
// image blocks (no mixed text), autosave + export.

document.addEventListener('DOMContentLoaded', () => {
  // ---- DOM & State ----
  const blocksContainer  = document.getElementById('blocks-container');
  const addBlockBtn      = document.getElementById('add-block-btn');
  const lockButton       = document.getElementById('lock-toggle-btn');
  const sheetContainer   = document.getElementById('sheet-container');
  const formatToolbar    = document.getElementById('format-toolbar');
  const exportBtn        = document.getElementById('export-btn');
  const saveStatusBtn    = document.getElementById('save-status-btn');

  let isLocked = false;
  let ghostEl = null; // A single ghost element for previews

  // Saving state
  let saveTimer = null;
  let saveInFlight = false;
  let lastSavedSnapshot = null; // to cheaply avoid redundant saves
  const DASH_ID = getDashboardIdFromURL(); // current sheet id

  // -------- utils --------
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function beginInteractionSelectionGuard() {
    // stop typing immediately
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    // clear any highlighted text
    const sel = window.getSelection && window.getSelection();
    if (sel && sel.removeAllRanges) sel.removeAllRanges();

    // disable selection while moving
    document.body.classList.add('no-select');
  }
  function endInteractionSelectionGuard() {
    document.body.classList.remove('no-select');
  }

  // ========== GRID METRICS ==========
  function getMetrics() {
    const cs = getComputedStyle(blocksContainer);
    const cols = parseInt(cs.getPropertyValue('--grid-columns')) || 12;
    const gap = parseFloat(cs.gap) || 0;
    const contentW = blocksContainer.clientWidth;
    const cellW = (contentW - gap * (cols - 1)) / cols;
    const rowUnit = parseFloat(cs.getPropertyValue('--row-size')) || 40;
    return { cols, gap, cellW, rowUnit };
  }

  // ========== OCCUPANCY & COLLISION ==========
  function rectsOverlap(a, b) {
    return !(
      a.colStart + a.colSpan <= b.colStart ||
      b.colStart + b.colSpan <= a.colStart ||
      a.rowStart + a.rowSpan <= b.rowStart ||
      b.rowStart + b.rowSpan <= a.rowStart
    );
  }
  function getAllRects(excludeEl) {
    return [...blocksContainer.querySelectorAll('.block')]
      .filter(el => el !== excludeEl)
      .map(readRect);
  }
  function collides(targetRect, excludeEl) {
    return getAllRects(excludeEl).some(r => rectsOverlap(targetRect, r));
  }
  function dropToFreeRow(rect, excludeEl) {
    let testRect = { ...rect };
    while (collides(testRect, excludeEl)) testRect.rowStart += 1;
    return testRect;
  }
  function resolveCollisions(pusherRect, excludeEl) {
    const victims = getAllRects(excludeEl).filter(r => rectsOverlap(pusherRect, r));
    victims.sort((a, b) => a.rowStart - b.rowStart);
    for (const victimRect of victims) {
      const newRowStart = pusherRect.rowStart + pusherRect.rowSpan;
      const newVictimRect = { ...victimRect, rowStart: newRowStart };
      writeRect(victimRect.el, newVictimRect);
      resolveCollisions(newVictimRect, victimRect.el);
    }
  }

  // ========== DATA HELPERS ==========
  function readRect(el) {
    if (!el) return null;
    return {
      el,
      colStart: +el.dataset.colStart,
      rowStart: +el.dataset.rowStart,
      colSpan: +el.dataset.colSpan,
      rowSpan: +el.dataset.rowSpan
    };
  }
  function writeRect(el, rect) {
    if (!el || !rect) return;
    el.dataset.colStart = rect.colStart;
    el.dataset.rowStart = rect.rowStart;
    el.dataset.colSpan = rect.colSpan;
    el.dataset.rowSpan = rect.rowSpan;
    el.style.gridColumn = `${rect.colStart} / span ${rect.colSpan}`;
    el.style.gridRow = `${rect.rowStart} / span ${rect.rowSpan}`;
  }

  // ========== IMAGE BLOCK MODE ==========
  function makeImageBlock(block, dataUrl) {
    block.classList.add('image-block');
    const content = block.querySelector('.block-content');
    content.innerHTML = '';
    content.setAttribute('contenteditable', 'false');

    const wrap = document.createElement('div');
    wrap.className = 'img-wrap';
    wrap.innerHTML = `
      <div class="img-actions">
        <button data-img="replace" title="Replace">Replace</button>
        <button data-img="remove"  title="Remove">Remove</button>
        <button data-img="fit"     title="Fit">Fit</button>
        <button data-img="fill"    title="Fill">Fill</button>
      </div>
      <img alt="">
    `;
    wrap.querySelector('img').src = dataUrl;
    content.appendChild(wrap);

    bindImageResizer(block);
    bindImageActions(block);
  }

  function revokeImageBlock(block) {
    block.classList.remove('image-block');
    const content = block.querySelector('.block-content');
    content.innerHTML = '';
    content.setAttribute('contenteditable', 'true');
    content.focus();
  }

  function bindImageResizer(block) {
    const wrap = block.querySelector('.img-wrap');
    if (!wrap) return;
    wrap.style.width = '100%';
    wrap.style.height = '100%';

    const restrictRect = block.querySelector('.block-content');

    interact(wrap).resizable({
      edges: { right: true, bottom: true, bottomRight: true, top: false, left: false, topLeft: false, topRight: false, bottomLeft: false },
      listeners: {
        start() {
          beginInteractionSelectionGuard();
          wrap.classList.add('resizing-image');
          const cs = getComputedStyle(wrap);
          wrap.dataset.w = parseFloat(cs.width) || wrap.clientWidth;
          wrap.dataset.h = parseFloat(cs.height) || wrap.clientHeight;
        },
        move(evt) {
          const startW = parseFloat(wrap.dataset.w);
          const startH = parseFloat(wrap.dataset.h);
          let w = startW + evt.deltaRect.width;
          let h = startH + evt.deltaRect.height;

          const bounds = restrictRect.getBoundingClientRect();
          const wrapRect = wrap.getBoundingClientRect();
          const maxW = bounds.width - (wrapRect.left - bounds.left);
          const maxH = bounds.height - (wrapRect.top - bounds.top);

          w = Math.max(40, Math.min(w, maxW));
          h = Math.max(40, Math.min(h, maxH));

          wrap.style.width = `${w}px`;
          wrap.style.height = `${h}px`;
        },
        end() {
          wrap.classList.remove('resizing-image');
          endInteractionSelectionGuard();
          requestSave();
        }
      }
    });
  }

  function bindImageActions(block) {
    const actions = block.querySelector('.img-actions');
    const wrap = block.querySelector('.img-wrap');
    const img = wrap?.querySelector('img');
    if (!actions || !wrap || !img) return;

    actions.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const act = btn.dataset.img;

      if (act === 'replace') {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.onchange = async () => {
          const file = inp.files?.[0];
          if (file) {
            img.src = await fileToDataUrl(file);
            requestSave();
          }
          inp.remove();
        };
        inp.click();
        return;
      }

      if (act === 'remove') {
        revokeImageBlock(block);
        requestSave();
        return;
      }

      if (act === 'fit') {
        wrap.style.width = '100%';
        wrap.style.height = '100%';
        img.style.objectFit = 'contain';
        requestSave();
        return;
      }

      if (act === 'fill') {
        wrap.style.width = '100%';
        wrap.style.height = '100%';
        img.style.objectFit = 'cover';
        requestSave();
        return;
      }
    });
  }

  // ========== SAVE / LOAD / EXPORT ==========
  function getDashboardIdFromURL() {
    const p = new URLSearchParams(location.search);
    return p.get('id') || `dash_${Date.now()}`;
  }

  function markSaving() {
    saveStatusBtn.textContent = 'Saving...';
    saveStatusBtn.classList.remove('saved');
    saveStatusBtn.classList.add('saving');
  }
  function markSaved() {
    saveStatusBtn.textContent = 'Saved';
    saveStatusBtn.classList.remove('saving');
    saveStatusBtn.classList.add('saved');
  }

  function serializeSheet() {
    const title = document.getElementById('sheet-title')?.textContent?.trim() || 'Untitled Dashboard';
    const blocks = [...blocksContainer.querySelectorAll('.block')].map(b => {
      const rect = readRect(b);
      if (b.classList.contains('image-block')) {
        const wrap = b.querySelector('.img-wrap');
        const img = wrap?.querySelector('img');
        const objFit = img?.style?.objectFit || 'contain';
        const w = parseFloat(wrap?.style?.width) || null;
        const h = parseFloat(wrap?.style?.height) || null;
        return {
          type: 'image',
          colStart: rect.colStart, rowStart: rect.rowStart,
          colSpan: rect.colSpan, rowSpan: rect.rowSpan,
          src: img?.src || '',
          objectFit: objFit,
          wrapSize: (w && h) ? { w, h } : null
        };
      } else {
        return {
          type: 'text',
          colStart: rect.colStart, rowStart: rect.rowStart,
          colSpan: rect.colSpan, rowSpan: rect.rowSpan,
          html: b.querySelector('.block-content')?.innerHTML || ''
        };
      }
    });

    const payload = { id: DASH_ID, title, blocks };
    return JSON.stringify(payload);
  }

  function deepEqualJSON(a, b) { return a === b; }

  function saveNow() {
    if (!DASH_ID) return;
    const json = serializeSheet();
    if (deepEqualJSON(json, lastSavedSnapshot)) { markSaved(); return; }
    markSaving();
    saveInFlight = true;
    try {
      localStorage.setItem(DASH_ID, json);
      lastSavedSnapshot = json;
      markSaved();
    } catch (e) {
      console.error('Save failed:', e);
    } finally {
      saveInFlight = false;
    }
  }

  function requestSave(delay = 400) {
    if (saveTimer) clearTimeout(saveTimer);
    markSaving();
    saveTimer = setTimeout(saveNow, delay);
  }

  function applySheetData(data) {
    const titleEl = document.getElementById('sheet-title');
    if (titleEl && data.title) titleEl.textContent = data.title;

    blocksContainer.innerHTML = '';
    (data.blocks || []).forEach(b => {
      const el = document.createElement('div');
      el.className = 'block';
      el.innerHTML = `
        <div class="block-content" contenteditable="true"></div>
        <button class="delete-btn" title="Delete Block">×</button>
        <div class="resize-handle right"></div>
        <div class="resize-handle bottom"></div>
        <div class="resize-handle bottom-right"></div>
      `;
      writeRect(el, {
        colStart: b.colStart, rowStart: b.rowStart,
        colSpan: b.colSpan, rowSpan: b.rowSpan
      });
      blocksContainer.appendChild(el);

      if (b.type === 'image') {
        makeImageBlock(el, b.src || '');
        const wrap = el.querySelector('.img-wrap');
        const img = wrap?.querySelector('img');
        if (img && b.objectFit) img.style.objectFit = b.objectFit;
        if (wrap && b.wrapSize?.w && b.wrapSize?.h) {
          wrap.style.width = `${b.wrapSize.w}px`;
          wrap.style.height = `${b.wrapSize.h}px`;
        } else {
          wrap.style.width = '100%';
          wrap.style.height = '100%';
        }
      } else {
        el.querySelector('.block-content').innerHTML = b.html || '';
      }

      bindBlockEvents(el);
    });

    lastSavedSnapshot = serializeSheet();
    markSaved();
  }

  function loadOrInit() {
    const raw = localStorage.getItem(DASH_ID);
    if (raw) {
      try { applySheetData(JSON.parse(raw)); return; }
      catch (e) { console.warn('Failed to parse saved dashboard; starting fresh.', e); }
    }
    createNewBlock();
    requestSave(0);
  }

  function exportCurrentSheet() {
    try {
      const json = serializeSheet();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeTitle = (document.getElementById('sheet-title')?.textContent || 'dashboard')
        .trim().replace(/[^\w\-]+/g, '_');
      a.href = url;
      a.download = `${safeTitle || 'dashboard'}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
    }
  }

  // ========== GHOST PREVIEW ==========
  function updateGhost(rect) {
    if (!ghostEl) {
      ghostEl = document.createElement('div');
      ghostEl.className = 'block-ghost';
      blocksContainer.appendChild(ghostEl);
    }
    writeRect(ghostEl, rect);
  }
  function removeGhost() {
    if (ghostEl) ghostEl.remove();
    ghostEl = null;
  }

  // ========== BLOCK CREATION ==========
  function createNewBlock() {
    if (isLocked) return;
    const rect = dropToFreeRow({ colStart: 1, rowStart: 1, colSpan: 4, rowSpan: 4 }, null);
    const block = document.createElement('div');
    block.className = 'block';
    block.innerHTML = `
      <div class="block-content" contenteditable="true"></div>
      <button class="delete-btn" title="Delete Block">×</button>
      <div class="resize-handle right"></div>
      <div class="resize-handle bottom"></div>
      <div class="resize-handle bottom-right"></div>
    `;
    writeRect(block, rect);
    blocksContainer.appendChild(block);
    bindBlockEvents(block);
    block.querySelector('.block-content').focus();
  }

  // ========== BIND INTERACT.JS EVENTS ==========
  function bindBlockEvents(el) {
    interact(el)
      .draggable({
        hold: 250,
        allowFrom: el,
        ignoreFrom: 'button, .resize-handle',
        listeners: {
          start: e => {
            beginInteractionSelectionGuard();
            e.target.classList.add('dragging-active');
            e.target.setAttribute('data-start-rect', JSON.stringify(readRect(e.target)));
            updateGhost(readRect(e.target));
          },
          move: dragMove,
          end: e => {
            endInteractionSelectionGuard();
            dragEnd(e);
          }
        }
      })
      .resizable({
        edges: { top: false, left: false, bottom: true, right: true },
        listeners: {
          start: e => {
            beginInteractionSelectionGuard();
            e.target.classList.add('resizing-active');
            updateGhost(readRect(e.target));
            e.target.setAttribute('data-start-rect', JSON.stringify(readRect(e.target)));
          },
          move: resizeMove,
          end: e => {
            endInteractionSelectionGuard();
            resizeEnd(e);
          }
        }
      });

    const content = el.querySelector('.block-content');
    content.addEventListener('input', () => requestSave());
    content.addEventListener('blur', () => requestSave());

    // PASTE → image block
    content.addEventListener('paste', async (e) => {
      if (isLocked) return;
      const cd = e.clipboardData;
      if (!cd) return;

      const file = [...cd.files].find(f => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        const url = await fileToDataUrl(file);
        makeImageBlock(el, url);
        requestSave();
        return;
      }

      const html = cd.getData('text/html');
      if (html) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const pastedImg = temp.querySelector('img[src]');
        if (pastedImg?.src) {
          e.preventDefault();
          makeImageBlock(el, pastedImg.src);
          requestSave();
          return;
        }
      }

      if (el.classList.contains('image-block')) e.preventDefault();
    });

    // DRAG & DROP → image block
    content.addEventListener('dragover', (e) => {
      if (isLocked) return;
      e.preventDefault();
    });
    content.addEventListener('drop', async (e) => {
      if (isLocked) return;
      e.preventDefault();
      const dt = e.dataTransfer;

      const file = [...(dt.files || [])].find(f => f.type.startsWith('image/'));
      if (file) {
        const url = await fileToDataUrl(file);
        makeImageBlock(el, url);
        requestSave();
        return;
      }

      const html = dt.getData('text/html');
      if (html) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const droppedImg = temp.querySelector('img[src]');
        if (droppedImg?.src) {
          makeImageBlock(el, droppedImg.src);
          requestSave();
          return;
        }
      }
    });

    // Block typing while image mode (except remove)
    content.addEventListener('keydown', (e) => {
      if (!el.classList.contains('image-block')) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        revokeImageBlock(el);
        requestSave();
        return;
      }
      e.preventDefault();
    });

    el.querySelector('.delete-btn')?.addEventListener('click', () => {
      if (!isLocked) {
        el.remove();
        requestSave();
      }
    });
  }

  // --- DRAG LISTENERS ---
  function dragMove(e) {
    const metrics = getMetrics();
    const originalRect = readRect(e.target);
    const dx = e.pageX - e.x0;
    const dy = e.pageY - e.y0;

    const colShift = Math.round(dx / (metrics.cellW + metrics.gap));
    const rowShift = Math.round(dy / (metrics.rowUnit + metrics.gap));

    let ghostRect = {
      ...originalRect,
      colStart: originalRect.colStart + colShift,
      rowStart: originalRect.rowStart + rowShift
    };

    ghostRect.colStart = Math.max(1, Math.min(ghostRect.colStart, metrics.cols - ghostRect.colSpan + 1));
    ghostRect.rowStart = Math.max(1, ghostRect.rowStart);

    updateGhost(ghostRect);
  }

  function dragEnd(e) {
    const el = e.target;
    el.classList.remove('dragging-active');

    const startRect = JSON.parse(el.getAttribute('data-start-rect') || 'null');
    el.removeAttribute('data-start-rect');

    const finalRect = ghostEl ? readRect(ghostEl) : null;
    removeGhost();
    if (!finalRect) return;

    const { cols } = getMetrics();
    const overRight = finalRect.colStart + finalRect.colSpan - 1 > cols;
    if (overRight) { if (startRect) writeRect(el, startRect); return; }

    const pushedRect = dropToFreeRow(finalRect, el);
    writeRect(el, pushedRect);
    resolveCollisions(pushedRect, el);
    requestSave();
  }

  // --- RESIZE LISTENERS ---
  function resizeMove(e) {
    const metrics = getMetrics();
    const startRect = JSON.parse(e.target.getAttribute('data-start-rect'));
    let newRect = { ...startRect };

    if (e.edges.right) {
      const colSpanByPx = Math.round(e.rect.width / (metrics.cellW + metrics.gap));
      newRect.colSpan = Math.max(1, colSpanByPx);
    }
    if (e.edges.bottom) {
      const rowSpanByPx = Math.round(e.rect.height / (metrics.rowUnit + metrics.gap));
      newRect.rowSpan = Math.max(1, rowSpanByPx);
    }

    if (newRect.colStart + newRect.colSpan - 1 > metrics.cols) {
      newRect.colSpan = metrics.cols - newRect.colStart + 1;
    }

    updateGhost(newRect);
  }

  function resizeEnd(e) {
    const el = e.target;
    el.classList.remove('resizing-active');
    el.removeAttribute('data-start-rect');

    const finalRect = readRect(ghostEl);
    removeGhost();
    if (!finalRect) return;

    writeRect(el, finalRect);
    resolveCollisions(finalRect, el);
    requestSave();
  }

  // ========== UI & WIRING ==========
  function toggleLock() {
    isLocked = !isLocked;
    sheetContainer.classList.toggle('is-locked', isLocked);
    lockButton.textContent = isLocked ? '🔒 Locked' : '🔓 Unlocked';
    document.querySelectorAll('[contenteditable]').forEach(el => {
      el.setAttribute('contenteditable', String(!isLocked));
    });
  }

  exportBtn?.addEventListener('click', exportCurrentSheet);

  formatToolbar.addEventListener('click', (e) => {
    const cmd = e.target.closest('button')?.dataset.command;
    if (cmd) document.execCommand(cmd, false, null);
  });
  formatToolbar.addEventListener('change', (e) => {
    const sel = e.target.closest('select');
    if (sel?.dataset.command === 'formatBlock') {
      document.execCommand(sel.dataset.command, false, sel.value);
    }
  });

  lockButton.addEventListener('click', toggleLock);
  addBlockBtn.addEventListener('click', createNewBlock);

  // Title changes save
  document.getElementById('sheet-title')?.addEventListener('input', () => requestSave());
  document.getElementById('sheet-title')?.addEventListener('blur', () => requestSave());

  // Initial setup
  loadOrInit();
});
