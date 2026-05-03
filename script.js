const Analytics = {
  _log: [],
  track(e, d = {}) {
    this._log.push({ event: e, ts: Date.now(), ...d });
  },
  summary() {
    return {
      hints: this._log.filter((e) => e.event === "hint_used").length,
      wrong: this._log.filter((e) => e.event === "incorrect_attempt").length,
      correct: this._log.filter((e) => e.event === "combo_found").length,
    };
  },
};

function evalCombo(t0, t1, t2) {
  const terms = [
    { val: t0.num, op: null },
    { val: t1.num, op: t1.op },
    { val: t2.num, op: t2.op },
  ];
  const stack = [terms[0].val],
    addOps = [];
  for (let i = 1; i < 3; i++) {
    const { val, op } = terms[i];
    if (op === "×" || op === "÷") {
      const top = stack.pop();
      if (op === "÷") {
        if (val === 0) return null;
        stack.push(top / val);
      } else stack.push(top * val);
    } else {
      stack.push(val);
      addOps.push(op);
    }
  }
  let r = stack[0];
  for (let i = 1; i < stack.length; i++)
    r = addOps[i - 1] === "+" ? r + stack[i] : r - stack[i];
  return Math.round(r * 1e9) / 1e9;
}

let G = {
  tiles: [],
  target: 0,
  selected: [],
  found: new Set(),
  all: [],
  hints: 3,
  startedAt: null,
  mode: "daily",
  seed: null,
};

function rng(a) {
  return function () {
    var t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function daySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function makePuzzle(seed) {
  const r = rng(seed),
    OPS = ["+", "-", "×", "÷"];
  let tiles,
    target,
    combos,
    tries = 0;
  do {
    const seen = new Set();
    tiles = [];
    let att = 0;
    while (tiles.length < 10 && att < 200) {
      att++;
      const op = OPS[Math.floor(r() * 4)];
      let num;
      if (op === "÷") num = [2, 3, 4, 5][Math.floor(r() * 4)];
      else if (op === "×") num = Math.floor(r() * 4) + 2;
      else num = Math.floor(r() * 12) + 1;
      const k = op + num;
      if (seen.has(k)) continue;
      seen.add(k);
      tiles.push({ op, num, id: tiles.length });
    }
    if (tiles.length < 10) {
      r();
      tries++;
      continue;
    }
    target = Math.floor(r() * 21) - 5;
    combos = findAll(tiles, target);
    tries++;
  } while (combos.length < 2 && tries < 150);
  return { tiles, target, combos };
}

function findAll(tiles, target) {
  const results = [],
    n = tiles.length;
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++)
      if (b !== a)
        for (let c = 0; c < n; c++)
          if (c !== a && c !== b) {
            const val = evalCombo(tiles[a], tiles[b], tiles[c]);
            if (val !== null && Math.abs(val - target) < 0.0001) {
              results.push({
                key: `${tiles[a].id}-${tiles[b].id}-${tiles[c].id}`,
                label: `${tiles[a].op}${tiles[a].num} ${tiles[b].op}${tiles[b].num} ${tiles[c].op}${tiles[c].num}`,
              });
            }
          }
  return results;
}

// SAVE & LOAD LOGIC
function getSaveKey() {
  return "1031_save_" + G.mode;
}

function saveGame() {
  if (G.found.size >= G.all.length && G.all.length > 0) {
    localStorage.removeItem(getSaveKey());
    return;
  }
  const state = {
    tiles: G.tiles,
    target: G.target,
    found: Array.from(G.found),
    all: G.all,
    hints: G.hints,
    startedAt: G.startedAt,
    mode: G.mode,
    seed: G.seed,
  };
  localStorage.setItem(getSaveKey(), JSON.stringify(state));
}

function loadGame(mode) {
  try {
    const data = localStorage.getItem("1031_save_" + mode);
    if (data) {
      const state = JSON.parse(data);
      if (mode === "daily" && state.seed !== daySeed()) {
        return false; // Outdated daily save
      }
      G.tiles = state.tiles;
      G.target = state.target;
      G.found = new Set(state.found);
      G.all = state.all;
      G.hints = state.hints;
      G.startedAt = state.startedAt;
      G.mode = state.mode;
      G.seed = state.seed;
      G.selected = [];
      return true;
    }
  } catch (e) {}
  return false;
}

function saveHistory() {
  try {
    let hist = JSON.parse(localStorage.getItem("1031_history")) || [];
    const record = {
      date: new Date().toISOString(),
      mode: G.mode,
      target: G.target,
      hintsUsed: 3 - G.hints,
      total: G.all.length,
    };
    hist.push(record);
    localStorage.setItem("1031_history", JSON.stringify(hist));
  } catch (e) {}
}

function render() {
  document.getElementById("tgt").textContent = G.target;
  document.getElementById("s-found").textContent = G.found.size;
  document.getElementById("s-total").textContent = G.all.length;
  document.getElementById("s-hint").textContent = G.hints;
  document.getElementById("pb").style.width =
    (G.all.length ? (G.found.size / G.all.length) * 100 : 0) + "%";

  // Highlight mode button
  document
    .getElementById("btn-daily")
    .classList.toggle("primary", G.mode === "daily");
  document
    .getElementById("btn-random")
    .classList.toggle("primary", G.mode === "unlimited");

  renderTiles();
  renderSel();
  renderFound();
  saveGame();
}

function renderTiles() {
  const grid = document.getElementById("tiles-grid");
  grid.innerHTML = "";
  const selIds = new Set(G.selected.map((t) => t.id));
  G.tiles.forEach((tile) => {
    const el = document.createElement("div");
    el.className = "tile" + (selIds.has(tile.id) ? " sel" : "");
    el.id = "tile-" + tile.id;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `${tile.op}${tile.num}`);
    const lbl = document.createElement("div");
    lbl.className = "tile-label" + (tile.num < 0 ? " neg" : "");
    const opS = document.createElement("span");
    opS.className = "t-op";
    opS.textContent = tile.op;
    const numS = document.createElement("span");
    numS.className = "t-num";
    numS.textContent = tile.num;
    lbl.appendChild(opS);
    lbl.appendChild(numS);
    el.appendChild(lbl);
    el.addEventListener("click", () => clickTile(tile));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        clickTile(tile);
      }
    });
    grid.appendChild(el);
  });
}

