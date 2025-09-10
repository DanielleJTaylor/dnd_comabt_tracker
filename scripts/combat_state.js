// scripts/combat_state.js
(() => {
  // ---------- Core State ----------
  let combatants = [];                 // groups + combatants
  let selectedCombatantIds = new Set();
  let isLocked = false;

  let currentRound = 1;
  let turnPtr = 0;

  // ---------- Group Color Palette (up to 9) ----------
  // red, orange, yellow, green, blue, pink, purple, brown, gray
  // Order: red, orange, yellow, green, blue, pink, purple, brown, gray
  const GROUP_COLORS = [
    { base: '#f28b82', member: '#f7a199', text: '#222' }, // red
    { base: '#ff9800', member: '#ffb74d', text: '#222' }, // orange (deeper amber)
    { base: '#fff176', member: '#fff59d', text: '#222' }, // yellow (paler pastel)
    { base: '#81c995', member: '#a5d6a7', text: '#222' }, // green
    { base: '#64b5f6', member: '#90caf9', text: '#222' }, // blue (slightly stronger)
    { base: '#f48fb1', member: '#f8bbd0', text: '#222' }, // pink
    { base: '#ba68c8', member: '#ce93d8', text: '#222' }, // purple
    { base: '#a1887f', member: '#bcaaa4', text: '#222' }, // brown
    { base: '#9e9e9e', member: '#bdbdbd', text: '#222' }  // gray
  ];


  let _nextColorIdx = 0;

  // ---------- Utilities ----------
  const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  function forEachItem(cb) {
    for (const item of combatants) {
      if (item.type === 'combatant') cb(item);
      if (item.type === 'group') {
        cb(item);
        (item.members || []).forEach(cb);
      }
    }
  }
  function isNameTaken(name, excludeId = null) {
    const t = String(name || '').trim().toLowerCase();
    if (!t) return false;
    let taken = false;
    forEachItem((it) => {
      if (it.id === excludeId) return;
      const n = String(it.name || '').trim().toLowerCase();
      if (n && n === t) taken = true;
    });
    return taken;
  }
  function collectAllNamesLower() {
    const set = new Set();
    forEachItem((it) => { const n = (it.name || '').trim().toLowerCase(); if (n) set.add(n); });
    return set;
  }
  function generateUniqueName(base = 'Combatant') {
    const names = collectAllNamesLower();
    const b = String(base).trim() || 'Item';
    const lb = b.toLowerCase();
    if (!names.has(lb)) return b;
    let i = 2;
    while (names.has(`${lb} ${i}`)) i++;
    return `${b} ${i}`;
  }
  function findEntity(id, parent = null, list = combatants) {
    for (const item of list) {
      if (item.id === id) return { item, parent, list };
      if (item.type === 'group' && item.members) {
        const found = findEntity(id, item, item.members);
        if (found.item) return found;
      }
    }
    return { item: null, parent: null, list: null };
  }
  function allGroups() { return combatants.filter(c => c.type === 'group'); }
  function countAllCombatants() {
    let n = 0;
    for (const i of combatants) {
      if (i.type === 'combatant') n++;
      if (i.type === 'group') n += (i.members?.length || 0);
    }
    return n;
  }

  function ensureGroupColorIdx(g) {
    if (typeof g.colorIdx === 'number') return g.colorIdx;
    const idx = _nextColorIdx % GROUP_COLORS.length;
    _nextColorIdx++;
    g.colorIdx = idx;
    return idx;
  }

  // ---------- Round / Turn ----------
  function getTurnOrderIds() {
    const ids = [];
    combatants.forEach(item => {
      if (item.type === 'combatant') ids.push(item.id);
      else if (item.type === 'group') (item.members || []).forEach(m => ids.push(m.id));
    });
    return ids;
  }
  function clampTurnPtr() {
    const order = getTurnOrderIds();
    if (order.length === 0) { turnPtr = 0; return; }
    if (turnPtr < 0) turnPtr = 0;
    if (turnPtr >= order.length) turnPtr = order.length - 1;
  }
  function nextTurn() {
    const order = getTurnOrderIds();
    if (order.length === 0) return;
    turnPtr++;
    if (turnPtr >= order.length) { turnPtr = 0; currentRound += 1; }
    notify();
  }
  function prevTurn() {
    const order = getTurnOrderIds();
    if (order.length === 0) return;
    turnPtr--;
    if (turnPtr < 0) {
      turnPtr = Math.max(0, order.length - 1);
      if (currentRound > 1) currentRound -= 1;
    }
    notify();
  }

  // ---------- Mutations ----------
  function addDefaultCombatant() {
    const name = generateUniqueName(`Combatant ${countAllCombatants() + 1}`);
    const c = { id: uid(), type: 'combatant', name,
      init: 10, ac: 10, hp: 10, maxHp: 10, tempHp: 0,
      role: 'dm', imageUrl: '', dashboardId: null, conditions: [] };
    combatants.push(c);
    notify();
  }
  function addGroupByName(name) {
    const safe = generateUniqueName(name || 'New Group');
    const colorIdx = _nextColorIdx % GROUP_COLORS.length; _nextColorIdx++;
    const group = { id: uid(), type: 'group', name: safe, init: undefined, members: [], colorIdx };
    combatants.push(group);
    notify();
    return group;
  }
  function groupDisplayInit(group) {
    return Number.isFinite(group?.init) ? String(group.init) : '—';
  }
  function updateCombatant(id, patch) {
    const { item } = findEntity(id);
    if (!item || item.type !== 'combatant') return false;
    if ('name' in patch) {
      const proposed = String(patch.name || '').trim();
      if (!proposed) return false;
      if (isNameTaken(proposed, id)) return false;
    }
    Object.assign(item, patch); notify(); return true;
  }
  function updateGroup(id, patch) {
    const { item } = findEntity(id);
    if (!item || item.type !== 'group') return false;
    if ('name' in patch) {
      const proposed = String(patch.name || '').trim();
      if (!proposed) return false;
      if (isNameTaken(proposed, id)) return false;
    }
    if ('init' in patch && patch.init !== undefined) {
      const p = Number(patch.init);
      patch.init = Number.isFinite(p) ? p : undefined;
    }
    Object.assign(item, patch); notify(); return true;
  }
  function removeSelectedEverywhereCollect() {
    const collected = [];
    combatants = combatants.filter(item => {
      if (item.type === 'combatant' && selectedCombatantIds.has(item.id)) { collected.push(item); return false; }
      return true;
    });
    combatants.forEach(group => {
      if (group.type === 'group') {
        group.members = group.members.filter(m => {
          if (selectedCombatantIds.has(m.id)) { collected.push(m); return false; }
          return true;
        });
      }
    });
    return collected;
  }
  function moveSelectedToGroup(targetGroupId) {
    if (selectedCombatantIds.size === 0) return false;
    const { item: targetGroup } = findEntity(targetGroupId);
    if (!targetGroup || targetGroup.type !== 'group') return false;
    const moving = removeSelectedEverywhereCollect();
    if (!moving.length) return false;
    targetGroup.members.push(...moving);
    selectedCombatantIds.clear();
    notify(); return true;
  }
  function ungroupSelected() {
    const toUngroup = [];
    combatants.forEach(g => {
      if (g.type === 'group') {
        g.members = g.members.filter(m => {
          if (selectedCombatantIds.has(m.id)) { toUngroup.push(m); return false; }
          return true;
        });
      }
    });
    if (toUngroup.length) {
      combatants.push(...toUngroup);
      selectedCombatantIds.clear();
      notify();
    }
  }
  function deleteSelected() {
    combatants = combatants.filter(c => !(c.type === 'combatant' && selectedCombatantIds.has(c.id)));
    combatants.forEach(g => { if (g.type === 'group') g.members = g.members.filter(m => !selectedCombatantIds.has(m.id)); });
    selectedCombatantIds.clear();
    notify();
  }

  // Sorting helpers
  function splitNameForSort(name) {
    const trimmed = String(name || '').trim();
    const m = trimmed.match(/^(.*?)(?:\s+(\d+))?$/);
    const base = (m?.[1] || '').toLowerCase();
    const num = m?.[2] ? parseInt(m[2], 10) : null;
    return { base, num };
  }
  function compareNames(aName, bName, alphaDir = 'asc') {
    const A = splitNameForSort(aName);
    const B = splitNameForSort(bName);
    if (A.base !== B.base) return alphaDir === 'asc' ? A.base.localeCompare(B.base) : B.base.localeCompare(A.base);
    const aNum = A.num == null ? Number.POSITIVE_INFINITY : A.num;
    const bNum = B.num == null ? Number.POSITIVE_INFINITY : B.num;
    if (aNum !== bNum) return aNum - bNum;
    return String(aName || '').localeCompare(String(bName || ''));
  }
  function sortByInit(direction = 'desc') {
    const dir = direction === 'asc' ? 'asc' : 'desc';
    const alphaDir = dir === 'desc' ? 'asc' : 'desc';
    const getInit = (item) => {
      if (item.type === 'group') return Number.isFinite(item.init) ? item.init : Number.NEGATIVE_INFINITY;
      return Number.isFinite(Number(item.init)) ? Number(item.init) : Number.NEGATIVE_INFINITY;
    };
    const getName = (item) => (item.name || '');

    const currentOrderBefore = getTurnOrderIds();
    const curId = currentOrderBefore[turnPtr];

    combatants.sort((a, b) => {
      const ai = getInit(a);
      const bi = getInit(b);
      if (ai !== bi) return dir === 'asc' ? ai - bi : bi - ai;
      return compareNames(getName(a), getName(b), alphaDir);
    });

    notify();

    if (curId) {
      const newOrder = getTurnOrderIds();
      const idx = newOrder.indexOf(curId);
      if (idx >= 0) turnPtr = idx;
    }
  }

  // ---------- Conditions ----------
  const CONDITION_LIST = [
    'Blinded','Charmed','Deafened','Frightened','Grappled','Incapacitated',
    'Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained',
    'Stunned','Unconscious','Concentrating'
  ];
  function ensureConditionsArray(c) { if (!Array.isArray(c.conditions)) c.conditions = []; return c.conditions; }
  function isConditionActive(cond, round) { return round >= cond.startRound && round <= cond.endRound; }
  function addConditionToCombatant(id, name, durationRounds = 1, note = '') {
    const { item } = findEntity(id);
    if (!item || item.type !== 'combatant') return false;
    const dur = Math.max(1, parseInt(durationRounds, 10) || 1);
    ensureConditionsArray(item).push({
      id: `cond_${uid()}`, name: String(name || '').trim() || 'Condition',
      note: String(note || ''), startRound: currentRound, endRound: currentRound + dur - 1
    });
    notify(); return true;
  }
  function removeCondition(id, condId) {
    const { item } = findEntity(id);
    if (!item || item.type !== 'combatant') return false;
    item.conditions = (item.conditions || []).filter(c => c.id !== condId);
    notify(); return true;
  }

  // ---------- Observer ----------
  const listeners = new Set();
  function getSnapshot() {
    return { combatants, selectedCombatantIds, isLocked, currentRound, turnPtr, GROUP_COLORS };
  }
  function notify() { clampTurnPtr(); listeners.forEach(fn => fn(getSnapshot())); }

  // ---------- Public API ----------
  window.CombatState = {
    // observe
    subscribe(fn) { listeners.add(fn); fn(getSnapshot()); return () => listeners.delete(fn); },

    // queries
    getSnapshot,
    getTurnOrderIds,
    ensureGroupColorIdx,
    getGroupColors: () => GROUP_COLORS,

    // selection / locking
    isLocked: () => isLocked,
    setLocked(v) { isLocked = !!v; notify(); },
    getSelectedIds: () => new Set(selectedCombatantIds),
    setSelectedIds(ids) { selectedCombatantIds = new Set(ids); notify(); },
    clearSelection() { selectedCombatantIds.clear(); notify(); },

    // data ops
    addCombatant: addDefaultCombatant,
    addGroupByName,
    updateCombatant, updateGroup,
    moveSelectedToGroup, ungroupSelected, deleteSelected,
    sortByInit,

    // rounds / turns
    getCurrentRound: () => currentRound,
    nextTurn, prevTurn,

    // conditions
    addConditionToCombatant, removeCondition, CONDITION_LIST, isConditionActive, ensureConditionsArray,

    // persistence helpers
    getSerializableState: () => ({ version: 1, combatants, currentRound, turnPtr }),
    applyState(s) {
      combatants = Array.isArray(s?.combatants) ? s.combatants : [];
      currentRound = Number.isFinite(s?.currentRound) ? s.currentRound : 1;
      turnPtr = Number.isFinite(s?.turnPtr) ? s.turnPtr : 0;
      notify();
    },

    // expose some internals so render (unchanged) can mirror them locally
    __internals: {
      getStateVars: () => ({ combatants, selectedCombatantIds, currentRound, turnPtr })
    }
  };

  // Back-compat for old global API used elsewhere
  window.CombatAPI = {
    getAllCombatants: () => combatants,
    allGroups: () => combatants.filter(c => c.type === 'group'),
    getAllGroups: () => combatants.filter(c => c.type === 'group'),
    addGroupByName,
    getSelectedIds: () => new Set(selectedCombatantIds),
    setSelectedIds: (ids) => window.CombatState.setSelectedIds(ids),
    clearSelection: () => window.CombatState.clearSelection(),
    moveSelectedToGroup, ungroupSelected, deleteSelected,
    render: () => {}, isLocked: () => isLocked,
    addCombatant: addDefaultCombatant, addGroup: addGroupByName, sortByInit,
    getCurrentRound: () => currentRound,
    getCurrentTurnId: () => getTurnOrderIds()[turnPtr] || null,
    nextTurn, prevTurn,
    addConditionToCombatant, removeCondition,
  };
})();
