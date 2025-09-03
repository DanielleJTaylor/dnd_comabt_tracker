// scripts/group-selector.js
// Selection + bulk actions + Move-to-Group UI (modal) + click-group-row to move.

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  // --- DOM ---
  const combatantListBody = $('#combatant-list-body');
  const bulkActionsBar    = $('#bulkActionsBar');
  const selectAllCheckbox = $('#selectAllCheckbox');
  const selectionCounter  = $('#selectionCounter');
  const bulkDamageHealBtn = $('#bulkDamageHealBtn');
  const bulkDeleteBtn     = $('#bulkDeleteBtn');
  const bulkGroupBtn      = $('#bulkGroupBtn');       // ← Move to Group (uses modal)
  const lockBtn           = $('#lockGroupSelectionBtn');

  // Modal pieces (already in your HTML)
  const moveModal     = document.getElementById('move-to-group-modal');
  const groupSelect   = document.getElementById('group-select');
  const cancelMoveBtn = document.getElementById('cancel-move-btn');
  const confirmBtn    = document.getElementById('confirm-move-btn');

  // --- State (UI-only selection; sync with CombatAPI) ---
  const selected = new Set();   // holds combatant ids
  let locked = false;

  // --- Helpers ---
  const CA = () => window.CombatAPI; // convenience

  function syncFromCombatAPI() {
    selected.clear();
    if (CA()?.getSelectedIds) {
      CA().getSelectedIds().forEach(id => selected.add(id));
    }
  }

  function pushSelectionToCombatAPI() {
    CA()?.setSelectedIds?.(selected);
  }

  function getAllCombatants() {
    return CA()?.getCombatants?.() || [];
  }

  function updateBulkBar() {
    const count = selected.size;
    selectionCounter.textContent = `${count} selected`;
    if (count > 0 && !locked) bulkActionsBar.classList.add('visible');
    else bulkActionsBar.classList.remove('visible');

    // checkbox state
    const total = countableCombatants();
    selectAllCheckbox.checked = total > 0 && count === total;
    selectAllCheckbox.indeterminate = count > 0 && count < total;
  }

  function countableCombatants() {
    const all = getAllCombatants();
    let n = 0;
    all.forEach(i => {
      if (i.type === 'combatant') n++;
      if (i.type === 'group') n += (i.members?.length || 0);
    });
    return n;
  }

  function markRows() {
    // re-apply checked state after renders
    [...combatantListBody.querySelectorAll('.tracker-table-row')].forEach(row => {
      const id = row.dataset.id;
      const cb = row.querySelector('.select-cell input[type="checkbox"]');
      const checked = selected.has(id);
      row.classList.toggle('selected', checked);
      if (cb) {
        cb.checked = checked;
        cb.disabled = locked;
      }
    });
  }

  function refreshUI() {
    updateBulkBar();
    markRows();
  }

  function clearSelection() {
    selected.clear();
    pushSelectionToCombatAPI();
    refreshUI();
  }

  function toggleLock() {
    locked = !locked;
    lockBtn?.classList.toggle('locked', locked);
    lockBtn.innerHTML = locked
      ? '🔓 <span class="label">Unlock Groups</span>'
      : '🔒 <span class="label">Lock Groups</span>';
    lockBtn.setAttribute('aria-pressed', String(locked));
    if (locked) clearSelection();
    markRows();
  }

  // --- Selection wiring ---
  selectAllCheckbox?.addEventListener('change', () => {
    if (locked) return;
    selected.clear();

    // add every combatant id (top-level and inside groups)
    const all = getAllCombatants();
    all.forEach(i => {
      if (i.type === 'combatant') selected.add(i.id);
      if (i.type === 'group') (i.members || []).forEach(m => selected.add(m.id));
    });

    pushSelectionToCombatAPI();
    // trigger re-render from API so rows rebuild, then re-mark:
    CA()?.render?.();
    refreshUI();
  });

  combatantListBody?.addEventListener('click', (e) => {
    if (locked) return;
    const cb = e.target.closest('.select-cell input[type="checkbox"]');
    if (!cb) return;
    const row = cb.closest('.tracker-table-row');
    if (!row) return;
    const id = row.dataset.id;
    if (!id) return;

    if (cb.checked) selected.add(id); else selected.delete(id);
    pushSelectionToCombatAPI();
    refreshUI();
  });

  // --- Bulk actions (no native prompts) ---
  bulkDamageHealBtn?.addEventListener('click', () => {
    if (locked || selected.size === 0) return;
    window.showHpPopup?.([...selected]); // your existing popup
  });

  bulkDeleteBtn?.addEventListener('click', () => {
    if (locked || selected.size === 0) return;
    // If you want a custom modal here, wire it similarly; avoiding confirm().
    window.deleteCombatants?.([...selected]); // you should implement this
    clearSelection();
    CA()?.render?.();
  });

  // --- Move to Group: MODAL UI now lives here ---
  function openMoveModal() {
    if (locked || selected.size === 0) return;

    // Populate group list
    groupSelect.innerHTML = '';
    const groups = CA()?.allGroups?.() || [];
    if (groups.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '— No groups yet — (Confirm to create one)';
      groupSelect.appendChild(opt);
    } else {
      groups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        groupSelect.appendChild(opt);
      });
    }
    moveModal.classList.remove('hidden');
  }

  function closeMoveModal() {
    moveModal.classList.add('hidden');
  }

  function confirmMove() {
    const targetId = groupSelect.value;
    if (targetId) {
      CA()?.moveSelectedToGroup?.(targetId);
    } else {
      // auto-create a group if none existed / user left blank
      const g = CA()?.addGroupByName?.(`Group ${ (CA()?.allGroups?.().length || 0) + 1 }`);
      if (g) CA()?.moveSelectedToGroup?.(g.id);
    }
    closeMoveModal();
    CA()?.render?.();
  }

  bulkGroupBtn?.addEventListener('click', openMoveModal);
  cancelMoveBtn?.addEventListener('click', closeMoveModal);
  confirmBtn?.addEventListener('click', confirmMove);

  // --- Click a group row to move immediately (no prompts) ---
  window.addEventListener('gs:clicked-group-row', (e) => {
    if (locked || selected.size === 0) return;
    const groupId = e.detail?.groupId;
    if (!groupId) return;
    CA()?.moveSelectedToGroup?.(groupId);
    CA()?.render?.();
  });

  // --- Boot ---
  // on load, mirror selection from CombatAPI if present (optional)
  syncFromCombatAPI();
  refreshUI();
  // after every external render, call this to re-mark rows:
  // (You can call window.GroupSelector.sync() from CombatTracker.render if desired.)
  window.GroupSelector = {
    sync() { syncFromCombatAPI(); refreshUI(); },
    clearSelection,
    selectIds(ids = []) { if (!locked){ selected.clear(); ids.forEach(id => selected.add(id)); pushSelectionToCombatAPI(); CA()?.render?.(); refreshUI(); } }
  };
})();
