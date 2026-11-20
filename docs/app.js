// ============================================================
//  NOTCH · Application
// ============================================================
"use strict";

// ---------- Utilitaires ----------
const $ = id => document.getElementById(id);
const esc = t => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const pad2 = n => String(n).padStart(2, "0");
const dkey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const today = () => dkey(new Date());
const frDate = (s, o) => parseD(s).toLocaleDateString("fr-FR", o || { day: "numeric", month: "short" });
const num = v => { const x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : null; };
const fmtN = w => (Math.round(w * 10) / 10).toString().replace(".", ",");
const fmtW = w => w == null || w === "" ? "—" : fmtN(w) + " kg";
const fmtRest = s => s >= 120 ? `${s / 60} min` : (s === 90 ? "1 min 30" : (s === 60 ? "1 min" : s + " s"));
const mmss = s => `${Math.floor(s / 60)}:${pad2(s % 60)}`;
const e1rm = s => s.w > 0 ? s.w * (1 + s.r / 30) : s.r;
const doneSets = arr => (arr || []).filter(Boolean);
const dayById = id => DAYS.find(d => d.id === id);
const weekIdx = (d = new Date()) => (d.getDay() + 6) % 7; // 0 = lundi
const mondayKey = () => { const x = new Date(); x.setDate(x.getDate() - weekIdx(x)); return dkey(x); };
const isPdc = k => LIB[k].t === "pdc";
const unitOf = k => LIB[k].t === "haltere" ? "kg par haltère" : "kg";
// ---------- Disques : quoi mettre de chaque côté de la barre ----------
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
function platesFor(k, w) {
  if (LIB[k].t !== "barre" || w == null || w === "") return null;
  const bar = LIB[k].bar || 20;
  if (w < bar) return { bar, text: `Moins lourd que la barre seule (${bar} kg)` };
  let side = Math.round((w - bar) / 2 * 100) / 100;
  if (side === 0) return { bar, text: `Barre seule (${bar} kg)` };
  const out = [];
  PLATES.forEach(p => { while (side >= p - 1e-9) { out.push(p); side = Math.round((side - p) * 100) / 100; } });
  const rest = side > 0.01 ? ` (+${fmtN(side * 2)} kg impossible à faire)` : "";
  return { bar, list: out, text: out.map(v => String(v).replace(".", ",")).join(" + ") + " kg de chaque côté" + rest };
}
function platesHTML(k, w) {
  const p = platesFor(k, w); if (!p) return "";
  const discs = (p.list || []).map(x => `<i class="plate" style="--h:${Math.round(18 + x * 1.6)}px" aria-hidden="true"></i>`).join("");
  return `<div class="plates-row">${discs ? `<span class="plate-viz" aria-hidden="true"><i class="bar-end"></i>${discs}</span>` : ""}<span>${esc(p.text)}<small>Barre de ${p.bar} kg</small></span></div>`;
}
const estimate = d => Math.round(d.ex.reduce((t, x) => t + x.sets * (45 + x.rest), 0) / 60) + 8;
// Pont vers l'appli Android (absent quand Notch tourne dans un navigateur)
const NATIVE = window.NotchNative || null;
const native = (fn, ...args) => { try { if (NATIVE && NATIVE[fn]) return NATIVE[fn](...args); } catch (e) {} return undefined; };
const vibrate = p => {
  if (NATIVE) return native("vibrate", Array.isArray(p) ? p.join(",") : String(p));
  try { navigator.vibrate && navigator.vibrate(p); } catch (e) {}
};
const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Ressort (Apple : amortissement + réponse) ----------
// Part de la valeur actuelle et de la vitesse du doigt : le mouvement peut être rattrapé à tout moment.
function spring({ from, to, velocity = 0, response = 0.35, damping = 1, onUpdate, onDone }) {
  if (REDUCED) { onUpdate(to); onDone && onDone(); return { stop() {} }; }
  const k = Math.pow(2 * Math.PI / response, 2), c = 4 * Math.PI * damping / response;
  let x = from, v = velocity, last = performance.now(), id = 0, stopped = false;
  const step = now => {
    if (stopped) return;
    const dt = Math.min(0.032, (now - last) / 1000); last = now;
    for (let i = 0; i < 4; i++) { const h = dt / 4, a = -k * (x - to) - c * v; v += a * h; x += v * h; }
    if (Math.abs(x - to) < 0.5 && Math.abs(v) < 8) { onUpdate(to); onDone && onDone(); return; }
    onUpdate(x); id = requestAnimationFrame(step);
  };
  id = requestAnimationFrame(step);
  return { stop() { stopped = true; cancelAnimationFrame(id); } };
}
// Où le geste « veut » aller, comme le défilement d'iOS
const project = (v, rate = 0.998) => (v / 1000) * rate / (1 - rate);
// Résistance progressive au-delà d'un bord
const rubber = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));
// Vitesse (px/s) à partir des derniers points du doigt
function velocityOf(hist, axis) {
  if (hist.length < 2) return 0;
  const a = hist[0], b = hist[hist.length - 1], dt = b.t - a.t;
  return dt > 0 ? (b[axis] - a[axis]) / dt * 1000 : 0;
}

// ---------- Annonces pour TalkBack ----------
function announce(msg) { const sr = $("sr"); if (!sr) return; sr.textContent = ""; setTimeout(() => sr.textContent = msg, 30); }

const ARROW =`<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const LOGO = (size, bg, fg) => `<svg width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="Notch"><rect width="64" height="64" rx="16" fill="${bg}"/><path d="M14 44 H26 V34 H38 V24 H50" fill="none" stroke="${fg}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---------- Données (sur le téléphone) ----------
const KEY = "notch-data", KEY_S = "notch-session";
let DB = { logs: {}, body: {}, lastExport: null, prefs: { swaps: {} } };
function load() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || "{}");
    DB = { logs: o.logs || {}, body: o.body || {}, lastExport: o.lastExport || null, prefs: Object.assign({}, DEFAULT_PREFS, o.prefs || {}) };
  } catch (e) {}
  DB.prefs.notif = Object.assign({}, DEFAULT_PREFS.notif, DB.prefs.notif || {});
  DB.prefs.notes = DB.prefs.notes || {};
  DB.prefs.music = Object.assign({ on: false, lists: {} }, DB.prefs.music || {});
  DB.prefs.cal = Object.assign({ on: false, write: false, time: "18:00" }, DB.prefs.cal || {});
  DB.prefs.moves = DB.prefs.moves || {};
}
const DEFAULT_PREFS = { swaps: {}, notes: {}, sound: true, solid: false, notif: { session: true, time: "17:30", weekly: true } };
function applyPrefs() {
  document.documentElement.classList.toggle("solid", !!DB.prefs.solid);
  native("setReminders", JSON.stringify(DB.prefs.notif));
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { toast("Impossible d’enregistrer : stockage du téléphone plein"); }
  pushWidgets();
}

// ---------- Variantes : l'exercice réellement fait à une place du programme ----------
function exList(dayId, docId) {
  const d = dayById(dayId), l = docId ? DB.logs[docId] : null;
  return d.ex.map((x, i) => {
    const k = (l && l.swap && l.swap[i]) || (!l ? DB.prefs.swaps[dayId + ":" + i] : null) || x.k;
    return k === x.k ? { ...x, base: x.k } : { ...x, k, base: x.k, w0: null, load: "À trouver à la 1re séance" };
  });
}
let G = null; // séance en cours
function saveG() { try { G ? localStorage.setItem(KEY_S, JSON.stringify(G)) : localStorage.removeItem(KEY_S); } catch (e) {} liveUpdate(); }
function loadG() { try { G = JSON.parse(localStorage.getItem(KEY_S) || "null"); } catch (e) { G = null; } dropStaleG(); }
// Une séance d'un autre jour ne peut plus être reprise : on l'oublie (ce qui a été fait reste enregistré)
function dropStaleG() { if (G && (!DB.logs[G.docId] || DB.logs[G.docId].date !== today())) { G = null; saveG(); } }

// ---------- Historique, records, coach ----------
function sessionsWith(k, exclude) {
  return Object.entries(DB.logs).filter(([id, l]) => id !== exclude && l.ex && doneSets(l.ex[k]).length)
    .sort((a, b) => b[1].date.localeCompare(a[1].date) || (b[1].startedAt || 0) - (a[1].startedAt || 0))
    .map(([id, l]) => ({ id, date: l.date, sets: doneSets(l.ex[k]) }));
}
function bestOf(k, exclude) {
  let b = null;
  sessionsWith(k, exclude).forEach(s => s.sets.forEach(x => { const v = e1rm(x); if (!b || v > b.v) b = { v, w: x.w, r: x.r, date: s.date }; }));
  return b;
}
function coach(x, exclude) {
  const L = LIB[x.k], step = STEP[L.t], hist = sessionsWith(x.k, exclude);
  if (!hist.length) {
    if (L.t === "pdc") return { type: "depart", label: "Départ", text: `Première fois : vise ${x.lo} à ${x.hi} répétitions propres.` };
    return { type: "depart", label: "Départ", w: x.w0, text: x.w0 != null ? `Première fois : pars sur ${fmtW(x.w0)} et note bien tes répétitions.` : `Première fois : trouve une charge qui te permet ${x.lo} à ${x.hi} répétitions propres.` };
  }
  const last = hist[0].sets, lw = Math.max(...last.map(s => s.w || 0));
  const top = last.length >= x.sets && last.every(s => s.r >= x.hi && (s.w || 0) >= lw);
  let c;
  if (top) c = L.t === "pdc" ? { type: "monte", label: "Monte", text: `${x.hi} répétitions partout : passe à ${x.hi + 3}.` }
                             : { type: "monte", label: "Monte", w: lw + step, text: `${x.hi} répétitions partout à ${fmtW(lw)}. Monte à ${fmtW(lw + step)}.` };
  else if (last.some(s => s.r < x.lo)) c = { type: "garde", label: "Garde", w: lw, text: `Garde ${L.t === "pdc" ? "le même effort" : fmtW(lw)} et vise au moins ${x.lo} répétitions par série.` };
  else c = { type: "garde", label: "Garde", w: lw, text: `Garde ${L.t === "pdc" ? "le même effort" : fmtW(lw)}. Objectif : ${x.hi} répétitions sur toutes les séries.` };
  if (c.type !== "monte" && hist.length >= 4) {
    const e = hist.map(h => Math.max(...h.sets.map(e1rm)));
    if (Math.max(...e.slice(0, 3)) <= Math.max(...e.slice(3)))
      c = { type: "stagne", label: "Stagne", w: lw, text: `Aucun progrès depuis 3 séances. Baisse de 10 % et remonte, ou change de variante.` };
  }
  return c;
}
// Exercices suivis : ceux du programme (variantes choisies comprises) + les variantes déjà faites
function programKeys() {
  const m = new Map();
  DAYS.forEach(d => exList(d.id).forEach(x => {
    if (!m.has(x.k)) m.set(x.k, x);
    [x.base, ...(ALT[x.base] || [])].forEach(k => { if (!m.has(k) && sessionsWith(k).length) m.set(k, { ...x, k, w0: k === x.base ? d.ex.find(e => e.k === k).w0 : null }); });
  }));
  return m;
}
const hasSets = l => Object.values(l.ex || {}).some(a => doneSets(a).length);

