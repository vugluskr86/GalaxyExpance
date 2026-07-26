import { SceneManager } from "./scenes/manager.js";
import { ClusterScene } from "./scenes/cluster.js";
import { Cluster } from "./gen/cluster.js";
import { Panel } from "./ui/panel.js";
import { attachInput } from "./core/input.js";
import { settings } from "./ui/settings.js";

const SCR = 420;
const scene = document.getElementById("scene");
scene.width = SCR; scene.height = SCR;
const sctx = scene.getContext("2d");

const lbl = document.getElementById("labels");
const lctx = lbl.getContext("2d");
const dpr = Math.min(2, window.devicePixelRatio || 1);
const ctx = { scene, sctx, lbl, lctx, SCR, LW: 560 };

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
new Panel(document.getElementById("panel"), mgr);
mgr.push(new ClusterScene(new Cluster(31337)));

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
scene.addEventListener("pointerleave", () => tooltip.classList.add("hidden"));

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

/* полётные клавиши → активная сцена (по e.code, независимо от раскладки) */
const FLIGHT_CODES = new Set(["KeyW","KeyA","KeyS","KeyD","KeyX","KeyC","KeyF"]);
document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (FLIGHT_CODES.has(e.code)){
    e.preventDefault();
    mgr.current?.onKey?.(e.code, true);
  }
});
document.addEventListener("keyup", e => {
  if (FLIGHT_CODES.has(e.code)) mgr.current?.onKey?.(e.code, false);
});

const SPEED_PRESETS = { "0": 1, "1": 1, "2": 2, "3": 5, "4": 10 };
const SPEED_STEPS = [0, 1, 2, 5, 10];
document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (e.key === "[" || e.key === "]"){
    e.preventDefault();
    let idx = SPEED_STEPS.indexOf(settings.speed);
    if (idx < 0) idx = SPEED_STEPS.indexOf(1);
    const next = idx + (e.key === "[" ? -1 : 1);
    if (next >= 0 && next < SPEED_STEPS.length) settings.speed = SPEED_STEPS[next];
  } else if (e.key === "Backspace" || e.key === "0"){
    e.preventDefault();
    settings.speed = 1;
  } else if (SPEED_PRESETS[e.key] !== undefined){
    e.preventDefault();
    settings.speed = SPEED_PRESETS[e.key];
  }
});

const npTitle = document.getElementById("npTitle");
const npInfo = document.getElementById("npInfo");
const btnBack = document.getElementById("btnBack");

let last = performance.now();
function loop(nowMs){
  const rawDt = Math.min(0.1, (nowMs - last)/1000);
  last = nowMs;
  const dt = rawDt * settings.speed;
  const t = nowMs/1000;
  mgr.update(dt, t);
  mgr.draw(t);
  const st = mgr.current?.status?.();
  if (st){ npTitle.textContent = st.title; npInfo.textContent = st.info + " · ×" + settings.speed; }
  btnBack.classList.toggle("hidden", mgr.stack.length <= 1);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
