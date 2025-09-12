// scripts/combat-persist.js
(() => {
  const AUTOSAVE_MS = 800;
  let _autosaveTimer = null;

  // Persisted identifiers for the current draft
  let encounterId   = null;          // stable id for this open encounter
  let encounterName = 'Encounter';   // display name (shown on View Encounters)

  // --- tiny toast ---
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

  // Ensure our local encounterId/Name reflect the "last opened draft"
  function hydrateFromLastDraft() {
    if (!window.EncounterStore) return;
    if (encounterId) return; // already hydrated in this session

    const qsId   = new URLSearchParams(location.search).get('encounterId');
    const lastId = window.EncounterStore.getLastId();

    const chosen = qsId || lastId;
    if (!chosen) return; // nothing saved yet

    const payload = window.EncounterStore.load(chosen);
    if (!payload) return;

    encounterId   = payload.id;
    encounterName = payload.name || 'Encounter';

    // apply the saved state to the live tracker
    window.CombatState?.applyState?.(payload.state);
  }

  // Quick-save: never prompts. Always reuses the current encounterId if possible.
  function saveEncounter(showToast = true) {
    if (!window.EncounterStore || !window.CombatState) return;

    // If we somehow don't have an id yet, reuse the last draft id first
    if (!encounterId) {
      const last = window.EncounterStore.getLastId();
      if (last) {
        const payload = window.EncounterStore.load(last);
        if (payload) {
          encounterId   = payload.id;
          encounterName = payload.name || encounterName;
        }
      }
    }

    const state = window.CombatState.getSerializableState?.();
    // Defensive: ensure we’re saving the actual in-memory arrays
    if (!state || !Array.isArray(state.combatants)) {
      console.warn('[persist] No state to save or malformed state', state);
      return;
    }

    // Save (EncounterStore.save reuses id when provided)
    encounterId = window.EncounterStore.save({
      id: encounterId,
      name: encounterName,
      state
    });

    // Mark this as the active draft so subsequent saves (and other pages) pick it up
    window.EncounterStore.setLastId(encounterId);

    if (showToast) toast('Saved');
  }

  // Debounced autosave used by the tracker after any change
  function scheduleAutosave() {
    if (!window.EncounterStore) return;
    clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(() => saveEncounter(false), AUTOSAVE_MS);
  }
  // provide to tracker.js (it calls window.scheduleAutosave?.())
  window.scheduleAutosave = scheduleAutosave;

  // Manual load picker (simple prompt UI kept as-is)
  function loadEncounterPrompt() {
    if (!window.EncounterStore) return;
    const list = window.EncounterStore.list();
    if (!list.length) { alert('No saved encounters yet.'); return; }

    const menu = list
      .map((e,i)=>`${i+1}. ${e.name} (${new Date(e.updated).toLocaleString()})`)
      .join('\n');
    const ans = prompt(`Load which encounter?\n\n${menu}\n\nEnter number:`);
    const idx = parseInt(ans,10)-1;
    if (!Number.isFinite(idx) || idx<0 || idx>=list.length) return;

    const item    = list[idx];
    const payload = window.EncounterStore.load(item.id);
    if (!payload) return;

    encounterId   = payload.id;
    encounterName = payload.name || 'Encounter';

    window.EncounterStore.setLastId(encounterId);
    window.CombatState.applyState(payload.state);

    toast(`Loaded: ${encounterName}`);
  }

  // Restore on first load of encounter.html
  function tryRestoreLastDraftOnce() {
    hydrateFromLastDraft();
  }

  // Wire the buttons
  function wireButtons() {
    document.getElementById('saveEncounterBtn')
      ?.addEventListener('click', (e)=>{ e.preventDefault(); saveEncounter(true); });

    document.getElementById('loadEncounterBtn')
      ?.addEventListener('click', (e)=>{ e.preventDefault(); loadEncounterPrompt(); });
  }

  // Subscribe for autosave on any state change
  window.CombatState?.subscribe?.(() => scheduleAutosave());

  // Expose a small API
  window.CombatPersist = { saveEncounter, loadEncounterPrompt, tryRestoreLastDraftOnce };

  // On page load, sync id/name from last opened draft
  tryRestoreLastDraftOnce();
  wireButtons();

  // Safety net: save on tab close if there are changes queued
  window.addEventListener('beforeunload', () => {
    // clear debounce and force a final silent save
    if (_autosaveTimer) {
      clearTimeout(_autosaveTimer);
      saveEncounter(false);
    }
  });
})();
// scripts/combat-persist.js
(() => {
  const AUTOSAVE_MS = 800;
  let _autosaveTimer = null;

  // Persisted identifiers for the current draft
  let encounterId   = null;          // stable id for this open encounter
  let encounterName = 'Encounter';   // display name (shown on View Encounters)

  // --- tiny toast ---
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

  // Ensure our local encounterId/Name reflect the "last opened draft"
  function hydrateFromLastDraft() {
    if (!window.EncounterStore) return;
    if (encounterId) return; // already hydrated in this session

    const qsId   = new URLSearchParams(location.search).get('encounterId');
    const lastId = window.EncounterStore.getLastId();

    const chosen = qsId || lastId;
    if (!chosen) return; // nothing saved yet

    const payload = window.EncounterStore.load(chosen);
    if (!payload) return;

    encounterId   = payload.id;
    encounterName = payload.name || 'Encounter';

    // apply the saved state to the live tracker
    window.CombatState?.applyState?.(payload.state);
  }

  // Quick-save: never prompts. Always reuses the current encounterId if possible.
  function saveEncounter(showToast = true) {
    if (!window.EncounterStore || !window.CombatState) return;

    // If we somehow don't have an id yet, reuse the last draft id first
    if (!encounterId) {
      const last = window.EncounterStore.getLastId();
      if (last) {
        const payload = window.EncounterStore.load(last);
        if (payload) {
          encounterId   = payload.id;
          encounterName = payload.name || encounterName;
        }
      }
    }

    const state = window.CombatState.getSerializableState?.();
    // Defensive: ensure we’re saving the actual in-memory arrays
    if (!state || !Array.isArray(state.combatants)) {
      console.warn('[persist] No state to save or malformed state', state);
      return;
    }

    // Save (EncounterStore.save reuses id when provided)
    encounterId = window.EncounterStore.save({
      id: encounterId,
      name: encounterName,
      state
    });

    // Mark this as the active draft so subsequent saves (and other pages) pick it up
    window.EncounterStore.setLastId(encounterId);

    if (showToast) toast('Saved');
  }

  // Debounced autosave used by the tracker after any change
  function scheduleAutosave() {
    if (!window.EncounterStore) return;
    clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(() => saveEncounter(false), AUTOSAVE_MS);
  }
  // provide to tracker.js (it calls window.scheduleAutosave?.())
  window.scheduleAutosave = scheduleAutosave;

  // Manual load picker (simple prompt UI kept as-is)
  function loadEncounterPrompt() {
    if (!window.EncounterStore) return;
    const list = window.EncounterStore.list();
    if (!list.length) { alert('No saved encounters yet.'); return; }

    const menu = list
      .map((e,i)=>`${i+1}. ${e.name} (${new Date(e.updated).toLocaleString()})`)
      .join('\n');
    const ans = prompt(`Load which encounter?\n\n${menu}\n\nEnter number:`);
    const idx = parseInt(ans,10)-1;
    if (!Number.isFinite(idx) || idx<0 || idx>=list.length) return;

    const item    = list[idx];
    const payload = window.EncounterStore.load(item.id);
    if (!payload) return;

    encounterId   = payload.id;
    encounterName = payload.name || 'Encounter';

    window.EncounterStore.setLastId(encounterId);
    window.CombatState.applyState(payload.state);

    toast(`Loaded: ${encounterName}`);
  }

  // Restore on first load of encounter.html
  function tryRestoreLastDraftOnce() {
    hydrateFromLastDraft();
  }

  // Wire the buttons
  function wireButtons() {
    document.getElementById('saveEncounterBtn')
      ?.addEventListener('click', (e)=>{ e.preventDefault(); saveEncounter(true); });

    document.getElementById('loadEncounterBtn')
      ?.addEventListener('click', (e)=>{ e.preventDefault(); loadEncounterPrompt(); });
  }

  // Subscribe for autosave on any state change
  window.CombatState?.subscribe?.(() => scheduleAutosave());

  // Expose a small API
  window.CombatPersist = { saveEncounter, loadEncounterPrompt, tryRestoreLastDraftOnce };

  // On page load, sync id/name from last opened draft
  tryRestoreLastDraftOnce();
  wireButtons();

  // Safety net: save on tab close if there are changes queued
  window.addEventListener('beforeunload', () => {
    // clear debounce and force a final silent save
    if (_autosaveTimer) {
      clearTimeout(_autosaveTimer);
      saveEncounter(false);
    }
  });
})();
