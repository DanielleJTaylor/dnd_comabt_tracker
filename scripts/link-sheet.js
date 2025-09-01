// scripts/link-sheet.js

(() => {
    // === DOM ELEMENT SELECTIONS ===
    const combatantListBody = document.querySelector('#combatant-list-body');
    const appContainer = document.querySelector('#app-container');
    const modal = document.querySelector('#link-dashboard-modal');
    const modalTitle = document.querySelector('#link-modal-title');
    const dashboardSelect = document.querySelector('#dashboard-select');
    const saveLinkBtn = document.querySelector('#save-link-btn');
    const closeModalBtn = document.querySelector('#close-modal-btn');
    const dashboardContentDisplay = document.querySelector('#dashboard-content-display');

    let currentLinkingCombatantId = null;

    // === FUNCTIONS ===

    /**
     * Opens the modal to link a dashboard to a specific combatant.
     * @param {string} combatantId The ID of the combatant to link.
     */
    function openLinkModal(combatantId) {
        currentLinkingCombatantId = combatantId;
        const combatant = window.CombatState.combatants.find(c => c.id === combatantId);
        const allDashboards = window.DashboardState.dashboards;

        if (!combatant) return;

        // Set the modal title
        modalTitle.textContent = `Link Dashboard for ${combatant.name}`;

        // Populate the dropdown menu
        dashboardSelect.innerHTML = '<option value="">-- Select a Sheet --</option>'; // Default option
        allDashboards.forEach(d => {
            const option = document.createElement('option');
            option.value = d.id;
            option.textContent = d.name;
            // If the combatant is already linked, pre-select that option
            if (combatant.dashboardId === d.id) {
                option.selected = true;
            }
            dashboardSelect.appendChild(option);
        });

        // Show the modal
        modal.classList.remove('hidden');
    }

    /**
     * Saves the selected dashboard link to the combatant.
     */
    function saveLink() {
        if (!currentLinkingCombatantId) return;

        const combatant = window.CombatState.combatants.find(c => c.id === currentLinkingCombatantId);
        const selectedDashboardId = dashboardSelect.value;

        if (combatant) {
            combatant.dashboardId = selectedDashboardId || null; // Store null if nothing is selected
            console.log(`Linked ${combatant.name} to dashboard ID: ${combatant.dashboardId}`);
            window.CombatTracker.render(); // Re-render the combatant list to show link status
        }
        
        closeModal();
    }
    
    /**
     * Closes the link modal.
     */
    function closeModal() {
        modal.classList.add('hidden');
        currentLinkingCombatantId = null;
    }

    /**
     * Displays the content of a specific dashboard in the left panel.
     * @param {string} dashboardId The ID of the dashboard to display.
     */
    function displayDashboard(dashboardId) {
        const dashboard = window.DashboardState.dashboards.find(d => d.id === dashboardId);
        if (dashboard) {
            dashboardContentDisplay.innerHTML = dashboard.content;
            appContainer.classList.add('dashboard-visible'); // Show the panel
        } else {
            dashboardContentDisplay.innerHTML = '<p>No dashboard linked or found.</p>';
        }
    }


    // === EVENT LISTENERS ===

    // Main listener on the combatant list to handle all clicks
    combatantListBody.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action="toggle-dashboard"]');
        if (!button) return;

        const row = button.closest('.tracker-table-row');
        const combatantId = row.dataset.id;
        const combatant = window.CombatState.combatants.find(c => c.id === combatantId);

        if (combatant.dashboardId) {
            // If linked, display the sheet and toggle the panel
            displayDashboard(combatant.dashboardId);
            appContainer.classList.toggle('dashboard-visible');
        } else {
            // If not linked, open the modal to create a link
            openLinkModal(combatantId);
        }
    });

    // Listeners for the modal buttons
    saveLinkBtn.addEventListener('click', saveLink);
    closeModalBtn.addEventListener('click', closeModal);
    
    // Close modal if clicking on the dark overlay
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

})();