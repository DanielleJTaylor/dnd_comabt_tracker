/* scripts/history-log.js
   Handles the history log panel, rendering, and logging messages
*/

(() => {
    // ======= STATE =======
    let historyLog = [];

    // ======= DOM ELEMENT SELECTIONS =======
    const $ = (sel, root = document) => root.querySelector(sel);
    const historyLogBtn = $('#historyLogBtn');         // Button to toggle panel
    const trackerContainer = $('#trackerContainer');   // The panel itself
    const logContent = $('#historyLogContent');        // Where log entries show

    // ======= FUNCTIONS =======

    /**
     * Adds a message to the history log array and re-renders.
     * @param {string} message The message to log.
     */
    function log(message) {
        const timestamp = new Date().toLocaleTimeString();
        historyLog.unshift(`[${timestamp}] ${message}`);
        renderLog();
    }

    /**
     * Renders the log into the UI panel.
     */
    function renderLog() {
        logContent.innerHTML = historyLog.join('<br>');
    }

    // ======= EVENT LISTENERS =======
    historyLogBtn.addEventListener('click', () => {
        trackerContainer.classList.toggle('visible');
    });

    // ======= EXPORT =======
    // Expose logging so other scripts can call it
    window.HistoryLog = {
        log,
        renderLog
    };

})();
