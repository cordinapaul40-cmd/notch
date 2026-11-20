// ============================================================
//  NOTCH · Mouvements
//  - la pastille de la barre d'onglets qui « coule » d'un onglet à l'autre
//  - les chiffres du minuteur qui roulent
//  - le bouton « Série validée » qui se transforme en coche
//  - le nom de l'exercice suivant qui devient le titre de l'écran
//  Chargé avant app.js : uniquement des fonctions, appelées par app.js.
// ============================================================
"use strict";

const SPRING_OUT = "cubic-bezier(0.34, 1.3, 0.64, 1)";

// ---------- A · L'onglet qui coule ----------
let PILL = null;
function pillInit() {
  const bar = document.querySelector(".tabbar-in");
  if (!bar || PILL) return;
  PILL = document.createElement("span");
  PILL.className = "tb-pill"; PILL.setAttribute("aria-hidden", "true");
  bar.prepend(PILL);
  document.querySelector(".tabbar").classList.add("has-pill");
  window.addEventListener("resize", () => pillTo(VIEWS.indexOf(VIEW), false));
}
const tabBox = i => { const b = document.querySelectorAll(".tb")[i]; return b ? { l: b.offsetLeft, w: b.offsetWidth } : null; };
function pillSet(l, w) { if (PILL) { PILL.style.left = l + "px"; PILL.style.width = w + "px"; } }
// Vers un onglet : la pastille s'étire jusqu'au nouvel onglet, puis se resserre
function pillTo(i, animate = true) {
  if (!PILL) return;
  const to = tabBox(i); if (!to) return;
  PILL.getAnimations().forEach(a => a.cancel());
  const from = { l: PILL.offsetLeft, w: PILL.offsetWidth };
  pillSet(to.l, to.w);
  if (!animate || REDUCED || !from.w || from.l === to.l) return;
  const l = Math.min(from.l, to.l), r = Math.max(from.l + from.w, to.l + to.w);
  PILL.animate([
    { left: from.l + "px", width: from.w + "px" },
    { left: l + "px", width: (r - l) + "px", offset: 0.38 },
    { left: to.l + "px", width: to.w + "px" },
  ], { duration: 460, easing: "cubic-bezier(0.32, 0.72, 0, 1)" });
}
// Pendant le glissement entre pages : le bord de tête avance vite, celui de queue suit plus tard
function pillFollow(i, p) {
  if (!PILL || REDUCED) return;
  // Une animation encore en cours écraserait la position suivie au doigt
  PILL.getAnimations().forEach(a => a.cancel());
  const j = i + Math.sign(p), a = tabBox(i), b = tabBox(j);
  if (!a || !b) return;
  const q = Math.min(1, Math.abs(p));
  const lead = Math.min(1, q * 1.7), trail = q * q;
  if (j > i) pillSet(a.l + (b.l - a.l) * trail, (a.l + a.w + (b.l + b.w - a.l - a.w) * lead) - (a.l + (b.l - a.l) * trail));
  else { const left = a.l + (b.l - a.l) * lead, right = a.l + a.w + (b.l + b.w - a.l - a.w) * trail; pillSet(left, right - left); }
}

// ---------- B · Les chiffres qui roulent ----------
function rollText(el, txt) {
  const prev = el.dataset.v || "";
  el.dataset.v = txt; el.setAttribute("aria-label", txt);
  if (REDUCED || prev.length !== txt.length || !el.querySelector(".rd")) {
    el.innerHTML = [...txt].map(c => `<span class="rd"><span>${c}</span></span>`).join("");
    return;
  }
  const cells = el.querySelectorAll(".rd");
  [...txt].forEach((c, i) => {
    if (c === prev[i]) return;
    const cell = cells[i]; if (!cell) return;
    cell.querySelectorAll("span").forEach((s, k, all) => { if (k < all.length - 1) s.remove(); }); // une animation encore en cours
    const old = cell.firstElementChild, nu = document.createElement("span");
    nu.textContent = c; cell.appendChild(nu);
    const opt = { duration: 300, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" };
    if (old) old.animate([{ transform: "none", opacity: 1 }, { transform: "translateY(-100%)", opacity: 0 }], opt).onfinish = () => old.remove();
    nu.animate([{ transform: "translateY(100%)", opacity: 0 }, { transform: "none", opacity: 1 }], opt);
  });
}

// ---------- C · « Série validée » devient une coche ----------
// Renvoie le temps à attendre avant d'afficher la récup (0 si pas d'animation)
function validateFx(x, j, s) {
  if (REDUCED || document.visibilityState !== "visible") return 0;
  const scr = $("stage").querySelector(".screen:not(.leave)");
  const btn = scr && scr.querySelector(".btn-main[data-act=validate]");
  if (!btn) return 0;
  // Largeur figée avant la transformation, pour qu'elle s'anime
  btn.style.width = btn.offsetWidth + "px"; void btn.offsetWidth; btn.style.width = "";
  btn.style.width = btn.getBoundingClientRect().width + "px"; void btn.offsetWidth;
  btn.classList.add("validated"); btn.style.width = "64px"; btn.setAttribute("aria-label", "Série enregistrée");
  btn.insertAdjacentHTML("beforeend", `<span class="vck" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24"><path pathLength="1" d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`);
  const chip = scr.querySelector(".sets .cur");
  if (chip) {
    chip.className = "ok"; chip.textContent = isPdc(x.k) ? s.r + " reps" : `${s.r} × ${fmtN(s.w)}`;
    chip.animate([{ transform: "scale(1)" }, { transform: "scale(1.1)" }, { transform: "scale(1)" }], { duration: 360, delay: 140, easing: SPRING_OUT });
  }
  return 420;
}

// ---------- E · Le nom de l'exercice suivant devient le titre ----------
// Avant de quitter la récup : où est le nom dans la carte « Ensuite » ?
function grabNextName() {
  const n = $("stage").querySelector(".screen:not(.leave) .nx-name");
  if (!n || REDUCED) return null;
  const r = n.getBoundingClientRect();
  return { x: r.left, y: r.top, h: r.height, fs: parseFloat(getComputedStyle(n).fontSize) || 17 };
}
// Après l'arrivée sur l'exercice : le nom vole jusqu'au titre puis le titre prend le relais
function flyToTitle(start) {
  const scr = $("stage").querySelector(".screen:not(.leave)");
  const title = scr && scr.querySelector(".s-title");
  if (!start || !title) return;
  const r = title.getBoundingClientRect(), cs = getComputedStyle(title), fs = parseFloat(cs.fontSize);
  const fly = document.createElement("div");
  fly.className = "fly-title d"; fly.setAttribute("aria-hidden", "true");
  fly.textContent = title.textContent;
  Object.assign(fly.style, { width: r.width + "px", fontSize: fs + "px", lineHeight: cs.lineHeight });
  document.body.appendChild(fly);
  title.style.opacity = "0";
  const k = start.fs / fs;
  const a = fly.animate([
    { transform: `translate(${start.x}px, ${start.y}px) scale(${k})`, opacity: 0.9 },
    { transform: `translate(${r.left}px, ${r.top}px) scale(1)`, opacity: 1 },
  ], { duration: 520, delay: 110, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "both" });
  const done = () => { title.style.opacity = ""; fly.remove(); };
  a.onfinish = done; setTimeout(done, 1000);
}
