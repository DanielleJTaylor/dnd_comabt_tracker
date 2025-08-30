

(() => {




    // ======= STATE =======
    let combatants = [];
    let selectedCombatants = new Set();  // Combatants currently selected
    let isGroupSelectionLocked = false;  // Boolean to track if selection is locked
    // let selectedCombatants = new Set(); // Store selected combatant IDs

    // Selectors for bulk actions bar
    const selectAllCheckbox = $('#selectAllCheckbox');
    const bulkActionsBar = $('#bulkActionsBar');
    const selectionCounter = $('#selectionCounter');
    const bulkDamageHealBtn = $('#bulkDamageHealBtn');
    const bulkDeleteBtn = $('#bulkDeleteBtn');
    const bulkGroupBtn = $('#bulkGroupBtn');


    // ======= DOM ELEMENT SELECTIONS =======
    const $ = (sel, root = document) => root.querySelector(sel);
    const combatantListBody = $('#combatant-list-body');
    const lockGroupSelectionBtn = $('#lockGroupSelectionBtn'); // Lock button

    // ======= FUNCTIONS =======

        // Function to toggle select all
    function toggleSelectAll() {
        if (selectAllCheckbox.checked) {
            combatants.forEach(c => selectedCombatants.add(c.id)); // Add all combatants to the selection
        } else {
            selectedCombatants.clear(); // Deselect all combatants
        }
        render(); // Re-render to reflect changes
        updateBulkActionsBar(); // Update bulk actions visibility and counter
    }

    // Update the bulk actions bar visibility and content
    function updateBulkActionsBar() {
        const selectionCount = selectedCombatants.size;
        if (selectionCount > 0) {
            selectionCounter.textContent = `${selectionCount} selected`;
            bulkActionsBar.classList.add('visible'); // Show the bulk actions bar
        } else {
            bulkActionsBar.classList.remove('visible'); // Hide the bar when no combatants are selected
        }
        // Sync the "select all" checkbox state
        selectAllCheckbox.checked = selectionCount > 0 && selectionCount === combatants.length;
    }

    bulkDamageHealBtn.addEventListener('click', () => {
        if (selectedCombatants.size > 0) {
            // Show the popup for all selected combatants
            showHpPopup([...selectedCombatants]);
        }
    });

    bulkDeleteBtn.addEventListener('click', () => {
        if (selectedCombatants.size > 0 && confirm(`Delete ${selectedCombatants.size} selected combatants?`)) {
            deleteCombatants([...selectedCombatants]); // Delete selected combatants
        }
    });

    bulkGroupBtn.addEventListener('click', () => {
        if (selectedCombatants.size === 0) return;
        const groupName = prompt("Enter group name to assign to selected combatants:");
        if (groupName) {
            log(`📁 Moved ${selectedCombatants.size} combatants to group '${groupName}'.`);
            // In a real app, you'd update the combatant objects here and re-render
        }
    });

    combatantListBody.addEventListener('click', (event) => {
        const target = event.target;
        const row = target.closest('.tracker-table-row');
        if (!row) return;

        const combatantId = row.dataset.id;

        // Handle checkbox clicks for selecting/deselecting combatants
        if (target.type === 'checkbox') {
            if (target.checked) {
            selectedCombatants.add(combatantId);
            } else {
            selectedCombatants.delete(combatantId);
            }
            render();
            updateBulkActionsBar();
            return;
        }
    });




    // Toggle the lock state of group selection
    function toggleLockGroupSelection() {
        isGroupSelectionLocked = !isGroupSelectionLocked;
        
        // Change button appearance based on the lock state
        if (isGroupSelectionLocked) {
            lockGroupSelectionBtn.classList.add('locked'); // Add locked style
            lockGroupSelectionBtn.innerText = '🔓 Unlock Group Selection'; // Change icon to open
        } else {
            lockGroupSelectionBtn.classList.remove('locked');
            lockGroupSelectionBtn.innerText = '🔒 Lock Group Selection'; // Change icon to closed
        }

        // If locked, clear any selected combatants
        if (isGroupSelectionLocked) {
            selectedCombatants.clear();
            render(); // Re-render to reflect locked state
        }

        // Disable or enable combatant selection checkboxes based on lock state
        updateCombatantSelection();
    }

    // Function to update the combatant checkboxes (enable/disable based on lock state)
    function updateCombatantSelection() {
        const checkboxes = combatantListBody.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.disabled = isGroupSelectionLocked;  // Disable checkboxes if locked
        });
    }

    // Render the combatants list with checkbox functionality
    function render() {
        combatantListBody.innerHTML = ''; // Clear the list before rendering

        if (combatants.length === 0) {
            combatantListBody.innerHTML = '<div class="empty-message">No combatants added.</div>';
            return;
        }

        combatants.forEach(c => {
            const row = document.createElement('div');
            // Add 'selected' class if the combatant is selected
            row.className = `tracker-table-row ${selectedCombatants.has(c.id) ? 'selected' : ''}`;
            row.dataset.id = c.id;

            const isChecked = selectedCombatants.has(c.id) ? 'checked' : '';

            row.innerHTML = `
                <div class="cell select-cell">
                    <input type="checkbox" data-id="${c.id}" ${isChecked} ${isGroupSelectionLocked ? 'disabled' : ''}>
                </div>
                <div class="cell image-cell"><img src="${c.imageUrl || 'images/icon.png'}" alt="${c.name}"></div>
                <div class="cell init-cell">${c.init}</div>
                <div class="cell name-cell">${c.name}</div>
                <div class="cell ac-cell">${c.ac}</div>
                <div class="cell hp-cell">${c.hp} / ${c.maxHp}</div>
                <div class="cell temp-hp-cell">0</div>
                <div class="cell status-cell"></div>
                <div class="cell role-cell">${c.role.toUpperCase()}</div>
                <div class="cell actions-cell">
                    <button data-action="hp" title="Adjust HP">❤️</button>
                    <button data-action="edit" title="Edit Combatant">⚙️</button>
                    <button data-action="delete" title="Delete Combatant">🗑️</button>
                </div>
                <div class="cell dashboard-link-cell"><a href="#">🔗</a></div>
            `;
            combatantListBody.appendChild(row);
        });

        // Update the bulk actions bar if needed
        updateBulkActionsBar();
    }

    // Function to update the bulk actions bar visibility and counter
    function updateBulkActionsBar() {
        const selectionCount = selectedCombatants.size;
        if (selectionCount > 0) {
            selectionCounter.textContent = `${selectionCount} selected`;
            bulkActionsBar.classList.add('visible');
        } else {
            bulkActionsBar.classList.remove('visible');
        }
    }

    // Event listener for the "Lock Group Selection" button
    lockGroupSelectionBtn.addEventListener('click', toggleLockGroupSelection);

    // ======= EVENT DELEGATION =======
    // Listen for clicks on the combatant list for individual combatant selection
    combatantListBody.addEventListener('click', (event) => {
        const target = event.target;
        const row = target.closest('.tracker-table-row');
        if (!row) return;

        const combatantId = row.dataset.id;

        // If selection is unlocked, handle checkbox clicks
        if (!isGroupSelectionLocked && target.type === 'checkbox') {
            if (target.checked) {
                selectedCombatants.add(combatantId);
            } else {
                selectedCombatants.delete(combatantId);
            }
            render(); // Re-render to reflect changes
        }
    });

})();


