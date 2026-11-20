// ============================================================
//  NOTCH · Machine prise, Ton mois, Semaine légère
//  Chargé avant app.js : uniquement des fonctions, appelées par app.js.
// ============================================================
"use strict";

const stepOf = k => STEP[LIB[k].t] || 2.5;
const roundStep = (k, w) => {
  const s = stepOf(k), min = LIB[k].t === "barre" ? (LIB[k].bar || 20) : 0;
  return Math.max(min, Math.round(w / s) * s);
};

// ============================================================
//  Machine prise : la faire plus tard, ou une variante
// ============================================================
// Rapports de charge approximatifs entre un exercice et sa variante (pour une 1re fois)
const RATIO = {
  "presse>hack": .7, "presse>smith": .45, "presse>goblet": .2,
  "presseh>hipthrust": .6, "presseh>fentes": .12,
  "dc>dch": .4, "dc>chestpress": .9,
  "incl>inclm": 2.1, "incl>inclb": 2.1, "incl>dch": 1.1,
  "tvl>tvn": 1, "tvl>pullover": .4, "tvs>tvn": 1,
  "dsr>thp": .9, "dsr>rowh": .4, "thp>dsr": 1.1, "thp>rowh": .45,
  "lext>goblet": .25, "lext>fentes": .15, "lcurl>lcurla": .9, "lcurl>sdth": .25,
  "sdt>sdth": .35, "sdt>hipthrust": 1.4,
  "mil>arnold": .85, "mil>shpress": 2.2,
  "ecart>pecdeck": 3, "ecart>ecpoul": .9,
  "curl>curlez": 1.6, "curl>curlpup": 1.8, "curl>curlpoul": 1.5,
  "tri>tribar": 1, "tri>dipsm": 3, "mart>martc": 1.4, "mart>curlez": 1.6,
  "el>elh": 1.2, "el>elm": 3, "fp>revpec": 2.5,
  "crunch>crunchm": 3, "crunch>crunchp": 2.5,
};
// Charge de départ pour une variante : ta dernière fois, sinon une estimation, sinon rien
function startFor(x, k) {
  if (isPdc(k)) return { label: "Poids du corps", sub: "" };
  const last = sessionsWith(k, G && G.docId)[0];
  if (last) {
    const w = Math.max(...last.sets.map(s => s.w || 0));
    return { w, label: fmtN(w) + " kg", sub: `${last.sets.length} × ${last.sets[0].r} le ${frDate(last.date)}` };
  }
  // Retour à l'exercice du programme : sa charge de départ
  const w0 = G ? dayById(G.dayId).ex[x.i].w0 : null;
  if (k === x.base && w0 != null) return { w: w0, label: fmtN(w0) + " kg", sub: "charge du programme" };
  const r = RATIO[x.base + ">" + k];
  const c = x.k === x.base ? coach(x, G && G.docId) : {}, base = c.w != null ? c.w : w0;
  if (r && base) { const w = roundStep(k, base * r); return { w, est: true, label: "≈ " + fmtN(w) + " kg", sub: "jamais fait" }; }
  return { label: "À trouver", sub: "jamais fait · commence léger" };
}
function canLater() {
  const list = exs();
  return list.some((e, j) => j !== G.ex && firstPending(e) >= 0);
}
function openBusy() {
  const x = curX(), done = doneSets(setsOf(x)).length > 0;
  const options = [x.base, ...(ALT[x.base] || [])].filter(k => k !== x.k);
  const later = canLater();
  const nextName = (() => { const l = exs(); const n = l.find((e, j) => j > G.ex && firstPending(e) >= 0) || l.find((e, j) => j !== G.ex && firstPending(e) >= 0); return n ? LIB[n.k].n : ""; })();
  openSheet(`
    <div class="stack" style="gap:4px"><div class="eyebrow">${esc(LIB[x.k].n)} occupée</div><h2 class="d up h2">Machine prise ?</h2></div>
    ${later ? `<div class="busy-later">
      <span><b>Je la fais plus tard</b><small>${esc(nextName)} d’abord, ${esc(LIB[x.k].n.toLowerCase())} revient à la fin</small></span>
      <button type="button" class="btn-pri" data-act="busy-later">Plus tard</button></div>` : `<div class="verdict info">C’est le dernier exercice qui reste : remplace-le, ou attends un peu.</div>`}
    ${options.length ? `<div class="eyebrow">Ou fais plutôt, mêmes muscles</div>
    ${done ? `<div class="verdict bad">Tu as déjà fait des séries sur cet exercice : tu peux seulement le décaler.</div>` : ""}
    <div class="stack" style="gap:10px">${options.map(k => {
      const s = startFor(x, k);
      return `<button type="button" class="option busy-opt" data-act="busy-pick" data-k="${k}" ${done ? "disabled" : ""}>
        <span class="row"><b style="font-size:16px;text-align:left">${esc(LIB[k].n)}</b><span class="d" style="font-size:19px;white-space:nowrap">${esc(s.label)}</span></span>
        <span class="row"><span class="muted" style="font-size:13px;text-align:left">${esc(LIB[k].p.map(g => MUSCLES[g]).join(", "))}${s.sub ? " · " + esc(s.sub) : ""}</span>${s.w != null ? `<span class="muted" style="font-size:12px;white-space:nowrap">départ conseillé</span>` : ""}</span>
      </button>`; }).join("")}</div>
    <label class="keep"><input type="checkbox" id="keep-swap"> Garder pour les prochaines séances</label>` : ""}`, "Machine prise");
}
function busyLater() {
  const l = doc(), list = exs(), x = list[G.ex];
  const order = list.map(e => e.i);
  order.push(order.splice(G.ex, 1)[0]);
  l.order = order; save();
  closeSheet();
  const nl = exs();
  let nx = nl.findIndex((e, j) => j >= G.ex && firstPending(e) >= 0);
  if (nx < 0) nx = nl.findIndex(e => firstPending(e) >= 0);
  G.ex = Math.max(0, nx); G.set = Math.max(0, firstPending(nl[G.ex]));
  vibrate(12); toast(`${LIB[x.k].n} : à la fin de la séance`);
  goto("intro", "right");
}
function busyPick(k) {
  const x = curX(), s = startFor(x, k);
  if (s.est && s.w != null) { const l = doc(); l.est = Object.assign({}, l.est, { [k]: s.w }); }
  pickSwap(k);
}

