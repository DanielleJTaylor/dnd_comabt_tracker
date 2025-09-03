/* scripts/combat_tracker.js */

(() => {
    // ======= STATE =======
    let combatants = [];
    let selectedCombatantIds = new Set();
    let isLocked = false;
    let selectedGroupIdInModal = null;

    window.CombatState = { combatants, selectedCombatantIds, isLocked };

    // ======= DOM ELEMENT SELECTIONS =======
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => root.querySelectorAll(sel);
    
    const combatantListBody = $('#combatant-list-body');
    const addCombatantBtn = $('#addCombatantBtn');
    const addGroupBtn = $('#addGroupBtn');
    const bulkActionsBar = $('#bulkActionsBar');
    const selectionCounter = $('#selectionCounter');
    const selectAllCheckbox = $('#selectAllCheckbox');
    const lockGroupSelectionBtn = $('#lockGroupSelectionBtn');
    const trackerTable = $('#tracker-table');

    // Modal and updated Bulk Action Button
    const bulkAssignGroupBtn = $('#bulkAssignGroupBtn');
    const groupAssignModal = $('#group-assign-modal');
    const closeGroupModalBtn = $('#close-group-modal-btn');
    const saveGroupAssignmentBtn = $('#save-group-assignment-btn');
    const existingGroupsList = $('#existing-groups-list');
    const newGroupNameInput = $('#new-group-name-input');

    // ======= HELPER FUNCTIONS =======
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

    // ======= UI UPDATE FUNCTIONS =======
    function updateLockUI() {
        trackerTable.classList.toggle('selection-locked', isLocked);
        if (isLocked) {
            lockGroupSelectionBtn.innerHTML = `🔓 <span class="label">Unlock Groups</span>`;
            selectedCombatantIds.clear();
            render();
        } else {
            lockGroupSelectionBtn.innerHTML = `🔒 <span class="label">Lock Groups</span>`;
        }
    }

    function updateSelectionUI() {
        const selectionCount = selectedCombatantIds.size;
        const totalCombatants = combatants.reduce((acc, item) => acc + (item.type === 'group' ? item.members.length : (item.type === 'combatant' ? 1 : 0)), 0);
        selectionCounter.textContent = `${selectionCount} selected`;
        bulkActionsBar.classList.toggle('visible', selectionCount > 0 && !isLocked);

        if (totalCombatants > 0 && selectionCount === totalCombatants) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else if (selectionCount > 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }

        $$('.tracker-table-row').forEach(row => {
            row.classList.toggle('selected', selectedCombatantIds.has(row.dataset.id));
        });
    }
    
    // ======= MODAL LOGIC =======
    function openGroupModal() {
        existingGroupsList.innerHTML = '';
        selectedGroupIdInModal = null;
        newGroupNameInput.value = '';
        const groups = combatants.filter(c => c.type === 'group');
        if (groups.length > 0) {
            groups.forEach(group => {
                const groupEl = document.createElement('div');
                groupEl.className = 'group-option';
                groupEl.textContent = group.name;
                groupEl.dataset.groupId = group.id;
                existingGroupsList.appendChild(groupEl);
            });
        } else {
            existingGroupsList.innerHTML = '<div class="group-option-empty">No groups exist yet.</div>';
        }
        groupAssignModal.classList.remove('hidden');
    }

    function closeGroupModal() {
        groupAssignModal.classList.add('hidden');
    }

    function handleGroupAssignment() {
        const newGroupName = newGroupNameInput.value.trim();
        if (newGroupName) {
            const newGroup = { id: uid(), type: 'group', name: newGroupName, members: [] };
            combatants.push(newGroup);
            moveSelectedToGroup(newGroup.id);
        } else if (selectedGroupIdInModal) {
            moveSelectedToGroup(selectedGroupIdInModal);
        }
        closeGroupModal();
    }

    // ======= RENDER LOGIC =======
    function render() {
        combatantListBody.innerHTML = '';
        const renderCombatantRow = (c, isInGroup = false) => {
            const row = document.createElement('div');
            const isSelected = selectedCombatantIds.has(c.id);
            row.className = `tracker-table-row ${isInGroup ? 'in-group' : ''} ${isSelected ? 'selected' : ''}`;
            row.dataset.id = c.id;
            row.innerHTML = `
                <div class="cell select-cell"><input type="checkbox" class="combatant-checkbox" data-id="${c.id}" ${isSelected ? 'checked' : ''}></div>
                <div class="cell image-cell"><img src="${c.imageUrl || 'images/icon.png'}" alt="${c.name}"></div>
                <div class="cell init-cell">${c.init}</div>
                <div class="cell name-cell">${c.name}</div>
                <div class="cell ac-cell">${c.ac}</div>
                <div class="cell hp-cell"><span class="hp-heart">❤️</span> <span>${c.hp} / ${c.maxHp}</span></div>
                <div class="cell temp-hp-cell">${c.tempHp || 0}</div>
                <div class="cell status-cell"><button class="btn-add-status">+ Add</button></div>
                <div class="cell role-cell">${c.role.toUpperCase()}</div>
                <div class="cell actions-cell"><div class="btn-group"><button title="Edit">⚙️</button><button title="Notes">📝</button><button title="Delete">🗑️</button></div></div>
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
        combatants.forEach(item => {
            if (item.type === 'group') {
                renderGroupRow(item);
                item.members.forEach(member => renderCombatantRow(member, true));
            } else if (item.type === 'combatant') {
                renderCombatantRow(item, false);
            }
        });
        updateSelectionUI();
    }

    // ======= CORE LOGIC FUNCTIONS =======
    function addDefaultCombatant() {
        const c = {
            id: uid(), type: 'combatant', name: `Combatant ${combatants.length + 1}`, init: 10,
            ac: 10, hp: 10, maxHp: 10, tempHp: 0,
            role: 'dm', imageUrl: '', dashboardId: null
        };
        combatants.push(c);
        render();
    }

    function createEmptyGroup() {
        const group = {
            id: uid(), type: 'group',
            name: `New Group ${combatants.filter(c => c.type === 'group').length + 1}`,
            members: []
        };
        combatants.push(group);
        render();
    }

    function moveSelectedToGroup(targetGroupId) {
        if (selectedCombatantIds.size === 0) return;
        const { item: targetGroup } = findEntity(targetGroupId);
        if (!targetGroup || targetGroup.type !== 'group') return;
        let combatantsToMove = [];
        // Pull combatants from the top level
        combatants = combatants.filter(item => {
            if (item.type === 'combatant' && selectedCombatantIds.has(item.id)) {
                combatantsToMove.push(item);
                return false;
            }
            return true;
        });
        // Pull combatants from existing groups
        combatants.forEach(group => {
            if (group.type === 'group') {
                group.members = group.members.filter(member => {
                    if (selectedCombatantIds.has(member.id)) {
                        combatantsToMove.push(member);
                        return false;
                    }
                    return true;
                });
            }
        });
        targetGroup.members.push(...combatantsToMove);
        selectedCombatantIds.clear();
        render();
    }
    
    // ======= EVENT LISTENERS =======
    addCombatantBtn.addEventListener('click', addDefaultCombatant);
    addGroupBtn.addEventListener('click', createEmptyGroup);
    lockGroupSelectionBtn.addEventListener('click', () => { isLocked = !isLocked; updateLockUI(); });

    bulkAssignGroupBtn.addEventListener('click', () => {
        if (selectedCombatantIds.size > 0) {
            openGroupModal();
        } else {
            alert("Please select one or more combatants to group.");
        }
    });

    combatantListBody.addEventListener('click', (e) => {
        const target = e.target;
        const groupRow = target.closest('.group-row');
        
        // **THIS IS THE CORRECTED LOGIC**
        // It immediately moves selected combatants when a group is clicked.
        if (groupRow && selectedCombatantIds.size > 0 && !isLocked) {
            const groupId = groupRow.dataset.id;
            moveSelectedToGroup(groupId); // No confirm() prompt.
            return; // Stop further execution
        }
        
        // Handles checkbox clicks
        if (target.matches('.combatant-checkbox')) {
            if (isLocked) { e.target.checked = !e.target.checked; return; }
            const id = target.dataset.id;
            if (target.checked) selectedCombatantIds.add(id);
            else selectedCombatantIds.delete(id);
            updateSelectionUI();
        }
    });

    selectAllCheckbox.addEventListener('change', (e) => {
        if (isLocked) { e.target.checked = !e.target.checked; return; }
        const isChecked = e.target.checked;
        selectedCombatantIds.clear();
        if (isChecked) {
            combatants.forEach(item => {
                if (item.type === 'group') {
                    item.members.forEach(m => selectedCombatantIds.add(m.id));
                } else if (item.type === 'combatant') {
                    selectedCombatantIds.add(item.id);
                }
            });
        }
        render();
    });

    // Modal Event Listeners
    closeGroupModalBtn.addEventListener('click', closeGroupModal);
    saveGroupAssignmentBtn.addEventListener('click', handleGroupAssignment);

    existingGroupsList.addEventListener('click', (e) => {
        if (e.target.matches('.group-option')) {
            document.querySelectorAll('.group-option.selected').forEach(el => el.classList.remove('selected'));
            e.target.classList.add('selected');
            selectedGroupIdInModal = e.target.dataset.groupId;
            newGroupNameInput.value = '';
        }
    });

    newGroupNameInput.addEventListener('input', () => {
        if (newGroupNameInput.value) {
            document.querySelectorAll('.group-option.selected').forEach(el => el.classList.remove('selected'));
            selectedGroupIdInModal = null;
        }
    });

    // ======= INITIALIZATION =======
    window.CombatTracker = { render, updateSelectionUI };
    render();
})();