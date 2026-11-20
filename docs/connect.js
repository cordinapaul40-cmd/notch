// ============================================================
//  NOTCH · Connexions et crans
//  - la séance sur l'écran verrouillé (notification avec boutons)
//  - le mini-lecteur de musique
//  - l'agenda : heure des séances, conflits, décalage, ajout à l'agenda
//  - l'arrivée à la salle
//  - les crans (niveaux, badges) et l'animation d'ouverture
//  Chargé avant app.js : ce fichier ne contient que des fonctions, appelées par app.js.
// ============================================================
"use strict";

const P_CAL_R = "android.permission.READ_CALENDAR", P_CAL_W = "android.permission.WRITE_CALENDAR";
const P_FINE = "android.permission.ACCESS_FINE_LOCATION", P_COARSE = "android.permission.ACCESS_COARSE_LOCATION";
const P_BG = "android.permission.ACCESS_BACKGROUND_LOCATION";

// ---------- Dates ----------
const addDays = (key, n) => { const d = parseD(key); d.setDate(d.getDate() + n); return dkey(d); };
const mondayOf = key => { const d = parseD(key); d.setDate(d.getDate() - weekIdx(d)); return dkey(d); };
const dayName = key => parseD(key).toLocaleDateString("fr-FR", { weekday: "long" });
const capFirst = t => t.charAt(0).toUpperCase() + t.slice(1);
const hm = ms => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const atTime = (key, time) => { const [h, m] = String(time || "18:00").split(":").map(Number); const d = parseD(key); d.setHours(h || 0, m || 0, 0, 0); return d.getTime(); };
// « 20 h 30 », sans retour à la ligne au milieu
const hTxt = t => String(t).replace(":", "\u00A0h\u00A0").replace(/\u00A0h\u00A000$/, "\u00A0h");

// ============================================================
//  Planning de la semaine : jours du programme + séances décalées
// ============================================================
function sessionTime() { return (DB.prefs.cal && DB.prefs.cal.time) || "18:00"; }
function weekPlan(mon = mondayKey()) {
  const mv = (DB.prefs.moves || {})[mon] || {};
  return DAYS.map(d => {
    const m = mv[d.id], date = m ? m.date : addDays(mon, d.wd - 1);
    return { d, id: d.id, date, wd: weekIdx(parseD(date)) + 1, time: (m && m.time) || sessionTime(), moved: !!m };
  }).sort((a, b) => a.wd - b.wd || a.time.localeCompare(b.time));
}
function moveSession(id, date, time) {
  const mon = mondayOf(date), cur = mondayKey();
  DB.prefs.moves = DB.prefs.moves || {};
  // On ne garde que la semaine en cours et les suivantes
  Object.keys(DB.prefs.moves).forEach(k => { if (k < cur) delete DB.prefs.moves[k]; });
  const w = DB.prefs.moves[mon] = DB.prefs.moves[mon] || {};
  const base = addDays(mon, dayById(id).wd - 1);
  if (date === base && time === sessionTime()) delete w[id]; else w[id] = { date, time };
  save();
  calSync(true);
}

// ============================================================
//  Agenda
// ============================================================
let CAL_CACHE = null;
function calReady() { return !!(NATIVE && DB.prefs.cal && DB.prefs.cal.on && native("hasPerm", P_CAL_R)); }
function weekEvents(mon) {
  if (!calReady()) return [];
  if (CAL_CACHE && CAL_CACHE.mon === mon && Date.now() - CAL_CACHE.at < 60000) return CAL_CACHE.list;
  const from = parseD(mon).getTime(), to = parseD(addDays(mon, 7)).getTime();
  let list = [];
  try { list = JSON.parse(native("calEvents", String(from), String(to)) || "[]"); } catch (e) {}
  CAL_CACHE = { mon, at: Date.now(), list };
  return list;
}
// Ce qui t'occupe vraiment : ni les journées entières, ni les événements « disponible », ni les séances Notch
const busy = evs => evs.filter(e => !e.allDay && !e.free && !e.notch);
const clash = (evs, a, b) => busy(evs).filter(e => e.begin < b && e.end > a);
const kind = id => id.split("-")[0]; // « haut » ou « bas »

