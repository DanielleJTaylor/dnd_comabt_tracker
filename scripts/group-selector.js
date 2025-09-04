/* scripts/group-selector.js */
/* UI layer: selection, bulk actions, "choose group" hint, and mini confirm bar */

(() => {
  const $ = (sel) => document.querySelector(sel);

  // --- DOM refs ---
  const combatantListBody = $('#combatant-list-body');

  const bulkActionsBar    = $('#bulkActionsBar');
  const selectionCounter  = $('#selectionCounter');
  const selectAllCheckbox = $('#selectAllCheckbox');
  const bulkGroupBtn      = $('#bulkGroupBtn');
  const bulkDeleteBtn     = $('#bulkDeleteBtn');

  // Hint shown after pressing “Move to Group”
  const chooseHint        = $('#choose-group-hint');

  // Mini confirm bar (appears after clicking a group row while in choose mode)
  const miniBar           = $('#confirm-move-mini');
  const miniText          = $('#confirm-mini-text');
  const miniYes           = $('#confirm-mini-yes');
  const miniNo            = $('#confirm-mini-no');

  // --- local UI state ---
  let chooseMode       = false;  // true after pressing “Move to Group”
  let pendingGroupId   = null;
  let pendingGroupName = '';

  // ---------- UI sync ----------
  function updateBulkBarUI() {
    if (!window.CombatAPI) return;

    const selected = CombatAPI.getSelectedIds();
    const count    = selected.size;

    selectionCounter.textContent = `${count} selected`;
    bulkActionsBar.classList.toggle('visible', count > 0 && !CombatAPI.isLocked());

    // compute total countable combatants (top level + members)
    const all  = CombatAPI.getAllCombatants();
    let total  = 0;
    all.forEach(i => total += i.type === 'combatant' ? 1 : (i.members?.length || 0));

    selectAllCheckbox.checked      = total > 0 && count === total;
    selectAllCheckbox.indeterminate = count > 0 && count < total;

    // re-mark rows + checkboxes to mirror selection
    combatantListBody.querySelectorAll('.tracker-table-row').forEach(row => {
      const id    = row.dataset.id;
      const isSel = selected.has(id);
      row.classList.toggle('selected', isSel);
      const cb = row.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = isSel;
    });

    // exit choose mode if selection disappears
    if (count === 0) {
      hideChooseHint();
      hideMiniConfirm();
    }
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

  // ---------- Mini confirm helpers ----------
  function showMiniConfirm(groupId, groupName) {
    pendingGroupId   = groupId;
    pendingGroupName = groupName || 'this group';

    const count = CombatAPI.getSelectedIds()?.size || 0;
    if (miniText) miniText.textContent = `Move ${count} selected to “${pendingGroupName}”?`;

    miniBar?.classList.remove('hidden');
    miniBar?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function hideMiniConfirm() {
    miniBar?.classList.add('hidden');
    pendingGroupId   = null;
    pendingGroupName = '';
  }

  // ---------- Events ----------

  // “Move to Group” → enter choose mode
  bulkGroupBtn?.addEventListener('click', () => {
    if (!window.CombatAPI || CombatAPI.isLocked()) return;

    if (CombatAPI.getSelectedIds().size === 0) {
      // nudge user if nothing is selected
      selectionCounter.classList.add('flash');
      setTimeout(() => selectionCounter.classList.remove('flash'), 600);
      return;
    }

    hideMiniConfirm(); // clear any previous confirm
    showChooseHint();
  });

  // Per-row interactions (checkboxes + group row pick)
  combatantListBody?.addEventListener('click', (e) => {
    if (!window.CombatAPI || CombatAPI.isLocked()) return;

    // 1) checkbox toggles selection
    const cb = e.target.closest('input[type="checkbox"]');
    if (cb) {
      const id = cb.dataset.id;
      const selected = CombatAPI.getSelectedIds();
      cb.checked ? selected.add(id) : selected.delete(id);
      CombatAPI.setSelectedIds(selected);
      updateBulkBarUI();
      return;
    }

    // 2) group-row click (only works while in choose mode and with a non-empty selection)
    const gRow = e.target.closest('.group-row');
    if (gRow && chooseMode && CombatAPI.getSelectedIds().size > 0) {
      const groups = CombatAPI.getAllGroups?.() || [];
      const g = groups.find(x => x.id === gRow.dataset.id);
      if (g) showMiniConfirm(g.id, g.name);
    }
  });

  // Mini confirm buttons
  miniYes?.addEventListener('click', () => {
    if (!pendingGroupId) return;
    CombatAPI.moveSelectedToGroup(pendingGroupId);
    CombatAPI.render?.();
    hideMiniConfirm();
    hideChooseHint();
    updateBulkBarUI();
  });

  miniNo?.addEventListener('click', () => {
    // stay in choose mode so user can click a different group
    hideMiniConfirm();
  });

  // Delete selected
  bulkDeleteBtn?.addEventListener('click', () => {
    if (!window.CombatAPI) return;
    if (CombatAPI.getSelectedIds().size > 0) {
      CombatAPI.deleteSelected();
      CombatAPI.render?.();
      hideMiniConfirm();
      hideChooseHint();
      updateBulkBarUI();
    }
  });

  // Select all
  selectAllCheckbox?.addEventListener('change', () => {
    if (!window.CombatAPI || CombatAPI.isLocked()) return;

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

  // Close mini confirm on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !miniBar?.classList.contains('hidden')) {
      hideMiniConfirm();
    }
  });

  // Re-sync UI after data layer re-renders
  window.addEventListener('tracker:render', updateBulkBarUI);

  // Initial paint sync (in case CombatAPI rendered before this loaded)
  if (document.readyState !== 'loading') updateBulkBarUI();
  else window.addEventListener('DOMContentLoaded', updateBulkBarUI);
})();
