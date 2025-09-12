// scripts/combat-persist.js
(() => {
  const AUTOSAVE_MS = 800;
  let _autosaveTimer = null;
  let encounterId = null;
  let encounterName = 'Encounter';

  function toast(msg, ms = 1200) {
    let el = document.getElementById('tracker-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tracker-toast';
      Object.assign(el.style, {
        position:'fixed', bottom:'16px', right:'16px',
        background:'#222', color:'#fff', padding:'8px 12px',
        borderRadius:'8px', boxShadow:'0 8px 24px rgba(0,0,0,.2)',
        zIndex:99999, opacity:0, transition:'opacity .15s'
      });
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = 1;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.style.opacity = 0; }, ms);
  }

  function saveEncounter(manual=false) {
    if (!window.EncounterStore) { console.warn('EncounterStore missing'); return; }
    if (manual) {
      const n = prompt('Encounter name:', encounterName || 'Encounter');
      if (n && n.trim()) encounterName = n.trim();
      else if (n === null) return; // User cancelled
    }
    const state = window.CombatState.getSerializableState();
    encounterId = window.EncounterStore.save({ id: encounterId, name: encounterName, state });
    window.EncounterStore.setLastId(encounterId);
    if (manual) toast('Saved encounter');
  }

  function scheduleAutosave() {
    if (!window.EncounterStore) return;
    clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(() => saveEncounter(false), AUTOSAVE_MS);
  }

  function loadEncounterPrompt() {
    if (!window.EncounterStore) return;
    const list = window.EncounterStore.list();
    if (!list.length) { alert('No saved encounters yet.'); return; }
    const menu = list.map((e,i)=>`${i+1}. ${e.name} (${new Date(e.updated).toLocaleString()})`).join('\n');
    const ans = prompt(`Load which encounter?\n\n${menu}\n\nEnter number:`);
    const idx = parseInt(ans,10)-1;
    if (!Number.isFinite(idx) || idx<0 || idx>=list.length) return;
    const item = list[idx];
    const payload = window.EncounterStore.load(item.id);
    if (!payload) return;
    encounterId = payload.id;
    encounterName = payload.name || 'Encounter';
    window.EncounterStore.setLastId(encounterId);
    window.CombatState.applyState(payload.state);
  }

  function tryRestoreLastDraftOnce() {
    if (!window.EncounterStore) return;
    const lastId = new URLSearchParams(window.location.search).get('encounterId') || window.EncounterStore.getLastId();
    if (!lastId) return;
    const payload = window.EncounterStore.load(lastId);
    if (payload) {
      encounterId   = payload.id;
      encounterName = payload.name || 'Encounter';
      window.CombatState.applyState(payload.state);
    }
  }
  
  function wireButtons() {
    document.getElementById('saveEncounterBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); saveEncounter(true); });
    document.getElementById('loadEncounterBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); loadEncounterPrompt(); });
  }

  window.CombatState.subscribe(() => scheduleAutosave());
  window.CombatPersist = { saveEncounter, loadEncounterPrompt, tryRestoreLastDraftOnce };

  wireButtons();
})();