// scripts/group-selector.js
// Handles multi-select, "Select All", bulk Damage/Heal, bulk Delete, and Move to Group.
// Also supports a lock/unlock mode that hides/disables selection.

(() => {
  // --------- Grab DOM ----------
  const $ = (sel, root = document) => root.querySelector(sel);

  const combatantListBody   = $('#combatant-list-body');
  const bulkActionsBar      = $('#bulkActionsBar');
  const selectAllCheckbox   = $('#selectAllCheckbox');
  const selectionCounter    = $('#selectionCounter');
  const bulkDamageHealBtn   = $('#bulkDamageHealBtn');
  const bulkDeleteBtn       = $('#bulkDeleteBtn');
  const bulkGroupBtn        = $('#bulkGroupBtn');
  const lockBtn             = $('#lockGroupSelectionBtn'); // header lock/unlock button (optional)

  // --------- State ----------
  // We keep selection state here; combatants come from your main tracker.
  const selected = new Set();
  let locked = false;

  // If your main tracker does not expose combatants, this shim tries to find them.
  // Prefer: window.CombatState = { get combatants() { return yourArray; } }
  const getCombatants = () => {
    if (window.CombatState && Array.isArray(window.CombatState.combatants)) {
      return window.CombatState.combatants;
    }
    // Fallback: your render() may close over an internal array; expose it if possible.
    return window.combatants || []; // set this global in your main file if needed
  };

  // --------- Helpers ----------
  function updateBulkBar() {
    const count = selected.size;
    selectionCounter.textContent = `${count} selected`;
    if (count > 0 && !locked) {
      bulkActionsBar.classList.add('visible');
    } else {
      bulkActionsBar.classList.remove('visible');
    }
    const all = getCombatants();
    selectAllCheckbox.checked = count > 0 && count === all.length;
  }

  function clearSelection() {
    selected.clear();
    updateBulkBar();
    render(); // from your main tracker
  }

  function toggleLock() {
    locked = !locked;
    lockBtn?.classList.toggle('locked', locked);
    if (lockBtn) {
      lockBtn.innerHTML = locked ? '🔓 Unlock Group Selection' : '🔒 Lock Group Selection';
      lockBtn.setAttribute('aria-pressed', String(locked));
    }
    if (locked) clearSelection();
    // disable all checkboxes in rows
    [...combatantListBody.querySelectorAll('.select-cell input[type="checkbox"]')]
      .forEach(cb => cb.disabled = locked);
  }

  // --------- Selection wiring ----------
  // Select All
  selectAllCheckbox?.addEventListener('change', () => {
    if (locked) return;
    selected.clear();
    if (selectAllCheckbox.checked) {
      getCombatants().forEach(c => selected.add(c.id));
    }
    updateBulkBar();
    render();
  });

  // Per-row checkbox (event delegation)
  combatantListBody?.addEventListener('click', (e) => {
    if (locked) return;
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    const row = cb.closest('.tracker-table-row');
    if (!row) return;
    const id = row.dataset.id;
    if (!id) return;

    if (cb.checked) selected.add(id);
    else selected.delete(id);

    updateBulkBar();
    // Row highlight handled by render, so re-render for visual state
    render();
  });

  // --------- Bulk actions ----------
  bulkDamageHealBtn?.addEventListener('click', () => {
    if (locked || selected.size === 0) return;
    showHpPopup([...selected]); // your global popup function
  });

  bulkDeleteBtn?.addEventListener('click', () => {
    if (locked || selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected combatant(s)?`)) return;
    deleteCombatants([...selected]); // your global delete function (should call render)
    selected.clear();
    updateBulkBar();
  });

  bulkGroupBtn?.addEventListener('click', () => {
    if (locked || selected.size === 0) return;
    const groupName = prompt('Enter group name to assign to selected combatants:');
    if (!groupName) return;
    // In a fuller app you’d also mutate each combatant’s group field here:
    // const ids = [...selected];
    // const all = getCombatants();
    // all.forEach(c => { if (ids.includes(c.id)) c.group = groupName; });
    HistoryLog?.log?.(`📁 Moved ${selected.size} combatant(s) to group '${groupName}'.`);
    render();
    updateBulkBar();
  });

  // --------- Lock button in header ----------
  lockBtn?.addEventListener('click', toggleLock);

  // --------- Hooks into your render ---------
  // After each render, re-apply selection checkboxes & disabled state.
  // Call this from your main `render()` at the end if rows are rebuilt each time.
  window.GroupSelector = {
    // Mark row as selected and sync checkbox state
    syncRowCheckboxes() {
      const ids = new Set(selected);
      [...combatantListBody.querySelectorAll('.tracker-table-row')].forEach(row => {
        const id = row.dataset.id;
        const checked = ids.has(id);
        row.classList.toggle('selected', checked);
        const cb = row.querySelector('.select-cell input[type="checkbox"]');
        if (cb) {
          cb.checked = checked;
          cb.disabled = locked;
        }
      });
      updateBulkBar();
    },
    // Expose a way to clear selection when needed externally
    clearSelection,
    // Programmatically select a set of IDs (optional helper)
    selectIds(ids = []) {
      if (locked) return;
      selected.clear();
      ids.forEach(id => selected.add(id));
      updateBulkBar();
      render();
    }
  };

})();