function renderSel() {
  const area = document.getElementById("sel-area");
  if (!G.selected.length) {
    area.innerHTML = '<span class="sel-placeholder">select three tiles</span>';
    return;
  }
  area.innerHTML = G.selected
    .map(
      (t, i) =>
        `<span class="sel-tok">${i === 0 ? t.num : `${t.op}${t.num}`}</span>${i < G.selected.length - 1 ? '<span class="sel-arrow">→</span>' : ""}`,
    )
    .join("");
}

function renderFound() {
  const sec = document.getElementById("found-sec");
  sec.innerHTML = "";
  if (!G.found.size) return;
  const lbl = document.createElement("div");
  lbl.className = "found-lbl";
  lbl.textContent = "発見済み · Found Combinations";
  sec.appendChild(lbl);
  G.found.forEach((key) => {
    const combo = G.all.find((c) => c.key === key);
    if (!combo) return;
    const row = document.createElement("div");
    row.className = "combo-row";
    row.innerHTML = `<span class="combo-tiles">${combo.label}</span><span class="combo-eq">= ${G.target}</span>`;
    sec.appendChild(row);
  });
}

function clickTile(tile) {
  if (G.found.size >= G.all.length) return; // game over
  const idx = G.selected.findIndex((t) => t.id === tile.id);
  if (idx >= 0) {
    G.selected.splice(idx, 1);
    setMsg("", "");
    render();
    return;
  }
  if (G.selected.length >= 3) return;
  G.selected.push(tile);
  render();
  if (G.selected.length === 3) setTimeout(check, 80);
}

