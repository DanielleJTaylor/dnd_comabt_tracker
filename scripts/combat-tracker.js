// scripts/combat-tracker.js
(() => {
  // ====== STATE ======
  let combatants = [];                 // mix: {type:'combatant'} and {type:'group', members:[]}
  let selectedCombatantIds = new Set();
  let isLocked = false;

  let currentRound = 1;
  let turnPtr = 0; // index into getTurnOrderIds()

  // Colors (9 swatches)
  const GROUP_COLORS = [
    { base: '#f28b82', member: '#f7a199', text: '#222' }, // red
    { base: '#ff9800', member: '#ffb74d', text: '#222' }, // orange
    { base: '#fff176', member: '#fff59d', text: '#222' }, // yellow
    { base: '#81c995', member: '#a5d6a7', text: '#222' }, // green
    { base: '#64b5f6', member: '#90caf9', text: '#222' }, // blue
    { base: '#f48fb1', member: '#f8bbd0', text: '#222' }, // pink
    { base: '#ba68c8', member: '#ce93d8', text: '#222' }, // purple
    { base: '#a1887f', member: '#bcaaa4', text: '#222' }, // brown
    { base: '#9e9e9e', member: '#bdbdbd', text: '#222' }  // gray
  ];
  let _nextColorIdx = 0;

  // ====== DOM ======
  const $ = (s) => document.querySelector(s);

  const combatantListBody     = $('#combatant-list-body');
  const lockGroupSelectionBtn = $('#lockGroupSelectionBtn');
  const trackerTable          = $('#tracker-table');

  const addCombatantBtn = $('#addCombatantBtn');
  const addGroupBtn     = $('#addGroupBtn');
  const sortAscBtn      = $('#sort-init-asc');
  const sortDescBtn     = $('#sort-init-desc');
  const prevTurnBtn     = $('#prevTurnBtn');
  const nextTurnBtn     = $('#nextTurnBtn');

  const roundCounterEl  = $('#roundCounter');
  const currentTurnEl   = $('#currentTurnDisplay');

  // See Dead toggle (supports either id just in case)
  const seeDeadToggle = document.querySelector('#toggleSeeDead, #toggle-show-dead');
  let showDead = !!(seeDeadToggle && seeDeadToggle.checked);
  seeDeadToggle?.addEventListener('change', (e) => {
    showDead = !!e.target.checked;
    notify(); // re-render rows hidden/visible without changing data
  });

  // ====== HELPERS ======
  const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  function escapeAttr(s){ return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function escapeHTML(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // UI icon for HP state (uses file icon for Bloodied)
  function hpStateAsset(hp, maxHp) {
    if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) {
      return { state: "Healthy", html: '<span class="hp-emoji" title="Healthy">❤️</span>' };
    }
    if (hp <= 0) return { state: "DEAD", html: '<span class="hp-emoji" title="DEAD">☠️</span>' };

    const pct = (hp / maxHp) * 100;
    if (pct < 15)  return { state: "Critical", html: '<span class="hp-emoji" title="Critical">🆘</span>' };
    if (pct <= 50) return {
      state: "Bloodied",
      html: '<img class="hp-icon" src="images/icons/bloodied.png" alt="Bloodied" title="Bloodied">'
    };
    if (pct < 100) return { state: "Injured",  html: '<span class="hp-emoji" title="Injured">🤕</span>' };
    return { state: "Healthy", html: '<span class="hp-emoji" title="Healthy">❤️</span>' };
  }

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

  // ====== TURNS/Rounds ======
  function getTurnOrderIds() {
    const ids = [];
    combatants.forEach(item => {
      if (item.type === 'combatant') ids.push(item.id);
      else if (item.type === 'group') (item.members || []).forEach(m => ids.push(m.id));
    });

    // exclude dead/_out from initiative
    return ids.filter(id => {
      const { item } = findEntity(id);
      if (!item || item.type !== 'combatant') return false;
      const hp = Number(item.hp) || 0;
      return !item._out && hp > 0;
    });
  }

  function clampTurnPtr() {
    const order = getTurnOrderIds();
    if (order.length === 0) { turnPtr = 0; return; }
    if (turnPtr < 0) turnPtr = 0;
    if (turnPtr >= order.length) turnPtr = order.length - 1;
  }
  function setRoundDisplay() {
    if (roundCounterEl) roundCounterEl.textContent = `Round: ${currentRound}`;
  }
  function setCurrentTurnDisplay() {
    const order = getTurnOrderIds();
    const id = order[turnPtr];
    let name = 'None';
    if (id) {
      const found = findEntity(id).item;
      if (found) name = found.name || 'Combatant';
    }
    if (currentTurnEl) currentTurnEl.innerHTML = `🟢 Current Turn: <strong>${name}</strong>`;
  }
  function nextTurn() {
    const order = getTurnOrderIds();
    if (order.length === 0) return;
    turnPtr++;
    if (turnPtr >= order.length) {
      turnPtr = 0;
      currentRound += 1;
    }
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

  // ====== CONDITIONS ======
  const CONDITION_LIST = [
    'Blinded','Charmed','Deafened','Frightened','Grappled','Incapacitated',
    'Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained',
    'Stunned','Unconscious','Concentrating'
  ];
  function ensureConditionsArray(c) {
    if (!Array.isArray(c.conditions)) c.conditions = [];
    return c.conditions;
  }
  function addConditionToCombatant(id, name, durationRounds = 1, note = '') {
    const { item } = findEntity(id);
    if (!item || item.type !== 'combatant') return false;
    const dur = Math.max(1, parseInt(durationRounds, 10) || 1);
    ensureConditionsArray(item).push({
      id: `cond_${uid()}`,
      ownerId: id,
      name: String(name || '').trim() || 'Condition',
      note: String(note || ''),
      appliedAtRound: currentRound,
      appliedAtPtr: turnPtr,
      durationRounds: dur
    });
    notify();
    return true;
  }
  function condOwnerIdx(cond) {
    const order = getTurnOrderIds();
    return order.indexOf(cond.ownerId);
  }
  function isConditionVisibleNow(cond) {
    if (currentRound < cond.appliedAtRound) return false;
    if (currentRound === cond.appliedAtRound && turnPtr < cond.appliedAtPtr) return false;
    return true;
  }
  function ownerTurnsSinceAdded(cond) {
    const ownerIdx = condOwnerIdx(cond);
    if (ownerIdx < 0) return 0;
    const firstRound = cond.appliedAtRound + (cond.appliedAtPtr < ownerIdx ? 0 : 1);
    if (currentRound < firstRound) return 0;
    let n = currentRound - firstRound;
    if (turnPtr >= ownerIdx) n += 1;
    return n;
  }
  function remainingRounds(cond) {
    const used = ownerTurnsSinceAdded(cond);
    return Math.max(0, (cond.durationRounds ?? 0) - used);
  }
  function isConditionActive(cond) {
    return isConditionVisibleNow(cond) && remainingRounds(cond) > 0;
  }
  function removeCondition(id, condId) {
    const { item } = findEntity(id);
    if (!item || item.type !== 'combatant') return false;
    item.conditions = (item.conditions || []).filter(c => c.id !== condId);
    notify();
    return true;
  }

  // ====== MUTATIONS ======
  function addDefaultCombatant() {
    const name = generateUniqueName(`Combatant ${countAllCombatants() + 1}`);
    const c = {
      id: uid(),
      type: 'combatant',
      name,
      init: 10, ac: 10, hp: 10, maxHp: 10, tempHp: 0,
      role: 'dm', imageUrl: '', dashboardId: null,
      conditions: []
    };
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

  function updateCombatant(id, patch) {
    const { item } = findEntity(id);
    if (!item || item.type !== 'combatant') return false;

    if ('name' in patch) {
      const proposed = String(patch.name || '').trim();
      if (!proposed) return false;
      if (isNameTaken(proposed, id)) return false;
    }
    if ('hp' in patch) {
      const nextHp = Number(patch.hp);
      if (Number.isFinite(nextHp)) {
        patch._out = (nextHp <= 0);
      }
    }
    Object.assign(item, patch);
    notify();
    return true;
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
      if (item.type === 'combatant' && selectedCombatantIds.has(item.id)) {
        collected.push(item); return false;
      }
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
    combatants.forEach(g => {
      if (g.type === 'group') g.members = g.members.filter(m => !selectedCombatantIds.has(m.id));
    });
    selectedCombatantIds.clear();
    notify();
  }
  function removeEntity(id) {
    const before = combatants.length;
    combatants = combatants.filter(x => !(x.type === 'combatant' && x.id === id));
    if (combatants.length !== before) { notify(); return true; }
    const beforeG = combatants.length;
    combatants = combatants.filter(x => !(x.type === 'group' && x.id === id));
    if (combatants.length !== beforeG) { notify(); return true; }
    let removed = false;
    combatants.forEach(g => {
      if (g.type !== 'group') return;
      const len = g.members?.length || 0;
      g.members = (g.members || []).filter(m => m.id !== id);
      if ((g.members?.length || 0) !== len) removed = true;
    });
    if (removed) { notify(); return true; }
    return false;
  }

  // ====== GROUP COLOR ======
  function setGroupColorIdx(groupId, idx) {
    const { item } = findEntity(groupId);
    if (!item || item.type !== 'group') return false;
    const max = GROUP_COLORS.length;
    const n = Math.max(0, Math.min(max - 1, Number(idx) || 0));
    item.colorIdx = n;
    notify(); return true;
  }

  // ====== HP (Damage/Heal) ======
  function applyDamageHeal(ids, { damage = 0, heal = 0 } = {}) {
    const deltaD = Number(damage) || 0;
    const deltaH = Number(heal) || 0;
    if (!ids || !ids.size) return false;

    ids.forEach(id => {
      const { item } = findEntity(id);
      if (!item || item.type !== 'combatant') return;
      let hp = Number(item.hp) || 0;
      let maxHp = Number(item.maxHp) || 0;
      let temp = Number(item.tempHp) || 0;

      if (deltaD > 0) {
        const useTemp = Math.min(temp, deltaD);
        temp -= useTemp;
        let left = deltaD - useTemp;
        hp = Math.max(0, hp - left);
      }
      if (deltaH > 0) {
        hp = Math.min(maxHp, hp + deltaH);
      }

      item.hp = hp;
      item.tempHp = temp;

      item._out = (hp <= 0);
    });

    notify();
    return true;
  }

  // ====== NOTIFY / SNAPSHOT ======
  const listeners = new Set();
  function getSnapshot() {
    return {
      combatants,
      selectedCombatantIds,
      isLocked,
      currentRound,
      turnPtr,
      GROUP_COLORS
    };
  }
  function updateCurrentTurnHighlight() {
    document
      .querySelectorAll('.tracker-table-row.current-turn, .group-row.current-turn')
      .forEach(el => el.classList.remove('current-turn'));
    const order = getTurnOrderIds();
    const activeId = order[turnPtr];
    if (!activeId) return;
    const row = document.querySelector(`[data-id="${activeId}"][data-type="combatant"]`);
    if (!row) return;
    const groupRow = row.closest('.group-row');
    if (groupRow) groupRow.classList.add('current-turn');
    else row.classList.add('current-turn');
  }
  function notify() {
    clampTurnPtr();
    setRoundDisplay();
    setCurrentTurnDisplay();
    hideCondTip();
    render();
    updateCurrentTurnHighlight();
    updateStatusCellLayout();
    listeners.forEach(fn => fn(getSnapshot()));
    window.scheduleAutosave?.();
  }

  // ====== RENDER ======
  function groupDisplayInit(group) {
    return Number.isFinite(group?.init) ? String(group.init) : '—';
  }

  // CONDITION CHIPS HTML
  function condChipsHTML(c) {
    const list = Array.isArray(c.conditions) ? c.conditions : [];
    const active = list.filter(isConditionActive);
    if (!active.length) return '<div class="cond-list"></div>';
    return `<div class="cond-list">` + active.map(cond => {
      const remain = remainingRounds(cond);
      const safeName = escapeAttr(cond.name || 'Condition');
      const descLines = (window.ConditionsCatalog?.get?.(cond.name)?.desc || []);
      const safeDesc  = escapeAttr(descLines.join('\n'));
      return `<span class="condition-chip"
                    data-cond-id="${cond.id}"
                    data-cond-name="${safeName}"
                    data-cond-desc="${safeDesc}">
                ${safeName} (${remain}r)
                <span class="x" title="Remove" data-remove-cond="1" data-cond-id="${cond.id}">×</span>
              </span>`;
    }).join('') + `</div>`;
  }

  // color swatch popover
  let _colorPopover = null;
  function closeColorPopover() {
    if (_colorPopover) { _colorPopover.remove(); _colorPopover = null; }
    document.removeEventListener('keydown', onColorEsc);
    document.removeEventListener('click', onColorDocClick, true);
  }
  const onColorEsc = (e) => { if (e.key === 'Escape') closeColorPopover(); };
  const onColorDocClick = (e) => {
    if (!_colorPopover) return;
    if (e.target.closest('.color-popover')) return;
    if (e.target.closest('.group-color-swatch')) return;
    closeColorPopover();
  };
  function openColorPopover(anchorBtn, groupId, currentIdx) {
    closeColorPopover();
    const colors = GROUP_COLORS;
    const pop = document.createElement('div');
    pop.className = 'color-popover';
    Object.assign(pop.style, {
      position: 'fixed', zIndex: 1000, background: 'rgba(255,255,255,.98)',
      border: '1px solid rgba(0,0,0,.12)', borderRadius: '10px',
      boxShadow: '0 10px 30px rgba(0,0,0,.15)', padding: '8px', minWidth: '140px', color: '#222'
    });
    const grid = document.createElement('div');
    Object.assign(grid.style, { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' });
    colors.forEach((scheme, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'color-dot';
      Object.assign(b.style, {
        width: '28px', height: '28px', borderRadius: '50%',
        border: i === currentIdx ? '2px solid #333' : '1px solid #0002',
        background: scheme.base, cursor: 'pointer'
      });
      b.dataset.idx = String(i);
      b.title = `Set color ${i+1}`;
      b.addEventListener('click', () => {
        setGroupColorIdx(groupId, parseInt(b.dataset.idx,10) || 0);
        closeColorPopover();
      });
      grid.appendChild(b);
    });
    pop.appendChild(grid);
    document.body.appendChild(pop);
    _colorPopover = pop;

    const rect = anchorBtn.getBoundingClientRect();
    const margin = 6;
    const belowTop = rect.bottom + margin;
    const left = Math.min(window.innerWidth - pop.offsetWidth - 8, Math.max(8, rect.left));
    const top  = (belowTop + 160 < window.innerHeight) ? belowTop : Math.max(8, rect.top - margin - pop.offsetHeight);
    pop.style.left = `${left}px`;
    pop.style.top  = `${top}px`;

    document.addEventListener('keydown', onColorEsc);
    document.addEventListener('click', onColorDocClick, true);
  }
  function swatchButtonHTML(groupId, bg) {
    const size = 22;
    return `
      <button class="group-color-swatch" title="Change color"
              data-group-id="${groupId}"
              style="
                width:${size}px;height:${size}px;padding:0;
                border-radius:50%;
                background:${bg};
                border:2px solid #ffffff;
                box-shadow:0 0 0 1px rgba(0,0,0,.25);
                display:inline-block;">
      </button>`;
  }

  // ====== CONDITION CHIP TOOLTIP ======
  let _condTipEl = null;
  function ensureCondTip(){
    if (_condTipEl) return _condTipEl;
    const tip = document.createElement('div');
    tip.className = 'cond-tip';
    Object.assign(tip.style, {
      position: 'fixed',
      display: 'none',
      pointerEvents: 'none',
      zIndex: 10000,
      maxWidth: '380px',
      background: 'rgba(20,20,20,.96)',
      color: '#fff',
      padding: '10px 12px',
      borderRadius: '10px',
      border: '1px solid rgba(255,255,255,.08)',
      boxShadow: '0 12px 28px rgba(0,0,0,.28)',
      lineHeight: '1.35',
      whiteSpace: 'pre-line'
    });
    tip.innerHTML = '';
    document.body.appendChild(tip);
    _condTipEl = tip;
    return tip;
  }
  function setCondTipContent(name, desc){
    const tip = ensureCondTip();
    tip.innerHTML =
      `<div class="cond-tip-title" style="font-weight:700;margin-bottom:4px;">${escapeHTML(name)}</div>` +
      `<div class="cond-tip-desc">${escapeHTML(desc).replace(/\n/g,'<br>')}</div>`;
  }
  function positionCondTip(x, y){
    const tip = ensureCondTip();
    const margin = 14;
    tip.style.display = 'block';
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.min(window.innerWidth - w - 8, x + margin);
    const top  = Math.min(window.innerHeight - h - 8, y + margin);
    tip.style.left = left + 'px';
    tip.style.top  = top + 'px';
  }
  function hideCondTip(){ if (_condTipEl) _condTipEl.style.display = 'none'; }
  combatantListBody?.addEventListener('mouseover', (e) => {
    const chip = e.target.closest('.condition-chip');
    if (!chip) return;
    setCondTipContent(chip.dataset.condName || '', chip.dataset.condDesc || '');
    positionCondTip(e.clientX, e.clientY);
  });
  combatantListBody?.addEventListener('mousemove', (e) => {
    if (_condTipEl?.style.display === 'block') positionCondTip(e.clientX, e.clientY);
  });
  combatantListBody?.addEventListener('mouseout', (e) => {
    const from = e.target.closest('.condition-chip');
    const to   = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('.condition-chip') : null;
    if (from && !to) hideCondTip();
  });

  // ====== STATUS-CELL LAYOUT ======
  function updateStatusCellLayout() {
    document
      .querySelectorAll('#combatant-list-body .tracker-table-row .status-cell')
      .forEach(cell => {
        const list = cell.querySelector('.cond-list');
        const btn  = cell.querySelector('.btn-add-status');
        if (!list) { cell.classList.remove('wrapped'); return; }

        const chips = list.querySelectorAll('.condition-chip');
        if (chips.length < 3) { cell.classList.remove('wrapped'); return; }

        const chipsTotalWidth = Array.from(chips).reduce((w, ch) => w + ch.offsetWidth, 0)
                              + Math.max(0, chips.length - 1) * 4;
        const btnWidth = (btn?.offsetWidth || 0);
        const available = cell.clientWidth - btnWidth - 8;
        const needWrap = chipsTotalWidth > available;
        cell.classList.toggle('wrapped', needWrap);
      });
  }

  // ====== INLINE EDIT ======
  function activateInlineEdit(spanEl, { intOnly = false } = {}) {
    const type  = spanEl.dataset.type;
    const id    = spanEl.dataset.id;
    const field = spanEl.dataset.field;
    const old   = spanEl.textContent.trim();

    const input = document.createElement('input');
    input.type  = 'text';
    input.value = old;
    input.className = 'inline-editor';
    input.setAttribute('inputmode', intOnly ? 'numeric' : 'text');

    input.dataset.type = type;
    input.dataset.id = id;
    input.dataset.field = field;
    input.dataset.intOnly = String(!!intOnly);
    input._origSpan = spanEl;

    spanEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      let val = String(input.value ?? '').trim();
      if (field === 'name' && !val) { input.replaceWith(spanEl); return; }
      if (intOnly) {
        const parsed = parseInt(val, 10);
        if (!Number.isFinite(parsed)) { input.replaceWith(spanEl); return; }
        val = parsed;
      }
      spanEl.textContent = String(val);
      input.replaceWith(spanEl);
      if (type === 'combatant') updateCombatant(id, { [field]: val });
      else updateGroup(id, { [field]: val });
    };
    const cancel = () => { input.replaceWith(spanEl); };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit, { once: true });
  }

  // image picker
  let _picker = null;
  function getImagePicker() {
    if (_picker) return _picker;
    _picker = document.createElement('input');
    _picker.type = 'file'; _picker.accept = 'image/*'; _picker.style.display = 'none';
    document.body.appendChild(_picker);
    return _picker;
  }

  // condition popover (for adding a condition)
  let _condPopover = null;
  function closeConditionPopover() {
    if (_condPopover) { _condPopover.remove(); _condPopover = null; }
    document.removeEventListener('keydown', onCondEsc);
    document.removeEventListener('click', onCondDocClick, true);
  }
  const onCondEsc = (e) => { if (e.key === 'Escape') closeConditionPopover(); };
  const onCondDocClick = (e) => {
    if (!_condPopover) return;
    if (e.target.closest('.cond-popover')) return;
    if (e.target.closest('.btn-add-status')) return;
    closeConditionPopover();
  };
  function openConditionPopover(anchorBtn, id) {
    closeConditionPopover();
    const pop = document.createElement('div');
    pop.className = 'cond-popover';
    Object.assign(pop.style, {
      position: 'fixed', zIndex: 1000, background: 'rgba(255,255,255,.98)',
      border: '1px solid rgba(0,0,0,.12)', borderRadius: '10px',
      boxShadow: '0 10px 30px rgba(0,0,0,.15)', padding: '10px', minWidth: '280px', color: '#222'
    });

    const list = (window.ConditionsCatalog?.list && window.ConditionsCatalog.list.length)
      ? window.ConditionsCatalog.list
      : CONDITION_LIST;

    pop.innerHTML = `
      <div class="row" style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;">
        <label style="min-width:82px;">Condition</label>
        <select id="condSelect" style="flex:1;padding:.25rem .4rem;">
          ${list.map(n => `<option value="${n}">${n}</option>`).join('')}
        </select>
      </div>
      <div class="row" style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;">
        <label style="min-width:82px;">Duration</label>
        <input id="condDur" type="number" min="1" step="1" value="2" style="width:5rem;padding:.25rem .4rem;">
        <span>rounds</span>
      </div>
      <div class="actions" style="display:flex;gap:.5rem;justify-content:flex-end;">
        <button class="btn btn-secondary" data-act="cancel">Cancel</button>
        <button class="btn" data-act="add">Add</button>
      </div>`;
    document.body.appendChild(pop);
    _condPopover = pop;

    const rect = anchorBtn.getBoundingClientRect();
    const margin = 6;
    const belowTop = rect.bottom + margin;
    const left = Math.min(window.innerWidth - pop.offsetWidth - 8, Math.max(8, rect.left));
    const top  = (belowTop + 200 < window.innerHeight) ? belowTop : Math.max(8, rect.top - margin - pop.offsetHeight);
    pop.style.left = `${left}px`; pop.style.top = `${top}px`;

    pop.addEventListener('click', (e) => {
      const act = e.target.closest('button')?.dataset?.act;
      if (!act) return;
      if (act === 'cancel') { closeConditionPopover(); return; }
      if (act === 'add') {
        const name = pop.querySelector('#condSelect').value;
        const dur  = Math.max(1, parseInt(pop.querySelector('#condDur').value || '1', 10) || 1);
        addConditionToCombatant(id, name, dur);
        closeConditionPopover();
      }
    });

    document.addEventListener('keydown', onCondEsc);
    document.addEventListener('click', onCondDocClick, true);
  }

  // ====== EVENTS ======
  addCombatantBtn?.addEventListener('click', () => addDefaultCombatant());
  addGroupBtn?.addEventListener('click', () => addGroupByName(`New Group ${allGroups().length + 1}`));
  sortAscBtn?.addEventListener('click', () => sortByInit('asc'));
  sortDescBtn?.addEventListener('click', () => sortByInit('desc'));
  nextTurnBtn?.addEventListener('click', () => nextTurn());
  prevTurnBtn?.addEventListener('click', () => prevTurn());

  lockGroupSelectionBtn?.addEventListener('click', () => {
    isLocked = !isLocked;
    lockGroupSelectionBtn.innerHTML = isLocked
      ? `🔓 <span class="label">Unlock Groups</span>`
      : `🔒 <span class="label">Lock Groups</span>`;
    trackerTable?.classList.toggle('selection-locked', isLocked);
    notify();
  });

  // Kill any legacy '.btn-spellcaster' handlers injected elsewhere
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('.btn-spellcaster')) {
      ev.stopImmediatePropagation();
      ev.preventDefault();
    }
  }, true);

  // table delegate
  combatantListBody?.addEventListener('click', (e) => {
    // selection (works for group members as well; CSS must NOT hide this checkbox)
    const cb = e.target.closest('.combatant-checkbox');
    if (cb) {
      if (isLocked) { e.preventDefault(); return; }
      const id = cb.dataset.id;
      if (cb.checked) selectedCombatantIds.add(id); else selectedCombatantIds.delete(id);
      notify();
      return;
    }

    // delete row
    const del = e.target.closest('.row-del');
    if (del) {
      const id = del.dataset.id;
      const type = del.dataset.type || 'combatant';
      const label = type === 'group' ? 'this group and all its members' : 'this combatant';
      if (!id) return;
      if (!confirm(`Delete ${label}?`)) return;
      removeEntity(id);
      return;
    }

    // color swatch
    const swatch = e.target.closest('.group-color-swatch');
    if (swatch) {
      const gid = swatch.getAttribute('data-group-id');
      const g = combatants.find(x => x.type === 'group' && x.id === gid);
      const idx = g ? (g.colorIdx ?? ensureGroupColorIdx(g)) : 0;
      openColorPopover(swatch, gid, idx);
      return;
    }

    // remove condition
    const xBtn = e.target.closest('[data-remove-cond="1"]');
    if (xBtn) {
      const row = xBtn.closest('.tracker-table-row');
      const id = row?.dataset?.id;
      const condId = xBtn.dataset.condId;
      if (id && condId) removeCondition(id, condId);
      return;
    }

    // add condition
    const addBtn = e.target.closest('.btn-add-status');
    if (addBtn) {
      const id = addBtn.dataset.id;
      openConditionPopover(addBtn, id);
      return;
    }

    // spell slots button (toggle inline panel)
    const spellBtn = e.target.closest('.btn-slots-inline');
    if (spellBtn) {
      const id = spellBtn.dataset.id;
      const { item } = findEntity(id);
      if (item && item.type === 'combatant') {
        window.SpellUI?.ensureSpellData(item);
        item._slotsOpen = !item._slotsOpen;
        notify();
      }
      return;
    }

    // rejoin initiative (resurrection) button
    const rejoin = e.target.closest('.btn.btn-rejoin, .btn-rejoin');
    if (rejoin) {
      const id = rejoin.dataset.id;
      const { item } = findEntity(id);
      if (item && item.type === 'combatant') {
        item._out = false;
        if (!Number(item.hp) || item.hp <= 0) item.hp = 1;
        notify();
      }
      return;
    }

    // image picker
    const img = e.target.closest('.editable-img');
    if (img) {
      const id = img.dataset.id;
      const inp = getImagePicker();
      inp.onchange = () => {
        const file = inp.files?.[0]; if (!file) return;
        const r = new FileReader();
        r.onload = () => { updateCombatant(id, { imageUrl: r.result }); inp.value = ''; };
        r.readAsDataURL(file);
      };
      inp.click();
      return;
    }

    // inline text/int
    const nameSpan = e.target.closest('.editable-text');
    if (nameSpan) { activateInlineEdit(nameSpan, { intOnly: false }); return; }
    const intSpan = e.target.closest('.editable-int');
    if (intSpan) { activateInlineEdit(intSpan, { intOnly: true }); return; }
  });

  // clicks inside inline slots panel
  combatantListBody.addEventListener('click', (e) => {
    const inline = e.target.closest('.slots-inline'); if (!inline) return;
    const { item:c } = findEntity(inline.dataset.id); if (!c) return;
    const sd = window.SpellUI?.ensureSpellData(c);

    if (e.target.classList.contains('slot-inc')) {
      const L = +e.target.dataset.level; sd.slots[L].used = Math.max(0, sd.slots[L].used - 1);
      window.SpellUI?.syncSlotRow(inline, L, sd); notify(); return;
    }
    if (e.target.classList.contains('slot-dec')) {
      const L = +e.target.dataset.level; sd.slots[L].used = Math.min(sd.slots[L].max, sd.slots[L].used + 1);
      window.SpellUI?.syncSlotRow(inline, L, sd); notify(); return;
    }
    if (e.target.classList.contains('slots-longrest')) {
      for (let L=1; L<=9; L++) sd.slots[L].used = 0;
      for (let L=1; L<=9; L++) window.SpellUI?.syncSlotRow(inline, L, sd);
      notify(); return;
    }
    if (e.target.classList.contains('slots-close')) {
      c._slotsOpen = false; notify(); return;
    }
  });

  // update max fields in slots
  combatantListBody.addEventListener('input', (e) => {
    if (!e.target.classList.contains('slot-max')) return;
    const inline = e.target.closest('.slots-inline'); if (!inline) return;
    const { item:c } = findEntity(inline.dataset.id); if (!c) return;
    const sd = window.SpellUI?.ensureSpellData(c);
    const L = +e.target.dataset.level;
    const val = Math.max(0, parseInt(e.target.value||'0',10) || 0);
    sd.slots[L].max = val;
    sd.slots[L].used = Math.min(sd.slots[L].used, val);
    window.SpellUI?.syncSlotRow(inline, L, sd); notify();
  });

  function syncSlotInline(container, c) {
    const html = window.SpellUI?.buildSlotsInlineHTML(c) || '';
    container.innerHTML = html;
  }

  // ====== SORTING ======
  function splitNameForSort(name) {
    const trimmed = String(name || '').trim();
    const m = trimmed.match(/^(.*?)(?:\s+(\d+))?$/);
    const base = (m?.[1] || '').toLowerCase();
    const num  = m?.[2] ? parseInt(m[2], 10) : null;
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

  // ====== PUBLIC APIS ======
  window.CombatState = {
    subscribe(fn) { listeners.add(fn); fn(getSnapshot()); return () => listeners.delete(fn); },
    getSnapshot,
    isLocked: () => isLocked,
    setLocked(v) { isLocked = !!v; notify(); },
    getSelectedIds: () => new Set(selectedCombatantIds),
    setSelectedIds(ids) { selectedCombatantIds = new Set(ids); notify(); },
    clearSelection() { selectedCombatantIds.clear(); notify(); },
    addCombatant: addDefaultCombatant,
    addGroupByName,
    updateCombatant, updateGroup,
    removeEntity,
    deleteSelected,
    moveSelectedToGroup, ungroupSelected,
    setGroupColorIdx,
    sortByInit,
    getCurrentRound: () => currentRound,
    nextTurn, prevTurn,
    addConditionToCombatant, removeCondition,
    CONDITION_LIST, isConditionActive, ensureConditionsArray,
    applyDamageHeal,
    getSerializableState: () => ({ version: 1, combatants, currentRound, turnPtr }),
    applyState(s) {
      combatants = Array.isArray(s?.combatants) ? s.combatants : [];
      currentRound = Number.isFinite(s?.currentRound) ? s.currentRound : 1;
      turnPtr = Number.isFinite(s?.turnPtr) ? s.turnPtr : 0;
      notify();
    },
    ensureGroupColorIdx,
    getGroupColors: () => GROUP_COLORS,
  };

  window.CombatAPI = {
    getAllCombatants: () => combatants,
    allGroups: () => allGroups(),
    getAllGroups: () => allGroups(),
    addGroupByName,
    getSelectedIds: () => new Set(selectedCombatantIds),
    setSelectedIds: (ids) => window.CombatState.setSelectedIds(ids),
    clearSelection: () => window.CombatState.clearSelection(),
    moveSelectedToGroup,
    ungroupSelected,
    deleteSelected,
    removeEntity,
    render: () => render(),
    isLocked: () => isLocked,
    addCombatant: addDefaultCombatant,
    addGroup: addGroupByName,
    sortByInit,
    getCurrentRound: () => currentRound,
    getCurrentTurnId: () => getTurnOrderIds()[turnPtr] || null,
    nextTurn, prevTurn,
    addConditionToCombatant, removeCondition,
    setGroupColorIdx,
    applyDamageHeal,
  };

  // ====== MAIN RENDER ======
  function render() {
    if (!combatantListBody) return;
    combatantListBody.innerHTML = '';

    const order = getTurnOrderIds();
    const curId = order[turnPtr] || null;

    // Group row
    const paintGroup = (g) => {
      const idx = ensureGroupColorIdx(g);
      const scheme = GROUP_COLORS[idx % GROUP_COLORS.length];

      const row = document.createElement('div');
      row.className = 'group-row';
      row.dataset.id = g.id;
      row.dataset.type = 'group';
      row.style.backgroundColor = scheme.base;
      row.style.color = scheme.text;
      row.innerHTML = `
        <div class="cell select-cell"></div>
        <div class="cell image-cell">
          <img src="images/folder.png" alt="Group Folder" class="group-folder-img">
        </div>
        <div class="cell init-cell">
          <span class="editable-int" data-type="group" data-id="${g.id}" data-field="init">${groupDisplayInit(g)}</span>
        </div>
        <div class="cell name-cell">
          <span class="editable-text" data-type="group" data-id="${g.id}" data-field="name">${g.name}</span>
        </div>
        <div class="cell ac-cell"></div>
        <div class="cell hp-cell"></div>
        <div class="cell temp-hp-cell"></div>
        <div class="cell status-cell"></div>
        <div class="cell role-cell"></div>
        <div class="cell actions-cell">
          <div class="btn-group">
            ${swatchButtonHTML(g.id, scheme.base)}
            <button class="row-del" data-type="group" data-id="${g.id}" title="Delete group">🗑️</button>
          </div>
        </div>
        <div class="cell dashboard-link-cell"></div>
      `;
      combatantListBody.appendChild(row);

      (g.members || []).forEach(m => paintCombatant(m, true, scheme));
    };

    // Combatant row
    const paintCombatant = (c, inGroup = false, scheme = null) => {
      const hpNum = Number(c.hp) || 0;

      if (!showDead && hpNum <= 0) return;

      const isSelected = selectedCombatantIds.has(c.id);
      const isCurrent  = (getTurnOrderIds()[turnPtr] || null) === c.id;

      const row = document.createElement('div');
      row.className = `tracker-table-row ${inGroup ? 'in-group' : ''} ${isSelected ? 'selected' : ''} ${isCurrent ? 'current-turn' : ''}`;
      row.dataset.id = c.id;
      row.dataset.type = 'combatant';
      if (inGroup && scheme) { row.style.backgroundColor = scheme.member; row.style.color = scheme.text; }

      const { html: hpIconHtml } = hpStateAsset(Number(c.hp), Number(c.maxHp));

      row.innerHTML = `
        <div class="cell select-cell">
          <input type="checkbox" class="combatant-checkbox" data-id="${c.id}" ${isSelected ? 'checked' : ''}>
        </div>
        <div class="cell image-cell">
          <img class="editable-img" data-type="combatant" data-id="${c.id}" src="${c.imageUrl || 'images/icon.png'}" alt="${c.name}">
        </div>
        <div class="cell init-cell">
          <span class="editable-int" data-type="combatant" data-id="${c.id}" data-field="init">${c.init}</span>
        </div>
        <div class="cell name-cell">
          <span class="editable-text" data-type="combatant" data-id="${c.id}" data-field="name">${c.name}</span>
        </div>
        <div class="cell ac-cell">
          <span class="ac-shield">🛡️</span>
          <span class="editable-int" data-type="combatant" data-id="${c.id}" data-field="ac">${c.ac}</span>
        </div>
        <div class="cell hp-cell" data-id="${c.id}">
          ${hpIconHtml}
          <span class="editable-int" data-type="combatant" data-id="${c.id}" data-field="hp">${c.hp}</span>
          <span> / </span>
          <span class="editable-int" data-type="combatant" data-id="${c.id}" data-field="maxHp">${c.maxHp}</span>
        </div>
        <div class="cell temp-hp-cell">
          <span class="temp-icon">✨</span>
          <span class="editable-int" data-type="combatant" data-id="${c.id}" data-field="tempHp">${c.tempHp || 0}</span>
        </div>
        <div class="cell status-cell">
          ${condChipsHTML(c)}
          <button class="btn btn-add-status" data-id="${c.id}">+ Add</button>
        </div>
        <div class="cell role-cell">${c.role?.toUpperCase?.() || ''}</div>
        <div class="cell actions-cell">
          <div class="btn-group">
            <button class="btn btn-slots-inline" data-id="${c.id}" title="Spell slots">
              ${c.spellSlots ? '🪄 Slots' : '🪄 Make Caster'}
            </button>
            ${
              hpNum <= 0
                ? `<button class="btn btn-rejoin" data-id="${c.id}" title="Bring back into initiative">☠️↩</button>`
                : ''
            }
            <button class="row-del" data-type="combatant" data-id="${c.id}" title="Delete combatant">🗑️</button>
          </div>
        </div>
        <div class="cell dashboard-link-cell"><button title="Toggle Dashboard">📄</button></div>
      `;

      combatantListBody.appendChild(row);

      // inline spell slots panel
      if (c._slotsOpen) {
        window.SpellUI?.ensureSpellData(c);
        const wrap = document.createElement('div');
        wrap.className = 'slots-inline';
        wrap.dataset.id = c.id;
        wrap.style.gridColumn = '1 / -1';
        syncSlotInline(wrap, c);
        combatantListBody.appendChild(wrap);
      }
    };

    // Paint everything
    combatants.forEach(item => {
      if (item.type === 'group') paintGroup(item);
      else paintCombatant(item, false, null);
    });

    trackerTable?.classList.toggle('selection-locked', isLocked);
  }

  // ====== INIT ======
  setRoundDisplay();
  setCurrentTurnDisplay();
  // Mount "PC quick add" if the module is present
  window.PlayerStore?.mountPCQuickAdd?.();
  notify();
  window.addEventListener('resize', updateStatusCellLayout);
})();
