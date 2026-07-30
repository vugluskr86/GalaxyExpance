import { SceneManager } from "./scenes/manager.js";
import { ClusterScene } from "./scenes/cluster.js";
import { Cluster } from "./gen/cluster.js";
import { GalaxyScene } from "./scenes/galaxy.js";
import { SystemScene } from "./scenes/system.js";
import { Galaxy, SECT } from "./gen/galaxy.js";
import { Panel } from "./ui/panel.js";
import { attachInput } from "./core/input.js";
import { settings, warpStep } from "./ui/settings.js";
import { toggleConsole } from "./game/console.js";
import { ComputerTerminal } from "./game/terminal.js";
import { WorldSave, landedBodyRef, loadWorld } from "./game/savegame.js";
import { LandingScene } from "./scenes/landing.js";
import { applyDocument, t, tr } from "./i18n/index.js";

const SCR = 420;
const scene = document.getElementById("scene");
scene.width = SCR; scene.height = SCR;
const sctx = scene.getContext("2d");

const lbl = document.getElementById("labels");
const lctx = lbl.getContext("2d");
const dpr = Math.min(2, window.devicePixelRatio || 1);
const ctx = { scene, sctx, lbl, lctx, SCR, LW: 560 };
applyDocument();
window.addEventListener("pixel-cosmos:locale", () => applyDocument());
const bootSplash=document.getElementById("bootSplash");
let bootDismissed=!bootSplash;
function dismissBootSplash(event){
  if(bootDismissed)return;bootDismissed=true;bootSplash?.classList.add("hidden");bootSplash?.setAttribute("aria-hidden","true");
  event?.preventDefault?.();event?.stopImmediatePropagation?.();
}
bootSplash?.addEventListener("pointerdown",dismissBootSplash);
bootSplash?.addEventListener("click",dismissBootSplash);
/* Capture prevents the first keypress from also steering or firing the ship. */
document.addEventListener("keydown",event=>{if(!bootDismissed)dismissBootSplash(event);},true);
window._pixelCosmosTerminal = new ComputerTerminal(document.getElementById("computerTerminal"));
const terminalFrame=document.querySelector(".terminal-frame");
function activePropulsion(scene){
  return scene?.prop || scene?.playerShip?.prop || scene?.sys?.playerShip?.prop || null;
}
/** A terminal is a fitted, cabled item, not a permanently available HUD.
 * The single canvas represents whichever terminal the player has selected. */
function syncTerminalVisibility(){
  const prop=activePropulsion(mgr?.current);
  terminalFrame?.classList.toggle("hidden",!!prop&&!prop.hasConnectedTerminal?.());
}