function check() {
  const [t0, t1, t2] = G.selected;
  const val = evalCombo(t0, t1, t2);
  const key = `${t0.id}-${t1.id}-${t2.id}`;
  if (val !== null && Math.abs(val - G.target) < 0.0001) {
    if (G.found.has(key)) {
      Analytics.track("duplicate_attempt");
      setMsg("Already found", "wrong");
      setTimeout(doClear, 900);
      return;
    }
    G.found.add(key);
    Analytics.track("combo_found", {
      found: G.found.size,
      total: G.all.length,
    });
    setMsg("Correct!", "ok");
    [t0, t1, t2].forEach((t) => {
      const el = document.getElementById("tile-" + t.id);
      if (el) {
        el.classList.add("flash");
        setTimeout(() => el.classList.remove("flash"), 450);
      }
    });
    saveGame();
    setTimeout(() => {
      doClear();
      render();
      if (G.found.size >= G.all.length) {
        Analytics.track("puzzle_solved", {
          hints: 3 - G.hints,
          elapsed: Date.now() - G.startedAt,
        });
        saveHistory();
        localStorage.removeItem(getSaveKey());
        setTimeout(() => openM("win"), 400);
      }
    }, 700);
  } else {
    Analytics.track("incorrect_attempt", { val, target: G.target });
    setMsg(`Incorrect${val !== null ? " (= " + val + ")" : ""}`, "wrong");
    setTimeout(doClear, 800);
  }
}

function doClear() {
  G.selected = [];
  setMsg("", "");
  render();
}

function doHint() {
  if (G.found.size >= G.all.length) return; // game over
  if (G.hints <= 0) {
    setMsg("No hints left", "wrong");
    return;
  }
  const unfound = G.all.filter((c) => !G.found.has(c.key));
  if (!unfound.length) {
    setMsg("All found!", "ok");
    return;
  }
  G.hints--;
  Analytics.track("hint_used", { hintsRemaining: G.hints });
  const pick = unfound[Math.floor(Math.random() * unfound.length)];
  const firstId = parseInt(pick.key.split("-")[0]);
  const tile = G.tiles.find((t) => t.id === firstId);
  const el = document.getElementById("tile-" + firstId);
  if (el) {
    el.classList.add("hinted");
    setTimeout(() => el.classList.remove("hinted"), 3200);
  }
  setMsg(`Hint: start with ${tile.op}${tile.num}`, "ok");
  render();
}

function doDaily() {
  if (!loadGame("daily")) {
    const seed = daySeed();
    const p = makePuzzle(seed);
    G = {
      tiles: p.tiles,
      target: p.target,
      selected: [],
      found: new Set(),
      all: p.combos,
      hints: 3,
      startedAt: Date.now(),
      mode: "daily",
      seed: seed,
    };
  } else {
    G.mode = "daily";
  }
  Analytics.track("game_start", {
    target: G.target,
    total: G.all.length,
    mode: "daily",
  });
  setMsg("", "");
  render();
}

function doRandom() {
  if (!loadGame("unlimited")) {
    const seed = Date.now();
    const p = makePuzzle(seed);
    G = {
      tiles: p.tiles,
      target: p.target,
      selected: [],
      found: new Set(),
      all: p.combos,
      hints: 3,
      startedAt: Date.now(),
      mode: "unlimited",
      seed: seed,
    };
  } else {
    G.mode = "unlimited";
  }
  Analytics.track("game_start", {
    target: G.target,
    total: G.all.length,
    mode: "unlimited",
  });
  setMsg("", "");
  render();
}

function doNewRandom() {
  const seed = Date.now();
  const p = makePuzzle(seed);
  G = {
    tiles: p.tiles,
    target: p.target,
    selected: [],
    found: new Set(),
    all: p.combos,
    hints: 3,
    startedAt: Date.now(),
    mode: "unlimited",
    seed: seed,
  };
  saveGame();
  render();
}

function setMsg(txt, cls) {
  const el = document.getElementById("res-msg");
  el.textContent = txt || " ";
  el.className = "res-msg" + (cls ? " " + cls : "");
}

function openM(id) {
  document.getElementById("m-" + id).classList.add("on");
}
function closeM(id) {
  document.getElementById("m-" + id).classList.remove("on");
  if ((id === "sol" || id === "share") && G.found.size >= G.all.length) {
    openM("win");
  }
}

