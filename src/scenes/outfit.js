import { SLOTS, SLOT_RU, itemStatLines } from "../game/items.js";
import { FloatingItem } from "../game/inventory.js";
import { primaryState } from "../game/physics.js";
import { fmtDv, fmtMass, fmtSpeed, fmtTime, fmtDist, DU_M } from "../game/units.js";
import { lblText } from "../ui/panel.js";
import { openComputerEditor } from "./computer.js";

/** Экран корабля: слоты, инвентарь, характеристики.
 *  Компоновка как в оснастке Elite: слева схема с точками подвески,
 *  справа список модулей и сводка характеристик. */
export class OutfitScene {
  constructor(sys){
    this.sys = sys;
    this.crumb = "Корабль";
    this.slot = "engine";        // выбранный слот
    this.sel = null;             // выбранный предмет инвентаря
    this.editingItem = null;     // предмет, чьи внутренние слоты сейчас открыты
    this.msg = "";
  }
  get prop(){ return this.sys.playerShip?.prop; }
  update(dt){ this.sys.update(dt); }

  /* ---------- схема корабля ---------- */
  draw(t){
    const { sctx, SCR } = this.ctx;
    const cx = SCR/2, cy = SCR/2 - 10;
    /* корпус */
    const hullCol = "#3a4a8a", edge = "#6fb7ff";
    const put = (x, y, w, h, c) => { sctx.fillStyle = c; sctx.fillRect(Math.round(x), Math.round(y), w, h); };
    for(let i=0;i<46;i++){
      const w = Math.round(10 + 46*Math.sin(Math.PI*i/46));
      put(cx - w/2, cy - 60 + i*2, w, 2, i < 6 ? edge : hullCol);
    }
    put(cx - 30, cy + 26, 60, 6, hullCol);
    put(cx - 44, cy + 28, 14, 4, hullCol);
    put(cx + 30, cy + 28, 14, 4, hullCol);
    /* сопла */
    const burn = Math.floor(t*8) % 2;
    put(cx - 12, cy + 32, 8, 5, "#2a3260");
    put(cx + 4,  cy + 32, 8, 5, "#2a3260");
    if (this.slot === "engine" && burn){
      put(cx - 11, cy + 37, 6, 3, "#ffd166");
      put(cx + 5,  cy + 37, 6, 3, "#ffd166");
    }
    /* точки подвески */
    const pts = {
      hull:     [cx, cy - 6],
      engine:   [cx, cy + 34],
      tank:     [cx, cy + 14],
      scoop:    [cx - 38, cy + 30],
      computer: [cx + 36, cy - 18]
    };
    for(const s of SLOTS){
      const [x, y] = pts[s.id];
      const on = this.slot === s.id;
      const filled = !!this.prop?.slots[s.id];
      sctx.fillStyle = on ? "#ffd166" : (filled ? "#6fb7ff" : "#57525f");
      sctx.fillRect(Math.round(x)-3, Math.round(y)-3, 7, 7);
      sctx.fillStyle = "#04050c";
      sctx.fillRect(Math.round(x)-1, Math.round(y)-1, 3, 3);
      if (on){
        const blink = Math.floor(t*4) % 2;
        if (blink){
          sctx.fillStyle = "#ffd166";
          sctx.fillRect(Math.round(x)-6, Math.round(y)-6, 3, 1);
          sctx.fillRect(Math.round(x)-6, Math.round(y)-6, 1, 3);
          sctx.fillRect(Math.round(x)+4, Math.round(y)+4, 3, 1);
          sctx.fillRect(Math.round(x)+6, Math.round(y)+4, 1, 3);
        }
      }
      this._pts = pts;
    }
  }
  drawLabels(){
    const p = this.prop;
    if (!p) return;
    const L = this.ctx.LW, k = L/this.ctx.SCR;
    const SCR = this.ctx.SCR;
    const y0 = SCR - 80;
    for(const s of SLOTS){
      const it = p.slots[s.id];
      const on = this.slot === s.id;
      lblText(this.ctx, s.name + ": " + (it ? it.name : "— пусто —"),
        12, y0 + SLOTS.indexOf(s)*14, on ? "#ffd166" : "#8d95c9", 11);
    }
    if (this.msg) lblText(this.ctx, this.msg, 12, SCR - 14, "#7ee08a", 11);
  }

