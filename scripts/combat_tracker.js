/* scripts/combat_tracker.js
   Minimal combat tracker logic for your current HTML
*/

(() => {

    // ======= STATE =======
    let combatants = [];  // List of combatants

    // ✅ Expose so group-selector.js can read it
    window.CombatState = { combatants };

    let round = 1;        // Current round of combat
    let currentTurnIndex = 0;  // The index of the current combatant's turn

    // ======= DOM ELEMENT SELECTIONS =======
    // It's good practice to select all your needed elements at the top
    const $ = (sel, root = document) => root.querySelector(sel);
    const combatantListBody = $('#combatant-list-body'); // CORRECT: Select the correct body element
    const trackerContainer = $('#trackerContainer');
    const addCombatantBtn = $('#addCombatantBtn');


    // ======= FUNCTIONS =======


    // scripts/combat_tracker.js

    /**
     * Renders the entire list of combatants to the screen.
     */
    function render() {
        combatantListBody.innerHTML = '';

        if (combatants.length === 0) {
            combatantListBody.innerHTML = '<div class="empty-message">No combatants. Click "+ Add Combatant" to begin.</div>';
            return;
        }

        combatants.forEach((c, index) => {
            const row = document.createElement('div');
            
            const isCurrentTurn = (index === currentTurnIndex);
            row.className = `tracker-table-row ${isCurrentTurn ? 'current-turn' : ''}`;
            row.dataset.id = c.id;

            // CORRECTED: This now creates all 10 cells to match your CSS grid
            row.innerHTML = `
                <div class="cell image-cell">
                    <img src="${c.imageUrl || 'images/icon.png'}" alt="${c.name}">
                </div>
                <div class="cell init-cell">${c.init}</div>
                <div class="cell name-cell">${c.name}</div>
                <div class="cell ac-cell">${c.ac}</div>
                <div class="cell hp-cell">
                    <span class="hp-heart">❤️</span>
                    <span>${c.hp} / ${c.maxHp}</span>
                </div>
                <div class="cell temp-hp-cell">${c.tempHp || 0}</div>
                <div class="cell status-cell">
                    <button class="btn-add-status">+ Add</button>
                </div>
                <div class="cell role-cell">${c.role.toUpperCase()}</div>
                <div class="cell actions-cell">
                    <div class="btn-group">
                        <button data-action="edit" title="Edit">⚙️</button>
                        <button data-action="notes" title="Notes">📝</button>
                        <button data-action="delete" title="Delete">🗑️</button>
                    </div>
                </div>
                <div class="cell dashboard-link-cell">
                    <button data-action="toggle-dashboard" title="Toggle Dashboard">📄</button>
                </div>
            `;

            combatantListBody.appendChild(row);
        });
    }


    // Simple unique id
    const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;


    /**
     * Adds a new combatant with default values to the state.
     */
    function addDefaultCombatant() {
        const c = {
            id: uid(),
            name: `Combatant ${combatants.length + 1}`,
            init: 10,
            ac: 10,
            hp: 10,
            maxHp: 10,
            tempHpSources: [],
            role: 'dm',
            imageUrl: '',
            dashboardId: null // <-- ADD THIS LINE
        };
        combatants.unshift(c);
        HistoryLog.log(`➕ Added ${c.name}.`);   // ✅ use HistoryLog

        render(); // Re-render the list to show the new addition
    }



    // ======= EVENT LISTENERS =======
    addCombatantBtn.addEventListener('click', addDefaultCombatant);

    // In scripts/combat_tracker.js, inside the IIFE, near the end

    // Expose necessary functions for other modules to use
    window.CombatTracker = {
        render // <-- ADD THIS LINE
    };

    // Initial render on load
    render();

    })();