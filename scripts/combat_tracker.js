/* scripts/combat_tracker.js */

(() => {
    // ======= STATE =======
    let combatants = [];
    let selectedCombatantIds = new Set();
    let isLocked = false; // ADDED: State for the lock button

    window.CombatState = { combatants, selectedCombatantIds, isLocked };

    let round = 1;
    let currentTurnIndex = -1;

    // ======= DOM ELEMENT SELECTIONS =======
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => root.querySelectorAll(sel);
    
    const combatantListBody = $('#combatant-list-body');
    const addCombatantBtn = $('#addCombatantBtn');
    
    const bulkActionsBar = $('#bulkActionsBar');
    const selectionCounter = $('#selectionCounter');
    const selectAllCheckbox = $('#selectAllCheckbox');
    
    // ADDED: Selections for the new functionality
    const lockGroupSelectionBtn = $('#lockGroupSelectionBtn');
    const trackerTable = $('#tracker-table');

    // ======= FUNCTIONS =======

    /**
     * Updates the UI of the lock button based on the isLocked state.
     */
    function updateLockUI() {
        trackerTable.classList.toggle('selection-locked', isLocked);
        if (isLocked) {
            lockGroupSelectionBtn.innerHTML = `🔓 <span class="label">Unlock Groups</span>`;
            // When locking, clear existing selections for a clean UI state
            selectedCombatantIds.clear();
            render(); // Re-render to clear checkboxes visually
        } else {
            lockGroupSelectionBtn.innerHTML = `🔒 <span class="label">Lock Groups</span>`;
        }
    }
    
    /**
     * Updates all UI elements related to selection.
     */
    function updateSelectionUI() {
        const selectionCount = selectedCombatantIds.size;
        const totalCombatants = combatants.length;

        selectionCounter.textContent = `${selectionCount} selected`;
        
        // Don't show the bar if the UI is locked
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

        $$('.tracker-table-row', combatantListBody).forEach(row => {
            row.classList.toggle('selected', selectedCombatantIds.has(row.dataset.id));
        });
    }

    /**
     * Renders the entire list of combatants.
     */
    function render() {
        combatantListBody.innerHTML = '';

        if (combatants.length === 0) {
            combatantListBody.innerHTML = '<div class="empty-message">No combatants.</div>';
            updateSelectionUI();
            return;
        }

        combatants.forEach((c, index) => {
            const row = document.createElement('div');
            
            const isCurrentTurn = (index === currentTurnIndex);
            const isSelected = selectedCombatantIds.has(c.id);

            row.className = `tracker-table-row ${isCurrentTurn ? 'current-turn' : ''}`;
            row.dataset.id = c.id;

            row.innerHTML = `
                <div class="cell select-cell">
                    <input type="checkbox" class="combatant-checkbox" data-id="${c.id}" ${isSelected ? 'checked' : ''}>
                </div>
                <div class="cell image-cell cell-center">
                    <img src="${c.imageUrl || 'images/icon.png'}" alt="${c.name}">
                </div>
                <div class="cell init-cell cell-center">${c.init}</div>
                <div class="cell name-cell">${c.name}</div>
                <div class="cell ac-cell cell-center">${c.ac}</div>
                <div class="cell hp-cell cell-center">
                    <span class="hp-heart">❤️</span>
                    <span>${c.hp} / ${c.maxHp}</span>
                </div>
                <div class="cell temp-hp-cell cell-center">${c.tempHp || 0}</div>
                <div class="cell status-cell">
                    <button class="btn-add-status">+ Add</button>
                </div>
                <div class="cell role-cell cell-center">${c.role.toUpperCase()}</div>
                <div class="cell actions-cell cell-center">
                    <div class="btn-group">
                        <button data-action="edit" title="Edit">⚙️</button>
                        <button data-action="notes" title="Notes">📝</button>
                        <button data-action="delete" title="Delete">🗑️</button>
                    </div>
                </div>
                <div class="cell dashboard-link-cell cell-center">
                    <button data-action="toggle-dashboard" title="Toggle Dashboard">📄</button>
                </div>
            `;

            combatantListBody.appendChild(row);
        });
        
        updateSelectionUI();
    }

    const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    function addDefaultCombatant() {
        const combatantCount = combatants.length;
        const c = {
            id: uid(), name: `Combatant ${combatantCount + 1}`, init: 10, ac: 10,
            hp: 10, maxHp: 10, tempHp: 0, tempHpSources: [],
            role: 'dm', imageUrl: '', dashboardId: null
        };
        combatants.unshift(c);
        render();
    }

    // ======= EVENT LISTENERS =======

    addCombatantBtn.addEventListener('click', addDefaultCombatant);

    combatantListBody.addEventListener('click', (e) => {
        if (e.target.matches('.combatant-checkbox')) {
            // Do nothing if the UI is locked
            if (isLocked) {
                e.target.checked = !e.target.checked; // Prevent visual change
                return;
            }
            const id = e.target.dataset.id;
            if (e.target.checked) {
                selectedCombatantIds.add(id);
            } else {
                selectedCombatantIds.delete(id);
            }
            updateSelectionUI();
        }
    });

    selectAllCheckbox.addEventListener('change', (e) => {
        if (isLocked) return; // Ignore if locked
        const isChecked = e.target.checked;
        combatants.forEach(c => {
            if (isChecked) selectedCombatantIds.add(c.id);
            else selectedCombatantIds.clear();
        });
        render();
    });

    // ADDED: Event listener for the lock button
    lockGroupSelectionBtn.addEventListener('click', () => {
        isLocked = !isLocked; // Toggle the state
        updateLockUI(); // Update the UI based on the new state
    });

    // ======= GLOBAL EXPOSURE & INITIALIZATION =======
    window.CombatTracker = { render, updateSelectionUI };

    addDefaultCombatant();
    addDefaultCombatant();
    addDefaultCombatant();
    addDefaultCombatant();
    render();

})();