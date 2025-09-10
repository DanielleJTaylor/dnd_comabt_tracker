// scripts/hp-popup.js
document.addEventListener('DOMContentLoaded', () => {
  // --- Build a single anchored flyout (once) ---
  const fly = document.createElement('div');
  fly.className = 'hp-flyout hidden';
  fly.setAttribute('role', 'dialog');
  fly.setAttribute('aria-modal', 'false');
  fly.innerHTML = `
    <div class="hp-flyout-row">
      <label>Damage:</label>
      <input id="hpFlyDamage" type="number" inputmode="numeric" step="1">
      <label>Heal:</label>
      <input id="hpFlyHeal" type="number" inputmode="numeric" step="1">
      <button id="hpFlyApply" class="btn">Apply</button>
      <button id="hpFlyCancel" class="btn btn-secondary" aria-label="Cancel">✕</button>
    </div>
    <div class="hp-flyout-hint">Damage drains Temp → Current. Heal restores Current up to Max.</div>
  `;
  document.body.appendChild(fly);

  // refs
  const dmgInput  = fly.querySelector('#hpFlyDamage');
  const healInput = fly.querySelector('#hpFlyHeal');
  const applyBtn  = fly.querySelector('#hpFlyApply');
  const cancelBtn = fly.querySelector('#hpFlyCancel');

  // state
  let targetId = null;
  let anchorEl = null;  // the .hp-cell that opened the flyout
  let lastPos  = 'below'; // for arrow orientation

  // utilities
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const coerceInt = (n, def = 0) => {
    if (n === '' || n == null) return def;
    const v = parseInt(n, 10);
    return Number.isFinite(v) ? v : def;
  };

  function findById(id) {
    const list = window.CombatAPI?.getAllCombatants?.() || [];
    for (const item of list) {
      if (item.type === 'combatant' && item.id === id) return item;
      if (item.type === 'group') {
        const hit = (item.members || []).find(m => m.id === id);
        if (hit) return hit;
      }
    }
    return null;
  }

  function applyDamageThenHeal(cmb, damageAmt, healAmt) {
    const maxHp = coerceInt(cmb.maxHp, 1);
    let hp      = clamp(coerceInt(cmb.hp, 0), 0, maxHp);
    let tempHp  = clamp(coerceInt(cmb.tempHp, 0), 0, 999999);

    if (damageAmt > 0) {
      const fromTemp = Math.min(tempHp, damageAmt);
      tempHp -= fromTemp;
      const remain   = damageAmt - fromTemp;
      hp = clamp(hp - remain, 0, maxHp);
    }
    if (healAmt > 0) {
      hp = clamp(hp + healAmt, 0, maxHp);
    }
    cmb.hp = hp;
    cmb.tempHp = tempHp;
  }

  // ---- flyout open/close/position ----
  function openFor(id, anchor) {
    targetId = id;
    anchorEl = anchor;
    dmgInput.value = '';
    healInput.value = '';

    fly.classList.remove('hidden');
    positionFlyout();

    // focus first field
    dmgInput.focus();
    dmgInput.select();

    // set inertness to help screen readers
    fly.setAttribute('aria-hidden', 'false');
  }

  function closeFlyout() {
    if (fly.classList.contains('hidden')) return;
    fly.classList.add('hidden');
    fly.setAttribute('aria-hidden', 'true');
    targetId = null;
    anchorEl = null;
  }

  function positionFlyout() {
    if (!anchorEl || fly.classList.contains('hidden')) return;

    // size the flyout first so we can measure it
    fly.style.maxWidth = 'unset';
    fly.style.left = '-10000px';
    fly.style.top  = '-10000px';

    const margin = 8; // space from anchor
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    const a = anchorEl.getBoundingClientRect();
    const fRect = fly.getBoundingClientRect();

    // Try below first; if not enough space, go above
    const spaceBelow = vh - (a.bottom);
    const spaceAbove = a.top;

    let top;
    if (spaceBelow >= fRect.height + margin) {
      top = a.bottom + margin;
      lastPos = 'below';
      fly.classList.remove('hp-flyout-above');
      fly.classList.add('hp-flyout-below');
    } else {
      top = a.top - margin - fRect.height;
      lastPos = 'above';
      fly.classList.remove('hp-flyout-below');
      fly.classList.add('hp-flyout-above');
    }

    // center horizontally over the HP cell, but keep inside viewport
    let left = a.left + (a.width / 2) - (fRect.width / 2);
    left = clamp(left, 8, vw - fRect.width - 8);

    // account for scroll (position: fixed handles it already)
    fly.style.left = `${left}px`;
    fly.style.top  = `${top}px`;
  }

  // reposition on scroll/resize (if open)
  window.addEventListener('scroll', () => positionFlyout(), { passive: true });
  window.addEventListener('resize', () => positionFlyout());

  // ---- handlers ----
  applyBtn.addEventListener('click', () => {
    if (!targetId) return;
    const damageAmt = Math.max(0, coerceInt(dmgInput.value, 0));
    const healAmt   = Math.max(0, coerceInt(healInput.value, 0));
    if (damageAmt === 0 && healAmt === 0) { closeFlyout(); return; }

    const c = findById(targetId);
    if (c) {
      applyDamageThenHeal(c, damageAmt, healAmt);
      window.CombatAPI?.render?.();
    }
    closeFlyout();
  });

  cancelBtn.addEventListener('click', closeFlyout);

  // ESC closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !fly.classList.contains('hidden')) closeFlyout();
  });

  // Click outside closes
  document.addEventListener('mousedown', (e) => {
    if (fly.classList.contains('hidden')) return;
    if (fly.contains(e.target)) return;
    // if click is inside the anchor cell, ignore (the cell might have other clicks)
    if (anchorEl && anchorEl.contains(e.target)) return;
    closeFlyout();
  });

  // === Right-click to open popup on heart, current HP, or max HP ===
  const body = document.getElementById('combatant-list-body');
  body?.addEventListener('contextmenu', (e) => {
    const hpCell = e.target.closest?.('.hp-cell');
    if (!hpCell) return;

    const onHeart = !!e.target.closest('.hp-heart');
    const onCur   = !!e.target.closest('.editable-int[data-field="hp"]');
    const onMax   = !!e.target.closest('.editable-int[data-field="maxHp"]');
    if (!onHeart && !onCur && !onMax) return;

    e.preventDefault();
    const row = hpCell.closest('.tracker-table-row');
    if (!row) return;
    openFor(row.dataset.id, hpCell);
  });

  // Heart left-click: do nothing (but don’t start any editor)
  body?.addEventListener('click', (e) => {
    if (e.target.closest('.hp-heart')) {
      e.stopPropagation();
    }
  });

  // Keep the inline edit on numbers via your existing activateInlineEdit (no changes needed).
});