function findConflict(plan, weekDone) {
  const evs = weekEvents(mondayKey());
  if (!evs.length) return null;
  const now = Date.now(), ign = DB.prefs.calIgnore || {};
  for (const p of plan) {
    if (weekDone.has(p.id) || p.date < today()) continue;
    const a = atTime(p.date, p.time), b = a + estimate(p.d) * 60000;
    if (b < now || ign[`${p.id}@${p.date}@${p.time}`]) continue;
    const hits = clash(evs, a, b);
    if (!hits.length) continue;
    return { p, ev: hits.sort((x, y) => x.begin - y.begin)[0], options: proposals(p, plan, evs) };
  }
  return null;
}
// Deux propositions : le même jour juste après l'événement, ou un autre jour libre de la semaine
function proposals(p, plan, evs) {
  const dur = estimate(p.d) * 60000, now = Date.now(), out = [];
  let a = atTime(p.date, p.time);
  for (let i = 0; i < 12; i++) {
    const hits = clash(evs, a, a + dur);
    if (!hits.length) break;
    a = Math.ceil(Math.max(...hits.map(e => e.end)) / 9e5) * 9e5; // au quart d'heure suivant
  }
  if (a <= atTime(p.date, "21:30") && a > now && !clash(evs, a, a + dur).length && hm(a) !== p.time) out.push({ date: p.date, time: hm(a) });

  const others = plan.filter(q => q.id !== p.id);
  const used = new Set(others.map(q => q.date));
  const mon = mondayOf(p.date), t = sessionTime();
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i)).filter(d => d >= today() && d !== p.date && !used.has(d));
  // Plutôt après la date prévue, et pas collé à une séance qui travaille les mêmes muscles
  days.sort((x, y) => (x < p.date) - (y < p.date) || x.localeCompare(y));
  const sameNear = d => others.some(q => kind(q.id) === kind(p.id) && Math.abs(parseD(q.date) - parseD(d)) <= 864e5);
  const free = d => { const s = atTime(d, t); return s > now && !clash(evs, s, s + dur).length; };
  const pick = days.find(d => free(d) && !sameNear(d)) || days.find(free);
  if (pick) out.push({ date: pick, time: t });
  return out.slice(0, 2);
}
function conflictCard(cf) {
  const { p, ev, options } = cf;
  const when = p.date === today() ? "Aujourd’hui" : capFirst(dayName(p.date));
  const evTxt = `« ${ev.title} »${ev.end > atTime(p.date, p.time) ? ` jusqu’à ${hTxt(hm(ev.end))}` : ""}`;
  const optLab = o => (o.date === p.date ? "À" : capFirst(dayName(o.date))) + " " + hTxt(o.time);
  return `<section class="card conflict" aria-label="Conflit d’agenda">
    <div class="conf-head"><i aria-hidden="true"></i><b>${esc(when)}, tu as ${esc(evTxt)}</b></div>
    <p>${esc(p.d.tab)}, prévue à ${esc(hTxt(p.time))}, tombe pendant. ${options.length ? (options.length > 1 ? "Je te propose deux créneaux libres :" : "Je te propose ce créneau libre :") : "Aucun créneau libre cette semaine : tu pourras la rattraper le week-end."}</p>
    ${options.length ? `<div class="conf-opts">${options.map((o, i) => `<button type="button" class="${i === options.length - 1 ? "btn-pri" : "btn"}" data-act="move" data-id="${p.id}" data-date="${o.date}" data-time="${o.time}">${esc(optLab(o))}</button>`).join("")}</div>` : ""}
    <button type="button" class="link-btn" data-act="cal-ignore" data-key="${esc(`${p.id}@${p.date}@${p.time}`)}">Garder comme ça</button>
  </section>`;
}

// Tes séances dans l'agenda (semaine en cours et suivante)
function calSync(force) {
  if (!NATIVE || !DB.prefs.cal || !DB.prefs.cal.write || !native("hasPerm", P_CAL_W)) return;
  const now = Date.now();
  if (!force && DB.prefs.cal.synced && now - DB.prefs.cal.synced < 3600e3) return;
  const mon = mondayKey(), next = addDays(mon, 7), items = [];
  [mon, next].forEach(m => weekPlan(m).forEach(p => {
    const a = atTime(p.date, p.time);
    items.push({ key: `${p.id}@${m}`, title: `Notch · ${p.d.tab}`, detail: `${p.d.title} (${p.d.tag.toLowerCase()})`, begin: a, end: a + estimate(p.d) * 60000 });
  }));
  let res = {};
  try { res = JSON.parse(native("calSync", JSON.stringify({ from: parseD(mon).getTime(), to: parseD(addDays(mon, 14)).getTime(), items })) || "{}"); } catch (e) {}
  if (res.ok) { DB.prefs.cal.synced = now; DB.prefs.cal.calName = res.calendar || ""; CAL_CACHE = null; save(); }
  else if (force && res.why === "calendar") toast("Aucun agenda modifiable sur ce téléphone");
}

