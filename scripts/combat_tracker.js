/* scripts/combat_tracker.js
   Minimal combat tracker logic for your current HTML
*/

(() => {
  // ======= STATE =======
  let combatants = [];
  let round = 1;
  let currentTurnIndex = 0;
  let historyLog = [];

    // ======= TEMP HP (simple “sources”; duration optional) =======
  const activeTempSources = (c, nowRound = round) => (c.tempHpSources || []).filter(s => nowRound < s.appliedRound + s.duration);
  const totalTempHp = (c) => activeTempSources(c).reduce((sum, s) => sum + s.amount, 0);




  function addGroup() {
    // Minimal: just adds a labeled row (no nesting UI in this file)
    const c = {
      id: uid(),
      name: uniqueName('Group'),
      init: 10, ac: '—',
      hp: 0, maxHp: 0,
      tempHpSources: [],
      role: 'DM Group',
      imageUrl: '📁'
    };
    combatants.unshift(c);
    log(`📦 Group created: ${c.name}.`);
    render();
  }

})();