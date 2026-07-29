import { SurfaceRenderer } from "../gen/surface-renderer.js";
import { player } from "../game/player.js";
import { lblText } from "../ui/panel.js";

function fallbackSurface(sys,stats={}){
  return {
    tempK:(stats.tempC||0)+273,pressure:stats.hasAtm?1:0,gravity:Number(stats.grav)||1,
    starT:sys.S.sun.temp,starLum:1,orbitAU:1,gN2:.78,gO2:.21,gCO2:.01,gCH4:0,gSO2:0,gH2O:.01,
    dust:0,haze:0,wind:.2,liquid:0,liquidType:"none",humidity:0,vegetation:0,flora:110,
    volcanism:0,minerals:.4,magnetic:0,relief:.5,roughness:.5,cloudCover:0,cloudHeight:.4,
    cloudSpeed:.5,plantDensity:0,plantSize:1,colony:0
  };
}

/** Landing view.  The whole canvas is delegated to SurfaceRenderer, which is
 * the adapted renderer from the supplied surface-generator reference. */
export class LandingScene {
  constructor(sys,selRef,stats){
    this.sys=sys; this.selRef=selRef; this.stats=stats; this.crumb="Поверхность";
    this.p=sys.obj(selRef);
    this.surface=this.p.surface||fallbackSurface(sys,stats);
    const seed=(this.p.seed??this.p.rseed??((this.p.id||1)*77))|0;
    this.renderer=new SurfaceRenderer(this.surface,seed,420,420);
    player.refuel();
    sys.playerShip?.prop.refuel();
  }
  update(dt){this.sys.update(dt);}
  dayPhase(){
    const k=this.selRef.kind;
    const src=k==="comet"?this.p.th:(k==="rock"?this.p.ang:this.p.rot);
    return ((src%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
  }
  draw(t){this.renderer.render(this.ctx.sctx,t,this.dayPhase());}
  drawLabels(){
    const hours=((this.dayPhase()/(Math.PI*2))*24+6)%24;
    const hh=String(Math.floor(hours)).padStart(2,"0"),mm=String(Math.floor((hours%1)*60)).padStart(2,"0");
    lblText(this.ctx,"местное время "+hh+":"+mm+" · T "+(this.stats.tempC>0?"+":"")+this.stats.tempC+
      " °C · "+this.stats.pressure+" · "+this.renderer.weather,12,this.ctx.LW-14,"#dfe4ff",12);
  }
  status(){return {title:this.sys.label(this.selRef)+" · поверхность",info:this.stats.typeRu+" · "+this.stats.atm+" · заправлено (топливо 100)"};}
  selectedInfo(){
    const st=this.stats,q=this.surface;
    return {name:this.sys.label(this.selRef),detail:"T ср: "+(st.tempC>0?"+":"")+st.tempC+" °C · "+st.pressure+
      "<br>жидкость: "+st.liquid+" · облачность: "+Math.round(q.cloudCover*100)+"%"+
      "<br>рельеф: "+Math.round(q.relief*100)+"% · погода: "+this.renderer.weather};
  }
  primary(){return {label:"Взлёт",run:()=>{const ship=this.sys.playerShip;if(ship)ship.takeoff(this.sys,this.sys.orbitAlt);this.mgr.pop();}};}
  panelSpec(){return [];}
}
