/** Projectiles live in absolute system coordinates.  They are deliberately
 * lightweight: orbital simulation remains owned by ships, while weapons are
 * short-range combat effects with optional terminal guidance. */
export class WeaponProjectile {
  constructor(source,spec,target=null,system){
    const [x,y]=source.globPos(system);
    const [vx,vy]=source.globVel(system);
    this.x=x;this.y=y;this.vx=vx+Math.cos(source.nose)*spec.speed;this.vy=vy+Math.sin(source.nose)*spec.speed;
    this.source=source;this.spec=spec;this.target=target;this.life=spec.range/spec.speed;this.armed=spec.mine?0.7:0;
    this.detonating=0;this.hit=false;
  }
  update(dt,scene){
    if(this.detonating){this.detonating-=dt;return this.detonating>0;}
    const step=Math.min(0.1,Math.max(0,dt));
    this.life-=dt;this.armed-=dt;
    if(this.spec.guided&&this.target&&!this.target.destroyed){
      const [tx,ty]=this.target.globPos(scene),dx=tx-this.x,dy=ty-this.y,d=Math.hypot(dx,dy)||1;
      const speed=this.spec.speed,turn=this.spec.nuclear?.12:.22;
      this.vx+=(dx/d*speed-this.vx)*turn;this.vy+=(dy/d*speed-this.vy)*turn;
    }
    this.x+=this.vx*step;this.y+=this.vy*step;
    return this.life>0;
  }
  detonate(){this.hit=true;this.detonating=this.spec.nuclear?.7:.34;}
  draw(sctx,ssx,ssy,t){
    const x=Math.round(ssx(this.x)),y=Math.round(ssy(this.y));
    if(this.detonating){
      const r=Math.max(2,Math.round((1-this.detonating/(this.spec.nuclear?.7:.34))*(this.spec.splash||5)*2));
      sctx.fillStyle=this.spec.nuclear?"rgba(255,180,80,.55)":"rgba(143,208,255,.55)";sctx.fillRect(x-r,y-r,r*2,r*2);return;
    }
    sctx.fillStyle=this.spec.color||"#ffffff";
    const size=this.spec.mine?3:(this.spec.torpedo||this.spec.nuclear?3:2);
    sctx.fillRect(x-Math.floor(size/2),y-Math.floor(size/2),size,size);
    if(!this.spec.mine){sctx.globalAlpha=.45;sctx.fillRect(x-3,y,3,1);sctx.globalAlpha=1;}
  }
}
