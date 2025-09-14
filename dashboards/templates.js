// Basic templates + HTML renderer for a fixed-width “sheet”

/** Shape:
 * {
 *   type: 'character' | 'monster',
 *   name, ac, hp: {max, current, temp}, prof, pp, abilities:{str,dex,con,int,wis,cha},
 *   languages: [], spells: { atWill:[], byLevel:{1:{slotsMax,used,spells:[]}, ...} }
 * }
 */

export const Templates = {
  character() {
    return {
      type: 'character',
      name: 'Character Name',
      ac: 10,
      hp: { max: 100, current: 100, temp: 0 },
      prof: 2,
      pp: 10,
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      languages: ['Common'],
      spells: { atWill: [], byLevel: {} }
    };
  },
  monster() {
    return {
      type: 'monster',
      name: 'Monster / NPC',
      ac: 12,
      hp: { max: 30, current: 30, temp: 0 },
      prof: 2,
      pp: 10,
      abilities: { str: 12, dex: 10, con: 12, int: 8, wis: 10, cha: 8 },
      languages: ['—'],
      spells: { atWill: [], byLevel: {} }
    };
  }
};

// -------------------- Rendering --------------------

export function renderSheet(container, data){
  container.innerHTML = sheetHTML(data);
  wireInputs(container, data);
}

function abilityGrid(a){
  const row = (k, label) => `
    <div class="card" style="grid-column:span 2;">
      <h4>${label}</h4>
      <input type="number" data-bind="abilities.${k}" value="${a[k] ?? 10}" />
    </div>`;
  return `
    <div class="grid">
      ${row('str','STR')}
      ${row('dex','DEX')}
      ${row('con','CON')}
      ${row('int','INT')}
      ${row('wis','WIS')}
      ${row('cha','CHA')}
    </div>`;
}

function spellsSection(spells){
  const lvl = (L) => spells.byLevel?.[L] ?? {slotsMax:0, used:0, spells:[]};
  const row = (L) => `
    <div class="card" style="grid-column:span 6;">
      <h4>Level ${L} Spells</h4>
      <div class="kv small">
        <label>Slots</label>
        <input type="number" min="0" data-bind="spells.byLevel.${L}.slotsMax" value="${lvl(L).slotsMax}">
        <label>Used</label>
        <input type="number" min="0" data-bind="spells.byLevel.${L}.used" value="${lvl(L).used}">
      </div>
      <textarea rows="3" placeholder="comma separated" data-bind="spells.byLevel.${L}.spells">${(lvl(L).spells ?? []).join(', ')}</textarea>
    </div>`;
  return `
    <div class="card" style="grid-column:1 / -1;">
      <h4>Cantrips / At-Will</h4>
      <div class="spell-pills" id="atWillPills">
        ${(spells.atWill||[]).map(s => `<span class="pill">${escapeHTML(s)}</span>`).join('')}
      </div>
      <input type="text" placeholder="Add cantrip and press Enter" data-add-pill="spells.atWill">
    </div>
    <div class="grid">
      ${row(1)}${row(2)}
      ${row(3)}${row(4)}
      ${row(5)}${row(6)}
      ${row(7)}${row(8)}
      ${row(9)}
    </div>`;
}

function sheetHTML(d){
  const a = d.abilities || {};
  const hp = d.hp || {max:0,current:0,temp:0};
  const lang = (d.languages||[]).join(', ');

  return `
    <div class="grid">
      <div class="card" style="grid-column:1 / span 8;">
        <h4>Name</h4>
        <input type="text" data-bind="name" value="${escapeHTML(d.name||'')}" />
      </div>
      <div class="card" style="grid-column:span 2;text-align:center;">
        <h4>AC</h4>
        <input type="number" class="num" data-bind="ac" value="${d.ac ?? 10}" />
      </div>
      <div class="card" style="grid-column:span 2;text-align:center;">
        <h4>Prof</h4>
        <input type="number" class="num" data-bind="prof" value="${d.prof ?? 2}" />
      </div>

      <div class="card" style="grid-column:1 / span 4;">
        <h4>Hit Points</h4>
        <div class="kv">
          <label>Max</label><input type="number" data-bind="hp.max" value="${hp.max}">
          <label>Current</label><input type="number" data-bind="hp.current" value="${hp.current}">
          <label>Temp</label><input type="number" data-bind="hp.temp" value="${hp.temp}">
        </div>
      </div>

      <div class="card" style="grid-column:span 4;">
        <h4>Passive Perception</h4>
        <input type="number" data-bind="pp" value="${d.pp ?? 10}">
      </div>
      <div class="card" style="grid-column:span 4;">
        <h4>Languages</h4>
        <input type="text" data-bind="languagesCSV" value="${escapeHTML(lang)}" placeholder="Common, Elvish, …">
      </div>

      <div class="card" style="grid-column:1 / -1;">
        <h4>Abilities</h4>
        ${abilityGrid(a)}
      </div>

      <div class="card" style="grid-column:1 / -1;">
        <h4>Spells</h4>
        ${spellsSection(d.spells || {})}
      </div>
    </div>
  `;
}

// -------------------- Two-way binding + pills --------------------

function setDeep(obj, path, value){
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++){
    const k = parts[i];
    if (!(k in cur) || typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length-1]] = value;
}
function getDeep(obj, path, def){
  return path.split('.').reduce((o,k) => (o&&k in o)?o[k]:def, obj);
}
function csvToArray(s){ return String(s||'').split(',').map(t=>t.trim()).filter(Boolean); }
function escapeHTML(s){ return String(s||'').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

function wireInputs(root, data){
  // simple inputs
  root.querySelectorAll('[data-bind]').forEach(inp => {
    inp.addEventListener('input', () => {
      const path = inp.dataset.bind;
      let v = inp.value;
      if (inp.type === 'number') v = Number(v||0);
      if (path === 'languagesCSV') {
        setDeep(data, 'languages', csvToArray(inp.value));
      } else {
        setDeep(data, path, v);
      }
      document.dispatchEvent(new CustomEvent('sheet:change', {detail:{data}}));
    });
  });

  // add-pill inputs (cantrips/at-will)
  root.querySelectorAll('[data-add-pill]').forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const path = inp.dataset.addPill;
      const val = inp.value.trim();
      if (!val) return;
      const arr = getDeep(data, path, []);
      arr.push(val);
      setDeep(data, path, arr);
      inp.value = '';
      document.dispatchEvent(new CustomEvent('sheet:change', {detail:{data}}));
    });
  });
}