// ============================================================
//  Semaine légère
// ============================================================
const deloadOn = (mon = mondayKey()) => !!(DB.prefs.deload && DB.prefs.deload.week === mon);
const deloadW = (k, w) => roundStep(k, w * 0.6);
function deloadSuggestion() {
  const dl = DB.prefs.deload || {}, mon = mondayKey();
  if (deloadOn() || (dl.week && dl.week > mon)) return null;
  if (dl.snooze && dl.snooze > today()) return null;
  if (dl.last && (parseD(mon) - parseD(dl.last)) / 864e5 < 28) return null;
  const stalled = [];
  programKeys().forEach((x, k) => { if (coach(x).type === "stagne") stalled.push(LIB[k].n); });
  // Semaines d'affilée avec au moins 3 séances, depuis la dernière semaine légère
  const weeks = {};
  Object.values(DB.logs).filter(l => hasSets(l) && !l.deload).forEach(l => { const w = mondayOf(l.date); (weeks[w] = weeks[w] || new Set()).add(l.day); });
  let streak = (weeks[mon] || new Set()).size >= 3 ? 1 : 0, w = addDays(mon, -7);
  while ((weeks[w] || new Set()).size >= 3 && !(dl.last && w <= dl.last)) { streak++; w = addDays(w, -7); }
  if (stalled.length >= 3 || streak >= 7) return { stalled, streak };
  return null;
}
function deloadCard(s) {
  const late = weekIdx() >= 3; // à partir de jeudi : on propose lundi prochain
  const STEPS_DOWN = `<svg width="34" height="22" viewBox="0 0 64 42" aria-hidden="true"><path d="M4 6 H18 V16 H32 V26 H46 V36 H60" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const why = [];
  if (s.stalled.length >= 3) why.push(`<b>${s.stalled.length} exercices stagnent</b> (${esc(s.stalled.slice(0, 3).map(n => n.toLowerCase()).join(", "))})`);
  if (s.streak >= 7) why.push(`<b>${s.streak} semaines d’affilée</b> sans pause`);
  return `<section class="dl-card" aria-label="Semaine légère proposée">
    <div class="dl-top">${STEPS_DOWN}<span class="eyebrow" style="color:var(--accent)">Le coach te propose</span></div>
    <h2 class="d up dl-title">Une semaine<br>légère</h2>
    <ul class="dl-why">${why.map(w => `<li><span>${w}</span></li>`).join("")}</ul>
    <p>Mêmes exercices, charges à 60 %, une série de moins. Ton corps récupère, et la semaine d’après tu repars plus fort.</p>
    <div class="grid2"><button type="button" class="btn" data-act="deload-later">Pas maintenant</button><button type="button" class="btn-pri" data-act="deload-start" data-when="${late ? "next" : "now"}">${late ? "Lundi prochain" : "Cette semaine"}</button></div>
  </section>`;
}
// Ce que la carte de l'accueil affiche pendant la semaine légère
function deloadTip(d) {
  const x = exList(d.id).find(e => !isPdc(e.k));
  if (!x) return "Une série de moins partout. Soigne la technique : 2 secondes en descente.";
  const c = coach(x), w = c.w != null ? c.w : x.w0;
  if (w == null) return "Charges à 60 %, une série de moins. Soigne la technique : 2 secondes en descente.";
  return `Charges à 60 % : ${LIB[x.k].n.toLowerCase()} ${fmtN(deloadW(x.k, w))} kg au lieu de ${fmtN(w)}. Une série de moins, et 2 secondes en descente.`;
}
function onPlusAct(a, b) {
  if (a === "deload-start") {
    const mon = mondayKey(), w = b.dataset.when === "next" ? addDays(mon, 7) : mon;
    DB.prefs.deload = Object.assign({}, DB.prefs.deload, { week: w, last: w, snooze: null });
    save(); vibrate(15); toast(w === mon ? "Semaine légère lancée" : "Semaine légère prévue lundi"); render(); return true;
  }
  if (a === "deload-later") { DB.prefs.deload = Object.assign({}, DB.prefs.deload, { snooze: addDays(today(), 7) }); save(); render(); return true; }
  if (a === "deload-stop") { DB.prefs.deload = Object.assign({}, DB.prefs.deload, { week: null }); save(); toast("Semaine légère arrêtée : charges habituelles"); render(); return true; }
  if (a === "month") { openMonth(b.dataset.m); return true; }
  if (a === "busy-later") { busyLater(); return true; }
  if (a === "busy-pick") { busyPick(b.dataset.k); return true; }
  if (a === "busy") { openBusy(); return true; }
  if (a === "feel") { setFeel(+b.dataset.f); return true; }
  if (a === "undo-set") { undoSet(); return true; }
  if (a === "hist") { toggleHist(); return true; }
  return false;
}

// ============================================================
//  Ton mois
// ============================================================
const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const prevMonth = mk => { const [y, m] = mk.split("-").map(Number); return monthKey(new Date(y, m - 2, 1)); };
const monthName = mk => { const [y, m] = mk.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long" }); };
const sessionsIn = mk => Object.values(DB.logs).filter(l => hasSets(l) && l.date.slice(0, 7) === mk);

function monthStats(mk) {
  const inM = o => o.date.slice(0, 7) === mk;
  const logs = sessionsIn(mk), n = logs.length;
  const [y, m] = mk.split("-").map(Number), days = new Date(y, m, 0).getDate(), t = today();
  // Jours d'entraînement du mois déjà passés, et les semaines qui en contiennent
  let planned = 0;
  const mons = [];
  for (let d = 1; d <= days; d++) {
    const k = `${mk}-${pad2(d)}`, w = mondayOf(k);
    if (k <= t && DAYS.some(x => x.wd === weekIdx(parseD(k)) + 1)) { planned++; if (!mons.includes(w)) mons.push(w); }
  }
  const perWeek = {};
  logs.forEach(l => { const w = mondayOf(l.date); perWeek[w] = (perWeek[w] || 0) + 1; });
  let vol = 0, sets = 0;
  logs.forEach(l => Object.values(l.ex || {}).forEach(a => doneSets(a).forEach(s => { vol += (s.w || 0) * s.r; sets++; })));
  const counts = {};
  Object.values(DB.logs).filter(hasSets).forEach(l => { const k = l.date.slice(0, 7); counts[k] = (counts[k] || 0) + 1; });
  const nPrev = counts[prevMonth(mk)] || 0;
  const best = Object.keys(counts).length > 1 && n >= Math.max(...Object.values(counts)) && n > nPrev;
  // Progressions : meilleure charge du mois contre la meilleure d'avant
  const prog = [], keys = new Set();
  logs.forEach(l => Object.keys(l.ex || {}).forEach(k => keys.add(k)));
  keys.forEach(k => {
    if (!LIB[k] || isPdc(k)) return;
    let before = 0, during = 0;
    Object.values(DB.logs).forEach(l => {
      if (!l.ex || !l.ex[k] || l.deload) return;
      const v = Math.max(0, ...doneSets(l.ex[k]).map(s => s.w || 0));
      if (l.date.slice(0, 7) < mk) before = Math.max(before, v); else if (inM(l)) during = Math.max(during, v);
    });
    if (before > 0 && during > before) prog.push({ k, gain: during - before, to: during });
  });
  prog.sort((a, b) => b.gain - a.gain);
  // Records battus dans le mois
  let records = 0; const by = {};
  Object.values(DB.logs).filter(l => hasSets(l) && !l.deload).sort((a, b) => a.date.localeCompare(b.date) || (a.startedAt || 0) - (b.startedAt || 0))
    .forEach(l => Object.entries(l.ex || {}).forEach(([k, arr]) => {
      const a = doneSets(arr); if (!a.length) return;
      const top = Math.max(...a.map(e1rm));
      if (by[k] == null) { by[k] = top; return; }
      if (top > by[k] + 0.01) { if (inM(l)) records++; by[k] = top; }
    }));
  // Muscles du mois
  const raw = {};
  logs.forEach(l => Object.entries(l.ex || {}).forEach(([k, arr]) => {
    const c = doneSets(arr).length; if (!c || !LIB[k]) return;
    LIB[k].p.forEach(g => raw[g] = (raw[g] || 0) + c); LIB[k].s.forEach(g => raw[g] = (raw[g] || 0) + c * 0.5);
  }));
  const max = Math.max(0, ...Object.values(raw)), lv = {};
  Object.keys(MUSCLES).forEach(g => lv[g] = max ? (raw[g] || 0) / max : 0);
  const topM = Object.keys(raw).sort((a, b) => raw[b] - raw[a])[0] || null;
  // Poids : dernière pesée avant le mois (ou la première du mois) → dernière du mois
  const W = Object.values(DB.body).filter(b => b.weight != null).sort((a, b) => a.date.localeCompare(b.date));
  const startW = W.filter(b => b.date.slice(0, 7) < mk).pop() || W.find(inM);
  const endW = W.filter(inM).pop();
  const wDelta = startW && endW && startW !== endW ? Math.round((endW.weight - startW.weight) * 10) / 10 : null;
  return { mk, name: monthName(mk), n, planned, weeks: mons.map(w => perWeek[w] || 0), vol, sets, nPrev, prevName: monthName(prevMonth(mk)), best,
    prog: prog.slice(0, 3), records, lv, topM, wDelta, endW, cran: crans(), current: mk === monthKey() };
}

const fmtVol = v => v >= 10000 ? fmtN(Math.round(v / 100) / 10) + " t" : Math.round(v).toLocaleString("fr-FR") + " kg";
function monthSlides(s) {
  const out = [];
  out.push(`<div class="st-in st-cover">
      <svg width="120" height="80" viewBox="0 0 64 42" aria-hidden="true"><path class="st-draw" pathLength="1" d="M4 36 H18 V26 H32 V16 H46 V6 H60" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span class="st-eye">Ton mois${s.current ? " (en cours)" : ""}</span>
      <span class="d up st-huge" style="font-size:clamp(48px,15vw,72px)">${esc(s.name)}</span>
      <span class="st-txt">Ce que tu as construit, séance après séance.</span></div>`);
  const maxW = Math.max(4, ...s.weeks);
  const cmp = s.current ? (s.planned - s.n <= 0 ? "Aucune séance ratée pour l’instant." : "") : s.best ? "Ton meilleur mois depuis que tu utilises Notch." : (s.nPrev ? (s.n > s.nPrev ? `${s.n - s.nPrev} de plus qu’en ${s.prevName}.` : s.n === s.nPrev ? `Autant qu’en ${s.prevName}.` : `${s.nPrev - s.n} de moins qu’en ${s.prevName}.`) : "");
  out.push(`<div class="st-in">
      <span class="st-eye">Régularité</span>
      <span class="d st-huge"><span data-count="${s.n}">${s.n}</span></span>
      <span class="d up st-unit">séance${s.n > 1 ? "s" : ""}</span>
      <span class="st-txt">${s.planned ? `sur ${s.planned} prévue${s.planned > 1 ? "s" : ""}. ` : ""}${esc(cmp)}</span>
      <div class="st-weeks">${s.weeks.map((v, i) => `<div><span style="--h:${Math.round(v / maxW * 100)}%"></span><small>S${i + 1}</small></div>`).join("")}</div></div>`);
  const cars = Math.floor(s.vol / 1300);
  out.push(`<div class="st-in">
      <span class="st-eye">Volume</span>
      <span class="d st-huge" style="font-size:clamp(64px,22vw,110px)">${esc(fmtVol(s.vol))}</span>
      <span class="d up st-unit">soulevés</span>
      <span class="st-txt">${s.sets} séries${cars >= 1 ? `, soit le poids d’environ ${cars} voiture${cars > 1 ? "s" : ""}` : ""}.</span></div>`);
  out.push(`<div class="st-in">
      <span class="st-eye">Records</span>
      <span class="d st-huge"><span data-count="${s.records}">${s.records}</span></span>
      <span class="d up st-unit">record${s.records > 1 ? "s" : ""} battu${s.records > 1 ? "s" : ""}</span>
      ${s.prog.length ? `<div class="st-list">${s.prog.map(p => `<div><span>${esc(LIB[p.k].n)}</span><b>+${fmtN(p.gain)} kg</b></div>`).join("")}</div>`
        : `<span class="st-txt">Pas de nouvelle charge ce mois-ci. Le coach te dira où monter d’un cran.</span>`}</div>`);
  if (s.topM) out.push(`<div class="st-in">
      <span class="st-eye">Muscles</span>
      <span class="st-txt" style="margin:0">Le plus travaillé</span>
      <span class="d up st-big">${esc(MUSCLES[s.topM])}</span>
      <div class="st-body">${heatMap(s.lv)}</div></div>`);
  if (s.wDelta != null) {
    const good = s.wDelta < 0;
    out.push(`<div class="st-in">
      <span class="st-eye">Sèche</span>
      <span class="d st-huge" style="font-size:clamp(64px,22vw,110px)">${s.wDelta > 0 ? "+" : s.wDelta < 0 ? "−" : ""}${fmtN(Math.abs(s.wDelta))}<small style="font-size:.4em"> kg</small></span>
      <span class="st-txt">${good ? `Tu termines ${s.name} à ${fmtN(s.endW.weight)} kg.` : `Le poids ne descend pas ce mois-ci : regarde aussi ton tour de taille, c’est souvent lui qui bouge d’abord.`}</span></div>`);
  }
  out.push(`<div class="st-in">
      <span class="st-eye">Ton niveau</span>
      <span class="d up st-huge" style="font-size:clamp(64px,20vw,100px)">Cran ${s.cran.level}</span>
      <span class="st-txt">${s.cran.got} badge${s.cran.got > 1 ? "s" : ""} sur ${s.cran.badges.length}. ${s.cran.nextAt ? `Cran ${s.cran.level + 1} dans ${s.cran.nextAt - s.cran.n} séance${s.cran.nextAt - s.cran.n > 1 ? "s" : ""}.` : ""}</span>
      <div class="st-actions"><button type="button" class="st-btn" data-st="share">Partager</button><button type="button" class="st-btn st-btn-w" data-st="close">Terminer</button></div></div>`);
  return out;
}

let STORY = null;
const STORY_MS = 6000;
function openMonth(mk) {
  const s = monthStats(mk);
  if (!s.n) return toast(`Pas encore de séance en ${s.name}`);
  if (!s.current) { DB.prefs.monthSeen = mk; save(); }
  const slides = monthSlides(s);
  const el = document.createElement("div");
  el.className = "story"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Ton mois de " + s.name);
  el.innerHTML = `<div class="st-bars">${slides.map(() => `<span><i></i></span>`).join("")}</div>
    <div class="st-head"><span>Ton mois · ${esc(s.name)}</span><button type="button" class="st-x" data-st="close" aria-label="Fermer">✕</button></div>
    <div class="st-stage"></div>
    <div class="st-foot"><span>Touche pour continuer</span></div>`;
  document.body.appendChild(el);
  STORY = { el, s, slides, i: -1, start: 0, paused: false, elapsed: 0, raf: 0 };
  storyGo(0);
  const loop = now => {
    if (!STORY) return;
    const S = STORY;
    if (!S.paused) {
      const p = Math.min(1, (S.elapsed + now - S.start) / STORY_MS);
      const bar = S.el.querySelectorAll(".st-bars i")[S.i]; if (bar) bar.style.width = (p * 100) + "%";
      if (p >= 1 && S.i < S.slides.length - 1) storyGo(S.i + 1);
    }
    S.raf = requestAnimationFrame(loop);
  };
  STORY.raf = requestAnimationFrame(loop);
  storyGestures(el);
  vibrate(10);
}
function storyGo(i) {
  const S = STORY; if (!S) return;
  i = Math.max(0, Math.min(S.slides.length - 1, i));
  S.i = i; S.start = performance.now(); S.elapsed = 0;
  S.el.querySelectorAll(".st-bars i").forEach((b, j) => b.style.width = j < i ? "100%" : "0%");
  const stage = S.el.querySelector(".st-stage");
  stage.innerHTML = S.slides[i];
  const inner = stage.firstElementChild;
  if (!REDUCED) inner.animate([{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
  countUp(stage);
  S.el.querySelector(".st-foot").style.visibility = i === S.slides.length - 1 ? "hidden" : "";
  announce(stage.innerText.replace(/\s+/g, " ").slice(0, 160));
}
function closeStory() {
  const S = STORY; if (!S) return;
  STORY = null; cancelAnimationFrame(S.raf);
  if (REDUCED) { S.el.remove(); render(); return; }
  S.el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(40px)" }], { duration: 240, easing: "ease-in", fill: "forwards" }).onfinish = () => S.el.remove();
  render();
}
function storyGestures(el) {
  let st = null;
  el.addEventListener("pointerdown", e => {
    if (e.target.closest("[data-st]")) return;
    st = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    if (STORY) { STORY.paused = true; STORY.elapsed += performance.now() - STORY.start; }
  });
  const up = e => {
    if (!st || !STORY) return;
    const dy = e.clientY - st.y, dx = e.clientX - st.x, long = e.timeStamp - st.t > 350;
    STORY.paused = false; STORY.start = performance.now();
    const s = st; st = null;
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) return closeStory();          // glisser vers le bas : fermer
    if (long || Math.hypot(dx, dy) > 12) return;                               // appui long : simple pause
    if (s.x < el.clientWidth * 0.3) storyGo(STORY.i - 1); else if (STORY.i < STORY.slides.length - 1) storyGo(STORY.i + 1);
  };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("click", e => {
    const b = e.target.closest("[data-st]"); if (!b) return;
    if (b.dataset.st === "close") closeStory();
    else if (b.dataset.st === "share") shareMonth(STORY.s);
  });
}
// La carte d'accueil, la première semaine du mois suivant
function monthCard() {
  if (new Date().getDate() > 7) return "";
  const mk = prevMonth(monthKey());
  if (DB.prefs.monthSeen === mk || !sessionsIn(mk).length) return "";
  return `<button type="button" class="month-card" data-act="month" data-m="${mk}">
    <span class="eyebrow" style="color:#FFFFFF;opacity:.85">C’est prêt</span>
    <span class="d up" style="font-size:24px;line-height:1">Ton mois de ${esc(monthName(mk))}</span>
    <span style="font-size:14px;opacity:.9">${sessionsIn(mk).length} séances, tes records et ta sèche, en quelques écrans.</span></button>`;
}
// Ligne dans Progrès : revoir le mois en cours (ou le précédent en début de mois)
function monthRow() {
  const cur = monthKey(), mk = sessionsIn(cur).length ? cur : prevMonth(cur);
  if (!sessionsIn(mk).length) return "";
  return `<nav class="card list"><button type="button" class="list-row" data-act="month" data-m="${mk}"><span><small>Ton mois</small><b>${esc(capFirst(monthName(mk)))}${mk === cur ? " (en cours)" : ""} · ${sessionsIn(mk).length} séances</b></span><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></nav>`;
}

// ---------- Image à partager (1080 × 1350) ----------
async function shareMonth(s) {
  try { await Promise.all([document.fonts.load('800 100px "NotchDisplay"'), document.fonts.load('600 40px "NotchText"')]); } catch (e) {}
  const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, W * 0.6, H); g.addColorStop(0, "#4473F6"); g.addColorStop(0.5, "#2F5FE8"); g.addColorStop(1, "#2246C2");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const r = x.createRadialGradient(W, 0, 0, W, 0, W * 0.9); r.addColorStop(0, "rgba(255,255,255,.25)"); r.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = r; x.fillRect(0, 0, W, H);
  const disp = (px) => { x.font = `800 ${px}px "NotchDisplay", Archivo, "Arial Black", sans-serif`; try { x.fontStretch = "expanded"; } catch (e) {} };
  const text = (px) => { x.font = `600 ${px}px "NotchText", Inter, sans-serif`; try { x.fontStretch = "normal"; } catch (e) {} };
  x.fillStyle = "#FFFFFF"; x.textBaseline = "alphabetic";
  // Logo
  x.lineWidth = 12; x.lineCap = "round"; x.lineJoin = "round"; x.strokeStyle = "#FFFFFF";
  x.beginPath(); [[90, 170], [150, 170], [150, 130], [210, 130], [210, 90], [270, 90]].forEach((p, i) => i ? x.lineTo(...p) : x.moveTo(...p)); x.stroke();
  disp(40); x.fillText("NOTCH", 310, 150);
  text(40); x.globalAlpha = .85; x.fillText("TON MOIS", 90, 300); x.globalAlpha = 1;
  disp(130); x.fillText(s.name.toUpperCase(), 90, 430);
  const tiles = [["Séances", String(s.n)], ["Soulevé", fmtVol(s.vol)], ["Records", String(s.records)], s.wDelta != null ? ["Poids", (s.wDelta > 0 ? "+" : s.wDelta < 0 ? "−" : "") + fmtN(Math.abs(s.wDelta)) + " kg"] : ["Niveau", "Cran " + s.cran.level]];
  tiles.forEach(([k, v], i) => {
    const tx = 90 + (i % 2) * 465, ty = 540 + Math.floor(i / 2) * 330;
    x.fillStyle = "rgba(255,255,255,.14)"; x.beginPath(); x.roundRect ? x.roundRect(tx, ty, 435, 290, 36) : x.rect(tx, ty, 435, 290); x.fill();
    x.fillStyle = "#FFFFFF"; text(34); x.globalAlpha = .85; x.fillText(k.toUpperCase(), tx + 40, ty + 80); x.globalAlpha = 1;
    disp(v.length > 6 ? 76 : 100); x.fillText(v, tx + 40, ty + 220);
  });
  text(38); x.globalAlpha = .85; x.fillText("Monte d’un cran.", 90, 1260); x.globalAlpha = 1;
  const url = c.toDataURL("image/png");
  const msg = `Mon mois de ${s.name} sur Notch : ${s.n} séances, ${fmtVol(s.vol)} soulevés, ${s.records} record${s.records > 1 ? "s" : ""}.`;
  if (NATIVE) return native("shareImage", url, msg);
  try {
    const blob = await (await fetch(url)).blob(), file = new File([blob], `notch-${s.mk}.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) return await navigator.share({ files: [file], text: msg });
  } catch (e) {}
  const a = document.createElement("a"); a.href = url; a.download = `notch-${s.mk}.png`; document.body.appendChild(a); a.click(); a.remove();
}

