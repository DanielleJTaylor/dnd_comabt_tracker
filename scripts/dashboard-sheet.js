/* scripts/dashboard-sheet.js
   Grid editor (row-first behavior)
   - Long-press to drag (prevents accidental drags)
   - Bottom/right-only resize
   - Commit rules:
       • Push-down cascade only for blocks whose COLUMNS overlap the moved/resized block
       • Never push left/right
   - Gravity-up tidy:
       • After any change, blocks climb straight up if there’s room (no horizontal moves)
       • Eliminates completely empty rows
*/

(() => {
  'use strict';

  // ---------- DOM helpers ----------
  const qs  = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const canvas    = qs('#blocks-container') || qs('#sheetCanvas');
  const titleEl   = qs('#sheet-title')      || qs('#sheetTitle');
  const exportBtn = qs('#export-btn')       || qs('#exportBtn');
  const backBtn   = qs('#dash-back')        || qs('#backBtn');
  const addBtn    = qs('#add-block-btn')    || qs('#addBlockBtn') || qs('#fabAddBtn');
  const lockBtn   = qs('#lock-toggle-btn')  || qs('#lockToggleBtn') || qs('[data-act="toggle-lock"]');
  const saveBadge = qs('#save-status-btn')  || qs('#saveStatus')   || qs('#saveBadge');
  const toolbar   = qs('#format-toolbar')   || null;

  if (!canvas) {
    console.error('dashboard-sheet.js: canvas not found');
    return;
  }

  // ---------- State / storage ----------
  const GRID_COLS = 12;
  const DASH_ID   = new URLSearchParams(location.search).get('id') || 'dash_tmp';
  const LS_KEY    = DASH_ID;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rnd   = (v) => Math.round(v);
  const uid   = (p='b_') => `${p}${Date.now()}_${Math.floor(Math.random()*1e6)}`;

  const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; } };
  const save = (obj) => { localStorage.setItem(LS_KEY, JSON.stringify(obj)); setSaved(true); };

  let dash = load() || { id: LS_KEY, title: 'Untitled', blocks: [] };

  // ---------- Grid metrics ----------
  let unitW = 0, unitH = 0;
  function measureUnits() {
    const probe = document.createElement('div');
    probe.style.gridColumn = '1 / span 1';
    probe.style.gridRow    = '1 / span 1';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    canvas.appendChild(probe);
    const r = probe.getBoundingClientRect();
    unitW = canvas.clientWidth / GRID_COLS;
    unitH = r.height || 40;
    probe.remove();
  }

  // ---------- Save badge ----------
  let saveTimer = null;
  function debouncedSave(){ clearTimeout(saveTimer); saveTimer = setTimeout(() => save(dash), 250); }
  function setSaved(ok){ if (saveBadge){ saveBadge.textContent = ok ? 'Saved' : 'Unsaved'; saveBadge.classList.toggle('unsaved', !ok); } }
  function dirty(){ setSaved(false); debouncedSave(); }

  // ---------- Normalization / placement ----------
  function normalize(b){
    const n = { ...b };
    if (n.colStart == null && n.x != null) n.colStart = n.x + 1;
    if (n.rowStart == null && n.y != null) n.rowStart = n.y + 1;
    if (n.colSpan  == null && n.w != null) n.colSpan  = n.w;
    if (n.rowSpan  == null && n.h != null) n.rowSpan  = n.h;

    n.colStart = clamp(parseInt(n.colStart || 1, 10), 1, GRID_COLS);
    n.colSpan  = clamp(parseInt(n.colSpan  || 3, 10), 1, GRID_COLS);
    n.rowStart = Math.max(1, parseInt(n.rowStart || 1, 10));
    n.rowSpan  = Math.max(1, parseInt(n.rowSpan  || 3, 10));
    n.id   ||= uid();
    n.type ||= 'text';
    return n;
  }
  function placeCSS(el, b){
    el.style.gridColumn = `${b.colStart} / span ${b.colSpan}`;
    el.style.gridRow    = `${b.rowStart} / span ${b.rowSpan}`;
  }

  // ---------- Geometry helpers ----------
  const right    = (b) => b.colStart + b.colSpan;
  const bottom   = (b) => b.rowStart + b.rowSpan;
  const cOverlap = (a,b) => (a.colStart < right(b)) && (b.colStart < right(a));
  const rOverlap = (a,b) => (a.rowStart < bottom(b)) && (b.rowStart < bottom(a));
  const overlaps = (a,b) => cOverlap(a,b) && rOverlap(a,b);

  // ---------- "Add-at-bottom" lock ----------
  const minRowLock = new Map(); // id -> minRow to keep just-added blocks from snapping up immediately

  // ---------- Gravity-up (no empty rows; no horizontal movement) ----------
  function gravityUp(priority=null){
    // Place blocks in reading order; each climbs as far up as possible without overlapping placed ones
    const blocks = dash.blocks.slice().sort((a,b)=>{
      // let the priority block remain where user committed it (we'll try to keep its row stable)
      if (priority){
        if (a.id === priority.id) return -1;
        if (b.id === priority.id) return  1;
      }
      const dr = a.rowStart - b.rowStart;
      return dr !== 0 ? dr : (a.colStart - b.colStart);
    });

    const placed=[]; let changed=false;
    for (const b of blocks){
      const isPriority = priority && b.id === priority.id;
      let y = b.rowStart;
      const minY = isPriority ? b.rowStart : (minRowLock.get(b.id) ?? 1);
      // climb upward while no overlap with already placed blocks
      climb: for (let tryY = y - 1; tryY >= minY; tryY--){
        const probe = { ...b, rowStart: tryY };
        if (placed.some(p => overlaps(probe, p))) break climb; // blocked; stop climbing
        y = tryY;
      }
      if (y !== b.rowStart){ b.rowStart = y; changed = true; }
      placed.push({ ...b });
    }
    if (changed) syncDOM();
  }

  // ---------- Push-down cascade limited to column-overlap ----------
  function pushDownCascade(anchor){
    // Anchor is already at its committed position.
    // For every other block (top->bottom), if it would overlap any placed block AND has column overlap,
    // move it directly below the lowest overlapping placed block. Repeat as needed (cascade).
    const placed = [{ ...anchor }];
    const others = dash.blocks
      .filter(b => b.id !== anchor.id)
      .slice()
      .sort((a,b)=> (a.rowStart - b.rowStart) || (a.colStart - b.colStart));

    let changed = false;
    for (const b of others){
      let newStart = b.rowStart;
      while (true){
        // find all placed blocks that overlap rows with b AND share columns
        const colliders = placed.filter(p => cOverlap(b,p) && rOverlap(b,p));
        if (!colliders.length) break;
        // push b just below the lowest collider
        const minBelow = Math.max(...colliders.map(p => p.rowStart + p.rowSpan));
        if (minBelow <= newStart) { newStart = newStart + 1; } // safety in pathological cases
        else newStart = minBelow;

        // update b to proposed new pos and re-check
        b.rowStart = newStart;
        changed = true;
      }
      placed.push({ ...b });
    }
    if (changed) syncDOM();
  }

  // ---------- Sync DOM after layout changes ----------
  function syncDOM(){
    qsa('.block').forEach(el=>{
      const bid = el.dataset.bid;
      const bb = dash.blocks.find(x => x.id === bid);
      if (bb) placeCSS(el, bb);
    });
    dirty();
  }

  // ---- Auto-snap scheduler (background tidy with gravity-up) ----
  let snapTimer = null;
  function scheduleAutoSnap() {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => gravityUp(null), 60);
  }

  // Run once on load
  scheduleAutoSnap();

  // Re-pack when window layout changes
  window.addEventListener('resize', () => {
    measureUnits();
    scheduleAutoSnap();
  });

  // Re-pack when blocks are added/removed (DOM structure changes)
  const mo = new MutationObserver(() => scheduleAutoSnap());
  mo.observe(canvas, { childList: true, subtree: false });

  // Save initial dash (ensures LS slot exists)
  save(dash);

  if (titleEl) {
    titleEl.textContent = dash.title || 'Untitled';
    if (titleEl.isContentEditable) {
      titleEl.addEventListener('input', () => {
        dash.title = (titleEl.textContent || '').trim() || 'Untitled';
        setSaved(false);
        debouncedSave();
      });
    }
  }

  // ---------- Lock ----------
  let isLocked = !!dash.isLocked;
  function setLocked(v){
    isLocked = !!v;
    dash.isLocked = isLocked;
    document.documentElement.classList.toggle('sheet-locked', isLocked);
    if (lockBtn) lockBtn.textContent = isLocked ? 'Locked' : 'Unlocked';
    qsa('.block .handle, .block .close').forEach(el => { el.style.display = isLocked ? 'none' : ''; });
  }

  // ---------- Ghost preview ----------
  let ghostEl = null;
  function ensureGhost(){
    if (!ghostEl){
      ghostEl = document.createElement('div');
      ghostEl.className = 'block-ghost';
      Object.assign(ghostEl.style, {
        pointerEvents: 'none',
        border: '2px dashed rgba(0,0,0,.35)',
        borderRadius: '8px',
        background: 'transparent',
        zIndex: '3'
      });
      canvas.appendChild(ghostEl);
    }
  }
  function showGhost(c, r, w, h){
    ensureGhost();
    ghostEl.style.display = '';
    ghostEl.style.gridColumn = `${c} / span ${w}`;
    ghostEl.style.gridRow    = `${r} / span ${h}`;
  }
  function hideGhost(){
    if (ghostEl) ghostEl.style.display = 'none';
  }

  // ---------- Long-press to drag ----------
  const PRESS_MS = 180;
  let press = null; // {el, block, startX, startY, moved, timer, cancelled}

  function setupLongPressDrag(el, block){
    el.addEventListener('pointerdown', (e) => {
      if (isLocked) return;
      const path = e.composedPath ? e.composedPath() : (e.path || []);
      if (path.some(n => n && (n.classList?.contains('handle') || n.classList?.contains('close') || n.isContentEditable))) return;

      press = {
        el, block,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        cancelled: false,
        timer: null
      };

      const cancel = () => {
        if (!press) return;
        press.cancelled = true;
        clearTimeout(press.timer);
        press = null;
        window.removeEventListener('pointermove', onPressMove);
        window.removeEventListener('pointerup', onPressUp);
      };

      const startDragFromPress = () => {
        if (!press || press.cancelled) return;
        onDragStart(e, el, block);
      };

      press.timer = setTimeout(startDragFromPress, PRESS_MS);
      window.addEventListener('pointermove', onPressMove);
      window.addEventListener('pointerup', onPressUp);

      function onPressMove(ev){
        if (!press) return;
        const dx = Math.abs(ev.clientX - press.startX);
        const dy = Math.abs(ev.clientY - press.startY);
        if (dx > 3 || dy > 3) { press.moved = true; cancel(); }
      }
      function onPressUp(){ cancel(); }
    });
  }

  // ---------- Drag with preview ----------
  let drag = null; // { el, block, startC, startR, startX, startY, moved }
  let cancelOp = false;

  function onDragStart(e, el, block){
    if (isLocked) return;

    e.preventDefault();
    cancelOp = false;
    drag = {
      el, block,
      startC:block.colStart, startR:block.rowStart,
      startX:e.clientX, startY:e.clientY,
      moved:false
    };
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd, { once:true });
    document.addEventListener('keydown', onOpKey, { once:true });

    showGhost(block.colStart, block.rowStart, block.colSpan, block.rowSpan);
  }
  function onDragMove(e){
    if (!drag) return;
    const dCols = rnd((e.clientX - drag.startX) / (unitW || 1));
    const dRows = rnd((e.clientY - drag.startY) / (unitH || 1));
    if (!drag.moved && (dCols !== 0 || dRows !== 0)) drag.moved = true;

    const nc = clamp(drag.startC + dCols, 1, GRID_COLS - drag.block.colSpan + 1);
    const nr = Math.max(1, drag.startR + dRows);

    showGhost(nc, nr, drag.block.colSpan, drag.block.rowSpan);
  }
  function onDragEnd(){
    document.removeEventListener('pointermove', onDragMove);
    hideGhost();

    if (!drag) return;
    if (cancelOp){ drag=null; return; }
    if (!drag.moved) { drag=null; return; }

    // commit to ghost
    const styles = ghostEl && ghostEl.style.display !== 'none' ? ghostEl.style : null;
    let nc = drag.block.colStart, nr = drag.block.rowStart;
    if (styles) {
      const gc = styles.gridColumn.split('/');
      const gr = styles.gridRow.split('/');
      if (gc.length >= 1) nc = parseInt(gc[0].trim(),10) || nc;
      if (gr.length >= 1) nr = parseInt(gr[0].trim(),10) || nr;
    }

    drag.block.colStart = nc;
    drag.block.rowStart = nr;
    placeCSS(drag.el, drag.block);

    // Phase 1: push-down only those with column overlap
    pushDownCascade(drag.block);
    // Phase 2: gravity-up (remove empty rows)
    gravityUp(drag.block);

    dirty();
    drag=null;
  }

  // ---------- Resize with preview (bottom/right only) ----------
  let rez = null; // { el, block, edge, startX, startY, startC, startR, startW, startH }

  function onResizeStart(e, el, block, edge){
    if (isLocked) return;
    e.preventDefault(); e.stopPropagation();
    cancelOp = false;

    rez = {
      el, block, edge,
      startX:e.clientX, startY:e.clientY,
      startC:block.colStart, startR:block.rowStart,
      startW:block.colSpan,  startH:block.rowSpan
    };
    document.addEventListener('pointermove', onResizeMove);
    document.addEventListener('pointerup', onResizeEnd, { once:true });
    document.addEventListener('keydown', onOpKey, { once:true });

    showGhost(block.colStart, block.rowStart, block.colSpan, block.rowSpan);
  }
  function onResizeMove(e){
    if (!rez) return;
    const dx = e.clientX - rez.startX;
    const dy = e.clientY - rez.startY;
    let dCols = rnd(dx / (unitW || 1));
    let dRows = rnd(dy / (unitH || 1));

    let c = rez.block.colStart, r = rez.block.rowStart;
    let w = rez.block.colSpan,  h = rez.block.rowSpan;

    if (rez.edge.includes('r') || rez.edge.includes('br')) w = clamp(rez.startW + dCols, 1, GRID_COLS - rez.startC + 1);
    if (rez.edge.includes('b') || rez.edge.includes('br')) h = Math.max(1, rez.startH + dRows);

    showGhost(c, r, w, h);
  }
  function onResizeEnd(){
    document.removeEventListener('pointermove', onResizeMove);
    hideGhost();

    if (!rez) return;
    if (cancelOp){ rez=null; return; }

    // commit to ghost
    const gc = ghostEl && ghostEl.style.gridColumn.split('/');
    const gr = ghostEl && ghostEl.style.gridRow.split('/');
    let c = rez.block.colStart, r = rez.block.rowStart, w = rez.block.colSpan, h = rez.block.rowSpan;
    if (gc && gc.length >= 2) { c = parseInt(gc[0].trim(),10) || c; w = parseInt(gc[1].replace('span','').trim(),10) || w; }
    if (gr && gr.length >= 2) { r = parseInt(gr[0].trim(),10) || r; h = parseInt(gr[1].replace('span','').trim(),10) || h; }

    Object.assign(rez.block, { colStart:c, rowStart:r, colSpan:w, rowSpan:h });
    placeCSS(rez.el, rez.block);

    // Phase 1: push-down only for column-overlap colliders
    pushDownCascade(rez.block);
    // Phase 2: gravity-up
    gravityUp(rez.block);

    dirty();
    rez=null;
  }

  // Cancel current op with Esc
  function onOpKey(e){
    if (e.key !== 'Escape') return;
    hideGhost();
    if (drag) {
      document.removeEventListener('pointermove', onDragMove);
      drag=null;
    }
    if (rez) {
      document.removeEventListener('pointermove', onResizeMove);
      rez=null;
    }
  }

  // ---------- Render blocks ----------
  function makeBlockEl(block){
    const el = document.createElement('div');
    el.className = 'block';
    el.dataset.bid = block.id;
    el.style.position = 'relative';
    el.style.paddingTop = '0';
    placeCSS(el, block);

    const content = document.createElement('div');
    content.className = 'content';
    content.style.height = '100%';
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.justifyContent = 'center';

    if (block.type === 'image') {
      const img = document.createElement('img');
      img.alt = block.alt || '';
      img.style.maxWidth  = '100%';
      img.style.maxHeight = '100%';
      img.style.objectFit = block.objectFit || 'contain';
      img.src = block.src || '';
      content.appendChild(img);

      content.addEventListener('click', () => {
        if (isLocked) return;
        const url = prompt('Image URL:', block.src || '');
        if (url == null) return;
        block.src = url.trim();
        img.src   = block.src;
        dirty();
      });
    } else {
      const inner = document.createElement('div');
      inner.className = 'text';
      inner.setAttribute('contenteditable', 'true');
      inner.style.marginBlockStart = '0';
      inner.innerHTML = block.html || '';
      inner.addEventListener('input', () => { block.html = inner.innerHTML; dirty(); });
      content.appendChild(inner);
    }

    // Resize handles: right, bottom, bottom-right
    const addHandle = (cls, edge, styleObj) => {
      const h = document.createElement('div');
      h.className = `handle ${cls}`;
      Object.assign(h.style, {
        position: 'absolute',
        width: '12px', height: '12px',
        background: 'rgba(0,0,0,.12)',
        borderRadius: '6px',
        zIndex: '5',
        ...styleObj,
      });
      h.title = 'Resize';
      h.addEventListener('pointerdown', (e) => onResizeStart(e, el, block, edge));
      el.appendChild(h);
    };
    addHandle('h-r',  'r',  { right:'-6px', top:'50%', transform:'translateY(-50%)', cursor:'ew-resize' });
    addHandle('h-b',  'b',  { bottom:'-6px', left:'50%', transform:'translateX(-50%)', cursor:'ns-resize' });
    addHandle('h-br', 'br', { right:'-6px', bottom:'-6px', cursor:'se-resize' });

    // Delete button
    const close = document.createElement('button');
    close.className = 'close';
    close.type = 'button';
    close.textContent = '×';
    Object.assign(close.style, {
      position: 'absolute',
      top:'4px', right:'4px',
      width:'22px', height:'22px',
      lineHeight:'20px', textAlign:'center',
      borderRadius:'11px', border:'none',
      background:'rgba(0,0,0,.15)', color:'#000',
      cursor:'pointer', zIndex:'6'
    });
    close.title = 'Delete block';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isLocked) return;
      if (!confirm('Delete this block?')) return;
      const i = dash.blocks.findIndex(b => b.id === block.id);
      if (i >= 0) dash.blocks.splice(i, 1);
      el.remove();
      gravityUp(null);
      dirty();
    });

    el.appendChild(content);
    el.appendChild(close);

    // long-press to drag
    setupLongPressDrag(el, block);

    if (isLocked) {
      qsa('.handle, .close', el).forEach(h => h.style.display = 'none');
    }
    return el;
  }

  function renderAll(){
    canvas.innerHTML = '';
    measureUnits();
    dash.blocks = (dash.blocks || []).map(normalize);
    dash.blocks.forEach(b => canvas.appendChild(makeBlockEl(b)));
    gravityUp(null); // initial tidy
    setLocked(isLocked);
  }

  // ---------- Add blocks (ALWAYS at bottom) ----------
  function nextBottomRow() {
    if (!dash.blocks || !dash.blocks.length) return 1;
    return dash.blocks.reduce((m, b) => Math.max(m, bottom(b)), 0) + 1;
  }
  function addTextBlock({ c=1, w=3, h=3, html='' } = {}){
    const r = nextBottomRow();
    const b = normalize({ id: uid(), type:'text', colStart:c, rowStart:r, colSpan:w, rowSpan:h, html });
    dash.blocks.push(b);
    const el = makeBlockEl(b);
    canvas.appendChild(el);
    minRowLock.set(b.id, r);
    gravityUp(null);
    setTimeout(() => minRowLock.delete(b.id), 250);
    dirty();
  }
  function addImageBlock({ c=1, w=4, h=4, src='' } = {}){
    const r = nextBottomRow();
    const b = normalize({ id: uid(), type:'image', colStart:c, rowStart:r, colSpan:w, rowSpan:h, src, objectFit:'contain' });
    dash.blocks.push(b);
    const el = makeBlockEl(b);
    canvas.appendChild(el);
    minRowLock.set(b.id, r);
    gravityUp(null);
    setTimeout(() => minRowLock.delete(b.id), 250);
    dirty();
  }

  // ---------- Toolbar (neutral formatting) ----------
  function exec(cmd, val=null){ document.execCommand(cmd, false, val); }
  if (toolbar) {
    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-command]');
      if (!btn) return;
      const cmd = btn.dataset.command;
      const val = btn.dataset.value || null;
      if (cmd === 'formatBlock') document.execCommand('formatBlock', false, val || 'P');
      else exec(cmd, val);
    });
    const formatSel = toolbar.querySelector('select[data-command="formatBlock"]');
    if (formatSel) formatSel.addEventListener('change', () =>
      document.execCommand('formatBlock', false, formatSel.value || 'P')
    );
  }

  // ---------- Buttons ----------
  if (lockBtn) lockBtn.addEventListener('click', () => { setLocked(!isLocked); dirty(); });
  if (backBtn) backBtn.addEventListener('click', () => history.back());
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const t = prompt('Add new block: "text" or "image"', 'text');
      if (!t) return;
      if (t.toLowerCase().startsWith('i')) addImageBlock({ w:4, h:4 });
      else addTextBlock({ w:3, h:3 });
    });
  }
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(dash, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (dash.title || 'dashboard') + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  // ---------- Init ----------
  renderAll();

  // Expose helpers
  window.__sheet = {
    get data(){ return dash; },
    set data(v){ dash = v; renderAll(); dirty(); },
    addTextBlock, addImageBlock, renderAll,
    setLocked,
    gravityUp, pushDownCascade
  };
})();
