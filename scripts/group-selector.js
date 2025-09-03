/* scripts/group-selector.js */

(() => {
    // This script handles all UI interactions and calls the CombatAPI for data changes.

    // ======= DOM SELECTIONS =======
    const $ = (sel) => document.querySelector(sel);
    const combatantListBody = $('#combatant-list-body');
    const bulkActionsBar = $('#bulkActionsBar');
    const selectionCounter = $('#selectionCounter');
    const selectAllCheckbox = $('#selectAllCheckbox');
    const bulkGroupBtn = $('#bulkGroupBtn'); // "Move to Group" button
    const bulkDeleteBtn = $('#bulkDeleteBtn');

    // Modal DOM selections
    const moveModal = $('#move-to-group-modal');
    const groupSelect = $('#group-select');
    const cancelMoveBtn = $('#cancel-move-btn');
    const confirmMoveBtn = $('#confirm-move-btn');

    // ======= UI FUNCTIONS =======
    function updateBulkBarUI() {
        if (!window.CombatAPI) return; // Wait for the API to be ready
        const selectedIds = CombatAPI.getSelectedIds();
        const selectionCount = selectedIds.size;
        
        selectionCounter.textContent = `${selectionCount} selected`;
        bulkActionsBar.classList.toggle('visible', selectionCount > 0 && !CombatAPI.isLocked());

        const allCombatants = CombatAPI.getAllCombatants();
        let totalCount = 0;
        allCombatants.forEach(item => {
            totalCount += (item.type === 'combatant' ? 1 : item.members.length);
        });

        selectAllCheckbox.checked = totalCount > 0 && selectionCount === totalCount;
        selectAllCheckbox.indeterminate = selectionCount > 0 && selectionCount < totalCount;

        // Sync visual styles on rows
        combatantListBody.querySelectorAll('.tracker-table-row').forEach(row => {
            const isSelected = selectedIds.has(row.dataset.id);
            row.classList.toggle('selected', isSelected);
            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = isSelected;
        });
    }

    // ======= MODAL LOGIC =======
    function openMoveModal() {
        if (CombatAPI.isLocked() || CombatAPI.getSelectedIds().size === 0) return;

        groupSelect.innerHTML = ''; // Clear old options
        const groups = CombatAPI.getAllGroups();

        if (groups.length === 0) {
            const opt = document.createElement('option');
            opt.value = '__new__'; // Special value to indicate creation
            opt.textContent = '— Create a new group —';
            groupSelect.appendChild(opt);
        } else {
            groups.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g.id;
                opt.textContent = g.name;
                groupSelect.appendChild(opt);
            });
            // Add the "create new" option at the end
            const newOpt = document.createElement('option');
            newOpt.value = '__new__';
            newOpt.textContent = '— Create a new group —';
            groupSelect.appendChild(newOpt);
        }
        moveModal.classList.remove('hidden');
    }

    function closeMoveModal() {
        moveModal.classList.add('hidden');
    }

    function confirmMove() {
        const targetId = groupSelect.value;
        if (targetId === '__new__') {
            const name = prompt("Enter a name for the new group:", `New Group`);
            if (name) {
                const newGroup = CombatAPI.addGroupByName(name);
                CombatAPI.moveSelectedToGroup(newGroup.id);
            }
        } else if (targetId) {
            CombatAPI.moveSelectedToGroup(targetId);
        }
        closeMoveModal();
    }

    // ======= EVENT LISTENERS (UI Layer) =======
    bulkGroupBtn.addEventListener('click', openMoveModal);
    bulkDeleteBtn.addEventListener('click', () => {
        if (CombatAPI.getSelectedIds().size > 0) CombatAPI.deleteSelected();
    });

    combatantListBody.addEventListener('click', (e) => {
        if (CombatAPI.isLocked()) return;
        
        const checkbox = e.target.closest('input[type="checkbox"]');
        if (checkbox) {
            const id = checkbox.dataset.id;
            const selectedIds = CombatAPI.getSelectedIds();
            if (checkbox.checked) selectedIds.add(id);
            else selectedIds.delete(id);
            CombatAPI.setSelectedIds(selectedIds);
        }
    });

    selectAllCheckbox.addEventListener('change', () => {
        if (CombatAPI.isLocked()) return;
        const newSelectedIds = new Set();
        if (selectAllCheckbox.checked) {
            CombatAPI.getAllCombatants().forEach(item => {
                if (item.type === 'combatant') newSelectedIds.add(item.id);
                else if (item.type === 'group') item.members.forEach(m => newSelectedIds.add(m.id));
            });
        }
        CombatAPI.setSelectedIds(newSelectedIds);
    });

    // Modal button listeners
    cancelMoveBtn.addEventListener('click', closeMoveModal);
    confirmMoveBtn.addEventListener('click', confirmMove);

    // Listen for the custom event from the data layer to update the UI
    window.addEventListener('tracker:render', updateBulkBarUI);
})();