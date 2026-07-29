import { buildSystem, stepSystem, lightAt, LETTERS, ROM } from "../gen/system.js";
import { renderPlanetLod } from "../gen/planet.js";
import { renderStar } from "../gen/star.js";
import { renderBH } from "../gen/blackhole.js";
import { CLS } from "../gen/starclass.js";
import { PT_RU } from "../gen/planet.js";
import { BodyScene } from "./body.js";
import { lblText, toLbl } from "../ui/panel.js";
import { bakeSystemNebula, NEB_SPAN } from "../gen/nebula.js";
import { LandingScene } from "./landing.js";
import { Ship, makeNpcs } from "../game/ship.js";
import { primaryState, elements, conicPath, surfaceG, muOf, soiOf, MU_SUN } from "../game/physics.js";
import { ENGINES, TANKS } from "../game/propulsion.js";
import { planCircularize, planHohmann, hohmannBudget, orbitAfterNode,
         stateAtNode, ManeuverNode } from "../game/maneuver.js";
import { fmtSpeed, fmtDist, fmtDv, fmtTime, fmtMass, fmtAcc, DU_M } from "../game/units.js";
import { OutfitScene } from "./outfit.js";
import { FloatingItem } from "../game/inventory.js";
import { makeItem } from "../game/items.js";
import { timeToApo, timeToPeri, timeToNu, pointAt } from "../game/physics.js";
import { player } from "../game/player.js";
import { planetStats, smallBodyStats, statsTooltipHTML, starTooltipHTML } from "../game/stats.js";
import { execCommand } from "../game/console.js";
import { WeaponProjectile } from "../game/weapons.js";
/** Максимальный зум: планета на весь экран (как на уровне «Тело»). */
const ZOOM_MAX = 12;
/** Минимальный зум: вся система видна целиком. */
const ZOOM_MIN = 0.15;
/** Зум по умолчанию при входе в систему. */
const ZOOM_DEFAULT = 0.3;
/** Коэффициент шага колёсика мыши. */
const ZOOM_WHEEL_STEP = 1.18;

