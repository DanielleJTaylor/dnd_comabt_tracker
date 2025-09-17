/* scripts/dashboard-sheet.js
   Grid editor with ghost preview + delayed reflow.

   - Drag/resize shows a dashed "ghost" preview
   - Other blocks DO NOT move until you release
   - Release commits and triggers reflow (no overlaps)
   - Press Esc during drag/resize to cancel
   - Lock hides chrome and disables drag/resize/delete
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

  // ---------- Collision helpers & reflow ----------
  const right   = (b) => b.colStart + b.colSpan;
  const bottom  = (b) => b.rowStart + b.rowSpan;
  const cOverlap= (a,b) => (a.colStart < right(b)) && (b.colStart < right(a));
  const rOverlap= (a,b) => (a.rowStart < bottom(b)) && (b.rowStart < bottom(a));
  const overlaps= (a,b) => cOverlap(a,b) && rOverlap(a,b);

  // First free top row for 'b' against 'placed'
  function topFreeRowFor(b, placed){
    let y = Math.max(1, b.rowStart);
    while (true) {
      const hit = placed.find(p =>
        cOverlap(b, p) &&
        (y < bottom(p)) && (p.rowStart < y + b.rowSpan)
      );
      if (!hit) return y;
      y = bottom(hit);
    }
  }

  // Pack blocks downward so none overlap
  function reflow(priority) {
    const blocks = dash.blocks;
    const ordered = blocks.slice().sort((a,b)=>{
      if (priority){
        if (a.id === priority.id) return -1;
        if (b.id === priority.id) return  1;
      }
      const dr = a.rowStart - b.rowStart;
      return dr !== 0 ? dr : (a.colStart - b.colStart);
    });

    const placed=[]; let changed=false;
    for (const b of ordered) {
      if (priority && b.id === priority.id) { placed.push(b); continue; }
      const want = b.rowStart;
      const y = topFreeRowFor(b, placed);
      if (y !== want){ b.rowStart = y; changed = true; }
      placed.push(b);
    }
    if (changed){
      qsa('.block').forEach(el=>{
        const bid = el.dataset.bid;
        const bb = blocks.find(x => x.id === bid);
        if (bb) placeCSS(el, bb);
      });
    }
    if (changed) dirty();
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

  // ---------- Drag with preview ----------
  let drag = null; // { el, block, startC, startR, startX, startY, committed }
  let cancelOp = false;

  function onDragStart(e, el, block){
    if (isLocked) return;
    if (e.button !== 0) return;

    const path = e.composedPath ? e.composedPath() : (e.path || []);
    if (path.some(n => n && n.isContentEditable)) return;

    e.preventDefault();
    cancelOp = false;
    drag = { el, block, startC:block.colStart, startR:block.rowStart, startX:e.clientX, startY:e.clientY, committed:false };
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd, { once:true });
    document.addEventListener('keydown', onOpKey, { once:true });

    // show ghost at starting place; don't move the real block yet
    showGhost(block.colStart, block.rowStart, block.colSpan, block.rowSpan);
  }
  function onDragMove(e){
    if (!drag) return;
    const dCols = rnd((e.clientX - drag.startX) / (unitW || 1));
    const dRows = rnd((e.clientY - drag.startY) / (unitH || 1));

    const nc = clamp(drag.startC + dCols, 1, GRID_COLS - drag.block.colSpan + 1);
    const nr = Math.max(1, drag.startR + dRows);

    // Move ONLY the ghost
    showGhost(nc, nr, drag.block.colSpan, drag.block.rowSpan);
  }
  function onDragEnd(){
    document.removeEventListener('pointermove', onDragMove);
    hideGhost();

    if (!drag) return;
    if (cancelOp){ drag=null; return; } // Esc pressed => revert

    // Read ghost (final preview) by parsing its grid; or recompute from last delta
    // Safer to recompute from last pointer delta stored on ghost via dataset? We'll just compute from its style.
    // However style values are strings; we can store in drag during move:
    const styles = ghostEl && ghostEl.style.display !== 'none' ? ghostEl.style : null;
    let nc = drag.block.colStart, nr = drag.block.rowStart;
    if (styles) {
      // grid-column: "<c> / span <w>"; grid-row: "<r> / span <h>"
      const gc = styles.gridColumn.split('/');
      const gr = styles.gridRow.split('/');
      if (gc.length >= 1) nc = parseInt(gc[0].trim(),10) || nc;
      if (gr.length >= 1) nr = parseInt(gr[0].trim(),10) || nr;
    }

    // Commit block move
    drag.block.colStart = nc;
    drag.block.rowStart = nr;
    placeCSS(drag.el, drag.block);

    // Now push others (single reflow)
    reflow(drag.block);
    dirty();
    drag=null;
  }

  // ---------- Resize with preview ----------
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

    // Show ghost of starting rect
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

    if (rez.edge.includes('r')) w = clamp(rez.startW + dCols, 1, GRID_COLS - rez.startC + 1);
    if (rez.edge.includes('b')) h = Math.max(1, rez.startH + dRows);

    if (rez.edge.includes('l')) {
      const newC = clamp(rez.startC + dCols, 1, rez.startC + rez.startW - 1);
      w = rez.startW + (rez.startC - newC);
      c = newC;
    }
    if (rez.edge.includes('t')) {
      const newR = Math.max(1, rez.startR + dRows);
      h = rez.startH + (rez.startR - newR);
      r = newR;
    }

    // Update ONLY ghost
    showGhost(c, r, w, h);
  }
  function onResizeEnd(){
    document.removeEventListener('pointermove', onResizeMove);
    hideGhost();

    if (!rez) return;
    if (cancelOp){ rez=null; return; } // Esc => revert

    // Commit to ghost's final rect
    const gc = ghostEl && ghostEl.style.gridColumn.split('/');
    const gr = ghostEl && ghostEl.style.gridRow.split('/');
    let c = rez.block.colStart, r = rez.block.rowStart, w = rez.block.colSpan, h = rez.block.rowSpan;
    if (gc && gc.length >= 2) { c = parseInt(gc[0].trim(),10) || c; w = parseInt(gc[1].replace('span','').trim(),10) || w; }
    if (gr && gr.length >= 2) { r = parseInt(gr[0].trim(),10) || r; h = parseInt(gr[1].replace('span','').trim(),10) || h; }

    Object.assign(rez.block, { colStart:c, rowStart:r, colSpan:w, rowSpan:h });
    placeCSS(rez.el, rez.block);

    // Single reflow after commit
    reflow(rez.block);
    dirty();
    rez=null;
  }

  // Cancel current op with Esc
  function onOpKey(e){
    if (e.key !== 'Escape') return;
    cancelOp = true;
    // Cleanup listeners + ghost; leave blocks unchanged
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

    // Resize handles (minimal inline so always visible)
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
    addHandle('h-t', 't',  { top: '-6px', left: '50%', transform: 'translateX(-50%)', cursor:'ns-resize' });
    addHandle('h-r', 'r',  { right:'-6px', top:'50%', transform:'translateY(-50%)', cursor:'ew-resize' });
    addHandle('h-b', 'b',  { bottom:'-6px', left:'50%', transform:'translateX(-50%)', cursor:'ns-resize' });
    addHandle('h-l', 'l',  { left:'-6px', top:'50%', transform:'translateY(-50%)', cursor:'ew-resize' });
    addHandle('h-tr','tr', { right:'-6px', top:'-6px', cursor:'ne-resize' });
    addHandle('h-br','br', { right:'-6px', bottom:'-6px', cursor:'se-resize' });
    addHandle('h-bl','bl', { left:'-6px', bottom:'-6px', cursor:'sw-resize' });
    addHandle('h-tl','tl', { left:'-6px', top:'-6px', cursor:'nw-resize' });

    // Delete button (top-right)
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
      reflow(null);
      dirty();
    });

    el.appendChild(content);
    el.appendChild(close);

    el.addEventListener('pointerdown', (e) => onDragStart(e, el, block));

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
    // initial cleanup just in case
    reflow(null);
    setLocked(isLocked);
  }

  // ---------- Add blocks ----------
  function addTextBlock({ c=1, r=1, w=3, h=3, html='' } = {}){
    const b = normalize({ id: uid(), type:'text', colStart:c, rowStart:r, colSpan:w, rowSpan:h, html });
    dash.blocks.push(b);
    canvas.appendChild(makeBlockEl(b));
    reflow(b);
    dirty();
  }
  function addImageBlock({ c=1, r=1, w=4, h=4, src='' } = {}){
    const b = normalize({ id: uid(), type:'image', colStart:c, rowStart:r, colSpan:w, rowSpan:h, src, objectFit:'contain' });
    dash.blocks.push(b);
    canvas.appendChild(makeBlockEl(b));
    reflow(b);
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
    if (formatSel) formatSel.addEventListener('change', () => document.execCommand('formatBlock', false, formatSel.value || 'P'));
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
  window.addEventListener('resize', measureUnits);
  renderAll();

  // Expose helpers
  window.__sheet = {
    get data(){ return dash; },
    set data(v){ dash = v; renderAll(); dirty(); },
    addTextBlock, addImageBlock, renderAll, setLocked, reflow
  };
})();
