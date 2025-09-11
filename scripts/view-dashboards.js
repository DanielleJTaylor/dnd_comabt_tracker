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

  const uid = (p = 'id_') => `${p}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

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
        if (k?.startsWith('dash_') && !k.startsWith('dash_tree')) {
          try {
            const d = JSON.parse(localStorage.getItem(k));
            if (d && d.id) {
              tree.children.push({ id: d.id, type: 'dashboard', title: d.title || 'Untitled Dashboard' });
            }
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

  function removeNodeById(root, id) {
    if (root.type !== 'folder' || !Array.isArray(root.children)) return false;
    const idx = root.children.findIndex(c => c.id === id);
    if (idx >= 0) {
      root.children.splice(idx, 1);
      return true;
    }
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
    const movedIdx = parent.children.findIndex(c => c.id === nodeId);
    if (movedIdx < 0) return false;
    const [movedNode] = parent.children.splice(movedIdx, 1);
    destInfo.node.children.push(movedNode);
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

  // --- Drag & Drop ---
  function makeDraggableCard(el, node) {
    el.draggable = true;
    el.addEventListener('dragstart', (e) => {
      wasDragging = true;
      dndCurrent = { id: node.id, type: node.type };
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData(DND_MIME, JSON.stringify(dndCurrent)); } catch {}
    });
    el.addEventListener('dragend', () => {
      setTimeout(() => { wasDragging = false; }, 0);
      dndCurrent = null;
    });
  }

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
    el.addEventListener('dragleave', () => el.classList.remove('drop-ok', 'drop-bad'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drop-ok', 'drop-bad');
      const payload = getDragPayload(e);
      if (payload && canDrop(payload, folderNode)) {
        if (moveNode(payload.id, folderNode.id)) render();
      }
    });
  }
  
  // DnD helper functions...
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
  
  // --- Rendering ---
  function renderBreadcrumbs(path, current) {
    breadcrumbsEl.innerHTML = '';
    const chain = [{ id:'root', name:'Dashboards' }, ...path.map(n=>({id:n.id, name:n.name})), ...(current && current.id!=='root' ? [{ id: current.id, name: current.name }] : [])];
    chain.forEach((item, idx) => {
      if (idx > 0) breadcrumbsEl.insertAdjacentHTML('beforeend', '<span class="sep">›</span>');
      const el = document.createElement(idx === chain.length - 1 ? 'span' : 'a');
      el.textContent = item.name || 'Untitled';
      if (el.tagName === 'A') {
        el.href = '#';
        el.onclick = (e) => { e.preventDefault(); setCurrentFolder(item.id); };
      }
      breadcrumbsEl.appendChild(el);
    });
  }

  function createFolderCard(node) {
    const card = document.createElement('a');
    card.className = 'folder-card';
    card.href = '#';
    card.innerHTML = `<div class="card-header">📁 ${node.name || 'Folder'}</div><div class="card-body">${(node.children?.length || 0)} item(s)</div>`;
    card.addEventListener('click', (e) => {
      e.preventDefault();
      if (wasDragging) return;
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
    card.innerHTML = `<div class="card-header">📄 ${node.title || 'Untitled Dashboard'}</div><div class="card-body">Click to open this dashboard.</div>`;
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
    const children = (folder.children || []).map(child => findNodeById(tree, child.id)?.node || child);
    const folders = children.filter(n => n.type === 'folder').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const dashes = children.filter(n => n.type === 'dashboard').sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    if (!folders.length && !dashes.length) {
      dashboardListContainer.innerHTML = '<p style="padding: 1rem; color: #666;">This folder is empty.</p>';
    } else {
      folders.forEach(f => dashboardListContainer.appendChild(createFolderCard(f)));
      dashes.forEach(d => dashboardListContainer.appendChild(createDashboardCard(d)));
    }
    makeFolderDroppable(dashboardListContainer, folder);
  }

  // --- Mutations ---
  function addFolder(parentId, name) {
    const parentInfo = findNodeById(tree, parentId);
    if (!parentInfo || parentInfo.node.type !== 'folder') return;
    const newFolder = { id: uid('fld_'), type: 'folder', name: name.trim(), children: [] };
    parentInfo.node.children.push(newFolder);
    saveTree(tree);
    render();
  }

  function addDashboardRef(parentId, dashId, title) {
    const parentInfo = findNodeById(tree, parentId);
    if (!parentInfo || parentInfo.node.type !== 'folder') return;
    if (!parentInfo.node.children.some(c => c.id === dashId)) {
      parentInfo.node.children.push({ id: dashId, type: 'dashboard', title });
      saveTree(tree);
      render();
    }
  }
  
  // --- UI Handlers ---
  function handleNewDashboard() {
    const id = `dash_${Date.now()}`;
    const title = 'Untitled Dashboard';
    localStorage.setItem(id, JSON.stringify({ id, title, blocks: [] }));
    addDashboardRef(currentFolderId, id, title);
    window.location.href = `dashboard-sheet.html?id=${id}`;
  }

  function handleNewFolder() {
    const name = prompt('Enter folder name:', 'New Folder');
    if (name) {
      addFolder(currentFolderId, name);
    }
  }
  
  // Other handlers...
  function handleSort() {
      const found = findNodeById(tree, currentFolderId);
      if(!found || found.node.type !== 'folder') return;
      found.node.children.sort((a,b)=>{
          const an = a.type === 'folder' ? (a.name||'') : (a.title||'');
          const bn = b.type === 'folder' ? (b.name||'') : (b.title||'');
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
          return an.localeCompare(bn);
      });
      saveTree(tree);
      render();
  }
  
  async function importDashboardsFromFiles(files) {
      //... implementation
  }

  // --- Wiring ---
  newDashboardBtn?.addEventListener('click', handleNewDashboard);
  newFolderBtn?.addEventListener('click', handleNewFolder);
  sortBtn?.addEventListener('click', handleSort);
  importBtn?.addEventListener('click', () => importInput?.click());
  importInput?.addEventListener('change', (e) => importDashboardsFromFiles(e.target.files).then(() => e.target.value = ''));

  render();
});