// ============================================================
//  Séance sur l'écran verrouillé
// ============================================================
let liveT = null;
function liveUpdate(now) {
  if (!NATIVE) return;
  clearTimeout(liveT);
  const run = () => { const s = liveState(); s ? native("liveSession", JSON.stringify(s)) : native("liveClear"); };
  if (now) run(); else liveT = setTimeout(run, 120);
}
function liveState() {
  if (!G || !DB.logs[G.docId] || DB.logs[G.docId].finished || G.screen === "done") return null;
  const list = exs(), x = list[G.ex];
  if (!x) return null;
  const total = list.reduce((t, e) => t + e.sets, 0);
  const done = list.reduce((t, e) => t + Math.min(e.sets, doneSets(setsOf(e)).length), 0);
  const progress = total ? Math.round(done / total * 100) : 0;
  const S = (title, text, buttons, extra) => Object.assign({ title, text, buttons, progress }, extra || {});
  const setState = (e, j, dom) => {
    const p = prefill(e, j);
    let w = p.w === "" || p.w == null ? "" : fmtN(p.w), r = p.r;
    if (dom) { if ($("in-w") && $("in-w").value) w = $("in-w").value; if ($("in-r") && $("in-r").value) r = $("in-r").value; }
    return S(`${LIB[e.k].n} · série ${j + 1}/${e.sets}`,
      isPdc(e.k) ? `${r} reps · objectif ${e.lo} à ${e.hi}` : `${w || "?"} kg × ${r} · objectif ${e.lo} à ${e.hi}`,
      [{ id: "validate", label: "Série validée" }]);
  };
  const introState = i => { const e = list[i]; return S(LIB[e.k].n, `Exercice ${i + 1} sur ${list.length} · ${e.sets} × ${e.lo} à ${e.hi}`, [{ id: "begin", label: "C’est parti" }]); };
  if (G.screen === "intro") return introState(G.ex);
  if (G.screen === "warmup") return S(`Échauffement · ${LIB[x.k].n}`, warmSets(x).map(s => `${fmtN(s.w)} kg × ${s.reps}`).join(" puis "), [{ id: "warm-end", label: "Passer aux séries" }]);
  if (G.screen === "set") return setState(x, G.set, true);
  if (G.screen === "rest" && G.after) {
    const a = G.after;
    const after = a.screen === "intro" ? introState(a.ex) : setState(list[a.ex], a.set, false);
    return S(`Récupération · ${LIB[x.k].n}`, "Ensuite : " + restNextText(a), [{ id: "plus", label: "+15 s" }, { id: "skip", label: "Passer" }], { restEnd: G.restEnd, after });
  }
  return null;
}
// Bouton touché dans la notification (écran verrouillé ou volet des notifications)
window.notchAction = id => {
  if (!G || !DB.logs[G.docId]) return;
  if ($("session").hidden) openSession(G.dayId);
  if (id === "plus") { if (G.screen === "rest") addRest(15); }
  else if (id === "skip") { if (G.screen === "rest") proceed(); }
  else if (id === "begin" || id === "warm-end" || id === "validate") {
    if (G.screen === "rest") proceed();
    if (G.screen === "intro") beginExercise();
    if (G.screen === "warmup" && id !== "begin") { G.warmed = true; goto("set"); }
    if (id === "validate" && G.screen === "set") validate();
  }
  liveUpdate(true);
};

