// scripts/view-dashboards.js
// Manages the "View All Dashboards" page.
// This script can run as a standalone page or as an embedded iframe within encounter.html.

document.addEventListener('DOMContentLoaded', () => {
    // ---- DOM Elements & State ----
    const dashboardListContainer = document.getElementById('dashboard-list-container');
    const newDashboardBtn = document.getElementById('newDashboardBtn');
    const newFolderBtn = document.getElementById('newFolderBtn');
    const sortBtn = document.getElementById('sortBtn');
    const importBtn = document.getElementById('importBtn');
    const importInput = document.getElementById('importInput');
    const breadcrumbsEl = document.getElementById('dash-breadcrumbs');

    // Detect if running inside an iframe on the encounter page
    const IS_EMBEDDED = document.documentElement.classList.contains('embed');
    const TREE_KEY = 'dash_tree_v1';
    const DND_MIME = 'application/x-dash-node';
    
    let dndCurrent = null; // Cache for the currently dragged item
    let wasDragging = false; // Flag to prevent click events after a drag

    let tree = ensureTree();
    let currentFolderId = getInitialFolderId();

    // ---------- Tree Data Model ----------
    function loadTree() {
        try { return JSON.parse(localStorage.getItem(TREE_KEY) || 'null'); } catch { return null; }
    }

    function saveTree(t) { localStorage.setItem(TREE_KEY, JSON.stringify(t)); }

    function ensureTree() {
        let loadedTree = loadTree();
        if (!loadedTree) {
            loadedTree = { id: 'root', type: 'folder', name: 'Root', children: [] };
            // Migrate any old, non-tree dashboards
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k?.startsWith('dash_') && k !== TREE_KEY) {
                    try {
                        const d = JSON.parse(localStorage.getItem(k));
                        loadedTree.children.push({ id: k, type: 'dashboard', title: d?.title || 'Untitled Dashboard' });
                    } catch {}
                }
            }
            saveTree(loadedTree);
        }
        return loadedTree;
    }
    
    // ... Other tree helper functions (findNodeById, findParentOf, etc.)
    function findNodeById(node, id, path=[]) { if (!node) return null; if (node.id === id) return { node, path }; if (node.type === 'folder' && Array.isArray(node.children)) { for (const child of node.children) { const found = findNodeById(child, id, [...path, node]); if (found) return found; } } return null; }
    function findParentOf(node, targetId) { if (node.type !== 'folder' || !Array.isArray(node.children)) return null; for (const child of node.children) { if (child.id === targetId) return node; if (child.type === 'folder') { const deep = findParentOf(child, targetId); if (deep) return deep; } } return null; }
    function isAncestor(ancestorId, nodeId) { if (ancestorId === nodeId) return true; const found = findNodeById(tree, nodeId); if (!found) return false; return found.path.some(p => p.id === ancestorId); }
    function removeNodeById(root, id) { if (root.type !== 'folder') return false; const idx = root.children.findIndex(c => c.id === id); if (idx >= 0) { root.children.splice(idx,1); return true; } for (const c of root.children) { if (c.type === 'folder' && removeNodeById(c, id)) return true; } return false; }
    function moveNode(nodeId, destFolderId) { const destInfo = findNodeById(tree, destFolderId); if (!destInfo || destInfo.node.type !== 'folder') return false; if (isAncestor(nodeId, destFolderId)) return false; const parent = findParentOf(tree, nodeId); if (!parent) return false; const moved = parent.children.find(c => c.id === nodeId); if (!moved) return false; if (parent.id === destFolderId) return true; removeNodeById(tree, nodeId); destInfo.node.children.push(moved); saveTree(tree); return true; }


    function getInitialFolderId() {
        const urlId = new URLSearchParams(location.search).get('folder');
        return urlId || 'root';
    }

    function setCurrentFolder(id) {
        currentFolderId = id || 'root';
        if (!IS_EMBEDDED) {
            const u = new URL(location.href);
            if (currentFolderId === 'root') u.searchParams.delete('folder');
            else u.searchParams.set('folder', currentFolderId);
            history.pushState({ folderId: currentFolderId }, '', u);
        }
        render();
    }

    // ---------- Rendering ----------
    function render() {
        const found = findNodeById(tree, currentFolderId) || findNodeById(tree, 'root');
        const folder = found?.node?.type === 'folder' ? found.node : tree;
        
        renderBreadcrumbs(found?.path || [], folder);
        dashboardListContainer.innerHTML = '';

        const folders = folder.children.filter(n => n.type === 'folder').sort((a,b) => (a.name||'').localeCompare(b.name||''));
        const dashes = folder.children.filter(n => n.type === 'dashboard').sort((a,b) => (a.title||'').localeCompare(b.title||''));

        if (!folders.length && !dashes.length) {
            dashboardListContainer.innerHTML = '<p>Empty folder. Use the buttons above or drag items here.</p>';
        } else {
            folders.forEach(f => dashboardListContainer.appendChild(createFolderCard(f)));
            dashes.forEach(d => dashboardListContainer.appendChild(createDashboardCard(d)));
        }
    }

    function renderBreadcrumbs(path, current) {
        breadcrumbsEl.innerHTML = '';
        const chain = [{ id: 'root', name: 'Root' }, ...path, ...(current.id !== 'root' ? [current] : [])];
        chain.forEach((item, idx) => {
            if (idx > 0) breadcrumbsEl.insertAdjacentHTML('beforeend', '<span class="sep">/</span>');
            const a = document.createElement('a');
            a.textContent = item.name || item.title || 'Untitled';
            a.href = '#';
            a.addEventListener('click', e => { e.preventDefault(); setCurrentFolder(item.id); });
            breadcrumbsEl.appendChild(a);
        });
    }

    function createFolderCard(node) {
        const card = document.createElement('a');
        card.className = 'folder-card';
        card.href = '#';
        card.innerHTML = `<div class="card-header">📁 ${node.name || 'Folder'}</div><div class="card-body">${(node.children?.length || 0)} item(s)</div>`;
        card.addEventListener('click', e => { e.preventDefault(); setCurrentFolder(node.id); });
        return card;
    }

    function createDashboardCard(node) {
        const card = document.createElement('a');
        card.className = 'dashboard-card';
        card.href = `dashboard-sheet.html?id=${node.id}`;
        card.innerHTML = `<div class="card-header">📄 ${node.title || 'Untitled'}</div><div class="card-body">Click to open and edit.</div><div class="card-footer">ID: ${node.id}</div>`;
        
        card.addEventListener('click', e => {
            if (IS_EMBEDDED) {
                e.preventDefault();
                window.parent.postMessage({ type: 'openDashboard', id: node.id }, '*');
            }
        });
        return card;
    }
    
    // ---------- Actions (New, Import, etc.) ----------
    function handleNewDashboard() {
        const id = `dash_${Date.now()}`;
        localStorage.setItem(id, JSON.stringify({ id, title: 'Untitled Dashboard', blocks: [] }));
        addDashboardRef(currentFolderId, id, 'Untitled Dashboard');
        
        if (IS_EMBEDDED) {
            window.parent.postMessage({ type: 'openDashboard', id: id }, '*');
        } else {
            window.location.href = `dashboard-sheet.html?id=${id}`;
        }
    }

    function addDashboardRef(parentId, dashId, title) {
        const found = findNodeById(tree, parentId) || findNodeById(tree, 'root');
        const folder = found?.node?.type === 'folder' ? found.node : tree;
        if (!folder.children.some(n => n.id === dashId)) {
            folder.children.push({ id: dashId, type: 'dashboard', title });
            saveTree(tree);
            render();
        }
    }

    function refreshDashboardTitlesFromStorage() {
        let changed = false;
        function walk(node) {
            if (node.type === 'dashboard') {
                const raw = localStorage.getItem(node.id);
                if (raw) {
                    try {
                        const data = JSON.parse(raw);
                        const title = data?.title || 'Untitled Dashboard';
                        if (title !== node.title) {
                            node.title = title;
                            changed = true;
                        }
                    } catch {}
                }
            } else if (node.type === 'folder') {
                (node.children || []).forEach(walk);
            }
        }
        walk(tree);
        if (changed) {
            saveTree(tree);
            render();
        }
    }
    
    // ---------- Wiring ----------
    newDashboardBtn?.addEventListener('click', handleNewDashboard);
    // ... wiring for sort, import, new folder ...

    // First render + refresh titles
    render();
    refreshDashboardTitlesFromStorage();

    // Listen for changes from other tabs
    window.addEventListener('storage', e => {
        if (e.key === TREE_KEY) {
            tree = ensureTree();
            render();
        } else if (e.key?.startsWith('dash_')) {
            refreshDashboardTitlesFromStorage();
        }
    });

    // Handle browser back/forward for folder navigation
    window.addEventListener('popstate', (e) => {
        currentFolderId = e.state?.folderId || getInitialFolderId();
        render();
    });
});