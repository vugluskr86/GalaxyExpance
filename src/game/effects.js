/**
 * Shared bounded particle pool for system-space effects.
 *
 * Effects never participate in collision, saving or orbital physics. A stable
 * seed plus an incrementing event counter chooses their initial vectors, while
 * LOD only changes how many of the already pooled particles are allowed to
 * render. That keeps combat readable without making visual detail change game
 * outcomes or allocate objects during a battle.
 */
import { hash2i } from "../core/rng.js";
import { configValue } from "../config/balance.js";

export const EFFECT_CAPS=Object.freeze([96,240,480]);
const palettes={
  ion:["#c8f4ff","#63bfff","#3974ff"], chemical:["#fff0ae","#ffb357","#ff704d"], nuclear:["#efffb8","#9ee5ed","#6db6ff"],
  laser:["#fff0ff","#ff7ad9","#bc57ff"], energy:["#f3ffff","#8fd0ff","#3e86ff"], kinetic:["#fff4c7","#ffd166","#cc763c"],
  missile:["#fff4b0","#ffb357","#ea5d45"], torpedo:["#fff2bf","#ff9a6b","#c95654"], emp:["#fff0ff","#c9a0e8","#7963d8"],
  nuclearHit:["#fffbd2","#ffc86b","#f06b43"], shield:["#e7fcff","#8fd0ff","#4d76ff"], hull:["#fff3c5","#ff9a6b","#cc4d44"], mine:["#fff1b5","#ff8d5c","#dc4e45"]
};
const engineKind=engine=>engine?.id?.includes("ion")?"ion":engine?.id?.includes("nuke")?"nuclear":"chemical";
const weaponKind=spec=>spec?.weaponType==="nuclear"?"nuclearHit":spec?.weaponType||"kinetic";

export class EffectPool {
  constructor(seed=1){this.seed=seed>>>0;this.sequence=0;this.particles=[];this.engineClock=new WeakMap();}
  cap(lod=1){const caps=[configValue("effects.maxParticlesLod0"),configValue("effects.maxParticlesLod1"),configValue("effects.maxParticlesLod2")];return caps[Math.max(0,Math.min(caps.length-1,lod|0))];}
  _rand(salt){return (hash2i(this.seed,this.sequence,salt)>>>0)/0x100000000;}
  emit(kind,x,y,{count=8,scale=1,vx=0,vy=0}={},lod=1){
    const cap=this.cap(lod),colors=palettes[kind]||palettes.hull,available=Math.max(0,cap-this.particles.length),take=Math.min(available,Math.max(0,count|0));
    for(let index=0;index<take;index++){
      const angle=this._rand(index*7+1)*Math.PI*2,velocity=(.8+this._rand(index*7+2)*3.6)*scale,life=.14+this._rand(index*7+3)*(.25+scale*.16);
      this.particles.push({x,y,vx:vx+Math.cos(angle)*velocity,vy:vy+Math.sin(angle)*velocity,life,maxLife:life,size:1+(this._rand(index*7+4)*2|0),color:colors[index%colors.length]});
    }
    this.sequence=(this.sequence+1)>>>0;return take;
  }
  engine(ship,scene,dt,lod=1){
    if(!ship?.burning||!ship.prop?.engine||ship.prop.throttle<=0)return;
    const elapsed=(this.engineClock.get(ship)||0)+Math.max(0,dt),period=lod===0?.15:lod===1?.08:.045;
    if(elapsed<period){this.engineClock.set(ship,elapsed);return;}this.engineClock.set(ship,0);
    const [x,y]=ship.globPos(scene),throttle=ship.prop.throttle,engine=ship.prop.engine;
    this.emit(engineKind(engine),x-Math.cos(ship.nose)*2,y-Math.sin(ship.nose)*2,{count:lod===0?1:2,scale:Math.max(.5,throttle*(engine.thrust||1)/160),vx:-Math.cos(ship.nose)*throttle*4,vy:-Math.sin(ship.nose)*throttle*4},lod);
  }
  muzzle(source,spec,scene,lod=1){const [x,y]=source.globPos(scene);return this.emit(weaponKind(spec),x+Math.cos(source.nose)*2,y+Math.sin(source.nose)*2,{count:lod===0?2:5,scale:spec.nuclear?3:spec.weaponType==="laser"?.6:1,vx:Math.cos(source.nose)*(spec.speed||1)*.015,vy:Math.sin(source.nose)*(spec.speed||1)*.015},lod);}
  impact(shot,target,shielded,lod=1){const kind=shot.spec.emp?"emp":shot.spec.nuclear?"nuclearHit":shielded?"shield":weaponKind(shot.spec);return this.emit(kind,shot.x,shot.y,{count:lod===0?4:shot.spec.nuclear?40:shielded?15:11,scale:shot.spec.nuclear?5:Math.max(.8,(shot.spec.damage||1)/42)},lod);}
  update(dt){const step=Math.max(0,Math.min(.12,dt));for(const particle of this.particles){particle.life-=step;particle.x+=particle.vx*step;particle.y+=particle.vy*step;particle.vx*=.94;particle.vy*=.94;}this.particles=this.particles.filter(particle=>particle.life>0);}
  draw(sctx,ssx,ssy,lod=1){
    const limit=this.cap(lod);for(let index=0;index<Math.min(limit,this.particles.length);index++){
      const particle=this.particles[index],alpha=Math.max(0,particle.life/particle.maxLife);sctx.globalAlpha=alpha;sctx.fillStyle=particle.color;
      const size=lod===0?1:particle.size;sctx.fillRect(Math.round(ssx(particle.x))-Math.floor(size/2),Math.round(ssy(particle.y))-Math.floor(size/2),size,size);
    }sctx.globalAlpha=1;
  }
}
