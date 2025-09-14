// scripts/view-dashboards.js
document.addEventListener('DOMContentLoaded', () => {
  const dashboardListContainer = document.getElementById('dashboard-list-container');
  const newDashboardBtn = document.getElementById('newDashboardBtn');
  const newFolderBtn = document.getElementById('newFolderBtn');
  const sortBtn = document.getElementById('sortBtn');
  const importBtn = document.getElementById('importBtn'); // (kept if you still have it)
  const importInput = document.getElementById('importInput');

  // NEW: extra controls
  const newCharBtn = document.getElementById('newCharBtn');
  const newMonsterBtn = document.getElementById('newMonsterBtn');
  const importTextBtn = document.getElementById('importTextBtn');
  const importPdfInput = document.getElementById('importPdfInput');

  // NEW: text modal bits
  const importTextDialog = document.getElementById('importTextDialog');
  const importTextArea = document.getElementById('importTextArea');
  const importTextConfirm = document.getElementById('importTextConfirm');

  const breadcrumbsEl = document.getElementById('dash-breadcrumbs');
  const upFolderBtn = document.getElementById('up-folder-btn');

  const TREE_KEY = 'dash_tree_v1';
  const DND_MIME = 'application/x-dash-node';

  let dndCurrent = null;
  let wasDragging = false;

  const uid = (p = 'id_') => `${p}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  // --- storage helpers for the tree ---
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
      // seed with any loose dashboards in localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('dash_') && !k.startsWith('dash_tree')) {
          try {
            const d = JSON.parse(localStorage.getItem(k));
            if (d && d.id) {
              tree.children.push({ id: d.id, type: 'dashboard', title: d.title || 'Untitled Dashboard' });
            }
          } catch {}
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
    const movedIdx = parent.children.findIndex(c => c.id === nodeId);
    if (movedIdx < 0) return false;
    const [movedNode] = parent.children.splice(movedIdx, 1);
    destInfo.node.children.push(movedNode);
    saveTree(tree);
    return true;
  }

  // remember folder
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

  // --- rendering ---
  function renderBreadcrumbs(path, current) {
    breadcrumbsEl.innerHTML = '';
    const chain = [{ id: 'root', name: 'Dashboards' }, ...path.map(n => ({ id: n.id, name: n.name })), ...(current && current.id !== 'root' ? [{ id: current.id, name: current.name }] : [])];
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
  function canDrop(payload, destFolderNode) {
    if (!payload || destFolderNode.type !== 'folder') return false;
    if (payload.type === 'folder') {
      if (payload.id === destFolderNode.id) return false;
      if (isAncestor(payload.id, destFolderNode.id)) return false;
    }
    return true;
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
      const payload = dndCurrent || (() => { try { return JSON.parse(e.dataTransfer.getData(DND_MIME)); } catch { return null; }})();
      if (payload && canDrop(payload, folderNode)) {
        if (moveNode(payload.id, folderNode.id)) render();
      }
    });
  }

  function createFolderCard(node) {
    const card = document.createElement('a');
    card.className = 'folder-card';
    card.href = '#';
    card.innerHTML = `<div class="card-header">📁 ${node.name || 'Folder'}</div>
                      <div class="card-body">${(node.children?.length || 0)} item(s)</div>`;
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
    card.innerHTML = `<div class="card-header">📄 ${node.title || 'Untitled Dashboard'}</div>
                      <div class="card-body">Click to open this dashboard.</div>`;
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
    const dashes  = children.filter(n => n.type === 'dashboard').sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    if (!folders.length && !dashes.length) {
      dashboardListContainer.innerHTML = '<p style="padding:1rem; color:#666;">This folder is empty.</p>';
    } else {
      folders.forEach(f => dashboardListContainer.appendChild(createFolderCard(f)));
      dashes.forEach(d => dashboardListContainer.appendChild(createDashboardCard(d)));
    }
    makeFolderDroppable(dashboardListContainer, folder);
  }

  // --- mutations ---
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

  // --- create blank / template dashboards ---
  function saveNewDashboard(title, blocks) {
    const id = `dash_${Date.now()}_${Math.floor(Math.random()*1e6)}`;
    localStorage.setItem(id, JSON.stringify({ id, title, blocks: blocks || [] }));
    addDashboardRef(currentFolderId, id, title);
    return id;
  }
  function makeCharacterTemplateBlocks() {
    return [
      { id: uid('b_'), type: 'text', x: 0, y: 0, w: 6, h: 2, html: '<h2>Character Name</h2><em>“A character quote.”</em>' },
      { id: uid('b_'), type: 'text', x: 0, y: 2, w: 3, h: 4, html: '<strong>Portrait</strong>' },
      { id: uid('b_'), type: 'text', x: 3, y: 2, w: 3, h: 4, html: '<b>Level</b> — <b>Class</b> — <b>Background</b><br><b>Race</b> — <b>Alignment</b><br><b>Armor</b> — <b>Weapons</b><br><b>Languages</b>' },
      { id: uid('b_'), type: 'text', x: 0, y: 6, w: 2, h: 2, html: '<b>AC</b><div style="font-size:2rem;">10</div>' },
      { id: uid('b_'), type: 'text', x: 2, y: 6, w: 2, h: 2, html: '<b>HP</b><div>Max: 10<br>Current: 10<br>Temp: 0</div>' },
      { id: uid('b_'), type: 'text', x: 4, y: 6, w: 2, h: 2, html: '<b>Death Saves</b>' },
      { id: uid('b_'), type: 'text', x: 0, y: 8, w: 6, h: 3, html: '<b>Ability Scores</b><br>STR DEX CON INT WIS CHA' },
    ];
  }
  function makeMonsterTemplateBlocks() {
    return [
      { id: uid('b_'), type: 'text', x: 0, y: 0, w: 6, h: 2, html: '<h2>Monster / NPC Name</h2><em>Type • Size • Alignment</em>' },
      { id: uid('b_'), type: 'text', x: 0, y: 2, w: 6, h: 2, html: '<b>AC</b> — <b>HP</b> — <b>Speed</b> — <b>Passive Perception</b>' },
      { id: uid('b_'), type: 'text', x: 0, y: 4, w: 6, h: 3, html: '<b>Abilities</b><br>STR DEX CON INT WIS CHA' },
      { id: uid('b_'), type: 'text', x: 0, y: 7, w: 6, h: 4, html: '<b>Traits / Actions</b>' },
    ];
  }

  function handleNewDashboard() {
    const id = saveNewDashboard('Untitled Dashboard', []);
    window.location.href = `dashboard-sheet.html?id=${id}`;
  }
  function handleNewChar() {
    const id = saveNewDashboard('New 5e Character', makeCharacterTemplateBlocks());
    window.location.href = `dashboard-sheet.html?id=${id}`;
  }
  function handleNewMonster() {
    const id = saveNewDashboard('New 5e Monster/NPC', makeMonsterTemplateBlocks());
    window.location.href = `dashboard-sheet.html?id=${id}`;
  }

  // --- IMPORTS ---
  // Convert a parsed statblock ({ name, ac, hp, abilities, languages, spells, passivePerception, … })
  // into a simple set of blocks for the grid sheet.
  function blocksFromParsed(parsed) {
    const linesTop = [];
    if (parsed.ac != null) linesTop.push(`<b>AC</b> ${parsed.ac}`);
    if (parsed.hp != null) linesTop.push(`<b>HP</b> ${parsed.hp}`);
    if (parsed.speed) linesTop.push(`<b>Speed</b> ${parsed.speed}`);
    if (parsed.passivePerception != null) linesTop.push(`<b>PP</b> ${parsed.passivePerception}`);

    const abilities = parsed.abilities || {};
    const abilHtml = ['str','dex','con','int','wis','cha']
      .map(k => `<div style="display:inline-block;min-width:4ch;"><b>${k.toUpperCase()}</b> ${abilities[k] ?? '-'}</div>`)
      .join(' ');

    const langs = parsed.languages?.length ? parsed.languages.join(', ') : '';
    const spells = parsed.spells?.length ? `<b>Spells:</b> ${parsed.spells.join(', ')}` : '';

    return [
      { id: uid('b_'), type: 'text', x: 0, y: 0, w: 6, h: 2, html: `<h2>${parsed.name || 'Imported'}</h2><em>${parsed.type || ''}</em>` },
      { id: uid('b_'), type: 'text', x: 0, y: 2, w: 6, h: 2, html: linesTop.join(' • ') || '' },
      { id: uid('b_'), type: 'text', x: 0, y: 4, w: 6, h: 3, html: `<b>Abilities</b><br>${abilHtml}` },
      { id: uid('b_'), type: 'text', x: 0, y: 7, w: 6, h: 2, html: langs ? `<b>Languages:</b> ${langs}` : '<b>Languages</b>' },
      { id: uid('b_'), type: 'text', x: 0, y: 9, w: 6, h: 3, html: spells || '<b>Spells</b>' },
    ];
  }

  // JSON import (exported dashboards)
  async function importDashboardsFromFiles(fileList) {
    if (!fileList || !fileList.length) return;

    for (const file of fileList) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        const items = Array.isArray(data) ? data : [data];
        for (const raw of items) {
          // Accept either raw dashboards (with .blocks) or a plain parsed statblock object
          if (raw && Array.isArray(raw.blocks)) {
            const newId = `dash_${Date.now()}_${Math.floor(Math.random()*1e6)}`;
            const title = raw.title || file.name.replace(/\.json$/i,'') || 'Imported Dashboard';
            localStorage.setItem(newId, JSON.stringify({ id: newId, title, blocks: raw.blocks }));
            addDashboardRef(currentFolderId, newId, title);
          } else {
            // Treat as parsed statblock JSON -> build a sheet
            const title = raw?.name || file.name.replace(/\.json$/i,'') || 'Imported';
            const blocks = blocksFromParsed(raw || {});
            const id = saveNewDashboard(title, blocks);
            addDashboardRef(currentFolderId, id, title);
          }
        }
      } catch (err) {
        console.error('Import failed for', file?.name, err);
        alert(`Could not import "${file?.name}". Is it a valid JSON export?`);
      }
    }
    render();
  }

  // import from pasted text (uses the statblock importer module)
  async function importFromTextModal() {
    if (!importTextDialog) return;
    importTextArea.value = '';
    importTextDialog.showModal();
    const closeOn = (ev) => {
      if (ev.type === 'click' || ev.key === 'Escape') importTextDialog.close();
    };
    importTextDialog.addEventListener('click', (e) => (e.target === importTextDialog) && closeOn(e), { once: true });

    const onConfirm = async (e) => {
      e.preventDefault();
      const txt = importTextArea.value.trim();
      if (!txt) { importTextDialog.close(); return; }
      try {
        const mod = await import('./statblock-import.js'); // relative to /scripts
        const parsed = (await mod.importFromText(txt)) || {};
        const title  = parsed.name || 'Imported Creature';
        const blocks = blocksFromParsed(parsed);
        const id = saveNewDashboard(title, blocks);
        addDashboardRef(currentFolderId, id, title);
        render();
        importTextDialog.close();
        window.location.href = `dashboard-sheet.html?id=${id}`;
      } catch (err) {
        console.error(err);
        alert('Could not parse that text as a 5e statblock.');
      }
    };
    importTextConfirm.addEventListener('click', onConfirm, { once: true });
  }

  // import from PDF (via pdf.js + our importer)
  async function importFromPdfFile(file) {
    try {
      const mod = await import('./statblock-import.js');
      const parsed = await mod.importFromPDF(file); // expects pdfjsLib on window
      if (!parsed) throw new Error('No data parsed');
      const title  = parsed.name || (file && file.name?.replace(/\.pdf$/i,'') ) || 'Imported Creature';
      const blocks = blocksFromParsed(parsed);
      const id = saveNewDashboard(title, blocks);
      addDashboardRef(currentFolderId, id, title);
      render();
      window.location.href = `dashboard-sheet.html?id=${id}`;
    } catch (err) {
      console.error(err);
      alert(`Could not import PDF "${file?.name}".`);
    }
  }

  // --- wiring ---
  newDashboardBtn?.addEventListener('click', handleNewDashboard);
  newFolderBtn?.addEventListener('click', () => {
    const name = prompt('Enter folder name:', 'New Folder');
    if (name) addFolder(currentFolderId, name);
  });
  sortBtn?.addEventListener('click', () => {
    const found = findNodeById(tree, currentFolderId);
    if (!found || found.node.type !== 'folder') return;
    found.node.children.sort((a, b) => {
      const an = a.type === 'folder' ? (a.name || '') : (a.title || '');
      const bn = b.type === 'folder' ? (b.name || '') : (b.title || '');
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return an.localeCompare(bn);
    });
    saveTree(tree);
    render();
  });

  // EXISTING JSON import button (kept)
  importBtn?.addEventListener('click', () => importInput?.click());
  importInput?.addEventListener('change', (e) => {
    importDashboardsFromFiles(e.target.files).then(() => e.target.value = '');
  });

  // NEW: template buttons
  newCharBtn?.addEventListener('click', handleNewChar);
  newMonsterBtn?.addEventListener('click', handleNewMonster);

  // NEW: text + PDF imports
  importTextBtn?.addEventListener('click', importFromTextModal);
  importPdfInput?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (f) await importFromPdfFile(f);
    e.target.value = '';
  });

  render();
});
