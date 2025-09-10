// scripts/group-selector.js
// Bulk selection utilities: move to group, delete, and inline damage/heal (replaces hp-popup).
(() => {
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ---- DOM targets (resilient lookups) ----
  const bulkBar            = $('#bulkActionsBar');
  const selectionCounterEl = $('#selectionCounter') || (() => {
    const s = document.createElement('span'); s.id='selectionCounter';
    bulkBar?.appendChild(s); return s;
  })();

  let bulkDamageHealBtn = $('#bulkDamageHealBtn');
  let bulkDeleteBtn     = $('#bulkDeleteBtn');
  let bulkGroupBtn      = $('#bulkGroupBtn');

  // If your HTML didn't include the three bulk buttons, create them:
  if (bulkBar && (!bulkDamageHealBtn || !bulkDeleteBtn || !bulkGroupBtn)) {
    const actions = bulkBar.querySelector('.bulk-actions-actions') || (() => {
      const d = document.createElement('div'); d.className='bulk-actions-actions'; bulkBar.appendChild(d); return d;
    })();
    if (!bulkDamageHealBtn) {
      bulkDamageHealBtn = document.createElement('button');
      bulkDamageHealBtn.id = 'bulkDamageHealBtn';
      bulkDamageHealBtn.textContent = 'Damage / Heal';
      actions.appendChild(bulkDamageHealBtn);
    }
    if (!bulkDeleteBtn) {
      bulkDeleteBtn = document.createElement('button');
      bulkDeleteBtn.id = 'bulkDeleteBtn';
      bulkDeleteBtn.textContent = 'Delete Selected';
      actions.appendChild(bulkDeleteBtn);
    }
    if (!bulkGroupBtn) {
      bulkGroupBtn = document.createElement('button');
      bulkGroupBtn.id = 'bulkGroupBtn';
      bulkGroupBtn.textContent = 'Move to Group';
      actions.appendChild(bulkGroupBtn);
    }
  }

  // Hint + confirm for "move to group" (optional elements in HTML)
  const chooseGroupHint  = $('#choose-group-hint');
  const confirmMoveMini  = $('#confirm-move-mini');
  const confirmMiniText  = $('#confirm-mini-text');
  const confirmMiniYes   = $('#confirm-mini-yes');
  const confirmMiniNo    = $('#confirm-mini-no');

  // ---- Inline Damage/Heal mini-panel (below bulk bar, like move confirmation) ----
  let bulkHpMini = $('#bulk-hp-mini');
  if (!bulkHpMini && bulkBar?.parentNode) {
    bulkHpMini = document.createElement('div');
    bulkHpMini.id = 'bulk-hp-mini';
    bulkHpMini.className = 'confirm-mini hidden';
    bulkHpMini.innerHTML = `
      <span id="bulk-hp-mini-title" style="font-weight:600;">Apply Damage / Heal to selected</span>
      <div class="form-row" style="display:flex;gap:.5rem;align-items:center;">
        <label for="bulkDamageInp" style="white-space:nowrap;">Damage:</label>
        <input id="bulkDamageInp" type="number" step="1" inputmode="numeric" style="width:7rem;padding:.25rem .4rem;">
        <label for="bulkHealInp" style="white-space:nowrap;">Heal:</label>
        <input id="bulkHealInp" type="number" step="1" inputmode="numeric" style="width:7rem;padding:.25rem .4rem;">
      </div>
      <div class="confirm-mini-actions">
        <button id="bulkHpApplyBtn" class="btn">Apply</button>
        <button id="bulkHpCancelBtn" class="btn btn-secondary">Cancel</button>
      </div>
    `;
    bulkBar.parentNode.insertBefore(bulkHpMini, bulkBar.nextSibling);
  }
  const bulkDamageInp  = $('#bulkDamageInp');
  const bulkHealInp    = $('#bulkHealInp');
  const bulkHpApplyBtn = $('#bulkHpApplyBtn');
  const bulkHpCancelBtn= $('#bulkHpCancelBtn');

  // ---- Helpers ----
  function show(el) { el?.classList?.remove('hidden'); }
  function hide(el) { el?.classList?.add('hidden'); }

  function getSelectedIds() { return window.CombatState?.getSelectedIds?.() || new Set(); }

  function countSelected() { return getSelectedIds().size; }

  function updateBulkBarVisibility(snapshot) {
    const n = countSelected();
    if (!bulkBar) return;
    if (n > 0) {
      bulkBar.classList.add('visible');
      selectionCounterEl.textContent = `${n} selected`;
    } else {
      bulkBar.classList.remove('visible');
      selectionCounterEl.textContent = `0 selected`;
      // Close any open inline panels
      hide(chooseGroupHint);
      hide(confirmMoveMini);
      hide(bulkHpMini);
    }
  }

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

  // ---- Damage/Heal application logic (temp HP first, then HP; heal to max) ----
  function applyDamageHealTo(id, damage, heal) {
    const snap = window.CombatState.getSnapshot();
    // find combatant by id
    const all = [];
    snap.combatants.forEach(it => {
      if (it.type === 'combatant') all.push(it);
      else (it.members || []).forEach(m => all.push(m));
    });
    const c = all.find(x => x.id === id);
    if (!c) return;

    let hp     = Number(c.hp)     || 0;
    let maxHp  = Number(c.maxHp)  || 0;
    let tempHp = Number(c.tempHp) || 0;

    if (damage > 0) {
      // remove temp first
      const tUse = Math.min(tempHp, damage);
      tempHp -= tUse;
      let remaining = damage - tUse;
      if (remaining > 0) hp = Math.max(0, hp - remaining);
    }
    if (heal > 0) {
      hp = Math.min(maxHp, hp + heal);
    }

    window.CombatState.updateCombatant(id, { hp, tempHp });
  }

  function applyBulkDamageHeal() {
    const dmg = Math.max(0, parseInt(bulkDamageInp?.value || '0', 10) || 0);
    const heal= Math.max(0, parseInt(bulkHealInp?.value || '0', 10) || 0);
    if (dmg === 0 && heal === 0) { toast('Enter damage and/or heal'); return; }

    const sel = getSelectedIds();
    if (sel.size === 0) return;

    sel.forEach(id => applyDamageHealTo(id, dmg, heal));
    toast('Applied to selected');

    // reset + hide
    if (bulkDamageInp) bulkDamageInp.value = '';
    if (bulkHealInp) bulkHealInp.value = '';
    hide(bulkHpMini);
  }

  // ---- Move-to-group flow ----
  let awaitingGroupPick = false;
  let pendingTargetGroup = null;

  function beginMoveToGroup() {
    if (countSelected() === 0) { toast('Select some combatants first'); return; }
    awaitingGroupPick = true;
    pendingTargetGroup = null;
    show(chooseGroupHint);
    hide(confirmMoveMini);
    toast('Click a group row to choose destination');
  }

  function endMoveFlow() {
    awaitingGroupPick = false;
    pendingTargetGroup = null;
    hide(chooseGroupHint);
    hide(confirmMoveMini);
  }

  function onGroupRowClicked(groupRow) {
    if (!awaitingGroupPick) return;
    const groupId = groupRow?.dataset?.id;
    if (!groupId) return;

    // Find group name
    const snap = window.CombatState.getSnapshot();
    const g = snap.combatants.find(x => x.type === 'group' && x.id === groupId);
    const groupName = g?.name || 'Group';

    pendingTargetGroup = groupId;
    const n = countSelected();
    if (confirmMiniText) confirmMiniText.textContent = `Move ${n} selected to “${groupName}”?`;
    hide(chooseGroupHint);
    show(confirmMoveMini);
  }

  // ---- Delete flow ----
  function bulkDelete() {
    const n = countSelected();
    if (!n) return;
    if (!confirm(`Delete ${n} selected combatant(s)?`)) return;
    window.CombatState.deleteSelected();
    toast('Deleted selected');
  }

  // ---- Wire UI ----
  bulkDamageHealBtn?.addEventListener('click', () => {
    if (countSelected() === 0) { toast('Select some combatants first'); return; }
    // Toggle panel
    if (bulkHpMini?.classList.contains('hidden')) show(bulkHpMini); else hide(bulkHpMini);
    hide(chooseGroupHint);
    hide(confirmMoveMini);
  });
  bulkHpApplyBtn?.addEventListener('click', applyBulkDamageHeal);
  bulkHpCancelBtn?.addEventListener('click', () => hide(bulkHpMini));

  bulkGroupBtn?.addEventListener('click', beginMoveToGroup);
  bulkDeleteBtn?.addEventListener('click', bulkDelete);

  // Confirm mini buttons (for move)
  confirmMiniYes?.addEventListener('click', () => {
    if (!pendingTargetGroup) return;
    window.CombatState.moveSelectedToGroup(pendingTargetGroup);
    endMoveFlow();
    toast('Moved to group');
  });
  confirmMiniNo?.addEventListener('click', endMoveFlow);

  // Capture clicks on group header rows while in move mode
  document.addEventListener('click', (e) => {
    if (!awaitingGroupPick) return;
    const groupRow = e.target.closest('.group-row');
    if (groupRow) {
      e.preventDefault();
      onGroupRowClicked(groupRow);
    }
  }, true);

  // Update bulk bar whenever state changes
  window.CombatState?.subscribe((snapshot) => {
    updateBulkBarVisibility(snapshot);
  });

  // Initial state
  updateBulkBarVisibility(window.CombatState?.getSnapshot?.() || {});

  // ---- Minimal styles for the new panel (optional, inlined to avoid CSS file edits) ----
  (function injectMiniStyles(){
    const id = 'bulk-hp-mini-inline-style';
    if (document.getElementById(id)) return;
    const st = document.createElement('style');
    st.id = id;
    st.textContent = `
      #bulk-hp-mini.confirm-mini { display:flex; align-items:center; gap:.75rem; }
      #bulk-hp-mini.hidden { display:none; }
      #bulk-hp-mini .form-row input { border:1px solid #bbb; border-radius:4px; }
    `;
    document.head.appendChild(st);
  })();
})();