function sizeLabels(){
  const rect = lbl.parentElement.getBoundingClientRect();
  ctx.LW = rect.width;
  lbl.width = Math.round(rect.width*dpr);
  lbl.height = Math.round(rect.height*dpr);
  lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sizeLabels();
window.addEventListener("resize", sizeLabels);

const mgr = new SceneManager(ctx);
window._pixelCosmosMgr = mgr;
new Panel(document.getElementById("panel"), mgr);
const toast=document.getElementById("gameToast");
let toastTimer=null;
mgr.onNotice=notice=>{
  if(!toast)return;
  clearTimeout(toastTimer);
  toast.textContent=tr(notice.message);
  toast.dataset.level=notice.level;
  toast.classList.remove("hidden");
  toastTimer=setTimeout(()=>toast.classList.add("hidden"),notice.timeout);
};
/* A last-resort visible error for exceptions outside a panel callback.  The
 * console keeps technical details for debugging, while the player receives a
 * concise, non-technical notification. */
window.addEventListener("error",()=>mgr.notify(t("ui.actionError"),{level:"error"}));
window.addEventListener("unhandledrejection",()=>mgr.notify(t("ui.actionError"),{level:"error"}));

/** Поместить игрока в случайную систему со старта. */
function startInSystem(){
  const world=loadWorld();
  const seed = world?.data.clusterSeed ?? Math.floor(Math.random() * 0xFFFFFFFF);
  const cluster = new Cluster(seed);
  const galaxyIndex=world?.data.galaxyIndex ?? Math.floor(Math.random() * cluster.galaxies.length);
  const galDef = cluster.galaxies[galaxyIndex] || cluster.galaxies[0];
  const galaxy = new Galaxy(galDef.def);
  const savedStar=world?.data.location?.star;
  const sector=savedStar&&galaxy.sectorStars(Math.floor(savedStar.x/SECT),Math.floor(savedStar.y/SECT));
  const special=[...galaxy.quasars,galaxy.smbhObj()].filter(Boolean);
  const star=special.find(candidate=>candidate.kind===savedStar?.kind&&candidate.x===savedStar?.x&&candidate.y===savedStar?.y) || galaxy.beacons.find(candidate=>candidate.x===savedStar?.x&&candidate.y===savedStar?.y) || (sector||[]).find(candidate=>candidate.x===savedStar?.x&&candidate.y===savedStar?.y) || galaxy.beacons[Math.floor(Math.random() * galaxy.beacons.length)];
  if (!star) return;
  const game=world||new WorldSave({clusterSeed:seed,galaxyIndex});
  game.data.clusterSeed=seed;game.data.galaxyIndex=galaxyIndex;game.restorePlayer();

  const gscene = new GalaxyScene(galDef,game);
  const sys = new SystemScene(galaxy, star,{world:game});

  mgr.push(new ClusterScene(cluster,game));
  mgr.push(gscene);
  mgr.push(sys);

  /* The system owns the physics state, while LandingScene is the active view.
     Restore that view after the ship itself has been restored, otherwise a
     reload on a planet exposed an incorrect new-landing route in SystemScene. */
  const landedOn=landedBodyRef(sys.playerShip);
  if(landedOn){
    const stats=sys.statsOf(landedOn);
    if(stats)mgr.push(new LandingScene(sys,landedOn,stats));
  }

  /* выбрать случайную планету или спутник */
  if (!world && sys.S && sys.S.planets.length){
    const pi = Math.floor(Math.random() * sys.S.planets.length);
    const p = sys.S.planets[pi];
    const useMoon = p.moonList.length > 0 && Math.random() > 0.5;
    const sel = useMoon
      ? { kind: "moon", i: pi, j: Math.floor(Math.random() * p.moonList.length) }
      : { kind: "planet", i: pi, j: 0 };
    sys.sel = sel;
    sys.playerShip?.fsdTo(sel, sys.orbitAlt);
  }
  mgr.returnToShip=()=>{
    const existing=mgr.stack.find(scene=>scene instanceof SystemScene);
    if(existing){
      const index=mgr.stack.indexOf(existing);
      mgr.setStack(mgr.stack.slice(0,index+1));
      return;
    }
    /* The system scene was popped while browsing the map. Recreate it from
     * the persisted ship location, rather than navigating to the map choice. */
    const shipCluster=new Cluster(game.data.clusterSeed);
    const shipGalaxyIndex=game.data.galaxyIndex;
    const shipGalDef=shipCluster.galaxies[shipGalaxyIndex]||shipCluster.galaxies[0];
    if(!shipGalDef) return;
    const shipGalaxy=new Galaxy(shipGalDef.def);
    const location=game.data.location?.star;
    const sector=location&&shipGalaxy.sectorStars(Math.floor(location.x/SECT),Math.floor(location.y/SECT));
    const special=[...shipGalaxy.quasars,shipGalaxy.smbhObj()].filter(Boolean);
    const shipStar=special.find(candidate=>candidate.kind===location?.kind&&candidate.x===location?.x&&candidate.y===location?.y)
      ||shipGalaxy.beacons.find(candidate=>candidate.x===location?.x&&candidate.y===location?.y)
      ||(sector||[]).find(candidate=>candidate.x===location?.x&&candidate.y===location?.y)
      ||shipGalaxy.beacons[0];
    if(!shipStar) return;
    const restoredSystem=new SystemScene(shipGalaxy,shipStar,{world:game});
    const restoredPath=[
      new ClusterScene(shipCluster,game),
      new GalaxyScene(shipGalDef,game),
      restoredSystem
    ];
    const restoredLanding=landedBodyRef(restoredSystem.playerShip);
    if(restoredLanding){
      const stats=restoredSystem.statsOf(restoredLanding);
      if(stats)restoredPath.push(new LandingScene(restoredSystem,restoredLanding,stats));
    }
    mgr.setStack(restoredPath);
  };
  const persist=()=>{const active=[...mgr.stack].reverse().find(scene=>scene instanceof SystemScene);if(active)game.capture(active,game.data.galaxyIndex);game.persist();};
  window.addEventListener("beforeunload",persist,{once:true});
  document.addEventListener("visibilitychange",()=>{if(document.hidden)persist();});
}
startInSystem();

/* тултип характеристик планет */
const tooltip = document.createElement("div");
tooltip.className = "tooltip hidden";
scene.parentElement.appendChild(tooltip);
scene.addEventListener("pointermove", e => {
  const html = (() => {
    if (!mgr.current?.onHover) return null;
    const rect = scene.getBoundingClientRect();
    return mgr.current.onHover(
      (e.clientX - rect.left)/rect.width*SCR,
      (e.clientY - rect.top)/rect.height*SCR);
  })();
  if (html){
    tooltip.innerHTML = html;
    tooltip.classList.remove("hidden");
    const rect = scene.parentElement.getBoundingClientRect();
    let tx = e.clientX - rect.left + 14, ty = e.clientY - rect.top + 14;
    if (tx + 240 > rect.width) tx = e.clientX - rect.left - 254;
    if (ty + 140 > rect.height) ty = e.clientY - rect.top - 150;
    tooltip.style.left = tx + "px";
    tooltip.style.top = ty + "px";
  } else tooltip.classList.add("hidden");
});
scene.addEventListener("pointerleave", () => {
  tooltip.classList.add("hidden");
  mgr.current?.clearHover?.();
});

attachInput(scene, {
  onTap: (mx, my) => mgr.current?.onTap?.(mx, my),
  onDragStart: () => mgr.current?.onDragStart?.(),
  onDragMove: (dx, dy, st) => { if (st !== undefined) mgr.current?.onDragMove?.(dx, dy, st); },
  onWheel: (mx, my, d) => mgr.current?.onWheel?.(mx, my, d)
});

document.getElementById("btnBack").addEventListener("click", () => mgr.pop());
document.getElementById("btnFit").addEventListener("click", () => mgr.current?.fit?.());
document.getElementById("btnZin").addEventListener("click", () => mgr.current?.zoomBy?.(1.35));
document.getElementById("btnZout").addEventListener("click", () => mgr.current?.zoomBy?.(1/1.35));

/* --- клавиатура: пилотирование и ускорение времени --- */
const FLIGHT_CODES = new Set([
  "KeyW","KeyA","KeyS","KeyD","KeyX","KeyZ","KeyC","KeyF","KeyH","KeyM","KeyN","Space","Digit1","Digit2","Digit3","Digit4","Digit5",
  "KeyT","KeyG","KeyB","ShiftLeft","ControlLeft"
]);
document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (e.code === "BracketLeft" || e.code === "BracketRight"){
    e.preventDefault();
    warpStep(e.code === "BracketRight" ? 1 : -1);
    return;
  }
  if (e.code === "Backspace"){ e.preventDefault(); settings.speed = 1; return; }
  if (e.code === "Backquote"){           // ~
    e.preventDefault();
    toggleConsole();
    return;
  }
  if (FLIGHT_CODES.has(e.code)){
    e.preventDefault();
    mgr.current?.onKey?.(e.code, true);
  }
});
document.addEventListener("keyup", e => {
  if (FLIGHT_CODES.has(e.code)) mgr.current?.onKey?.(e.code, false);
});

