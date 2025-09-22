// scripts/dashboard-sheet.js
// Grid editor with Interact.js + edge-snapped, ghost-driven live commits
// - Hold anywhere on a block to drag (text editing disabled while moving)
// - Bottom/right resize
// - Ghost shows target footprint; layout is COMMITTED on every move
// - Edge-snapping: neighbors only move once you cross their borders
// - Full-area collision checks + push-down cascade
// - Column gravity-up (close vertical gaps without horizontal moves)
// - Global row compaction (cut empty rows)
// - Undo/Redo history snapshots on successful saves
// - Import/Export, autosave, lock toggle, image blocks

document.addEventListener('DOMContentLoaded', () => {
  // ---------- DOM ----------
  const blocksContainer  = document.getElementById('blocks-container');
  const addBlockBtn      = document.getElementById('add-block-btn');
  const lockButton       = document.getElementById('lock-toggle-btn');
  const sheetContainer   = document.getElementById('sheet-container');
  const formatToolbar    = document.getElementById('format-toolbar');
  const exportBtn        = document.getElementById('export-btn');
  const saveStatusBtn    = document.getElementById('save-status-btn');

  // Undo/Redo UI (inject if missing)
  let undoBtn = document.getElementById('undo-btn');
  let redoBtn = document.getElementById('redo-btn');
  if (!undoBtn || !redoBtn) {
    const wrap = document.createElement('div');
    wrap.className = 'history-controls';
    Object.assign(wrap.style, {
      position: 'fixed', right: '16px', top: '16px',
      display: 'flex', gap: '8px', zIndex: 1000
    });
    undoBtn = document.createElement('button');
    redoBtn = document.createElement('button');
    undoBtn.id = 'undo-btn'; redoBtn.id = 'redo-btn';
    undoBtn.className = 'btn'; redoBtn.className = 'btn';
    undoBtn.textContent = '↶ Undo'; redoBtn.textContent = '↷ Redo';
    wrap.append(undoBtn, redoBtn);
    document.body.appendChild(wrap);
  }

  // Import button (next to Export)
  let importBtn = document.getElementById('import-btn');
  if (!importBtn) {
    importBtn = document.createElement('button');
    importBtn.id = 'import-btn';
    importBtn.className = 'btn';
    importBtn.textContent = 'Import';
    const headerRight = document.querySelector('.header-right') || document.body;
    headerRight.insertBefore(importBtn, exportBtn || null);
  }

  // ---------- State ----------
  const FORCE_LOCK = false;
  let isLocked = false;                // start unlocked for editing
  let ghostEl = null;                  // ghost preview element
  const DASH_ID = getDashboardIdFromURL();

  // History (Undo/Redo)
  const hist = { past: [], future: [] };
  const HISTORY_LIMIT = 100;

  // Autosave
  let saveTimer = null;
  let lastSavedSnapshot = null;

  // ---------- Utils ----------
  function getDashboardIdFromURL() {
    const p = new URLSearchParams(location.search);
    return p.get('id') || `dash_${Date.now()}`;
  }

  function beginInteractionSelectionGuard() {
    if (document.activeElement?.blur) document.activeElement.blur();
    const sel = window.getSelection?.();
    if (sel?.removeAllRanges) sel.removeAllRanges();
    document.body.classList.add('no-select');
  }
  function endInteractionSelectionGuard() {
    document.body.classList.remove('no-select');
  }

  // Temporarily disable editing on a block's content
  function disableEditing(el) {
    const c = el.querySelector('.block-content');
    if (!c) return;
    c.setAttribute('data-prev-ce', c.getAttribute('contenteditable') || 'true');
    c.setAttribute('contenteditable', 'false');
  }
  function restoreEditing(el) {
    const c = el.querySelector('.block-content');
    if (!c) return;
    const prev = c.getAttribute('data-prev-ce');
    if (prev !== null) c.setAttribute('contenteditable', prev);
    c.removeAttribute('data-prev-ce');
  }

  // ---------- Grid Metrics ----------
  function getMetrics() {
    const cs = getComputedStyle(blocksContainer);
    const cols = parseInt(cs.getPropertyValue('--grid-columns')) || 12;
    const gap = parseFloat(cs.gap) || 0;
    const contentW = blocksContainer.clientWidth;
    const cellW = (contentW - gap * (cols - 1)) / cols;
    const rowUnit = parseFloat(cs.getPropertyValue('--row-size')) || 64;
    return { cols, gap, cellW, rowUnit };
  }

  // ---------- Rect helpers ----------
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
  function writeRectsToDOM(rects) {
    for (const r of rects) writeRect(r.el, r);
  }
  function getAllRects(excludeEl) {
    return [...blocksContainer.querySelectorAll('.block')]
      .filter(el => el !== excludeEl)
      .map(readRect);
  }

  // ---------- Geometry ----------
  function colsOverlap(a, b) {
    return !(a.colStart + a.colSpan <= b.colStart || b.colStart + b.colSpan <= a.colStart);
  }
  function rowsOverlap(a, b) {
    return !(a.rowStart + a.rowSpan <= b.rowStart || b.rowStart + b.rowSpan <= a.rowStart);
  }
  function rectsOverlap(a, b) {
    return colsOverlap(a,b) && rowsOverlap(a,b);
  }

  // ---------- Push-down cascade ----------
  function pushDownCascadeFull(anchorRect) {
    // Start from DOM rects, replacing/adding anchor
    const rects = getAllRects(null).map(r => ({ ...r }));
    const i = rects.findIndex(r => r.el === anchorRect.el);
    if (i >= 0) rects[i] = { ...anchorRect };
    else rects.push({ ...anchorRect });

    // Anchor placed first; others in reading order
    const others = rects
      .filter(r => r.el !== anchorRect.el)
      .sort((a, b) => (a.rowStart - b.rowStart) || (a.colStart - b.colStart));

    const placed = [{ ...anchorRect }];

    for (const b of others) {
      let y = b.rowStart;

      // Push down until no overlap with placed blocks that share columns
      while (true) {
        const blockers = placed.filter(p => colsOverlap(b, p) && rowsOverlap({ ...b, rowStart: y }, p));
        if (blockers.length === 0) break;
        const minFree = Math.max(...blockers.map(p => p.rowStart + p.rowSpan));
        y = minFree <= y ? y + 1 : minFree; // safety
      }

      placed.push({ ...b, rowStart: y });
    }

    return placed;
  }

  // ----- Column gravity (remove vertical gaps; no horizontal moves) -----
  function gravityUpRects(rects, priorityEl = null) {
    const items = rects.map(r => ({ ...r }));
    items.sort((a, b) => (a.rowStart - b.rowStart) || (a.colStart - b.colStart));
    const placed = [];

    for (const b0 of items) {
      const b = { ...b0 };
      let y = 1;

      for (const p of placed) {
        if (colsOverlap(b, p)) {
          y = Math.max(y, p.rowStart + p.rowSpan);
        }
      }
      if (priorityEl && b.el === priorityEl) {
        y = Math.max(y, b0.rowStart);
      }
      b.rowStart = y;
      placed.push(b);
    }
    return placed;
  }

  // ----- Cut globally empty rows (row compression) -----
  function compactEmptyRows(rects) {
    if (!rects?.length) return rects;

    const occupied = new Set();
    let maxBottom = 0;
    for (const r of rects) {
      const top = r.rowStart;
      const bot = r.rowStart + r.rowSpan - 1;
      for (let y = top; y <= bot; y++) occupied.add(y);
      if (bot > maxBottom) maxBottom = bot;
    }

    let shift = 0;
    const rowMap = new Map();
    for (let y = 1; y <= maxBottom; y++) {
      if (!occupied.has(y)) shift += 1; // empty row → pull up subsequent rows
      rowMap.set(y, y - shift);
    }

    return rects.map(r => {
      const mapped = rowMap.get(r.rowStart) ?? r.rowStart;
      return { ...r, rowStart: Math.max(1, mapped) };
    });
  }

  // ----- Ensure delete button is in the top-right -----
  function styleDeleteButton(blockEl) {
    const btn = blockEl.querySelector('.delete-btn');
    if (!btn) return;
    Object.assign(btn.style, {
      position: 'absolute',
      top: '6px',
      right: '6px',
      width: '24px',
      height: '24px',
      lineHeight: '22px',
      border: 'none',
      borderRadius: '8px',
      background: 'rgba(0,0,0,.12)',
      color: '#222',
      cursor: 'pointer',
      zIndex: 6
    });
    if (!btn.textContent.trim()) btn.textContent = '×';
  }

  // ---------- Ghost ----------
  function updateGhost(rect) {
    if (!ghostEl) {
      ghostEl = document.createElement('div');
      ghostEl.className = 'block-ghost';
      blocksContainer.appendChild(ghostEl);
    }
    ghostEl.style.zIndex = '50';        // keep above neighbors
    ghostEl.style.pointerEvents = 'none';
    writeRect(ghostEl, rect);
    ghostEl.style.display = '';
  }
  function removeGhost() {
    if (ghostEl) ghostEl.remove();
    ghostEl = null;
  }
  function clearPreviewTransforms() {
    blocksContainer.querySelectorAll('.block').forEach(el => { el.style.transform = ''; });
  }

  // ---------- Preview math (no transforms; returns the would-be layout) ----------
  function getPreviewLayout(ghostRect, activeEl) {
    const tempAnchor = { ...ghostRect, el: activeEl };
    const cascaded  = pushDownCascadeFull(tempAnchor);
    const packed    = gravityUpRects(cascaded, activeEl);
    const final     = compactEmptyRows(packed);
    return final;
  }

  // ---------- Edge snapping ----------
  // Neighbors only move once you cross their borders. We adjust the ghost so that
  // it "sticks" against edges until you clearly pass them.
  function edgeSnap(ghost, activeEl /*, startRect */) {
    const all = getAllRects(activeEl);
    if (!all.length) return ghost;

    const gLeft   = ghost.colStart;
    const gRight  = ghost.colStart + ghost.colSpan - 1;
    const gTop    = ghost.rowStart;
    const gBottom = ghost.rowStart + ghost.rowSpan - 1;

    let snapped = { ...ghost };

    for (const r of all) {
      const rLeft   = r.colStart;
      const rRight  = r.colStart + r.colSpan - 1;
      const rTop    = r.rowStart;
      const rBottom = r.rowStart + r.rowSpan - 1;

      // Snap vertically: if overlapping columns and we're near their top/bottom edge
      const overlapCols = !(gRight < rLeft || gLeft > rRight);

      if (overlapCols) {
        // Hover just above bottom until you clearly go below
        if (gTop >= rTop && gTop <= rBottom) {
          // keep top "stuck" to rBottom+1 until you pass it
          if (gTop <= rBottom) {
            snapped.rowStart = Math.max(snapped.rowStart, rBottom + 1);
          }
        }
        // Hover just below top until you clearly go above
        if (gBottom >= rTop && gBottom <= rBottom) {
          if (gBottom >= rTop) {
            snapped.rowStart = Math.min(snapped.rowStart, rTop - ghost.rowSpan);
          }
        }
      }

      // Snap horizontally: if overlapping rows and we're near their left/right edge
      const overlapRows = !(gBottom < rTop || gTop > rBottom);

      if (overlapRows) {
        // keep left "stuck" to rRight+1 until you pass it
        if (gLeft >= rLeft && gLeft <= rRight) {
          if (gLeft <= rRight) {
            snapped.colStart = Math.max(snapped.colStart, rRight + 1);
          }
        }
        // keep right "stuck" to rLeft-1 until you pass it
        if (gRight >= rLeft && gRight <= rRight) {
          if (gRight >= rLeft) {
            snapped.colStart = Math.min(snapped.colStart, rLeft - ghost.colSpan);
          }
        }
      }
    }

    // clamp to grid
    const m = getMetrics();
    snapped.colStart = Math.max(1, Math.min(snapped.colStart, m.cols - snapped.colSpan + 1));
    snapped.rowStart = Math.max(1, snapped.rowStart);

    return snapped;
  }

  // ---------- Image blocks ----------
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
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

    if (!isLocked) {
      bindImageResizer(block);
      bindImageActions(block);
    } else {
      wrap.querySelector('.img-actions')?.remove();
      wrap.style.pointerEvents = 'none';
    }
  }
  function revokeImageBlock(block) {
    block.classList.remove('image-block');
    const content = block.querySelector('.block-content');
    content.innerHTML = '';
    content.setAttribute('contenteditable', 'true');
    content.focus();
  }
  function bindImageResizer(block) {
    if (isLocked) return;
    const wrap = block.querySelector('.img-wrap');
    if (!wrap) return;
    const restrictRect = block.querySelector('.block-content');

    interact(wrap).resizable({
      edges: { right: true, bottom: true, bottomRight: true },
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
          const wr = wrap.getBoundingClientRect();
          const maxW = bounds.width - (wr.left - bounds.left);
          const maxH = bounds.height - (wr.top - bounds.top);

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
    if (isLocked) return;
    const actions = block.querySelector('.img-actions');
    const wrap = block.querySelector('.img-wrap');
    const img = wrap?.querySelector('img');
    if (!actions || !wrap || !img) return;

    actions.addEventListener('click', async (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      const act = btn.dataset.img;

      if (act === 'replace') {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.onchange = async () => {
          const file = inp.files?.[0];
          if (file) { img.src = await fileToDataUrl(file); requestSave(); }
          inp.remove();
        };
        inp.click();
        return;
      }
      if (act === 'remove') { revokeImageBlock(block); requestSave(); return; }
      if (act === 'fit')  { wrap.style.width = '100%'; wrap.style.height = '100%'; img.style.objectFit = 'contain'; requestSave(); return; }
      if (act === 'fill') { wrap.style.width = '100%'; wrap.style.height = '100%'; img.style.objectFit = 'cover';   requestSave(); return; }
    });
  }

  // ---------- Save / Load / Import / Export ----------
  function markSaving() {
    if (!saveStatusBtn) return;
    saveStatusBtn.textContent = 'Saving…';
    saveStatusBtn.classList.add('saving');
    saveStatusBtn.classList.remove('saved');
  }
  function markSaved() {
    if (!saveStatusBtn) return;
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
      }
      return {
        type: 'text',
        colStart: rect.colStart, rowStart: rect.rowStart,
        colSpan: rect.colSpan, rowSpan: rect.rowSpan,
        html: b.querySelector('.block-content')?.innerHTML || ''
      };
    });
    return JSON.stringify({ id: DASH_ID, title, blocks });
  }

  const deepEqualJSON = (a, b) => a === b;

  function saveNow() {
    const json = serializeSheet();
    if (deepEqualJSON(json, lastSavedSnapshot)) { markSaved(); return; }
    markSaving();
    try {
      localStorage.setItem(DASH_ID, json);
      lastSavedSnapshot = json;
      markSaved();
      pushHistory(json);
    } catch (e) {
      console.error('Save failed:', e);
    }
  }
  function requestSave(delay = 350) {
    if (saveTimer) clearTimeout(saveTimer);
    markSaving();
    saveTimer = setTimeout(saveNow, delay);
  }

  // Accept both new and legacy shapes when importing
  function normalizeImportedBlock(b) {
    const colStart = Number.isFinite(+b.colStart) ? +b.colStart : (Number.isFinite(+b.x) ? (+b.x + 1) : 1);
    const rowStart = Number.isFinite(+b.rowStart) ? +b.rowStart : (Number.isFinite(+b.y) ? (+b.y + 1) : 1);
    const colSpan  = Number.isFinite(+b.colSpan)  ? +b.colSpan  : (Number.isFinite(+b.w) ? +b.w : 4);
    const rowSpan  = Number.isFinite(+b.rowSpan)  ? +b.rowSpan  : (Number.isFinite(+b.h) ? +b.h : 4);

    const out = {
      type: b.type || (b.src ? 'image' : 'text'),
      colStart: Math.max(1, colStart),
      rowStart: Math.max(1, rowStart),
      colSpan:  Math.max(1, colSpan),
      rowSpan:  Math.max(1, rowSpan)
    };

    if (out.type === 'image') {
      out.src = b.src || '';
      out.objectFit = b.objectFit || 'contain';
      if (b.wrapSize && Number.isFinite(+b.wrapSize.w) && Number.isFinite(+b.wrapSize.h)) {
        out.wrapSize = { w: +b.wrapSize.w, h: +b.wrapSize.h };
      }
    } else {
      out.html = b.html || b.text || '';
    }
    return out;
  }
  function normalizeImportedSheet(payload) {
    const title = (payload.title || 'Imported Dashboard').toString();
    const list = Array.isArray(payload.blocks) ? payload.blocks : [];
    return { id: DASH_ID, title, blocks: list.map(normalizeImportedBlock) };
  }
  async function importSheetFromFile(file) {
    let json;
    try { json = JSON.parse(await file.text()); }
    catch { alert('Invalid JSON.'); return; }
    const data = normalizeImportedSheet(json);
    localStorage.setItem(DASH_ID, JSON.stringify(data));
    applySheetData(data);
    // pack after load
    writeRectsToDOM(compactEmptyRows(gravityUpRects(getAllRects(null))));
    markSaved();
    pushHistory(JSON.stringify(data));
  }

  // ---------- History ----------
  function pushHistory(jsonString) {
    if (!jsonString) return;
    if (hist.past.length && hist.past[hist.past.length - 1] === jsonString) return;
    hist.past.push(jsonString);
    if (hist.past.length > HISTORY_LIMIT) hist.past.shift();
    hist.future.length = 0;
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    if (undoBtn) { undoBtn.disabled = hist.past.length <= 1; undoBtn.style.opacity = undoBtn.disabled ? .5 : 1; }
    if (redoBtn) { redoBtn.disabled = !hist.future.length;   redoBtn.style.opacity = redoBtn.disabled ? .5 : 1; }
  }
  function undo() {
    if (hist.past.length <= 1) return;
    const cur = hist.past.pop();
    hist.future.push(cur);
    const prev = hist.past[hist.past.length - 1];
    if (prev) { try { applySheetData(JSON.parse(prev)); lastSavedSnapshot = prev; } catch(e){} }
    // pack after apply
    writeRectsToDOM(compactEmptyRows(gravityUpRects(getAllRects(null))));
    updateHistoryButtons();
  }
  function redo() {
    if (!hist.future.length) return;
    const next = hist.future.pop();
    hist.past.push(next);
    try { applySheetData(JSON.parse(next)); lastSavedSnapshot = next; } catch(e){}
    // pack after apply
    writeRectsToDOM(compactEmptyRows(gravityUpRects(getAllRects(null))));
    updateHistoryButtons();
  }

  // ---------- Blocks ----------
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
    styleDeleteButton(block);
    bindBlockEvents(block);
    block.querySelector('.block-content').focus();

    // pack after add
    writeRectsToDOM(compactEmptyRows(gravityUpRects(getAllRects(null))));
    requestSave();
  }

  // Helper: find a free row (baseline insert)
  function dropToFreeRow(rect, excludeEl) {
    let test = { ...rect };
    while (getAllRects(excludeEl).some(r => rectsOverlap(test, r))) test.rowStart += 1;
    return test;
  }

  function makeBlockEl(b) {
    const el = document.createElement('div');
    el.className = 'block';
    el.innerHTML = `
      <div class="block-content" contenteditable="true"></div>
      <button class="delete-btn" title="Delete Block">×</button>
      <div class="resize-handle right"></div>
      <div class="resize-handle bottom"></div>
      <div class="resize-handle bottom-right"></div>
    `;
    writeRect(el, { colStart: b.colStart, rowStart: b.rowStart, colSpan: b.colSpan, rowSpan: b.rowSpan });
    blocksContainer.appendChild(el);
    styleDeleteButton(el);

    if (b.type === 'image') {
      makeImageBlock(el, b.src || '');
      const wrap = el.querySelector('.img-wrap');
      const img  = wrap?.querySelector('img');
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
    if (isLocked) {
      el.querySelector('.delete-btn')?.remove();
      el.querySelectorAll('.resize-handle')?.forEach(h => h.remove());
    }
  }

  function applySheetData(data) {
    const titleEl = document.getElementById('sheet-title');
    if (titleEl && data.title) titleEl.textContent = data.title;

    blocksContainer.innerHTML = '';
    (data.blocks || []).forEach(makeBlockEl);

    // pack once after render
    writeRectsToDOM(compactEmptyRows(gravityUpRects(getAllRects(null))));

    lastSavedSnapshot = JSON.stringify(data);
    markSaved();
  }

  // ---------- Interact bindings ----------
  function bindBlockEvents(el) {
    const content = el.querySelector('.block-content');

    if (!isLocked) {
      interact(el)
        .draggable({
          hold: 220,
          allowFrom: el,
          ignoreFrom: 'button,.resize-handle,.delete-btn',
          listeners: {
            start: e => {
              beginInteractionSelectionGuard();
              disableEditing(e.target);
              e.target.classList.add('dragging-active');
              e.target.style.zIndex = '60';  // raise above neighbors/ghost
              e.target.setAttribute('data-start-rect', JSON.stringify(readRect(e.target)));
              updateGhost(readRect(e.target)); // starting ghost
            },
            move: dragMove,
            end: e => {
              endInteractionSelectionGuard();
              e.target.removeAttribute('data-start-rect');
              dragEnd(e);
            }
          }
        })
        .resizable({
          edges: { top: false, left: false, right: true, bottom: true, bottomRight: true },
          listeners: {
            start: e => {
              beginInteractionSelectionGuard();
              disableEditing(e.target);
              e.target.classList.add('resizing-active');
              e.target.style.zIndex = '60';
              e.target.setAttribute('data-start-rect', JSON.stringify(readRect(e.target)));
              updateGhost(readRect(e.target));
            },
            move: resizeMove,
            end: e => {
              endInteractionSelectionGuard();
              e.target.removeAttribute('data-start-rect');
              resizeEnd(e);
            }
          }
        });

      el.querySelector('.delete-btn')?.addEventListener('click', () => {
        el.remove();
        // pack after delete
        writeRectsToDOM(compactEmptyRows(gravityUpRects(getAllRects(null))));
        requestSave();
      });
    }

    // Save on text edits
    content.addEventListener('input', () => requestSave());
    content.addEventListener('blur', () => requestSave());

    // Paste/drop images when unlocked
    content.addEventListener('paste', async (e) => {
      if (!isLocked) {
        const cd = e.clipboardData; if (!cd) return;
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
          const tmp = document.createElement('div'); tmp.innerHTML = html;
          const pastedImg = tmp.querySelector('img[src]');
          if (pastedImg?.src) {
            e.preventDefault();
            makeImageBlock(el, pastedImg.src);
            requestSave();
            return;
          }
        }
        if (el.classList.contains('image-block')) e.preventDefault();
      }
    });
    content.addEventListener('dragover', (e) => { if (!isLocked) e.preventDefault(); });
    content.addEventListener('drop', async (e) => {
      if (isLocked) return;
      e.preventDefault();
      const dt = e.dataTransfer;
      const file = [...(dt.files || [])].find(f => f.type.startsWith('image/'));
      if (file) { const url = await fileToDataUrl(file); makeImageBlock(el, url); requestSave(); return; }
      const html = dt.getData('text/html');
      if (html) {
        const tmp = document.createElement('div'); tmp.innerHTML = html;
        const droppedImg = tmp.querySelector('img[src]');
        if (droppedImg?.src) { makeImageBlock(el, droppedImg.src); requestSave(); }
      }
    });

    // block typing in image mode when locked
    content.addEventListener('keydown', (e) => {
      if (!el.classList.contains('image-block')) return;
      if (isLocked) { e.preventDefault(); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault(); revokeImageBlock(el); requestSave(); return;
      }
      e.preventDefault();
    });
  }

  // ---------- DRAG / RESIZE LISTENERS (live commit, edge-snapped) ----------
  function dragMove(e) {
    const m = getMetrics();
    const start = JSON.parse(e.target.getAttribute('data-start-rect'));
    const dx = e.pageX - e.x0;
    const dy = e.pageY - e.y0;

    const colShift = Math.round(dx / (m.cellW + m.gap));
    const rowShift = Math.round(dy / (m.rowUnit + m.gap));

    let ghost = {
      ...start,
      colStart: Math.max(1, Math.min(start.colStart + colShift, m.cols - start.colSpan + 1)),
      rowStart: Math.max(1, start.rowStart + rowShift)
    };

    // Edge-snap: neighbors only move once borders are crossed
    ghost = edgeSnap(ghost, e.target);

    // Visual ghost
    updateGhost(ghost);

    // Compute layout with the ghost anchor and COMMIT it immediately
    const layout = getPreviewLayout(ghost, e.target);
    writeRectsToDOM(layout);

    // Refresh baseline so we no longer compare to old place
    const now = readRect(e.target);
    e.target.setAttribute('data-start-rect', JSON.stringify(now));

    requestSave(); // throttled
  }

  function dragEnd(e) {
    e.target.classList.remove('dragging', 'dragging-active');
    restoreEditing(e.target);

    removeGhost();
    clearPreviewTransforms();
    e.target.style.transform = '';
    e.target.removeAttribute('data-start-rect');
    e.target.style.opacity = '';
    e.target.style.zIndex = ''; // reset

    // Optional final normalize
    const cur = readRect(e.target);
    const layout = getPreviewLayout(cur, e.target);
    writeRectsToDOM(layout);

    requestSave();
  }

  function resizeMove(e) {
    const m = getMetrics();
    const start = JSON.parse(e.target.getAttribute('data-start-rect'));
    let ghost = { ...start };

    if (e.edges.right)  ghost.colSpan = Math.max(1, Math.round(e.rect.width  / (m.cellW + m.gap)));
    if (e.edges.bottom) ghost.rowSpan = Math.max(1, Math.round(e.rect.height / (m.rowUnit + m.gap)));

    if (ghost.colStart + ghost.colSpan - 1 > m.cols) {
      ghost.colSpan = m.cols - ghost.colStart + 1;
    }

    ghost = edgeSnap(ghost, e.target);

    updateGhost(ghost);

    const layout = getPreviewLayout(ghost, e.target);
    writeRectsToDOM(layout);

    const now = readRect(e.target);
    e.target.setAttribute('data-start-rect', JSON.stringify(now));

    requestSave();
  }

  function resizeEnd(e) {
    e.target.classList.remove('resizing', 'resizing-active');
    restoreEditing(e.target);

    removeGhost();
    clearPreviewTransforms();
    e.target.style.transform = '';
    e.target.removeAttribute('data-start-rect');
    e.target.style.opacity = '';
    e.target.style.zIndex = ''; // reset

    const cur = readRect(e.target);
    const layout = getPreviewLayout(cur, e.target);
    writeRectsToDOM(layout);

    requestSave();
  }

  // ---------- Lock/UI ----------
  function setInteractivityEnabled(enabled) {
    document.querySelectorAll('.block').forEach((el) => {
      interact(el).draggable({ enabled });
      interact(el).resizable({ enabled });
      el.querySelector('.delete-btn')?.classList.toggle('hidden', !enabled);
      el.querySelectorAll('.resize-handle')?.forEach(h => h.classList.toggle('hidden', !enabled));
    });
    document.querySelectorAll('.block .block-content').forEach(content => {
      const inImage = content.closest('.image-block');
      content.setAttribute('contenteditable', String(!inImage)); // text blocks editable
    });
  }
  function applyLockedUI() {
    sheetContainer.classList.toggle('is-locked', isLocked);
    if (lockButton) lockButton.textContent = isLocked ? '🔒 Locked' : '🔓 Unlocked';
    setInteractivityEnabled(!isLocked);
    if (addBlockBtn) { addBlockBtn.classList.toggle('hidden', isLocked); addBlockBtn.disabled = isLocked; }
  }
  function toggleLock() { if (FORCE_LOCK) return; isLocked = !isLocked; applyLockedUI(); }

  // ---------- Wiring ----------
  importBtn?.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = async () => { const file = inp.files?.[0]; if (file) await importSheetFromFile(file); inp.remove(); };
    inp.click();
  });
  exportBtn?.addEventListener('click', () => {
    try {
      const json = serializeSheet();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeTitle = (document.getElementById('sheet-title')?.textContent || 'dashboard')
        .trim().replace(/[^\w\-]+/g, '_');
      a.href = url; a.download = `${safeTitle || 'dashboard'}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { console.error('Export failed:', e); }
  });
  undoBtn?.addEventListener('click', undo);
  redoBtn?.addEventListener('click', redo);
  lockButton?.addEventListener('click', toggleLock);
  addBlockBtn?.addEventListener('click', createNewBlock);
  document.getElementById('sheet-title')?.addEventListener('input', () => requestSave());
  document.getElementById('sheet-title')?.addEventListener('blur', () => requestSave());

  formatToolbar?.addEventListener('click', (e) => {
    const cmd = e.target.closest('button')?.dataset.command;
    if (cmd) document.execCommand(cmd, false, null);
  });
  formatToolbar?.addEventListener('change', (e) => {
    const sel = e.target.closest('select');
    if (sel?.dataset.command === 'formatBlock') document.execCommand(sel.dataset.command, false, sel.value);
  });

  // ---------- Init ----------
  function loadOrInit() {
    const raw = localStorage.getItem(DASH_ID);
    if (raw) {
      try {
        const data = normalizeImportedSheet(JSON.parse(raw));
        applySheetData(data);
        // pack after load
        writeRectsToDOM(compactEmptyRows(gravityUpRects(getAllRects(null))));
        pushHistory(JSON.stringify(data));
        return;
      } catch (e) { console.warn('Failed to parse saved dashboard; starting fresh.', e); }
    }
    const starter = { type: 'text', colStart: 1, rowStart: 1, colSpan: 4, rowSpan: 4, html: 'Start typing…' };
    applySheetData({ id: DASH_ID, title: 'Untitled Dashboard', blocks: [starter] });
    writeRectsToDOM(compactEmptyRows(gravityUpRects(getAllRects(null))));
    requestSave(0);
  }

  applyLockedUI();
  loadOrInit();
  updateHistoryButtons();
});