// ============================================================
//  Mini-lecteur de musique
// ============================================================
let MUSIC = { granted: false, has: false, art: "" };
const ICO = {
  note: `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  prev: `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M6 6h2v12H6zM9.5 12L18 6v12z"/></svg>`,
  next: `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M16 6h2v12h-2zM6 18V6l8.5 6z"/></svg>`,
  play: `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  pause: `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>`,
};
const musicOn = () => !!(NATIVE && DB.prefs.music && DB.prefs.music.on);
function musicBar() { return musicOn() ? `<div class="mplayer glass" data-music>${musicInner()}</div>` : ""; }
function musicInner() {
  const m = MUSIC, list = G && DB.prefs.music.lists && DB.prefs.music.lists[G.dayId];
  const art = `<span class="mp-art">${m.art ? `<img src="${m.art}" alt="">` : ICO.note}</span>`;
  if (!m.granted) return `${art}<span class="mp-txt"><b>Ta musique ici</b><small>Une autorisation à donner, une seule fois</small></span><button type="button" class="mp-cta" data-act="music-access">Autoriser</button>`;
  if (!m.has) return `${art}<span class="mp-txt"><b>Pas de musique</b><small>${list ? "Ta playlist " + esc(dayById(G.dayId).tab) : "Lance ton lecteur"}</small></span><button type="button" class="mp-cta" data-act="music-open">Lancer</button>`;
  return `${art}<span class="mp-txt"><b>${esc(m.title || "Sans titre")}</b><small>${esc([m.artist, m.app].filter(Boolean).join(" · "))}</small></span>
    <span class="mp-ctl">
      <button type="button" data-act="music-cmd" data-cmd="prev" aria-label="Morceau précédent">${ICO.prev}</button>
      <button type="button" class="mp-play" data-act="music-cmd" data-cmd="toggle" aria-label="${m.playing ? "Pause" : "Lecture"}">${m.playing ? ICO.pause : ICO.play}</button>
      <button type="button" data-act="music-cmd" data-cmd="next" aria-label="Morceau suivant">${ICO.next}</button>
    </span>`;
}
function musicPaint() { document.querySelectorAll("[data-music]").forEach(el => el.innerHTML = musicInner()); }
// Appelé par Android à chaque changement de morceau ou de lecture
window.notchMusic = s => {
  if (!s) return;
  if (s.art === undefined) s.art = MUSIC.art; // pochette inchangée
  MUSIC = s; musicPaint();
};
function musicCmd(cmd) {
  if (cmd === "toggle") { MUSIC.playing = !MUSIC.playing; musicPaint(); } // réaction immédiate, Android confirme ensuite
  native("musicCmd", cmd); vibrate(8);
}

// ============================================================
//  Arrivée à la salle
// ============================================================
function gymState() { try { return JSON.parse(native("gymState") || "{}"); } catch (e) { return {}; } }
function gymGroup() {
  const g = DB.prefs.gym, st = gymState();
  if (!g || g.lat == null) return `
    <div class="eyebrow">Arrivée à la salle</div>
    <p class="muted set-p">Quand tu arrives au Basic-Fit un jour de séance, Notch te propose de la lancer et t’ouvre l’appli Basic-Fit pour le QR code d’entrée. À faire une fois, sur place.</p>
    <button class="btn btn-dark" type="button" data-act="gym-here">Je suis à la salle : enregistrer l’endroit</button>`;
  return `
    <div class="eyebrow">Arrivée à la salle</div>
    <label class="toggle" for="st-gym"><span><b>Me proposer la séance</b><small>Enregistrée le ${esc(frDate(g.date, { day: "numeric", month: "long" }))} · précision ± ${Math.round(g.acc || 0)} m</small></span><input type="checkbox" role="switch" id="st-gym" ${g.on !== false ? "checked" : ""}></label>
    ${g.on !== false && !st.background ? `<div class="verdict bad set-p"><b>Une autorisation manque.</b> Choisis « Toujours autoriser » pour la position, sinon Notch ne peut pas savoir que tu arrives à la salle.<div style="margin-top:10px"><button class="btn btn-dark" type="button" data-act="gym-bg">Autoriser</button></div></div>` : ""}
    <div class="grid2" style="margin-top:8px"><button class="btn" type="button" data-act="gym-here">Changer d’endroit</button>${st.basicFit ? `<button class="btn" type="button" data-act="basic-fit">Ouvrir Basic-Fit</button>` : `<span></span>`}</div>`;
}
function gymRefresh() { const el = $("gym-group"); if (el) el.innerHTML = gymGroup(); }
function gymHere() {
  if (!native("hasPerm", P_FINE)) return native("askPerm", "gym-fine", `${P_FINE},${P_COARSE}`);
  toast("Je cherche ta position…");
  native("gymLocate");
}
window.notchGymLocated = loc => {
  if (!loc) return toast("Position introuvable : active la localisation et réessaie");
  DB.prefs.gym = { lat: loc.lat, lng: loc.lng, acc: loc.acc, date: today(), on: true, name: "au Basic-Fit" };
  save(); native("gymSave", JSON.stringify(DB.prefs.gym));
  toast(loc.acc > 80 ? `Salle enregistrée (± ${Math.round(loc.acc)} m, plutôt imprécis)` : "Salle enregistrée");
  gymRefresh();
  if (!native("hasPerm", P_BG)) setTimeout(() => native("askPerm", "gym-bg", P_BG), 600);
};

// ---------- Réponses aux demandes de permission ----------
window.notchPerm = (key, ok) => {
  if (key === "gym-fine") { if (ok) gymHere(); else toast("Sans la position, Notch ne peut pas repérer ta salle"); }
  else if (key === "gym-bg") { if (DB.prefs.gym) native("gymSave", JSON.stringify(DB.prefs.gym)); if (!ok) toast("Choisis « Toujours autoriser » dans la page Position"); gymRefresh(); }
  else if (key === "cal-read") {
    DB.prefs.cal.on = !!ok; save(); CAL_CACHE = null;
    if (!ok) { toast("Accès à l’agenda refusé"); const el = $("st-cal"); if (el) el.checked = false; }
    else toast("Agenda connecté");
  }
  else if (key === "cal-write") {
    DB.prefs.cal.write = !!ok; if (ok) DB.prefs.cal.on = true; save();
    if (!ok) { toast("Accès à l’agenda refusé"); const el = $("st-calw"); if (el) el.checked = false; }
    else calSync(true);
    refreshCalGroup();
  }
  render();
};

// ============================================================
//  Réglages : musique, agenda, salle
// ============================================================
function musicGroup() {
  const m = DB.prefs.music, access = native("musicAccess");
  return `
    <div class="eyebrow">Musique</div>
    <label class="toggle" for="st-music"><span><b>Mini-lecteur pendant la séance</b><small>Pause et morceau suivant sans quitter Notch. Spotify, Deezer, YouTube Music…</small></span><input type="checkbox" role="switch" id="st-music" ${m.on ? "checked" : ""}></label>
    ${m.on && !access ? `<div class="verdict info set-p">Android demande d’autoriser l’<b>accès aux notifications</b> pour piloter la musique. Notch ne lit pas tes notifications.
      <div style="margin-top:10px"><button class="btn btn-dark" type="button" data-act="music-access">Autoriser</button></div>
      <p style="margin:10px 0 0;font-size:13px">Interrupteur grisé ? Ouvre les infos de Notch, touche ⋮ en haut à droite, puis « Autoriser les paramètres restreints », et réessaie.</p>
      <div style="margin-top:8px"><button class="btn" type="button" data-act="app-settings">Infos de Notch</button></div></div>` : ""}
    ${m.on ? `<p class="muted set-p">Une playlist par séance (facultatif) : colle son lien de partage. Le bouton « Lancer » l’ouvrira.</p>
      ${DAYS.map(d => `<label class="field" for="pl-${d.id}">${esc(d.tab)}<input type="url" inputmode="url" id="pl-${d.id}" placeholder="https://open.spotify.com/playlist/…" value="${esc((m.lists || {})[d.id] || "")}"></label>`).join("")}` : ""}`;
}
function calGroup() {
  const c = DB.prefs.cal;
  return `
    <div class="eyebrow">Agenda</div>
    <label class="toggle" for="st-caltime"><span><b>Heure de tes séances</b><small>Pour l’agenda et les conflits</small></span><input type="time" id="st-caltime" value="${esc(c.time || "18:00")}"></label>
    <label class="toggle" for="st-cal"><span><b>Repérer les conflits</b><small>Notch lit ton agenda et te prévient si une séance tombe pendant un cours ou un rendez-vous</small></span><input type="checkbox" role="switch" id="st-cal" ${c.on ? "checked" : ""}></label>
    <label class="toggle" for="st-calw"><span><b>Ajouter mes séances à l’agenda</b><small>${c.write && c.calName ? "Dans " + esc(c.calName) : "Elles s’y mettent à jour si tu en décales une"}</small></span><input type="checkbox" role="switch" id="st-calw" ${c.write ? "checked" : ""}></label>`;
}
function refreshCalGroup() { const el = $("cal-group"); if (el) el.innerHTML = calGroup(); }
function refreshMusicGroup() { const el = $("music-group"); if (el) el.innerHTML = musicGroup(); }
// Renvoie true si le réglage a été traité ici
function onConnectSetting(id, el) {
  if (id === "st-music") {
    DB.prefs.music.on = el.checked; save(); refreshMusicGroup();
    if (el.checked && !native("musicAccess")) native("musicOpenAccess");
    return true;
  }
  if (id.startsWith("pl-")) {
    const v = el.value.trim(), dId = id.slice(3);
    DB.prefs.music.lists = DB.prefs.music.lists || {};
    if (v && !/^https?:\/\//i.test(v)) { toast("Colle un lien qui commence par https://"); return true; }
    if (v) DB.prefs.music.lists[dId] = v; else delete DB.prefs.music.lists[dId];
    save(); toast(v ? "Playlist enregistrée" : "Playlist retirée"); return true;
  }
  if (id === "st-caltime") { if (el.value) { DB.prefs.cal.time = el.value; save(); CAL_CACHE = null; calSync(true); render(); } return true; }
  if (id === "st-cal") {
    if (el.checked) native("askPerm", "cal-read", P_CAL_R);
    else { DB.prefs.cal.on = false; save(); render(); }
    return true;
  }
  if (id === "st-calw") {
    if (el.checked) native("askPerm", "cal-write", `${P_CAL_R},${P_CAL_W}`);
    else { DB.prefs.cal.write = false; const n = native("calRemoveAll"); save(); refreshCalGroup(); if (n) toast(`${n} séance${n > 1 ? "s" : ""} retirée${n > 1 ? "s" : ""} de l’agenda`); }
    return true;
  }
  if (id === "st-gym") {
    DB.prefs.gym.on = el.checked; save();
    if (el.checked) native("gymSave", JSON.stringify(DB.prefs.gym)); else native("gymOff");
    gymRefresh(); return true;
  }
  return false;
}
// Renvoie true si l'action a été traitée ici
function onConnectAct(a, b) {
  if (a === "move") { moveSession(b.dataset.id, b.dataset.date, b.dataset.time); vibrate(15); toast(`${dayById(b.dataset.id).tab} : ${dayName(b.dataset.date)} à ${hTxt(b.dataset.time)}`); render(); return true; }
  if (a === "cal-ignore") { DB.prefs.calIgnore = DB.prefs.calIgnore || {}; DB.prefs.calIgnore[b.dataset.key] = 1; save(); render(); return true; }
  if (a === "music-access") { native("musicOpenAccess"); return true; }
  if (a === "music-open") { native("musicOpen", (G && DB.prefs.music.lists && DB.prefs.music.lists[G.dayId]) || ""); return true; }
  if (a === "music-cmd") { musicCmd(b.dataset.cmd); return true; }
  if (a === "app-settings") { native("openAppSettings"); return true; }
  if (a === "gym-here") { gymHere(); return true; }
  if (a === "gym-bg") { native("askPerm", "gym-bg", P_BG); return true; }
  if (a === "basic-fit") { if (!native("openBasicFit")) toast("L’appli Basic-Fit n’est pas installée"); return true; }
  if (a === "crans") { openCrans(); return true; }
  return false;
}

// ============================================================
//  Les crans : niveaux et badges
// ============================================================
// Séances pour atteindre chaque cran (4 séances = une semaine)
const LEVELS = [0, 4, 12, 24, 40, 60, 84, 112, 144, 180, 220, 264];
function crans() {
  const logs = Object.values(DB.logs).filter(hasSets).sort((a, b) => a.date.localeCompare(b.date) || (a.startedAt || 0) - (b.startedAt || 0));
  const n = logs.length;
  // Semaines complètes (4 séances différentes) et meilleure série de semaines d'affilée
  const weeks = {};
  logs.forEach(l => { const m = mondayOf(l.date); (weeks[m] = weeks[m] || new Set()).add(l.day); });
  const full = Object.keys(weeks).filter(m => weeks[m].size >= 4).sort();
  let streak = 0, run = 0, prev = null;
  full.forEach(m => { run = prev && addDays(prev, 7) === m ? run + 1 : 1; streak = Math.max(streak, run); prev = m; });
  // Records : une séance qui bat toutes les précédentes sur un exercice
  let records = 0, broke = false; const by = {};
  logs.forEach(l => Object.entries(l.ex || {}).forEach(([k, arr]) => {
    const a = doneSets(arr); if (!a.length) return;
    const top = Math.max(...a.map(e1rm)), s = by[k] = by[k] || { best: null, since: 0 };
    if (s.best == null) { s.best = top; return; }
    if (top > s.best + 0.01) { records++; if (s.since >= 3) broke = true; s.best = top; s.since = 0; } else s.since++;
  }));
  const W = Object.values(DB.body).filter(b => b.weight != null).sort((a, b) => a.date.localeCompare(b.date));
  const loss = W.length > 1 ? W[0].weight - W[W.length - 1].weight : 0;

  let level = 1; LEVELS.forEach((t, i) => { if (n >= t) level = i + 1; });
  const at = LEVELS[level - 1], nextAt = LEVELS[level] ?? null;
  const B = (id, name, ok, icon, txt) => ({ id, name, ok: !!ok, icon, txt });
  const badges = [
    B("s1", "Première séance", n >= 1, "1", "Ta toute première séance"),
    B("s10", "10 séances", n >= 10, "10", "10 séances enregistrées"),
    B("w1", "Semaine complète", full.length >= 1, "cal", "Les 4 séances d’une même semaine"),
    B("r1", "Premier record", records >= 1, "up", "Battre une de tes perfs"),
    B("s25", "25 séances", n >= 25, "25", "25 séances enregistrées"),
    B("w4", "4 semaines pleines", streak >= 4, "cal", "4 semaines complètes d’affilée"),
    B("st", "Stagnation cassée", broke, "brk", "Un record après 3 séances sans progrès"),
    B("r10", "10 records", records >= 10, "up", "10 perfs battues"),
    B("k2", "−2 kg", loss >= 2, "kg", "2 kg de moins depuis ta première pesée"),
    B("s50", "50 séances", n >= 50, "50", "50 séances enregistrées"),
    B("w8", "8 semaines pleines", streak >= 8, "cal", "8 semaines complètes d’affilée"),
    B("k5", "−5 kg", loss >= 5, "kg", "5 kg de moins depuis ta première pesée"),
    B("r25", "25 records", records >= 25, "up", "25 perfs battues"),
    B("s100", "100 séances", n >= 100, "100", "100 séances enregistrées"),
  ];
  return { n, level, at, nextAt, streak, fullWeeks: full.length, records, badges, got: badges.filter(b => b.ok).length };
}
const STEPS_SVG = (lvl, color = "#FFFFFF") => {
  // Le logo Notch en marches : celles déjà montées sont pleines
  const pts = [[4, 36], [18, 36], [18, 26], [32, 26], [32, 16], [46, 16], [46, 6], [60, 6]];
  const lit = Math.min(4, 1 + ((lvl - 1) % 4));
  const path = n => pts.slice(0, Math.min(pts.length, n * 2 + 1)).map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
  return `<svg width="64" height="42" viewBox="0 0 64 42" aria-hidden="true"><path d="${path(4)}" fill="none" stroke="${color}" stroke-opacity=".35" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="${path(lit)}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
};
function badgeIcon(b) {
  if (!b.ok) return `<span class="bdg-i off" aria-hidden="true">?</span>`;
  const svg = {
    cal: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
    up: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-6 4 4 6-8"/></svg>`,
    brk: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5M5 11l7-7 7 7"/></svg>`,
    kg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M8 10a4 4 0 0 1 8 0M12 10l2-2"/></svg>`,
  }[b.icon];
  const tone = b.icon === "up" ? "ok" : b.icon === "brk" ? "warn" : "acc";
  return `<span class="bdg-i ${tone}" aria-hidden="true">${svg || `<b class="d">${b.icon}</b>`}</span>`;
}
function cranCard() {
  const c = crans(), pct = c.nextAt ? Math.round((c.n - c.at) / (c.nextAt - c.at) * 100) : 100;
  return `<button type="button" class="cran-card" data-act="crans" aria-label="Cran ${c.level}, voir tes badges">
    <span class="row"><span class="eyebrow" style="color:#FFFFFF;opacity:.85">Ton niveau</span>${STEPS_SVG(c.level)}</span>
    <span class="d up cran-n">Cran ${c.level}</span>
    <span class="cran-sub">${c.n} séance${c.n > 1 ? "s" : ""}${c.streak ? ` · ${c.streak} semaine${c.streak > 1 ? "s" : ""} complète${c.streak > 1 ? "s" : ""} d’affilée` : ""}</span>
    <span class="cran-bar"><i style="width:${pct}%"></i></span>
    <span class="cran-sub">${c.nextAt ? `Cran ${c.level + 1} dans ${c.nextAt - c.n} séance${c.nextAt - c.n > 1 ? "s" : ""}` : "Dernier cran atteint"} · ${c.got} badge${c.got > 1 ? "s" : ""} sur ${c.badges.length}</span>
  </button>`;
}
function openCrans() {
  const c = crans();
  openSheet(`
    <div class="stack" style="gap:4px"><div class="eyebrow">Cran ${c.level} · ${c.got} badge${c.got > 1 ? "s" : ""} sur ${c.badges.length}</div><h2 class="d up h2">Tes crans</h2></div>
    <p class="muted" style="margin:0;font-size:14px">Tu montes d’un cran avec tes séances : le premier en une semaine, puis il en faut un peu plus à chaque fois. Les badges récompensent la régularité et les progrès, pas le volume.</p>
    <div class="bdg-grid">${c.badges.map(b => `<div class="bdg${b.ok ? "" : " off"}">${badgeIcon(b)}<b>${esc(b.name)}</b><small>${esc(b.txt)}</small></div>`).join("")}</div>`, "Tes crans et badges");
}
// Nouveautés depuis la dernière fois (affichées dans le bilan de séance)
function cranNews() {
  const c = crans(), seen = DB.prefs.seen || { level: 1, badges: [] };
  const fresh = c.badges.filter(b => b.ok && !seen.badges.includes(b.id));
  const up = c.level > (seen.level || 1);
  DB.prefs.seen = { level: c.level, badges: c.badges.filter(b => b.ok).map(b => b.id) };
  return { c, up, fresh };
}
// Au premier lancement de cette version : tout ce qui est déjà acquis est « vu »
function initSeen() { if (!DB.prefs.seen) { const c = crans(); DB.prefs.seen = { level: c.level, badges: c.badges.filter(b => b.ok).map(b => b.id) }; } }

