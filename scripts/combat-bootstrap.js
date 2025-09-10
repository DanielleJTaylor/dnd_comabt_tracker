// scripts/combat-bootstrap.js
(() => {
  function $(s){ return document.querySelector(s); }

  function wire() {
    const S = window.CombatState;
    const P = window.CombatPersist;

    if (!S) { console.error('[bootstrap] CombatState missing'); return; }

    // Core controls (save/load are already wired in persist)
    $('#addCombatantBtn')?.addEventListener('click', () => S.addCombatant());
    $('#addGroupBtn')?.addEventListener('click', () => S.addGroupByName(`New Group ${S.getSnapshot().combatants.filter(x=>x.type==='group').length+1}`));
    $('#sort-init-asc')?.addEventListener('click', () => S.sortByInit('asc'));
    $('#sort-init-desc')?.addEventListener('click', () => S.sortByInit('desc'));
    $('#prevTurnBtn')?.addEventListener('click', () => S.prevTurn());
    $('#nextTurnBtn')?.addEventListener('click', () => S.nextTurn());

    // First-time restore
    P?.tryRestoreLastDraftOnce?.();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
