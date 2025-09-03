/* scripts/combat_tracker.js */

(() => {
    // ======= STATE & DATA =======
    let combatants = []; // Can contain combatant and group objects
    let selectedCombatantIds = new Set();
    let isLocked = false;

    // ======= DOM SELECTIONS =======
    const $ = (sel) => document.querySelector(sel);
    const combatantListBody = $('#combatant-list-body');
    const addCombatantBtn = $('#addCombatantBtn');
    const addGroupBtn = $('#addGroupBtn');
    const lockGroupSelectionBtn = $('#lockGroupSelectionBtn');
    const trackerTable = $('#tracker-table');

    // ======= HELPER FUNCTIONS =======
    const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    // ======= RENDER LOGIC =======
    function render() {
        combatantListBody.innerHTML = ''; // Clear the list before redrawing
        combatants.forEach(item => {
            if (item.type === 'group') {
                renderGroupRow(item);
                item.members.forEach(member => renderCombatantRow(member, true));
            } else if (item.type === 'combatant') {
                renderCombatantRow(item, false);
            }
        });
        // Notify the UI layer (group-selector.js) that a render is complete
        window.dispatchEvent(new CustomEvent('tracker:render'));
    }

    const renderCombatantRow = (c, isInGroup) => {
        const row = document.createElement('div');
        row.className = `tracker-table-row ${isInGroup ? 'in-group' : ''}`;
        row.dataset.id = c.id;
        // Note: The checked state is handled by the UI layer after render
        row.innerHTML = `
            <div class="cell select-cell"><input type="checkbox" data-id="${c.id}"></div>
            <div class="cell image-cell"><img src="${c.imageUrl || 'images/icon.png'}" alt="${c.name}"></div>
            <div class="cell init-cell">${c.init}</div>
            <div class="cell name-cell">${c.name}</div>
            <div class="cell ac-cell">${c.ac}</div>
            <div class="cell hp-cell"><span class="hp-heart">❤️</span><span>${c.hp}/${c.maxHp}</span></div>
            <div class="cell temp-hp-cell">${c.tempHp}</div>
            <div class="cell status-cell"><button>+ Add</button></div>
            <div class="cell role-cell">${c.role.toUpperCase()}</div>
            <div class="cell actions-cell"><div class="btn-group"><button title="Edit">⚙️</button><button title="Delete">🗑️</button></div></div>
            <div class="cell dashboard-link-cell"><button title="Dashboard">📄</button></div>
        `;
        combatantListBody.appendChild(row);
    };

    const renderGroupRow = (g) => {
        const row = document.createElement('div');
        row.className = 'group-row';
        row.dataset.id = g.id;
        row.innerHTML = `<span class="group-icon">📁</span><span class="group-name">${g.name}</span>`;
        combatantListBody.appendChild(row);
    };

    // ======= API for UI Layer (group-selector.js) =======
    window.CombatAPI = {
        addCombatant: () => {
            const c = { id: uid(), type: 'combatant', name: `Combatant ${combatants.length + 1}`, init: 10, ac: 10, hp: 10, maxHp: 10, tempHp: 0, role: 'dm', imageUrl: '' };
            combatants.push(c);
            render();
        },
        addGroup: () => {
            const g = { id: uid(), type: 'group', name: `New Group ${combatants.filter(c => c.type === 'group').length + 1}`, members: [] };
            combatants.push(g);
            render();
        },
        toggleLock: () => {
            isLocked = !isLocked;
            trackerTable.classList.toggle('selection-locked', isLocked);
            lockGroupSelectionBtn.innerHTML = isLocked ? `🔓 <span class="label">Unlock</span>` : `🔒 <span class="label">Lock</span>`;
            if (isLocked) CombatAPI.setSelectedIds(new Set()); // Clear selection when locking
            render();
            return isLocked;
        },
        isLocked: () => isLocked,
        getAllCombatants: () => combatants,
        getSelectedIds: () => selectedCombatantIds,
        setSelectedIds: (ids) => {
            selectedCombatantIds = new Set(ids);
            // Don't re-render here, just notify the UI layer to update visuals
            window.dispatchEvent(new CustomEvent('tracker:render'));
        },
        moveSelectedToGroup: (targetGroupId) => {
            const targetGroup = combatants.find(c => c.id === targetGroupId && c.type === 'group');
            if (!targetGroup) return;
            let toMove = [];
            // Pull from top level
            combatants = combatants.filter(c => !(c.type === 'combatant' && selectedCombatantIds.has(c.id) && toMove.push(c)));
            // Pull from other groups
            combatants.forEach(g => {
                if (g.type === 'group') g.members = g.members.filter(m => !(selectedCombatantIds.has(m.id) && toMove.push(m)));
            });
            targetGroup.members.push(...toMove);
            CombatAPI.setSelectedIds(new Set()); // Clear selection after move
        },
        ungroupSelected: () => {
            let toUngroup = [];
            combatants.forEach(g => {
                if (g.type === 'group') g.members = g.members.filter(m => !(selectedCombatantIds.has(m.id) && toUngroup.push(m)));
            });
            combatants.push(...toUngroup);
            CombatAPI.setSelectedIds(new Set()); // Clear selection after move
        },
        deleteSelected: () => {
            // Remove combatants from top level
            combatants = combatants.filter(c => !(c.type === 'combatant' && selectedCombatantIds.has(c.id)));
            // Remove combatants from groups
            combatants.forEach(g => {
                if (g.type === 'group') g.members = g.members.filter(m => !selectedCombatantIds.has(m.id));
            });
            CombatAPI.setSelectedIds(new Set()); // Clear selection after delete
        },
        // For the modal in group-selector.js
        getAllGroups: () => combatants.filter(c => c.type === 'group'),
        addGroupByName: (name) => {
            const g = { id: uid(), type: 'group', name, members: [] };
            combatants.push(g);
            render();
            return g;
        }
    };

    // ======= EVENT LISTENERS (Data Layer Only) =======
    addCombatantBtn.addEventListener('click', CombatAPI.addCombatant);
    addGroupBtn.addEventListener('click', CombatAPI.addGroup);
    lockGroupSelectionBtn.addEventListener('click', CombatAPI.toggleLock);
    
    // Initial Render on page load
    render();
})();