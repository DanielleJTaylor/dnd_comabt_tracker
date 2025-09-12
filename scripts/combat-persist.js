// scripts/combat-persist.js
(() => {
  // --- timing ---
  const AUTOSAVE_MS = 600;      // debounce delay
  const FLUSH_TIMEOUT_MS = 150; // beforeunload/visibilitychange flush

  // --- session-scope variables ---
  let _autosaveTimer = null;
  // We remember the currently open encounter by id + name:
  // - set the first time you save or when we restore a last draft
  let encounterId = null;
  let encounterName = 'Encounter';

  // Small toast for manual “Saved” feedback
  function toast(msg, ms = 900) {
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

  // Defensive read of current tracker state
  function getStateForSave() {
    if (!window.CombatState?.getSerializableState) return { version: 1, combatants: [], currentRound: 1, turnPtr: 0 };
    return window.CombatState.getSerializableState();
  }

  // Ensure we have an encounter id; if not, create one “silently”
  function ensureEncounterId() {
    if (encounterId) return encounterId;
    // Create an empty encounter immediately and remember its id
    encounterId = window.EncounterStore?.save({
      id: null,
      name: encounterName || 'Encounter',
      state: getStateForSave()
    });
    window.EncounterStore?.setLastId(encounterId);
    return encounterId;
  }

  // Manual save (button) — no prompt loop.
  // If you want to rename, we’ll do that once (optional).
  function saveEncounter({ showToast = true } = {}) {
    if (!window.EncounterStore) { console.warn('[persist] EncounterStore missing'); return; }
    ensureEncounterId(); // reuse same ID every time

    const state = getStateForSave();
    encounterId = window.EncounterStore.save({
      id: encounterId,
      name: encounterName || 'Encounter',
      state
    });
    window.EncounterStore.setLastId(encounterId);
    if (showToast) toast('Saved');
  }

  // Debounced autosave whenever state changes
  function scheduleAutosave() {
    if (!window.EncounterStore) return;
    clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(() => saveEncounter({ showToast: false }), AUTOSAVE_MS);
  }

  // Load an encounter via picker
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

    encounterId   = payload.id;
    encounterName = payload.name || 'Encounter';
    window.EncounterStore.setLastId(encounterId);
    window.CombatState.applyState(payload.state);
    toast(`Loaded: ${encounterName}`, 1100);
  }

  // On page open, restore last draft if present
  function tryRestoreLastDraftOnce() {
    if (!window.EncounterStore) return;
    const urlLast = new URLSearchParams(window.location.search).get('encounterId');
    const lastId = urlLast || window.EncounterStore.getLastId();
    if (!lastId) return;

    const payload = window.EncounterStore.load(lastId);
    if (payload) {
      encounterId   = payload.id;
      encounterName = payload.name || 'Encounter';
      window.CombatState.applyState(payload.state);
      // Set as current
      window.EncounterStore.setLastId(encounterId);
    }
  }

  // Wire buttons (no name prompts)
  function wireButtons() {
    document.getElementById('saveEncounterBtn')?.addEventListener('click', (e)=>{ 
      e.preventDefault(); 
      saveEncounter({ showToast: true }); 
    });
    document.getElementById('loadEncounterBtn')?.addEventListener('click', (e)=>{ 
      e.preventDefault(); 
      loadEncounterPrompt(); 
    });
  }

  // Flush on tab hide/unload (best-effort)
  function wireFlushOnExit() {
    const flush = () => {
      try {
        // immediate save using the same id
        ensureEncounterId();
        const state = getStateForSave();
        encounterId = window.EncounterStore.save({
          id: encounterId,
          name: encounterName || 'Encounter',
          state
        });
        window.EncounterStore.setLastId(encounterId);
      } catch {}
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // small timeout so pending UI updates settle
        setTimeout(flush, FLUSH_TIMEOUT_MS);
      }
    });
    window.addEventListener('beforeunload', () => {
      try { flush(); } catch {}
    });
  }

  // Subscribe to state → autosave
  window.CombatState?.subscribe?.(() => scheduleAutosave());

  // Expose a tiny API (handy if needed elsewhere)
  window.CombatPersist = { saveEncounter, loadEncounterPrompt, tryRestoreLastDraftOnce };

  // One-time init
  wireButtons();
  wireFlushOnExit();
  // Important: restore after DOM is ready (app.js also may call this)
  // Call it here to make sure we restore even if app.js changes later.
  tryRestoreLastDraftOnce();
})();
// scripts/combat-persist.js
(() => {
  // --- timing ---
  const AUTOSAVE_MS = 600;      // debounce delay
  const FLUSH_TIMEOUT_MS = 150; // beforeunload/visibilitychange flush

  // --- session-scope variables ---
  let _autosaveTimer = null;
  // We remember the currently open encounter by id + name:
  // - set the first time you save or when we restore a last draft
  let encounterId = null;
  let encounterName = 'Encounter';

  // Small toast for manual “Saved” feedback
  function toast(msg, ms = 900) {
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

  // Defensive read of current tracker state
  function getStateForSave() {
    if (!window.CombatState?.getSerializableState) return { version: 1, combatants: [], currentRound: 1, turnPtr: 0 };
    return window.CombatState.getSerializableState();
  }

  // Ensure we have an encounter id; if not, create one “silently”
  function ensureEncounterId() {
    if (encounterId) return encounterId;
    // Create an empty encounter immediately and remember its id
    encounterId = window.EncounterStore?.save({
      id: null,
      name: encounterName || 'Encounter',
      state: getStateForSave()
    });
    window.EncounterStore?.setLastId(encounterId);
    return encounterId;
  }

  // Manual save (button) — no prompt loop.
  // If you want to rename, we’ll do that once (optional).
  function saveEncounter({ showToast = true } = {}) {
    if (!window.EncounterStore) { console.warn('[persist] EncounterStore missing'); return; }
    ensureEncounterId(); // reuse same ID every time

    const state = getStateForSave();
    encounterId = window.EncounterStore.save({
      id: encounterId,
      name: encounterName || 'Encounter',
      state
    });
    window.EncounterStore.setLastId(encounterId);
    if (showToast) toast('Saved');
  }

  // Debounced autosave whenever state changes
  function scheduleAutosave() {
    if (!window.EncounterStore) return;
    clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(() => saveEncounter({ showToast: false }), AUTOSAVE_MS);
  }

  // Load an encounter via picker
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

    encounterId   = payload.id;
    encounterName = payload.name || 'Encounter';
    window.EncounterStore.setLastId(encounterId);
    window.CombatState.applyState(payload.state);
    toast(`Loaded: ${encounterName}`, 1100);
  }

  // On page open, restore last draft if present
  function tryRestoreLastDraftOnce() {
    if (!window.EncounterStore) return;
    const urlLast = new URLSearchParams(window.location.search).get('encounterId');
    const lastId = urlLast || window.EncounterStore.getLastId();
    if (!lastId) return;

    const payload = window.EncounterStore.load(lastId);
    if (payload) {
      encounterId   = payload.id;
      encounterName = payload.name || 'Encounter';
      window.CombatState.applyState(payload.state);
      // Set as current
      window.EncounterStore.setLastId(encounterId);
    }
  }

  // Wire buttons (no name prompts)
  function wireButtons() {
    document.getElementById('saveEncounterBtn')?.addEventListener('click', (e)=>{ 
      e.preventDefault(); 
      saveEncounter({ showToast: true }); 
    });
    document.getElementById('loadEncounterBtn')?.addEventListener('click', (e)=>{ 
      e.preventDefault(); 
      loadEncounterPrompt(); 
    });
  }

  // Flush on tab hide/unload (best-effort)
  function wireFlushOnExit() {
    const flush = () => {
      try {
        // immediate save using the same id
        ensureEncounterId();
        const state = getStateForSave();
        encounterId = window.EncounterStore.save({
          id: encounterId,
          name: encounterName || 'Encounter',
          state
        });
        window.EncounterStore.setLastId(encounterId);
      } catch {}
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // small timeout so pending UI updates settle
        setTimeout(flush, FLUSH_TIMEOUT_MS);
      }
    });
    window.addEventListener('beforeunload', () => {
      try { flush(); } catch {}
    });
  }

  // Subscribe to state → autosave
  window.CombatState?.subscribe?.(() => scheduleAutosave());

  // Expose a tiny API (handy if needed elsewhere)
  window.CombatPersist = { saveEncounter, loadEncounterPrompt, tryRestoreLastDraftOnce };

  // One-time init
  wireButtons();
  wireFlushOnExit();
  // Important: restore after DOM is ready (app.js also may call this)
  // Call it here to make sure we restore even if app.js changes later.
  tryRestoreLastDraftOnce();
})();