// ============================================================
//  Après chaque série : confirmation, « Annuler » et ressenti
// ============================================================
const FEELS = [[1, "Facile", "3+ en réserve"], [2, "Correct", "1 ou 2"], [3, "À fond", "0 en réserve"]];
const feelName = f => (FEELS.find(x => x[0] === f) || [])[1] || "";
function lastSetCard() {
  const L = G.last;
  if (!L) return "";
  const x = exs()[L.ex], s = x && (doc().ex[x.k] || [])[L.j];
  if (!s || x.k !== L.k) return "";
  return `<div class="last-card glass" id="last-card">
    <div class="lc-top"><span class="lc-ok" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg></span>
      <b>Série ${L.j + 1} · ${isPdc(x.k) ? s.r + " reps" : `${fmtN(s.w)} kg × ${s.r}`}</b>
      <button type="button" class="lc-undo" data-act="undo-set">Annuler</button></div>
    <span class="lc-q">Comment c’était ? <span class="muted">(facultatif)</span></span>
    <div class="feel" role="group" aria-label="Ressenti">${FEELS.map(([f, n, sub]) => `<button type="button" data-act="feel" data-f="${f}" aria-pressed="${s.f === f}" class="${s.f === f ? "on" : ""}"><b>${n}</b><small>${sub}</small></button>`).join("")}</div>
  </div>`;
}
function setFeel(f) {
  const L = G.last; if (!L) return;
  const x = exs()[L.ex], s = (doc().ex[x.k] || [])[L.j]; if (!s) return;
  s.f = s.f === f ? undefined : f; save(); vibrate(8);
  document.querySelectorAll("#last-card .feel button").forEach(b => { const on = +b.dataset.f === s.f; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
}
function undoSet() {
  const L = G.last; if (!L) return;
  const list = exs(), x = list[L.ex], arr = (doc().ex[x.k] || []).slice(), s = arr[L.j];
  if (!s) return;
  arr[L.j] = null;
  while (arr.length && arr[arr.length - 1] == null) arr.pop();
  doc().ex[x.k] = arr; save();
  clearInterval(timer); timer = null; native("cancelRest");
  G.ex = L.ex; G.set = L.j; delete G.restEnd; delete G.after; G.last = null;
  goto("set");
  // Les valeurs que tu avais saisies reviennent, prêtes à corriger
  const w = $("in-w"), r = $("in-r");
  if (w && !isPdc(x.k)) { w.value = fmtN(s.w); if ($("plates")) $("plates").innerHTML = platesHTML(x.k, s.w); }
  if (r) r.value = s.r;
  vibrate(15); toast("Série annulée : corrige et valide");
}

// ============================================================
//  Historique express sur l'écran de série
// ============================================================
let HIST_OPEN = false;
function histCard(x) {
  const hist = sessionsWith(x.k, G.docId).slice(0, 6).reverse();
  if (!hist.length) return "";
  const pdc = isPdc(x.k);
  const val = h => pdc ? Math.max(...h.sets.map(s => s.r)) : Math.max(...h.sets.map(s => s.w || 0));
  const v = hist.map(val), lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const W = 200, X = i => hist.length === 1 ? W / 2 : i * W / (hist.length - 1), Y = n => 40 - (n - lo) / span * 32;
  const path = v.map((n, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(n).toFixed(1)}`).join(" ");
  const last = hist[hist.length - 1];
  const feels = last.sets.map(s => s.f).filter(Boolean);
  return `<div class="hist-card">
    <div class="row"><b>${hist.length > 1 ? `Tes ${hist.length} dernières séances` : "Ta dernière séance"}</b><span class="muted" style="font-size:13px">${pdc ? "reps max" : "charge max"} : ${pdc ? hi : fmtN(hi) + " kg"}</span></div>
    ${hist.length > 1 ? `<svg viewBox="-8 2 216 46" width="100%" height="64" aria-hidden="true"><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${v.map((n, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(n).toFixed(1)}" r="4" fill="${i === v.length - 1 ? "var(--accent)" : "var(--surface)"}" stroke="var(--accent)" stroke-width="2"/>`).join("")}</svg>
    <div class="hist-dates">${hist.map((h, i) => `<span${i === hist.length - 1 ? ' class="on"' : ""}>${esc(parseD(h.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }))}</span>`).join("")}</div>` : ""}
    <div class="hist-last"><span class="eyebrow">Le ${esc(frDate(last.date, { day: "numeric", month: "long" }))}${feels.length ? ` · ressenti « ${esc(feelName(Math.round(feels.reduce((a, b) => a + b, 0) / feels.length)).toLowerCase())} »` : ""}</span>
      <div class="hist-sets" style="--n:${last.sets.length}">${last.sets.map(s => `<span>${pdc ? `<b>${s.r}</b> reps` : `<b>${fmtN(s.w)}</b>×${s.r}`}</span>`).join("")}</div></div>
  </div>`;
}
function toggleHist() {
  HIST_OPEN = !HIST_OPEN;
  const slot = document.querySelector(".screen:not(.leave) #hist-slot"), b = document.querySelector(".screen:not(.leave) .hist-btn");
  if (b) b.setAttribute("aria-expanded", HIST_OPEN);
  if (!slot) return;
  slot.innerHTML = HIST_OPEN ? histCard(curX()) : "";
  if (HIST_OPEN && !REDUCED && slot.firstElementChild) slot.firstElementChild.animate([{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
  vibrate(8);
}

// ============================================================
//  Bilan comparé : chaque exercice face à ta dernière fois
// ============================================================
function compareBlock() {
  const l = doc(), rows = [];
  let up = 0;
  exs().forEach(x => {
    const a = doneSets(l.ex[x.k]); if (!a.length) return;
    const pdc = isPdc(x.k), prev = sessionsWith(x.k, G.docId)[0];
    const top = Math.max(...a.map(s => s.w || 0)), reps = a.map(s => s.r);
    const repTxt = Math.min(...reps) === Math.max(...reps) ? reps[0] : `${Math.min(...reps)} à ${Math.max(...reps)}`;
    const now = pdc ? `${a.length} × ${repTxt} reps` : `${a.length} × ${repTxt} à ${fmtN(top)} kg`;
    let chip;
    if (!prev) chip = ["new", "Nouveau"];
    else {
      const pTop = Math.max(...prev.sets.map(s => s.w || 0));
      const sum = arr => arr.reduce((t, s) => t + s.r, 0);
      if (!pdc && top > pTop + 0.01) chip = ["up", `↑ +${fmtN(top - pTop)} kg`];
      else if (!pdc && top < pTop - 0.01) chip = ["down", `↓ −${fmtN(pTop - top)} kg`];
      else {
        const n = Math.min(a.length, prev.sets.length), d = sum(a.slice(0, n)) - sum(prev.sets.slice(0, n));
        chip = d > 0 ? ["up", `↑ +${d} rép.`] : d < 0 ? ["down", `↓ −${-d} rép.`] : ["same", "= pareil"];
      }
    }
    if (chip[0] === "up") up++;
    rows.push(`<div class="cmp-row"><b>${esc(LIB[x.k].n)}</b><span class="cmp-chip c-${chip[0]}">${chip[1]}</span><small>${esc(now)}</small></div>`);
  });
  if (!rows.length) return "";
  // Travail total comparé à la dernière fois que tu as fait cette même séance
  const vol = lg => Object.values(lg.ex || {}).reduce((t, arr) => t + doneSets(arr).reduce((u, s) => u + (s.w || 0) * s.r, 0), 0);
  const prevDay = Object.entries(DB.logs).filter(([id, lg]) => id !== G.docId && lg.day === G.dayId && hasSets(lg) && !lg.deload && lg.date < l.date).sort((a, b) => b[1].date.localeCompare(a[1].date))[0];
  let head = "";
  if (prevDay && vol(prevDay[1]) > 0) {
    const pct = Math.round((vol(l) / vol(prevDay[1]) - 1) * 100);
    const when = dayName(prevDay[1].date) + (Date.now() - parseD(prevDay[1].date) < 8 * 864e5 ? " dernier" : ` ${parseD(prevDay[1].date).getDate()}`);
    head = `<div class="cmp-head"><span><span class="eyebrow" style="color:#FFFFFF;opacity:.85">Par rapport à ${esc(when)}</span><b class="d">${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)} %</b><small>de travail · ${up} exercice${up > 1 ? "s" : ""} en progrès</small></span>${STEPS_SVG(pct >= 0 ? 4 : 1)}</div>`;
  }
  return `${head}<div class="card cmp-list">${rows.join("")}</div>`;
}
