// scripts/view-dashboards.js
document.addEventListener('DOMContentLoaded', () => {
  const dashboardListContainer = document.getElementById('dashboard-list-container');
  const newDashboardBtn = document.getElementById('newDashboardBtn');
  const newFolderBtn = document.getElementById('newFolderBtn');
  const sortBtn = document.getElementById('sortBtn');
  const importBtn = document.getElementById('importBtn');
  const importInput = document.getElementById('importInput');
  const breadcrumbsEl = document.getElementById('dash-breadcrumbs');
  const upFolderBtn = document.getElementById('up-folder-btn');

  const TREE_KEY = 'dash_tree_v1';
  const DND_MIME = 'application/x-dash-node';

  let dndCurrent = null;
  let wasDragging = false;

  function loadTree() {
    const raw = localStorage.getItem(TREE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function saveTree(tree) { localStorage.setItem(TREE_KEY, JSON.stringify(tree)); }

  function ensureTree() {
    let tree = loadTree();
    if (!tree) {
      tree = { id: 'root', type: 'folder', name: 'Root', children: [] };
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('dash_')) {
          try {
            const d = JSON.parse(localStorage.getItem(k));
            tree.children.push({ id: k, type: 'dashboard', title: d?.title || 'Untitled Dashboard' });
          } catch { }
        }
      }
      saveTree(tree);
    }
    return tree;
  }

  function findNodeById(node, id, path = []) {
    if (!node) return null;
    if (node.id === id) return { node, path };
    if (node.type === 'folder' && Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = findNodeById(child, id, [...path, node]);
        if (found) return found;
      }
    }
    return null;
  }

  function findParentOf(node, targetId) {
    if (node.type !== 'folder' || !Array.isArray(node.children)) return null;
    for (const child of node.children) {
      if (child.id === targetId) return node;
      if (child.type === 'folder') {
        const deep = findParentOf(child, targetId);
        if (deep) return deep;
      }
    }
    return null;
  }

  function isAncestor(ancestorId, nodeId) {
    if (ancestorId === nodeId) return true;
    const found = findNodeById(tree, nodeId);
    if (!found) return false;
    return found.path.some(p => p.id === ancestorId);
  }
  
  // Tree mutation and navigation functions remain the same
  function removeNodeById(root, id) {
    if (root.type !== 'folder') return false;
    const idx = root.children.findIndex(c => c.id === id);
    if (idx >= 0) { root.children.splice(idx, 1); return true; }
    for (const c of root.children) {
      if (c.type === 'folder' && removeNodeById(c, id)) return true;
    }
    return false;
  }

  function moveNode(nodeId, destFolderId) {
    const destInfo = findNodeById(tree, destFolderId);
    if (!destInfo || destInfo.node.type !== 'folder') return false;
    if (isAncestor(nodeId, destFolderId)) return false;
    const parent = findParentOf(tree, nodeId);
    if (!parent) return false;
    const moved = parent.children.find(c => c.id === nodeId);
    if (!moved) return false;
    if (parent.id === destFolderId) return true;
    removeNodeById(tree, nodeId);
    destInfo.node.children.push(moved);
    saveTree(tree);
    return true;
  }

  function getInitialFolderId() {
    const urlId = new URLSearchParams(location.search).get('folder');
    if (urlId) return urlId;
    const remembered = localStorage.getItem('dash_current_folder');
    return remembered || 'root';
  }

  let tree = ensureTree();
  let currentFolderId = getInitialFolderId();

  function setCurrentFolder(id) {
    currentFolderId = id || 'root';
    localStorage.setItem('dash_current_folder', currentFolderId);
    const u = new URL(location.href);
    if (currentFolderId === 'root') u.searchParams.delete('folder');
    else u.searchParams.set('folder', currentFolderId);
    history.replaceState(null, '', u);
    render();
  }

  // ---------- Drag & Drop ----------
  function makeDraggableCard(el, node) {
    el.draggable = true;
    el.dataset.nodeId = node.id;
    el.dataset.nodeType = node.type;

    el.addEventListener('dragstart', (e) => {
      wasDragging = true; // Set a flag when dragging starts
      dndCurrent = { id: node.id, type: node.type };
      e.dataTransfer.effectAllowed = 'move';
      try {
        e.dataTransfer.setData(DND_MIME, JSON.stringify(dndCurrent));
      } catch {}
    });

    el.addEventListener('dragend', () => {
      // Use a timeout to ensure the 'click' event fires *after* this
      setTimeout(() => { wasDragging = false; }, 0);
      dndCurrent = null;
    });

    // --- REMOVED --- The conflicting click listener is no longer here.
  }
  
  // Other DnD helper functions remain the same...
  function makeFolderDroppable(el, folderNode) {
      el.addEventListener('dragover', (e) => {
          if (!dndCurrent) return;
          const ok = canDrop(dndCurrent, folderNode);
          if (ok) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              el.classList.add('drop-ok');
              el.classList.remove('drop-bad');
          } else {
              el.classList.add('drop-bad');
              el.classList.remove('drop-ok');
          }
      });
      el.addEventListener('dragleave', () => {
          el.classList.remove('drop-ok', 'drop-bad');
      });
      el.addEventListener('drop', (e) => {
          e.preventDefault();
          el.classList.remove('drop-ok', 'drop-bad');
          const payload = getDragPayload(e);
          if (payload && canDrop(payload, folderNode)) {
              if (moveNode(payload.id, folderNode.id)) render();
          }
      });
  }

  function makeBreadcrumbDroppable(aEl, folderId) {
    aEl.addEventListener('dragover', (e) => {
        if (!dndCurrent) return;
        const folder = findNodeById(tree, folderId)?.node;
        const ok = folder?.type === 'folder' && canDrop(dndCurrent, folder);
        if (ok) { e.preventDefault(); aEl.classList.add('drop-ok'); }
        else { aEl.classList.add('drop-bad'); }
    });
    aEl.addEventListener('dragleave', () => aEl.classList.remove('drop-ok', 'drop-bad'));
    aEl.addEventListener('drop', (e) => {
        const payload = getDragPayload(e);
        aEl.classList.remove('drop-ok', 'drop-bad');
        if (!payload) return;
        const folder = findNodeById(tree, folderId)?.node;
        if (folder?.type === 'folder' && canDrop(payload, folder)) {
            e.preventDefault();
            if (moveNode(payload.id, folderId)) render();
        }
    });
  }

  function getDragPayload(e) {
      if (dndCurrent) return dndCurrent;
      try {
          const raw = e.dataTransfer.getData(DND_MIME);
          if (raw) return JSON.parse(raw);
      } catch {}
      return null;
  }

  function canDrop(payload, destFolderNode) {
      if (!payload || destFolderNode.type !== 'folder') return false;
      if (payload.type === 'folder') {
          if (payload.id === destFolderNode.id) return false;
          if (isAncestor(payload.id, destFolderNode.id)) return false;
      }
      return true;
  }
  
  // ---------- Rendering ----------
  function renderBreadcrumbs(path, current) {
    breadcrumbsEl.innerHTML = '';
    const chain = [{ id:'root', name:'Root' }, ...path.map(n=>({id:n.id, name:n.name})), ...(current && current.id!=='root' ? [{ id: current.id, name: current.name }] : [])];
    chain.forEach((item, idx) => {
      if (idx > 0) {
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '›';
        breadcrumbsEl.appendChild(sep);
      }
      const a = document.createElement('a');
      a.textContent = item.name || 'Untitled';
      a.href = '#';
      a.addEventListener('click', (e) => { e.preventDefault(); setCurrentFolder(item.id); });
      breadcrumbsEl.appendChild(a);
      makeBreadcrumbDroppable(a, item.id);
    });
  }

  function createFolderCard(node) {
    const card = document.createElement('a');
    card.className = 'folder-card';
    card.href = '#';
    card.innerHTML = `<div class="card-header">📁 ${node.name || 'Folder'}</div><div class="card-body">${(node.children?.length || 0)} item(s)</div>`;
    
    // --- MODIFIED --- This is the new, consolidated click handler
    card.addEventListener('click', (e) => {
      e.preventDefault();
      // If wasDragging is true, it means a drag just ended. Do nothing.
      if (wasDragging) {
        return;
      }
      // Otherwise, it's a normal click, so open the folder.
      setCurrentFolder(node.id);
    });

    makeDraggableCard(card, node);
    makeFolderDroppable(card, node);
    return card;
  }

  function createDashboardCard(node) {
    const card = document.createElement('a');
    card.className = 'dashboard-card';
    card.href = `dashboard-sheet.html?id=${node.id}`;
    card.innerHTML = `<div class="card-header">📄 ${node.title || 'Untitled Dashboard'}</div><div class="card-body">Click to open and edit this dashboard.</div>`;
    makeDraggableCard(card, node);
    return card;
  }

  function render() {
    const found = findNodeById(tree, currentFolderId) || findNodeById(tree, 'root');
    const folder = found?.node?.type === 'folder' ? found.node : tree;
    const path = found?.path || [];

    renderBreadcrumbs(path, folder);

    if (upFolderBtn) {
      if (folder.id !== 'root') {
        upFolderBtn.style.display = 'inline-flex';
        const parentId = path.length > 0 ? path[path.length - 1].id : 'root';
        upFolderBtn.onclick = () => setCurrentFolder(parentId);
      } else {
        upFolderBtn.style.display = 'none';
      }
    }

    dashboardListContainer.innerHTML = '';
    const folders = folder.children.filter(n => n.type === 'folder').sort((a,b)=> (a.name||'').localeCompare(b.name||''));
    const dashes  = folder.children.filter(n => n.type === 'dashboard').sort((a,b)=> (a.title||'').localeCompare(b.title||''));

    if (!folders.length && !dashes.length) {
      dashboardListContainer.innerHTML = '<p>This folder is empty.</p>';
      makeFolderDroppable(dashboardListContainer, folder);
      return;
    }
    
    makeFolderDroppable(dashboardListContainer, folder);
    folders.forEach(f => dashboardListContainer.appendChild(createFolderCard(f)));
    dashes.forEach(d  => dashboardListContainer.appendChild(createDashboardCard(d)));
  }

  // Other functions for adding, sorting, importing remain unchanged...
    function addFolder(parentId, name) {
      const found = findNodeById(tree, parentId) || findNodeById(tree, 'root');
      const folder = found?.node?.type === 'folder' ? found.node : tree;
      folder.children.push({ id: `fld_${Date.now()}`, type:'folder', name: (name||'New Folder').trim(), children: [] });
      saveTree(tree);
      render();
    }

    function addDashboardRef(parentId, dashId, title = 'Untitled Dashboard') {
        const found = findNodeById(tree, parentId) || findNodeById(tree, 'root');
        const folder = found?.node?.type === 'folder' ? found.node : tree;
        if (!folder.children.some(n => n.type === 'dashboard' && n.id === dashId)) {
            folder.children.push({ id: dashId, type:'dashboard', title });
            saveTree(tree);
            render();
        }
    }

    function refreshDashboardTitlesFromStorage() {
        let changed = false;
        (function walk(n){
            if (n.type === 'dashboard') {
                const raw = localStorage.getItem(n.id);
                if (raw) {
                    try {
                        const d = JSON.parse(raw);
                        const t = d?.title || 'Untitled Dashboard';
                        if (t !== n.title) { n.title = t; changed = true; }
                    } catch {}
                }
            } else if (n.type === 'folder') {
                n.children?.forEach(walk);
            }
        })(tree);
        if (changed) { saveTree(tree); render(); }
    }

    function handleNewDashboard() {
        const id = `dash_${Date.now()}`;
        localStorage.setItem(id, JSON.stringify({ id, title:'Untitled Dashboard', blocks:[] }));
        addDashboardRef(currentFolderId, id, 'Untitled Dashboard');
        window.location.href = `dashboard-sheet.html?id=${id}`;
    }

    function handleNewFolder() {
        let name = prompt('Folder name:', 'New Folder');
        if (name == null) return;
        name = name.trim() || 'New Folder';
        addFolder(currentFolderId, name);
    }

    function handleSort() {
        const found = findNodeById(tree, currentFolderId) || findNodeById(tree, 'root');
        const folder = found?.node?.type === 'folder' ? found.node : tree;
        folder.children.sort((a,b)=>{
            const an = a.type === 'folder' ? (a.name||'') : (a.title||'');
            const bn = b.type === 'folder' ? (b.name||'') : (b.title||'');
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return an.localeCompare(bn);
        });
        saveTree(tree);
        render();
    }
  
    const textFromFile = (file) => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsText(file); });

    async function importDashboardsFromFiles(files) {
        if (!files?.length) return;
        let imported = 0, skipped = 0;
        for (const f of files) {
            try {
                const txt = await textFromFile(f);
                const obj = JSON.parse(txt);
                const id = `dash_${Date.now()}_${imported}`;
                const stored = { id, title: obj.title || 'Untitled Dashboard', blocks: obj.blocks || [] };
                localStorage.setItem(id, JSON.stringify(stored));
                addDashboardRef(currentFolderId, id, stored.title);
                imported++;
            } catch { skipped++; }
        }
        alert(`Import complete: ${imported} imported${skipped ? `, ${skipped} skipped` : ''}.`);
    }

  // Final wiring
  newDashboardBtn?.addEventListener('click', handleNewDashboard);
  newFolderBtn?.addEventListener('click', handleNewFolder);
  sortBtn?.addEventListener('click', handleSort);
  importBtn?.addEventListener('click', () => importInput?.click());
  importInput?.addEventListener('change', async (e) => {
    await importDashboardsFromFiles(e.target.files);
    e.target.value = '';
  });

  render();
  refreshDashboardTitlesFromStorage();
});