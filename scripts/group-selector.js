/* scripts/group-selector.js */
(() => {
  const $ = (sel) => document.querySelector(sel);

  // DOM
  const combatantListBody = $('#combatant-list-body');
  const bulkActionsBar    = $('#bulkActionsBar');
  const selectionCounter  = $('#selectionCounter');
  const selectAllCheckbox = $('#selectAllCheckbox');
  const bulkGroupBtn      = $('#bulkGroupBtn');
  const bulkDeleteBtn     = $('#bulkDeleteBtn');

  // Confirm modal (no dropdown)
  const moveModal     = $('#move-to-group-modal');
  const cancelMoveBtn = $('#cancel-move-btn');
  const confirmMoveBtn= $('#confirm-move-btn');
  const modalTitle    = moveModal?.querySelector('h3');

  // Hint banner
  const chooseHint    = $('#choose-group-hint');

  let pendingGroupId  = null;
  let chooseMode      = false;   // true after clicking “Move to Group”

  // ---------- UI sync ----------
  function updateBulkBarUI() {
    if (!window.CombatAPI) return;
    const selected = CombatAPI.getSelectedIds();
    const count    = selected.size;

    selectionCounter.textContent = `${count} selected`;
    bulkActionsBar.classList.toggle('visible', count > 0 && !CombatAPI.isLocked());

    const all = CombatAPI.getAllCombatants();
    let total = 0;
    all.forEach(i => total += i.type === 'combatant' ? 1 : (i.members?.length || 0));

    selectAllCheckbox.checked = total > 0 && count === total;
    selectAllCheckbox.indeterminate = count > 0 && count < total;

    // rows
    combatantListBody.querySelectorAll('.tracker-table-row').forEach(row => {
      const isSel = selected.has(row.dataset.id);
      row.classList.toggle('selected', isSel);
      const cb = row.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = isSel;
    });

    // If selection dropped to 0, exit choose mode + hide hint
    if (count === 0) hideChooseHint();
  }

  // ---------- Hint helpers ----------
  function showChooseHint() {
    chooseMode = true;
    chooseHint?.classList.remove('hidden');
  }
  function hideChooseHint() {
    chooseMode = false;
    chooseHint?.classList.add('hidden');
  }

  // ---------- Confirm modal helpers ----------
  function openConfirmMoveModal(groupId, groupName) {
    pendingGroupId = groupId;
    if (modalTitle) modalTitle.textContent = `Move to ${groupName}?`;
    moveModal?.classList.remove('hidden');
  }
  function closeMoveModal() {
    moveModal?.classList.add('hidden');
    pendingGroupId = null;
    hideChooseHint(); // Always exit choose mode when modal closes
  }
  function confirmMove() {
    if (pendingGroupId) {
      CombatAPI.moveSelectedToGroup(pendingGroupId);
      CombatAPI.render?.();
    }
    closeMoveModal();
    updateBulkBarUI();
  }

  // ---------- Events ----------
  // 1) “Move to Group” button = enter “choose a group” mode
  bulkGroupBtn?.addEventListener('click', () => {
    if (!window.CombatAPI) return;
    if (CombatAPI.isLocked()) return;
    if (CombatAPI.getSelectedIds().size === 0) {
      // Tiny nudge: flash the counter if nothing selected
      selectionCounter.classList.add('flash');
      setTimeout(() => selectionCounter.classList.remove('flash'), 600);
      return;
    }
    showChooseHint();
  });

  // 2) Click a group row → open confirm modal (only while in chooseMode)
  combatantListBody?.addEventListener('click', (e) => {
    if (!window.CombatAPI || CombatAPI.isLocked()) return;

    // Checkbox toggle (selection)
    const cb = e.target.closest('input[type="checkbox"]');
    if (cb) {
      const id = cb.dataset.id;
      const selected = CombatAPI.getSelectedIds();
      cb.checked ? selected.add(id) : selected.delete(id);
      CombatAPI.setSelectedIds(selected);
      updateBulkBarUI();
      return;
    }

    // Group row click
    const gRow = e.target.closest('.group-row');
    if (gRow && chooseMode && CombatAPI.getSelectedIds().size > 0) {
      const g = (CombatAPI.getAllGroups?.() || []).find(x => x.id === gRow.dataset.id);
      if (g) openConfirmMoveModal(g.id, g.name);
    }
  });

  // 3) Delete selected
  bulkDeleteBtn?.addEventListener('click', () => {
    if (CombatAPI.getSelectedIds().size > 0) {
      CombatAPI.deleteSelected();
      CombatAPI.render?.();
      updateBulkBarUI();
    }
  });

  // 4) Select all
  selectAllCheckbox?.addEventListener('change', () => {
    if (CombatAPI.isLocked()) return;
    const ids = new Set();
    if (selectAllCheckbox.checked) {
      CombatAPI.getAllCombatants().forEach(i => {
        if (i.type === 'combatant') ids.add(i.id);
        else (i.members || []).forEach(m => ids.add(m.id));
      });
    }
    CombatAPI.setSelectedIds(ids);
    updateBulkBarUI();
  });

  // 5) Modal buttons
  cancelMoveBtn?.addEventListener('click', closeMoveModal);
  confirmMoveBtn?.addEventListener('click', confirmMove);

  // 6) Close modal on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !moveModal?.classList.contains('hidden')) {
      closeMoveModal();
    }
  });

  // Keep UI synced after data re-renders
  window.addEventListener('tracker:render', updateBulkBarUI);
})();
