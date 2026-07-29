/**
 * Configurable NPC decision and tactical layer. Goals decide what an agent
 * wants to do; orders and combat are continuous controls run every frame.
 */
export const AGENT_PROFILES=Object.freeze({
  trader:{role:"Торговец",faction:"civilian",cadence:[90,180],goalWeights:{trade:9,delivery:6,explore:1,flee:2},risk:.2,engagementRange:38,followDistance:28},
  patrol:{role:"Патруль",faction:"security",cadence:[55,125],goalWeights:{patrol:8,defend:6,trade:1,hunt:2},risk:.5,engagementRange:55,followDistance:42},
  geologist:{role:"Геолог",faction:"civilian",cadence:[110,230],goalWeights:{survey:9,mine:7,trade:2,flee:2},risk:.25,engagementRange:28,followDistance:30},
  courier:{role:"Курьер",faction:"civilian",cadence:[65,145],goalWeights:{delivery:10,trade:4,explore:2,flee:3},risk:.3,engagementRange:30,followDistance:26},
  ranger:{role:"Рейнджер",faction:"security",cadence:[70,160],goalWeights:{explore:8,patrol:4,defend:4,survey:3},risk:.55,engagementRange:50,followDistance:40},
  pirate:{role:"Пират",faction:"pirate",cadence:[45,100],goalWeights:{hunt:9,raid:7,explore:1,flee:2},risk:.75,engagementRange:75,followDistance:48}
});

const clone=value=>({...value,goalWeights:{...(value.goalWeights||{})},rules:[...(value.rules||[])],hooks:{...(value.hooks||{})}});
const merge=(base,extra={})=>({...clone(base),...extra,goalWeights:{...base.goalWeights,...(extra.goalWeights||{})},rules:[...(base.rules||[]),...(extra.rules||[])],hooks:{...base.hooks,...(extra.hooks||{})}});
const same=(a,b)=>a&&b&&a.kind===b.kind&&a.i===b.i&&a.j===b.j;

