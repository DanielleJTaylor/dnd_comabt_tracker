// scripts/players.js
(() => {
  const LS_KEY = 'dnd_players_v1';

  const uid = () => `${Date.now()}-${Math.floor(Math.random()*1e6)}`;

  function loadPlayers() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  function savePlayers(players) {
    localStorage.setItem(LS_KEY, JSON.stringify(players || []));
  }
  function getPlayersMap() {
    const map = new Map();
    loadPlayers().forEach(p => map.set(p.id, p));
    return map;
  }

  function addPlayer(data) {
    const p = {
      id: uid(),
      name: data?.name?.trim() || 'New PC',
      className: data?.className?.trim() || '',
      ac: Number(data?.ac) || 10,
      passivePerception: Number(data?.passivePerception) || 10,
      passiveInvestigation: Number(data?.passiveInvestigation) || 10,
      passiveInsight: Number(data?.passiveInsight) || 10,
      imageUrl: data?.imageUrl || ''
    };
    const list = loadPlayers();
    list.push(p);
    savePlayers(list);
    return p;
  }

  function updatePlayer(id, patch) {
    const list = loadPlayers();
    const idx = list.findIndex(p => p.id === id);
    if (idx < 0) return false;
    Object.assign(list[idx], patch || {});
    savePlayers(list);
    return true;
  }

  function deletePlayer(id) {
    const list = loadPlayers().filter(p => p.id !== id);
    savePlayers(list);
  }

  // Add a PC as a combatant by spawning a default then patching it
  function addCombatantFromPlayer(pc) {
    if (!window.CombatState || !window.CombatAPI) return;
    const beforeIds = new Set(
      window.CombatAPI.getAllCombatants()
        .filter(x => x.type === 'combatant')
        .map(x => x.id)
    );
    window.CombatState.addCombatant(); // creates a default combatant
    const after = window.CombatAPI.getAllCombatants();
    const fresh = [...after].reverse().find(x => x.type === 'combatant' && !beforeIds.has(x.id));
    if (!fresh) return;

    window.CombatState.updateCombatant(fresh.id, {
      name: pc.name,
      ac: pc.ac,
      role: 'pc',
      imageUrl: pc.imageUrl || '',
      // you can preset an init if you store one on the PC later
    });
  }

  // Mounts a compact "PC quick add" control into .button-group (encounter.html header)
  function mountPCQuickAdd() {
    const controls = document.querySelector('.button-group');
    if (!controls) return;

    const wrap = document.createElement('div');
    wrap.style.display = 'inline-flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '.25rem';
    wrap.style.marginLeft = '8px';

    wrap.innerHTML = `
      <label style="font-weight:600;">PC:</label>
      <select id="pc-quick-select" style="min-width:180px; padding:.25rem .4rem;"></select>
      <button id="pc-quick-add" class="btn">➕ Add PC</button>
    `;
    controls.appendChild(wrap);

    const select = wrap.querySelector('#pc-quick-select');
    const addBtn = wrap.querySelector('#pc-quick-add');

    function refreshOptions() {
      const players = loadPlayers();
      if (!players.length) {
        select.innerHTML = `<option value="">(no players saved)</option>`;
        addBtn.disabled = true;
        return;
      }
      addBtn.disabled = false;
      select.innerHTML = players.map(p =>
        `<option value="${p.id}">${p.name} — AC ${p.ac}${p.className ? ' ('+p.className+')' : ''}</option>`
      ).join('');
    }
    refreshOptions();

    addBtn.addEventListener('click', () => {
      const id = select.value;
      if (!id) return;
      const map = getPlayersMap();
      const pc = map.get(id);
      if (pc) addCombatantFromPlayer(pc);
    });

    // Expose for page that edits players
    window.refreshPCQuickAdd = refreshOptions;
  }

  // Expose an API for the players page/editor and the tracker
  window.PlayerStore = {
    loadPlayers, savePlayers, getPlayersMap,
    addPlayer, updatePlayer, deletePlayer,
    addCombatantFromPlayer,
    mountPCQuickAdd
  };
})();