function openSol() {
  document.getElementById("sol-list").innerHTML = G.all
    .map((c, i) => {
      const isFound = G.found.has(c.key);
      return `<div class="sol-row ${isFound ? "found" : "unfound"}">
      <span>${i + 1}. ${c.label} = ${G.target}</span>
      <span class="sol-status">${isFound ? "✓" : "—"}</span>
    </div>`;
    })
    .join("");
  document.getElementById("m-win").classList.remove("on");
  openM("sol");
}

function openHistory() {
  const listEl = document.getElementById("history-list");
  try {
    const hist = JSON.parse(localStorage.getItem("1031_history")) || [];
    if (hist.length === 0) {
      listEl.innerHTML =
        '<div class="mbody">No completed games yet. Play to build your history!</div>';
    } else {
      hist.reverse(); // newest first
      listEl.innerHTML = hist
        .map((h) => {
          const d = new Date(h.date);
          const dStr =
            d.toLocaleDateString() +
            " " +
            d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          return `<div class="hist-item">
          <div class="hist-date">${dStr} • ${h.mode === "daily" ? "Daily" : "Random"}</div>
          <div class="hist-details">Target: ${h.target} | Score: ${h.total}/${h.total} | Hints: ${h.hintsUsed}/3</div>
        </div>`;
        })
        .join("");
    }
  } catch (e) {
    listEl.innerHTML = '<div class="mbody">Could not load history.</div>';
  }
  openM("history");
}

function buildShareText() {
  const hintsUsed = 3 - G.hints,
    found = G.found.size,
    total = G.all.length,
    pct = total > 0 ? Math.round((found / total) * 100) : 0;
  const dots = Array.from({ length: total }, (_, i) =>
    i < found ? "🟩" : "⬜",
  ).join("");
  const d = new Date(),
    dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return `🎯 10-3-1 Game
📅 ${dateStr} ${G.mode === "daily" ? "(Daily)" : "(Random)"}

Target: ${G.target}
Score: ${found}/${total} combos (${pct}%)
Hints: ${hintsUsed}/3 used

${dots}

Can you find them all?
Play at: https://10-3-1-game.vercel.app/`;
}

function openShare() {
  const txt = buildShareText();
  document.getElementById("share-text").textContent = txt;
  document.getElementById("copy-note").textContent = "tap to copy to clipboard";
  document.getElementById("copy-btn").textContent = "Copy";
  document.getElementById("m-win").classList.remove("on");
  openM("share");
}

function doCopy() {
  const txt = document.getElementById("share-text").textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(txt)
      .then(() => {
        document.getElementById("copy-btn").textContent = "Copied!";
        document.getElementById("copy-note").textContent = "✓ copied";
        Analytics.track("share_copied");
      })
      .catch(() => fallbackCopy(txt));
  } else fallbackCopy(txt);
}
function fallbackCopy(txt) {
  const ta = document.createElement("textarea");
  ta.value = txt;
  ta.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    document.getElementById("copy-btn").textContent = "Copied!";
    Analytics.track("share_copied");
  } catch {}
  document.body.removeChild(ta);
}

// THEME LOGIC
function toggleTheme() {
  const body = document.body;
  if (body.classList.contains("dark-mode")) {
    body.classList.remove("dark-mode");
    localStorage.setItem("1031_theme", "light");
  } else {
    body.classList.add("dark-mode");
    localStorage.setItem("1031_theme", "dark");
  }
}

function loadTheme() {
  const theme = localStorage.getItem("1031_theme");
  if (theme === "dark") {
    document.body.classList.add("dark-mode");
  }
}

(function init() {
  loadTheme();

  // Try to load last active mode or default to daily
  let lastMode = "daily";
  try {
    const dailyData = localStorage.getItem("1031_save_daily");
    const unlimitedData = localStorage.getItem("1031_save_unlimited");
    // If they have an active unlimited game, maybe prefer that?
    // Let's just stick to daily as default unless they click Random
  } catch (e) {}

  doDaily();
  
  if (window.lucide) {
    lucide.createIcons();
  }
})();
