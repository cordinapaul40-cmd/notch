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
const estimate = d => Math.round(d.ex.reduce((t, x) => t + x.sets * (45 + x.rest), 0) / 60) + 8;
const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
const ARROW = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const LOGO = (size, bg, fg) => `<svg width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="Notch"><rect width="64" height="64" rx="16" fill="${bg}"/><path d="M14 44 H26 V34 H38 V24 H50" fill="none" stroke="${fg}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---------- Données (sur le téléphone) ----------
const KEY = "notch-data", KEY_S = "notch-session";
let DB = { logs: {}, body: {}, lastExport: null };
function load() {
  try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); DB = { logs: o.logs || {}, body: o.body || {}, lastExport: o.lastExport || null }; } catch (e) {}
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { toast("Impossible d’enregistrer : stockage du téléphone plein"); }
}
let G = null; // séance en cours
function saveG() { try { G ? localStorage.setItem(KEY_S, JSON.stringify(G)) : localStorage.removeItem(KEY_S); } catch (e) {} }
function loadG() { try { G = JSON.parse(localStorage.getItem(KEY_S) || "null"); } catch (e) { G = null; } if (G && !DB.logs[G.docId]) G = null; }

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
function programKeys() { const m = new Map(); DAYS.forEach(d => d.ex.forEach(x => { if (!m.has(x.k)) m.set(x.k, x); })); return m; }
const hasSets = l => Object.values(l.ex || {}).some(a => doneSets(a).length);

// ---------- Silhouette musculaire ----------
const BASE = [
  { e: "circle", a: { cx: 50, cy: 16, r: 9 } }, { e: "rect", a: { x: 45.5, y: 23, width: 9, height: 9, rx: 2 } },
  { e: "path", a: { d: "M33 33 Q50 29 67 33 L69 60 Q67 90 63 102 L37 102 Q33 90 31 60 Z" } },
  { e: "path", a: { d: "M37 100 L63 100 L65 116 Q50 121 35 116 Z" } },
  { e: "ellipse", s: 1, a: { cx: 30, cy: 41, rx: 7, ry: 7.5 } },
  { e: "ellipse", s: 1, a: { cx: 24, cy: 59, rx: 5.5, ry: 13 }, t: "rotate(12 24 59)" },
  { e: "ellipse", s: 1, a: { cx: 19.5, cy: 85, rx: 4.6, ry: 12.5 }, t: "rotate(8 19.5 85)" },
  { e: "circle", s: 1, a: { cx: 17, cy: 101, r: 3.6 } },
  { e: "ellipse", s: 1, a: { cx: 41, cy: 137, rx: 9, ry: 22 } }, { e: "ellipse", s: 1, a: { cx: 41, cy: 177, rx: 6, ry: 17 } }, { e: "ellipse", s: 1, a: { cx: 41, cy: 197, rx: 6.2, ry: 3 } }
];
const FRONT = [
  { g: "deltsF", e: "ellipse", s: 1, a: { cx: 30, cy: 41, rx: 6, ry: 6.5 } },
  { g: "pecs", e: "path", s: 1, a: { d: "M49.5 38 C42 36 35 37 32.5 43 C32.5 52 36 57 42 57 C46 57 49.5 55 49.5 52 Z" } },
  { g: "biceps", e: "ellipse", s: 1, a: { cx: 24.5, cy: 58, rx: 4, ry: 9.5 }, t: "rotate(12 24.5 58)" },
  { g: "forearms", e: "ellipse", s: 1, a: { cx: 19.8, cy: 83, rx: 3.4, ry: 9.5 }, t: "rotate(8 19.8 83)" },
  { g: "abs", e: "rect", a: { x: 44, y: 60, width: 12, height: 34, rx: 4 } },
  { g: "obliques", e: "ellipse", s: 1, a: { cx: 37.5, cy: 79, rx: 3.5, ry: 10 } },
  { g: "quads", e: "ellipse", s: 1, a: { cx: 41.5, cy: 135, rx: 7.2, ry: 18 } }
];
const BACK = [
  { g: "midback", e: "path", a: { d: "M45.5 44 L54.5 44 L54.5 64 L50 68 L45.5 64 Z" } },
  { g: "traps", e: "path", a: { d: "M44 27 L56 27 L65 37 L56 44 L50 47 L44 44 L35 37 Z" } },
  { g: "deltsR", e: "ellipse", s: 1, a: { cx: 30, cy: 41, rx: 6, ry: 6.5 } },
  { g: "lats", e: "path", s: 1, a: { d: "M45 50 C40 47 35 46 32.5 50 C31.5 62 34 75 40.5 86 L45 79 Z" } },
  { g: "lowerback", e: "rect", a: { x: 45, y: 71, width: 10, height: 24, rx: 3 } },
  { g: "triceps", e: "ellipse", s: 1, a: { cx: 24.5, cy: 59, rx: 4, ry: 10 }, t: "rotate(12 24.5 59)" },
  { g: "forearms", e: "ellipse", s: 1, a: { cx: 19.8, cy: 83, rx: 3.4, ry: 9.5 }, t: "rotate(8 19.8 83)" },
  { g: "glutes", e: "ellipse", s: 1, a: { cx: 43, cy: 108, rx: 6.8, ry: 8 } },
  { g: "hamstrings", e: "ellipse", s: 1, a: { cx: 41.5, cy: 139, rx: 7, ry: 16 } },
  { g: "calves", e: "ellipse", s: 1, a: { cx: 41, cy: 171, rx: 5, ry: 11 } }
];
function shape(sh, cls) {
  const at = Object.entries(sh.a).map(([k, v]) => `${k}="${v}"`).join(" ");
  let o = `<${sh.e} class="${cls}" ${at}${sh.t ? ` transform="${sh.t}"` : ""}/>`;
  if (sh.s) o += `<${sh.e} class="${cls}" ${at} transform="translate(100 0) scale(-1 1)${sh.t ? " " + sh.t : ""}"/>`;
  return o;
}
function fig(list, p, s) { return BASE.map(b => shape(b, "bb")).join("") + list.map(m => shape(m, p.includes(m.g) ? "mh" : (s.includes(m.g) ? "ms" : "mm"))).join(""); }
function bodyMap(k) {
  const L = LIB[k];
  return `<svg viewBox="0 0 220 216" role="img" aria-label="Muscles travaillés : ${esc(L.p.map(g => MUSCLES[g]).join(", "))}">
    <style>.bb{fill:var(--body)}.mm{fill:var(--muscle)}.mh{fill:var(--m1)}.ms{fill:var(--m2)}.lb{fill:var(--muted);font:600 8px Inter,sans-serif;letter-spacing:.06em}</style>
    <g>${fig(FRONT, L.p, L.s)}</g><g transform="translate(120 0)">${fig(BACK, L.p, L.s)}</g>
    <text class="lb" x="50" y="213" text-anchor="middle">FACE</text><text class="lb" x="170" y="213" text-anchor="middle">DOS</text></svg>`;
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
function show(v) {
  if (!VIEWS.includes(v)) v = "accueil";
  VIEW = v;
  VIEWS.forEach(n => $("v-" + n).hidden = n !== v);
  document.querySelectorAll(".tb").forEach(b => b.dataset.view === v ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
  render(); window.scrollTo(0, 0);
}
function render() { ({ accueil: renderHome, programme: renderProgram, progres: renderProgress, seche: renderBody })[VIEW](); }

// ---------- Accueil ----------
function renderHome() {
  const t = today(), wi = weekIdx(), mon = mondayKey();
  const todayDay = DAYS.find(d => d.wd === (wi + 1));
  const nextDay = todayDay || DAYS.find(d => d.wd > wi + 1) || DAYS[0];
  const active = G && DB.logs[G.docId] && !DB.logs[G.docId].finished ? dayById(G.dayId) : null;
  const d = active || nextDay;
  const docToday = DB.logs[t + "_" + d.id];
  const finished = docToday && docToday.finished;
  const weekDone = new Set(Object.values(DB.logs).filter(l => l.date >= mon && hasSets(l)).map(l => l.day));
  const labels = ["L", "M", "M", "J", "V", "S", "D"];
  const week = labels.map((l, i) => {
    const day = DAYS.find(x => x.wd === i + 1), done = day && weekDone.has(day.id);
    const cls = !day ? "off" : (done ? "done" : (i === wi ? "today" : ""));
    return `<div class="wd ${cls}" title="${day ? esc(day.title) : "Repos"}">${l}<i></i></div>`;
  }).join("");

  const alerts = [];
  programKeys().forEach((x, k) => { const c = coach(x); if (c.type === "monte" || c.type === "stagne") alerts.push({ k, c }); });
  const first = d.ex[0], fc = coach(first, active ? G.docId : undefined);
  const lastFirst = sessionsWith(first.k, active ? G.docId : undefined)[0];
  const curLoad = lastFirst ? Math.max(...lastFirst.sets.map(s => s.w || 0)) : first.w0;
  const lastBody = Object.values(DB.body).filter(b => b.weight != null).sort((a, b) => b.date.localeCompare(a.date))[0];
  const expAge = DB.lastExport ? Math.floor((Date.now() - parseD(DB.lastExport)) / 864e5) : null;
  const nbSessions = Object.values(DB.logs).filter(hasSets).length;
  const hour = new Date().getHours();

  $("v-accueil").innerHTML = `
    <div class="row">
      <div class="stack" style="gap:4px">
        <div class="eyebrow">${esc(new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }))}</div>
        <h1 class="d h1">${hour >= 18 ? "Bonsoir" : "Salut"} Paul</h1>
      </div>
      ${LOGO(42, "var(--accent)", "#FFFFFF")}
    </div>

    <div class="stack">
      <div class="row" style="font-size:13px"><b>Cette semaine</b><span class="muted">${weekDone.size} / 4 séances</span></div>
      <div class="week">${week}</div>
    </div>

    <div class="hero">
      <div class="stack" style="gap:6px">
        <div class="eyebrow" style="color:#FFFFFF;opacity:.8">${active ? "Séance en cours" : (todayDay ? "Aujourd’hui" : "Prochaine séance · " + d.day.toLowerCase())} · ${esc(d.tag)}</div>
        <h2 class="d up" style="font-size:32px;line-height:.95">${esc(d.title)}</h2>
        <div style="font-size:14px;opacity:.85">${d.ex.length} exercices · environ ${estimate(d)} min · ${esc(LIB[first.k].n.toLowerCase())} en premier</div>
      </div>
      ${finished && !active ? `<div class="done-msg">Séance faite aujourd’hui. Bien joué.</div>`
        : `<button class="btn-go" type="button" data-act="open" data-day="${d.id}">${active ? "Reprendre" : "Commencer"} ${ARROW}</button>`}
    </div>

    <div class="stack">
      <div class="row"><h2 class="d up h2">Le coach</h2></div>
      ${alerts.length ? alerts.slice(0, 3).map(a => `<div class="card coach"><b>${esc(LIB[a.k].n)}</b><span class="chip ${a.c.type}">${a.c.label}</span><p>${esc(a.c.text)}</p></div>`).join("")
        : `<div class="card coach"><b>${esc(LIB[first.k].n)}</b><span class="chip ${fc.type}">${fc.label}</span><p>${esc(fc.text)}</p></div>`}
    </div>

    <div class="grid2">
      <div class="tile"><span class="k">${esc(LIB[first.k].n)}</span><span class="v">${curLoad != null ? fmtN(curLoad) + "<small> kg</small>" : "—"}</span><span class="s">${lastFirst ? "dernière séance" : "charge de départ"}</span></div>
      <div class="tile"><span class="k">Poids</span><span class="v">${lastBody ? fmtN(lastBody.weight) + "<small> kg</small>" : "—"}</span><span class="s">${lastBody ? "au " + frDate(lastBody.date) : "à noter dans Sèche"}</span></div>
    </div>

    <div class="stack">
      <div class="eyebrow">Faire une autre séance</div>
      <div class="others">${DAYS.filter(x => x.id !== d.id).map(x => `<button class="btn" type="button" data-act="open" data-day="${x.id}">${x.tab}</button>`).join("")}</div>
    </div>

    <div class="card stack">
      <div class="row"><b>Sauvegarde</b><span class="chip ${expAge == null || expAge > 7 ? "stagne" : "monte"}">${expAge == null ? "Jamais" : (expAge === 0 ? "Aujourd’hui" : "Il y a " + expAge + " j")}</span></div>
      <p class="muted" style="margin:0;font-size:14px">Tes ${nbSessions} séance${nbSessions > 1 ? "s" : ""} et tes mesures sont seulement sur ce téléphone. Exporte-les chaque semaine : c’est ta sauvegarde, et c’est le fichier à m’envoyer pour faire tes bilans.</p>
      <div class="grid2"><button class="btn btn-dark" type="button" data-act="export">Exporter</button><button class="btn" type="button" data-act="import">Importer</button></div>
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
    <div class="stack" style="gap:12px">${d.ex.map((x, i) => {
      const L = LIB[x.k];
      return `<article class="card exc">
        <div class="map">${bodyMap(x.k)}</div>
        <div class="stack" style="gap:6px;min-width:0">
          <div class="row" style="justify-content:flex-start;gap:8px"><span class="d" style="color:var(--accent)">${i + 1}</span><h3 class="d up" style="font-size:18px">${esc(L.n)}</h3></div>
          <div style="font-size:14px"><b>${x.sets} × ${x.lo} à ${x.hi}</b> · repos ${fmtRest(x.rest)}</div>
          <div class="muted" style="font-size:13px">${esc(x.load)}</div>
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
  try {
    if (!actx) return; if (actx.state === "suspended") actx.resume();
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
async function lockScreen() { try { if ("wakeLock" in navigator && document.visibilityState === "visible") wake = await navigator.wakeLock.request("screen"); } catch (e) {} }
function unlockScreen() { try { wake && wake.release(); } catch (e) {} wake = null; }

const doc = () => DB.logs[G.docId];
const day = () => dayById(G.dayId);
const curX = () => day().ex[G.ex];
const setsOf = x => (doc().ex[x.k] || []);
const firstPending = x => { const a = setsOf(x); for (let j = 0; j < x.sets; j++) if (!a[j]) return j; return -1; };

function openSession(dayId) {
  try { if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); } } catch (e) {}
  const id = today() + "_" + dayId;
  if (!(G && G.docId === id)) {
    if (!DB.logs[id]) { DB.logs[id] = { date: today(), day: dayId, startedAt: Date.now(), finished: false, ex: {} }; save(); }
    const d = dayById(dayId);
    G = { dayId, docId: id, ex: 0, set: 0, screen: "intro" };
    const ex = d.ex.findIndex(x => firstPending(x) >= 0);
    G.ex = ex < 0 ? d.ex.length - 1 : ex;
    G.set = Math.max(0, firstPending(d.ex[G.ex]));
    if (ex < 0) G.screen = "done";
  }
  if (DB.logs[id].finished) DB.logs[id].finished = false;
  saveG();
  $("session").hidden = false; document.body.style.overflow = "hidden";
  lockScreen();
  if (G.screen === "rest") { if (G.restEnd > Date.now()) return screenRest(true); return proceed(); }
  goto(G.screen);
}
function closeSession() {
  clearInterval(timer); timer = null;
  $("session").hidden = true; document.body.style.overflow = "";
  $("stage").innerHTML = ""; unlockScreen(); render();
}

// Transition entre deux écrans
function transition(html, extra = "") {
  const stage = $("stage"), old = stage.querySelector(".screen:not(.leave)");
  const el = document.createElement("div");
  el.className = "screen enter " + extra; el.innerHTML = `<div class="in">${html}</div>`;
  stage.appendChild(el);
  void el.offsetHeight; el.classList.remove("enter");
  if (old) { old.classList.add("leave"); setTimeout(() => old.remove(), 220); }
  return el;
}
function topbar(label) {
  const d = day();
  $("s-count").textContent = label;
  $("s-segs").innerHTML = d.ex.map((x, i) => `<button type="button" data-act="jump" data-i="${i}" aria-label="Exercice ${i + 1} : ${esc(LIB[x.k].n)}" class="${firstPending(x) < 0 ? "done" : (i === G.ex && G.screen !== "done" ? "cur" : "")}"></button>`).join("");
}
function goto(screen) {
  G.screen = screen; saveG();
  if (screen === "intro") screenIntro();
  else if (screen === "set") screenSet();
  else if (screen === "done") screenDone();
}

// Écran 1 : présentation de l'exercice
function screenIntro() {
  const x = curX(), L = LIB[x.k], c = coach(x, G.docId);
  topbar(`Exercice ${G.ex + 1} sur ${day().ex.length}`);
  transition(`
    <div class="stack" style="gap:6px">
      <div class="eyebrow">${x.sets} séries · ${x.lo} à ${x.hi} reps · repos ${fmtRest(x.rest)}</div>
      <h1 class="d s-title">${esc(L.n)}</h1>
    </div>
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
    <div class="sets" style="--n:${x.sets}">${chips}</div>
    <div class="muted" style="font-size:14px">Objectif <b style="color:var(--ink)">${x.lo} à ${x.hi} reps</b>${hist && hist.sets[j] ? ` · dernière fois ${hist.sets[j].r} × ${isPdc(x.k) ? "" : fmtN(hist.sets[j].w) + " kg"}` : ""}</div>
    ${isPdc(x.k) ? "" : `<div class="stepper">
      <button type="button" data-act="step" data-f="w" data-d="-${STEP[L.t]}" aria-label="Moins ${fmtN(STEP[L.t])} kg">−</button>
      <label class="mid" for="in-w"><span>Charge</span><input id="in-w" type="text" inputmode="decimal" value="${p.w === "" || p.w == null ? "" : fmtN(p.w)}" placeholder="0"><span class="unit">${unitOf(x.k)}</span></label>
      <button type="button" data-act="step" data-f="w" data-d="${STEP[L.t]}" aria-label="Plus ${fmtN(STEP[L.t])} kg">+</button></div>`}
    <div class="stepper">
      <button type="button" data-act="step" data-f="r" data-d="-1" aria-label="Une répétition de moins">−</button>
      <label class="mid" for="in-r"><span>Répétitions</span><input id="in-r" type="text" inputmode="numeric" value="${p.r}"><span class="unit">reps</span></label>
      <button type="button" data-act="step" data-f="r" data-d="1" aria-label="Une répétition de plus">+</button></div>
    <div class="muted" style="font-size:13px;text-align:center">${hint}</div>
    <div class="push">
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
  if (best && e1rm({ w, r }) > best.v + 0.01) toast("Nouveau record sur cet exercice", true);
  const next = firstPending(x);
  if (wasEdit) { if (next >= 0) { G.set = next; return goto("set"); } return afterExercise(); }
  if (next >= 0) return startRest(x.rest, { screen: "set", ex: G.ex, set: next });
  afterExercise();
}
function afterExercise() {
  const d = day();
  const nextEx = d.ex.findIndex((x, i) => i > G.ex && firstPending(x) >= 0);
  const anyLeft = d.ex.findIndex(x => firstPending(x) >= 0);
  if (nextEx >= 0) return startRest(120, { screen: "intro", ex: nextEx, set: 0 });
  if (anyLeft >= 0) return startRest(120, { screen: "intro", ex: anyLeft, set: 0 });
  finishSession();
}

// Écran 3 : récupération plein écran
function startRest(sec, after) {
  G.screen = "rest"; G.restEnd = Date.now() + sec * 1000; G.restTotal = sec; G.after = after; saveG();
  screenRest(false);
}
function restNextText(a) {
  const d = day();
  if (a.screen === "intro") return `Exercice suivant : ${LIB[d.ex[a.ex].k].n}`;
  const x = d.ex[a.ex], saveSet = G.set; G.set = a.set; const p = prefill(x, a.set); G.set = saveSet;
  return `Série ${a.set + 1} · ${isPdc(x.k) ? p.r + " reps" : `${fmtN(p.w || 0)} kg × ${p.r}`}`;
}
function screenRest(resumed) {
  const x = curX();
  topbar(`${LIB[x.k].n}`);
  const el = transition(`
    <div class="rest-label" id="r-label" style="margin-top:12px">Récupération</div>
    <div class="rest-wrap shake-host">
      <div class="glow"></div>
      <svg class="ring" viewBox="0 0 320 320" aria-hidden="true"><circle class="tr" cx="160" cy="160" r="140"/><circle class="pr" id="r-ring" cx="160" cy="160" r="140" stroke-dasharray="879.65" stroke-dashoffset="0"/></svg>
      <div class="rest-num"><span class="shake"><span class="t d num" id="r-time" role="timer">${mmss(Math.max(0, Math.ceil((G.restEnd - Date.now()) / 1000)))}</span></span><span class="muted" style="font-size:14px">sur ${mmss(G.restTotal)}</span></div>
    </div>
    <div class="card next"><div class="eyebrow">Ensuite</div><div style="font-size:17px;font-weight:600;margin-top:2px">${esc(restNextText(G.after))}</div></div>
    <div class="push"><div class="rest-btns">
      <button class="btn" type="button" data-act="plus">+15 secondes</button>
      <button class="btn btn-dark" type="button" data-act="skip">Passer</button></div></div>`, "rest zoom");
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
    lastSec = left;
  }
  if (left === 0) {
    clearInterval(timer); timer = null;
    el.classList.remove("urgent"); el.classList.add("go"); lab.textContent = "C’est reparti";
    vibrate([300, 120, 300]); beep(990, 0.3, 0.3);
    setTimeout(() => { if (G && G.screen === "rest") proceed(); }, 900);
  }
}
function proceed() {
  clearInterval(timer); timer = null;
  const a = G.after || { screen: "set", ex: G.ex, set: firstPending(curX()) };
  G.ex = a.ex; G.set = Math.max(0, a.set); delete G.restEnd; delete G.after;
  goto(a.screen);
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
  d.ex.forEach(x => {
    const a = doneSets(l.ex[x.k]); sets += a.length; a.forEach(s => vol += (s.w || 0) * s.r);
    const b = bestOf(x.k, G.docId), top = a.reduce((m, s) => !m || e1rm(s) > e1rm(m) ? s : m, null);
    if (b && top && e1rm(top) > b.v + 0.01) recs.push(`${LIB[x.k].n} : ${isPdc(x.k) ? top.r + " reps" : fmtW(top.w) + " × " + top.r}`);
  });
  const total = d.ex.reduce((t, x) => t + x.sets, 0), mins = l.startedAt ? Math.round(((l.finishedAt || Date.now()) - l.startedAt) / 60000) : null;
  vibrate([60, 60, 60]);
  transition(`
    <div class="stack" style="gap:6px;margin-top:12px"><div class="eyebrow">${esc(d.title)}</div><h1 class="d s-title">Séance terminée</h1></div>
    <div class="grid2">
      <div class="tile"><span class="k">Séries</span><span class="v">${sets}<small> / ${total}</small></span></div>
      <div class="tile"><span class="k">Durée</span><span class="v">${mins != null && mins < 300 ? mins + "<small> min</small>" : "—"}</span></div>
    </div>
    <div class="tile"><span class="k">Volume soulevé</span><span class="v">${Math.round(vol).toLocaleString("fr-FR")}<small> kg</small></span><span class="s">charge × répétitions, toutes séries confondues</span></div>
    ${recs.length ? `<div class="card coach"><b>${recs.length} record${recs.length > 1 ? "s" : ""} battu${recs.length > 1 ? "s" : ""}</b><span class="chip record">Record</span><p>${recs.map(esc).join("<br>")}</p></div>` : ""}
    <div class="card coach"><b>Cardio</b><span class="chip depart">Ensuite</span><p>${esc(d.cardio)}</p></div>
    <div class="push"><button class="btn-main" type="button" data-act="home">Retour à l’accueil</button></div>`);
}

// ---------- Sauvegarde ----------
function exportData() {
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
      Object.assign(DB.logs, o.logs); Object.assign(DB.body, o.body); save(); render();
      toast(`Importé : ${Object.keys(o.logs).length} séances, ${Object.keys(o.body).length} mesures`);
    } catch (e) { toast("Ce fichier n’est pas une sauvegarde Notch"); }
  };
  fr.readAsText(file);
}

