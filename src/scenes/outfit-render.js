/** Canvas renderer for the outfitting hangar. It intentionally contains no text. */
import { shipyardBindings, shipyardImage, shipyardPngSize } from "../game/shipyard.js";
const PARTICLES=84;
/* Each hull has its own pixel-art outline; the shared interior is a modular
 * deck plan rather than a texture, so installed equipment remains readable. */
const HULL_ART={
  scout:{body:[[-5,-132],[13,-105],[25,-48],[42,12],[23,91],[-23,91],[-42,12],[-25,-48],[-13,-105]],color:"#17325a"},
  vesta:{body:[[-8,-132],[18,-108],[35,-70],[74,-29],[70,-10],[42,2],[51,49],[36,82],[20,96],[-20,96],[-36,82],[-51,49],[-42,2],[-70,-10],[-74,-29],[-35,-70],[-18,-108]],color:"#14264a"},
  hauler:{body:[[-24,-122],[35,-94],[58,-48],[63,63],[38,98],[-38,98],[-63,63],[-58,-48],[-35,-94]],color:"#293250"},
  courier:{body:[[0,-138],[17,-96],[27,-12],[37,72],[18,100],[-18,100],[-37,72],[-27,-12],[-17,-96]],color:"#19345c"},
  interceptor:{body:[[0,-140],[42,-88],[82,-30],[38,-12],[48,62],[19,98],[-19,98],[-48,62],[-38,-12],[-82,-30],[-42,-88]],color:"#243060"},
  miner:{body:[[-28,-112],[38,-88],[71,-33],[69,49],[43,101],[-43,101],[-69,49],[-71,-33],[-38,-88]],color:"#493d3a"},
  explorer:{body:[[0,-136],[30,-102],[55,-47],[48,39],[30,100],[-30,100],[-48,39],[-55,-47],[-30,-102]],color:"#21445c"},
  gunship:{body:[[-12,-132],[26,-103],[67,-62],[86,-18],[48,5],[55,66],[30,99],[-30,99],[-55,66],[-48,5],[-86,-18],[-67,-62],[-26,-103]],color:"#3d294f"},
  corvette:{body:[[0,-140],[20,-115],[47,-65],[60,-16],[43,59],[25,103],[-25,103],[-43,59],[-60,-16],[-47,-65],[-20,-115]],color:"#24496a"},
  frigate:{body:[[-20,-137],[35,-109],[74,-57],[90,-5],[61,24],[63,75],[35,106],[-35,106],[-63,75],[-61,24],[-90,-5],[-74,-57],[-35,-109]],color:"#30375f"},
  freighter:{body:[[-39,-104],[42,-104],[72,-55],[75,62],[49,104],[-49,104],[-75,62],[-72,-55]],color:"#4b4050"},
  carrier:{body:[[-53,-119],[54,-119],[91,-50],[96,45],[58,106],[-58,106],[-96,45],[-91,-50]],color:"#354565"},
  dreadnought:{body:[[-32,-139],[49,-109],[94,-52],[101,47],[65,109],[-65,109],[-101,47],[-94,-52],[-49,-109]],color:"#4b3347"}
};

