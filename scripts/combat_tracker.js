// scripts/combat_tracker.js
(() => {
  // ======= STATE =======
  let combatants = [];                 // top-level mix of {type:'combatant'} and {type:'group', members:[]}
  let selectedCombatantIds = new Set();
  let isLocked = false;

  // ======= DOM =======
  const $ = (sel) => document.querySelector(sel);
  const combatantListBody     = $('#combatant-list-body');
  const addCombatantBtn       = $('#addCombatantBtn');
  const addGroupBtn           = $('#addGroupBtn');
  const lockGroupSelectionBtn = $('#lockGroupSelectionBtn');
  const trackerTable          = $('#tracker-table');

  const sortAscBtn            = $('#sort-init-asc');
  const sortDescBtn           = $('#sort-init-desc');

  // ======= HELPERS =======
  const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

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

  function allGroups() {
    return combatants.filter(c => c.type === 'group');
  }

  // NEW: give groups their own init used for top-level sorting
  function addGroupByName(name) {
    const group = { id: uid(), type: 'group', name, init: undefined, members: [] };
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

  // ======= RENDER =======
// scripts/combat_tracker.js

// ... (previous JavaScript) ...

  // ======= RENDER =======
  function render() {
    combatantListBody.innerHTML = '';

    const renderGroupRow = (g) => {
      const row = document.createElement('div');
      row.className = 'group-row';
      row.dataset.id = g.id;
      row.dataset.type = 'group';
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



// ... (rest of the JavaScript) ...

  const renderCombatantRow = (c, isInGroup = false) => {
    const isSelected = selectedCombatantIds.has(c.id);
    const row = document.createElement('div');
    row.className = `tracker-table-row ${isInGroup ? 'in-group' : ''} ${isSelected ? 'selected' : ''}`;
    row.dataset.id = c.id;
    row.dataset.type = 'combatant';
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
      <div class="cell hp-cell">
        <span class="hp-heart">❤️</span>
        <span>${c.hp} / ${c.maxHp}</span>
      </div>
      <div class="cell temp-hp-cell">
        <span class="temp-icon">✨</span>
        <span class="editable-int" data-type="combatant" data-id="${c.id}" data-field="tempHp">${c.tempHp || 0}</span>
      </div>
      <div class="cell status-cell"><button class="btn-add-status">+ Add</button></div>
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
        // IMPORTANT: do NOT sort members here; keep insertion order while in group
        item.members.forEach(m => renderCombatantRow(m, true));
      } else {
        renderCombatantRow(item, false);
      }
    });

    updateSelectionMarks();
    dispatchRenderEvent();
  }

  // ======= DATA OPS =======
  function addDefaultCombatant() {
    const c = {
      id: uid(),
      type: 'combatant',
      name: `Combatant ${countAllCombatants() + 1}`,
      init: 10, ac: 10, hp: 10, maxHp: 10, tempHp: 0,
      role: 'dm', imageUrl: '', dashboardId: null
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

    // remove selected top-level combatants
    combatants = combatants.filter(item => {
      if (item.type === 'combatant' && selectedCombatantIds.has(item.id)) {
        collected.push(item);
        return false;
      }
      return true;
    });

    // remove selected from any groups
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

    targetGroup.members.push(...moving); // keep insertion order inside group
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

  // NEW: Update helpers used by inline editor
  function updateCombatant(id, patch) {
    const { item } = findEntity(id);
    if (!item || item.type !== 'combatant') return false;
    Object.assign(item, patch);
    render();
    return true;
  }

  function updateGroup(id, patch) {
    const { item } = findEntity(id);
    if (!item || item.type !== 'group') return false;
    // ensure numeric init becomes a number
    if ('init' in patch && patch.init !== undefined) {
      const p = Number(patch.init);
      patch.init = Number.isFinite(p) ? p : undefined;
    }
    Object.assign(item, patch);
    render();
    return true;
  }

  // NEW: Sort top-level items (groups + ungrouped combatants) by their own init
  // Members inside groups are NOT sorted (ignore their init while grouped)
  function sortByInit(direction = 'desc') {
    const dir = direction === 'asc' ? 1 : -1;

    const getVal = (item) => {
      if (item.type === 'group') {
        return Number.isFinite(item.init) ? item.init : Number.NEGATIVE_INFINITY;
      }
      // ungrouped combatant
      return Number.isFinite(Number(item.init)) ? Number(item.init) : Number.NEGATIVE_INFINITY;
    };

    combatants.sort((a, b) => (getVal(a) - getVal(b)) * dir);

    // Do not sort g.members
    render();
  }

  // ======= PUBLIC API (used by group-selector.js) =======
  window.CombatAPI = {
    // data
    getAllCombatants: () => combatants,
    allGroups,                      // legacy
    getAllGroups: () => allGroups(),// explicit accessor
    addGroupByName,

    // selection
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

    // actions
    moveSelectedToGroup,
    ungroupSelected,
    deleteSelected,
    render,
    isLocked: () => isLocked,

    // utility
    addCombatant: addDefaultCombatant,
    addGroup: createEmptyGroup,
    sortByInit,
    toggleLock: () => {
      isLocked = !isLocked;
      updateLockUI();
      return isLocked;
    }
  };

  // ======= EVENTS =======
  addCombatantBtn?.addEventListener('click', addDefaultCombatant);
  addGroupBtn?.addEventListener('click', createEmptyGroup);
  lockGroupSelectionBtn?.addEventListener('click', () => {
    isLocked = !isLocked;
    updateLockUI();
  });

  // Header INIT sort controls
  sortAscBtn?.addEventListener('click', () => CombatAPI.sortByInit('asc'));
  sortDescBtn?.addEventListener('click', () => CombatAPI.sortByInit('desc'));

  // Per-row checkbox (kept here so selection works even if GroupSelector is missing)
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

  // ======= INLINE EDITS & IMAGE PICKER =======
  combatantListBody?.addEventListener('click', (e) => {
    if (isLocked) return;

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

    // String fields (name)
    const nameSpan = e.target.closest('.editable-text');
    if (nameSpan) {
      activateInlineEdit(nameSpan, { intOnly: false });
      return;
    }

    // Integer fields (init, ac, tempHp)
    const intSpan = e.target.closest('.editable-int');
    if (intSpan) {
      activateInlineEdit(intSpan, { intOnly: true });
      return;
    }
  });

  // Reusable inline editor
  function activateInlineEdit(spanEl, { intOnly = false } = {}) {
    const type  = spanEl.dataset.type;   // 'combatant' | 'group'
    const id    = spanEl.dataset.id;
    const field = spanEl.dataset.field;  // 'name' | 'init' | 'ac' | 'tempHp'
    const old   = spanEl.textContent.trim();

    const input = document.createElement('input');
    input.type  = 'text';
    input.value = old;
    input.className = 'inline-editor';
    input.setAttribute('inputmode', intOnly ? 'numeric' : 'text');

    spanEl.replaceWith(input);
    input.focus();
    input.select();

    const cancel = () => {
      input.replaceWith(spanEl);
    };
    const commit = () => {
      let val = input.value.trim();
      if (intOnly) {
        const parsed = parseInt(val, 10);
        if (!Number.isFinite(parsed)) { cancel(); return; }
        val = parsed;
      }
      if (type === 'combatant') updateCombatant(id, { [field]: val });
      else if (type === 'group') updateGroup(id, { [field]: val });
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
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

  // ======= INIT =======
  render();
})();