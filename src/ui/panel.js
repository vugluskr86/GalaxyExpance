import { CLS, CLS_RU } from "../gen/starclass.js";
import { settings } from "./settings.js";

/* --- чёткий текст на слое подписей (общая утилита для сцен) --- */
export function toLbl(ctx, v){ return v/ctx.SCR*ctx.LW; }
export function lblText(ctx, txt, X, Y, col, size){
  const c = ctx.lctx;
  c.font = (size || 12) + "px 'Courier New', monospace";
  c.lineWidth = 3;
  c.strokeStyle = "rgba(4,5,12,0.85)";
  c.strokeText(txt, X, Y);
  c.fillStyle = col || "#c3cbee";
  c.fillText(txt, X, Y);
}

/** Панель справа: хлебные крошки, параметры активной сцены, вид, поиск, карточка. */
export class Panel {
  constructor(root, mgr){
    this.root = root;
    this.mgr = mgr;
    mgr.onChange = () => this.refresh();
    this.refresh();
  }
  h(html){ const d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; }
  refresh(){
    const mgr = this.mgr, scene = mgr.current;
    if (!scene) return;
    const root = this.root;
    root.innerHTML = "";

    /* крошки */
    const crumbs = mgr.crumbs();
    root.appendChild(this.h(
      `<div class="crumbs">${crumbs.map((c,i) =>
        i === crumbs.length-1 ? `<b>${c}</b>` : c).join(" → ")}</div>`
    ));

    /* параметры сцены */
    const spec = scene.panelSpec?.() || [];
    if (spec.length){
      root.appendChild(this.h(`<div class="sect">Параметры</div>`));
      for(const s of spec) this.buildControl(root, s, scene);
    }

    /* вид (глобальные настройки) */
    root.appendChild(this.h(`<div class="sect mt">Вид</div>`));
    this.buildControl(root, { kind:"range", label:"Пыль и газ", min:0, max:1, step:0.05,
      get:()=>settings.dust, set:v=>{settings.dust=v;},
      commit:()=>{ scene.onViewChange?.(); }, fmt:v=>v.toFixed(2) }, scene);
    this.buildControl(root, { kind:"select", label:"LOD-детализация",
      options:[["0","Низкая"],["1","Средняя"],["2","Высокая"]],
      get:()=>String(settings.lod), set:v=>{ settings.lod=parseInt(v); scene.onViewChange?.(); } }, scene);
    this.buildControl(root, { kind:"range", label:"Вращение галактик", min:0, max:0.06, step:0.005,
      get:()=>settings.rot, set:v=>{settings.rot=v;}, fmt:v=>v.toFixed(3) }, scene);
    const checks = this.h(`<div class="row checks"></div>`);
    for(const [key, label] of [["twinkle","Мерцание"],["labels","Подписи"]]){
      const l = this.h(`<label><input type="checkbox"> ${label}</label>`);
      const inp = l.querySelector("input");
      inp.checked = settings[key];
      inp.addEventListener("change", () => settings[key] = inp.checked);
      checks.appendChild(l);
    }
    root.appendChild(checks);

    /* легенда классов (если сцена её даёт) */
    if (spec.some(s => s.kind === "legend") && scene.legendData){
      root.appendChild(this.h(`<div class="sect mt">Классификация звёзд</div>`));
      const data = scene.legendData();
      const box = this.h(`<div></div>`);
      CLS.forEach((c, i) => {
        const btn = this.h(`<button class="clsbtn${data.filter === i ? " sel" : ""}">
          <span class="sw" style="background:${c.col}"></span>${c.c} — ${CLS_RU[c.c]}
          <small>${i === 7 ? "поле" : data.counts[i]}</small></button>`);
        btn.addEventListener("click", () => data.toggle(i));
        box.appendChild(btn);
      });
      if (data.quasars) box.appendChild(this.h(
        `<div class="clsinfo"><span class="sw" style="background:#8fd0ff"></span>квазары <small>${data.quasars}</small></div>`));
      if (data.smbh) box.appendChild(this.h(
        `<div class="clsinfo"><span class="sw" style="background:#f07d1a"></span>ЧД в ядре <small>1</small></div>`));
      root.appendChild(box);
    }

    /* поиск */
    if (scene.search){
      root.appendChild(this.h(`<div class="sect mt">Поиск по каталогу</div>`));
      const row = this.h(`<div class="seedrow"><input type="text" placeholder="Имя или код"><button>Найти</button></div>`);
      const inp = row.querySelector("input"), btn = row.querySelector("button");
      const list = this.h(`<div class="list"></div>`);
      const go = () => {
        const q = inp.value.trim();
        if (!q) return;
        const res = scene.search(q).slice(0, 20);
        list.innerHTML = res.length ? "" :
          "<small style='color:var(--muted)'>ничего не найдено</small>";
        for(const r of res){
          const b = this.h(`<button>${r.label} <small>${r.tag || ""}</small></button>`);
          b.addEventListener("click", r.run);
          list.appendChild(b);
        }
        if (res.length === 1) res[0].run();
      };
      btn.addEventListener("click", go);
      inp.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
      root.appendChild(row);
      root.appendChild(list);
    }

    /* карточка выбранного + главное действие */
    root.appendChild(this.h(`<div class="sect mt">Выбранный объект</div>`));
    const info = scene.selectedInfo?.() || { name:"—", detail:"" };
    root.appendChild(this.h(
      `<div class="selbox"><b>${info.name}</b><small>${info.detail}</small></div>`));
    const prim = scene.primary?.();
    if (prim){
      const b = this.h(`<button class="big">${prim.label}</button>`);
      b.addEventListener("click", prim.run);
      root.appendChild(b);
    }

    root.appendChild(this.h(
      `<div class="hint">Клик — выбрать · повторный клик — войти · колесо — масштаб ·
       перетаскивание — полёт. Вся вселенная детерминирована зерном кластера:
       коды GAL / NAV / FLD / QSO / SMBH кодируют путь в генераторе.</div>`));
  }
  buildControl(root, s, scene){
    if (s.kind === "seed"){
      const row = this.h(`<div class="row"><label>${s.label}</label>
        <div class="seedrow"><input type="number"><button title="Случайное зерно">⚄</button></div></div>`);
      const inp = row.querySelector("input"), dice = row.querySelector("button");
      inp.value = s.get();
      inp.addEventListener("change", () => { s.set(parseInt(inp.value)||0); this.refresh(); });
      dice.addEventListener("click", () => { s.set(Math.floor(Math.random()*999999)); this.refresh(); });
      root.appendChild(row);
    } else if (s.kind === "range"){
      const row = this.h(`<div class="row"><label>${s.label} <span class="out"></span></label>
        <input type="range" min="${s.min}" max="${s.max}" step="${s.step}"></div>`);
      const inp = row.querySelector("input"), out = row.querySelector(".out");
      const show = v => out.textContent = s.fmt ? s.fmt(v) : v;
      inp.value = s.get(); show(s.get());
      inp.addEventListener("input", () => { const v = parseFloat(inp.value); s.set(v); show(v); });
      if (s.commit) inp.addEventListener("change", () => { s.commit(); this.refresh(); });
      root.appendChild(row);
    } else if (s.kind === "select"){
      const row = this.h(`<div class="row"><label>${s.label}</label><select>
        ${s.options.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div>`);
      const sel = row.querySelector("select");
      sel.value = s.get();
      sel.addEventListener("change", () => { s.set(sel.value); this.refresh(); });
      root.appendChild(row);
    } else if (s.kind === "action"){
      const b = this.h(`<button class="big" style="margin-bottom:10px">${s.label}</button>`);
      b.addEventListener("click", s.run);
      root.appendChild(b);
    } else if (s.kind === "rows"){
      const box = this.h(`<div class="list" style="max-height:none"></div>`);
      if (!s.items.length) box.innerHTML =
        `<small style="color:var(--muted)">${s.empty || "пусто"}</small>`;
      for(const r of s.items){
        const row = this.h(`<div class="itemrow${r.sel ? " sel" : ""}"></div>`);
        const head = this.h(`<button class="itemhead"><span class="itag">${r.tag || ""}</span>` +
          `${r.label}<small>${r.note || ""}</small></button>`);
        head.addEventListener("click", () => { r.run?.(); this.refresh(); });
        row.appendChild(head);
        if (r.sub) row.appendChild(this.h(`<div class="itemsub">${r.sub}</div>`));
        if (r.actions && r.actions.length){
          const acts = this.h(`<div class="itemacts"></div>`);
          for(const a of r.actions){
            const b = this.h(`<button${a.warn ? ' class="warn"' : ""}>${a.label}</button>`);
            b.addEventListener("click", e => { e.stopPropagation(); a.run(); this.refresh(); });
            acts.appendChild(b);
          }
          row.appendChild(acts);
        }
        box.appendChild(row);
      }
      root.appendChild(box);
    } else if (s.kind === "readout"){
      root.appendChild(this.h(
        `<div class="selbox"><b>${s.label}</b><small>${s.value}</small></div>`));
    } else if (s.kind === "sect"){
      root.appendChild(this.h(`<div class="sect mt">${s.label}</div>`));
    } else if (s.kind === "buttons"){
      const row = this.h(`<div class="btns" style="margin-bottom:8px"></div>`);
      for(const b of s.items){
        const el = this.h(`<button${b.sel ? ' class="clsbtn sel"' : ""}>${b.label}</button>`);
        el.addEventListener("click", () => { b.run(); this.refresh(); });
        row.appendChild(el);
      }
      root.appendChild(row);
    } else if (s.kind === "check"){
      const row = this.h(`<div class="row checks"><label><input type="checkbox"> ${s.label}</label></div>`);
      const inp = row.querySelector("input");
      inp.checked = s.get();
      inp.addEventListener("change", () => { s.set(inp.checked); this.refresh(); });
      root.appendChild(row);
    }
  }
}
