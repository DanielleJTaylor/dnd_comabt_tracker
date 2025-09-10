/* // scripts/combat_tracker.js
(() => {
  // ======= STATE =======
  let combatants = [];                 // mix: {type:'combatant'} and {type:'group', members:[]}
  let selectedCombatantIds = new Set();
  let isLocked = false;

  // NEW: round + turn pointer (combatants only)
  let currentRound = 1;
  let turnPtr = 0; // index into getTurnOrderIds()

  // ======= DOM =======
  const $ = (sel) => document.querySelector(sel);
  const combatantListBody     = $('#combatant-list-body');
  const addCombatantBtn       = $('#addCombatantBtn');
  const addGroupBtn           = $('#addGroupBtn');
  const lockGroupSelectionBtn = $('#lockGroupSelectionBtn');
  const trackerTable          = $('#tracker-table');

  const sortAscBtn            = $('#sort-init-asc');
  const sortDescBtn           = $('#sort-init-desc');

  // Save / Load buttons (prefer IDs)
  const saveBtn = document.getElementById('saveEncounterBtn');
  const loadBtn = document.getElementById('loadEncounterBtn');

  // Current encounter meta (id/name)
  let encounterId = null;
  let encounterName = 'Encounter';
  let _autosaveTimer = null;
  const AUTOSAVE_MS = 800; // debounce

  // Round/turn controls
  const roundCounterEl        = $('#roundCounter');
  const currentTurnEl         = $('#currentTurnDisplay');
  const prevTurnBtn           = $('#prevTurnBtn');
  const nextTurnBtn           = $('#nextTurnBtn');

  // ======= HELPERS =======
  const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  // --- Palette: up to 9 team colors (base for group row, member is lighter) ---
  // Order: red, orange, yellow, green, blue, pink, purple, brown, gray
  const GROUP_COLORS = [
    { base: '#f28b82', member: '#fde8e6', text: '#222' }, // red
    { base: '#fbbc04', member: '#fff3c4', text: '#222' }, // orange
    { base: '#fff176', member: '#fffbd1', text: '#222' }, // yellow
    { base: '#81c995', member: '#e7f5ea', text: '#222' }, // green
    { base: '#aecbfa', member: '#e8f0fe', text: '#222' }, // blue
    { base: '#f8bbd0', member: '#fde7f3', text: '#222' }, // pink
    { base: '#d7aefb', member: '#f3e8fd', text: '#222' }, // purple
    { base: '#d7b899', member: '#fbefe4', text: '#222' }, // brown (light tan)
    { base: '#e0e0e0', member: '#f5f5f5', text: '#222' }  // gray
  ];
  let _nextColorIdx = 0;

  // Ensure an existing group has a color index (migration-safe)
  function ensureGroupColorIdx(g) {
    if (typeof g.colorIdx === 'number') return g.colorIdx;
    const idx = _nextColorIdx % GROUP_COLORS.length;
    _nextColorIdx++;
    g.colorIdx = idx;
    return idx;
  }

  // --- Robust wiring for Save/Load buttons (and delegated fallback) ---
  (function wireSaveLoadButtons() {
    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.preventDefault(); saveEncounter(true); toast('Saved encounter');
      });
    } else {
      console.warn('[tracker] saveEncounterBtn not found');
    }
    if (loadBtn) {
      loadBtn.addEventListener('click', (e) => {
        e.preventDefault(); loadEncounter();
      });
    } else {
      console.warn('[tracker] loadEncounterBtn not found');
    }
    document.addEventListener('click', (e) => {
      const saveHit = e.target.closest('#saveEncounterBtn');
      if (saveHit) { e.preventDefault(); saveEncounter(true); toast('Saved encounter'); }
      const loadHit = e.target.closest('#loadEncounterBtn');
      if (loadHit) { e.preventDefault(); loadEncounter(); }
    }, true);
  })();

  // --- robust inline editor commit helpers ---
  function commitInlineEditor(inputEl) {
    if (!inputEl || !inputEl.classList?.contains('inline-editor')) return;

    const type    = inputEl.dataset.type;     // 'combatant' | 'group'
    const id      = inputEl.dataset.id;
    const field   = inputEl.dataset.field;    // 'name' | 'init' | 'ac' | 'tempHp' | 'hp' | 'maxHp'
    const intOnly = inputEl.dataset.intOnly === 'true';
    const spanEl  = inputEl._origSpan;
    if (!spanEl) return;

    let val = String(inputEl.value ?? '').trim();

    if (field === 'name') {
      if (!val) { showError('Name cannot be empty.'); inputEl.replaceWith(spanEl); return; }
      if (isNameTaken(val, id)) {
        showError('That name is already in use. Please choose another name.');
        inputEl.replaceWith(spanEl);
        return;
      }
    }

    if (intOnly) {
      const parsed = parseInt(val, 10);
      if (!Number.isFinite(parsed)) { inputEl.replaceWith(spanEl); return; }
      val = parsed;
    }

    spanEl.textContent = String(val);
    inputEl.replaceWith(spanEl);

    if (type === 'combatant') {
      updateCombatant(id, { [field]: val });
    } else if (type === 'group') {
      updateGroup(id, { [field]: val });
    }
  }

  function flushPendingEdits() {
    document.querySelectorAll('.inline-editor').forEach(commitInlineEditor);
  }

  // ======= PERSISTENCE =======
  function getSerializableState() {
    return {
      version: 1,
      combatants,
      currentRound,
      turnPtr,
    };
  }

  function applyState(s) {
    combatants    = Array.isArray(s?.combatants) ? s.combatants : [];
    currentRound  = Number.isFinite(s?.currentRound) ? s.currentRound : 1;
    turnPtr       = Number.isFinite(s?.turnPtr) ? s.turnPtr : 0;
    render();
  }

  function saveEncounter(manual = false) {
    if (!window.EncounterStore) { showError('EncounterStore not loaded.'); return; }

    if (manual && (!encounterId || !encounterName)) {
      const n = prompt('Encounter name:', encounterName || 'Encounter');
      if (n && n.trim()) encounterName = n.trim();
    }

    encounterId = window.EncounterStore.save({
      id: encounterId,
      name: encounterName,
      state: getSerializableState()
    });
    window.EncounterStore.setLastId(encounterId);
    if (manual) toast('Saved encounter');
  }

  function scheduleAutosave() {
    if (!window.EncounterStore) return;
    clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(() => saveEncounter(false), AUTOSAVE_MS);
  }

  function loadEncounter() {
    if (!window.EncounterStore) return;
    const list = window.EncounterStore.list();
    if (!list.length) { alert('No saved encounters yet.'); return; }

    const menu = list
      .map((e,i) => `${i+1}. ${e.name}  (${new Date(e.updated).toLocaleString()})`)
      .join('\n');

    const ans = prompt(`Load which encounter?\n\n${menu}\n\nEnter number:`);
    const idx = parseInt(ans, 10) - 1;
    if (!Number.isFinite(idx) || idx < 0 || idx >= list.length) return;

    const item = list[idx];
    const payload = window.EncounterStore.load(item.id);
    if (!payload) return;

    encounterId   = payload.id;
    encounterName = payload.name || 'Encounter';
    window.EncounterStore.setLastId(encounterId);
    applyState(payload.state);
  }

  // --- error banner (red) ---
  function showError(msg, ms = 3000) {
    let bar = document.getElementById('tracker-error-banner');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'tracker-error-banner';
      Object.assign(bar.style, {
        position: 'fixed',
        top: '12px',
        right: '12px',
        zIndex: '99999',
        background: '#c62828',
        color: '#fff',
        padding: '10px 14px',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0,0,0,.2)',
        fontWeight: '600',
        maxWidth: '60ch'
      });
      document.body.appendChild(bar);
    }
    bar.textContent = msg;
    bar.style.display = 'block';
    clearTimeout(showError._t);
    showError._t = setTimeout(() => { bar.style.display = 'none'; }, ms);
  }

  // --- tree walking for name uniqueness ---
  function forEachItem(cb) {
    for (const item of combatants) {
      if (item.type === 'combatant') cb(item);
      if (item.type === 'group') {
        cb(item);
        (item.members || []).forEach(cb);
      }
    }
  }
  function isNameTaken(name, excludeId = null) {
    const target = String(name || '').trim().toLowerCase();
    if (!target) return false;
    let taken = false;
    forEachItem((it) => {
      if (it.id === excludeId) return;
      const n = String(it.name || '').trim().toLowerCase();
      if (n && n === target) taken = true;
    });
    return taken;
  }
  function collectAllNamesLower() {
    const set = new Set();
    forEachItem((it) => { const n = (it.name || '').trim().toLowerCase(); if (n) set.add(n); });
    return set;
  }
  function generateUniqueName(base = 'Combatant') {
    const names = collectAllNamesLower();
    const b = String(base).trim() || 'Item';
    const lowerBase = b.toLowerCase();
    if (!names.has(lowerBase)) return b;
    let i = 2;
    while (names.has(`${lowerBase} ${i}`)) i++;
    return `${b} ${i}`;
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
  function allGroups() { return combatants.filter(c => c.type === 'group'); }

  // Groups have their own init used for top-level sorting
  function addGroupByName(name) {
    const safe = generateUniqueName(name || 'New Group');
    const colorIdx = _nextColorIdx % GROUP_COLORS.length;
    _nextColorIdx++;
    const group = { id: uid(), type: 'group', name: safe, init: undefined, members: [], colorIdx };
    combatants.push(group);
    return group;
  }
  function groupDisplayInit(group) {
    return Number.isFinite(group?.init) ? String(group.init) : '—';
  }
  function countAllCombatants() {
    let n = 0;
    for (const i of combatants) {
      if (i.type === 'combatant') n++;
      if (i.type === 'group') n += (i.members?.length || 0);
    }
    return n;
  }

  // ======= ROUND / TURN LOGIC =======
  function getTurnOrderIds() {
    const ids = [];
    combatants.forEach(item => {
      if (item.type === 'combatant') ids.push(item.id);
      else if (item.type === 'group') (item.members || []).forEach(m => ids.push(m.id));
    });
    return ids;
  }

  function clampTurnPtr() {
    const order = getTurnOrderIds();
    if (order.length === 0) { turnPtr = 0; return; }
    if (turnPtr < 0) turnPtr = 0;
    if (turnPtr >= order.length) turnPtr = order.length - 1;
  }

  function setRoundDisplay() {
    if (roundCounterEl) roundCounterEl.textContent = `Round: ${currentRound}`;
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

  function nextTurn() {
    const order = getTurnOrderIds();
    if (order.length === 0) return;

    turnPtr++;
    if (turnPtr >= order.length) {
      turnPtr = 0;
      currentRound += 1;
      setRoundDisplay();
    }
    render();
  }

  function prevTurn() {
    const order = getTurnOrderIds();
    if (order.length === 0) return;

    turnPtr--;
    if (turnPtr < 0) {
      turnPtr = Math.max(0, order.length - 1);
      if (currentRound > 1) currentRound -= 1;
      setRoundDisplay();
    }
    render();
  }

  // ======= UI SYNC =======
  function updateLockUI() {
    trackerTable?.classList.toggle('selection-locked', isLocked);
    lockGroupSelectionBtn.innerHTML = isLocked
      ? `🔓 <span class="label">Unlock Groups</span>`
      : `🔒 <span class="label">Lock Groups</span>`;
    if (isLocked) selectedCombatantIds.clear();
    dispatchRenderEvent();
  }
  function updateSelectionMarks() {
    [...combatantListBody.querySelectorAll('.tracker-table-row')].forEach(row => {
      const id = row.dataset.id;
      const checked = selectedCombatantIds.has(id);
      row.classList.toggle('selected', checked);
      const cb = row.querySelector('.select-cell input[type="checkbox"]');
      if (cb) cb.checked = checked;
    });
  }
  function dispatchRenderEvent() {
    window.dispatchEvent(new CustomEvent('tracker:render'));
  }

  // ======= CONDITIONS (5e) =======
  const CONDITION_LIST = [
    'Blinded','Charmed','Deafened','Frightened','Grappled','Incapacitated',
    'Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained',
    'Stunned','Unconscious','Concentrating'
  ];

  function ensureConditionsArray(c) {
    if (!Array.isArray(c.conditions)) c.conditions = [];
    return c.conditions;
  }

  function isConditionActive(cond, round) {
    return round >= cond.startRound && round <= cond.endRound;
  }

  function addConditionToCombatant(id, name, durationRounds = 1, note = '') {
    const { item } = findEntity(id);
    if (!item || item.type !== 'combatant') return false;
    const dur = Math.max(1, parseInt(durationRounds, 10) || 1);
    const cond = {
      id: `cond_${uid()}`,
      name: String(name || '').trim() || 'Condition',
      note: String(note || ''),
      startRound: currentRound,
      endRound: currentRound + dur - 1 // inclusive
    };
    ensureConditionsArray(item).push(cond);
    render();
    return true;
  }
  function removeCondition(id, condId) {
    const { item } = findEntity(id);
    if (!item || item.type !== 'combatant') return false;
    item.conditions = (item.conditions || []).filter(c => c.id !== condId);
    render();
    return true;
  }

  // ======= RENDER =======
  function render() {
    combatantListBody.innerHTML = '';

    const turnOrder = getTurnOrderIds();
    clampTurnPtr();
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

    // Only render chips that are active in the current round
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

      // Apply lighter tint for members under a colored group
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

    // Paint top-level rows, then members under each group
    combatants.forEach(item => {
      if (item.type === 'group') {
        renderGroupRow(item);
        (item.members || []).forEach(m => renderCombatantRow(m, true, item)); // pass group for color
      } else {
        renderCombatantRow(item, false, null);
      }
    });

    setRoundDisplay();
    setCurrentTurnDisplay();
    updateSelectionMarks();
    dispatchRenderEvent();

    // 🔁 Debounced autosave on every render
    scheduleAutosave();
  }

  // ======= DATA OPS =======
  function addDefaultCombatant() {
    const name = generateUniqueName(`Combatant ${countAllCombatants() + 1}`);
    const c = {
      id: uid(),
      type: 'combatant',
      name,
      init: 10, ac: 10, hp: 10, maxHp: 10, tempHp: 0,
      role: 'dm', imageUrl: '', dashboardId: null,
      conditions: []
    };
    combatants.push(c);
    render();
  }

  function createEmptyGroup() {
    const group = addGroupByName(`New Group ${allGroups().length + 1}`);
    render();
    return group;
  }

  function removeSelectedEverywhereCollect() {
    const collected = [];
    combatants = combatants.filter(item => {
      if (item.type === 'combatant' && selectedCombatantIds.has(item.id)) {
        collected.push(item);
        return false;
      }
      return true;
    });
    combatants.forEach(group => {
      if (group.type === 'group') {
        group.members = group.members.filter(m => {
          if (selectedCombatantIds.has(m.id)) {
            collected.push(m);
            return false;
          }
          return true;
        });
      }
    });
    return collected;
  }

  function moveSelectedToGroup(targetGroupId) {
    if (selectedCombatantIds.size === 0) return false;
    const { item: targetGroup } = findEntity(targetGroupId);
    if (!targetGroup || targetGroup.type !== 'group') return false;

    const moving = removeSelectedEverywhereCollect();
    if (moving.length === 0) return false;

    targetGroup.members.push(...moving);
    selectedCombatantIds.clear();
    render();
    return true;
  }

  function ungroupSelected() {
    const toUngroup = [];
    combatants.forEach(g => {
      if (g.type === 'group') {
        g.members = g.members.filter(m => {
          if (selectedCombatantIds.has(m.id)) {
            toUngroup.push(m);
            return false;
          }
          return true;
        });
      }
    });
    if (toUngroup.length) {
      combatants.push(...toUngroup);
      selectedCombatantIds.clear();
      render();
    }
  }

  function deleteSelected() {
    combatants = combatants.filter(c => !(c.type === 'combatant' && selectedCombatantIds.has(c.id)));
    combatants.forEach(g => {
      if (g.type === 'group') g.members = g.members.filter(m => !selectedCombatantIds.has(m.id));
    });
    selectedCombatantIds.clear();
    render();
  }

  // Update helpers
  function updateCombatant(id, patch) {
    const { item } = findEntity(id);
    if (!item || item.type !== 'combatant') return false;

    if ('name' in patch) {
      const proposed = String(patch.name || '').trim();
      if (!proposed) { showError('Name cannot be empty.'); return false; }
      if (isNameTaken(proposed, id)) {
        showError('That name is already in use. Please choose another name.');
        return false;
      }
    }
    Object.assign(item, patch);
    render();
    return true;
  }

  function updateGroup(id, patch) {
    const { item } = findEntity(id);
    if (!item || item.type !== 'group') return false;

    if ('name' in patch) {
      const proposed = String(patch.name || '').trim();
      if (!proposed) { showError('Name cannot be empty.'); return false; }
      if (isNameTaken(proposed, id)) {
        showError('That name is already in use. Please choose another name.');
        return false;
      }
    }
    if ('init' in patch && patch.init !== undefined) {
      const p = Number(patch.init);
      patch.init = Number.isFinite(p) ? p : undefined;
    }
    Object.assign(item, patch);
    render();
    return true;
  }

  // ===== Sorting helpers (name-aware tie-breaking) =====
  function splitNameForSort(name) {
    const trimmed = String(name || '').trim();
    const m = trimmed.match(/^(.*?)(?:\s+(\d+))?$/);
    const base = (m?.[1] || '').toLowerCase();
    const num = m?.[2] ? parseInt(m[2], 10) : null;
    return { base, num };
  }
  function compareNames(aName, bName, alphaDir = 'asc') {
    const A = splitNameForSort(aName);
    const B = splitNameForSort(bName);
    if (A.base !== B.base) {
      return alphaDir === 'asc'
        ? A.base.localeCompare(B.base)
        : B.base.localeCompare(A.base);
    }
    const aNum = A.num == null ? Number.POSITIVE_INFINITY : A.num;
    const bNum = B.num == null ? Number.POSITIVE_INFINITY : B.num;
    if (aNum !== bNum) return aNum - bNum;
    return String(aName || '').localeCompare(String(bName || ''));
  }

  function sortByInit(direction = 'desc') {
    flushPendingEdits();
    const dir = direction === 'asc' ? 'asc' : 'desc';
    const alphaDir = dir === 'desc' ? 'asc' : 'desc';

    const getInit = (item) => {
      if (item.type === 'group') return Number.isFinite(item.init) ? item.init : Number.NEGATIVE_INFINITY;
      return Number.isFinite(Number(item.init)) ? Number(item.init) : Number.NEGATIVE_INFINITY;
    };
    const getName = (item) => (item.name || '');

    const currentOrderBefore = getTurnOrderIds();
    const curId = currentOrderBefore[turnPtr];

    combatants.sort((a, b) => {
      const ai = getInit(a);
      const bi = getInit(b);
      if (ai !== bi) return dir === 'asc' ? ai - bi : bi - ai;
      return compareNames(getName(a), getName(b), alphaDir);
    });

    render();

    if (curId) {
      const newOrder = getTurnOrderIds();
      const idx = newOrder.indexOf(curId);
      if (idx >= 0) turnPtr = idx;
    }
  }

  // ======= PUBLIC API =======
  window.CombatAPI = {
    getAllCombatants: () => combatants,
    allGroups,
    getAllGroups: () => allGroups(),
    addGroupByName,

    getSelectedIds: () => new Set(selectedCombatantIds),
    setSelectedIds: (ids) => {
      selectedCombatantIds = new Set(ids);
      updateSelectionMarks();
      dispatchRenderEvent();
    },
    clearSelection: () => {
      selectedCombatantIds.clear();
      updateSelectionMarks();
      dispatchRenderEvent();
    },

    moveSelectedToGroup,
    ungroupSelected,
    deleteSelected,
    render,
    isLocked: () => isLocked,

    addCombatant: addDefaultCombatant,
    addGroup: createEmptyGroup,
    sortByInit,

    getCurrentRound: () => currentRound,
    getCurrentTurnId: () => getTurnOrderIds()[turnPtr] || null,
    nextTurn, prevTurn,

    addConditionToCombatant,
    removeCondition,
  };

  // ======= EVENTS =======
  addCombatantBtn?.addEventListener('click', addDefaultCombatant);
  addGroupBtn?.addEventListener('click', createEmptyGroup);
  lockGroupSelectionBtn?.addEventListener('click', () => {
    isLocked = !isLocked; updateLockUI();
  });

  sortAscBtn?.addEventListener('click', () => { flushPendingEdits(); CombatAPI.sortByInit('asc'); });
  sortDescBtn?.addEventListener('click', () => { flushPendingEdits(); CombatAPI.sortByInit('desc'); });

  nextTurnBtn?.addEventListener('click', () => CombatAPI.nextTurn());
  prevTurnBtn?.addEventListener('click', () => CombatAPI.prevTurn());

  saveBtn?.addEventListener('click', () => saveEncounter(true));
  loadBtn?.addEventListener('click', loadEncounter);

  // Per-row checkbox
  combatantListBody?.addEventListener('click', (e) => {
    const cb = e.target.closest('.combatant-checkbox');
    if (!cb) return;
    if (isLocked) { e.preventDefault(); return; }
    const id = cb.dataset.id;
    if (!id) return;
    if (cb.checked) selectedCombatantIds.add(id);
    else selectedCombatantIds.delete(id);
    updateSelectionMarks();
    dispatchRenderEvent();
  });

  // ======= INLINE EDITS, IMAGE PICKER, CONDITIONS UI =======
  combatantListBody?.addEventListener('click', (e) => {
    if (isLocked) return;

    // Remove condition chip
    const xBtn = e.target.closest('[data-remove-cond="1"]');
    if (xBtn) {
      const row = xBtn.closest('.tracker-table-row');
      const id = row?.dataset?.id;
      const condId = xBtn.dataset.condId;
      if (id && condId) CombatAPI.removeCondition(id, condId);
      return;
    }

    // Add condition via popover
    const addBtn = e.target.closest('.btn-add-status');
    if (addBtn) {
      const id = addBtn.dataset.id;
      openConditionPopover(addBtn, id);
      return;
    }

    // Image -> pick a new image
    const img = e.target.closest('.editable-img');
    if (img) {
      const id   = img.dataset.id;
      const pick = getImagePicker();
      pick.onchange = () => {
        const file = pick.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          updateCombatant(id, { imageUrl: reader.result });
          pick.value = '';
        };
        reader.readAsDataURL(file);
      };
      pick.click();
      return;
    }

    const nameSpan = e.target.closest('.editable-text');
    if (nameSpan) { activateInlineEdit(nameSpan, { intOnly: false }); return; }

    const intSpan = e.target.closest('.editable-int');
    if (intSpan) { activateInlineEdit(intSpan, { intOnly: true }); return; }
  });

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

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commitInlineEditor(input); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', () => commitInlineEditor(input), { once: true });
  }

  // single hidden file input for image picking
  let _imagePicker = null;
  function getImagePicker() {
    if (_imagePicker) return _imagePicker;
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    _imagePicker = inp;
    return inp;
  }

  // --- Condition Popover (dropdown with duration) ---
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
      : CONDITION_LIST;
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
        window.CombatAPI?.addConditionToCombatant(combatantId, name, dur);
        closeConditionPopover();
      }
    });

    document.addEventListener('keydown', onPopoverEsc);
    document.addEventListener('click', onDocClickClose, true);

    sel.focus();
  }

  // --- Condition hover tooltip ---
  let tipEl = null;
  let tipHostCell = null;
  function ensureTip(hostCell) {
    if (tipEl && tipHostCell === hostCell) return tipEl;
    if (tipEl && tipHostCell && tipEl.parentNode === tipHostCell) {
      tipHostCell.removeChild(tipEl);
    }
    tipEl = document.createElement('div');
    tipEl.className = 'cond-tooltip';
    tipEl.style.position = 'absolute';
    tipEl.style.minWidth = '220px';
    tipEl.style.maxWidth = '280px';
    tipEl.style.zIndex = '5';
    tipEl.style.pointerEvents = 'none';
    tipEl.style.background = 'rgba(255,255,255,.98)';
    tipEl.style.border = '1px solid rgba(0,0,0,.12)';
    tipEl.style.boxShadow = '0 6px 18px rgba(0,0,0,.15)';
    tipEl.style.borderRadius = '8px';
    tipEl.style.padding = '8px 10px';
    tipEl.style.color = '#222';
    tipEl.style.fontSize = '.85rem';
    tipEl.style.lineHeight = '1.25';
    tipEl.style.display = 'none';

    tipHostCell = hostCell;
    if (getComputedStyle(tipHostCell).position === 'static') {
      tipHostCell.style.position = 'relative';
    }
    tipHostCell.appendChild(tipEl);
    return tipEl;
  }
  function showCondTip(chipEl) {
    const row = chipEl.closest('.tracker-table-row');
    if (!row || row.dataset.type !== 'combatant') return;

    const statusCell = chipEl.closest('.status-cell');
    if (!statusCell) return;

    const name = chipEl.getAttribute('data-cond-name');
    const data = window.ConditionsCatalog?.get(name);
    if (!data) return;

    const tip = ensureTip(statusCell);
    const list = (data.desc || []).map(d => `<li>${d}</li>`).join('');
    tip.innerHTML = `<h4 style="margin:.1rem 0 .35rem;font-size:.95rem;">${data.name}</h4><ul style="margin:0;padding-left:1rem;">${list}</ul>`;

    const cellRect = statusCell.getBoundingClientRect();
    const chipRect = chipEl.getBoundingClientRect();

    const chipTopInCell = chipRect.top - cellRect.top;
    const chipLeftInCell = chipRect.left - cellRect.left;

    const pad = 6;
    tip.style.left = Math.max(4, Math.min(cellRect.width - 12, chipLeftInCell)) + 'px';
    tip.style.top  = (chipTopInCell + chipRect.height + pad) + 'px';
    tip.style.display = 'block';

    const tipRect = tip.getBoundingClientRect();
    const wouldClipBottom = tipRect.bottom > window.innerHeight - 8;
    if (wouldClipBottom) {
      tip.style.top = (chipTopInCell - tip.offsetHeight - pad) + 'px';
    }
  }
  function hideCondTip() {
    if (!tipEl) return;
    tipEl.style.display = 'none';
  }

  combatantListBody?.addEventListener('mousemove', (e) => {
    const chip = e.target.closest('.tracker-table-row[data-type="combatant"] .status-cell .condition-chip');
    if (!chip) { hideCondTip(); return; }
    showCondTip(chip);
  });
  combatantListBody?.addEventListener('mouseleave', () => { hideCondTip(); });

  // ======= ONE-TIME RESTORE =======
  let _restoredOnce = false;
  function tryRestoreLastDraftOnce() {
    if (_restoredOnce || !window.EncounterStore) return;
    const last = window.EncounterStore.getLastId();
    if (!last) { _restoredOnce = true; return; }
    const payload = window.EncounterStore.load(last);
    if (payload) {
      encounterId   = payload.id;
      encounterName = payload.name || 'Encounter';
      applyState(payload.state);
    }
    _restoredOnce = true;
  }

  function toast(msg, ms = 1200) {
    let el = document.getElementById('tracker-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tracker-toast';
      Object.assign(el.style, {
        position: 'fixed', bottom: '16px', right: '16px',
        background: '#222', color: '#fff', padding: '8px 12px',
        borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,.2)',
        zIndex: 99999, opacity: 0, transition: 'opacity .15s ease'
      });
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = 1;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.style.opacity = 0; }, ms);
  }

  // ======= INIT =======
  tryRestoreLastDraftOnce();
  setRoundDisplay();
  setCurrentTurnDisplay();
  render();
})();
 */