// ---------- Silhouette musculaire ----------
// mode « exercice » : principal en bleu plein, secondaire en bleu clair
// mode « chaleur » : chaque muscle plus ou moins bleu selon le volume de la semaine
const MIRROR = "translate(100 0) scale(-1 1)";
function figure(list, fillOf) {
  let o = `<path class="bb" d="${BODY.outline}"/><path class="bb" d="${BODY.outline}" transform="${MIRROR}"/>`;
  list.forEach(m => {
    const f = fillOf(m.g);
    o += `<path ${f} d="${m.d}"/>` + (m.s ? `<path ${f} d="${m.d}" transform="${MIRROR}"/>` : "");
  });
  return o;
}
function svgBody(fillOf, label) {
  return `<svg class="bm" viewBox="0 0 220 218" role="img" aria-label="${esc(label)}">
    <g>${figure(BODY.front, fillOf)}</g><g transform="translate(120 0)">${figure(BODY.back, fillOf)}</g>
    <text class="lb" x="50" y="216" text-anchor="middle">FACE</text><text class="lb" x="170" y="216" text-anchor="middle">DOS</text></svg>`;
}
function bodyMap(k) {
  const L = LIB[k];
  return svgBody(g => `class="${L.p.includes(g) ? "mh" : (L.s.includes(g) ? "ms" : "mm")}"`, "Muscles travaillés : " + L.p.map(g => MUSCLES[g]).join(", "));
}
function heatMap(lv) {
  return svgBody(g => (lv[g] || 0) > 0 ? `class="mx" fill-opacity="${(0.18 + 0.82 * lv[g]).toFixed(2)}"` : `class="mm"`, "Muscles travaillés cette semaine");
}