export class SystemScene {
  constructor(galaxy, star, options={}){
    this.g = galaxy;
    this.star = star;
    this.crumb = "Система";
    this.S = buildSystem(galaxy, star);
    this.sel = this.S.planets.length ? { kind:"planet", i:0, j:0 } : null;
    this.cam = { x:0, y:0 };
    this.follow = false;
    this.orbitAlt = 20;
    this.nebCvs = this.S.neb ? bakeSystemNebula(this.S.neb) : null;
    /* корабли */
    this.playerShip = this.S.bhOnly ? null : new Ship(this, "#ffd166");
    this.agentConfig=options.agentConfig||{};
    this.npcs = makeNpcs(this, galaxy.systemSeedOf ? galaxy.systemSeedOf(star) : 1,this.agentConfig);
    this.followShip = false;
    this.zoom = ZOOM_DEFAULT;
    this.cargoField = [];        // контейнеры, брошенные в космос
    this.scoopMsg = "";
    this.nodeStep = 10;          // шаг ручки манёвра, м/с
    this._handles = [];          // экранные ручки узла (KSP-стиль)
    this.projectiles = [];
    this.combatMsg = "";
    this.lockedNpc = null;
    this.playerOrder = null;
    this.world = options.world || null;
    this.world?.restore(this);
  }
  fit(){ this.cam.x = 0; this.cam.y = 0; this.zoom = ZOOM_DEFAULT; }
  configureAgents(config={}){
    this.agentConfig=config;
    for(const npc of this.npcs)npc.agent.configure(config[npc.agent.profileId]||config.default||{});
  }
  ssx(w){ return (w - this.cam.x)*this.zoom + this.ctx.SCR/2; }
  ssy(w){ return (w - this.cam.y)*this.zoom + this.ctx.SCR/2; }
  zoomBy(f){ this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom*f)); }
  execConsoleCommand(input, print){ execCommand(this, input, print); }
  onWheel(mx, my, deltaY){
    const wx = (mx - this.ctx.SCR/2)/this.zoom + this.cam.x;
    const wy = (my - this.ctx.SCR/2)/this.zoom + this.cam.y;
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * (deltaY < 0 ? ZOOM_WHEEL_STEP : 1/ZOOM_WHEEL_STEP)));
    this.cam.x = wx - (mx - this.ctx.SCR/2)/this.zoom;
    this.cam.y = wy - (my - this.ctx.SCR/2)/this.zoom;
  }
  /** Управление с клавиатуры (e.code): газ/тормоз/поворот, манёвры. */
  onKey(code, down){
    const sh = this.playerShip;
    if (!sh) return;
    if(code === "Space"){ if(down)this.fireWeapon(); return; }
    if(/^Digit[1-5]$/.test(code)){
      if(down){const slot=`weapon${code.slice(-1)}`;if(sh.prop.slotAvailable(slot))sh.prop.activeWeaponSlot=slot;}
      return;
    }
    if (code === "KeyA") sh.ctrl.left = down;
    else if (code === "KeyD") sh.ctrl.right = down;
    else if (code === "KeyW") sh.ctrl.thrust = down;
    else if (code === "KeyS") sh.ctrl.retro = down;
    else if (!down) return;
    else if (code === "ShiftLeft") sh.prop.throttle = Math.min(1, sh.prop.throttle + 0.1);
    else if (code === "ControlLeft") sh.prop.throttle = Math.max(0, sh.prop.throttle - 0.1);
    else if (code === "KeyZ") sh.prop.throttle = 1;
    else if (code === "KeyX"){ sh.prop.throttle = 0; sh.ctrl.thrust = sh.ctrl.retro = false; }
    else if (code === "KeyT") sh.sas = sh.sas === "prograde" ? "off" : "prograde";
    else if (code === "KeyG") sh.sas = sh.sas === "retrograde" ? "off" : "retrograde";
    else if (code === "KeyM") this.planCirc(true);
    else if (code === "KeyN") sh.executeNode();
    else if (code === "KeyC") this.planCirc(false);
    else if (code === "KeyB") this.mgr.push(new OutfitScene(this));
    else if (code === "KeyF" && this.sel) sh.fsdTo(this.sel, this.orbitAlt);
    else if (code === "KeyH") this.planTransfer();
    this.mgr.onChange?.();
  }
  fireWeapon(){
    const sh=this.playerShip;
    if(!sh||sh.mode!=="newton")return;
    const spec=sh.prop.fireWeapon();
    if(!spec){this.combatMsg="оружие не готово или боезапас исчерпан";return;}
    const [sx,sy]=sh.globPos(this);
    const target=this.lockedNpc?.ship&&!this.lockedNpc.ship.destroyed ? this.lockedNpc.ship : [...this.npcs].filter(n=>!n.ship.destroyed).sort((a,b)=>{
      const ap=a.ship.globPos(this),bp=b.ship.globPos(this);
      return Math.hypot(ap[0]-sx,ap[1]-sy)-Math.hypot(bp[0]-sx,bp[1]-sy);
    })[0]?.ship||null;
    this.launchWeapon(sh,spec,target);
    this.combatMsg=spec.name + (spec.ammo>0 ? ` · осталось ${sh.prop.activeWeapon?.ammoLeft}` : " · заряд выпущен");
    this.mgr.onChange?.();
  }
  /** One combat pipeline serves player and NPC weapons, so shields, EMP and
   * destruction behave identically regardless of who fired the shot. */
  launchWeapon(source,spec,target=null){
    this.projectiles.push(new WeaponProjectile(source,spec,target,this));
  }
  fireNpcWeapon(npc,target){
    const ship=npc?.ship;
    if(!ship||ship.destroyed||ship.mode!=="newton"||ship.empTimer>0||!target||target.destroyed)return false;
    const spec=ship.prop.fireWeapon();
    if(!spec)return false;
    this.launchWeapon(ship,spec,target);
    npc.agent.state.blackboard.lastShot=spec.weaponType;
    return true;
  }
  lockNpc(npc){
    this.lockedNpc=npc||null;
    if(!npc)this.playerOrder=null;
    this.mgr.onChange?.();
  }
  issueNpcOrder(mode){
    if(!this.lockedNpc||!this.playerShip)return;
    this.playerOrder={mode,target:this.lockedNpc,distance:22};
    this.combatMsg=mode==="attack"?"приказ: следовать и атаковать":"приказ: следовать";
    this.mgr.onChange?.();
  }
  updatePlayerOrder(){
    const order=this.playerOrder,sh=this.playerShip,target=order?.target?.ship;
    if(!order||!sh||!target||target.destroyed){if(order)this.playerOrder=null;return;}
    const [sx,sy]=sh.globPos(this),[tx,ty]=target.globPos(this),dx=tx-sx,dy=ty-sy,distance=Math.hypot(dx,dy);
    if(sh.mode!=="landed"){
      if(!sh.sameTarget(target.primary))sh.fsdTo(target.primary,Math.max(10,order.distance));
      else if(sh.mode==="newton"){
        sh.nose=Math.atan2(dy,dx);
        sh.ctrl.thrust=distance>order.distance*1.15;
        sh.prop.throttle=sh.ctrl.thrust?.35:0;
      }
    }
    const weapon=sh.prop.activeWeapon;
    if(order.mode==="attack"&&weapon&&distance<=weapon.stats.range) this.fireWeapon();
  }
  hitNpcAt(mx,my,radius=9){
    return this.npcs.find(npc=>{
      const [x,y]=npc.ship.globPos(this);
      return Math.hypot(this.ssx(x)-mx,this.ssy(y)-my)<=radius;
    })||null;
  }
  updateProjectiles(dt){
    for(const shot of this.projectiles){
      if(!shot.update(dt,this)||shot.hit)continue;
      if(shot.armed>0)continue;
      const combatants=[this.playerShip,...this.npcs.map(npc=>npc.ship)];
      for(const target of combatants){
        if(!target||target===shot.source||target.destroyed)continue;
        const [tx,ty]=target.globPos(this),distance=Math.hypot(tx-shot.x,ty-shot.y);
        const radius=shot.spec.splash||3;
        if(distance>radius)continue;
        const factor=shot.spec.splash?Math.max(.2,1-distance/radius):1;
        let damage=shot.spec.damage*factor;
        const shield=target.prop?.shield;
        if(shield?.charge>0){const absorbed=Math.min(shield.charge,damage);shield.charge-=absorbed;damage-=absorbed;}
        target.integrity=(target.integrity??100)-damage;
        if(shot.spec.emp)target.empTimer=Math.max(target.empTimer||0,shot.spec.emp);
        target.lastStatus=target.integrity<=0?"корабль уничтожен":(shot.spec.emp?"ЭМИ: системы подавлены":"попадание");
        if(target.integrity<=0)target.destroyed=true;
        shot.detonate();break;
      }
    }
    this.projectiles=this.projectiles.filter(shot=>shot.detonating>0||(!shot.hit&&shot.life>0));
    this.npcs=this.npcs.filter(npc=>!npc.ship.destroyed);
    if(this.lockedNpc&&!this.npcs.includes(this.lockedNpc)){this.lockedNpc=null;this.playerOrder=null;}
  }
  /** Захват: сбор топлива в короне звезды и подбор контейнеров.
   *  Заправка работает, как в Elite, — на низкой орбите звезды. */
  _scoopAndGrab(dt){
    const sh = this.playerShip;
    this.scoopMsg = "";
    if (!sh || sh.mode === "landed") return;
    const sc = sh.prop.scoop;
    if (!sc) return;

    /* --- топливозаборник --- */
    sh.prop.scooping = false;
    if (sc.scoopRate > 0 && sh.primary.kind === "star"){
      const ps = primaryState(this, sh.primary);
      const h = Math.hypot(sh.rx, sh.ry) - ps.bodyR;
      const band = ps.bodyR*sc.scoopAlt;
      if (h < band){
        const eff = Math.max(0.15, 1 - h/band);
        const got = sh.prop.scoopFuel(dt*eff);
        sh.prop.scooping = got > 0;
        this.scoopMsg = got > 0
          ? "СБОР ТОПЛИВА " + Math.round(eff*100) + "% · " +
            sh.prop.fuel.toFixed(1) + "/" + sh.prop.fuelCap + " т"
          : "бак полон";
        if (h < ps.bodyR*0.12) this.scoopMsg = "ОПАСНО: слишком близко к фотосфере";
      }
    }

    /* --- подбор контейнеров --- */
    const [gx, gy] = sh.globPos(this);
    const [gvx, gvy] = sh.globVel(this);
    for(let i = this.cargoField.length - 1; i >= 0; i--){
      const f = this.cargoField[i];
      const p = f.globPos(this), v = f.globVel(this);
      if (Math.hypot(p[0]-gx, p[1]-gy) > sc.grabRange) continue;
      if (Math.hypot(v[0]-gvx, v[1]-gvy) > sc.grabSpeed) continue;
      const prop = sh.prop;
      const target = f.item.slot === "cargo" && prop.cargoMass + f.item.mass <= prop.cargoCap
        ? prop.cargo : prop.inventory;
      target.add(f.item);
      this.cargoField.splice(i, 1);
      this.scoopMsg = "подобрано: " + f.item.name;
      this.mgr.onChange?.();
    }
  }
  /** Сбросить предмет за борт из текущего состояния корабля. */
  dropItem(item){
    const sh = this.playerShip;
    if (!sh) return;
    const a = Math.random()*Math.PI*2;
    const f = new FloatingItem(item, sh.primary, sh.rx, sh.ry,
      sh.rvx + Math.cos(a)*0.0008, sh.rvy + Math.sin(a)*0.0008);
    if (sh.mode === "landed"){ f.landed = { ...sh.primary }; f.rvx = 0; f.rvy = 0; }
    this.cargoField.push(f);
  }
  /** Варп режется на активном участке: под тягой физика идёт шагами. */
  warpLimit(){
    const sh = this.playerShip;
    if (sh && sh.mode === "newton" && sh.burning) return 10;
    if (sh && sh.mode === "cruise") return 5;
    return Infinity;
  }
  /** Клик по собственной орбите ставит узел в эту точку — как перетаскивание
   *  узла по траектории в KSP. Возвращает true, если попали по орбите. */
  tryPlaceNode(wx, wy){
    const sh = this.playerShip;
    if (!sh || sh.mode !== "newton" || sh.nodeAuto) return false;
    const ps = primaryState(this, sh.primary);
    if (!ps || ps.mu <= 0) return false;
    const el = elements(ps.mu, sh.rx, sh.ry, sh.rvx, sh.rvy);
    const rx = wx - ps.x, ry = wy - ps.y;
    const rClick = Math.hypot(rx, ry);
    if (rClick < ps.bodyR) return false;
    /* истинная аномалия точки клика и радиус орбиты в ней */
    const nu = ((Math.atan2(ry, rx) - el.argp)*el.s + Math.PI*4) % (Math.PI*2);
    const rOrb = el.p/(1 + el.e*Math.cos(nu));
    if (!isFinite(rOrb) || rOrb <= 0) return false;
    const tol = Math.max(4, 10/this.zoom);
    if (Math.abs(rOrb - rClick) > tol) return false;
    const eta = Math.max(0, timeToNu(el, nu));
    if (sh.manNode) sh.manNode.eta = eta;
    else sh.setNode(eta, 0, 0);
    this.mgr.onChange?.();
    return true;
  }
  /** Запланировать циркуляризацию в апоцентре (или перицентре). */
  planCirc(atApo){
    const sh = this.playerShip;
    if (!sh || sh.mode !== "newton") return;
    const ps = primaryState(this, sh.primary);
    if (!ps || ps.mu <= 0) return;
    const n = planCircularize(ps.mu, sh, atApo);
    if (n) sh.manNode = n;
  }
  /** Гомановский переход на выбранную высоту (узлом, а не телепортом). */
  planTransfer(){
    const sh = this.playerShip;
    if (!sh || sh.mode !== "newton") return;
    const ps = primaryState(this, sh.primary);
    if (!ps || ps.mu <= 0) return;
    const n = planHohmann(ps.mu, sh, ps.bodyR + this.orbitAlt);
    if (n) sh.manNode = n;
  }
  /** Характеристики любого выбираемого тела (для карточки и тултипа). */
  statsOf(sel){
    const o = this.obj(sel);
    if (!o) return null;
    if (sel.kind === "planet" || sel.kind === "moon"){
      const parentDist = sel.kind === "moon" ? this.S.planets[sel.i].dist : 0;
      return planetStats(this.S, o, sel.kind, parentDist);
    }
    if (sel.kind === "comet") return smallBodyStats(this.S, "comet", o, Math.max(40, o.r));
    if (sel.kind === "rock") return smallBodyStats(this.S, "rock", o, o.dist);
    return null;
  }
  posOf(s){
    if (s.kind === "cargo"){
      const f = this.cargoField[s.i];
      return f ? f.globPos(this) : null;
    }
    if (s.kind === "star") return [0, 0];
    const o = this.obj(s);
    if (!o) return null;
    if (s.kind === "comet") return [o.x, o.y];
    if (s.kind === "rock") return [Math.cos(o.ang)*o.dist, Math.sin(o.ang)*o.dist];
    return [o._x, o._y];
  }
  obj(s){
    if (!s) return null;
    if (s.kind === "cargo"){
      const f = this.cargoField[s.i];
      return f ? { type:"cargo", size:4, item:f.item, floating:f } : null;
    }
    if (s.kind === "star") return { type:"star", temp: this.S.sun.temp, size: this.S.sun.D, ci: this.star.ci };
    if (s.kind === "planet") return this.S.planets[s.i] || null;
    if (s.kind === "comet") return this.S.comets[s.i] || null;
    if (s.kind === "rock") return this.S.belt ? (this.S.belt.rocks[s.i] || null) : null;
    const p = this.S.planets[s.i];
    return p ? (p.moonList[s.j] || null) : null;
  }
  label(s){
    if (s.kind === "cargo"){
      const f = this.cargoField[s.i];
      return f ? "Контейнер: " + f.item.name : "Контейнер";
    }
    if (s.kind === "star") return this.S.name;
    if (s.kind === "comet"){
      const c = this.obj(s);
      return "C/" + (c ? c.id : "?") + " " + this.S.name.split(" ")[0];
    }
    if (s.kind === "rock"){
      const r = this.obj(s);
      return "(" + (r ? r.num : "?") + ") " + this.S.name.split(" ")[0];
    }
    const base = this.S.name + " " + (LETTERS[s.i] || "?");
    return s.kind === "moon" ? base + " " + (ROM[s.j] || "") : base;
  }
  update(dt){
    stepSystem(this.S, dt);
    this.updatePlayerOrder();
    if (this.playerShip) this.playerShip.update(dt, this);
    for(const f of this.cargoField) f.update(dt, this);
    this._scoopAndGrab(dt);
    for(const n of this.npcs) n.update(dt, this);
    this.updateProjectiles(dt);
    let camTgt = null;
    if (this.followShip && this.playerShip) camTgt = this.playerShip.globPos(this);
    else if (this.follow && this.sel) camTgt = this.posOf(this.sel);
    if (camTgt){
      const k = 1 - Math.exp(-dt*6);
      this.cam.x += (camTgt[0] - this.cam.x)*k;
      this.cam.y += (camTgt[1] - this.cam.y)*k;
    }
    this._saveClock=(this._saveClock||0)+dt;
    if(this.world&&this._saveClock>=8){this.world.capture(this);this.world.persist();this._saveClock=0;}
  }
  drawWorldCircleAt(cx, cy, r, col, skip){
    const { sctx, SCR } = this.ctx;
    sctx.fillStyle = col;
    const steps = Math.max(24, Math.ceil(2*Math.PI*r/6));
    for(let i=0;i<steps;i+=skip){
      const a = i/steps*Math.PI*2;
      const X = Math.round(this.ssx(cx + Math.cos(a)*r)), Y = Math.round(this.ssy(cy + Math.sin(a)*r));
      if (X < 0 || Y < 0 || X >= SCR || Y >= SCR) continue;
      sctx.fillRect(X, Y, 1, 1);
    }
  }
  /** Пунктирная прорисовка списка точек в раме тела. */
  drawTrack(pts, ps, col, alpha, skip){
    const { sctx, SCR } = this.ctx;
    sctx.fillStyle = col;
    sctx.globalAlpha = alpha;
    for(let i=0;i<pts.length;i+=skip){
      const X = Math.round(this.ssx(ps.x + pts[i][0]));
      const Y = Math.round(this.ssy(ps.y + pts[i][1]));
      if (X < 0 || Y < 0 || X >= SCR || Y >= SCR) continue;
      sctx.fillRect(X, Y, 1, 1);
    }
    sctx.globalAlpha = 1;
  }
  /** Маркер апсиды (nu = 0 перицентр, π апоцентр). */
  drawApsis(el, ps, nu, col){
    if (el.e >= 1 && nu === Math.PI) return;
    const rr = el.p/(1 + el.e*Math.cos(nu));
    if (!isFinite(rr) || rr > ps.soi || rr < ps.bodyR) return;
    const th = el.argp + el.s*nu;
    const X = Math.round(this.ssx(ps.x + rr*Math.cos(th)));
    const Y = Math.round(this.ssy(ps.y + rr*Math.sin(th)));
    const { sctx, SCR } = this.ctx;
    if (X < 0 || Y < 0 || X >= SCR || Y >= SCR) return;
    sctx.fillStyle = col;
    sctx.fillRect(X-1, Y-1, 3, 3);
  }
  drawOrbit(r, col){
    const { sctx, SCR } = this.ctx;
    sctx.fillStyle = col;
    const steps = Math.max(24, Math.ceil(2*Math.PI*r/6));
    for(let i=0;i<steps;i+=2){
      const a = i/steps*Math.PI*2;
      const X = Math.round(this.ssx(Math.cos(a)*r)), Y = Math.round(this.ssy(Math.sin(a)*r));
      if (X < 0 || Y < 0 || X >= SCR || Y >= SCR) continue;
      sctx.fillRect(X, Y, 1, 1);
    }
  }
  draw(t){
    const { sctx, SCR } = this.ctx;
    const S = this.S;
    if (this.nebCvs){
      const x0 = this.ssx(-NEB_SPAN/2), y0 = this.ssy(-NEB_SPAN/2);
      sctx.drawImage(this.nebCvs, Math.round(x0), Math.round(y0), NEB_SPAN, NEB_SPAN);
    }
    if (S.bhOnly){
      renderBH(S.bh, t);
      sctx.drawImage(S.bh.cvs, Math.round(SCR/2 - S.bh.C/2), Math.round(SCR/2 - S.bh.C/2));
      if (S.jets){
        const ja = S.jetAng + Math.sin(t*0.7)*0.06;
        for(const dir of [0, Math.PI]){
          const c = Math.cos(ja + dir), s = Math.sin(ja + dir);
          for(let q = S.bh.D*0.75; q < 200; q += 2){
            if ((Math.floor(q) + Math.floor(t*10)) % 2) continue;
            sctx.globalAlpha = Math.max(0.1, 1 - q/210);
            sctx.fillStyle = q < 90 ? "#eaf6ff" : "#8fd0ff";
            sctx.fillRect(Math.round(SCR/2 + c*q), Math.round(SCR/2 + s*q), 1, 1);
          }
        }
        sctx.globalAlpha = 1;
      }
      for(const s of S.sstars){
        sctx.fillStyle = CLS[s.ci].col;
        sctx.fillRect(Math.round(this.ssx(s.x))-1, Math.round(this.ssy(s.y))-1, 2, 2);
      }
      return;
    }
    for(let i=0;i<S.planets.length;i++){
      const hi = this.sel && this.sel.kind === "planet" && this.sel.i === i;
      this.drawOrbit(S.planets[i].dist, hi ? "#3a4a8a" : "#1c2444");
    }
    renderStar(S.sun, t);
    const sunW = Math.round(S.sun.C * this.zoom);
    sctx.drawImage(S.sun.cvs, Math.round(this.ssx(0) - sunW/2), Math.round(this.ssy(0) - sunW/2), sunW, sunW);
    if (S.belt){
      for(const r of S.belt.rocks){
        const X = Math.round(this.ssx(Math.cos(r.ang)*r.dist));
        const Y = Math.round(this.ssy(Math.sin(r.ang)*r.dist));
        if (X < -2 || Y < -2 || X > SCR+2 || Y > SCR+2) continue;
        sctx.fillStyle = r.c;
        sctx.fillRect(X, Y, r.s, r.s);
      }
    }
    for(const c of S.comets){
      const hx = this.ssx(c.x), hy = this.ssy(c.y);
      const Lpx = Math.min(50, Math.max(6, 3200/c.r));
      const rl = Math.hypot(c.x, c.y) || 1;
      const ux = c.x/rl, uy = c.y/rl;
      for(let s=0; s<Lpx; s++){
        const frac = s/Lpx;
        if (frac > 0.5 && s % 2) continue;
        const wob = Math.sin(s*0.35 + t*3 + c.ph)*(0.5 + frac*2);
        sctx.fillStyle = frac < 0.35 ? "#e8f2ff" : "#9fc8ff";
        sctx.globalAlpha = 1 - frac*0.7;
        sctx.fillRect(Math.round(hx + ux*s - uy*wob), Math.round(hy + uy*s + ux*wob), 1, 1);
      }
      sctx.globalAlpha = 1;
      sctx.fillStyle = "#ffffff";
      sctx.fillRect(Math.round(hx)-1, Math.round(hy)-1, 2, 2);
    }
    const drawBody=(body,x,y)=>{
      const w=Math.max(1,Math.round(body.C*this.zoom)),X=Math.round(this.ssx(x)-w/2),Y=Math.round(this.ssy(y)-w/2);
      if(X>w+SCR||Y>w+SCR||X< -w||Y< -w)return;
      if(w<7){sctx.fillStyle="#8497b8";sctx.fillRect(Math.round(this.ssx(x)),Math.round(this.ssy(y)),w>2?2:1,w>2?2:1);return;}
      const [lx,ly,lz]=lightAt(x,y),lod=w<52?0:w<168?1:2;
      const sprite=renderPlanetLod(body,lx,ly,lz,lod);
      const smooth=sctx.imageSmoothingEnabled;sctx.imageSmoothingEnabled=false;
      sctx.drawImage(sprite,X,Y,w,w);sctx.imageSmoothingEnabled=smooth;
    };
    for(const p of S.planets){
      drawBody(p,p._x,p._y);
      for(const m of p.moonList)drawBody(m,m._x,m._y);
    }
    /* SOI выбранного тела */
    if (this.sel && (this.sel.kind === "planet" || this.sel.kind === "moon")){
      const ps = primaryState(this, this.sel);
      if (ps) this.drawWorldCircleAt(ps.x, ps.y, ps.soi, "#22305a", 4);
    }
    /* Траектория корабля — точная коника из элементов орбиты, а не
     * результат интегрирования: она совпадает с тем, куда корабль реально
     * прилетит, и не «плывёт» на варпе. */
    const sh = this.playerShip;
    if (sh && sh.mode === "newton"){
      const ps = primaryState(this, sh.primary);
      if (ps && ps.mu > 0){
        const el = elements(ps.mu, sh.rx, sh.ry, sh.rvx, sh.rvy);
        const path = conicPath(el, ps.soi, ps.bodyR);
        this.drawTrack(path.pts, ps, "#ffd166", 0.55, 1);
        /* апоцентр и перицентр */
        this.drawApsis(el, ps, Math.PI, "#8fd0ff");
        this.drawApsis(el, ps, 0, "#ff9a6b");
        /* точка выхода из сферы влияния или удара */
        if (path.exit && path.pts.length){
          const p = path.pts[path.pts.length-1];
          const X = Math.round(this.ssx(ps.x + p[0])), Y = Math.round(this.ssy(ps.y + p[1]));
          sctx.fillStyle = path.exit.type === "impact" ? "#ff5c4d" : "#7ee0ff";
          sctx.fillRect(X-2, Y-2, 5, 1); sctx.fillRect(X-2, Y+2, 5, 1);
          sctx.fillRect(X-2, Y-1, 1, 3); sctx.fillRect(X+2, Y-1, 1, 3);
        }
        /* запланированный манёвр: орбита после узла + маркер узла */
        this._handles = [];
        const na = sh.nodeOrbit(this);
        if (na){
          const np = conicPath(na.el, ps.soi, ps.bodyR);
          this.drawTrack(np.pts, ps, "#7ee0ff", 0.5, 3);
          const st = stateAtNode(ps.mu, sh, Math.max(0, sh.manNode.eta));
          const nX = Math.round(this.ssx(ps.x + st.rx)), nY = Math.round(this.ssy(ps.y + st.ry));
          sctx.fillStyle = "#7ee0ff";
          sctx.fillRect(nX - 4, nY, 9, 1);
          sctx.fillRect(nX, nY - 4, 1, 9);
          sctx.fillStyle = "#ffffff";
          sctx.fillRect(nX - 1, nY - 1, 3, 3);
          /* Ручки манёвра как в KSP: прогрейд/ретрогрейд вдоль скорости,
           * радиальные — вдоль радиус-вектора. По ним можно кликать. */
          const vv = Math.hypot(st.vx, st.vy) || 1e-9;
          const px = st.vx/vv, py = st.vy/vv;
          const rr = Math.hypot(st.rx, st.ry) || 1e-9;
          const ux = st.rx/rr, uy = st.ry/rr;
          const D = 18;
          const H = [
            { k:"pro",  dx: px,  dy: py,  col:"#7ee08a" },
            { k:"retro",dx:-px,  dy:-py,  col:"#ff9a6b" },
            { k:"radO", dx: ux,  dy: uy,  col:"#8fd0ff" },
            { k:"radI", dx:-ux,  dy:-uy,  col:"#c9a0e8" }
          ];
          for(const h of H){
            const hx = Math.round(nX + h.dx*D), hy = Math.round(nY + h.dy*D);
            sctx.fillStyle = "#0a0d18";
            sctx.fillRect(hx-4, hy-4, 9, 9);
            sctx.fillStyle = h.col;
            sctx.fillRect(hx-3, hy-3, 7, 1);
            sctx.fillRect(hx-3, hy+3, 7, 1);
            sctx.fillRect(hx-3, hy-3, 1, 7);
            sctx.fillRect(hx+3, hy-3, 1, 7);
            sctx.fillRect(hx-1, hy-1, 3, 3);
            this._handles.push({ x:hx, y:hy, k:h.k });
          }
        }
      }
    }
    /* дрейфующий груз */
    for(const f of this.cargoField){
      const p = f.globPos(this);
      const X = this.ssx(p[0]), Y = this.ssy(p[1]);
      if (X < -6 || Y < -6 || X > SCR+6 || Y > SCR+6) continue;
      f.draw(sctx, X, Y, t);
    }
    for(const shot of this.projectiles)shot.draw(sctx,(x)=>this.ssx(x),(y)=>this.ssy(y),t);
    /* корабли */
    for(const n of this.npcs){
      const [nx, ny] = n.ship.globPos(this);
      n.ship.draw(sctx, this.ssx(nx), this.ssy(ny), t, this.zoom);
    }
    if(this.lockedNpc){
      const [lx,ly]=this.lockedNpc.ship.globPos(this),X=Math.round(this.ssx(lx)),Y=Math.round(this.ssy(ly));
      const col=this.playerOrder?.mode==="attack"?"#ff5c4d":"#7ee0ff",r=7;
      sctx.fillStyle=col;
      sctx.fillRect(X-r,Y-r,4,1);sctx.fillRect(X-r,Y-r,1,4);
      sctx.fillRect(X+r-3,Y-r,4,1);sctx.fillRect(X+r,Y-r,1,4);
      sctx.fillRect(X-r,Y+r,4,1);sctx.fillRect(X-r,Y+r-3,1,4);
      sctx.fillRect(X+r-3,Y+r,4,1);sctx.fillRect(X+r,Y+r-3,1,4);
    }
    if (sh && sh.mode !== "landed"){
      const [px, py] = sh.globPos(this);
      sh.draw(sctx, this.ssx(px), this.ssy(py), t, this.zoom);
    }
    if (this.sel){
      const pos = this.posOf(this.sel);
      const o = this.obj(this.sel);
      if (pos && o){
        const X = Math.round(this.ssx(pos[0])), Y = Math.round(this.ssy(pos[1]));
        const hr = Math.round((o.size ? o.size/2 : 4) + 5);
        sctx.fillStyle = "#ffd166";
        for(const [ox, oy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
          sctx.fillRect(X + ox*hr - (ox<0?0:3), Y + oy*hr, 4, 1);
          sctx.fillRect(X + ox*hr, Y + oy*hr - (oy<0?0:3), 1, 4);
        }
      }
    }
  }
  drawLabels(){
    if (this.S.bhOnly) return;
    for(let i=0;i<this.S.planets.length;i++){
      const p = this.S.planets[i];
      lblText(this.ctx, LETTERS[i] || "?",
        toLbl(this.ctx, this.ssx(p._x) + p.size/2) + 5, toLbl(this.ctx, this.ssy(p._y)) - 4, "#8d95c9", 11);
    }
    if (this.sel){
      const pos = this.posOf(this.sel);
      if (pos) lblText(this.ctx, this.label(this.sel),
        toLbl(this.ctx, this.ssx(pos[0])) + 12, toLbl(this.ctx, this.ssy(pos[1])) + 20, "#ffd166", 13);
    }
    for(const n of this.npcs){
      if (n.ship.mode !== "newton") continue;
      const [nx, ny] = n.ship.globPos(this);
      lblText(this.ctx, n.name,
        toLbl(this.ctx, this.ssx(nx)) + 6, toLbl(this.ctx, this.ssy(ny)) - 5, "#6fb7ff", 10);
    }
    /* HUD: режим, элементы орбиты, состояние двигателя */
    const sh = this.playerShip;
    if (sh){
      const L = this.ctx.LW;
      const pName = sh.primary.kind === "star" ? this.S.name : this.label(sh.primary);
      if (sh.mode === "cruise"){
        lblText(this.ctx, "FSD-СВЕРХКРУИЗ · " + fmtSpeed(sh.cruiseV) +
          " · цель: " + (sh.target ? this.label(sh.target) : "—"), 12, L - 32, "#8fd0ff", 11);
      } else if (sh.mode === "landed"){
        lblText(this.ctx, "НА ПОВЕРХНОСТИ · " + pName + " · топливо " +
          Math.round(sh.prop.fuelFrac*100) + "%", 12, L - 32, "#7ee08a", 11);
      } else {
        const el = sh.els(this);
        if (el){
          const hAlt = el.r - el.ps.bodyR;
          lblText(this.ctx, "ОРБИТА " + pName + " · h " + fmtDist(hAlt) +
            " · v " + fmtSpeed(el.v), 12, L - 46, "#dfe4ff", 11);
          const ap = isFinite(el.ra) ? fmtDist(el.ra - el.ps.bodyR) : "выход";
          lblText(this.ctx,
            "Ап " + ap + " · Пе " + fmtDist(el.rp - el.ps.bodyR) +
            " · e " + el.e.toFixed(3) +
            (isFinite(el.period) ? " · T " + fmtTime(el.period) : " · гипербола"),
            12, L - 32, "#ffd166", 11);
        }
      }
      const p = sh.prop;
      let l3 = "РУД " + Math.round(p.throttle*100) + "% · топл " +
        Math.round(p.fuelFrac*100) + "% · ΔV " + fmtDv(p.deltaV);
      if (sh.manNode){
        const rem = sh.manNode.dv - (sh.manNode.done || 0);
        l3 += " · узел Δv " + fmtDv(rem) + " через " + fmtTime(sh.manNode.eta) +
              (sh.nodeAuto ? " ▶" : "");
      }
      lblText(this.ctx, l3, 12, L - 16, sh.burning ? "#ff9a6b" : "#8d95c9", 11);
      if (this.scoopMsg)
        lblText(this.ctx, this.scoopMsg, 12, L - 60,
          this.scoopMsg.startsWith("ОПАСНО") ? "#ff5c4d" : "#7ee08a", 11);
    }
  }
  /** Кандидаты попадания в точку (общая логика для клика и тултипа). */
  hitAt(wx, wy, pad){
    const cands = [];
    this.S.planets.forEach((p, i) => {
      p.moonList.forEach((m, j) => {
        const d = Math.hypot(m._x - wx, m._y - wy);
        if (d < m.size/2 + pad) cands.push({ s:{kind:"moon", i, j}, d, r:m.size/2 });
      });
      const d = Math.hypot(p._x - wx, p._y - wy);
      if (d < p.size/2 + pad) cands.push({ s:{kind:"planet", i, j:0}, d, r:p.size/2 });
    });
    this.S.comets.forEach((c, i) => {
      const d = Math.hypot(c.x - wx, c.y - wy);
      if (d < 3 + pad) cands.push({ s:{kind:"comet", i, j:0}, d, r:3 });
    });
    if (this.S.belt){
      this.S.belt.rocks.forEach((r, i) => {
        const d = Math.hypot(Math.cos(r.ang)*r.dist - wx, Math.sin(r.ang)*r.dist - wy);
        if (d < 2 + pad*0.8) cands.push({ s:{kind:"rock", i, j:0}, d, r:2 });
      });
    }
    this.cargoField.forEach((f, i) => {
      const p = f.globPos(this);
      const d = Math.hypot(p[0] - wx, p[1] - wy);
      if (d < 4 + pad) cands.push({ s:{kind:"cargo", i, j:0}, d, r:2.5 });
    });
    {
      const d = Math.hypot(wx, wy);
      if (d < this.S.sun.D/2 + pad) cands.push({ s:{kind:"star", i:0, j:0}, d, r:1000 });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => (a.r - b.r) || (a.d - b.d));
    return cands[0].s;
  }
  /** Тултип характеристик при наведении — для любого тела, включая звезду. */
  /** Экранные px → мировые координаты. */
  toWorld(mx, my){
    return {
      wx: (mx - this.ctx.SCR/2)/this.zoom + this.cam.x,
      wy: (my - this.ctx.SCR/2)/this.zoom + this.cam.y
    };
  }
  onHover(mx, my){
    if (this.S.bhOnly) return null;
    const { wx, wy } = this.toWorld(mx, my);
    const hit = this.hitAt(wx, wy, 6);
    if (!hit) return null;
    if (hit.kind === "star")
      return starTooltipHTML(this.S.name, CLS[this.star.ci], this.S.sun.D) +
        "<br>μ = " + MU_SUN.toLocaleString("ru-RU");
    const st = this.statsOf(hit);
    if (!st) return null;
    let html = statsTooltipHTML(this.label(hit), st);
    if (hit.kind === "planet" || hit.kind === "moon"){
      const ps = primaryState(this, hit);
      if (ps) html += "<br>μ = " + Math.round(ps.mu) + " · SOI = " + Math.round(ps.soi);
    }
    return html;
  }
  /** Посадка: корабль в ньютоне, в раме выбранного твёрдого тела, низко и небыстро. */
  canLand(){
    const sh = this.playerShip;
    if (!sh || sh.mode !== "newton" || !this.sel) return false;
    if (!sh.sameTarget(this.sel)) return false;
    const k = this.sel.kind;
    if (k === "star" || k === "cargo") return false;
    const o = this.obj(this.sel);
    if (!o) return false;
    if ((k === "planet" || k === "moon") && o.type === "gas") return false;
    const els = sh.els(this);
    if (!els) return false;
    /* сесть можно с низкой орбиты: высота меньше 12% радиуса тела,
     * скорость ниже 1.2 круговой — как в реальном сходе с орбиты */
    const h = els.r - els.ps.bodyR;
    const vCirc = Math.sqrt(els.ps.mu/els.r);
    return h < Math.max(6, els.ps.bodyR*0.35) && els.v < vCirc*1.25;
  }
  /** A solid planet or moon can be approached for landing.  This is separate
   * from canLand(), which remains the final flight-safety gate. */
  canApproachForLanding(sel = this.sel){
    if (!sel || (sel.kind !== "planet" && sel.kind !== "moon")) return false;
    const body = this.obj(sel);
    return !!body && body.type !== "gas";
  }
  /** Low, but still clear of the body.  FSD arrival here meets the altitude
   * requirement of canLand() for generated planets and moons. */
  landingApproachAlt(sel = this.sel){
    const ps = primaryState(this, sel);
    if (!ps) return 2;
    return Math.max(2, Math.min(5, ps.bodyR*0.25));
  }
  onTap(mx, my){
    if (this.S.bhOnly) return;
    /* 1. ручка манёвра */
    for(const h of this._handles){
      if (Math.hypot(h.x - mx, h.y - my) < 9){
        const s = this.nodeStep;
        const sh = this.playerShip;
        if (h.k === "pro")   sh.nudgeNode(s, 0, 0);
        if (h.k === "retro") sh.nudgeNode(-s, 0, 0);
        if (h.k === "radO")  sh.nudgeNode(0, s, 0);
        if (h.k === "radI")  sh.nudgeNode(0, -s, 0);
        this.mgr.onChange?.();
        return;
      }
    }
    const npc=this.hitNpcAt(mx,my,10);
    if(npc){ this.lockNpc(npc); return; }
    const { wx, wy } = this.toWorld(mx, my);
    /* 2. клик по собственной орбите — поставить или перенести узел */
    if (this.tryPlaceNode(wx, wy)) return;
    /* 3. выбор объекта */
    const hit = this.hitAt(wx, wy, 9);
    if (!hit) return;
    if (this.sel && hit.kind === this.sel.kind && hit.i === this.sel.i && hit.j === this.sel.j){
      this.mgr.push(new BodyScene(this, hit));
    } else {
      this.sel = hit;
      this.mgr.onChange?.();
    }
  }
  onDragStart(){
    if (this.S.bhOnly) return undefined;
    return { cx: this.cam.x, cy: this.cam.y };
  }
  onDragMove(dx, dy, st){
    this.follow = false;
    this.cam.x = st.cx - dx/this.zoom;
    this.cam.y = st.cy - dy/this.zoom;
    this.mgr.onChange?.();
  }
  status(){
    const S = this.S;
    if (S.bhOnly) return {
      title: S.name,
      info: (S.jets ? "квазар" : "сверхмассивная чёрная дыра") + " · S-звёзд: " + S.sstars.length
    };
    const ship = this.playerShip;
    const shipRu = ship ? ({newton:"орбита", cruise:"FSD", landed:"посадка"})[ship.mode] : "";
    return {
      title: S.name,
      info: "система · класс " + CLS[this.star.ci].c + " · планет: " + S.planets.length +
        (S.belt ? " · пояс" : "") + " · комет: " + S.comets.length +
        (ship ? " · корабль: " + shipRu : "") + " · топливо: " + Math.round(player.fuel)
    };
  }
  selectedInfo(){
    const S = this.S;
    if (S.bhOnly) return {
      name: S.name,
      detail: S.jets ? "квазар: аккреционный диск, джеты и S-звёзды" : "сверхмассивная ЧД: диск и S-звёзды"
    };
    if(this.lockedNpc){
      const npc=this.lockedNpc,ship=npc.ship,player=this.playerShip;
      const a=player?.globPos(this),b=ship.globPos(this),distance=a?Math.hypot(a[0]-b[0],a[1]-b[1]):0;
      const hull=ship.prop.slots.hull.stats.hullInt||100;
      return {name:"ЗАХВАТ · " + npc.name,
        detail:"роль: " + npc.role + " · цель: " + npc.agent.state.goal +
          "<br>прочность " + Math.max(0,Math.round(ship.integrity||hull)) + "/" + hull +
          " · дистанция " + fmtDist(distance) +
          "<br>приказ: " + ({follow:"следовать",attack:"следовать и атаковать"}[this.playerOrder?.mode]||"нет")};
    }
    if (!this.sel) return { name: S.name, detail: "кликните по любому телу: планете, луне, комете, обломку или звезде" };
    const o = this.obj(this.sel);
    if (this.sel.kind === "star"){
      const cls = CLS[this.star.ci];
      return {
        name: this.S.name,
        detail: "спектральный класс " + cls.c + " · ≈" + cls.temp.toLocaleString("ru-RU") + " K" +
          " · Ø " + this.S.sun.D + " px<br>" + (cls.c === "O" ? "голубой сверхгигант" :
          cls.c === "M" ? "красный карлик" : cls.c === "L" ? "коричневый карлик" : "звезда главной последовательности") +
          "<br>возможен выход на орбиту (посадка — нет)"
      };
    }
    if (this.sel.kind === "cargo"){
      const f = this.cargoField[this.sel.i];
      if (!f) return { name:"—", detail:"контейнер подобран" };
      return { name:"Контейнер · " + f.item.name,
        detail: "масса " + f.item.mass.toFixed(1) + " т · " +
          (f.landed ? "лежит на поверхности" : "дрейфует по орбите") +
          "<br>подойдите с захватом — груз возьмётся сам" };
    }
    const st = this.statsOf(this.sel);
    if (this.sel.kind === "comet")
      return { name: this.label(this.sel),
        detail: "комета · a=" + Math.round(o.a) + " · e=" + o.e.toFixed(2) +
          " · сейчас r=" + Math.round(o.r) +
          (st ? "<br>T ядра: " + (st.tempC > 0 ? "+" : "") + st.tempC + " °C · " + st.liquid : "") };
    if (this.sel.kind === "rock")
      return { name: this.label(this.sel),
        detail: "обломок пояса · орбита " + Math.round(o.dist) +
          (st ? "<br>недра: " + st.minerals : "") };
    const base = this.sel.kind === "planet"
      ? PT_RU[o.type] + " · орбита " + o.dist + " · спутников: " + o.moonList.length
      : "спутник · " + PT_RU[o.type] + " · Ø " + o.size + " px";
    return {
      name: this.label(this.sel),
      detail: base + (st ? "<br>T ср: " + (st.tempC > 0 ? "+" : "") + st.tempC +
        " °C · " + st.pressure + "<br>атмосфера: " + st.atm : "")
    };
  }
  primary(){
    if (this.S.bhOnly) return { label:"← к галактике", run: () => this.mgr.pop() };
    if (this.canLand()){
      return { label:"Посадка", run: () => {
        this.playerShip.land(this.sel);
        this.mgr.push(new LandingScene(this, { ...this.sel }, this.statsOf(this.sel)));
      } };
    }
    if (this.playerShip && this.canApproachForLanding()){
      const h = this.landingApproachAlt();
      return { label:"Посадка → подлёт к поверхности", run: () => {
        this.playerShip.fsdTo(this.sel, h);
        this.mgr.onChange?.();
      } };
    }
    if (this.sel && this.playerShip){
      return { label:"FSD → орбита " + fmtDist(this.orbitAlt) + " (F)", run: () => {
        this.playerShip.fsdTo(this.sel, this.orbitAlt);
        this.mgr.onChange?.();
      } };
    }
    return { label:"Полёт к объекту", run: () => {
      if (this.sel) this.mgr.push(new BodyScene(this, this.sel));
    } };
  }
  panelSpec(){
    if (this.S.bhOnly) return [];
    const sh = this.playerShip;
    const spec = [];

    /* ---------- корабль ---------- */
    if (sh){
      const p = sh.prop;
      const ps = primaryState(this, sh.primary);
      const g = ps && ps.mu > 0 ? ps.mu/(ps.bodyR*ps.bodyR) : 0;
      spec.push({ kind:"sect", label:"Корабль" });
      spec.push({ kind:"readout", label:"Двигательная установка",
        value: "масса " + fmtMass(p.mass) + " (сухая " + fmtMass(p.dryMass) + ")" +
          "<br>тяга " + p.engine.thrust + " кН · Iₛₚ " + p.engine.isp + " с" +
          "<br>ускорение " + p.accelFullMs.toFixed(2) + " м/с² · TWR " +
          (g > 0 ? p.twr(g).toFixed(2) : "—") +
          "<br>запас ΔV " + fmtDv(p.deltaV) + " · топливо " +
          p.fuel.toFixed(1) + " / " + p.tank.fuel + " т" });
      spec.push({ kind:"range", label:"РУД (Shift/Ctrl, Z, X)", min:0, max:100, step:5,
        get:() => Math.round(p.throttle*100), set:v => { p.throttle = v/100; },
        fmt:v => v + " %" });
      const sasBtn = (id, lbl) => ({ label:lbl, sel: sh.sas === id,
        run: () => { sh.sas = sh.sas === id ? "off" : id; } });
      spec.push({ kind:"buttons", items:[
        sasBtn("prograde","▲ прогр"), sasBtn("retrograde","▼ ретро"),
        sasBtn("radial","◀ радиал"), sasBtn("node","◆ узел") ] });
      spec.push({ kind:"select", label:"Двигатель",
        options: ENGINES.map(e => [e.id, e.name + " · " + e.thrust + " кН"]),
        get:() => p.engine.id, set:v => p.setEngine(v) });
      spec.push({ kind:"select", label:"Топливный бак",
        options: TANKS.map(t => [t.id, t.name + " · " + t.fuel + " т"]),
        get:() => p.tank.id, set:v => p.setTank(v) });
      if (sh.mode === "landed")
        spec.push({ kind:"action", label:"Заправить бак", run: () => p.refuel() });
    }

    if(this.world){
      spec.push({kind:"sect",label:"Мир"});
      spec.push({kind:"action",label:"Сохранить мир",run:()=>{this.world.capture(this);this.world.persist();this.combatMsg="мир сохранён";}});
    }

    if(sh && this.lockedNpc){
      const p=sh.prop;
      spec.push({kind:"sect",label:"Захват цели · " + this.lockedNpc.name});
      spec.push({kind:"buttons",items:[
        {label:"Следовать",sel:this.playerOrder?.mode==="follow",run:()=>this.issueNpcOrder("follow")},
        {label:"Следовать и атаковать",sel:this.playerOrder?.mode==="attack",run:()=>this.issueNpcOrder("attack")}
      ]});
      spec.push({kind:"action",label:"Снять захват",run:()=>this.lockNpc(null)});
      const mounts=p.slotDefs.filter(slot=>slot.id.startsWith("weapon")&&p.slots[slot.id]);
      if(mounts.length){
        spec.push({kind:"readout",label:"Орудия",value:"1–5: выбрать пилон · Space: огонь по захваченной цели"});
        spec.push({kind:"buttons",items:mounts.map(slot=>({
          label:slot.id.slice(-1)+" · "+p.slots[slot.id].name,
          sel:p.activeWeaponSlot===slot.id,
          run:()=>{p.activeWeaponSlot=slot.id;}
        }))});
        spec.push({kind:"action",label:"Огонь по цели (Space)",run:()=>this.fireWeapon()});
      }
    }

    /* ---------- орбита ---------- */
    if (sh && sh.mode === "newton"){
      const el = sh.els(this);
      if (el){
        const ap = isFinite(el.ra) ? fmtDist(el.ra - el.ps.bodyR) : "—";
        spec.push({ kind:"sect", label:"Орбита" });
        spec.push({ kind:"readout", label:"Элементы",
          value: "апоцентр " + ap + " · до Ап " + fmtTime(timeToApo(el)) +
            "<br>перицентр " + fmtDist(el.rp - el.ps.bodyR) + " · до Пе " + fmtTime(timeToPeri(el)) +
            "<br>e " + el.e.toFixed(4) + " · a " + fmtDist(el.a) +
            (isFinite(el.period) ? " · период " + fmtTime(el.period) : " · незамкнутая") +
            "<br>скорость " + fmtSpeed(el.v) + " · вертикальная " + fmtSpeed(el.vr) +
            "<br>радиус SOI " + fmtDist(el.ps.soi) + " · g₀ " +
            (el.ps.mu/(el.ps.bodyR*el.ps.bodyR)*DU_M).toFixed(2) + " м/с²" });
      }
    }

    /* ---------- манёвры ---------- */
    if (sh && sh.mode === "newton"){
      spec.push({ kind:"sect", label:"Планировщик манёвров" });
      const n = sh.manNode;
      if (n){
        const after = sh.nodeOrbit(this);
        const bt = sh.prop.burnTime(n.dv);
        const ps = primaryState(this, sh.primary);
        spec.push({ kind:"readout", label:"Узел манёвра",
          value: "Δv " + fmtDv(n.dv) + " · прожиг " + fmtTime(bt) +
            "<br>прогрейд " + fmtDv(n.dvPro) + " · радиально " + fmtDv(n.dvRad) +
            "<br>до узла " + fmtTime(n.eta) +
            "<br>после: Ап " + (after && isFinite(after.el.ra)
              ? fmtDist(after.el.ra - after.ps.bodyR) : "уход из SOI") +
            " · Пе " + (after ? fmtDist(after.el.rp - after.ps.bodyR) : "—") +
            (after && after.el.rp < after.ps.bodyR
              ? " <span style='color:#ff5c4d'>· столкновение!</span>" : "") +
            "<br>запас ΔV " + fmtDv(sh.prop.deltaV) +
            (sh.prop.canAfford(n.dv) ? "" : " <span style='color:#ff9a6b'>— не хватает</span>") });
        spec.push({ kind:"buttons", items:[1, 10, 100].map(v => ({
          label: v + " м/с", sel: this.nodeStep === v,
          run: () => { this.nodeStep = v; } })) });
        const s = this.nodeStep;
        spec.push({ kind:"buttons", items:[
          { label:"▲ прогрейд +" + s, run:() => sh.nudgeNode(s, 0, 0) },
          { label:"▼ ретро −" + s,     run:() => sh.nudgeNode(-s, 0, 0) } ] });
        spec.push({ kind:"buttons", items:[
          { label:"► радиально +" + s, run:() => sh.nudgeNode(0, s, 0) },
          { label:"◄ радиально −" + s, run:() => sh.nudgeNode(0, -s, 0) } ] });
        spec.push({ kind:"buttons", items:[
          { label:"−1 мин", run:() => sh.nudgeNode(0, 0, -60) },
          { label:"+1 мин", run:() => sh.nudgeNode(0, 0, 60) },
          { label:"+10 мин", run:() => sh.nudgeNode(0, 0, 600) } ] });
        if (ps && ps.mu > 0){
          const el = elements(ps.mu, sh.rx, sh.ry, sh.rvx, sh.rvy);
          spec.push({ kind:"buttons", items:[
            { label:"узел → Ап", run:() => { n.eta = timeToApo(el); } },
            { label:"узел → Пе", run:() => { n.eta = timeToPeri(el); } },
            { label:"сброс Δv",  run:() => { n.dvPro = 0; n.dvRad = 0; } } ] });
        }
        spec.push({ kind:"buttons", items:[
          { label: sh.nodeAuto ? "◼ идёт прожиг" : "▶ Исполнить (N)", run:() => sh.executeNode() },
          { label:"Отменить", run:() => sh.cancelNode() } ] });
      } else {
        spec.push({ kind:"buttons", items:[
          { label:"Циркуляризация в Ап (M)", run:() => this.planCirc(true) },
          { label:"в Пе (C)", run:() => this.planCirc(false) } ] });
        spec.push({ kind:"action", label:"Переход на высоту h (H)",
          run:() => this.planTransfer() });
        const ps = primaryState(this, sh.primary);
        if (ps && ps.mu > 0){
          const b = hohmannBudget(ps.mu, Math.hypot(sh.rx, sh.ry), ps.bodyR + this.orbitAlt);
          spec.push({ kind:"readout", label:"Смета перехода",
            value: "1-й импульс " + fmtDv(b.dv1) + " · 2-й " + fmtDv(b.dv2) +
              "<br>итого " + fmtDv(b.total) + " · в пути " + fmtTime(b.transferTime) });
        }
      }
    }

    /* ---------- груз и снаряжение ---------- */
    spec.push({ kind:"sect", label:"Снаряжение" });
    spec.push({ kind:"action", label:"Экран корабля · экипировка (B)",
      run: () => this.mgr.push(new OutfitScene(this)) });
    if (sh){
      const sc = sh.prop.scoop;
      spec.push({ kind:"readout", label:"Захват",
        value: sc ? sc.name + " · подбор " + fmtDist(sc.grabRange) +
              (sc.scoopRate > 0
                ? "<br>сбор топлива " + (sc.scoopRate*60).toFixed(1) +
                  " т/мин на высоте до " + sc.scoopAlt + " радиуса звезды"
                : "<br>сбор топлива недоступен") +
              "<br>трюм " + sh.prop.cargoMass.toFixed(1) + " / " + sh.prop.cargoCap + " т"
            : "не установлен" });
      if (this.sel && this.sel.kind === "cargo"){
        spec.push({ kind:"action", label:"FSD к контейнеру",
          run: () => { sh.fsdTo(this.sel, 4); this.mgr.onChange?.(); } });
      }
    }

    /* ---------- навигация ---------- */
    spec.push({ kind:"sect", label:"Навигация" });
    spec.push({ kind:"range", label:"Высота орбиты", min:6, max:120, step:2,
      get:() => this.orbitAlt, set:v => { this.orbitAlt = v; },
      fmt:v => fmtDist(v) });
    if (this.sel && sh && sh.mode !== "landed"){
      spec.push({ kind:"action", label:"FSD к выбранному (F)",
        run: () => { sh.fsdTo(this.sel, this.orbitAlt); this.mgr.onChange?.(); } });
    }
    spec.push({ kind:"check", label:"Следить за выбранным",
      get:() => this.follow, set:v => { this.follow = v; if (v) this.followShip = false; } });
    spec.push({ kind:"check", label:"Камера: корабль",
      get:() => this.followShip, set:v => { this.followShip = v; if (v) this.follow = false; } });
    if (this.sel) spec.push({ kind:"action", label:"Осмотреть (крупный план)",
      run: () => this.mgr.push(new BodyScene(this, { ...this.sel })) });
    return spec;
  }
}
