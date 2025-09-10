// scripts/encounters-store.js
// Lightweight localStorage store for encounters + autosave

(() => {
  const INDEX_KEY = 'encounters_index_v1';      // array of {id, name, updated}
  const DRAFT_KEY = 'encounter_current_draft';  // last-opened encounter id
  const EKEY = (id) => `encounter_${id}_v1`;

  const nowISO = () => new Date().toISOString();
  const readJSON = (k, fallback) => {
    try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : fallback; }
    catch { return fallback; }
  };
  const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  function loadIndex() { return readJSON(INDEX_KEY, []); }
  function saveIndex(idx) { writeJSON(INDEX_KEY, idx); }

  function upsertIndexEntry({ id, name }) {
    const idx = loadIndex();
    const i = idx.findIndex(e => e.id === id);
    const item = { id, name: name || 'Encounter', updated: nowISO() };
    if (i >= 0) idx[i] = { ...idx[i], ...item };
    else idx.unshift(item);
    saveIndex(idx);
  }

  function newId() { return 'enc_' + Math.random().toString(36).slice(2, 9); }

  // Public API used by combat_tracker.js & view-encounters.js
  window.EncounterStore = {
    // Save full encounter state (you pass the shape)
    save({ id, name, state }) {
      if (!id) id = newId();
      const payload = { id, name: name || 'Encounter', state, updated: nowISO() };
      writeJSON(EKEY(id), payload);
      upsertIndexEntry({ id, name: payload.name });
      localStorage.setItem(DRAFT_KEY, id);
      return id;
    },

    // Load one encounter payload (or null)
    load(id) { return readJSON(EKEY(id), null); },

    // Delete encounter
    remove(id) {
      try { localStorage.removeItem(EKEY(id)); } catch {}
      const idx = loadIndex().filter(e => e.id !== id);
      saveIndex(idx);
      const cur = localStorage.getItem(DRAFT_KEY);
      if (cur === id) localStorage.removeItem(DRAFT_KEY);
    },

    // Rename encounter
    rename(id, newName) {
      const p = readJSON(EKEY(id), null);
      if (!p) return false;
      p.name = newName || p.name;
      writeJSON(EKEY(id), p);
      upsertIndexEntry({ id, name: p.name });
      return true;
    },

    // List encounters (for view page)
    list() { return loadIndex(); },

    // Remember last draft opened
    getLastId() { return localStorage.getItem(DRAFT_KEY) || null; },
    setLastId(id) { if (id) localStorage.setItem(DRAFT_KEY, id); },

    // Export single encounter as JSON blob url
    exportHref(id) {
      const p = readJSON(EKEY(id), null);
      if (!p) return null;
      const url = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }));
      return url;
    }
  };
})();