// ---------- Graphique ----------
function lineChart(pts, { unit = "kg", h = 180, label = "" } = {}) {
  const W = 460, H = h, Lm = 40, Rm = 14, Tm = 20, Bm = 26;
  let x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x));
  if (x0 === x1) { x0 -= 3 * 864e5; x1 += 3 * 864e5; }
  let y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
  const pad = (y1 - y0) * 0.18 || Math.max(1, Math.abs(y1) * 0.06); y0 -= pad; y1 += pad;
  const raw = (y1 - y0) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 2.5, 5, 10].find(s => s * mag >= raw) * mag;
  const ticks = []; for (let v = Math.ceil(y0 / step) * step; v <= y1 + 1e-9; v += step) ticks.push(v);
  const sx = x => Lm + (x - x0) / (x1 - x0) * (W - Lm - Rm), sy = y => Tm + (1 - (y - y0) / (y1 - y0)) * (H - Tm - Bm);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");
  const area = pts.length > 1 ? `${line} L${sx(pts[pts.length - 1].x).toFixed(1)} ${H - Bm} L${sx(pts[0].x).toFixed(1)} ${H - Bm} Z` : "";
  const last = pts[pts.length - 1], lx = sx(last.x), ly = sy(last.y);
  const dl = d => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    <style>.cg{stroke:var(--line)}.cl{fill:var(--muted);font:500 12px Inter,sans-serif}.cline{fill:none;stroke:var(--accent);stroke-width:2.5;stroke-linejoin:round}.carea{fill:var(--accent);opacity:.08}.cdot{fill:var(--surface);stroke:var(--accent);stroke-width:2}.cend{fill:var(--accent)}.cv{fill:var(--ink);font:800 15px Archivo,sans-serif;font-stretch:125%}</style>
    ${ticks.map(v => `<line class="cg" x1="${Lm}" x2="${W - Rm}" y1="${sy(v)}" y2="${sy(v)}"/><text class="cl" x="${Lm - 8}" y="${sy(v) + 4}" text-anchor="end">${fmtN(v)}</text>`).join("")}
    ${area ? `<path class="carea" d="${area}"/>` : ""}<path class="cline" d="${line}"/>
    ${pts.slice(0, -1).map(p => `<circle class="cdot" cx="${sx(p.x)}" cy="${sy(p.y)}" r="3.5"/>`).join("")}
    <circle class="cend" cx="${lx}" cy="${ly}" r="5.5"/>
    <text class="cv" x="${lx > W - 90 ? lx - 10 : lx + 10}" y="${Math.max(14, ly - 10)}" text-anchor="${lx > W - 90 ? "end" : "start"}">${fmtN(last.y)} ${unit}</text>
    <text class="cl" x="${sx(pts[0].x)}" y="${H - 6}" text-anchor="${pts.length > 1 ? "start" : "middle"}">${dl(pts[0].x)}</text>
    ${pts.length > 1 ? `<text class="cl" x="${lx}" y="${H - 6}" text-anchor="end">${dl(last.x)}</text>` : ""}</svg>`;
}

// ---------- Navigation entre vues ----------
let VIEW = "accueil", PTAB = null, PK = null, ARMED = null;
const VIEWS = ["accueil", "programme", "progres", "seche"];
function show(v, from = null) {
  if (!VIEWS.includes(v)) v = "accueil";
  VIEW = v;
  VIEWS.forEach(n => $("v-" + n).hidden = n !== v);
  // Arrivée du côté du geste quand on change d'onglet en glissant
  const el = $("v-" + v);
  el.style.transition = "none"; el.style.transform = ""; el.style.opacity = "";
  if (from && !REDUCED) {
    el.style.transform = `translateX(${from === "right" ? 32 : -32}%)`; el.style.opacity = "0";
    void el.offsetHeight;
    el.style.transition = "transform 280ms var(--ease), opacity 200ms ease";
    el.style.transform = ""; el.style.opacity = "";
  }
  document.querySelectorAll(".tb").forEach(b => b.dataset.view === v ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
  render(); if (!from) window.scrollTo(0, 0); else window.scrollTo(0, 0);
}
function render() { ({ accueil: renderHome, programme: renderProgram, progres: renderProgress, seche: renderBody })[VIEW](); }

// ---------- Accueil (proposition A · Focus) ----------
// Un seul but : lancer la séance. Tout le reste est à un geste.
function renderHome() {
  const t = today(), wi = weekIdx(), mon = mondayKey(), wdNow = wi + 1;
  const weekDone = new Set(Object.values(DB.logs).filter(l => l.date >= mon && hasSets(l)).map(l => l.day));
  const doneToday = new Set(Object.values(DB.logs).filter(l => l.date === t && l.finished).map(l => l.day));
  // Le planning de la semaine, séances décalées comprises
  const plan = weekPlan(mon);
  // Une séance « en cours » ne vaut que pour aujourd'hui
  const activeD = G && DB.logs[G.docId] && DB.logs[G.docId].date === t && !DB.logs[G.docId].finished ? dayById(G.dayId) : null;
  // Séances prévues plus tôt dans la semaine et pas faites
  const missed = plan.filter(p => p.wd < wdNow && !weekDone.has(p.id));
  const lastMissed = missed[missed.length - 1] || null;
  const todayP = plan.find(p => p.wd === wdNow);
  const nextP = plan.find(p => p.wd > wdNow) || null;

  // mode : en cours · aujourd'hui · rattrapage (jour de repos) · faite · prochaine
  let P, mode;
  if (activeD) { P = plan.find(p => p.id === activeD.id); mode = "active"; }
  else if (todayP && !doneToday.has(todayP.id)) { P = todayP; mode = "today"; }
  else if (!todayP && lastMissed) { P = lastMissed; mode = "catchup"; }
  else if (todayP) { P = nextP; mode = "done"; }
  else { P = nextP; mode = "next"; }
  // Fin de semaine : la prochaine séance est celle de lundi
  if (!P) { const nm = weekPlan(addDays(mon, 7)); P = nm[0]; }
  const d = P.d;
  const pday = P.date === t ? "aujourd’hui" : (P.date === addDays(t, 1) ? "demain" : dayName(P.date));
  const showTime = DB.prefs.cal.on || DB.prefs.cal.write || P.moved;

  const whenMissed = p => p.date === addDays(t, -1) ? "hier" : dayName(p.date);
  const dots = Array.from({ length: 7 }, (_, i) => {
    const p = plan.find(x => x.wd === i + 1);
    const cls = !p ? "off" : (weekDone.has(p.id) ? "done" : (missed.includes(p) ? "miss" : "plan"));
    return `<i class="dot-d ${cls}${i === wi ? " now" : ""}"></i>`;
  }).join("");
  const countTxt = `${weekDone.size} / 4 cette semaine${missed.length ? ` · ${missed.length} ratée${missed.length > 1 ? "s" : ""}` : ""}`;
  const eyebrow = { active: "Séance en cours", today: "Aujourd’hui" + (showTime ? " · " + hTxt(P.time) : ""), catchup: "Rattrapage · prévue " + dayName(P.date), done: "Séance faite aujourd’hui", next: "Prochaine séance · " + pday + (showTime ? " " + hTxt(P.time) : "") }[mode];
  const cf = (mode === "active") ? null : findConflict(plan, weekDone);

  // Le conseil du coach : une alerte (monte / stagne) en priorité, sinon le premier exercice de la séance affichée
  let tip = null;
  programKeys().forEach((x, k) => { const c = coach(x); if (!tip && (c.type === "monte" || c.type === "stagne")) tip = { k, c }; });
  const first = exList(d.id, activeD ? G.docId : null)[0];
  if (!tip) tip = { k: first.k, c: coach(first, activeD ? G.docId : undefined) };

  const h = weekHeat();
  const W = Object.values(DB.body).filter(b => b.weight != null).sort((a, b) => a.date.localeCompare(b.date));
  const lastW = W[W.length - 1], firstW = W[0];
  const expAge = DB.lastExport ? Math.floor((Date.now() - parseD(DB.lastExport)) / 864e5) : null;
  const nbSessions = Object.values(DB.logs).filter(hasSets).length;
  const backupLate = nbSessions > 0 && (expAge == null || expAge > 7);
  const hour = new Date().getHours();
  const CHEV = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  $("v-accueil").innerHTML = `
    <div class="row">
      <div class="stack" style="gap:4px">
        <div class="eyebrow">${esc(new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }))}</div>
        <h1 class="d h1">${hour >= 18 ? "Bonsoir" : "Salut"} Paul</h1>
      </div>
      ${SETTINGS_BTN}
    </div>

    <section class="hero hero-a" aria-label="Séance">
      <div class="stack" style="gap:8px">
        <div class="eyebrow" style="color:#FFFFFF;opacity:.8">${esc(eyebrow)}${mode === "catchup" ? "" : " · " + esc(d.tag)}</div>
        <h2 class="d up hero-title">${esc(d.title)}</h2>
        <div style="font-size:15px;opacity:.85">${exList(d.id).length} exercices · environ ${estimate(d)} min</div>
      </div>
      <div class="week-dots" aria-label="${esc(countTxt)}">${dots}<span>${esc(countTxt)}</span></div>
      ${mode === "today" && lastMissed ? `<div class="missed"><span><b>${esc(lastMissed.d.title)}</b> ratée ${whenMissed(lastMissed)}</span><button type="button" class="missed-btn" data-act="open" data-day="${lastMissed.id}">Rattraper</button></div>` : ""}
      <div class="hero-tip">
        <span class="eyebrow" style="color:#FFFFFF;opacity:.85">Le coach</span>
        <span>${esc(LIB[tip.k].n)} : ${esc(tip.c.text.charAt(0).toLowerCase() + tip.c.text.slice(1))}</span>
      </div>
      ${mode === "done" ? `<div class="done-msg">Bien joué. Repos, protéines, et on remet ça ${esc(pday)}.</div>`
        : `<button class="btn-go" type="button" data-act="open" data-day="${d.id}">${{ active: "Reprendre", catchup: "Rattraper" }[mode] || "Commencer"} ${ARROW}</button>`}
      <button class="hero-link" type="button" data-act="change">Changer de séance</button>
    </section>
    ${cf ? conflictCard(cf) : ""}

    <nav class="card list" aria-label="Raccourcis">
      <button type="button" class="list-row" data-view="progres"><span><small>Muscles de la semaine</small><b>${h.any ? "À travailler : " + esc(MUSCLES[h.weak].toLowerCase()) : "Pas encore de séance cette semaine"}</b></span>${CHEV}</button>
      <button type="button" class="list-row" data-view="seche"><span><small>Sèche</small><b>${lastW ? fmtN(lastW.weight) + " kg" + (W.length > 1 ? ` · ${lastW.weight - firstW.weight <= 0 ? "" : "+"}${fmtN(lastW.weight - firstW.weight)} kg depuis le ${frDate(firstW.date)}` : "") : "Note ta première pesée"}</b></span>${CHEV}</button>
      ${backupLate ? `<button type="button" class="list-row warn" data-act="settings"><span><small>Sauvegarde</small><b>${expAge == null ? "Jamais faite" : "Il y a " + expAge + " jours"} : exporte tes données</b></span>${CHEV}</button>` : ""}
    </nav>`;
}
const SETTINGS_BTN = `<button class="icon-btn glass" type="button" data-act="settings" aria-label="Réglages"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>`;

// Panneau : choisir une autre séance
function openChange() {
  openSheet(`
    <h2 class="d up h2">Changer de séance</h2>
    <div class="stack" style="gap:10px">${DAYS.map(x => `<button type="button" class="option" data-act="open" data-day="${x.id}">
      <span class="row"><b class="d up" style="font-size:17px;text-align:left">${esc(x.title)}</b><span class="chip garde">${esc(x.day)}</span></span>
      <span class="muted" style="font-size:13px;text-align:left;display:block">${x.ex.length} exercices · environ ${estimate(x)} min · ${esc(x.tag.toLowerCase())}</span></button>`).join("")}</div>`, "Changer de séance");
}

// ---------- Carte de chaleur des muscles ----------
// Une série compte 1 pour les muscles principaux et 0,5 pour les muscles en soutien.
function weekHeat() {
  const mon = mondayKey(), raw = {};
  Object.values(DB.logs).filter(l => l.date >= mon).forEach(l => Object.entries(l.ex || {}).forEach(([k, arr]) => {
    const n = doneSets(arr).length; if (!n || !LIB[k]) return;
    LIB[k].p.forEach(g => raw[g] = (raw[g] || 0) + n);
    LIB[k].s.forEach(g => raw[g] = (raw[g] || 0) + n * 0.5);
  }));
  const max = Math.max(0, ...Object.values(raw)), lv = {};
  Object.keys(MUSCLES).forEach(g => lv[g] = max ? Math.round((raw[g] || 0) / max * 100) / 100 : 0);
  // Le muscle du programme le moins travaillé cette semaine
  const targeted = new Set(); DAYS.forEach(d => exList(d.id).forEach(x => LIB[x.k].p.forEach(g => targeted.add(g))));
  let weak = null;
  if (max) [...targeted].forEach(g => { if (!weak || (raw[g] || 0) < (raw[weak] || 0)) weak = g; });
  return { lv, raw, weak, any: max > 0 };
}
function heatCard() {
  const h = weekHeat();
  return `<div class="card heat">
    <div class="row"><h2 class="d up h2">Muscles de la semaine</h2></div>
    <div class="heat-body">
      <div class="heat-map">${heatMap(h.lv)}</div>
      <div class="stack" style="gap:12px">
        ${h.any ? `<div><div class="eyebrow">À travailler</div><b class="d up" style="font-size:20px">${esc(MUSCLES[h.weak])}</b><div class="muted" style="font-size:13px">${fmtN(h.raw[h.weak] || 0)} série${(h.raw[h.weak] || 0) > 1 ? "s" : ""} cette semaine</div></div>`
          : `<div class="muted" style="font-size:14px">Pas encore de séance cette semaine. La silhouette se colore à chaque série validée.</div>`}
        <div class="heat-scale" aria-hidden="true"><span>Peu</span><i></i><span>Beaucoup</span></div>
      </div>
    </div>
  </div>`;
}

// ---------- Programme ----------
function renderProgram() {
  if (!PTAB) PTAB = (DAYS.find(d => d.wd === weekIdx() + 1) || DAYS[0]).id;
  const d = dayById(PTAB);
  $("v-programme").innerHTML = `
    <div class="stack" style="gap:4px"><div class="eyebrow">4 séances · chaque muscle 2 fois par semaine</div><h1 class="d h1 up">Programme</h1></div>
    <div class="tabs" role="tablist">${DAYS.map(x => `<button class="tab" role="tab" type="button" data-act="ptab" data-day="${x.id}" aria-selected="${x.id === PTAB}"><b>${x.tab}</b><small>${x.day}</small></button>`).join("")}</div>
    <div class="row" style="align-items:flex-end">
      <div class="stack" style="gap:4px"><div class="eyebrow">${d.day} · ≈ ${estimate(d)} min · ${esc(d.tag)}</div><h2 class="d up h2">${esc(d.title)}</h2></div>
    </div>
    <div class="muted" style="font-size:14px">Cardio : ${esc(d.cardio)}</div>
    <div class="stack" style="gap:12px">${exList(d.id).map((x, i) => {
      const L = LIB[x.k], swapped = x.k !== x.base;
      const alts = [x.base, ...(ALT[x.base] || [])].filter(k => k !== x.k);
      return `<article class="card exc">
        <div class="map">${bodyMap(x.k)}</div>
        <div class="stack" style="gap:6px;min-width:0">
          <div class="row" style="justify-content:flex-start;gap:8px"><span class="d" style="color:var(--accent)">${i + 1}</span><h3 class="d up" style="font-size:18px">${esc(L.n)}</h3></div>
          ${swapped ? `<div class="row" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"><span class="chip depart">Variante</span><button class="link" style="background:none;border:none;padding:0" type="button" data-act="unswap" data-day="${d.id}" data-i="${i}">Remettre ${esc(LIB[x.base].n)}</button></div>` : ""}
          <div style="font-size:14px"><b>${x.sets} × ${x.lo} à ${x.hi}</b> · repos ${fmtRest(x.rest)}</div>
          <div class="muted" style="font-size:13px">${esc(x.load)}</div>
          ${alts.length ? `<div class="muted" style="font-size:13px">Variantes : ${alts.map(k => esc(LIB[k].n)).join(" · ")}</div>` : ""}
          <details><summary>Le geste</summary><ol class="steps">${L.st.map((s, j) => `<li><span>${j + 1}</span>${esc(s)}</li>`).join("")}</ol>
          <p style="margin:10px 0 0"><a class="link" href="https://www.youtube.com/results?search_query=${encodeURIComponent(L.q)}" target="_blank" rel="noopener">Voir une démo vidéo</a></p></details>
        </div></article>`; }).join("")}</div>
    <button class="btn-main" type="button" data-act="open" data-day="${d.id}">Lancer ${esc(d.tab)} ${ARROW}</button>`;
}

// ---------- Progrès ----------
function renderProgress() {
  const keys = programKeys();
  if (!PK) PK = [...keys.keys()].find(k => sessionsWith(k).length) || "dc";
  const x = keys.get(PK), L = LIB[PK], pdc = isPdc(PK), hist = sessionsWith(PK).slice().reverse(), best = bestOf(PK), c = coach(x);
  const pts = hist.map(h => ({ x: parseD(h.date).getTime(), y: Math.round(Math.max(...h.sets.map(e1rm)) * 10) / 10 }));
  const recs = []; keys.forEach((xx, k) => { const b = bestOf(k); if (b) recs.push({ k, ...b }); });
  $("v-progres").innerHTML = `
    <div class="stack" style="gap:4px"><div class="eyebrow">Courbes et records</div><h1 class="d h1 up">Progrès</h1></div>
    ${cranCard()}
    ${heatCard()}
    <label class="field" for="pk">Exercice
      <select id="pk">${[...keys.keys()].map(k => `<option value="${k}" ${k === PK ? "selected" : ""}>${esc(LIB[k].n)}${sessionsWith(k).length ? "" : " · pas encore fait"}</option>`).join("")}</select></label>
    <div class="grid2">
      <div class="tile"><span class="k">Record</span><span class="v">${best ? (pdc ? best.r + "<small> reps</small>" : fmtN(best.w) + "<small> kg</small>") : "—"}</span><span class="s">${best ? (pdc ? "" : best.r + " reps · ") + frDate(best.date) : "aucune séance"}</span></div>
      <div class="tile"><span class="k">${pdc ? "Séances" : "Force estimée"}</span><span class="v">${pdc ? hist.length : (best ? fmtN(best.v) + "<small> kg</small>" : "—")}</span><span class="s">${pdc ? "avec cet exercice" : "max sur 1 répétition"}</span></div>
    </div>
    <div class="card coach"><b>Le coach</b><span class="chip ${c.type}">${c.label}</span><p>${esc(c.text)}</p></div>
    <div class="card stack">
      <h3 class="d up" style="font-size:18px">${pdc ? "Meilleure série" : "Force estimée"} par séance</h3>
      ${pts.length ? lineChart(pts, { unit: pdc ? "reps" : "kg", label: "Évolution " + L.n }) : `<div class="empty">La courbe apparaîtra après ta première séance avec cet exercice.</div>`}
    </div>
    ${hist.length ? `<div class="card"><h3 class="d up" style="font-size:18px;margin-bottom:6px">Historique</h3><table class="tbl"><thead><tr><th>Date</th><th>Séries</th></tr></thead><tbody>
      ${hist.slice().reverse().map(h => `<tr><td>${frDate(h.date, { weekday: "short", day: "numeric", month: "short" })}</td><td>${h.sets.map(s => pdc ? s.r : `${s.r} × ${fmtN(s.w)}`).join(" · ")}</td></tr>`).join("")}</tbody></table></div>` : ""}
    <div class="card"><h3 class="d up" style="font-size:18px;margin-bottom:6px">Tous tes records</h3>
      ${recs.length ? `<table class="tbl"><tbody>${recs.sort((a, b) => b.date.localeCompare(a.date)).map(r => `<tr><td>${esc(LIB[r.k].n)}</td><td><b>${isPdc(r.k) ? r.r + " reps" : `${fmtW(r.w)} × ${r.r}`}</b></td><td class="muted">${frDate(r.date)}</td></tr>`).join("")}</tbody></table>`
      : `<div class="empty">Tes records apparaîtront ici dès ta première séance.</div>`}</div>`;
}

// ---------- Sèche ----------
function renderBody() {
  const rows = Object.entries(DB.body).map(([id, b]) => ({ id, ...b })).sort((a, b) => a.date.localeCompare(b.date));
  const W = rows.filter(r => r.weight != null), T = rows.filter(r => r.waist != null);
  let verdict = `<div class="verdict info">Pèse-toi une fois par semaine, le même jour, le matin à jeun. Mesure ton tour de taille au niveau du nombril. Après deux semaines, le coach te dit si ton rythme est bon.</div>`;
  if (W.length >= 2) {
    const a = W[0], b = W[W.length - 1], days = (parseD(b.date) - parseD(a.date)) / 864e5;
    if (days >= 7) {
      const pw = (b.weight - a.weight) / (days / 7), pct = pw / a.weight * 100;
      const tt = T.length >= 2 ? ` Tour de taille : ${T[T.length - 1].waist - T[0].waist <= 0 ? "" : "+"}${fmtN(T[T.length - 1].waist - T[0].waist)} cm.` : "";
      if (pct < -1) verdict = `<div class="verdict bad"><b>Trop rapide</b> : ${fmtN(-pw)} kg par semaine. Au-delà de 1 % de ton poids par semaine, tu risques de perdre du muscle. Mange un peu plus, surtout des protéines.${tt}</div>`;
      else if (pct <= -0.3) verdict = `<div class="verdict good"><b>Bon rythme</b> : ${fmtN(-pw)} kg par semaine en moyenne. C’est la bonne zone pour sécher sans perdre de force.${tt}</div>`;
      else verdict = `<div class="verdict bad"><b>Ça ne descend pas</b> : ${pw > 0 ? "+" : ""}${fmtN(pw)} kg par semaine. Si ton tour de taille ne baisse pas non plus, c’est l’alimentation qu’il faut revoir.${tt}</div>`;
    }
  }
  const tile = (lab, arr, f, u) => {
    if (!arr.length) return `<div class="tile"><span class="k">${lab}</span><span class="v">—</span><span class="s">pas encore de mesure</span></div>`;
    const l = arr[arr.length - 1][f], dlt = l - arr[0][f];
    return `<div class="tile"><span class="k">${lab}</span><span class="v">${fmtN(l)}<small> ${u}</small></span><span class="s">${arr.length > 1 ? (dlt > 0 ? "+" : "") + fmtN(dlt) + " " + u + " depuis le " + frDate(arr[0].date) : "première mesure"}</span></div>`;
  };
  $("v-seche").innerHTML = `
    <div class="stack" style="gap:4px"><div class="eyebrow">Perte de gras</div><h1 class="d h1 up">Sèche</h1></div>
    <form class="card stack" id="bform">
      <label class="field" for="b-date">Date<input type="date" id="b-date" value="${today()}" required></label>
      <div class="grid2">
        <label class="field" for="b-weight">Poids (kg)<input type="text" inputmode="decimal" id="b-weight" placeholder="72,4"></label>
        <label class="field" for="b-waist">Taille (cm)<input type="text" inputmode="decimal" id="b-waist" placeholder="84"></label>
      </div>
      <button class="btn btn-dark" type="submit">Enregistrer</button>
    </form>
    ${verdict}
    <div class="grid2">${tile("Poids", W, "weight", "kg")}${tile("Tour de taille", T, "waist", "cm")}</div>
    ${W.length ? `<div class="card stack"><h3 class="d up" style="font-size:18px">Poids</h3>${lineChart(W.map(r => ({ x: parseD(r.date).getTime(), y: r.weight })), { label: "Évolution du poids" })}</div>` : ""}
    ${T.length ? `<div class="card stack"><h3 class="d up" style="font-size:18px">Tour de taille</h3>${lineChart(T.map(r => ({ x: parseD(r.date).getTime(), y: r.waist })), { unit: "cm", label: "Évolution du tour de taille" })}</div>` : ""}
    ${rows.length ? `<div class="card"><h3 class="d up" style="font-size:18px;margin-bottom:6px">Mesures</h3><table class="tbl"><tbody>${rows.slice().reverse().map(r => `<tr>
      <td>${frDate(r.date, { day: "numeric", month: "short", year: "numeric" })}</td><td>${r.weight != null ? fmtN(r.weight) + " kg" : "—"}</td><td>${r.waist != null ? fmtN(r.waist) + " cm" : "—"}</td>
      <td style="text-align:right"><button class="del ${ARMED === r.id ? "armed" : ""}" type="button" data-act="del" data-id="${r.id}">${ARMED === r.id ? "Confirmer" : "Supprimer"}</button></td></tr>`).join("")}</tbody></table></div>` : ""}`;
}

// ============================================================
//  Séance guidée
// ============================================================
let actx = null, wake = null, timer = null, lastSec = null;
function beep(freq = 880, dur = 0.16, vol = 0.25) {
  if (DB.prefs.sound === false) return;
  try {
    if (!actx) return; if (actx.state === "suspended") actx.resume();
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
async function lockScreen() {
  if (NATIVE) return native("keepAwake", true);
  try { if ("wakeLock" in navigator && document.visibilityState === "visible") wake = await navigator.wakeLock.request("screen"); } catch (e) {}
}
function unlockScreen() {
  if (NATIVE) return native("keepAwake", false);
  try { wake && wake.release(); } catch (e) {} wake = null;
}

const doc = () => DB.logs[G.docId];
const day = () => dayById(G.dayId);
const exs = () => exList(G.dayId, G.docId);
const curX = () => exs()[G.ex];
const setsOf = x => (doc().ex[x.k] || []);
const firstPending = x => { const a = setsOf(x); for (let j = 0; j < x.sets; j++) if (!a[j]) return j; return -1; };

function openSession(dayId) {
  try { if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); } } catch (e) {}
  const id = today() + "_" + dayId;
  if (!(G && G.docId === id)) {
    if (!DB.logs[id]) {
      // Les variantes gardées par défaut sont figées dans la séance du jour
      const swap = {};
      dayById(dayId).ex.forEach((x, i) => { const k = DB.prefs.swaps[dayId + ":" + i]; if (k && k !== x.k) swap[i] = k; });
      DB.logs[id] = { date: today(), day: dayId, startedAt: Date.now(), finished: false, ex: {}, swap };
      save();
    }
    G = { dayId, docId: id, ex: 0, set: 0, screen: "intro", warmed: false, warm: [] };
    const list = exs(), ex = list.findIndex(x => firstPending(x) >= 0);
    G.ex = ex < 0 ? list.length - 1 : ex;
    G.set = Math.max(0, firstPending(list[G.ex]));
    if (ex < 0) G.screen = "done";
  }
  if (DB.logs[id].finished) DB.logs[id].finished = false;
  saveG(); save();
  native("requestNotifications");
  if (musicOn()) native("musicStart");
  $("session").hidden = false; document.body.style.overflow = "hidden";
  lockScreen();
  if (G.screen === "rest") { if (G.restEnd > Date.now()) return screenRest(true); return proceed(); }
  goto(G.screen);
}
function closeSession() {
  clearInterval(timer); timer = null;
  closeSheet(true);
  const ses = $("session"); ses.style.transform = ""; ses.style.transition = "";
  ses.hidden = true; document.body.style.overflow = "";
  $("stage").innerHTML = ""; unlockScreen(); render();
  native("musicStop");
}

// Transition entre deux écrans
// from : "right" / "left" quand on change d'exercice en glissant (le nouvel écran arrive du côté du geste)
function transition(html, extra = "", from = null) {
  const stage = $("stage"), old = stage.querySelector(".screen:not(.leave)");
  const el = document.createElement("div");
  el.className = "screen enter " + extra + (from ? " from-" + from : ""); el.innerHTML = `<div class="in">${html}</div>`;
  stage.appendChild(el);
  void el.offsetHeight; el.classList.remove("enter");
  if (old) { old.classList.add("leave"); setTimeout(() => old.remove(), 220); }
  return el;
}
function topbar(label) {
  $("s-count").textContent = label;
  $("s-segs").innerHTML = exs().map((x, i) => `<button type="button" data-act="jump" data-i="${i}" aria-label="Exercice ${i + 1} : ${esc(LIB[x.k].n)}" class="${firstPending(x) < 0 ? "done" : (i === G.ex && G.screen !== "done" ? "cur" : "")}"></button>`).join("");
}
function goto(screen, from = null) {
  G.screen = screen; saveG();
  if (screen === "intro") screenIntro(from);
  else if (screen === "set") screenSet();
  else if (screen === "warmup") screenWarmup();
  else if (screen === "done") screenDone();
}

// Panneau : choisir une variante
function openVariants() {
  const x = curX(), done = doneSets(setsOf(x)).length > 0;
  const options = [x.base, ...(ALT[x.base] || [])];
  openSheet(`
    <div class="stack" style="gap:4px"><div class="eyebrow">À la place de ${esc(LIB[x.base].n)}</div><h2 class="d up h2">Variantes</h2></div>
    ${done ? `<div class="verdict bad">Tu as déjà fait des séries sur cet exercice aujourd’hui. Termine-le, ou change à la prochaine séance.</div>` : ""}
    <div class="stack" style="gap:10px">${options.map(k => {
      const L = LIB[k], last = sessionsWith(k, G.docId)[0], cur = k === x.k;
      return `<button type="button" class="option${cur ? " cur" : ""}" data-act="pick" data-k="${k}" ${done ? "disabled" : ""}>
        <span class="row"><b class="d up" style="font-size:17px;text-align:left">${esc(L.n)}</b>${cur ? `<span class="chip depart">Actuel</span>` : (k === x.base ? `<span class="chip garde">Programme</span>` : "")}</span>
        <span class="muted" style="font-size:13px;text-align:left;display:block">${esc(L.p.map(g => MUSCLES[g]).join(", "))}${last ? " · dernière fois " + last.sets.map(s => isPdc(k) ? s.r : `${s.r} × ${fmtN(s.w)}`).slice(0, 2).join(", ") : " · jamais fait"}</span>
      </button>`; }).join("")}</div>
    <label class="keep"><input type="checkbox" id="keep-swap"> Garder ce choix pour les prochaines séances</label>`, "Variantes de l’exercice");
}
function pickSwap(k) {
  const x = curX(), keep = $("keep-swap") && $("keep-swap").checked;
  const l = doc(); l.swap = l.swap || {};
  if (k === x.base) delete l.swap[G.ex]; else l.swap[G.ex] = k;
  const pk = G.dayId + ":" + G.ex;
  if (keep) { if (k === x.base) delete DB.prefs.swaps[pk]; else DB.prefs.swaps[pk] = k; }
  save(); G.set = Math.max(0, firstPending(curX()));
  closeSheet();
  if (k !== x.k) { toast(`${LIB[k].n} à la place de ${LIB[x.k].n}`); goto("intro"); }
}

// Écran 1 : présentation de l'exercice
function screenIntro(from = null) {
  const x = curX(), L = LIB[x.k], c = coach(x, G.docId);
  topbar(`Exercice ${G.ex + 1} sur ${exs().length}`);
  const canSwap = (ALT[x.base] || []).length > 0;
  transition(`
    <div class="stack" style="gap:6px">
      <div class="eyebrow">${x.sets} séries · ${x.lo} à ${x.hi} reps · repos ${fmtRest(x.rest)}</div>
      <h1 class="d s-title">${esc(L.n)}</h1>
      ${canSwap ? `<button class="swap-btn" type="button" data-act="swap"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${x.k !== x.base ? "Variante de " + esc(LIB[x.base].n) : "Remplacer par une variante"}</button>` : ""}
    </div>
    ${noteCard(x.k)}
    <div class="card coach"><b>${c.w != null && !isPdc(x.k) ? "Objectif : " + fmtW(c.w) : "Objectif"}</b><span class="chip ${c.type}">${c.label}</span><p>${esc(c.text)}</p></div>
    <div class="card zones">
      ${bodyMap(x.k)}
      <div class="lg">
        <div><span class="muted"><i class="sw" style="background:var(--m1)"></i>Principal</span><b>${esc(L.p.map(g => MUSCLES[g]).join(", "))}</b></div>
        ${L.s.length ? `<div><span class="muted"><i class="sw" style="background:var(--m2)"></i>En soutien</span><b>${esc(L.s.map(g => MUSCLES[g]).join(", "))}</b></div>` : ""}
      </div>
    </div>
    <div class="stack">
      <div class="eyebrow">Le geste</div>
      <ol class="steps" style="margin:0">${L.st.map((s, j) => `<li><span>${j + 1}</span>${esc(s)}</li>`).join("")}</ol>
    </div>
    <div class="push">
      <a class="link" style="text-align:center" href="https://www.youtube.com/results?search_query=${encodeURIComponent(L.q)}" target="_blank" rel="noopener">Voir une démo vidéo</a>
      <button class="btn-main" type="button" data-act="begin">C’est parti ${ARROW}</button>
    </div>`, "", from);
}

// ---------- Réglages de machine (siège, dossier, position des pieds…) ----------
function noteCard(k) {
  const n = DB.prefs.notes[k];
  return `<button type="button" class="card note-card${n ? "" : " empty-note"}" data-act="note" data-k="${k}">
    <span class="eyebrow">Tes réglages</span>
    <span>${n ? esc(n) : "Ajoute tes réglages de machine : siège, dossier, position des pieds…"}</span></button>`;
}
function openNote(k) {
  openSheet(`
    <div class="stack" style="gap:4px"><div class="eyebrow">${esc(LIB[k].n)}</div><h2 class="d up h2">Tes réglages</h2></div>
    <label class="field" for="note-text">Ce que tu règles à chaque fois
      <textarea id="note-text" rows="3" maxlength="160" placeholder="Siège cran 4, dossier 2, pieds en haut de la plateforme">${esc(DB.prefs.notes[k] || "")}</textarea></label>
    <button class="btn-main" type="button" data-act="save-note" data-k="${k}">Enregistrer</button>`, "Réglages de la machine");
}

// ---------- Échauffement : 2 séries légères avant le premier exercice chargé ----------
function needsWarmup() {
  if (G.warmed) return false;
  const list = exs(), x = curX();
  if (isPdc(x.k) || doneSets(setsOf(x)).length) return false;
  const firstLoaded = list.findIndex(e => !isPdc(e.k));
  return G.ex === firstLoaded;
}
function warmSets(x) {
  const p = prefill(x, 0), w = num(p.w), step = STEP[LIB[x.k].t] || 2.5;
  if (!w) return [];
  const min = LIB[x.k].t === "barre" ? (LIB[x.k].bar || 20) : 0;
  const r = v => Math.max(min, Math.round(v / step) * step);
  return [{ w: r(w * 0.5), reps: 10, pct: 50 }, { w: r(w * 0.75), reps: 5, pct: 75 }];
}
function screenWarmup() {
  const x = curX(), L = LIB[x.k], sets = warmSets(x);
  if (!sets.length) { G.warmed = true; return goto("set"); }
  G.warm = G.warm || [];
  topbar(L.n);
  transition(`
    <div class="stack" style="gap:6px"><div class="eyebrow">Avant ${esc(L.n.toLowerCase())}</div><h1 class="d s-title">Échauffement</h1></div>
    <p class="muted" style="margin:0;font-size:15px">Deux séries légères pour préparer les articulations. Elles ne comptent pas dans tes progrès. Repos libre, environ 1 minute.</p>
    <div class="stack" style="gap:10px">${sets.map((s, i) => `
      <div class="card warm-row${G.warm[i] ? " ok" : ""}">
        <div class="row">
          <div class="stack" style="gap:2px"><span class="eyebrow">${s.pct} % · ${s.reps} reps</span><b class="d" style="font-size:30px">${fmtN(s.w)}<small style="font-size:15px"> ${unitOf(x.k)}</small></b></div>
          <button type="button" class="warm-btn" data-act="warm-done" data-i="${i}" aria-pressed="${!!G.warm[i]}" aria-label="Série d’échauffement ${i + 1} faite">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
        ${platesHTML(x.k, s.w)}
      </div>`).join("")}</div>
    <div class="push">
      <button class="btn-main" type="button" data-act="warm-end">Passer aux séries ${ARROW}</button>
    </div>`);
}

// Valeurs proposées pour une série
function prefill(x, j) {
  const arr = setsOf(x), cur = arr[j]; if (cur) return { w: cur.w, r: cur.r, from: "edit" };
  const prev = doneSets(arr).slice(-1)[0], hist = sessionsWith(x.k, G.docId)[0], c = coach(x, G.docId);
  let w, from = "start";
  if (prev) { w = prev.w; from = "prev"; }
  else if (c.type === "monte" && c.w != null) { w = c.w; from = "coach"; }
  else if (hist) { w = (hist.sets[j] || hist.sets[hist.sets.length - 1]).w; from = "hist"; }
  else w = x.w0;
  const r = hist && hist.sets[j] ? hist.sets[j].r : (prev ? prev.r : x.hi);
  return { w: isPdc(x.k) ? 0 : (w ?? ""), r, from };
}

// Écran 2 : une série
function screenSet() {
  const x = curX(), L = LIB[x.k], j = G.set, arr = setsOf(x), p = prefill(x, j), hist = sessionsWith(x.k, G.docId)[0];
  topbar(`${L.n}`);
  const chips = Array.from({ length: x.sets }, (_, i) => {
    const s = arr[i];
    if (i === j) return `<button type="button" class="cur" aria-current="step">${s ? "Modif." : "En cours"}</button>`;
    if (s) return `<button type="button" class="ok" data-act="edit" data-j="${i}" aria-label="Modifier la série ${i + 1}">${isPdc(x.k) ? s.r + " reps" : `${s.r} × ${fmtN(s.w)}`}</button>`;
    return `<button type="button" disabled aria-label="Série ${i + 1} à venir"></button>`;
  }).join("");
  const hint = { edit: "Tu modifies une série déjà faite.", prev: "Repris de ta série précédente.", coach: "Le coach te fait monter d’un cran.", hist: "Repris de ta dernière séance.", start: "Charge de départ du programme." }[p.from];
  transition(`
    <div class="big-set"><span class="d n up">Série ${j + 1}</span><span class="d of">/ ${x.sets}</span></div>
    ${DB.prefs.notes[x.k] ? `<button type="button" class="note-line" data-act="note" data-k="${x.k}"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>${esc(DB.prefs.notes[x.k])}</button>` : ""}
    <div class="sets" style="--n:${x.sets}">${chips}</div>
    <div class="muted" style="font-size:14px">Objectif <b style="color:var(--ink)">${x.lo} à ${x.hi} reps</b>${hist && hist.sets[j] ? ` · dernière fois ${hist.sets[j].r} × ${isPdc(x.k) ? "" : fmtN(hist.sets[j].w) + " kg"}` : ""}</div>
    ${isPdc(x.k) ? "" : `<div class="stepper">
      <button type="button" data-act="step" data-f="w" data-d="-${STEP[L.t]}" aria-label="Moins ${fmtN(STEP[L.t])} kg">−</button>
      <label class="mid" for="in-w"><span>Charge</span><input id="in-w" type="text" inputmode="decimal" value="${p.w === "" || p.w == null ? "" : fmtN(p.w)}" placeholder="0"><span class="unit">${unitOf(x.k)}</span></label>
      <button type="button" data-act="step" data-f="w" data-d="${STEP[L.t]}" aria-label="Plus ${fmtN(STEP[L.t])} kg">+</button></div>
    <div id="plates" aria-live="polite">${platesHTML(x.k, p.w)}</div>`}
    <div class="stepper">
      <button type="button" data-act="step" data-f="r" data-d="-1" aria-label="Une répétition de moins">−</button>
      <label class="mid" for="in-r"><span>Répétitions</span><input id="in-r" type="text" inputmode="numeric" value="${p.r}"><span class="unit">reps</span></label>
      <button type="button" data-act="step" data-f="r" data-d="1" aria-label="Une répétition de plus">+</button></div>
    <div class="muted" style="font-size:13px;text-align:center">${hint}</div>
    <div class="push">
      ${musicBar()}
      <button class="link" style="background:none;border:none" type="button" data-act="intro">Revoir le geste</button>
      <button class="btn-main" type="button" data-act="validate"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Série validée</button>
    </div>`);
}

function validate() {
  const x = curX(), L = LIB[x.k], j = G.set;
  const w = isPdc(x.k) ? 0 : num($("in-w").value), r = parseInt($("in-r").value, 10);
  if (w == null) return toast("Indique la charge");
  if (!(r > 0)) return toast("Indique le nombre de répétitions");
  const wasEdit = !!setsOf(x)[j];
  const best = bestOf(x.k, G.docId);
  const arr = doc().ex[x.k] = setsOf(x).slice();
  arr[j] = { w, r };
  for (let i = 0; i < arr.length; i++) if (arr[i] === undefined) arr[i] = null;
  save(); vibrate(25);
  if (best && e1rm({ w, r }) > best.v + 0.01) celebrate(L.n, isPdc(x.k) ? `${r} répétitions` : `${fmtN(w)} kg × ${r}`);
  const next = firstPending(x);
  if (wasEdit) { if (next >= 0) { G.set = next; return goto("set"); } return afterExercise(); }
  if (next >= 0) return startRest(x.rest, { screen: "set", ex: G.ex, set: next });
  afterExercise();
}
function afterExercise() {
  const list = exs();
  const nextEx = list.findIndex((x, i) => i > G.ex && firstPending(x) >= 0);
  const anyLeft = list.findIndex(x => firstPending(x) >= 0);
  if (nextEx >= 0) return startRest(120, { screen: "intro", ex: nextEx, set: 0 });
  if (anyLeft >= 0) return startRest(120, { screen: "intro", ex: anyLeft, set: 0 });
  finishSession();
}

// Écran 3 : récupération plein écran
function startRest(sec, after) {
  G.screen = "rest"; G.restEnd = Date.now() + sec * 1000; G.restTotal = sec; G.after = after; saveG();
  scheduleNativeRest();
  screenRest(false);
}
// L'appli Android prend le relais si l'écran s'éteint ou si tu quittes l'appli
function scheduleNativeRest() { if (G && G.restEnd) native("scheduleRest", String(G.restEnd), restNextText(G.after)); }
function restNextText(a) {
  const list = exs();
  if (a.screen === "intro") return `Exercice suivant : ${LIB[list[a.ex].k].n}`;
  const x = list[a.ex], saveSet = G.set; G.set = a.set; const p = prefill(x, a.set); G.set = saveSet;
  return `Série ${a.set + 1} · ${isPdc(x.k) ? p.r + " reps" : `${fmtN(p.w || 0)} kg × ${p.r}`}`;
}
function screenRest(resumed) {
  const x = curX();
  topbar(`${LIB[x.k].n}`);
  const el = transition(`
    <div class="rest-label" id="r-label" style="margin-top:12px">Récupération</div>
    <div class="rest-wrap shake-host">
      <div class="glow"></div>
      <svg class="ring" viewBox="0 0 320 320" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent-2)"/><stop offset="1" stop-color="var(--accent)"/></linearGradient></defs><circle class="tr" cx="160" cy="160" r="140"/><circle class="pr" id="r-ring" cx="160" cy="160" r="140" stroke-dasharray="879.65" stroke-dashoffset="0"/></svg>
      <div class="rest-num"><span class="grow"><span class="shake"><span class="t d num" id="r-time" role="timer">${mmss(Math.max(0, Math.ceil((G.restEnd - Date.now()) / 1000)))}</span></span></span><span class="muted" style="font-size:14px">sur ${mmss(G.restTotal)}</span></div>
    </div>
    <div class="card next glass"><div class="eyebrow">Ensuite</div><div style="font-size:17px;font-weight:600;margin-top:2px">${esc(restNextText(G.after))}</div></div>
    <div class="push">${musicBar()}<div class="rest-btns">
      <button class="btn glass" type="button" data-act="plus">+15 secondes</button>
      <button class="btn btn-dark" type="button" data-act="skip">Passer</button></div></div>`, "rest zoom rest-bg");
  el.querySelector(".in").classList.add("rest");
  lastSec = null;
  clearInterval(timer); timer = setInterval(() => tick(el), 200); tick(el);
}
function tick(el) {
  if (!G || G.screen !== "rest") return;
  const left = Math.max(0, Math.ceil((G.restEnd - Date.now()) / 1000));
  const t = el.querySelector("#r-time"), ring = el.querySelector("#r-ring"), lab = el.querySelector("#r-label");
  if (!t) return;
  t.textContent = mmss(left);
  ring.setAttribute("stroke-dashoffset", (879.65 * (1 - Math.min(left, G.restTotal) / G.restTotal)).toFixed(1));
  const urgent = left > 0 && left <= 10;
  el.classList.toggle("urgent", urgent);
  if (urgent) lab.textContent = "Prépare-toi";
  else if (left > 10) lab.textContent = "Récupération";
  if (left !== lastSec) {
    if (urgent && lastSec !== null) { vibrate(70); if (left <= 3) beep(660, 0.12, 0.2); }
    if (left === 10) announce("10 secondes");
    lastSec = left;
  }
  if (left === 0) {
    clearInterval(timer); timer = null;
    el.classList.remove("urgent"); el.classList.add("go"); lab.textContent = "C’est reparti";
    vibrate([300, 120, 300]); beep(990, 0.3, 0.3); announce("C’est reparti");
    setTimeout(() => { if (G && G.screen === "rest") proceed(); }, 900);
  }
}
function proceed() {
  clearInterval(timer); timer = null; native("cancelRest");
  const a = G.after || { screen: "set", ex: G.ex, set: firstPending(curX()) };
  G.ex = a.ex; G.set = Math.max(0, a.set); delete G.restEnd; delete G.after;
  goto(a.screen);
}

// « C'est parti » : échauffement avant le premier exercice chargé, sinon la première série à faire
function beginExercise() { const j = firstPending(curX()); G.set = j < 0 ? 0 : j; goto(needsWarmup() ? "warmup" : "set"); }
function addRest(sec) {
  G.restEnd = Math.max(G.restEnd, Date.now()) + sec * 1000; G.restTotal += sec; saveG(); scheduleNativeRest();
  if (!timer) { const el = $("stage").querySelector(".screen:not(.leave)"); if (el) { el.classList.remove("go"); timer = setInterval(() => tick(el), 200); } }
}

// Écran 4 : bilan
function finishSession() {
  doc().finished = true; doc().finishedAt = Date.now(); save();
  goto("done");
}
function screenDone() {
  const d = day(), l = doc();
  topbar("Bilan");
  let sets = 0, vol = 0; const recs = [];
  exs().forEach(x => {
    const a = doneSets(l.ex[x.k]); sets += a.length; a.forEach(s => vol += (s.w || 0) * s.r);
    const b = bestOf(x.k, G.docId), top = a.reduce((m, s) => !m || e1rm(s) > e1rm(m) ? s : m, null);
    if (b && top && e1rm(top) > b.v + 0.01) recs.push(`${LIB[x.k].n} : ${isPdc(x.k) ? top.r + " reps" : fmtW(top.w) + " × " + top.r}`);
  });
  const total = d.ex.reduce((t, x) => t + x.sets, 0), mins = l.startedAt ? Math.round(((l.finishedAt || Date.now()) - l.startedAt) / 60000) : null;
  const news = cranNews(); save();
  vibrate([60, 60, 60]);
  transition(`
    <div class="stack" style="gap:6px;margin-top:12px"><div class="eyebrow">${esc(d.title)}</div><h1 class="d s-title">Séance terminée</h1></div>
    <div class="grid2">
      <div class="tile"><span class="k">Séries</span><span class="v"><span data-count="${sets}">${sets}</span><small> / ${total}</small></span></div>
      <div class="tile"><span class="k">Durée</span><span class="v">${mins != null && mins < 300 ? `<span data-count="${mins}">${mins}</span><small> min</small>` : "—"}</span></div>
    </div>
    <div class="tile"><span class="k">Volume soulevé</span><span class="v"><span data-count="${Math.round(vol)}">${Math.round(vol).toLocaleString("fr-FR")}</span><small> kg</small></span><span class="s">charge × répétitions, toutes séries confondues</span></div>
    ${recs.length ? `<div class="card coach"><b>${recs.length} record${recs.length > 1 ? "s" : ""} battu${recs.length > 1 ? "s" : ""}</b><span class="chip record">Record</span><p>${recs.map(esc).join("<br>")}</p></div>` : ""}
    ${news.up || news.fresh.length ? `<button type="button" class="card coach cran-new" data-act="crans"><b>${news.up ? "Tu montes au cran " + news.c.level : "Nouveau badge"}</b><span class="chip record">Cran ${news.c.level}</span><p>${news.fresh.map(b => esc(b.name)).join(" · ") || "Continue comme ça : le prochain cran arrive plus vite que tu ne le crois."}</p></button>` : ""}
    <div class="card coach"><b>Cardio</b><span class="chip depart">Ensuite</span><p>${esc(d.cardio)}</p></div>
    <div class="push"><button class="btn-main" type="button" data-act="home">Retour à l’accueil</button></div>`, "done-bg");
  countUp($("stage"));
  if (news.up) setTimeout(() => celebrate("Monte d’un cran", "Cran " + news.c.level, "Nouveau cran"), 700);
}

// Les chiffres du bilan défilent jusqu'à leur valeur (moment rare : une fois par séance)
function countUp(root) {
  if (REDUCED) return;
  root.querySelectorAll("[data-count]").forEach(el => {
    const to = +el.dataset.count, t0 = performance.now(), dur = 900;
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * e).toLocaleString("fr-FR");
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = "0"; requestAnimationFrame(step);
  });
}

// Record battu : la marche Notch se dessine et monte d'un cran
function celebrate(exName, value, title = "Nouveau record") {
  vibrate([20, 50, 20, 50, 120]);
  announce(`${title} : ${exName}, ${value}`);
  const el = document.createElement("div");
  el.className = "celebrate"; el.setAttribute("role", "status");
  el.innerHTML = `<div class="cel-card glass">
    <svg viewBox="0 0 64 64" width="88" height="88" aria-hidden="true"><rect width="64" height="64" rx="16" fill="var(--accent)"/><path class="draw" pathLength="1" d="M14 44 H26 V34 H38 V24 H50" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div class="eyebrow" style="color:var(--accent)">${esc(title)}</div>
    <div class="d up" style="font-size:26px;line-height:1">${esc(value)}</div>
    <div class="muted" style="font-size:14px">${esc(exName)}</div></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("on")));
  const close = () => { el.classList.remove("on"); el.classList.add("off"); setTimeout(() => el.remove(), 300); };
  el.addEventListener("click", close);
  setTimeout(close, 2200);
}

// ============================================================
//  Panneaux qui montent du bas (variantes, réglages)
//  Ouverture et fermeture à la façon iOS ; on les referme en les tirant vers le bas.
// ============================================================
let SHEET = null;
function openSheet(html, label) {
  closeSheet(true);
  const wrap = document.createElement("div");
  wrap.className = "sheet-wrap";
  wrap.innerHTML = `<div class="scrim" data-act="sheet-close"></div>
    <div class="sheet glass" role="dialog" aria-modal="true" aria-label="${esc(label)}">
      <div class="grabber" aria-hidden="true"></div>
      <div class="sheet-in">${html}</div>
    </div>`;
  document.body.appendChild(wrap);
  SHEET = { wrap, sheet: wrap.querySelector(".sheet"), scrim: wrap.querySelector(".scrim"), dragEnd: 0 };
  sheetDrag(SHEET);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add("open")));
}
function closeSheet(instant) {
  if (!SHEET) return;
  const s = SHEET; SHEET = null;
  if (instant) { s.wrap.remove(); return; }
  s.sheet.style.transform = ""; s.scrim.style.opacity = "";
  s.wrap.classList.remove("open"); s.wrap.classList.add("closing");
  setTimeout(() => s.wrap.remove(), 340);
}
function sheetDrag(S) {
  const el = S.sheet;
  let st = null;
  el.addEventListener("click", ev => { if (Date.now() - S.dragEnd < 350) { ev.stopPropagation(); ev.preventDefault(); } }, true);
  el.addEventListener("pointerdown", e => {
    if (e.target.closest("input[type=time]")) return;
    st = { id: e.pointerId, x0: e.clientX, y0: e.clientY, hist: [{ y: e.clientY, t: e.timeStamp }], dir: null, dy: 0 };
  });
  el.addEventListener("pointermove", e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x0, dy = e.clientY - st.y0;
    if (!st.dir) {
      if (Math.hypot(dx, dy) < 10) return;
      const inner = el.querySelector(".sheet-in");
      st.dir = Math.abs(dy) > Math.abs(dx) && dy > 0 && inner.scrollTop <= 0 ? "y" : "n";
      if (st.dir !== "y") { st = null; return; }
      el.setPointerCapture(e.pointerId);
      el.style.transition = "none"; S.scrim.style.transition = "none";
    }
    const h = el.offsetHeight, y = dy > 0 ? dy : -rubber(-dy, h) * 0.3;
    st.dy = y;
    el.style.transform = `translateY(${y}px)`;
    S.scrim.style.opacity = String(Math.max(0, 1 - y / h));
    st.hist.push({ y: e.clientY, t: e.timeStamp }); if (st.hist.length > 5) st.hist.shift();
  });
  const end = e => {
    if (!st || e.pointerId !== st.id) return;
    const s = st; st = null;
    if (s.dir !== "y") return;
    S.dragEnd = Date.now();
    const v = velocityOf(s.hist, "y"), h = el.offsetHeight;
    el.style.transition = ""; S.scrim.style.transition = "";
    // Fermeture à la distance OU à la vitesse : un petit geste rapide suffit
    if (s.dy + project(v, 0.99) > h * 0.4 || v > 700) closeSheet();
    else { el.style.transform = ""; S.scrim.style.opacity = ""; }
  };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
}

// ---------- Réglages ----------
function openSettings() {
  const n = DB.prefs.notif;
  openSheet(`
    <h2 class="d up h2">Réglages</h2>
    <div class="set-group">
      <div class="eyebrow">Notifications</div>
      <label class="toggle" for="st-session"><span><b>Rappel de séance</b><small>Les jours d’entraînement, si la séance n’est pas faite</small></span><input type="checkbox" role="switch" id="st-session" ${n.session ? "checked" : ""}></label>
      <label class="toggle" for="st-time"><span><b>Heure du rappel</b></span><input type="time" id="st-time" value="${esc(n.time)}"></label>
      <label class="toggle" for="st-weekly"><span><b>Bilan du dimanche</b><small>Dimanche à 19 h : séances, records, muscle à travailler</small></span><input type="checkbox" role="switch" id="st-weekly" ${n.weekly ? "checked" : ""}></label>
    </div>
    <div class="set-group">
      <div class="eyebrow">Affichage et son</div>
      <label class="toggle" for="st-solid"><span><b>Réduire la transparence</b><small>Fonds pleins à la place de l’effet verre</small></span><input type="checkbox" role="switch" id="st-solid" ${DB.prefs.solid ? "checked" : ""}></label>
      <label class="toggle" for="st-sound"><span><b>Bip de fin de récup</b><small>Sur les 3 dernières secondes</small></span><input type="checkbox" role="switch" id="st-sound" ${DB.prefs.sound !== false ? "checked" : ""}></label>
    </div>
    ${NATIVE ? `<div class="set-group" id="music-group">${musicGroup()}</div>
    <div class="set-group" id="cal-group">${calGroup()}</div>
    <div class="set-group" id="gym-group">${gymGroup()}</div>` : ""}
    <div class="set-group">
      <div class="eyebrow">Sauvegarde</div>
      <p class="muted" style="font-size:14px;margin:4px 0 8px">Tes données sont seulement sur ce téléphone. Exporte-les chaque semaine : c’est ta sauvegarde, et le fichier à envoyer à Claude pour un bilan.${DB.lastExport ? " Dernière : " + frDate(DB.lastExport, { day: "numeric", month: "long" }) + "." : ""}</p>
      <div class="grid2"><button class="btn btn-dark" type="button" data-act="export">Exporter</button><button class="btn" type="button" data-act="import">Importer</button></div>
    </div>
    ${NATIVE ? "" : `<p class="muted" style="font-size:13px;margin:0">Les notifications fonctionnent dans l’appli Android.</p>`}`, "Réglages");
}
function onSettingChange(id, el) {
  if (onConnectSetting(id, el)) return vibrate(8);
  const n = DB.prefs.notif;
  if (id === "st-session") n.session = el.checked;
  else if (id === "st-time" && el.value) n.time = el.value;
  else if (id === "st-weekly") n.weekly = el.checked;
  else if (id === "st-solid") DB.prefs.solid = el.checked;
  else if (id === "st-sound") DB.prefs.sound = el.checked;
  save(); applyPrefs(); vibrate(8);
}

// ============================================================
//  Gestes pendant la séance
// ============================================================
// Glisser à gauche / droite : exercice suivant / précédent (sur les écrans exercice et série)
function swipeTo(idx, from) {
  clearInterval(timer); timer = null; native("cancelRest");
  delete G.restEnd; delete G.after;
  G.ex = idx; G.set = Math.max(0, firstPending(curX()));
  vibrate(10);
  goto("intro", from);
}
function setupGestures() {
  const stage = $("stage");
  let st = null;
  stage.addEventListener("pointerdown", e => {
    if (!G || !["intro", "set"].includes(G.screen) || SHEET) return;
    if (e.target.closest("input, .stepper, .sets, .swap-btn, .mplayer")) return;
    const el = stage.querySelector(".screen:not(.leave)"); if (!el) return;
    st = { id: e.pointerId, x0: e.clientX, y0: e.clientY, el, dir: null, dx: 0, hist: [{ x: e.clientX, t: e.timeStamp }] };
  });
  stage.addEventListener("pointermove", e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x0, dy = e.clientY - st.y0;
    if (!st.dir) {
      if (Math.hypot(dx, dy) < 10) return;
      st.dir = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
      if (st.dir !== "x") { st = null; return; }
      stage.setPointerCapture(e.pointerId);
      st.el.style.transition = "none";
    }
    const W = stage.clientWidth, n = exs().length;
    const blocked = (dx > 0 && G.ex === 0) || (dx < 0 && G.ex === n - 1);
    const x = blocked ? Math.sign(dx) * rubber(Math.abs(dx), W) : dx;
    st.dx = x;
    st.el.style.transform = `translateX(${x}px)`;
    st.el.style.opacity = String(1 - Math.min(0.4, Math.abs(x) / W * 0.6));
    st.hist.push({ x: e.clientX, t: e.timeStamp }); if (st.hist.length > 5) st.hist.shift();
  });
  const end = e => {
    if (!st || e.pointerId !== st.id) return;
    const s = st; st = null;
    if (s.dir !== "x") return;
    stage.dataset.dragEnd = Date.now();
    const W = stage.clientWidth, v = velocityOf(s.hist, "x"), n = exs().length, proj = s.dx + project(v, 0.99);
    let dir = 0;
    if (proj < -W * 0.3 && G.ex < n - 1) dir = 1;
    else if (proj > W * 0.3 && G.ex > 0) dir = -1;
    if (dir) {
      // L'écran part du côté du geste à la vitesse du doigt, le suivant arrive de l'autre côté
      spring({ from: s.dx, to: -dir * W, velocity: v, response: 0.3, onUpdate: x => { s.el.style.transform = `translateX(${x}px)`; } });
      swipeTo(G.ex + dir, dir > 0 ? "right" : "left");
    } else {
      spring({ from: s.dx, to: 0, velocity: v, response: 0.28, onUpdate: x => { s.el.style.transform = `translateX(${x}px)`; s.el.style.opacity = String(1 - Math.min(0.4, Math.abs(x) / W * 0.6)); },
        onDone: () => { s.el.style.transform = ""; s.el.style.opacity = ""; s.el.style.transition = ""; } });
    }
  };
  stage.addEventListener("pointerup", end); stage.addEventListener("pointercancel", end);
  stage.addEventListener("click", ev => { if (Date.now() - (+stage.dataset.dragEnd || 0) < 350) { ev.stopPropagation(); ev.preventDefault(); } }, true);

  // Glisser à gauche / droite sur l'accueil et les autres onglets : onglet suivant / précédent
  const app = document.querySelector(".app");
  let vs = null;
  app.addEventListener("pointerdown", e => {
    if (!$("session").hidden || SHEET) return;
    if (e.target.closest("input, select, textarea, .tabs, .chart")) return;
    vs = { id: e.pointerId, x0: e.clientX, y0: e.clientY, el: $("v-" + VIEW), dir: null, dx: 0, hist: [{ x: e.clientX, t: e.timeStamp }] };
  });
  app.addEventListener("pointermove", e => {
    if (!vs || e.pointerId !== vs.id) return;
    const dx = e.clientX - vs.x0, dy = e.clientY - vs.y0;
    if (!vs.dir) {
      if (Math.hypot(dx, dy) < 10) return;
      vs.dir = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
      if (vs.dir !== "x") { vs = null; return; }
      app.setPointerCapture(e.pointerId);
      vs.el.style.transition = "none";
    }
    const W = app.clientWidth, i = VIEWS.indexOf(VIEW);
    const blocked = (dx > 0 && i === 0) || (dx < 0 && i === VIEWS.length - 1);
    const x = blocked ? Math.sign(dx) * rubber(Math.abs(dx), W) : dx;
    vs.dx = x;
    vs.el.style.transform = `translateX(${x}px)`;
    vs.el.style.opacity = String(1 - Math.min(0.5, Math.abs(x) / W * 0.7));
    vs.hist.push({ x: e.clientX, t: e.timeStamp }); if (vs.hist.length > 5) vs.hist.shift();
  });
  const vend = e => {
    if (!vs || e.pointerId !== vs.id) return;
    const s = vs; vs = null;
    if (s.dir !== "x") return;
    app.dataset.dragEnd = Date.now();
    const W = app.clientWidth, v = velocityOf(s.hist, "x"), i = VIEWS.indexOf(VIEW), proj = s.dx + project(v, 0.99);
    let dir = 0;
    if (proj < -W * 0.28 && i < VIEWS.length - 1) dir = 1;
    else if (proj > W * 0.28 && i > 0) dir = -1;
    if (dir) { s.el.style.transform = ""; s.el.style.opacity = ""; vibrate(8); show(VIEWS[i + dir], dir > 0 ? "right" : "left"); }
    else spring({ from: s.dx, to: 0, velocity: v, response: 0.28, onUpdate: x => { s.el.style.transform = `translateX(${x}px)`; s.el.style.opacity = String(1 - Math.min(0.5, Math.abs(x) / W * 0.7)); },
      onDone: () => { s.el.style.transform = ""; s.el.style.opacity = ""; s.el.style.transition = ""; } });
  };
  app.addEventListener("pointerup", vend); app.addEventListener("pointercancel", vend);
  app.addEventListener("click", ev => { if (Date.now() - (+app.dataset.dragEnd || 0) < 350) { ev.stopPropagation(); ev.preventDefault(); } }, true);

  // Tirer la barre du haut vers le bas : fermer la séance (elle reste en mémoire)
  const ses = $("session"), top = ses.querySelector(".s-top");
  let pt = null, pullEnd = 0;
  top.addEventListener("pointerdown", e => { pt = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dir: null, dy: 0, hist: [{ y: e.clientY, t: e.timeStamp }] }; });
  top.addEventListener("pointermove", e => {
    if (!pt || e.pointerId !== pt.id) return;
    const dx = e.clientX - pt.x0, dy = e.clientY - pt.y0;
    if (!pt.dir) {
      if (Math.hypot(dx, dy) < 10) return;
      pt.dir = dy > 0 && Math.abs(dy) > Math.abs(dx) ? "y" : "n";
      if (pt.dir !== "y") { pt = null; return; }
      top.setPointerCapture(e.pointerId); ses.classList.add("dragging");
    }
    const y = dy > 0 ? dy : -rubber(-dy, ses.offsetHeight) * 0.2;
    pt.dy = y; ses.style.transform = `translateY(${y}px)`;
    pt.hist.push({ y: e.clientY, t: e.timeStamp }); if (pt.hist.length > 5) pt.hist.shift();
  });
  const pend = e => {
    if (!pt || e.pointerId !== pt.id) return;
    const s = pt; pt = null;
    if (s.dir !== "y") return;
    pullEnd = Date.now();
    const H = ses.offsetHeight, v = velocityOf(s.hist, "y");
    if (s.dy + project(v, 0.99) > H * 0.3 || v > 800) {
      spring({ from: s.dy, to: H, velocity: v, response: 0.32, onUpdate: y => { ses.style.transform = `translateY(${y}px)`; },
        onDone: () => { ses.classList.remove("dragging"); closeSession(); } });
    } else {
      spring({ from: s.dy, to: 0, velocity: v, response: 0.28, onUpdate: y => { ses.style.transform = `translateY(${y}px)`; },
        onDone: () => { ses.style.transform = ""; ses.classList.remove("dragging"); } });
    }
  };
  top.addEventListener("pointerup", pend); top.addEventListener("pointercancel", pend);
  top.addEventListener("click", ev => { if (Date.now() - pullEnd < 350) { ev.stopPropagation(); ev.preventDefault(); } }, true);
}

// ---------- Sauvegarde ----------
function exportData() {
  if (NATIVE) {
    native("exportData", JSON.stringify({ app: "notch", version: 1, exportedAt: new Date().toISOString(), logs: DB.logs, body: DB.body, prefs: DB.prefs }, null, 2), `notch-sauvegarde-${today()}.json`);
    DB.lastExport = today(); save(); render(); return;
  }
  const blob = new Blob([JSON.stringify({ app: "notch", version: 1, exportedAt: new Date().toISOString(), logs: DB.logs, body: DB.body }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `notch-sauvegarde-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  DB.lastExport = today(); save(); render(); toast("Sauvegarde téléchargée");
}
function importData(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const o = JSON.parse(fr.result);
      if (!o || o.app !== "notch" || typeof o.logs !== "object" || typeof o.body !== "object") throw new Error();
      Object.assign(DB.logs, o.logs); Object.assign(DB.body, o.body);
      if (o.prefs && o.prefs.swaps) Object.assign(DB.prefs.swaps, o.prefs.swaps);
      save(); render();
      toast(`Importé : ${Object.keys(o.logs).length} séances, ${Object.keys(o.body).length} mesures`);
    } catch (e) { toast("Ce fichier n’est pas une sauvegarde Notch"); }
  };
  fr.readAsText(file);
}