  /* ---------- действия ---------- */
  /** Выбросить предмет в космос (или положить на грунт, если сели). */
  dropToSpace(item){
    const sh = this.sys.playerShip;
    if (!sh) return;
    const ps = primaryState(this.sys, sh.primary);
    if (!ps) return;
    /* контейнер уходит на орбиту с состоянием корабля плюс лёгкий толчок */
    const kick = 0.0008;
    const a = Math.random()*Math.PI*2;
    const f = new FloatingItem(item, sh.primary,
      sh.rx, sh.ry, sh.rvx + Math.cos(a)*kick, sh.rvy + Math.sin(a)*kick);
    if (sh.mode === "landed"){ f.landed = { ...sh.primary }; f.rvx = 0; f.rvy = 0; }
    this.sys.cargoField.push(f);
    this.msg = "«" + item.name + "» отправлен за борт";
  }
  installFromInv(item){
    const p = this.prop;
    if (!p) return;
    p.inventory.remove(item);
    const old = p.install(item);
    if (old) p.inventory.add(old);
    this.slot = item.slot;
    this.sel = null;
    this.msg = "установлено: " + item.name;
  }
  uninstall(slot){
    const p = this.prop;
    const it = p?.uninstall(slot);
    if (it){ p.inventory.add(it); this.msg = "снято: " + it.name; }
  }
  installInto(host, item){
    const p = this.prop;
    if (!p || !host?.accepts(item)) return;
    p.inventory.remove(item);
    const old = host.install(item);
    if (old) p.inventory.add(old);
    this.msg = host.name + ": установлен " + item.name;
  }
  uninstallFrom(host, slot){
    const item = host?.uninstall(slot);
    if (item){
      this.prop.inventory.add(item);
      this.msg = host.name + ": снят " + item.name;
    }
  }
  editItem(item){
    this.editingItem = item;
    this.crumb = "Корабль › " + item.name;
    this.msg = "";
  }
  closeItemEditor(){
    this.editingItem = null;
    this.crumb = "Корабль";
    this.msg = "";
    this.mgr?.onChange?.();
  }
  /** Перенос груза между трюмом и инвентарём (инвентарь = ручная кладь). */
  stow(item){
    const p = this.prop;
    if (p.cargoMass + item.mass > p.cargoCap){ this.msg = "трюм переполнен"; return; }
    p.inventory.remove(item);
    p.cargo.add(item);
    this.msg = "в трюм: " + item.name;
  }
  unstow(item){
    const p = this.prop;
    p.cargo.remove(item);
    p.inventory.add(item);
  }

  /* ---------- панель ---------- */
  status(){
    const p = this.prop;
    if (!p) return { title:"Корабль", info:"нет активного корабля" };
    return {
      title: "Экипировка · " + p.hull.name,
      info: "масса " + fmtMass(p.mass) + " · ΔV " + fmtDv(p.deltaV) +
        " · трюм " + p.cargoMass.toFixed(1) + "/" + p.cargoCap + " т" +
        " · топливо " + p.fuel.toFixed(1) + "/" + p.fuelCap + " т"
    };
  }
  selectedInfo(){
    const p = this.prop;
    if (!p) return { name:"—", detail:"" };
    const sh = this.sys.playerShip;
    const ps = primaryState(this.sys, sh.primary);
    const g = ps && ps.mu > 0 ? ps.mu/(ps.bodyR*ps.bodyR) : 0;
    return {
      name: p.hull.name + " · " + p.hull.tag,
      detail: "масса " + fmtMass(p.mass) + " (сухая " + fmtMass(p.dryMass) + ")" +
        "<br>тяга " + p.engine.thrust + " кН · Iₛₚ " + p.engine.isp + " с · TWR " +
        (g > 0 ? p.twr(g).toFixed(2) : "—") +
        "<br>ускорение " + p.accelFullMs.toFixed(2) + " м/с² · ΔV " + fmtDv(p.deltaV) +
        "<br>захват: " + (p.scoop ? p.scoop.name : "не установлен")
    };
  }
  primary(){
    return this.editingItem
      ? { label:"← к слотам корабля", run: () => this.closeItemEditor() }
      : { label:"← в полёт", run: () => this.mgr.pop() };
  }

