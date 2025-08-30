/* scripts/combat_tracker.js
   Minimal combat tracker logic for your current HTML
*/

(() => {

    // ======= STATE =======
    let combatants = [];  // List of all combatants in the tracker
    let round = 1;        // Current round of combat
    let currentTurnIndex = 0;  // The index of the current combatant's turn
    let historyLog = [];  // Log of actions taken in combat

    // ======= DOM ELEMENT SELECTIONS =======
    // It's good practice to select all your needed elements at the top
    const $ = (sel, root = document) => root.querySelector(sel);
    const combatantListBody = $('#combatant-list-body'); // CORRECT: Select the correct body element
    const historyLogBtn = $('#historyLogBtn');
    const trackerContainer = $('#trackerContainer');
    const addCombatantBtn = $('#addCombatantBtn');




    // ======= FUNCTIONS =======



    /**
     * Renders the entire list of combatants to the screen.
     */
    function render() {
        // Clear the list before re-rendering to prevent duplicates
        combatantListBody.innerHTML = '';

        // If no combatants, show a message and stop
        if (combatants.length === 0) {
            combatantListBody.innerHTML = '<div class="empty-message">No combatants yet. Click "+ Add Combatant" to begin.</div>';
            return;
        }

        // Loop through each combatant and create an HTML row for it
        combatants.forEach(c => {
            const row = document.createElement('div');
            row.className = 'tracker-table-row';
            row.dataset.id = c.id; // Set a data attribute to easily identify which combatant this row belongs to

            // Use innerHTML to build the row's content
            // NOTE: We've added `data-action` attributes for our new event handling method
            row.innerHTML = `
                <div class="cell image-cell"><img src="${c.imageUrl || 'images/icon.png'}" alt="${c.name}"></div>
                <div class="cell init-cell">${c.init}</div>
                <div class="cell name-cell">${c.name}</div>
                <div class="cell ac-cell">${c.ac}</div>
                <div class="cell hp-cell">${c.hp} / ${c.maxHp}</div>
                <div class="cell temp-hp-cell">0</div>
                <div class="cell status-cell"></div>
                <div class="cell role-cell">${c.role.toUpperCase()}</div>
                <div class="cell actions-cell">
                    <button data-action="edit" title="Edit Combatant">⚙️</button>
                    <button data-action="delete" title="Delete Combatant">🗑️</button>
                </div>
                <div class="cell dashboard-link-cell"><a href="#">🔗</a></div>
            `;
            combatantListBody.appendChild(row);
        });
    }

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
            imageUrl: ''
        };
        combatants.unshift(c);
        log(`➕ Added ${c.name}.`);
        render(); // Re-render the list to show the new addition
    }






    /**
     * Adds a message to the history log array.
     * @param {string} message The message to log.
     */
    function log(message) {
        const timestamp = new Date().toLocaleTimeString();
        historyLog.unshift(`[${timestamp}] ${message}`); // Adds to the start of the array
        renderLog();
    }

    /**
     * Renders the history log to its panel in the UI.
     */
    function renderLog() {
        const logContent = $('#historyLogContent');
        logContent.innerHTML = historyLog.join('<br>');
    }
    
    /**
     * Generates a simple unique ID.
     */
    const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;


    // ======= EVENT LISTENERS =======

    // Listen for clicks on the "Add Combatant" button
    addCombatantBtn.addEventListener('click', addDefaultCombatant);

    // Listen for clicks on the "History Log" button
    historyLogBtn.addEventListener('click', () => {
        trackerContainer.classList.toggle('visible');
    });

    })();