// scripts/combat_tracker.js
(() => {
  // ======= STATE =======
  let combatants = [];                // mix of {type:'combatant'} and {type:'group', members:[]}
  let selectedCombatantIds = new Set();
  let isLocked = false;

  // ======= DOM =======
  const $  = (sel, root = document) => root.querySelector(sel);
  const combatantListBody     = $('#combatant-list-body');
  const addCombatantBtn       = $('#addCombatantBtn');
  const addGroupBtn           = $('#addGroupBtn');
  const lockGroupSelectionBtn = $('#lockGroupSelectionBtn');
  const trackerTable          = $('#tracker-table');
  const selectAllCheckbox     = $('#selectAllCheckbox');
  const bulkActionsBar        = $('#bulkActionsBar');
  const selectionCounter      = $('#selectionCounter');

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
    const g = { id: uid(), type: 'group', name, members: [] };
    combatants.push(g);
    return g;
  }

  // ======= UI STATE =======
  function updateLockUI() {
    trackerTable?.classList.toggle('selection-locked', isLocked);
    if (isLocked) {
      lockGroupSelectionBtn.innerHTML = `🔓 <span class="label">Unlock Groups</span>`;
      selectedCombatantIds.clear();
      render();
    } else {
      lockGroupSelectionBtn.innerHTML = `🔒 <span class="label">Lock Groups</span>`;
    }
  }

  function updateSelectionUI() {
    // selection highlight + checkbox sync
    [...combatantListBody.querySelectorAll('.tracker-table-row')].forEach(row => {
      const id = row.dataset.id;
      const checked = selectedCombatantIds.has(id);
      row.classList.toggle('selected', checked);
      const cb = row.querySelector('.select-cell input[type="checkbox"]');
      if (cb) cb.checked = checked;
    });

    // bulk bar
    const count = selectedCombatantIds.size;
    selectionCounter && (selectionCounter.textContent = `${count} selected`);
    if (bulkActionsBar) bulkActionsBar.classList.toggle('visible', count > 0 && !isLocked);

    // select-all tri-state
    if (selectAllCheckbox) {
      const total = countAllCombatants();
      if (total > 0 && count === total) {
        selectAllCheckbox.checked = true; selectAllCheckbox.indeterminate = false;
      } else if (count > 0) {
        selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = true;
      } else {
        selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = false;
      }
    }
  }

  function countAllCombatants() {
    return combatants.reduce((n, item) =>
      n + (item.type === 'combatant' ? 1 : (item.members?.length || 0)), 0);
  }

  // ======= RENDER =======
  function render() {
    combatantListBody.innerHTML = '';

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
        <div class="cell hp-cell"><span class="hp-heart">❤️</span> <span>${c.hp} / ${c.maxHp}</span></div>
        <div class="cell temp-hp-cell">${c.tempHp ?? 0}</div>
        <div class="cell status-cell"><button class="btn-add-status">+ Add</button></div>
        <div class="cell role-cell">${(c.role || '').toUpperCase()}</div>
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

    const renderGroupRow = (g) => {
      const row = document.createElement('div');
      row.className = 'group-row';
      row.dataset.id = g.id;
      row.dataset.type = 'group';
      row.innerHTML = `<span class="group-icon">📁</span><span class="group-name">${g.name}</span>`;
      combatantListBody.appendChild(row);
    };

    // draw
    combatants.forEach(item => {
      if (item.type === 'group') {
        renderGroupRow(item);
        item.members.forEach(m => renderCombatantRow(m, true));
      } else {
        renderCombatantRow(item, false);
      }
    });

    updateSelectionUI();
  }

  // ======= DATA OPS =======
  function addDefaultCombatant() {
    const c = {
      id: uid(), type: 'combatant',
      name: `Combatant ${combatants.length + 1}`,
      init: 10, ac: 10, hp: 10, maxHp: 10, tempHp: 0,
      role: 'dm', imageUrl: '', dashboardId: null
    };
    combatants.push(c);
    render();
  }

  function createEmptyGroup() {
    addGroupByName(`New Group ${allGroups().length + 1}`);
    render();
  }

  function removeFromEverywhereAndCollectSelected() {
    const bag = [];

    // top-level
    combatants = combatants.filter(item => {
      if (item.type === 'combatant' && selectedCombatantIds.has(item.id)) {
        bag.push(item);
        return false;
      }
      return true;
    });

    // inside groups
    combatants.forEach(g => {
      if (g.type === 'group') {
        g.members = g.members.filter(m => {
          if (selectedCombatantIds.has(m.id)) { bag.push(m); return false; }
          return true;
        });
      }
    });

    return bag;
  }

  function moveSelectedToGroup(targetGroupId) {
    if (selectedCombatantIds.size === 0) return;

    const { item: targetGroup } = findEntity(targetGroupId);
    if (!targetGroup || targetGroup.type !== 'group') return;

    const moving = removeFromEverywhereAndCollectSelected();
    if (!moving.length) return;

    targetGroup.members.push(...moving);
    selectedCombatantIds.clear();
    render();                   // 🔄 always redraw after a data change
  }

  // ======= EVENTS =======
  addCombatantBtn?.addEventListener('click', addDefaultCombatant);
  addGroupBtn?.addEventListener('click', createEmptyGroup);
  lockGroupSelectionBtn?.addEventListener('click', () => { isLocked = !isLocked; updateLockUI(); });

  // Row checkbox selection (kept in this file so selection works without extra modules)
  combatantListBody?.addEventListener('click', (e) => {
    // Toggle selection via checkbox
    if (e.target.matches('.combatant-checkbox')) {
      if (isLocked) { e.target.checked = !e.target.checked; return; }
      const id = e.target.dataset.id;
      if (e.target.checked) selectedCombatantIds.add(id);
      else selectedCombatantIds.delete(id);
      updateSelectionUI();
      return;
    }

    // ======= MOVE LOGIC =======
    // Instant move by clicking a group header (no prompt / no popup)
    const groupRow = e.target.closest('.group-row');
    if (groupRow) {
      if (isLocked) return;
      if (selectedCombatantIds.size === 0) return;
      moveSelectedToGroup(groupRow.dataset.id);
      // render() already called inside moveSelectedToGroup
    }
  });

  // Select-all (optional here; if you manage it elsewhere, you can remove this)
  selectAllCheckbox?.addEventListener('change', (e) => {
    if (isLocked) { e.target.checked = !e.target.checked; return; }
    selectedCombatantIds.clear();
    if (e.target.checked) {
      combatants.forEach(item => {
        if (item.type === 'combatant') selectedCombatantIds.add(item.id);
        else if (item.type === 'group') item.members.forEach(m => selectedCombatantIds.add(m.id));
      });
    }
    render();
  });

  // ======= PUBLIC API (optional, for other modules) =======
  window.CombatAPI = {
    // data
    getCombatants: () => combatants,
    allGroups,
    addGroupByName: (name) => { const g = addGroupByName(name); render(); return g; },
    moveSelectedToGroup,
    // selection
    getSelectedIds: () => new Set(selectedCombatantIds),
    setSelectedIds: (ids) => { selectedCombatantIds = new Set(ids); updateSelectionUI(); },
    clearSelection: () => { selectedCombatantIds.clear(); updateSelectionUI(); },
    isLocked: () => isLocked,
    // UI
    render,
  };

  // ======= INIT =======
  window.CombatTracker = { render, updateSelectionUI };
  render();
})();
