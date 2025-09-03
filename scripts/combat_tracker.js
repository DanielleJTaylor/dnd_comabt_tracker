// scripts/combat_tracker.js
(() => {
  // ======= STATE =======
  let combatants = [];                 // [{ type:'combatant' | 'group', ... }]
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
      if (item.id === id) return { item, parent };
      if (item.type === 'group' && item.members) {
        const found = findEntity(id, item, item.members);
        if (found.item) return found;
      }
    }
    return { item: null, parent: null };
  }

  function allGroups() {
    return combatants.filter(c => c.type === 'group');
  }

  function addGroupByName(name) {
    const group = { id: uid(), type: 'group', name, members: [] };
    combatants.push(group);
    return group;
  }

  function groupDisplayInit(group) {
    // Show the highest INIT of members (or "—" if none)
    if (!group?.members?.length) return '—';
    let maxInit = null;
    for (const m of group.members) {
      const v = Number(m.init);
      if (!Number.isFinite(v)) continue;
      if (maxInit === null || v > maxInit) maxInit = v;
    }
    return maxInit === null ? '—' : String(maxInit);
  }

  // ======= UI SYNC =======
  function updateLockUI() {
    trackerTable?.classList.toggle('selection-locked', isLocked);
    lockGroupSelectionBtn.innerHTML = isLocked
      ? `🔓 <span class="label">Unlock Groups</span>`
      : `🔒 <span class="label">Lock Groups</span>`;
    if (isLocked) {
      selectedCombatantIds.clear();
    }
    // tell UI layer to re-mark
    dispatchRenderEvent();
  }

  function updateSelectionMarks() {
    // local visual mark (GroupSelector will also re-mark)
    [...combatantListBody.querySelectorAll('.tracker-table-row')].forEach(row => {
      const id = row.dataset.id;
      const checked = selectedCombatantIds.has(id);
      row.classList.toggle('selected', checked);
      const cb = row.querySelector('.select-cell input[type="checkbox"]');
      if (cb) cb.checked = checked;
    });
  }

  function dispatchRenderEvent() {
    // Notify group-selector.js to refresh its bulk bar/checkboxes
    window.dispatchEvent(new CustomEvent('tracker:render'));
  }

  // ======= RENDER =======
  function render() {
    combatantListBody.innerHTML = '';

    const renderGroupRow = (g) => {
      // Render a group "row" aligned to table columns (same grid)
      const row = document.createElement('div');
      row.className = 'group-row';
      row.dataset.id = g.id;
      row.dataset.type = 'group';
      row.innerHTML = `
        <div class="cell select-cell"><!-- empty (reserved for alignment) --></div>
        <div class="cell image-cell"><span class="group-folder" aria-hidden="true"></span></div>
        <div class="cell init-cell">${groupDisplayInit(g)}</div>
        <div class="cell name-cell">${g.name}</div>
        <div class="cell ac-cell"><!-- empty --></div>
        <div class="cell hp-cell"><!-- empty --></div>
        <div class="cell temp-hp-cell"><!-- empty --></div>
        <div class="cell status-cell"><!-- empty --></div>
        <div class="cell role-cell"><!-- empty --></div>
        <div class="cell actions-cell"><!-- empty --></div>
        <div class="cell dashboard-link-cell"><!-- empty --></div>
      `;
      combatantListBody.appendChild(row);
    };

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
        <div class="cell image-cell"><img src="${c.imageUrl || 'images/icon.png'}" alt="${c.name}"></div>
        <div class="cell init-cell">${c.init}</div>
        <div class="cell name-cell">${c.name}</div>
        <div class="cell ac-cell">${c.ac}</div>
        <div class="cell hp-cell"><span class="hp-heart">❤️</span><span>${c.hp} / ${c.maxHp}</span></div>
        <div class="cell temp-hp-cell">${c.tempHp || 0}</div>
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

    // Draw top-level rows, then any group members
    combatants.forEach(item => {
      if (item.type === 'group') {
        renderGroupRow(item);
        item.members.forEach(m => renderCombatantRow(m, true));
      } else {
        renderCombatantRow(item, false);
      }
    });

    updateSelectionMarks();
    dispatchRenderEvent(); // let UI layer resync bulk bar
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

  function countAllCombatants() {
    let n = 0;
    for (const i of combatants) {
      if (i.type === 'combatant') n++;
      if (i.type === 'group') n += (i.members?.length || 0);
    }
    return n;
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
    // Remove top-level selected combatants
    combatants = combatants.filter(c => !(c.type === 'combatant' && selectedCombatantIds.has(c.id)));
    // Remove from groups
    combatants.forEach(g => {
      if (g.type === 'group') {
        g.members = g.members.filter(m => !selectedCombatantIds.has(m.id));
      }
    });
    selectedCombatantIds.clear();
    render();
  }

  function sortByInit(direction = 'desc') {
    // Sort top-level combatants only (not inside groups), then
    // within each group, sort members too. Keep groups where they are.
    const cmp = (a, b) => {
      const av = Number(a.init) || 0;
      const bv = Number(b.init) || 0;
      return direction === 'asc' ? av - bv : bv - av;
    };

    // stable split
    const topGroups = combatants.filter(i => i.type === 'group');
    const topSingles = combatants.filter(i => i.type === 'combatant').sort(cmp);

    // sort members of each group
    topGroups.forEach(g => {
      g.members.sort(cmp);
    });

    combatants = [...topGroups, ...topSingles];
    render();
  }

  // ======= PUBLIC API (used by group-selector.js) =======
  window.CombatAPI = {
    // data
    getAllCombatants: () => combatants,
    allGroups,
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
    render, // allow UI layer to force repaint
    isLocked: () => isLocked,

    // utility (optional)
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

  // Header INIT sort
  sortAscBtn?.addEventListener('click', () => CombatAPI.sortByInit('asc'));
  sortDescBtn?.addEventListener('click', () => CombatAPI.sortByInit('desc'));

  // Per-row checkbox (kept here so selection still works if GroupSelector is missing)
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

  // Instant move: click a group header to move selected there (no prompts)
  combatantListBody?.addEventListener('click', (e) => {
    if (isLocked) return;
    const row = e.target.closest('.group-row');
    if (!row) return;
    if (selectedCombatantIds.size === 0) return;
    const moved = moveSelectedToGroup(row.dataset.id);
    if (moved) render(); // ensure fresh DOM in case of partial reflow
  });

  // ======= INIT =======
  render();
})();
