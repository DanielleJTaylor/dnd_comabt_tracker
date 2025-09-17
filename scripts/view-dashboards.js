// scripts/view-dashboards.js
(() => {
  'use strict';

  // ---------- DOM ----------
  const dashboardListContainer = document.getElementById('dashboard-list-container');

  // core buttons
  const newDashboardBtn = document.getElementById('newDashboardBtn');
  const newFolderBtn    = document.getElementById('newFolderBtn');
  const sortBtn         = document.getElementById('sortBtn');

  // import JSON (existing)
  const importBtn   = document.getElementById('importBtn');
  const importInput = document.getElementById('importInput');

  // new controls in the header
  const newCharBtn     = document.getElementById('newCharBtn');
  const newMonsterBtn  = document.getElementById('newMonsterBtn');
  const importTextBtn  = document.getElementById('importTextBtn');
  const importPdfInput = document.getElementById('importPdfInput');

  // text modal bits
  const importTextDialog  = document.getElementById('importTextDialog');
  const importTextArea    = document.getElementById('importTextArea');
  const importTextConfirm = document.getElementById('importTextConfirm');

  // nav & breadcrumbs
  const breadcrumbsEl = document.getElementById('dash-breadcrumbs');
  const upFolderBtn   = document.getElementById('up-folder-btn');

  // ---------- storage keys ----------
  const TREE_KEY = 'dash_tree_v1';
  const CUR_FOLDER_KEY = 'dash_current_folder';
  const DND_MIME = 'application/x-dash-node';

  // ---------- utils ----------
  const uid = (p = 'id_') => `${p}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  function escapeHtml(s = '') {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------- dashboards store helpers ----------
  // Each dashboard saved at key = its id; value = { id, title, blocks: [] }
  function saveDashboardObject(obj) {
    localStorage.setItem(obj.id, JSON.stringify(obj));
  }
  function loadDashboardObject(id) {
    try { return JSON.parse(localStorage.getItem(id) || 'null'); } catch { return null; }
  }
  function deleteDashboardObject(id) {
    localStorage.removeItem(id);
  }

  // ---------- folder tree helpers ----------
  function loadTree() {
    try { return JSON.parse(localStorage.getItem(TREE_KEY) || 'null'); } catch { return null; }
  }
  function saveTree(tree) { localStorage.setItem(TREE_KEY, JSON.stringify(tree)); }

  function ensureTree() {
    let t = loadTree();
    if (!t) {
      t = { id: 'root', type: 'folder', name: 'Dashboards', children: [] };

      // Seed any stray dashboards found in localStorage (one-time convenience)
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('dash_')) {
          try {
            const dash = JSON.parse(localStorage.getItem(k));
            if (dash && dash.id) {
              t.children.push({ id: dash.id, type: 'dashboard', title: dash.title || 'Untitled Dashboard' });
            }
          } catch {}
        }
      }
      saveTree(t);
    }
    return t;
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

  function findParentOf(root, childId) {
    if (root.type !== 'folder' || !Array.isArray(root.children)) return null;
    for (const c of root.children) {
      if (c.id === childId) return root;
      if (c.type === 'folder') {
        const deep = findParentOf(c, childId);
        if (deep) return deep;
      }
    }
    return null;
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

  function isAncestor(ancestorId, nodeId) {
    if (ancestorId === nodeId) return true;
    const info = findNodeById(tree, nodeId);
    if (!info) return false;
    return info.path.some(p => p.id === ancestorId);
  }

  function moveNode(nodeId, destFolderId) {
    const destInfo = findNodeById(tree, destFolderId);
    if (!destInfo || destInfo.node.type !== 'folder') return false;
    if (isAncestor(nodeId, destFolderId)) return false; // can't move folder under itself/descendant

    const parent = findParentOf(tree, nodeId);
    if (!parent) return false;

    const idx = parent.children.findIndex(c => c.id === nodeId);
    if (idx < 0) return false;

    const [moved] = parent.children.splice(idx, 1);
    destInfo.node.children.push(moved);
    saveTree(tree);
    return true;
  }

  function collectDashboardIds(node, out = []) {
    if (!node) return out;
    if (node.type === 'dashboard') out.push(node.id);
    if (node.type === 'folder' && Array.isArray(node.children)) {
      node.children.forEach(child => collectDashboardIds(child, out));
    }
    return out;
  }

  function getInitialFolderId() {
    const url = new URLSearchParams(location.search).get('folder');
    if (url) return url;
    return localStorage.getItem(CUR_FOLDER_KEY) || 'root';
  }

  let tree = ensureTree();
  let currentFolderId = getInitialFolderId();

  function setCurrentFolder(id) {
    currentFolderId = id || 'root';
    localStorage.setItem(CUR_FOLDER_KEY, currentFolderId);

    const u = new URL(location.href);
    if (currentFolderId === 'root') u.searchParams.delete('folder');
    else u.searchParams.set('folder', currentFolderId);
    history.replaceState(null, '', u);

    render();
  }

  // ---------- card DnD helpers ----------
  let dndCurrent = null;
  let wasDragging = false;

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
      const payload = dndCurrent || (() => { try { return JSON.parse(e.dataTransfer.getData(DND_MIME)); } catch { return null; } })();
      if (payload && canDrop(payload, folderNode)) {
        if (moveNode(payload.id, folderNode.id)) render();
      }
    });
  }

  // ---------- templates ----------
  // quick helper (uses x/y/w/h; dashboard-sheet.js normalizes these)
  function block(x, y, w, h, html) {
    return { id: uid('b_'), type: 'text', x, y, w, h, html };
  }

  // Character (simple starter template)
  function makeCharacterTemplateBlocks() {
    return [
      block(0, 0, 12, 2, '<h2>Character Name</h2><em>“A character quote.”</em>'),
      block(0, 2, 6, 5, '<div style="border:2px dashed #b8a382;border-radius:8px;padding:1rem;text-align:center;color:#7c6a50;background:#fff">Portrait</div>'),
      block(6, 2, 6, 5, '<b>Level</b> — <b>Class</b> — <b>Background</b><br><b>Race</b> — <b>Alignment</b><br><b>Armor</b> — <b>Weapons</b><br><b>Languages</b>'),
      block(0, 7, 4, 3, '<b>AC</b><div style="font-size:2rem;">10</div>'),
      block(4, 7, 4, 3, '<b>HP</b><div>Max: 10<br>Current: 10<br>Temp: 0</div>'),
      block(8, 7, 4, 3, '<b>Death Saves</b>'),
      block(0, 10, 12, 4, '<b>Ability Scores</b><br>STR DEX CON INT WIS CHA'),
    ];
  }

  // Monster/NPC template (portrait top-left, tight layout; no big gaps)
  function makeMonsterTemplateBlocks() {
    const css = `
    <style>
      .ob2 .card{border:1px solid #cdb89a;border-radius:8px;background:#fff;padding:.6rem .8rem;line-height:1.35}
      .ob2 .hdr{border:2px solid #7b5b30;border-radius:8px;background:#fff;padding:.55rem .9rem;margin:0 0 .25rem}
      .ob2 .name{font-weight:800;font-size:1.25rem}
      .ob2 .meta{opacity:.8}
      .ob2 .sec{font-weight:800;border-bottom:2px solid #ccb391;margin:.25rem 0 .5rem;padding-bottom:.2rem}
      .ob2 .row{display:flex;flex-wrap:wrap;gap:.5rem}
      .ob2 .pill{padding:.2rem .45rem;border:1px solid #cdb89a;border-radius:6px;background:#fdf7eb;white-space:nowrap}
      .ob2 table{width:100%;border-collapse:separate;border-spacing:.25rem}
      .ob2 th,.ob2 td{border:1px solid #cdb89a;border-radius:6px;background:#fff;padding:.35rem .55rem;text-align:center}
      .ob2 th{background:#f4ead6;font-weight:700}
      .ob2 .portrait{border:2px dashed #b8a382;border-radius:8px;height:100%;display:grid;place-items:center;background:#fff;color:#7c6a50}
    </style>`;

    return [
      block(0, 0, 4, 4, `<div class="ob2"><div class="portrait">Portrait / Token</div></div>`),

      block(4, 0, 8, 2, `<div class="ob2">${css}
        <div class="hdr">
          <div class="name">Monster / NPC Name</div>
          <div class="meta">Medium humanoid (any), any alignment</div>
        </div>
      </div>`),

      block(4, 2, 8, 2, `<div class="ob2 card"><div class="row">
        <span class="pill"><b>AC</b> 13</span>
        <span class="pill"><b>HP</b> 22 (5d8)</span>
        <span class="pill"><b>Speed</b> 30 ft.</span>
        <span class="pill"><b>PP</b> 12</span>
      </div></div>`),

      block(0, 4, 6, 6, `<div class="ob2 card">
        <div class="sec">Ability Scores</div>
        <table>
          <tr><th>STR</th><th>DEX</th><th>CON</th><th>INT</th><th>WIS</th><th>CHA</th></tr>
          <tr><td>10</td><td>10</td><td>10</td><td>10</td><td>10</td><td>10</td></tr>
        </table>
      </div>`),

      block(6, 4, 6, 6, `<div class="ob2 card">
        <div class="sec">Stat Summary</div>
        <div><b>Saves</b> —</div>
        <div><b>Skills</b> —</div>
        <div><b>Resistances</b> —</div>
        <div><b>Immunities</b> —</div>
        <div><b>Senses</b> passive Perception 12</div>
        <div><b>Languages</b> Common</div>
        <div><b>Challenge</b> 1 (200 XP)</div>
      </div>`),

      block(0, 10, 12, 5, `<div class="ob2 card">
        <div class="sec">Actions</div>
        <div><b>Shortsword.</b> Melee Weapon Attack: +4 to hit …</div>
        <div><b>Shortbow.</b> Ranged Weapon Attack: +4 to hit …</div>
      </div>`),

      block(0, 15, 12, 3, `<div class="ob2 card"><div class="sec">Bonus Actions</div>—</div>`),
      block(0, 18, 12, 3, `<div class="ob2 card"><div class="sec">Reactions</div>—</div>`),
      block(0, 21, 12, 3, `<div class="ob2 card"><div class="sec">Legendary Actions</div>—</div>`),
    ];
  }

  // ---------- create / save ----------
  function addDashboardRef(parentFolderId, dashId, title) {
    const info = findNodeById(tree, parentFolderId);
    if (!info || info.node.type !== 'folder') return;
    if (!info.node.children.some(c => c.id === dashId)) {
      info.node.children.push({ id: dashId, type: 'dashboard', title });
      saveTree(tree);
    }
  }

  function saveNewDashboard(title, blocks) {
    const id = `dash_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    saveDashboardObject({ id, title, blocks: blocks || [] });
    addDashboardRef(currentFolderId, id, title);
    return id;
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

  // ---------- imports ----------
  // Convert parsed statblock -> simple layout (portrait top-left + compact)
  function blocksFromParsed(parsed) {
    const pills = [];
    if (parsed.ac != null)  pills.push(`<b>AC</b> ${parsed.ac}`);
    if (parsed.hp != null)  pills.push(`<b>HP</b> ${parsed.hp}`);
    if (parsed.speed)       pills.push(`<b>Speed</b> ${escapeHtml(parsed.speed)}`);
    if (parsed.passivePerception != null) pills.push(`<b>PP</b> ${parsed.passivePerception}`);

    const abilities = parsed.abilities || {};
    const abilRow = ['str','dex','con','int','wis','cha']
      .map(k => `<td>${abilities[k] ?? '-'}</td>`).join('');

    const name = escapeHtml(parsed.name || 'Imported');
    const type = escapeHtml(parsed.type || '');
    const langs = parsed.languages?.length ? parsed.languages.join(', ') : '—';

    const cssLite = `
    <style>
      .imp .card{border:1px solid #cdb89a;border-radius:8px;background:#fff;padding:.6rem .8rem}
      .imp .row{display:flex;flex-wrap:wrap;gap:.5rem}
      .imp .pill{padding:.2rem .45rem;border:1px solid #cdb89a;border-radius:6px;background:#fdf7eb;white-space:nowrap}
      .imp table{width:100%;border-collapse:separate;border-spacing:.25rem}
      .imp th,.imp td{border:1px solid #cdb89a;border-radius:6px;background:#fff;padding:.35rem .55rem;text-align:center}
      .imp th{background:#f4ead6;font-weight:700}
      .imp .hdr{border:2px solid #7b5b30;border-radius:8px;background:#fff;padding:.55rem .9rem;margin:0 0 .25rem}
    </style>`;

    return [
      block(0, 0, 4, 4, `<div class="imp"><div class="card" style="display:grid;place-items:center;height:100%;border-style:dashed;color:#7c6a50">Portrait / Token</div></div>`),
      block(4, 0, 8, 2, `<div class="imp">${cssLite}<div class="hdr"><div style="font-weight:800;font-size:1.25rem">${name}</div><div style="opacity:.8">${type}</div></div></div>`),
      block(4, 2, 8, 2, `<div class="imp card"><div class="row">${pills.map(p => `<span class="pill">${p}</span>`).join('')}</div></div>`),
      block(0, 4, 6, 6, `<div class="imp card"><div style="font-weight:800;border-bottom:2px solid #ccb391;margin:.25rem 0 .5rem;padding-bottom:.2rem">Ability Scores</div>
        <table><tr><th>STR</th><th>DEX</th><th>CON</th><th>INT</th><th>WIS</th><th>CHA</th></tr><tr>${abilRow}</tr></table></div>`),
      block(6, 4, 6, 6, `<div class="imp card"><div style="font-weight:800;border-bottom:2px solid #ccb391;margin:.25rem 0 .5rem;padding-bottom:.2rem">Stat Summary</div>
        <div><b>Languages</b> ${escapeHtml(langs)}</div></div>`),
      block(0, 10, 12, 5, `<div class="imp card"><div style="font-weight:800;border-bottom:2px solid #ccb391;margin:.25rem 0 .5rem;padding-bottom:.2rem">Actions</div>—</div>`),
    ];
  }

  // JSON import (one or many dashboards, or a plain parsed statblock JSON)
  async function importDashboardsFromFiles(fileList) {
    if (!fileList || !fileList.length) return;

    for (const file of fileList) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const items = Array.isArray(data) ? data : [data];

        for (const raw of items) {
          if (raw && Array.isArray(raw.blocks)) {
            const newId = `dash_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
            const title = raw.title || file.name.replace(/\.json$/i, '') || 'Imported Dashboard';
            saveDashboardObject({ id: newId, title, blocks: raw.blocks });
            addDashboardRef(currentFolderId, newId, title);
          } else {
            const title  = raw?.name || file.name.replace(/\.json$/i, '') || 'Imported';
            const blocks = blocksFromParsed(raw || {});
            const id     = saveNewDashboard(title, blocks);
            addDashboardRef(currentFolderId, id, title);
          }
        }
      } catch (err) {
        console.error('Import JSON failed for', file?.name, err);
        alert(`Could not import "${file?.name}". Is it valid JSON?`);
      }
    }
    render();
  }

  // Import via pasted text
  async function importFromTextModal() {
    if (!importTextDialog) return;
    importTextArea.value = '';
    importTextDialog.showModal();
    const closeOn = (ev) => { if (ev.type === 'click' || ev.key === 'Escape') importTextDialog.close(); };
    importTextDialog.addEventListener('click', (e) => (e.target === importTextDialog) && closeOn(e), { once: true });

    const onConfirm = async (e) => {
      e.preventDefault();
      const txt = importTextArea.value.trim();
      if (!txt) { importTextDialog.close(); return; }
      try {
        // IMPORTANT: path is relative to /scripts/
        const mod = await import('../statblock-import.js');
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

  // Import PDF (requires pdfjsLib present on window via <script> in HTML)
  async function importFromPdfFile(file) {
    try {
      // IMPORTANT: path is relative to /scripts/
      const mod = await import('../statblock-import.js');
      const parsed = await mod.importFromPDF(file);
      if (!parsed) throw new Error('No data parsed from PDF');

      const title  = parsed.name || (file && file.name?.replace(/\.pdf$/i, '')) || 'Imported Creature';
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

  // ---------- rendering ----------
  function renderBreadcrumbs(path, current) {
    breadcrumbsEl.innerHTML = '';
    const chain = [{ id: 'root', name: 'Dashboards' },
                   ...path.map(n => ({ id: n.id, name: n.name })),
                   ...(current && current.id !== 'root' ? [{ id: current.id, name: current.name }] : [])];

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
    const card = document.createElement('div');
    card.className = 'folder-card';
    card.innerHTML = `
      <div class="card-header">📁 ${escapeHtml(node.name || 'Folder')}</div>
      <div class="card-body">${(node.children?.length || 0)} item(s)</div>
      <div class="card-actions">
        <button class="icon-btn danger" title="Delete Folder" data-act="delete-folder">🗑</button>
      </div>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-actions')) return;
      if (wasDragging) return;
      setCurrentFolder(node.id);
    });

    // delete
    card.querySelector('[data-act="delete-folder"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const count = collectDashboardIds(node).length;
      const msg = count
        ? `Delete folder "${node.name}" and ${count} dashboard(s) inside? This cannot be undone.`
        : `Delete folder "${node.name}"?`;
      if (!confirm(msg)) return;

      collectDashboardIds(node).forEach(id => deleteDashboardObject(id));
      const ok = removeNodeById(tree, node.id);
      if (ok) saveTree(tree);
      render();
    });

    makeDraggableCard(card, node);
    makeFolderDroppable(card, node);
    return card;
  }

  function createDashboardCard(node) {
    const card = document.createElement('a');
    card.className = 'dashboard-card';
    card.href = `dashboard-sheet.html?id=${encodeURIComponent(node.id)}`;
    card.innerHTML = `
      <div class="card-header">📄 ${escapeHtml(node.title || 'Untitled Dashboard')}</div>
      <div class="card-body">Click to open this dashboard.</div>
      <div class="card-actions">
        <button class="icon-btn danger" title="Delete Dashboard" data-act="delete-dash">🗑</button>
      </div>
    `;

    // delete
    card.querySelector('[data-act="delete-dash"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm(`Delete dashboard "${node.title || 'Untitled'}"? This cannot be undone.`)) return;
      deleteDashboardObject(node.id);
      const parent = findParentOf(tree, node.id);
      if (parent) {
        const idx = parent.children.findIndex(c => c.id === node.id);
        if (idx >= 0) parent.children.splice(idx, 1);
        saveTree(tree);
      }
      render();
    });

    makeDraggableCard(card, node);
    return card;
  }

  function render() {
    const found = findNodeById(tree, currentFolderId) || findNodeById(tree, 'root');
    const folder = found?.node?.type === 'folder' ? found.node : tree;
    const path   = found?.path || [];

    renderBreadcrumbs(path, folder);

    if (upFolderBtn) {
      if (folder.id !== 'root') {
        upFolderBtn.style.display = 'inline-flex';
        const parentId = path.length ? path[path.length - 1].id : 'root';
        upFolderBtn.onclick = () => setCurrentFolder(parentId);
      } else {
        upFolderBtn.style.display = 'none';
      }
    }

    dashboardListContainer.innerHTML = '';

    const children = (folder.children || []).map(child => findNodeById(tree, child.id)?.node || child);
    const folders  = children.filter(n => n.type === 'folder').sort((a, b) => (a.name  || '').localeCompare(b.name  || ''));
    const dashes   = children.filter(n => n.type === 'dashboard').sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    if (!folders.length && !dashes.length) {
      dashboardListContainer.innerHTML = '<p style="padding:1rem; color:#666;">This folder is empty.</p>';
    } else {
      folders.forEach(f => dashboardListContainer.appendChild(createFolderCard(f)));
      dashes.forEach(d  => dashboardListContainer.appendChild(createDashboardCard(d)));
    }

    makeFolderDroppable(dashboardListContainer, folder);
  }

  // ---------- wiring ----------
  newDashboardBtn?.addEventListener('click', handleNewDashboard);

  newFolderBtn?.addEventListener('click', () => {
    const name = prompt('Enter folder name:', 'New Folder');
    if (!name) return;
    const info = findNodeById(tree, currentFolderId);
    const parent = info?.node?.type === 'folder' ? info.node : tree;
    parent.children.push({ id: uid('fld_'), type: 'folder', name: name.trim(), children: [] });
    saveTree(tree);
    render();
  });

  sortBtn?.addEventListener('click', () => {
    const info = findNodeById(tree, currentFolderId);
    if (!info || info.node.type !== 'folder') return;
    info.node.children.sort((a, b) => {
      const an = a.type === 'folder' ? (a.name || '')  : (a.title || '');
      const bn = b.type === 'folder' ? (b.name || '')  : (b.title || '');
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return an.localeCompare(bn);
    });
    saveTree(tree);
    render();
  });

  // JSON import
  importBtn?.addEventListener('click', () => importInput?.click());
  importInput?.addEventListener('change', (e) => {
    importDashboardsFromFiles(e.target.files).then(() => e.target.value = '');
  });

  // templates
  newCharBtn?.addEventListener('click', handleNewChar);
  newMonsterBtn?.addEventListener('click', handleNewMonster);

  // text & PDF imports
  importTextBtn?.addEventListener('click', importFromTextModal);
  importPdfInput?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (f) await importFromPdfFile(f);
    e.target.value = '';
  });

  // ---------- initial render ----------
  render();
})();
