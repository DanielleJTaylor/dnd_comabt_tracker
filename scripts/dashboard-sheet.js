// dashboard-sheet.js
// Snap-to-grid (12 cols), resizable/dragable blocks with no overlap and lock toggle.

document.addEventListener('DOMContentLoaded', () => {
  // ---- DOM ----
  const formatToolbar   = document.getElementById('format-toolbar');
  const blocksContainer = document.getElementById('blocks-container');
  const addBlockBtn     = document.getElementById('add-block-btn');
  const lockButton      = document.getElementById('lock-toggle-btn');
  const sheetContainer  = document.getElementById('sheet-container');

  let isLocked = false;

  // Keep an occupancy map of placed blocks (by cell)
  // Each block maintains dataset: colStart,rowStart,colSpan,rowSpan
  // Grid is unbounded in rows (auto grows)
  // -------------------------------------------------------------

  // ========== GRID METRICS ==========
  function getMetrics(){
    const cs = getComputedStyle(blocksContainer);
    const cols = parseInt(cs.getPropertyValue('--grid-columns')) || 12;
    const gap  = parseFloat((cs.gap || cs.gridGap || '0').split(' ')[0]) || 0;
    const contentW = blocksContainer.clientWidth;
    const cellW = (contentW - gap * (cols - 1)) / cols;

    // Keep rows ≈ squares: set CSS --row-size to cellW (but cap a bit)
    const rowSize = Math.max(24, Math.min(96, cellW * 0.8));   // visual “full row”
    const rowUnit = rowSize / 2;                                // actual grid track height

    blocksContainer.style.setProperty('--row-size', `${rowSize}px`);
    return { cols, gap, cellW, rowH: rowSize, rowUnit };
  }

  // ========== OCCUPANCY ==========
  function rectsOverlap(a,b){
    return !(a.colStart + a.colSpan <= b.colStart ||
             b.colStart + b.colSpan <= a.colStart ||
             a.rowStart + a.rowSpan <= b.rowStart ||
             b.rowStart + b.rowSpan <= a.rowStart);
  }

  function getAllRects(excludeEl){
    const items = [...blocksContainer.querySelectorAll('.block')];
    return items
      .filter(el => el !== excludeEl)
      .map(el => ({
        el,
        colStart: +el.dataset.colStart,
        rowStart: +el.dataset.rowStart,
        colSpan : +el.dataset.colSpan,
        rowSpan : +el.dataset.rowSpan
      }));
  }

  function collides(targetRect, excludeEl){
    return getAllRects(excludeEl).some(r => rectsOverlap(targetRect, r));
  }

  // Find the lowest free row to drop a rect if it collides.
  function dropToFreeRow(rect, excludeEl){
    // Try current row; if colliding, push down until it fits.
    let test = {...rect};
    while(collides(test, excludeEl)) {
      test.rowStart += 1;
    }
    return test;
  }

  // Clamp rect within grid horizontally (rows are unbounded)
  function clampRect(rect, metrics){
    const maxStart = metrics.cols - rect.colSpan + 1;
    rect.colStart = Math.max(1, Math.min(rect.colStart, maxStart));
    rect.rowStart = Math.max(1, rect.rowStart);
    return rect;
  }

  // ========== DATA HELPERS ==========
  function readRect(el){
    return {
      el,
      colStart: +el.dataset.colStart,
      rowStart: +el.dataset.rowStart,
      colSpan : +el.dataset.colSpan,
      rowSpan : +el.dataset.rowSpan
    };
  }

  function writeRect(el, rect){
    el.dataset.colStart = rect.colStart;
    el.dataset.rowStart = rect.rowStart;
    el.dataset.colSpan  = rect.colSpan;
    el.dataset.rowSpan  = rect.rowSpan;
    el.style.gridColumn = `${rect.colStart} / span ${rect.colSpan}`;
    el.style.gridRow    = `${rect.rowStart} / span ${rect.rowSpan}`;
  }

  // ========== CREATE ==========
  function createNewBlock() {
    if (isLocked) return;

    const metrics = getMetrics();

    // Default new block: 1/12 width × 1 row
    const rect = { colStart: 1, rowStart: findNextOpenRow(1,1), colSpan: 1, rowSpan: 1 };

    const block = document.createElement('div');
    block.className = 'block';
    block.innerHTML = `
        <button class="delete-btn">×</button>
        <div class="block-content" contenteditable="true"></div>
        <div class="resize-handle"></div>
    `;


    writeRect(block, rect);
    blocksContainer.appendChild(block);
    bindBlockEvents(block);
  }

  // Find next empty row index for a given span at col 1
  function findNextOpenRow(colSpan, rowSpan){
    let row = 1;
    const test = { colStart: 1, rowStart: row, colSpan, rowSpan };
    while (collides(test, null)) {
      row += 1;
      test.rowStart = row;
    }
    return row;
  }

  // ========== BIND DRAG / RESIZE ==========
    function bindBlockEvents(el){
    const content = el.querySelector('.block-content');

    // mark editing state (no highlight while typing)
    content?.addEventListener('focusin', () => el.classList.add('editing'));
    content?.addEventListener('focusout', () => el.classList.remove('editing'));

    interact(el)
        .draggable({
        listeners: {
            start: e => {
            e.target.classList.add('dragging');
            if (content) {
                content.dataset.prevCe = content.getAttribute('contenteditable') || 'true';
                content.setAttribute('contenteditable', 'false');
                content.style.pointerEvents = 'none';   // prevent caret selection from fighting drag
            }
            },
            move: dragMove,
            end: e => {
            e.target.classList.remove('dragging');
            if (content) {
                content.setAttribute('contenteditable', content.dataset.prevCe || 'true');
                delete content.dataset.prevCe;
                content.style.pointerEvents = '';
            }
            dragEnd(e);
            }
        },
        ignoreFrom: '.resize-handle, .delete-btn',
        modifiers: [ interact.modifiers.restrictRect({ restriction: blocksContainer, endOnly: true }) ]
        })
        .resizable({
        edges: { bottom: '.resize-handle', right: '.resize-handle' },
        listeners: {
            start: e => e.target.classList.add('resizing'),
            move: resizeMove,
            end:  e => { e.target.classList.remove('resizing'); resizeEnd(e); }
        }
        });

    el.querySelector('.delete-btn')?.addEventListener('click', () => {
        if (isLocked) return;
        el.remove();
    });
    }



  function dragMove(e){
    const t = e.target;
    const x = (parseFloat(t.getAttribute('data-x')) || 0) + e.dx;
    const y = (parseFloat(t.getAttribute('data-y')) || 0) + e.dy;
    t.style.transform = `translate(${x}px, ${y}px)`;
    t.setAttribute('data-x', x);
    t.setAttribute('data-y', y);
  }

  function dragEnd(e){
    const el = e.target;
    el.classList.remove('dragging');
    const metrics = getMetrics();

    const dx = parseFloat(el.getAttribute('data-x')) || 0;
    const dy = parseFloat(el.getAttribute('data-y')) || 0;

    // Convert pixel offset → grid shifts
    const colShift = Math.round(dx / (metrics.cellW + metrics.gap));
    const rowShift = Math.round(dy / (metrics.rowUnit + metrics.gap));

    const cur = readRect(el);
    let next = {
      ...cur,
      colStart: cur.colStart + colShift,
      rowStart: cur.rowStart + rowShift
    };

    next = clampRect(next, metrics);
    next = dropToFreeRow(next, el);
    writeRect(el, next);

    // reset transform store
    el.style.transform = 'none';
    el.setAttribute('data-x', '0');
    el.setAttribute('data-y', '0');
  }

  function resizeMove(e){
    const el = e.target;
    const metrics = getMetrics();
    const cur = readRect(el);

    // proposed spans from visual rect
    let propColSpan = Math.max(1, Math.round((e.rect.width  + metrics.gap) / (metrics.cellW + metrics.gap)));
    let propRowSpan = Math.max(1, Math.round((e.rect.height + metrics.gap) / (metrics.rowUnit + metrics.gap)));


    // clamp within grid width
    propColSpan = Math.min(propColSpan, metrics.cols - cur.colStart + 1);

    // preview style during resize (no collision fix until end)
    el.style.gridColumn = `${cur.colStart} / span ${propColSpan}`;
    el.style.gridRow    = `${cur.rowStart} / span ${propRowSpan}`;
    el.dataset.colSpan  = propColSpan;
    el.dataset.rowSpan  = propRowSpan;
  }

  function resizeEnd(e){
    const el = e.target;
    const metrics = getMetrics();

    // Snap to integers already in dataset from resizeMove
    let next = readRect(el);

    // If colliding, reduce rowSpan first, then try dropping downward
    while (collides(next, el) && next.rowSpan > 1) {
      next.rowSpan -= 1;
    }
    if (collides(next, el)) {
      next = dropToFreeRow(next, el);
    }

    writeRect(el, next);
  }

  // ========== LOCK ==========
  function toggleLock(){
    isLocked = !isLocked;
    sheetContainer.classList.toggle('is-locked', isLocked);
    lockButton.textContent = isLocked ? '🔒 Locked' : '🔓 Unlocked';

    // Toggle interact on all blocks
    [...blocksContainer.querySelectorAll('.block')].forEach(el => {
      if (isLocked) interact(el).unset(); else bindBlockEvents(el);
    });

    // toggle contenteditable
    document.querySelectorAll('[contenteditable]').forEach(el => {
      el.setAttribute('contenteditable', String(!isLocked));
    });
  }

  // ========== TOOLBAR ==========
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

  // ========== WIRING ==========
  lockButton.addEventListener('click', toggleLock);
  addBlockBtn.addEventListener('click', createNewBlock);

  // Make sure row height follows column width on resize
  window.addEventListener('resize', getMetrics, { passive:true });

  // Seed
  getMetrics();
  createNewBlock();
});