// ---------- Toast ----------
let tT = null;
function toast(m, rec) { const t = $("toast"); t.textContent = m; t.className = "toast" + (rec ? " rec" : ""); t.hidden = false; clearTimeout(tT); tT = setTimeout(() => t.hidden = true, 2600); }

// ---------- Événements ----------
document.addEventListener("click", e => {
  const v = e.target.closest("[data-view]"); if (v) return show(v.dataset.view);
  const b = e.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act;
  if (a === "open") return openSession(b.dataset.day);
  if (a === "ptab") { PTAB = b.dataset.day; return renderProgram(); }
  if (a === "export") return exportData();
  if (a === "import") return $("import-file").click();
  if (a === "del") { const id = b.dataset.id; if (ARMED === id) { ARMED = null; delete DB.body[id]; save(); } else ARMED = id; return renderBody(); }
  if (!G) return;
  if (a === "begin") { const j = firstPending(curX()); G.set = j < 0 ? 0 : j; return goto("set"); }
  if (a === "intro") return goto("intro");
  if (a === "validate") return validate();
  if (a === "edit") { G.set = +b.dataset.j; return goto("set"); }
  if (a === "jump") { clearInterval(timer); timer = null; delete G.restEnd; delete G.after; G.ex = +b.dataset.i; G.set = Math.max(0, firstPending(curX())); return goto("intro"); }
  if (a === "step") {
    const inp = $("in-" + b.dataset.f), cur = num(inp.value) || 0, nv = Math.max(0, Math.round((cur + parseFloat(b.dataset.d)) * 10) / 10);
    inp.value = b.dataset.f === "r" ? String(Math.max(1, Math.round(nv))) : fmtN(nv); vibrate(8); return;
  }
  if (a === "plus") { G.restEnd = Math.max(G.restEnd, Date.now()) + 15000; G.restTotal += 15; saveG(); if (!timer) { const el = $("stage").querySelector(".screen:not(.leave)"); el.classList.remove("go"); timer = setInterval(() => tick(el), 200); } return; }
  if (a === "skip") return proceed();
  if (a === "home") { G = null; saveG(); closeSession(); return show("accueil"); }
});
$("s-quit").addEventListener("click", closeSession);
$("import-file").addEventListener("change", e => { const f = e.target.files[0]; if (f) importData(f); e.target.value = ""; });
document.addEventListener("change", e => { if (e.target.id === "pk") { PK = e.target.value; renderProgress(); } });
document.addEventListener("submit", e => {
  if (e.target.id !== "bform") return; e.preventDefault();
  const date = $("b-date").value, w = num($("b-weight").value), t = num($("b-waist").value);
  if (!date || (w == null && t == null)) return toast("Indique au moins ton poids ou ton tour de taille");
  const prev = DB.body[date] || {};
  DB.body[date] = { date, weight: w != null ? w : (prev.weight ?? null), waist: t != null ? t : (prev.waist ?? null) };
  save(); toast("Mesure enregistrée"); renderBody();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || $("session").hidden || !G) return;
  lockScreen();
  if (G.screen === "rest" && G.restEnd <= Date.now()) proceed();
});
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (h && h !== VIEW) show(h); });

// ---------- Démarrage ----------
load(); loadG();
show(location.hash.slice(1) || "accueil");
