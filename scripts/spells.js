// scripts/spells.js
(() => {
  function ensureSlotsStyles() {
    if (document.getElementById('slots-pips-style')) return;
    const el = document.createElement('style');
    el.id = 'slots-pips-style';
    el.textContent = `
      .slots-inline .slot-row { gap:.5rem; }
      .slots-inline .slot-pips{ display:flex; flex-wrap:wrap; gap:4px; align-items:center; margin-left:.5rem; }
      .slots-inline .slot-pip{ width:14px; height:14px; border-radius:50%; box-sizing:border-box; border:2px solid currentColor; opacity:.35; }
      .slots-inline .slot-pip.available{ background: currentColor; opacity: 1; }
      .slots-inline .slot-pip.spent{ background: transparent; }
    `;
    document.head.appendChild(el);
  }

  function ensureSpellData(c) {
    if (!c.spellSlots) {
      c.spellSlots = { isSpellcaster: true, slots: {} };
      for (let L = 1; L <= 9; L++) c.spellSlots.slots[L] = { max: 0, used: 0 };
    }
    return c.spellSlots;
  }

  function renderPips(sd, L){
    const { max, used } = sd.slots[L];
    const left = Math.max(0, max - used);
    const dots = [];
    for (let i = 0; i < left; i++) dots.push('<span class="slot-pip available" title="Available"></span>');
    for (let i = 0; i < used; i++) dots.push('<span class="slot-pip spent" title="Spent"></span>');
    return dots.join('');
  }

  function renderSlotsRows(c){
    const sd = ensureSpellData(c);
    const rows = [];
    for (let L=1; L<=9; L++){
      const { max, used } = sd.slots[L];
      rows.push(`
        <div class="slot-row" data-level="${L}" style="display:flex;align-items:center;gap:.5rem;">
          <div style="width:2.2rem;font-weight:700;">L${L}</div>
          <button class="slot-dec" data-level="${L}" title="Spend one">−</button>
          <span class="slot-count" data-level="${L}" style="min-width:60px;text-align:center;">${used}/${max}</span>
          <button class="slot-inc" data-level="${L}" title="Recover one">+</button>
          <div class="slot-pips" data-level="${L}" aria-label="" style="flex:1;">${renderPips(sd, L)}</div>
          <div style="margin-left:.5rem;">Max</div>
          <input class="slot-max" data-level="${L}" type="number" min="0" step="1" value="${max}" style="width:64px;padding:.25rem .4rem;">
        </div>`);
    }
    return rows.join('');
  }

  function buildSlotsInlineHTML(c){
    ensureSlotsStyles();
    const name = (c?.name || 'Combatant');
    return `
    <div class="slots-inline-inner" style="background:#fff;border:1px solid #ddd;border-radius:10px;padding:8px;margin-top:6px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;">
        <div style="font-weight:700;">🪄 Spell Slots — ${name.replace(/</g,'&lt;')}</div>
        <div style="display:flex;gap:.5rem;">
          <button class="slots-longrest">Long Rest</button>
          <button class="slots-close">Close</button>
        </div>
      </div>
      <div class="slots-body" style="display:flex;flex-direction:column;gap:.35rem;">
        ${renderSlotsRows(c)}
      </div>
    </div>`;
  }

  function syncSlotRow(container, L, sd){
    const count = container.querySelector(`.slot-count[data-level="${L}"]`);
    if (count) count.textContent = `${sd.slots[L].used}/${sd.slots[L].max}`;
    const pips = container.querySelector(`.slot-pips[data-level="${L}"]`);
    if (pips) pips.innerHTML = renderPips(sd, L);
  }

  // Export for the tracker
  window.SpellUI = {
    ensureSpellData,
    buildSlotsInlineHTML,
    syncSlotRow
  };
})();