// ---------- Widgets Android ----------
// On envoie le planning et les séances faites : le widget calcule lui-même la séance du jour.
let widgetTimer = null;
function pushWidgets() {
  if (!NATIVE) return;
  clearTimeout(widgetTimer);
  widgetTimer = setTimeout(() => {
    const since = new Date(); since.setDate(since.getDate() - 21);
    const sinceKey = dkey(since);
    const doneList = Object.values(DB.logs).filter(l => l.date >= sinceKey && hasSets(l)).map(l => ({ date: l.date, day: l.day, finished: !!l.finished }));
    const plan = DAYS.map(d => { const list = exList(d.id); return { id: d.id, wd: d.wd, title: d.title, tab: d.tab, tag: d.tag, ex: list.length, mins: estimate(d), first: LIB[list[0].k].n }; });
    const alerts = [];
    programKeys().forEach((x, k) => { const c = coach(x); if (c.type === "monte" || c.type === "stagne") alerts.push({ ex: LIB[k].n, type: c.type, label: c.label, text: c.text }); });
    alerts.sort((a, b) => (a.type === "stagne") - (b.type === "stagne"));
    let coachOut = alerts[0];
    if (!coachOut) {
      const wi = weekIdx(), d = DAYS.find(x => x.wd === wi + 1) || DAYS.find(x => x.wd > wi + 1) || DAYS[0];
      const x = exList(d.id)[0], c = coach(x);
      coachOut = { ex: LIB[x.k].n, type: c.type, label: c.label, text: c.text };
    }
    // Carte de chaleur + bilan de la semaine (widget « Muscles » et notification du dimanche)
    const h = weekHeat(), mon = mondayKey();
    let records = 0;
    programKeys().forEach((x, k) => {
      const b = bestOf(k); if (!b || b.date < mon) return;
      if (sessionsWith(k).some(s => s.date < mon)) records++; // un record ne compte que s'il bat une séance d'avant
    });
    const mv = {}; weekPlan(mon).forEach(p => { if (p.moved) mv[p.id] = p.wd; });
    native("updateWidgets", JSON.stringify({
      plan, done: doneList, moves: { monday: mon, days: mv }, active: G ? { date: DB.logs[G.docId] && DB.logs[G.docId].date, day: G.dayId } : null,
      coach: coachOut, more: Math.max(0, alerts.length - 1),
      heat: { week: mon, lv: h.lv, weak: h.weak ? MUSCLES[h.weak] : null, any: h.any },
      week: { monday: mon, records },
      body: BODY
    }));
  }, 300);
}

