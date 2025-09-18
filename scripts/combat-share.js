// scripts/combat-share.js
(() => {
  const $ = (s) => document.querySelector(s);

  // --- Helpers to mirror tracker timeline math -----------------------------
  function getTurnOrderIdsFromSnapshot(snap) {
    const ids = [];
    (snap.combatants || []).forEach((it) => {
      if (it.type === "combatant") ids.push(it.id);
      else if (it.type === "group") (it.members || []).forEach((m) => ids.push(m.id));
    });
    return ids;
  }

  function condOwnerIdx(cond, snap) {
    const order = getTurnOrderIdsFromSnapshot(snap);
    return order.indexOf(cond.ownerId);
  }

  // How many of the owner's turns have STARTED since the application time?
  function ownerTurnsSinceAdded(cond, snap) {
    const { currentRound, turnPtr } = snap;
    const ownerIdx = condOwnerIdx(cond, snap);
    if (ownerIdx < 0) return 0;

    const firstRound = cond.appliedAtRound + (cond.appliedAtPtr < ownerIdx ? 0 : 1);
    if (currentRound < firstRound) return 0;

    let n = currentRound - firstRound;
    if (turnPtr >= ownerIdx) n += 1;
    return n;
  }

  function remainingRoundsNow(cond, snap) {
    // Back-compat legacy shape {startRound,endRound}
    if (cond.durationRounds == null && cond.startRound != null && cond.endRound != null) {
      const r = snap.currentRound || 1;
      if (r < cond.startRound) return 0;
      return Math.max(0, (cond.endRound - r + 1));
    }
    const used = ownerTurnsSinceAdded(cond, snap);
    return Math.max(0, (cond.durationRounds ?? 0) - used);
  }

  function isConditionVisibleNow(cond, snap) {
    const { currentRound, turnPtr } = snap;
    if (currentRound < cond.appliedAtRound) return false;
    if (currentRound === cond.appliedAtRound && turnPtr < cond.appliedAtPtr) return false;
    return true;
  }

  function isConditionActiveNow(cond, snap) {
    return isConditionVisibleNow(cond, snap) && remainingRoundsNow(cond, snap) > 0;
  }

  // --- HP state & icon (matches tracker semantics) -------------------------
  function hpStateAndIcon(hp, maxHp) {
    if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) {
      return { state: "Healthy", icon: "❤️" };
    }
    if (hp <= 0) return { state: "DEAD", icon: "☠️" };

    const pct = (hp / maxHp) * 100;
    if (pct < 15)      return { state: "Critical", icon: "🆘" };
    if (pct <= 50)     return { state: "Bloodied", icon: "🩸" };
    if (pct < 100)     return { state: "Injured",  icon: "🤕" };
    return { state: "Healthy", icon: "❤️" };
  }

  // Natural-ish name sort (same tie-breaker as tracker)
  function splitNameForSort(name) {
    const t = String(name || "").trim();
    const m = t.match(/^(.*?)(?:\s+(\d+))?$/);
    return { base: (m?.[1] || "").toLowerCase(), num: m?.[2] ? parseInt(m[2], 10) : null };
  }
  function compareNames(aName, bName, alphaDir = "asc") {
    const A = splitNameForSort(aName), B = splitNameForSort(bName);
    if (A.base !== B.base) return alphaDir === "asc" ? A.base.localeCompare(B.base) : B.base.localeCompare(A.base);
    const aNum = A.num == null ? Number.POSITIVE_INFINITY : A.num;
    const bNum = B.num == null ? Number.POSITIVE_INFINITY : B.num;
    if (aNum !== bNum) return aNum - bNum;
    return String(aName || "").localeCompare(String(bName || ""));
  }

  function buildDiscordText() {
    const snap = window.CombatState?.getSnapshot?.();
    if (!snap) return "";

    const { combatants, currentRound } = snap;

    // Flatten combatants with their group name (keep everyone, alive or dead)
    const flat = [];
    combatants.forEach((it) => {
      if (it.type === "combatant") {
        flat.push({ c: it, groupName: null });
      } else if (it.type === "group") {
        (it.members || []).forEach((m) => flat.push({ c: m, groupName: it.name || null }));
      }
    });

    // Sort by init DESC, then by name asc
    flat.sort((A, B) => {
      const ai = Number.isFinite(+A.c.init) ? +A.c.init : Number.NEGATIVE_INFINITY;
      const bi = Number.isFinite(+B.c.init) ? +B.c.init : Number.NEGATIVE_INFINITY;
      if (ai !== bi) return bi - ai; // DESC
      return compareNames(A.c.name, B.c.name, "asc");
    });

    const header = `**Initiative — Round ${currentRound || 1}**`;
    const lines = [header];

    flat.forEach(({ c, groupName }) => {
      const initNum = Number.isFinite(+c.init) ? +c.init : 0;
      const nameBase = groupName ? `${c.name} (${groupName})` : c.name;

      const { state, icon } = hpStateAndIcon(Number(c.hp), Number(c.maxHp));

      // Decorate dead names with **DEAD** on both sides
      const who = (state === "DEAD")
        ? `**DEAD** ${nameBase} **DEAD**`
        : nameBase;

      // Active conditions using timeline-aware logic + remaining rounds
      const list = Array.isArray(c.conditions) ? c.conditions : [];
      const activeConds = list.filter((cond) => isConditionActiveNow(cond, snap));
      const conds = activeConds.length
        ? activeConds
            .map((cond) => `${cond.name} (${remainingRoundsNow(cond, snap)}r)`)
            .join(", ")
        : "None";

      lines.push(`${initNum}) ${who} | ${icon} ${state} | Status: ${conds}`);
    });

    return lines.join("\n");
  }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        toast("Copied to clipboard");
      } else {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toast("Copied to clipboard");
      }
    } catch (e) {
      console.error("Copy failed:", e);
      alert("Could not copy to clipboard.");
    }
  }

  function toast(msg, ms = 1200) {
    let el = document.getElementById("tracker-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "tracker-toast";
      Object.assign(el.style, {
        position: "fixed",
        bottom: "16px",
        right: "16px",
        background: "#222",
        color: "#fff",
        padding: "8px 12px",
        borderRadius: "8px",
        boxShadow: "0 8px 24px rgba(0,0,0,.2)",
        zIndex: 99999,
        opacity: 0,
        transition: "opacity .15s ease",
      });
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = 1;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.style.opacity = 0; }, ms);
  }

  // Wire the Copy button
  function wire() {
    const btn = $("#exportInitBtn");
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const text = buildDiscordText();
      if (!text) return;
      copyToClipboard(text);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
