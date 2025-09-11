// scripts/view-dashboards.js
document.addEventListener('DOMContentLoaded', () => {
  const dashboardListContainer = document.getElementById('dashboard-list-container');
  const newDashboardBtn = document.getElementById('newDashboardBtn');
  const newFolderBtn = document.getElementById('newFolderBtn');
  const sortBtn = document.getElementById('sortBtn');
  const importBtn = document.getElementById('importBtn');
  const importInput = document.getElementById('importInput');
  const breadcrumbsEl = document.getElementById('dash-breadcrumbs');

  const TREE_KEY = 'dash_tree_v1';

  // ---------- Tree model ----------
  // Folder: { id, type:'folder', name, children:[...] }
  // Dashboard: { id, type:'dashboard', title }

  const uid = (p='id_') => `${p}${Date.now()}_${Math.floor(Math.random()*1e6)}`;
  const DND_MIME = 'application/x-dash-node';

  // cache current drag since getData isn't available in dragover reliably
  let dndCurrent = null;
  let wasDragging = false; // to suppress click after drag

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
      // migrate existing
      for (let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if (k?.startsWith('dash_')) {
          try {
            const d = JSON.parse(localStorage.getItem(k));
            tree.children.push({ id:k, type:'dashboard', title: d?.title || 'Untitled Dashboard' });
          } catch {}
        }
      }
      saveTree(tree);
    }
    return tree;
  }

  function findNodeById(node, id, path=[]) {
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

  function removeNodeById(root, id) {
    if (root.type !== 'folder') return false;
    const idx = root.children.findIndex(c => c.id === id);
    if (idx >= 0) { root.children.splice(idx,1); return true; }
    for (const c of root.children) {
      if (c.type === 'folder' && removeNodeById(c, id)) return true;
    }
    return false;
  }

  function moveNode(nodeId, destFolderId) {
    const destInfo = findNodeById(tree, destFolderId);
    if (!destInfo || destInfo.node.type !== 'folder') return false;

    // Can't move folder into itself or descendant
    if (isAncestor(nodeId, destFolderId)) return false;

    const parent = findParentOf(tree, nodeId);
    if (!parent) return false;
    const moved = parent.children.find(c => c.id === nodeId);
    if (!moved) return false;

    // no-op: already inside that folder
    if (parent.id === destFolderId) return true;

    // detach then attach
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
    history.replaceState(null, '', u); // keep replaceState (no history growth)
    render();
  }

  // ---------- Drag & Drop ----------
  function makeDraggableCard(el, node) {
    el.draggable = true;
    el.dataset.nodeId = node.id;
    el.dataset.nodeType = node.type;

    el.addEventListener('dragstart', (e) => {
      wasDragging = true;
      dndCurrent = { id: node.id, type: node.type };
      e.dataTransfer.effectAllowed = 'move';
      try {
        e.dataTransfer.setData(DND_MIME, JSON.stringify(dndCurrent));
        e.dataTransfer.setData('text/plain', node.id); // fallback
      } catch {}
    });

    // Clear the global cache after the DnD gesture finishes
    el.addEventListener('dragend', () => {
      // allow click suppression for this tick
      setTimeout(() => { wasDragging = false; }, 0);
      dndCurrent = null;
    });

    // Prevent anchor navigation if the event is actually a drag-release
    el.addEventListener('click', (evt) => {
      if (wasDragging) {
        evt.preventDefault();
        evt.stopPropagation();
      }
    }, true);
  }

  function makeFolderDroppable(el, folderNode) {
    el.addEventListener('dragover', (e) => {
      if (!dndCurrent) return; // nothing we care about
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
      el.classList.remove('drop-ok','drop-bad');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();   // <-- always prevent first
      el.classList.remove('drop-ok','drop-bad');
      const payload = getDragPayload(e);
      if (!payload) return;
      if (canDrop(payload, folderNode)) {
        if (moveNode(payload.id, folderNode.id)) render();
      }
    });
  }

  function makeBreadcrumbDroppable(aEl, folderId) {
    aEl.addEventListener('dragover', (e) => {
      if (!dndCurrent) return; // nothing we care about
      const folder = findNodeById(tree, folderId)?.node;
      const ok = folder?.type === 'folder' && canDrop(dndCurrent, folder);
      if (ok) { e.preventDefault(); aEl.classList.add('drop-ok'); aEl.classList.remove('drop-bad'); }
      else { aEl.classList.add('drop-bad'); aEl.classList.remove('drop-ok'); }
    });
    aEl.addEventListener('dragleave', () => aEl.classList.remove('drop-ok','drop-bad'));
    aEl.addEventListener('drop', (e) => {
      const payload = getDragPayload(e); // works on drop (or falls back to cache)
      aEl.classList.remove('drop-ok','drop-bad');
      if (!payload) return;
      const folder = findNodeById(tree, folderId)?.node;
      if (folder?.type === 'folder' && canDrop(payload, folder)) {
        e.preventDefault();
        if (moveNode(payload.id, folderId)) render();
      }
    });
  }

  function getDragPayload(e) {
    // First prefer the active cache (works for dragover)
    if (dndCurrent) return dndCurrent;

    // Fallback: can read on drop in some browsers
    try {
      const raw = e.dataTransfer.getData(DND_MIME);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }

  function canDrop(payload, destFolderNode) {
    if (!payload || destFolderNode.type !== 'folder') return false;
    // cannot drop into itself or descendant (for folders)
    if (payload.type === 'folder') {
      if (payload.id === destFolderNode.id) return false;
      if (isAncestor(payload.id, destFolderNode.id)) return false;
    }
    // no other restriction (dashboards always fine)
    return true;
  }

  // ---------- Rendering ----------
  function renderBreadcrumbs(path, current) {
    breadcrumbsEl.innerHTML = '';
    const chain = [{ id:'root', name:'Root' }, ...path.map(n=>({id:n.id, name:n.name})), ...(current && current.id!=='root' ? [{ id: current.id, name: current.name }] : [])];

    chain.forEach((item, idx) => {
      if (idx>0) {
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
      // Make breadcrumb droppable (move into this folder)
      makeBreadcrumbDroppable(a, item.id);
    });
  }

  function createFolderCard(node) {
    const card = document.createElement('a');
    card.className = 'folder-card';
    card.href = '#';
    card.innerHTML = `
      <div class="card-header">📁 ${node.name || 'Folder'}</div>
      <div class="card-body">${(node.children?.length || 0)} item(s)</div>
    `;
    card.addEventListener('click', (e) => { e.preventDefault(); setCurrentFolder(node.id); });
    // DnD
    makeDraggableCard(card, node);
    makeFolderDroppable(card, node);
    return card;
  }

  function createDashboardCard(node) {
    const card = document.createElement('a');
    card.className = 'dashboard-card';
    card.href = `dashboard-sheet.html?id=${node.id}`;
    card.innerHTML = `
      <div class="card-header">📄 ${node.title || 'Untitled Dashboard'}</div>
      <div class="card-body">Click to open and edit this dashboard.</div>
      <div class="card-footer">ID: ${node.id}</div>
    `;
    // DnD
    makeDraggableCard(card, node);
    return card;
  }

  function render() {
    const found = findNodeById(tree, currentFolderId) || findNodeById(tree, 'root');
    const folder = found?.node?.type === 'folder' ? found.node : tree;
    const path = found?.path || [];

    renderBreadcrumbs(path, folder);
    dashboardListContainer.innerHTML = '';

    const folders = folder.children.filter(n => n.type==='folder').sort((a,b)=> (a.name||'').localeCompare(b.name||''));
    const dashes  = folder.children.filter(n => n.type==='dashboard').sort((a,b)=> (a.title||'').localeCompare(b.title||''));

    if (!folders.length && !dashes.length) {
      dashboardListContainer.innerHTML = '<p>Empty folder. Use “New Dashboard” or “New Folder”, or drag items here.</p>';
      // Also allow dropping directly into empty area:
      makeFolderDroppable(dashboardListContainer, folder);
      return;
    }

    // Container is also a drop target for the current folder
    makeFolderDroppable(dashboardListContainer, folder);

    folders.forEach(f => dashboardListContainer.appendChild(createFolderCard(f)));
    dashes.forEach(d  => dashboardListContainer.appendChild(createDashboardCard(d)));
  }

  // ---------- Mutations ----------
  function addFolder(parentId, name) {
    const found = findNodeById(tree, parentId) || findNodeById(tree, 'root');
    const folder = found?.node?.type === 'folder' ? found.node : tree;
    folder.children.push({ id: uid('fld_'), type:'folder', name: (name||'New Folder').trim(), children: [] });
    saveTree(tree);
    render();
  }

  function addDashboardRef(parentId, dashId, title='Untitled Dashboard') {
    const found = findNodeById(tree, parentId) || findNodeById(tree, 'root');
    const folder = found?.node?.type === 'folder' ? found.node : tree;
    if (!folder.children.some(n => n.type==='dashboard' && n.id===dashId)) {
      folder.children.push({ id: dashId, type:'dashboard', title });
      saveTree(tree);
      render();
    }
  }

  function refreshDashboardTitlesFromStorage() {
    let changed = false;
    (function walk(n){
      if (n.type==='dashboard') {
        const raw = localStorage.getItem(n.id);
        if (raw) {
          try {
            const d = JSON.parse(raw);
            const t = d?.title || 'Untitled Dashboard';
            if (t !== n.title) { n.title = t; changed = true; }
          } catch {}
        }
      } else if (n.type==='folder') {
        n.children?.forEach(walk);
      }
    })(tree);
    if (changed) { saveTree(tree); render(); }
  }

  // ---------- New / Sort / Import ----------
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
      const an = a.type==='folder' ? (a.name||'') : (a.title||'');
      const bn = b.type==='folder' ? (b.name||'') : (b.title||'');
      if (a.type!==b.type) return a.type==='folder' ? -1 : 1;
      return an.localeCompare(bn);
    });
    saveTree(tree);
    render();
  }

  const textFromFile = (file) => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsText(file); });

  function isValidDashboardShape(obj) {
    return obj && typeof obj==='object' && Array.isArray(obj.blocks) && typeof (obj.title ?? '') === 'string';
  }
  function uniqueDashId(preferredId) {
    const base = (preferredId && String(preferredId).trim()) || `dash_${Date.now()}`;
    let id = base.startsWith('dash_') ? base : `dash_${base}`;
    if (!localStorage.getItem(id)) return id;
    let i=2; while (localStorage.getItem(`${id}_${i}`)) i++;
    return `${id}_${i}`;
  }

  async function importDashboardsFromFiles(files) {
    if (!files?.length) return;
    let imported = 0, skipped = 0;
    for (const f of files) {
      try {
        const txt = await textFromFile(f);
        const obj = JSON.parse(txt);
        if (!isValidDashboardShape(obj)) { skipped++; continue; }
        const incomingId = typeof obj.id === 'string' ? obj.id : null;
        const id = uniqueDashId(incomingId || `dash_${Date.now()}`);
        const stored = { id, title: obj.title || 'Untitled Dashboard', blocks: obj.blocks || [] };
        localStorage.setItem(id, JSON.stringify(stored));
        addDashboardRef(currentFolderId, id, stored.title);
        imported++;
      } catch { skipped++; }
    }
    alert(`Import complete: ${imported} imported${skipped?`, ${skipped} skipped`:''}.`);
  }

  // ---------- Wiring ----------
  newDashboardBtn?.addEventListener('click', handleNewDashboard);
  newFolderBtn?.addEventListener('click', handleNewFolder);
  sortBtn?.addEventListener('click', handleSort);

  importBtn?.addEventListener('click', () => importInput?.click());
  importInput?.addEventListener('change', async (e) => {
    await importDashboardsFromFiles(e.target.files);
    e.target.value = '';
  });
  
  // First render + refresh titles
  render();
  refreshDashboardTitlesFromStorage();
});