function resetParticle(p,initial=false){
  const n=p.index,phase=(n*47%101)/101;
  p.life=p.maxLife=0.24+phase*0.54;
  if(initial)p.life*=phase;
  p.x=(n&1?8:-8)+(phase-.5)*5;p.y=92+phase*20;
  p.vx=(phase-.5)*23;p.vy=88+((n*29)%37);p.size=n%7===0?3:(n%3===0?2:1);
  return p;
}
function particles(scene){
  return scene.exhaust ||= Array.from({length:PARTICLES},(_,index)=>resetParticle({index},true));
}
export function stepOutfitParticles(scene,dt){
  if(!scene.prop?.slots.engine||scene.prop.fuel<=0)return;
  const step=Math.min(0.08,Math.max(0,dt));
  for(const p of particles(scene)){
    p.life-=step;p.x+=p.vx*step;p.y+=p.vy*step;
    if(p.life<=0)resetParticle(p);
  }
}
export function selectOutfitSlot(scene,x,y){
  const hit=scene._shipHitboxes?.find(box=>x>=box.x&&x<=box.x+box.w&&y>=box.y&&y<=box.y+box.h);
  if(!hit)return;
  scene.slot=hit.slot;scene.sel=null;scene.mgr?.onChange?.();
}
function drawShipyardHull(scene,t,generated,cx,cy){
  const {sctx}=scene.ctx;
  // Keep the player's familiar system-map colour as the main hull shade. The
  // generator palette still changes accents, glass and engine metal per hull.
  const base=scene.sys.playerShip?.col||null;
  const layouts={
    steel:{h:"#6384ad",a:"#9abde5",g:"#b9f2ff",e:"#263957",m:"#d3dfeb"},
    rust:{h:"#885f46",a:"#c68a5e",g:"#9ee5ed",e:"#38251f",m:"#d5b092"},
    alien:{h:"#327d69",a:"#59b78a",g:"#d1ff8f",e:"#1c4b42",m:"#9ed6b6"},
    imperial:{h:"#a6aebc",a:"#edf1f5",g:"#9edfff",e:"#555b68",m:"#f8d786"},
    neon:{h:"#604d9e",a:"#ad76dc",g:"#ff9ee8",e:"#302450",m:"#8cecff"}
  };
  const palette=layouts[generated.palette]||layouts.steel;
  const colors=base?{h:base,a:"#ffe7a0",g:"#d6f8ff",e:"#6b4c1e",m:"#fff0bd"}:palette;
  const pngSize=shipyardPngSize(generated.image),fit=Math.min(370/pngSize.width,390/pngSize.height);
  const width=pngSize.width*fit,height=pngSize.height*fit,left=cx-width/2,top=cy-height/2;
  const image=shipyardImage(generated.pngDataUrl);
  if(image){sctx.save();sctx.imageSmoothingEnabled=false;sctx.drawImage(image,Math.round(left),Math.round(top),Math.round(width),Math.round(height));sctx.restore();}
  else if(generated.raster){
    // No fillRect behind the raster: the hangar star field deliberately stays
    // visible through the empty cells, just like a transparent exported PNG.
    for(let y=0;y<generated.raster.length;y++)for(let x=0;x<generated.raster[y].length;x++){
      const material=generated.raster[y][x];if(material===".")continue;
      sctx.fillStyle=colors[material]||colors.h;sctx.fillRect(Math.round(left+(x+1)*fit),Math.round(top+(y+1)*fit),Math.ceil(fit),Math.ceil(fit));
    }
  }
  scene._shipHitboxes=[{slot:"hull",x:left,y:top,w:width,h:height}];
  for(const binding of shipyardBindings(generated)){
    const x=left+binding.png.centerX*fit,y=top+binding.png.centerY*fit,size=Math.max(8,generated.image.scale*fit);
    const selected=binding.gameSlot===scene.slot,col=binding.gameSlot?"#ffd166":"#ff8d5c";
    if(binding.gameSlot)scene._shipHitboxes.unshift({slot:binding.gameSlot,x:x-size,y:y-size,w:size*2,h:size*2});
    sctx.strokeStyle=selected?"#fff3b0":col;sctx.lineWidth=selected?2:1;sctx.strokeRect(Math.round(x-size/2)+.5,Math.round(y-size/2)+.5,Math.round(size),Math.round(size));
    sctx.fillStyle=selected?"rgba(255,209,102,.35)":"rgba(9,15,35,.65)";sctx.fillRect(Math.round(x-1),Math.round(y-1),3,3);
  }
  const blink=.55+.45*Math.sin(t*6);
  if(scene.slot==="hull"){sctx.strokeStyle=`rgba(255,209,102,${blink})`;sctx.lineWidth=2;sctx.strokeRect(left+.5,top+.5,width-1,height-1);}
}
export function drawOutfitSilhouette(scene,t){
  const {sctx,SCR}=scene.ctx,p=scene.prop,cx=SCR/2,cy=SCR/2-2;
  const poly=(points,fill,stroke=null)=>{
    sctx.beginPath();sctx.moveTo(cx+points[0][0],cy+points[0][1]);
    for(const [x,y] of points.slice(1))sctx.lineTo(cx+x,cy+y);
    sctx.closePath();if(fill){sctx.fillStyle=fill;sctx.fill();}
    if(stroke){sctx.strokeStyle=stroke;sctx.lineWidth=2;sctx.stroke();}
  };
  const box=(x,y,w,h,fill,stroke="#2a4674")=>{
    sctx.fillStyle=fill;sctx.fillRect(cx+x,cy+y,w,h);
    sctx.strokeStyle=stroke;sctx.lineWidth=1;sctx.strokeRect(cx+x+.5,cy+y+.5,w-1,h-1);
  };
  sctx.fillStyle="#030713";sctx.fillRect(0,0,SCR,SCR);
  for(let i=0;i<68;i++){
    const x=(i*79+31)%SCR,y=(i*131+17)%SCR,twinkle=(Math.sin(t*1.5+i)*.5+.5);
    sctx.fillStyle=`rgba(111,183,255,${0.14+twinkle*0.25})`;
    sctx.fillRect(x,y,i%9===0?2:1,i%9===0?2:1);
  }
  const engineOn=!!p?.slots.engine&&p.fuel>0,intensity=engineOn?(p.throttle>0?1:0.46):0;
  if(engineOn){
    for(const side of [-1,1]){
      const glow=sctx.createLinearGradient(cx+side*8,cy+88,cx+side*8,cy+158);
      glow.addColorStop(0,"rgba(223,246,255,.85)");glow.addColorStop(.25,"rgba(80,192,255,.55)");glow.addColorStop(1,"rgba(31,74,255,0)");
      sctx.fillStyle=glow;sctx.fillRect(cx+side*8-5,cy+88,10,74*intensity);
    }
    const all=particles(scene),count=Math.round(all.length*intensity);
    for(let i=0;i<count;i++){
      const q=all[i],alpha=Math.max(0,q.life/q.maxLife)*intensity;
      sctx.fillStyle=q.size>1?`rgba(255,208,92,${alpha})`:`rgba(100,192,255,${alpha})`;
      sctx.fillRect(Math.round(cx+q.x),Math.round(cy+q.y),q.size,q.size);
    }
  }
  const generated=p?.slots.hull?.shipyard;
  if(generated){drawShipyardHull(scene,t,generated,cx,cy);return;}
  const art=HULL_ART[p?.slots.hull?.stats.hullSprite]||HULL_ART.vesta;
  poly(art.body,art.color,"#78bfff");
  poly([[-35,-70],[-74,-29],[-42,-10],[-18,-41]],"#1c3564","#4574ad");poly([[35,-70],[74,-29],[42,-10],[18,-41]],"#1c3564","#4574ad");
  poly([[-42,2],[-51,49],[-28,42],[-20,4]],"#203a6d","#4f80ba");poly([[42,2],[51,49],[28,42],[20,4]],"#203a6d","#4f80ba");
  poly([[-8,-124],[9,-102],[15,-73],[-15,-73],[-9,-102]],"#315b91","#9bc7ff");sctx.fillStyle="#6fb7ff";sctx.fillRect(cx-1,cy-122,2,43);
  box(-22,-63,44,26,"#0b172e");box(-17,-58,34,16,"#264e7d","#6fb7ff");
  for(let x=-12;x<=12;x+=8){sctx.fillStyle="#8fd0ff";sctx.fillRect(cx+x,cy-54,3,8);}
  const fuel=p?.fuelFrac??0;box(-19,-29,38,57,"#0a1529");
  if(p?.slots.tank){
    sctx.fillStyle="#1c355a";sctx.fillRect(cx-15,cy-25,30,49);const level=Math.round(45*fuel);
    sctx.fillStyle=fuel>.25?"#38a6d1":"#ff8d5c";sctx.fillRect(cx-12,cy+20-level,24,level);
    sctx.fillStyle="rgba(189,239,255,.45)";sctx.fillRect(cx-12,cy+20-level,24,2);
  }
  for(let y=-20;y<=18;y+=10){sctx.fillStyle="#426b9c";sctx.fillRect(cx-18,cy+y,36,1);}
  if(p?.slots.computer){
    box(25,-43,23,31,"#10233e","#5c9cda");sctx.fillStyle="#7ee08a";
    for(let i=0;i<5;i++)if((i+Math.floor(t*2))%3!==0)sctx.fillRect(cx+29+(i%2)*8,cy-36+Math.floor(i/2)*8,3,3);
    sctx.fillStyle="#315f91";sctx.fillRect(cx+26,cy-15,20,3);
  }else box(25,-43,23,31,"#0b1221","#273653");
  if(p?.slots.scoop){
    sctx.strokeStyle="#7db3e6";sctx.lineWidth=3;sctx.beginPath();sctx.moveTo(cx-39,cy+6);sctx.lineTo(cx-61,cy+25);sctx.lineTo(cx-69,cy+49);sctx.stroke();
    sctx.fillStyle="#315f91";sctx.fillRect(cx-75,cy+47,14,5);sctx.fillRect(cx-73,cy+52,4,8);
  }
  const hardpoints=[[-58,-42],[-51,7],[-28,63],[28,63],[51,7]];
  for(let i=0;i<5;i++){
    if(!p?.slotAvailable(`weapon${i+1}`))continue;
    const [hx,hy]=hardpoints[i],weapon=p?.slots[`weapon${i+1}`];
    if(weapon){
      box(hx,hy,18,14,"#151c32","#ffb85c");sctx.fillStyle=weapon.stats.color||"#ffd166";
      sctx.fillRect(cx+hx-9,cy+hy+4,29,5);sctx.fillRect(cx+hx-11,cy+hy+2,4,9);
    }else box(hx,hy,18,14,"#0b1221","#273653");
  }
  if(p?.shield){
    sctx.strokeStyle="#8fd0ff";sctx.lineWidth=2;sctx.beginPath();sctx.arc(cx,cy,108,0,Math.PI*2);sctx.stroke();
    const charge=(p.shield.charge??p.shield.stats.capacity)/p.shield.stats.capacity;
    sctx.fillStyle=`rgba(143,208,255,${.12+charge*.14})`;sctx.beginPath();sctx.arc(cx,cy,105,0,Math.PI*2);sctx.fill();
  }
  if(p?.droid){
    sctx.fillStyle="#7ee08a";for(let i=0;i<3;i++)sctx.fillRect(cx+35+i*4,cy+25+(i%2)*5,2,2);
  }
  if(p?.reactor){
    sctx.fillStyle="#c9a0e8";sctx.fillRect(cx-5,cy+47,10,10);sctx.fillStyle="#f5e6ff";sctx.fillRect(cx-2,cy+50,4,4);
  }
  box(-31,43,62,35,"#0a1327","#3f6b9e");
  for(const side of [-1,1]){const nx=side*13;box(nx-8,72,16,15,"#111b30","#6b91bd");sctx.fillStyle=engineOn?"#9bdcff":"#394a65";sctx.fillRect(cx+nx-4,cy+84,8,4);}
  if(!p?.slots.engine)box(-24,51,48,18,"#0b1020","#293754");
  sctx.strokeStyle="rgba(156,205,255,.35)";sctx.lineWidth=1;
  for(const y of [-36,34,43,78]){sctx.beginPath();sctx.moveTo(cx-30,cy+y);sctx.lineTo(cx+30,cy+y);sctx.stroke();}
  const frames={hull:[-103,-140,206,250],tank:[-23,-33,46,65],engine:[-35,40,70,53],scoop:[-80,0,31,62],shield:[-112,-140,224,250],droid:[28,16,24,22],reactor:[-12,40,24,24],weapon1:[-72,-52,41,48],weapon2:[-66,0,37,27],weapon3:[-38,56,38,25],weapon4:[19,56,38,25],weapon5:[42,0,37,27],computer:[22,-47,29,39]};
  scene._shipHitboxes=[];
  for(const [slot,[x,y,w,h]] of Object.entries(frames)){
    scene._shipHitboxes.push({slot,x:cx+x,y:cy+y,w,h});if(scene.slot!==slot)continue;
    const blink=.55+.45*Math.sin(t*6);sctx.strokeStyle=`rgba(255,209,102,${blink})`;sctx.lineWidth=2;sctx.strokeRect(cx+x+.5,cy+y+.5,w-1,h-1);
    sctx.fillStyle=`rgba(255,209,102,${.10*blink})`;sctx.fillRect(cx+x,cy+y,w,h);
  }
}
