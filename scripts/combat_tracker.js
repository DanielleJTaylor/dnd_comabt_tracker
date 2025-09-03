// scripts/combat_tracker.js
(() => {
  // ======= STATE =======
  let combatants = [];
  let selectedCombatantIds = new Set();
  let isLocked = false;

  // Optional: legacy surface (kept for other modules that might read it)
  window.CombatState = { combatants, selectedCombatantIds, isLocked };

  // ======= DOM =======
  const $  = (sel, root = document) => root.querySelector(sel);

  const combatantListBody     = $('#combatant-list-body');
  const addCombatantBtn       = $('#addCombatantBtn');
  const addGroupBtn           = $('#addGroupBtn');
  const lockGroupSelectionBtn = $('#lockGroupSelectionBtn');
  const trackerTable          = $('#tracker-table');

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

  // ======= UI (lock + selection visuals) =======
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
    // Just (re)mark rows in this file; the bulk bar/labels are handled by group-selector.js
    [...combatantListBody.querySelectorAll('.tracker-table-row')].forEach(row => {
      const id = row.dataset.id;
      row.classList.toggle('selected', selectedCombatantIds.has(id));
      const cb = row.querySelector('.select-cell input[type="checkbox"]');
      if (cb) cb.checked = selectedCombatantIds.has(id);
    });
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

    const renderGroupRow = (g) => {
      const row = document.createElement('div');
      row.className = 'group-row';
      row.dataset.id = g.id;
      row.dataset.type = 'group';
      row.innerHTML = `<span class="group-icon">📁</span><span class="group-name">${g.name}</span>`;
      combatantListBody.appendChild(row);
    };

    // top-level render (groups keep children immediately after their header)
    combatants.forEach(item => {
      if (item.type === 'group') {
        renderGroupRow(item);
        item.members.forEach(m => renderCombatantRow(m, true));
      } else {
        renderCombatantRow(item, false);
      }
    });

    updateSelectionUI();
    // Allow GroupSelector to resync checkboxes/labels if it wants:
    window.GroupSelector?.sync?.();
  }

  // ======= CORE (data ops) =======
  function addDefaultCombatant() {
    const c = {
      id: uid(),
      type: 'combatant',
      name: `Combatant ${combatants.length + 1}`,
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

  function removeFromEverywhereAndCollectSelected() {
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
    if (selectedCombatantIds.size === 0) return;

    const { item: targetGroup } = findEntity(targetGroupId);
    if (!targetGroup || targetGroup.type !== 'group') return;

    const moving = removeFromEverywhereAndCollectSelected();
    if (moving.length === 0) return;

    targetGroup.members.push(...moving);
    selectedCombatantIds.clear();
    render();
  }

  // ======= PUBLIC API for group-selector.js =======
  window.CombatAPI = {
    getCombatants: () => combatants,
    allGroups,
    addGroupByName,
    moveSelectedToGroup,
    clearSelection: () => { selectedCombatantIds.clear(); updateSelectionUI(); },
    render,
    isLocked: () => isLocked,
    // selection helpers:
    getSelectedIds: () => new Set(selectedCombatantIds),
    setSelectedIds: (ids) => {
      selectedCombatantIds = new Set(ids);
      updateSelectionUI();
    },
  };

  // ======= EVENTS =======
  addCombatantBtn?.addEventListener('click', addDefaultCombatant);
  addGroupBtn?.addEventListener('click', createEmptyGroup);
  lockGroupSelectionBtn?.addEventListener('click', () => {
    isLocked = !isLocked;
    updateLockUI();
  });

  // Keep checkbox selection here (so selection always exists even without group-selector)
  combatantListBody?.addEventListener('click', (e) => {
    // Row checkbox
    if (e.target.matches('.combatant-checkbox')) {
      if (isLocked) { e.target.checked = !e.target.checked; return; }
      const id = e.target.dataset.id;
      if (e.target.checked) selectedCombatantIds.add(id);
      else selectedCombatantIds.delete(id);
      updateSelectionUI();
      // Let GroupSelector resync its copy
      window.GroupSelector?.sync?.();
      return;
    }

    // Defer group-row clicks to GroupSelector (no native prompts here)
    const row = e.target.closest('.group-row');
    if (row) {
      window.dispatchEvent(new CustomEvent('gs:clicked-group-row', {
        detail: { groupId: row.dataset.id }
      }));
    }
  });

  // ======= INIT =======
  window.CombatTracker = { render, updateSelectionUI };
  render();
})();