// ============================================================
//  Le logo devient ta séance : ouverture, lancement et fin de séance
//  Même geste partout : la carte bleue de l'accueil grandit ou se replie.
// ============================================================
const EASE_IOS = "cubic-bezier(0.32, 0.72, 0, 1)";
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const box = r => ({ left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
const fullBox = () => ({ left: "0px", top: "0px", width: innerWidth + "px", height: innerHeight + "px" });
const STEPS_PATH = "M14 44 H26 V34 H38 V24 H50";

// Moment où l'appli a été quittée : sert à ne pas rejouer l'ouverture si Android l'a fermée en arrière-plan
const markHidden = () => { try { localStorage.setItem("notch-hidden", String(Date.now())); } catch (e) {} };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") markHidden(); });
window.addEventListener("pagehide", markHidden);

// Ouverture : les marches se dessinent, puis le logo devient la carte de ta séance.
// À chaque lancement, sauf : ouverture depuis un widget ou une notification, appli quittée il y a moins de 2 min,
// mouvements réduits dans les réglages Android. Un appui la coupe.
let INTRO = null;
function openingIntro() {
  if (REDUCED || VIEW !== "accueil" || /[?&]action=/.test(location.search)) return;
  let hid = 0;
  try { hid = +localStorage.getItem("notch-hidden") || 0; } catch (e) {}
  if (Date.now() - hid < 120000) return;
  const hero = document.querySelector("#v-accueil .hero");
  if (!hero) return;
  const r = hero.getBoundingClientRect();
  const others = [...document.querySelectorAll("#v-accueil > :not(.hero)"), document.querySelector(".tabbar")].filter(Boolean);
  const bg = document.createElement("div"), mo = document.createElement("div");
  bg.className = "intro-bg"; mo.className = "intro-mo";
  bg.setAttribute("aria-hidden", "true"); mo.setAttribute("aria-hidden", "true");
  mo.innerHTML = `<svg viewBox="0 0 64 64" width="72" height="72"><path pathLength="1" d="${STEPS_PATH}" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const S = 96, start = { left: (innerWidth - S) / 2 + "px", top: (innerHeight - S) / 2 + "px", width: S + "px", height: S + "px" };
  Object.assign(mo.style, start);
  document.body.append(bg, mo);
  hero.style.opacity = "0"; others.forEach(e => e.style.opacity = "0");
  const svg = mo.firstChild, path = svg.firstChild, anims = [], timers = [];
  let done = false;
  const end = () => {
    if (done) return; done = true; INTRO = null;
    anims.forEach(a => a.cancel()); timers.forEach(clearTimeout);
    hero.style.opacity = "";
    others.forEach((e, i) => { e.style.opacity = ""; e.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 320, delay: 30 * i, easing: EASE_OUT, fill: "backwards" }); });
    bg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" }).onfinish = () => bg.remove();
    mo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" }).onfinish = () => mo.remove();
  };
  INTRO = { end };
  // 1. Le carré arrive et les marches se dessinent (0 → 0,55 s)
  anims.push(mo.animate([{ transform: "scale(.88)" }, { transform: "none" }], { duration: 300, easing: EASE_OUT, fill: "both" }));
  anims.push(path.animate([{ strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDasharray: 1, strokeDashoffset: 0 }], { duration: 440, delay: 90, easing: EASE_OUT, fill: "both" }));
  // 2. Le carré devient la carte de la séance (0,6 → 1,1 s)
  timers.push(setTimeout(() => {
    if (done) return;
    anims.push(svg.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.7)" }], { duration: 200, easing: "ease-in", fill: "forwards" }));
    const m = mo.animate([{ ...start, borderRadius: "24px" }, { ...box(r), borderRadius: "28px" }], { duration: 500, easing: EASE_IOS, fill: "forwards" });
    anims.push(m);
    m.onfinish = end;
  }, 600));
  bg.addEventListener("pointerdown", end); mo.addEventListener("pointerdown", end);
  timers.push(setTimeout(end, 1600)); // filet de sécurité
}

// « Commencer » : la carte bleue s'agrandit et devient l'écran de l'exercice
function morphToSession(dayId) {
  const hero = document.querySelector("#v-accueil .hero");
  if (REDUCED || !hero || VIEW !== "accueil") return openSession(dayId);
  const r = hero.getBoundingClientRect();
  const m = document.createElement("div");
  m.className = "morph"; m.setAttribute("aria-hidden", "true");
  m.innerHTML = `<i class="morph-lt"></i>`;
  Object.assign(m.style, box(r), { borderRadius: "28px" });
  document.body.appendChild(m);
  vibrate(10);
  let opened = false;
  const go = () => {
    if (opened) return; opened = true;
    openSession(dayId);
    m.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-out", fill: "forwards" }).onfinish = () => m.remove();
  };
  m.animate([{ ...box(r), borderRadius: "28px" }, { ...fullBox(), borderRadius: "0px" }], { duration: 420, easing: EASE_IOS, fill: "forwards" }).onfinish = go;
  m.firstChild.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: 250, fill: "both" });
  setTimeout(go, 700);
}

// « Retour à l'accueil » : le bilan se replie dans la carte, le point du jour s'allume
function morphToHome() {
  const finish = () => { G = null; saveG(); closeSession(); show("accueil"); };
  if (REDUCED) return finish();
  const m = document.createElement("div");
  m.className = "morph morph-back"; m.setAttribute("aria-hidden", "true");
  m.innerHTML = `<i class="morph-blue"></i>`;
  Object.assign(m.style, fullBox(), { borderRadius: "0px" });
  document.body.appendChild(m);
  finish();
  const hero = document.querySelector("#v-accueil .hero");
  if (!hero) { m.remove(); return; }
  const r = hero.getBoundingClientRect();
  const others = [...document.querySelectorAll("#v-accueil > :not(.hero)")];
  hero.style.opacity = "0"; others.forEach(e => e.style.opacity = "0");
  m.firstChild.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 60, fill: "both" });
  let shown = false;
  const land = () => {
    if (shown) return; shown = true;
    hero.style.opacity = "";
    m.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" }).onfinish = () => m.remove();
    others.forEach((e, i) => { e.style.opacity = ""; e.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 320, delay: 40 * i, easing: EASE_OUT, fill: "backwards" }); });
    // La semaine avance : le point du jour s'allume, le compteur se met à jour
    const dot = hero.querySelector(".dot-d.now.done");
    if (dot) dot.animate([{ transform: "scale(1)" }, { transform: "scale(1.7)" }, { transform: "scale(1)" }], { duration: 460, delay: 120, easing: "cubic-bezier(.34,1.56,.64,1)" });
    const cnt = hero.querySelector(".week-dots span");
    if (cnt) cnt.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 300, delay: 180, easing: EASE_OUT, fill: "backwards" });
    vibrate([10, 60, 14]);
  };
  m.animate([{ ...fullBox(), borderRadius: "0px" }, { ...box(r), borderRadius: "28px" }], { duration: 460, easing: EASE_IOS, fill: "forwards" }).onfinish = land;
  setTimeout(land, 800);
}

// Le coach te fait monter d'un cran : la charge défile jusqu'à sa nouvelle valeur
function cranUpChip(step, animate) {
  return `<div class="cran-up${animate ? " pre" : ""}" id="cran-up"><svg width="26" height="18" viewBox="0 0 64 42" aria-hidden="true"><path class="dr" pathLength="1" d="M4 36 H18 V26 H32 V16 H46 V6 H60" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>Monte d’un cran : +${fmtN(step)} kg</div>`;
}
function rollWeight(el, k, from, to) {
  const inp = el.querySelector("#in-w"), chip = el.querySelector("#cran-up");
  if (!inp) return;
  inp.value = fmtN(from); inp.dataset.to = fmtN(to); // une série validée pendant l'animation prend la bonne charge
  const pl = el.querySelector("#plates"); if (pl) pl.innerHTML = platesHTML(k, from);
  setTimeout(() => {
    if (!inp.isConnected) return;
    inp.animate([{ transform: "none", opacity: 1 }, { transform: "translateY(-55%)", opacity: 0 }], { duration: 170, easing: "ease-in" }).onfinish = () => {
      inp.value = fmtN(to); delete inp.dataset.to; inp.classList.add("bumped");
      if (pl) pl.innerHTML = platesHTML(k, to);
      inp.animate([{ transform: "translateY(55%)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 300, easing: "cubic-bezier(.34,1.4,.64,1)" });
      if (chip) { chip.classList.remove("pre"); chip.classList.add("go"); }
      vibrate([12, 40, 12]); announce(`Le coach te fait monter d’un cran : ${fmtN(to)} kilos`); liveUpdate();
      setTimeout(() => inp.classList.remove("bumped"), 1800);
    };
  }, 480);
}
