// scripts/combat-share.js
(() => {
  const $ = (s) => document.querySelector(s);

  // HP state thresholds + icons (no exact HP shown)
  function hpStateAndIcon(hp, maxHp) {
    if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) {
      return { state: "Healthy", icon: "❤️" };
    }
    if (hp <= 0) return { state: "Down", icon: "☠️" }; // we skip these in output
    const pct = (hp / maxHp) * 100;
    if (pct >= 76) return { state: "Healthy", icon: "❤️" };
    if (pct >= 51) return { state: "Injured", icon: "💔" };
    if (pct >= 26) return { state: "Bloodied", icon: "🩸" };
    return { state: "Critical", icon: "☠️" };
  }

  // Same logic as elsewhere for active conditions
  function isConditionActive(cond, round) {
    return round >= cond.startRound && round <= cond.endRound;
  }

  // Sort helpers (match your table’s tie breaking: init desc, then name)
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

    // Flatten combatants with their group name, skip groups themselves
    const flat = [];
    combatants.forEach((it) => {
      if (it.type === "combatant") {
        flat.push({ c: it, groupName: null });
      } else if (it.type === "group") {
        (it.members || []).forEach((m) => flat.push({ c: m, groupName: it.name || null }));
      }
    });

    // Filter out anyone with hp <= 0 (do not show in initiative)
    const alive = flat.filter(({ c }) => Number(c.hp) > 0);

    // Sort by init DESC, then by name asc (natural-ish)
    alive.sort((A, B) => {
      const ai = Number.isFinite(+A.c.init) ? +A.c.init : Number.NEGATIVE_INFINITY;
      const bi = Number.isFinite(+B.c.init) ? +B.c.init : Number.NEGATIVE_INFINITY;
      if (ai !== bi) return bi - ai; // DESC
      return compareNames(A.c.name, B.c.name, "asc");
    });

    const header = `**Initiative — Round ${currentRound || 1}**`;
    const lines = [header];

    alive.forEach(({ c, groupName }) => {
      const initNum = Number.isFinite(+c.init) ? +c.init : 0;

      // Name with (Group) if any
      const who = groupName ? `${c.name} (${groupName})` : c.name;

      // HP state (icon + label), but no exact numbers
      const { state, icon } = hpStateAndIcon(Number(c.hp), Number(c.maxHp));

      // Active conditions with remaining rounds
      const list = Array.isArray(c.conditions) ? c.conditions : [];
      const active = list.filter((cond) => isConditionActive(cond, currentRound || 1));
      const conds = active.length
        ? active
            .map((cond) => {
              const remain = Math.max(0, (cond.endRound ?? 0) - (currentRound || 1) + 1);
              return `${cond.name} (${remain}r)`;
            })
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
