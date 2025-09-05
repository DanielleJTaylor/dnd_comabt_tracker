// scripts/encounter-dashboards.js
// Manages the iframe in the side panel to show either the dashboard list or an editor.

document.addEventListener('DOMContentLoaded', () => {
    // ---- DOM Elements ----
    const frame = document.getElementById('dashboard-frame');
    const backBtn = document.getElementById('sdBackBtn');
    const viewerTitle = document.getElementById('sdViewerTitle');

    const listViewHeader = document.getElementById('panel-header-list-view');
    const editorViewHeader = document.getElementById('panel-header-editor-view');

    const DASHBOARD_LIST_URL = 'view-dashboards.html?embed=1';

    // ---- View Management ----
    function showListView() {
        frame.src = DASHBOARD_LIST_URL;
        listViewHeader.classList.remove('hidden');
        editorViewHeader.classList.add('hidden');
    }
    
    function showEditorView(dashboardId) {
        const editorUrl = `dashboard-sheet.html?id=${encodeURIComponent(dashboardId)}&embed=1`;
        frame.src = editorUrl;
        
        // Update the title in the header
        const rawData = localStorage.getItem(dashboardId);
        try {
            const data = JSON.parse(rawData);
            viewerTitle.textContent = data.title || 'Dashboard';
        } catch {
            viewerTitle.textContent = 'Dashboard';
        }
        
        editorViewHeader.classList.remove('hidden');
        listViewHeader.classList.add('hidden');
    }

    // ---- Event Listener for Iframe Communication ----
    window.addEventListener('message', (event) => {
        // Basic security check
        if (!event.data || typeof event.data.type !== 'string') {
            return;
        }

        if (event.data.type === 'openDashboard') {
            showEditorView(event.data.id);
        }
    });

    // ---- Initial Setup ----
    showListView(); // Start by showing the list of dashboards
    backBtn.addEventListener('click', showListView);
});