const npTitle = document.getElementById("npTitle");
const npInfo = document.getElementById("npInfo");
const npPerf = document.getElementById("npPerf");
const btnBack = document.getElementById("btnBack");

let last = performance.now();
/* ── Профайлинг-аккумуляторы (сброс каждые ~1 сек) ── */
let perfFrames = 0, perfUpdate = 0, perfDraw = 0, perfLastDump = performance.now();
const PERF_DUMP_INTERVAL = 1000;
function loop(nowMs){
  const rawDt = Math.min(0.1, (nowMs - last)/1000);
  last = nowMs;
  /* варп ограничивается сценой: под тягой физика идёт мелким шагом */
  const cap = mgr.current?.warpLimit?.() ?? Infinity;
  const warp = Math.min(settings.speed, cap);
  const dt = rawDt * warp;
  const t = nowMs/1000;
  const t0 = performance.now();
  mgr.update(dt, t);
  const t1 = performance.now();
  syncTerminalVisibility();
  mgr.draw(t);
  const t2 = performance.now();
  /* накопление метрик */
  perfFrames++; perfUpdate += t1 - t0; perfDraw += t2 - t1;
  if (nowMs - perfLastDump >= PERF_DUMP_INTERVAL) {
    const fps = Math.round(perfFrames / ((nowMs - perfLastDump) / 1000));
    const avgU = (perfUpdate / perfFrames).toFixed(1);
    const avgD = (perfDraw / perfFrames).toFixed(1);
    if (npPerf) npPerf.textContent = `FPS:${fps} | upd:${avgU}ms | draw:${avgD}ms`;
    perfFrames = 0; perfUpdate = 0; perfDraw = 0; perfLastDump = nowMs;
  }
  const st = mgr.current?.status?.();
  if (st){
    npTitle.textContent = tr(st.title);
    npInfo.textContent = tr(st.info) + " · " + tr("время") + " ×" + warp.toLocaleString("ru-RU") +
      (warp < settings.speed ? " (варп ограничен)" : "");
  }
  btnBack.classList.toggle("hidden", mgr.stack.length <= 1);
  /* кнопки зума/обзора скрыты на экране посадки */
  const cname = mgr.current?.constructor?.name;
  const hideZoom = cname === "LandingScene" || cname === "OutfitScene";
  document.getElementById("btnZin").classList.toggle("hidden", hideZoom);
  document.getElementById("btnZout").classList.toggle("hidden", hideZoom);
  document.getElementById("btnFit").classList.toggle("hidden", hideZoom);
  document.querySelector(".nameplate").classList.toggle("hidden", cname === "OutfitScene");
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