export class AgentController {
  constructor(profile="trader",config={},seed=1){
    const base=typeof profile==="string"?AGENT_PROFILES[profile]||AGENT_PROFILES.trader:profile;
    this.profileId=typeof profile==="string"?profile:"custom";
    this.config=merge(base,config);this.seed=seed>>>0||1;
    this.state={goal:"idle",target:null,nextDecision:0,blackboard:Object.create(null),history:[],credits:500+this.random()*2500,order:null,combatTarget:null};
  }
  random(){this.seed=(this.seed*1664525+1013904223)>>>0;return this.seed/0x100000000;}
  configure(patch={}){this.config=merge(this.config,patch);return this;}
  remember(type,data={}){this.state.history.unshift({type,data,time:this.state.blackboard.time||0});this.state.history.length=16;}
  /** Scriptable escort/attack order. `target` is a Ship, not a celestial ref. */
  setOrder(mode,target,options={}){this.state.order=target?{mode,target,distance:options.distance??this.config.followDistance}:null;this.remember("order",{mode,target:target?.id||null});return this;}
  targets(sys){const out=[];for(let i=0;i<sys.S.planets.length;i++){out.push({kind:"planet",i,j:0});for(let j=0;j<sys.S.planets[i].moonList.length;j++)out.push({kind:"moon",i,j});}return out;}
  chooseTarget(ship,sys){const all=this.targets(sys).filter(target=>!same(target,ship.primary));return all.length?all[Math.floor(this.random()*all.length)]:ship.primary;}
  condition(rule,npc,sys){
    if(typeof rule.when==="function")return !!rule.when({agent:this,npc,sys,state:this.state});
    const ship=npc.ship,player=sys.playerShip;
    if(rule.when==="damaged")return ship.integrity<(ship.prop.slots.hull.stats.hullInt||100)*(rule.below??.45);
    if(rule.when==="player_near"&&player){const a=ship.globPos(sys),b=player.globPos(sys);return Math.hypot(a[0]-b[0],a[1]-b[1])<(rule.range??this.config.engagementRange);}
    if(rule.when==="cargo_full")return ship.prop.cargoMass>=ship.prop.cargoCap*.8;
    return false;
  }
  isHostile(npc,target,sys){
    if(!target||target.destroyed)return false;
    if(typeof this.config.isHostile==="function")return !!this.config.isHostile({agent:this,npc,target,sys});
    const own=this.config.faction||"civilian",other=target===sys.playerShip?"player":target._npc?.agent?.config.faction||"civilian";
    return own==="pirate"?other!=="pirate":own==="security"?other==="pirate":false;
  }
  hostileTarget(npc,sys){
    const all=[sys.playerShip,...(sys.npcs||[]).map(other=>other.ship)].filter(target=>target&&target!==npc.ship&&this.isHostile(npc,target,sys));
    if(!all.length)return null;
    const [x,y]=npc.ship.globPos(sys);
    return all.sort((a,b)=>{const ap=a.globPos(sys),bp=b.globPos(sys);return Math.hypot(ap[0]-x,ap[1]-y)-Math.hypot(bp[0]-x,bp[1]-y);})[0];
  }
  /** Autonomous formation holding. FSD only joins the target primary, then
   * Newtonian thrust keeps distance and faces the ship for firing. */
  follow(npc,target,options={},sys){
    const ship=npc.ship;if(!target||target.destroyed||ship.destroyed||ship.mode==="landed")return false;
    const wanted=options.distance??this.config.followDistance??30;
    if(!same(ship.primary,target.primary)){
      if(ship.mode!=="cruise"||!same(ship.target,target.primary))ship.fsdTo(target.primary,Math.max(10,wanted));
      return false;
    }
    if(ship.mode!=="newton")return false;
    const [sx,sy]=ship.globPos(sys),[tx,ty]=target.globPos(sys),dx=tx-sx,dy=ty-sy,distance=Math.hypot(dx,dy)||.001;
    let heading=Math.atan2(dy,dx),thrust=distance>wanted*1.15;
    if(distance<wanted*.68){heading+=Math.PI;thrust=true;}
    ship.nose=heading;ship.ctrl.left=false;ship.ctrl.right=false;ship.ctrl.retro=false;ship.ctrl.thrust=thrust;ship.prop.throttle=thrust?(distance>wanted*2?.6:.32):0;
    this.state.blackboard.distance=distance;
    const range=ship.prop.activeWeapon?.stats?.range||0;
    if(options.attack&&range&&distance<=range)sys.fireNpcWeapon?.(npc,target);
    return true;
  }
  combat(npc,target,sys){
    if(!target||target.destroyed)return false;
    this.state.combatTarget=target;
    const range=npc.ship.prop.activeWeapon?.stats?.range||this.config.engagementRange;
    return this.follow(npc,target,{attack:true,distance:Math.max(14,Math.min(this.config.followDistance||35,range*.58))},sys);
  }
  pickGoal(npc,sys){
    for(const rule of this.config.rules||[])if(this.condition(rule,npc,sys))return {goal:rule.action||"flee",target:rule.target?.({agent:this,npc,sys})};
    const weights=this.config.goalWeights||{},sum=Object.values(weights).reduce((n,v)=>n+Math.max(0,v),0)||1;let cursor=this.random()*sum;
    for(const [goal,weight] of Object.entries(weights)){cursor-=Math.max(0,weight);if(cursor<=0)return {goal};}return {goal:"explore"};
  }
  act(npc,sys,choice){
    const ship=npc.ship,goal=choice.goal,target=choice.target||this.chooseTarget(ship,sys);this.state.goal=goal;this.state.target=target;this.remember("goal",{goal,target});this.config.hooks?.onGoal?.({agent:this,npc,sys,goal,target});
    if(goal==="hunt"||goal==="raid"||goal==="defend"){const enemy=this.hostileTarget(npc,sys);if(enemy){this.state.blackboard.enemy=enemy===sys.playerShip?"player":"npc";this.combat(npc,enemy,sys);return;}}
    if(goal==="flee"){const all=this.targets(sys),away=all.find(item=>!same(item,ship.primary))||target;if(away)ship.fsdTo(away,28+this.random()*18);return;}
    if(target&&!same(target,ship.primary))ship.fsdTo(target,12+this.random()*24);
  }
  update(npc,dt,sys){
    const state=this.state,ship=npc.ship;state.blackboard.time=(state.blackboard.time||0)+dt;if(ship.destroyed)return;
    const order=state.order;if(order?.target&&!order.target.destroyed){this.follow(npc,order.target,{distance:order.distance,attack:order.mode==="attack"},sys);return;}if(order)state.order=null;
    if(state.combatTarget&&!state.combatTarget.destroyed){this.combat(npc,state.combatTarget,sys);return;}state.combatTarget=null;
    state.nextDecision-=dt;if(state.nextDecision>0||ship.mode==="cruise")return;
    this.act(npc,sys,this.pickGoal(npc,sys));const [min,max]=this.config.cadence||[90,180];state.nextDecision=min+this.random()*Math.max(1,max-min);
  }
}
export function createAgent(profile,config,seed){return new AgentController(profile,config,seed);}
