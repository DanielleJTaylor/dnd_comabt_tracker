// scripts/combat-render.js
(() => {
  // Mirror the original locals so the unchanged render() body can use them
  let combatants = [];
  let selectedCombatantIds = new Set();
  let currentRound = 1;
  let turnPtr = 0;

  // Keep these mirrors in sync with CombatState
  function syncFromState() {
    const s = window.CombatState.__internals.getStateVars();
    combatants = s.combatants;
    selectedCombatantIds = s.selectedCombatantIds;
    currentRound = s.currentRound;
    turnPtr = s.turnPtr;
  }

  const $ = (s)=>document.querySelector(s);

  const combatantListBody     = $('#combatant-list-body');
  const addCombatantBtn       = $('#addCombatantBtn');
  const addGroupBtn           = $('#addGroupBtn');
  const lockGroupSelectionBtn = $('#lockGroupSelectionBtn');
  const trackerTable          = $('#tracker-table');
  const sortAscBtn            = $('#sort-init-asc');
  const sortDescBtn           = $('#sort-init-desc');
  const roundCounterEl        = $('#roundCounter');
  const currentTurnEl         = $('#currentTurnDisplay');
  const prevTurnBtn           = $('#prevTurnBtn');
  const nextTurnBtn           = $('#nextTurnBtn');

  // Helpers referenced by render (unchanged)
  function setRoundDisplay() {
    if (roundCounterEl) roundCounterEl.textContent = `Round: ${currentRound}`;
  }
  function getTurnOrderIds() {
    const ids = [];
    combatants.forEach(item => {
      if (item.type === 'combatant') ids.push(item.id);
      else if (item.type === 'group') (item.members || []).forEach(m => ids.push(m.id));
    });
    return ids;
  }
  function setCurrentTurnDisplay() {
    const order = getTurnOrderIds();
    const id = order[turnPtr];
    let name = 'None';
    if (id) {
      const found = findEntity(id).item;
      if (found) name = found.name || 'Combatant';
    }
    if (currentTurnEl) currentTurnEl.innerHTML = `🟢 Current Turn: <strong>${name}</strong>`;
  }
  function findEntity(id, parent = null, list = combatants) {
    for (const item of list) {
      if (item.id === id) return { item, parent, list };
      if (item.type === 'group' && item.members) {
        const found = findEntity(id, item, item.members);
        if (found.item) return found;
      }
    }
    return { item: null, parent: null, list: null };
  }
  function ensureConditionsArray(c) {
    if (!Array.isArray(c.conditions)) c.conditions = [];
    return c.conditions;
  }
  function isConditionActive(cond, round) { return round >= cond.startRound && round <= cond.endRound; }
  function groupDisplayInit(group) {
    return Number.isFinite(group?.init) ? String(group.init) : '—';
  }
  function dispatchRenderEvent() { window.dispatchEvent(new CustomEvent('tracker:render')); }
  function updateSelectionMarks() {
    [...combatantListBody.querySelectorAll('.tracker-table-row')].forEach(row => {
      const id = row.dataset.id;
      const checked = selectedCombatantIds.has(id);
      row.classList.toggle('selected', checked);
      const cb = row.querySelector('.select-cell input[type="checkbox"]');
      if (cb) cb.checked = checked;
    });
  }
  function ensureGroupColorIdx(g) { return window.CombatState.ensureGroupColorIdx(g); }
  const GROUP_COLORS = window.CombatState.getGroupColors();

  // ======= RENDER (UNCHANGED) =======
  function render() {
    // sync mirrors before each paint
    syncFromState();

    combatantListBody.innerHTML = '';

    const turnOrder = getTurnOrderIds();
    const currentId = turnOrder[turnPtr] || null;

    const renderGroupRow = (g) => {
      const idx = ensureGroupColorIdx(g);
      const scheme = GROUP_COLORS[idx % GROUP_COLORS.length];

      const row = document.createElement('div');
      row.className = 'group-row';
      row.dataset.id = g.id;
      row.dataset.type = 'group';
      row.style.backgroundColor = scheme.base;
      row.style.color = scheme.text;

      row.innerHTML = `
        <div class="cell select-cell"></div>
        <div class="cell image-cell">
          <img src="images/folder.png" alt="Group Folder" class="group-folder-img">
        </div>
        <div class="cell init-cell">
          <span class="editable-int" data-type="group" data-id="${g.id}" data-field="init">${groupDisplayInit(g)}</span>
        </div>
        <div class="cell name-cell">
          <span class="editable-text" data-type="group" data-id="${g.id}" data-field="name">${g.name}</span>
        </div>
        <div class="cell ac-cell"></div>
        <div class="cell hp-cell"></div>
        <div class="cell temp-hp-cell"></div>
        <div class="cell status-cell"></div>
        <div class="cell role-cell"></div>
        <div class="cell actions-cell"></div>
        <div class="cell dashboard-link-cell"></div>
      `;
      combatantListBody.appendChild(row);
    };

    function renderConditions(c) {
      const list = ensureConditionsArray(c);
      const activeNow = list.filter(cond => isConditionActive(cond, currentRound));
      if (!activeNow.length) return '<div class="cond-list"></div>';

      const chips = activeNow.map(cond => {
        const remaining = cond.endRound - currentRound + 1; // inclusive
        const remTxt = ` (${Math.max(0, remaining)}r)`;
        const safeName = (cond.name || '').replace(/"/g,'&quot;');
        return `<span class="condition-chip" data-cond-id="${cond.id}" data-cond-name="${safeName}">
                  ${cond.name}${remTxt}
                  <span class="x" title="Remove" data-remove-cond="1" data-cond-id="${cond.id}">×</span>
                </span>`;
      }).join('');

      return `<div class="cond-list">${chips}</div>`;
    }

    const renderCombatantRow = (c, isInGroup = false, groupForColor = null) => {
      const isSelected = selectedCombatantIds.has(c.id);
      const isCurrent  = currentId === c.id;

      const row = document.createElement('div');
      row.className = `tracker-table-row ${isInGroup ? 'in-group' : ''} ${isSelected ? 'selected' : ''} ${isCurrent ? 'current-turn' : ''}`;
      row.dataset.id = c.id;
      row.dataset.type = 'combatant';

      if (isInGroup && groupForColor) {
        const idx = ensureGroupColorIdx(groupForColor);
        const scheme = GROUP_COLORS[idx % GROUP_COLORS.length];
        row.style.backgroundColor = scheme.member;
        row.style.color = scheme.text;
      }

      row.innerHTML = `
        <div class="cell select-cell">
          <input type="checkbox" class="combatant-checkbox" data-id="${c.id}" ${isSelected ? 'checked' : ''}>
        </div>
        <div class="cell image-cell">
          <img class="editable-img" data-type="combatant" data-id="${c.id}" src="${c.imageUrl || 'images/icon.png'}" alt="${c.name}">
        </div>
        <div class="cell init-cell">
          <span class="editable-int" data-type="combatant" data-id="${c.id}" data-field="init">${c.init}</span>
        </div>
        <div class="cell name-cell">
          <span class="editable-text" data-type="combatant" data-id="${c.id}" data-field="name">${c.name}</span>
        </div>
        <div class="cell ac-cell">
          <span class="ac-shield">🛡️</span>
          <span class="editable-int" data-type="combatant" data-id="${c.id}" data-field="ac">${c.ac}</span>
        </div>
        <div class="cell hp-cell" data-id="${c.id}">
          <span class="hp-heart">❤️</span>
          <span class="editable-int" data-type="combatant" data-id="${c.id}" data-field="hp">${c.hp}</span>
          <span> / </span>
          <span class="editable-int" data-type="combatant" data-id="${c.id}" data-field="maxHp">${c.maxHp}</span>
        </div>
        <div class="cell temp-hp-cell">
          <span class="temp-icon">✨</span>
          <span class="editable-int" data-type="combatant" data-id="${c.id}" data-field="tempHp">${c.tempHp || 0}</span>
        </div>
        <div class="cell status-cell">
          ${renderConditions(c)}
          <button class="btn btn-add-status" data-id="${c.id}">+ Add</button>
        </div>
        <div class="cell role-cell">${c.role?.toUpperCase?.() || ''}</div>
        <div class="cell actions-cell">
          <div class="btn-group">
            <button title="Edit">⚙️</button>
            <button title="Notes">📝</button>
            <button title="Delete">🗑️</button>
          </div>
        </div>
        <div class="cell dashboard-link-cell"><button title="Toggle Dashboard">📄</button></div>
      `;
      combatantListBody.appendChild(row);
    };

    // Paint
    combatants.forEach(item => {
      if (item.type === 'group') {
        renderGroupRow(item);
        (item.members || []).forEach(m => renderCombatantRow(m, true, item));
      } else {
        renderCombatantRow(item, false, null);
      }
    });

    setRoundDisplay();
    setCurrentTurnDisplay();
    updateSelectionMarks();
    dispatchRenderEvent();

    // 🔁 Debounced autosave on every render (provided by combat-persist.js)
    window.scheduleAutosave?.();
  }

  // ======= Events & inline edit helpers (unchanged logic) =======
  function activateInlineEdit(spanEl, { intOnly = false } = {}) {
    const type  = spanEl.dataset.type;
    const id    = spanEl.dataset.id;
    const field = spanEl.dataset.field;
    const old   = spanEl.textContent.trim();

    const input = document.createElement('input');
    input.type  = 'text';
    input.value = old;
    input.className = 'inline-editor';
    input.setAttribute('inputmode', intOnly ? 'numeric' : 'text');

    input.dataset.type    = type;
    input.dataset.id      = id;
    input.dataset.field   = field;
    input.dataset.intOnly = String(!!intOnly);
    input._origSpan       = spanEl;

    spanEl.replaceWith(input);
    input.focus();
    input.select();

    const cancel = () => { input.replaceWith(spanEl); };

    function commitInlineEditor(inputEl) {
      if (!inputEl || !inputEl.classList?.contains('inline-editor')) return;
      const type    = inputEl.dataset.type;
      const id      = inputEl.dataset.id;
      const field   = inputEl.dataset.field;
      const intOnly = inputEl.dataset.intOnly === 'true';
      const spanEl  = inputEl._origSpan;
      if (!spanEl) return;
      let val = String(inputEl.value ?? '').trim();
      if (intOnly) {
        const parsed = parseInt(val, 10);
        if (!Number.isFinite(parsed)) { inputEl.replaceWith(spanEl); return; }
        val = parsed;
      }
      spanEl.textContent = String(val);
      inputEl.replaceWith(spanEl);
      if (type === 'combatant') window.CombatState.updateCombatant(id, { [field]: val });
      else window.CombatState.updateGroup(id, { [field]: val });
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commitInlineEditor(input); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', () => commitInlineEditor(input), { once: true });
  }

  // lock button
  lockGroupSelectionBtn?.addEventListener('click', ()=>{
    window.CombatState.setLocked(!window.CombatState.isLocked());
    trackerTable?.classList.toggle('selection-locked', window.CombatState.isLocked());
    lockGroupSelectionBtn.innerHTML = window.CombatState.isLocked()
      ? `🔓 <span class="label">Unlock Groups</span>`
      : `🔒 <span class="label">Lock Groups</span>`;
  });

  // add / sort / turns
  addCombatantBtn?.addEventListener('click', ()=> window.CombatState.addCombatant());
  addGroupBtn?.addEventListener('click', ()=> window.CombatState.addGroupByName(`New Group ${window.CombatState.getSnapshot().combatants.filter(x=>x.type==='group').length+1}`));
  sortAscBtn?.addEventListener('click', ()=> window.CombatState.sortByInit('asc'));
  sortDescBtn?.addEventListener('click', ()=> window.CombatState.sortByInit('desc'));
  nextTurnBtn?.addEventListener('click', ()=> window.CombatState.nextTurn());
  prevTurnBtn?.addEventListener('click', ()=> window.CombatState.prevTurn());

  // Checkbox selection
  combatantListBody?.addEventListener('click', (e) => {
    const cb = e.target.closest('.combatant-checkbox');
    if (!cb) return;
    if (window.CombatState.isLocked()) { e.preventDefault(); return; }
    const id = cb.dataset.id;
    const sel = window.CombatState.getSelectedIds();
    if (cb.checked) sel.add(id); else sel.delete(id);
    window.CombatState.setSelectedIds(sel);
  });

  // Image / conditions / inline edits
  combatantListBody?.addEventListener('click', (e) => {
    if (window.CombatState.isLocked()) return;

    // remove condition
    const xBtn = e.target.closest('[data-remove-cond="1"]');
    if (xBtn) {
      const row = xBtn.closest('.tracker-table-row');
      const id = row?.dataset?.id;
      const condId = xBtn.dataset.condId;
      if (id && condId) window.CombatState.removeCondition(id, condId);
      return;
    }

    // add condition
    const addBtn = e.target.closest('.btn-add-status');
    if (addBtn) {
      const id = addBtn.dataset.id;
      openConditionPopover(addBtn, id);
      return;
    }

    // image picker
    const img = e.target.closest('.editable-img');
    if (img) {
      const id   = img.dataset.id;
      const inp = getImagePicker();
      inp.onchange = () => {
        const file = inp.files?.[0]; if (!file) return;
        const r = new FileReader();
        r.onload = () => { window.CombatState.updateCombatant(id, { imageUrl: r.result }); inp.value=''; };
        r.readAsDataURL(file);
      };
      inp.click();
      return;
    }

    // inline edits
    const nameSpan = e.target.closest('.editable-text');
    if (nameSpan) { activateInlineEdit(nameSpan, { intOnly: false }); return; }
    const intSpan = e.target.closest('.editable-int');
    if (intSpan) { activateInlineEdit(intSpan, { intOnly: true }); return; }
  });

  // single hidden file input
  let _picker = null;
  function getImagePicker() {
    if (_picker) return _picker;
    _picker = document.createElement('input');
    _picker.type = 'file'; _picker.accept = 'image/*'; _picker.style.display = 'none';
    document.body.appendChild(_picker);
    return _picker;
  }

  // --- Condition Popover (same logic) ---
  let _condPopover = null;
  function closeConditionPopover() {
    if (_condPopover) { _condPopover.remove(); _condPopover = null; }
    document.removeEventListener('keydown', onPopoverEsc);
    document.removeEventListener('click', onDocClickClose, true);
  }
  function onPopoverEsc(e) { if (e.key === 'Escape') closeConditionPopover(); }
  function onDocClickClose(e) {
    if (!_condPopover) return;
    if (e.target.closest('.cond-popover')) return;
    if (e.target.closest('.btn-add-status')) return;
    closeConditionPopover();
  }
  function openConditionPopover(anchorBtn, combatantId) {
    closeConditionPopover();

    const pop = document.createElement('div');
    pop.className = 'cond-popover';
    Object.assign(pop.style, {
      position: 'fixed',
      zIndex: 1000,
      background: 'rgba(255,255,255,.98)',
      border: '1px solid rgba(0,0,0,.12)',
      borderRadius: '10px',
      boxShadow: '0 10px 30px rgba(0,0,0,.15)',
      padding: '10px',
      minWidth: '280px',
      color: '#222'
    });
    pop.innerHTML = `
      <div class="row" style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;">
        <label for="condSelect" style="min-width:82px;">Condition</label>
        <select id="condSelect" style="flex:1;padding:.25rem .4rem;"></select>
      </div>
      <div class="row" style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;">
        <label for="condDur" style="min-width:82px;">Duration</label>
        <input id="condDur" type="number" min="1" step="1" value="2" style="width:5rem;padding:.25rem .4rem;">
        <span>rounds</span>
      </div>
      <div class="actions" style="display:flex;gap:.5rem;justify-content:flex-end;">
        <button class="btn btn-secondary" data-act="cancel">Cancel</button>
        <button class="btn" data-act="add">Add</button>
      </div>
    `;
    document.body.appendChild(pop);
    _condPopover = pop;

    const sel = pop.querySelector('#condSelect');
    const source = (window.ConditionsCatalog?.list && window.ConditionsCatalog.list.length)
      ? window.ConditionsCatalog.list
      : window.CombatState.CONDITION_LIST;
    source.forEach(name => {
      const o = document.createElement('option');
      o.value = name;
      o.textContent = name;
      sel.appendChild(o);
    });

    const rect = anchorBtn.getBoundingClientRect();
    const margin = 6;
    const belowTop = rect.bottom + margin;
    const aboveTop = rect.top - margin - pop.offsetHeight;
    const wantBelow = (belowTop + 200 < window.innerHeight);

    const left = Math.min(window.innerWidth - pop.offsetWidth - 8, Math.max(8, rect.left));
    const top  = wantBelow ? belowTop : Math.max(8, aboveTop);
    pop.style.left = `${left}px`;
    pop.style.top  = `${top}px`;

    pop.addEventListener('click', (e) => {
      const act = e.target.closest('button')?.dataset?.act;
      if (!act) return;
      if (act === 'cancel') { closeConditionPopover(); return; }
      if (act === 'add') {
        const name = sel.value || 'Condition';
        const dur  = Math.max(1, parseInt(pop.querySelector('#condDur').value || '1', 10) || 1);
        window.CombatState.addConditionToCombatant(combatantId, name, dur);
        closeConditionPopover();
      }
    });

    document.addEventListener('keydown', onPopoverEsc);
    document.addEventListener('click', onDocClickClose, true);

    sel.focus();
  }

  // Repaint on any state change
  window.CombatState.subscribe(() => { render(); });

  // Initial paint
  render();
})();
