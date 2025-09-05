// dashboard-sheet.js
// Final version with click-and-hold to drag, ghost previews for all movements,
// 8-direction resizing, and robust collision pushing.

document.addEventListener('DOMContentLoaded', () => {
    // ---- DOM & State ----
    const blocksContainer = document.getElementById('blocks-container');
    const addBlockBtn = document.getElementById('add-block-btn');
    const lockButton = document.getElementById('lock-toggle-btn');
    const sheetContainer = document.getElementById('sheet-container');
    const formatToolbar = document.getElementById('format-toolbar');

    let isLocked = false;
    let ghostEl = null; // A single ghost element for previews



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
    /**
     * Calculates the current dimensions of the grid cells.
     * @returns {object} An object with cols, gap, cellW, and rowUnit.
     */
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
    /** Checks if two rectangular areas overlap. */
    function rectsOverlap(a, b) {
        return !(
            a.colStart + a.colSpan <= b.colStart ||
            b.colStart + b.colSpan <= a.colStart ||
            a.rowStart + a.rowSpan <= b.rowStart ||
            b.rowStart + b.rowSpan <= a.rowStart
        );
    }

    /** Gets the grid positions of all blocks on the sheet. */
    function getAllRects(excludeEl) {
        return [...blocksContainer.querySelectorAll('.block')]
            .filter(el => el !== excludeEl)
            .map(readRect);
    }

    /** Checks if a target rectangle collides with any existing block. */
    function collides(targetRect, excludeEl) {
        return getAllRects(excludeEl).some(r => rectsOverlap(targetRect, r));
    }

    /** Finds the next available row for a block, pushing it down until it fits. */
    function dropToFreeRow(rect, excludeEl) {
        let testRect = { ...rect };
        while (collides(testRect, excludeEl)) {
            testRect.rowStart += 1;
        }
        return testRect;
    }

    /**
     * The core collision algorithm. When a "pusher" block is placed,
     * this function finds any "victim" blocks it overlaps and pushes them
     * down, handling chain reactions recursively.
     */
    function resolveCollisions(pusherRect, excludeEl) {
        const victims = getAllRects(excludeEl).filter(r => rectsOverlap(pusherRect, r));
        victims.sort((a, b) => a.rowStart - b.rowStart); // Process from top to bottom

        for (const victimRect of victims) {
            const newRowStart = pusherRect.rowStart + pusherRect.rowSpan;
            const newVictimRect = { ...victimRect, rowStart: newRowStart };
            writeRect(victimRect.el, newVictimRect);
            
            // The victim has moved and is now a new pusher.
            // Recursively resolve any collisions it may have caused.
            resolveCollisions(newVictimRect, victimRect.el);
        }
    }

    // ========== DATA HELPERS ==========
    /** Reads a block's grid position from its dataset attributes. */
    function readRect(el) {
        if (!el) return null;
        return { el, colStart: +el.dataset.colStart, rowStart: +el.dataset.rowStart, colSpan: +el.dataset.colSpan, rowSpan: +el.dataset.rowSpan };
    }

    /** Writes a block's grid position to its dataset and applies CSS styles. */
    function writeRect(el, rect) {
        if (!el || !rect) return;
        el.dataset.colStart = rect.colStart;
        el.dataset.rowStart = rect.rowStart;
        el.dataset.colSpan = rect.colSpan;
        el.dataset.rowSpan = rect.rowSpan;
        el.style.gridColumn = `${rect.colStart} / span ${rect.colSpan}`;
        el.style.gridRow = `${rect.rowStart} / span ${rect.rowSpan}`;
    }

    function makeImageBlock(block, dataUrl) {
      // mark mode
      block.classList.add('image-block');
      // clear text content
      const content = block.querySelector('.block-content');
      content.innerHTML = '';                      // remove text
      content.setAttribute('contenteditable', 'false');

      // build image DOM
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

      bindImageResizer(block);   // enable image-only resizing
      bindImageActions(block);   // replace/remove/fit/fill
    }

    function revokeImageBlock(block) {
      block.classList.remove('image-block');
      const content = block.querySelector('.block-content');
      content.innerHTML = '';
      content.setAttribute('contenteditable', 'true');
      // focus for immediate typing
      content.focus();
    }

    function bindImageResizer(block) {
      const wrap = block.querySelector('.img-wrap');
      if (!wrap) return;

      // Start with full size
      wrap.style.width = '100%';
      wrap.style.height = '100%';

      // Limiter to block's content box
      const restrictRect = block.querySelector('.block-content');

      interact(wrap).resizable({
        edges: { right: true, bottom: true, bottomRight: true, top: false, left: false, topLeft: false, topRight: false, bottomLeft: false },
        listeners: {
          start(evt) {
            beginInteractionSelectionGuard();
            wrap.classList.add('resizing-image');
            // cache starting size in pixels
            const cs = getComputedStyle(wrap);
            wrap.dataset.w = parseFloat(cs.width) || wrap.clientWidth;
            wrap.dataset.h = parseFloat(cs.height) || wrap.clientHeight;
          },
          move(evt) {
            const startW = parseFloat(wrap.dataset.w);
            const startH = parseFloat(wrap.dataset.h);
            let w = startW + evt.deltaRect.width;
            let h = startH + evt.deltaRect.height;

            // clamp to container
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
          inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
          document.body.appendChild(inp);
          inp.onchange = async () => {
            const file = inp.files?.[0];
            if (file) img.src = await fileToDataUrl(file);
            inp.remove();
          };
          inp.click();
        } else if (act === 'remove') {
          revokeImageBlock(block);
        } else if (act === 'fit') {
          wrap.style.width = '100%';
          wrap.style.height = '100%';
          img.style.objectFit = 'contain';
        } else if (act === 'fill') {
          wrap.style.width = '100%';
          wrap.style.height = '100%';
          img.style.objectFit = 'cover';
        }
      });
    }




    // ========== GHOST PREVIEW ==========
    /** Creates or updates the ghost element for previews. */
    function updateGhost(rect) {
        if (!ghostEl) {
            ghostEl = document.createElement('div');
            ghostEl.className = 'block-ghost';
            blocksContainer.appendChild(ghostEl);
        }
        writeRect(ghostEl, rect);
    }
    
    /** Removes the ghost element from the DOM. */
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

        <!-- Only the three handles we want -->
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
              beginInteractionSelectionGuard();            // <<< add
              e.target.classList.add('dragging-active');
              e.target.setAttribute('data-start-rect', JSON.stringify(readRect(e.target)));
              updateGhost(readRect(e.target));
            },
            move: dragMove,
            end: e => {
              endInteractionSelectionGuard();              // <<< add
              dragEnd(e);
            }
          }
        })
        .resizable({
          edges: { top: false, left: false, bottom: true, right: true },
          listeners: {
            start: e => {
              beginInteractionSelectionGuard();            // <<< add
              e.target.classList.add('resizing-active');
              updateGhost(readRect(e.target));
              e.target.setAttribute('data-start-rect', JSON.stringify(readRect(e.target)));
            },
            move: resizeMove,
            end: e => {
              endInteractionSelectionGuard();              // <<< add
              resizeEnd(e);
            }
          }
        });

        const content = el.querySelector('.block-content');

        // PASTE → make image block if an image is present
        content.addEventListener('paste', async (e) => {
          if (isLocked) return;
          const cd = e.clipboardData;
          if (!cd) return;

          // (1) Files
          const file = [...cd.files].find(f => f.type.startsWith('image/'));
          if (file) {
            e.preventDefault();
            const url = await fileToDataUrl(file);
            makeImageBlock(el, url);
            return;
          }

          // (2) HTML with <img>
          const html = cd.getData('text/html');
          if (html) {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            const pastedImg = temp.querySelector('img[src]');
            if (pastedImg?.src) {
              e.preventDefault();
              makeImageBlock(el, pastedImg.src);
              return;
            }
          }

          // (3) Fallback: allow normal text paste only if not an image block
          if (el.classList.contains('image-block')) {
            e.preventDefault(); // block text when image is present
          }
        });

        // DRAG & DROP → make image block
        content.addEventListener('dragover', (e) => {
          if (isLocked) return;
          e.preventDefault();
        });
        content.addEventListener('drop', async (e) => {
          if (isLocked) return;
          e.preventDefault();
          const dt = e.dataTransfer;

          // Files
          const file = [...(dt.files || [])].find(f => f.type.startsWith('image/'));
          if (file) {
            const url = await fileToDataUrl(file);
            makeImageBlock(el, url);
            return;
          }

          // HTML with <img>
          const html = dt.getData('text/html');
          if (html) {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            const droppedImg = temp.querySelector('img[src]');
            if (droppedImg?.src) {
              makeImageBlock(el, droppedImg.src);
              return;
            }
          }
        });

      content.addEventListener('keydown', (e) => {
        if (!el.classList.contains('image-block')) return;

        // Allow delete/backspace to remove the image
        if ((e.key === 'Backspace' || e.key === 'Delete')) {
          e.preventDefault();
          revokeImageBlock(el);
          return;
        }

        // Block all other typing
        e.preventDefault();
      });



      el.querySelector('.delete-btn')?.addEventListener('click', () => {
        if (!isLocked) el.remove();
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
        
        let ghostRect = { ...originalRect, colStart: originalRect.colStart + colShift, rowStart: originalRect.rowStart + rowShift };
        
        // Clamp ghost position to grid boundaries
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

      // If it doesn’t fit horizontally within the grid, revert to original position
      const overRight = finalRect.colStart + finalRect.colSpan - 1 > cols;
      if (overRight) {
        if (startRect) writeRect(el, startRect);
        return;
      }

      // Otherwise, normal push-down placement
      const pushedRect = dropToFreeRow(finalRect, el);
      writeRect(el, pushedRect);
      resolveCollisions(pushedRect, el);
    }

    
    // --- RESIZE LISTENERS ---
    function resizeMove(e) {
      const metrics = getMetrics();
      const startRect = JSON.parse(e.target.getAttribute('data-start-rect'));
      let newRect = { ...startRect };

      // Only right/bottom grow/shrink
      if (e.edges.right) {
        const colSpanByPx = Math.round(e.rect.width / (metrics.cellW + metrics.gap));
        newRect.colSpan = Math.max(1, colSpanByPx);
      }
      if (e.edges.bottom) {
        const rowSpanByPx = Math.round(e.rect.height / (metrics.rowUnit + metrics.gap));
        newRect.rowSpan = Math.max(1, rowSpanByPx);
      }

      // Clamp to grid horizontally
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
        
        if (finalRect) {
            writeRect(el, finalRect);
            resolveCollisions(finalRect, el);
        }
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
    
    // Initial setup
    createNewBlock();
});