  itemEditorSpec(host){
    const p = this.prop;
    if (!p || !host) return [];
    const spec = [
      { kind:"sect", label:"Слоты · " + host.name },
      { kind:"rows", items: host.slotDefs.map(s => {
        const it = host.slots[s.id];
        return {
          tag: it ? it.tag : "—",
          label: s.name,
          note: it ? it.name : "пусто",
          sub: it ? itemStatLines(it.def).join(" · ") : null,
          actions: it ? [
            { label:"Снять", run:() => this.uninstallFrom(host, s.id) },
            { label:"Выбросить", warn:true, run:() => {
              const x = host.uninstall(s.id);
              if (x) this.dropToSpace(x);
            } }
          ] : []
        };
      })}
    ];

    if (host.slot === "computer" && host.memory){
      spec.push({ kind:"action", label:"Включить компьютер", run:() => {
        try {
          const terminal=window._pixelCosmosTerminal || null;
          host.runtime.boot(terminal);
          terminal?.canvas?.focus();
          this.msg = "BIOS: операционная система загружена";
        } catch (err){ this.msg = err.message; }
      } });
      spec.push({ kind:"action", label:"Программировать", run:() => openComputerEditor(host) });
    }

    const components = p.inventory.items.filter(it => host.accepts(it));
    spec.push({ kind:"sect", label:"Комплектующие из инвентаря" });
    spec.push({
      kind:"rows",
      empty:"нет совместимых комплектующих в инвентаре",
      items: components.map(it => ({
        tag: it.tag,
        label: it.name,
        note: SLOT_RU[it.slot],
        sub: itemStatLines(it.def).join(" · "),
        actions:[
          { label:"Установить", run:() => this.installInto(host, it) },
          { label:"Выбросить", warn:true, run:() => {
            p.inventory.remove(it);
            this.dropToSpace(it);
          } }
        ]
      }))
    });
    return spec;
  }

  panelSpec(){
    const p = this.prop;
    if (!p) return [];
    if (this.editingItem){
      const stillInstalled = Object.values(p.slots).includes(this.editingItem);
      if (!stillInstalled){ this.closeItemEditor(); }
      else return this.itemEditorSpec(this.editingItem);
    }
    const spec = [];

    /* --- слоты --- */
    spec.push({ kind:"sect", label:"Слоты" });
    spec.push({ kind:"rows", items: SLOTS.map(s => {
      const it = p.slots[s.id];
      const acts = [];
      if (it?.slotDefs.length){
        acts.push({ label:"Редактировать", run:() => this.editItem(it) });
      }
      if (it && s.id !== "hull"){
        acts.push({ label:"Снять", run:() => this.uninstall(s.id) });
        acts.push({ label:"Выбросить", warn:true, run:() => {
          const x = p.uninstall(s.id);
          if (x) this.dropToSpace(x);
        } });
      }
      return {
        tag: it ? it.tag : "—",
        label: s.name,
        note: it ? it.name : "пусто",
        sub: it ? itemStatLines(it.def).join(" · ") : null,
        sel: this.slot === s.id,
        actions: acts,
        run: () => { this.slot = s.id; this.sel = null; }
      };
    })});

    /* Внутренние слоты открываются отдельной кнопкой «Редактировать». */
    const computer = p.slots.computer;

    /* --- совместимые модули из инвентаря --- */
    const compat = p.inventory.bySlot(this.slot);
    spec.push({ kind:"sect", label:"Доступно для слота «" + SLOT_RU[this.slot] + "»" });
    spec.push({ kind:"rows", empty:"нет подходящих модулей в инвентаре",
      items: compat.map(it => ({
        tag: it.tag, label: it.name,
        sub: itemStatLines(it.def).join(" · "),
        actions:[
          { label:"Установить", run:() => this.installFromInv(it) },
          { label:"Выбросить", warn:true, run:() => {
              p.inventory.remove(it); this.dropToSpace(it); } }
        ]
      })) });

    /* --- инвентарь --- */
    spec.push({ kind:"sect", label:"Инвентарь · " + p.inventory.massTotal.toFixed(1) + " т" });
    spec.push({ kind:"rows", empty:"инвентарь пуст",
      items: p.inventory.items.map(it => ({
        tag: it.tag,
        label: it.name + (it.qty > 1 ? " ×" + it.qty : ""),
        note: it.mass.toFixed(1) + " т",
        actions: [
          ...(it.slot !== "cargo" && Object.hasOwn(p.slots, it.slot)
              ? [{ label:"Установить", run:() => this.installFromInv(it) }]
              : it.slot === "cargo"
              ? [{ label:"В трюм", run:() => this.stow(it) }]
              : computer?.accepts(it)
              ? [{ label:"В компьютер", run:() => this.installInto(computer, it) }]
              : []),
          { label:"Выбросить", warn:true, run:() => {
              p.inventory.remove(it); this.dropToSpace(it); } }
        ]
      })) });

    /* --- трюм --- */
    spec.push({ kind:"sect", label:"Трюм · " + p.cargoMass.toFixed(1) + " / " + p.cargoCap + " т" });
    spec.push({ kind:"rows", empty:"трюм пуст",
      items: p.cargo.items.map(it => ({
        tag: it.tag,
        label: it.name + (it.qty > 1 ? " ×" + it.qty : ""),
        note: it.mass.toFixed(1) + " т",
        actions:[
          { label:"В инвентарь", run:() => this.unstow(it) },
          { label:"Выбросить", warn:true, run:() => {
              p.cargo.remove(it); this.dropToSpace(it); } }
        ]
      })) });
    return spec;
  }
}