// Appelé par l'appli Android : widget « Commencer », raccourcis, bouton retour
window.notchOpen = action => {
  if (!action) return;
  if (action.startsWith("start:")) { const id = action.slice(6); if (dayById(id)) openSession(id); }
  else if (action === "today") { const wi = weekIdx(); const d = (G && dayById(G.dayId)) || DAYS.find(x => x.wd === wi + 1) || DAYS.find(x => x.wd > wi + 1) || DAYS[0]; openSession(d.id); }
  else if (action.startsWith("view:")) { if (!$("session").hidden) closeSession(); show(action.slice(5)); }
  else if (action === "resume") { dropStaleG(); if (G) openSession(G.dayId); }
};
window.notchBack = () => {
  if (SHEET) { closeSheet(); return true; }
  if (!$("session").hidden) {
    closeSession(); return true;
  }
  if (VIEW !== "accueil") { show("accueil"); return true; }
  return false;
};

// ---------- Toast ----------
let tT = null;
function toast(m, rec) { const t = $("toast"); t.textContent = m; t.className = "toast glass" + (rec ? " rec" : ""); t.hidden = false; clearTimeout(tT); tT = setTimeout(() => t.hidden = true, 2600); }

// ---------- Événements ----------
document.addEventListener("click", e => {
  const v = e.target.closest("[data-view]"); if (v) return show(v.dataset.view);
  const b = e.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act;
  if (a === "open") { closeSheet(true); return openSession(b.dataset.day); }
  if (a === "ptab") { PTAB = b.dataset.day; return renderProgram(); }
  if (a === "export") return exportData();
  if (a === "import") return $("import-file").click();
  if (a === "del") { const id = b.dataset.id; if (ARMED === id) { ARMED = null; delete DB.body[id]; save(); } else ARMED = id; return renderBody(); }
  if (a === "settings") return openSettings();
  if (a === "change") return openChange();
  if (a === "sheet-close") return closeSheet();
  if (a === "unswap") { delete DB.prefs.swaps[b.dataset.day + ":" + b.dataset.i]; save(); return renderProgram(); }
  if (onConnectAct(a, b)) return;
  if (!G) return;
  if (a === "begin") return beginExercise();
  if (a === "warm-done") { G.warm = G.warm || []; G.warm[+b.dataset.i] = !G.warm[+b.dataset.i]; saveG(); vibrate(15); b.setAttribute("aria-pressed", String(!!G.warm[+b.dataset.i])); b.closest(".warm-row").classList.toggle("ok", !!G.warm[+b.dataset.i]); return; }
  if (a === "warm-end") { G.warmed = true; saveG(); return goto("set"); }
  if (a === "note") return openNote(b.dataset.k);
  if (a === "save-note") { const v = ($("note-text").value || "").trim(); if (v) DB.prefs.notes[b.dataset.k] = v.slice(0, 160); else delete DB.prefs.notes[b.dataset.k]; save(); closeSheet(); vibrate(10); return goto(G.screen === "set" ? "set" : "intro"); }
  if (a === "intro") return goto("intro");
  if (a === "validate") return validate();
  if (a === "edit") { G.set = +b.dataset.j; return goto("set"); }
  if (a === "swap") return openVariants();
  if (a === "pick") return pickSwap(b.dataset.k);
  if (a === "jump") { clearInterval(timer); timer = null; native("cancelRest"); delete G.restEnd; delete G.after; G.ex = +b.dataset.i; G.set = Math.max(0, firstPending(curX())); return goto("intro"); }
  if (a === "step") {
    const inp = $("in-" + b.dataset.f), cur = num(inp.value) || 0, nv = Math.max(0, Math.round((cur + parseFloat(b.dataset.d)) * 10) / 10);
    inp.value = b.dataset.f === "r" ? String(Math.max(1, Math.round(nv))) : fmtN(nv); vibrate(8);
    if (b.dataset.f === "w" && $("plates")) $("plates").innerHTML = platesHTML(curX().k, nv);
    return liveUpdate();
  }
  if (a === "plus") return addRest(15);
  if (a === "skip") return proceed();
  if (a === "home") { G = null; saveG(); closeSession(); return show("accueil"); }
});
$("s-quit").addEventListener("click", closeSession);
$("import-file").addEventListener("change", e => { const f = e.target.files[0]; if (f) importData(f); e.target.value = ""; });
document.addEventListener("change", e => {
  if (e.target.id === "pk") { PK = e.target.value; renderProgress(); }
  else if (e.target.id && (e.target.id.startsWith("st-") || e.target.id.startsWith("pl-"))) onSettingChange(e.target.id, e.target);
});
document.addEventListener("input", e => {
  if (e.target.id === "in-w" && $("plates") && G) $("plates").innerHTML = platesHTML(curX().k, num(e.target.value));
  if ((e.target.id === "in-w" || e.target.id === "in-r") && G) liveUpdate();
});
document.addEventListener("submit", e => {
  if (e.target.id !== "bform") return; e.preventDefault();
  const date = $("b-date").value, w = num($("b-weight").value), t = num($("b-waist").value);
  if (!date || (w == null && t == null)) return toast("Indique au moins ton poids ou ton tour de taille");
  const prev = DB.body[date] || {};
  DB.body[date] = { date, weight: w != null ? w : (prev.weight ?? null), waist: t != null ? t : (prev.waist ?? null) };
  save(); toast("Mesure enregistrée"); renderBody();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  // Retour dans l'appli : l'accueil suit le jour réel
  CAL_CACHE = null;
  refreshMusicGroup(); gymRefresh(); // réglages ouverts : une autorisation vient peut-être d'être donnée
  if ($("session").hidden) { dropStaleG(); render(); pushWidgets(); calSync(); return; }
  if (!G) return;
  lockScreen();
  if (musicOn()) native("musicStart");
  if (G.screen === "rest" && G.restEnd <= Date.now()) proceed();
});
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (h && h !== VIEW) show(h); });

// ---------- Démarrage ----------
load(); loadG(); applyPrefs(); initSeen();
openingIntro();
setupGestures();
show(location.hash.slice(1) || "accueil");
pushWidgets();
calSync();
// À minuit, l'accueil passe tout seul au jour suivant
(function atMidnight() {
  const n = new Date(), next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 5);
  setTimeout(() => { if ($("session").hidden) { dropStaleG(); render(); } pushWidgets(); atMidnight(); }, next - n);
})();
