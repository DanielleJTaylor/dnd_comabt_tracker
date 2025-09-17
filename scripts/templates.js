// scripts/templates.js
(() => {
  const uid = (p = 'b_') => `${p}${Date.now()}_${Math.floor(Math.random()*1e6)}`;

  // Small helpers for consistent HTML bits
  const box = (title, body) => `
    <div class="owl-box">
      <div class="owl-box-title">${title}</div>
      <div class="owl-box-body">${body}</div>
    </div>`;

  const pill = (label, value) =>
    `<div class="stat-pill"><span class="k">${label}</span><span class="v">${value}</span></div>`;

  // ---------- MONSTER / NPC ----------
  function createMonsterBlocks() {
    const header = `
      <div class="owl-header">
        <div class="name">Monster / NPC Name</div>
        <div class="subtitle">Medium humanoid, any alignment</div>
      </div>`;

    const topStats = `
      <div class="flx gap">
        ${pill('AC', '13 (leather)')}
        ${pill('HP', '45 (6d8 + 18)')}
        ${pill('Speed', '30 ft.')}
        ${pill('PP', '12')}
      </div>`;

    const abilities = `
      <div class="abil-grid">
        <div><b>STR</b><div class="val">14 (+2)</div></div>
        <div><b>DEX</b><div class="val">12 (+1)</div></div>
        <div><b>CON</b><div class="val">16 (+3)</div></div>
        <div><b>INT</b><div class="val">10 (+0)</div></div>
        <div><b>WIS</b><div class="val">11 (+0)</div></div>
        <div><b>CHA</b><div class="val">13 (+1)</div></div>
      </div>`;

    const savesSkills = `
      <div class="two-col">
        <div>
          ${box('Saving Throws', 'Str +4, Con +5')}
          ${box('Skills', 'Perception +2, Stealth +3')}
          ${box('Senses', 'darkvision 60 ft., passive Perception 12')}
        </div>
        <div>
          ${box('Damage Resistances', '—')}
          ${box('Damage Immunities', '—')}
          ${box('Condition Immunities', '—')}
          ${box('Languages', 'Common')}
          ${box('Challenge', '2 (450 XP)')}
        </div>
      </div>`;

    const traits = box('Traits', `
      <p><b>Keen Hearing and Smell.</b> The creature has advantage on Wisdom (Perception) checks that rely on hearing or smell.</p>
      <p><b>Pack Tactics.</b> The creature has advantage on an attack roll against a creature if at least one of the creature’s allies is within 5 feet of the creature and the ally isn’t incapacitated.</p>
    `);

    const actions = box('Actions', `
      <p><b>Multiattack.</b> The creature makes two attacks.</p>
      <p><b>Scimitar.</b> Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) slashing damage.</p>
      <p><b>Shortbow.</b> Ranged Weapon Attack: +3 to hit, range 80/320 ft., one target. Hit: 4 (1d6 + 1) piercing damage.</p>
    `);

    const bonusReacts = `
      <div class="two-col">
        ${box('Bonus Actions', '<p><em>(Add any bonus actions here.)</em></p>')}
        ${box('Reactions', '<p><em>(Add any reactions here.)</em></p>')}
      </div>`;

    const legendary = box('Legendary Actions', `
      <p><em>(If applicable.) The creature can take 3 legendary actions, choosing from the options below…</em></p>
    `);

    const portrait = `
      <div class="portrait-box">
        <div class="ph">Portrait / Token</div>
      </div>`;

    // Grid: 6 columns. h is “row units” used by your sheet renderer.
    return [
      // Header across top
      { id: uid(), type: 'text', x: 0, y: 0, w: 6, h: 2, html: header },

      // Top stats pills (full width)
      { id: uid(), type: 'text', x: 0, y: 2, w: 6, h: 2, html: box('Stats', topStats) },

      // Abilities row (full width)
      { id: uid(), type: 'text', x: 0, y: 4, w: 6, h: 3, html: box('Ability Scores', abilities) },

      // Two-column info (saves/skills etc.) — split into left (3) / right (3)
      { id: uid(), type: 'text', x: 0, y: 7, w: 3, h: 6, html: savesSkills.replace(/<div class="two-col">([\s\S]*?)<\/div>/, '$1') },
      { id: uid(), type: 'text', x: 3, y: 7, w: 3, h: 6, html: '' }, // right half is injected by preceding HTML; leave empty block to reserve space

      // Traits
      { id: uid(), type: 'text', x: 0, y: 13, w: 6, h: 4, html: traits },

      // Actions
      { id: uid(), type: 'text', x: 0, y: 17, w: 6, h: 5, html: actions },

      // Bonus + Reactions side-by-side
      { id: uid(), type: 'text', x: 0, y: 22, w: 3, h: 4, html: bonusReacts.replace(/<div class="two-col">([\s\S]*?)<\/div>/, '$1').split('</div>')[0] + '</div>' },
      { id: uid(), type: 'text', x: 3, y: 22, w: 3, h: 4, html: bonusReacts.replace(/<div class="two-col">([\s\S]*?)<\/div>/, '$1').split('</div>')[1] + '</div>' },

      // Legendary (optional)
      { id: uid(), type: 'text', x: 0, y: 26, w: 6, h: 4, html: legendary },

      // Portrait box (optional, place low; you can move it later)
      { id: uid(), type: 'text', x: 0, y: 30, w: 2, h: 5, html: portrait },
    ];
  }

  // (Keeping character template available if you use it elsewhere)
  function createCharacterBlocks() {
    return [
      { id: uid(), type: 'text', x: 0, y: 0, w: 6, h: 2, html: '<h2>Character Name</h2><em>“A character quote.”</em>' },
      { id: uid(), type: 'text', x: 0, y: 2, w: 3, h: 4, html: '<div class="portrait-box"><div class="ph">Portrait</div></div>' },
      { id: uid(), type: 'text', x: 3, y: 2, w: 3, h: 4, html: '<b>Level</b> — <b>Class</b> — <b>Background</b><br><b>Race</b> — <b>Alignment</b><br><b>Armor</b> — <b>Weapons</b><br><b>Languages</b>' },
      { id: uid(), type: 'text', x: 0, y: 6, w: 2, h: 2, html: '<b>AC</b><div style="font-size:2rem;">10</div>' },
      { id: uid(), type: 'text', x: 2, y: 6, w: 2, h: 2, html: '<b>HP</b><div>Max: 10<br>Current: 10<br>Temp: 0</div>' },
      { id: uid(), type: 'text', x: 4, y: 6, w: 2, h: 2, html: '<b>Death Saves</b>' },
      { id: uid(), type: 'text', x: 0, y: 8, w: 6, h: 3, html: '<b>Ability Scores</b><br>STR DEX CON INT WIS CHA' },
    ];
  }

  window.DashTemplates = {
    monster: createMonsterBlocks,
    character: createCharacterBlocks,
  };
})();
