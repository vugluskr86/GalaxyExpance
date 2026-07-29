import { mulberry32 } from "../core/rng.js";
import { fbm } from "../core/noise.js";
import { blackbody } from "../core/color.js";

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const mixRgb=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));
const mul=(a,k)=>a.map(v=>v*k);
const pack=(r,g,b)=>(255<<24)|((clamp(Math.round(b),0,255))<<16)|((clamp(Math.round(g),0,255))<<8)|clamp(Math.round(r),0,255);
const red=c=>c&255, green=c=>(c>>>8)&255, blue=c=>(c>>>16)&255;
const color=v=>pack(v[0]*255,v[1]*255,v[2]*255);
const GAS={gN2:[[.20,.47,1.12],[0,0,.01]],gO2:[[.20,.47,1.12],[.02,0,.01]],gCO2:[[.26,.50,.96],[.10,.05,.03]],gCH4:[[.10,.40,1.25],[.85,.22,.02]],gSO2:[[.52,.44,.34],[.03,.22,.90]],gH2O:[[.34,.44,.62],[.30,.10,.05]]};
const LIQUID={water:[.055,.23,.47],methane:[.055,.20,.24],ammonia:[.14,.34,.38],lava:[.85,.16,.025]};

function flora(h){
  const f=n=>{const k=(n+h/30)%12;return clamp(.28-.18*Math.max(-1,Math.min(k-3,9-k,1)),0,1);};
  return [f(0),f(8)+.18,f(4)];
}
function terrainMaterial(q){
  const mineral=mixRgb([.28,.25,.23],[.60,.31,.12],q.minerals||0);
  const green=flora(q.flora||110);
  return {rock:mixRgb(mineral,[.09,.1,.13],.28),soil:mineral,veg:mixRgb(mineral,green,clamp(q.vegetation||0)),liquid:LIQUID[q.liquidType]||LIQUID.water};
}

/**
 * Pixel landing renderer adapted from the supplied surface-generator canvas.
 * Unlike the old LandingScene backdrop, it rasterises a complete deterministic
 * climate scene: spectral sky, terrain layers, liquid, flora, settlement,
 * cloud types and weather all come from one generated surface profile.
 */
export class SurfaceRenderer {
  constructor(profile,seed,width=420,height=420){
    this.p=profile; this.seed=seed|0; this.W=width; this.H=height;
    this.rng=mulberry32((this.seed^0x4bd16e)>>>0);
    this.mat=terrainMaterial(profile);
    this.weather=this.pickWeather();
    this.buildWorld();
  }
  n(x,y=0,oct=4,s=0){ return fbm(x,y,0,this.seed^s,oct); }
  pickWeather(){
    const p=this.p,r=this.rng();
    if(p.pressure<.02)return p.magnetic>.58&&r>.42?"aurora":"meteors";
    if(p.volcanism>.55&&r>.18)return "ash";
    if(p.dust>.62&&p.wind>.25)return "dust";
    if(p.humidity>.62&&p.wind>.58)return "storm";
    if(p.humidity>.38&&r>.26)return "clouds";
    return "clear";
  }
  buildWorld(){
    const {W,H,p}=this,hor=Math.round(H*.59),rough=(.35+p.relief*.95)*(.65+p.roughness*.7);
    this.horizon=hor; this.far=new Float32Array(W); this.mid=new Float32Array(W); this.near=new Float32Array(W);
    this.material=new Array(W); this.plants=[]; this.rocks=[];
    for(let x=0;x<W;x++){
      const far=this.n(x*.008,1,4,71)-.5,mid=this.n(x*.017,3,5,91)-.5,near=this.n(x*.035,7,5,121)-.5;
      this.far[x]=hor-13-far*54*rough;
      this.mid[x]=hor+12-mid*74*rough;
      this.near[x]=H*.78-near*112*rough;
      const wet=this.n(x*.028,11,3,55)<p.liquid*.52;
      this.material[x]=wet?"liquid":(this.n(x*.05,18,3,177)>.62&&p.vegetation>.08?"veg":"soil");
    }
    this.seaY=Math.round(H*(.86-(p.liquid||0)*.18));
    const plantCount=Math.round((p.plantDensity||0)*(p.vegetation||0)*95);
    for(let i=0;i<plantCount;i++){
      const x=Math.floor(this.rng()*W),ground=Math.round(this.near[x]);
      this.plants.push({x,y:ground,s:2+Math.floor(this.rng()*(3+(p.plantSize||1)*5)),v:this.rng()});
    }
    for(let i=0;i<22;i++){
      const x=Math.floor(this.rng()*W),r=1+Math.floor(this.rng()*4);
      this.rocks.push({x,y:Math.round(this.near[x]),r});
    }
    this.city=[];
    if(p.colony>0){
      const count=p.colony*5;
      for(let i=0;i<count;i++){
        const x=Math.round(W*.54+i*8+this.rng()*4),y=Math.round(this.near[clamp(x,0,W-1)]);
        this.city.push({x,y,w:4+Math.floor(this.rng()*5),h:5+Math.floor(this.rng()*22),dome:this.rng()>.68});
      }
    }
    this.particles=Array.from({length:110},()=>({x:this.rng()*W,y:this.rng()*H,v:.4+this.rng()*1.2,a:this.rng()*Math.PI*2}));
    this.stars=Array.from({length:100},()=>({x:Math.floor(this.rng()*W),y:Math.floor(this.rng()*hor*.9),b:this.rng()}));
  }
  light(sunEl){
    const p=this.p,top=blackbody(p.starT||5700).map(v=>v/255),keys=Object.keys(GAS);
    const sum=keys.reduce((n,k)=>n+(p[k]||0),0)||1,air=1/(clamp(sunEl,.02,1)+.15)*1.15;
    const mie=((p.dust||0)*1.5+(p.haze||0)*1.3)*Math.pow(clamp(p.pressure,0,10),.55);
    const direct=[0,0,0],sky=[0,0,0];
    for(let i=0;i<3;i++){
      let sc=0,ab=0;for(const k of keys){const f=(p[k]||0)/sum;sc+=f*GAS[k][0][i]*p.pressure;ab+=f*GAS[k][1][i]*p.pressure;}
      const tau=(sc+ab+mie*(i===2?.78:i===1?.92:1))*air;
      direct[i]=top[i]*Math.exp(-tau)*Math.max(0,sunEl);
      sky[i]=top[i]*(1-Math.exp(-sc*air*.8))*Math.exp(-(ab+mie*.55)*air*.65)+top[i]*(1-Math.exp(-mie))*.35;
    }
    const twilight=clamp((sunEl+.27)/.35),illum=direct[0]*.22+direct[1]*.7+direct[2]*.08+.03;
    const exposure=1/Math.max(.08,Math.pow(illum,.43));
    return {sky:mul(sky,exposure),direct:mul(direct,exposure*1.5),twilight,visibility:clamp(1-(p.dust||0)*.55-(p.haze||0)*.45,.08,1)};
  }
  initImage(ctx){
    if(this.image)return;
    this.image=ctx.createImageData(this.W,this.H);
    this.buf=new Uint32Array(this.image.data.buffer);
  }
  px(x,y,c){if(x>=0&&y>=0&&x<this.W&&y<this.H)this.buf[(y|0)*this.W+(x|0)]=c;}
  blend(x,y,c,a){
    x|=0;y|=0;if(x<0||y<0||x>=this.W||y>=this.H)return;
    const i=y*this.W+x,old=this.buf[i];
    this.buf[i]=pack(mix(red(old),red(c),a),mix(green(old),green(c),a),mix(blue(old),blue(c),a));
  }
  disc(cx,cy,r,c){for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=r*r)this.px(cx+x,cy+y,c);}
  drawSky(t,phase,L){
    const {W,H,horizon}=this,sunEl=Math.sin(phase),night=1-L.twilight;
    for(let y=0;y<H;y++){
      const q=clamp(y/horizon),path=mix(.8,4.2,q),base=mul(L.sky,mix(.65,1,path/4.2));
      const rgb=mixRgb([.006,.009,.022],base,L.twilight);
      const c=color(rgb);
      for(let x=0;x<W;x++)this.buf[y*W+x]=c;
    }
    if(night>.08)for(const s of this.stars)if(s.b*night>.18)this.blend(s.x,s.y,pack(230,238,255),s.b*night);
    const sunX=Math.round(W*(.5-Math.cos(phase)*.46)),sunY=Math.round(horizon-sunEl*(horizon-28));
    if(sunEl>-.24){
      const glow=10+(this.p.haze||0)*75+(this.p.dust||0)*45,sc=color(L.direct);
      for(let y=Math.max(0,sunY-glow);y<Math.min(horizon+8,sunY+glow);y++)for(let x=Math.max(0,sunX-glow);x<Math.min(W,sunX+glow);x++){
        const d=Math.hypot(x-sunX,y-sunY)/glow;if(d<1)this.blend(x,y,sc,(1-d)*(1-d)*.42);
      }
      this.disc(sunX,sunY,Math.round(4+(this.p.starT||5700)/8000),color(mixRgb(L.direct,[1,1,1],.3)));
    }
    return {sunX,sunY};
  }
  drawClouds(t,L,sunX){
    const p=this.p;if(p.pressure<.03||p.cloudCover<.03)return;
    const storm=this.weather==="storm",cover=clamp(p.cloudCover*(.5+(p.humidity||0)));
    const base=this.horizon-(7+(p.cloudHeight||0)*54),top=base-(storm?58:20+(p.cloudHeight||0)*35);
    const drift=t*(4+(p.wind||0)*28)*(p.cloudSpeed||.5);
    const light=color(mixRgb(mul(L.direct,.7),[.9,.92,.98],.48)),dark=color(mul(L.sky,storm?.28:.68));
    for(let x=0;x<this.W;x++)for(let y=Math.max(0,top);y<base;y++){
      const ny=(y-top)/Math.max(1,base-top),n=this.n((x+drift)/(storm?32:48),y/(storm?17:28),4,333);
      const shape=storm?clamp(ny*(1-ny)*5):clamp(ny*(1-ny)*4);
      const a=clamp((n-(1-cover*.82))*4*shape);
      if(a>.02)this.blend(x,y,ny<.45?light:dark,a*(storm?.8:.63));
    }
    if(storm&&Math.sin(t*2.7+this.seed)>.985){for(let y=top;y<base;y+=4)this.blend(sunX+(y%9)-4,y,pack(230,240,255),.9);}
  }
  groundColor(kind,lit){
    const v=this.mat[kind]||this.mat.soil;
    return color(mul(v,lit));
  }
  drawRidges(L){
    const haze=clamp((this.p.haze||0)*.4+(this.p.dust||0)*.35),sky=color(L.sky);
    const layers=[[this.far,.72,.72],[this.mid,.45,.38]];
    for(const [line,light,depth] of layers)for(let x=0;x<this.W;x++){
      const slope=(line[Math.min(this.W-1,x+1)]-line[Math.max(0,x-1)])*.5,lit=clamp(light-slope*.03);
      const bottom=Math.min(this.near[x],this.seaY);
      for(let y=Math.floor(line[x]);y<bottom;y++){
        const d=(y-line[x])/38,c=this.groundColor("soil",clamp(lit-d*.2));
        this.blend(x,y,c,1); if(haze>0)this.blend(x,y,sky,haze*depth);
      }
    }
  }
  drawLiquid(t,L,sunX){
    const p=this.p;if(p.liquid<.01||p.liquidType==="none")return;
    const hot=p.liquidType==="lava",sea=this.seaY;
    for(let x=0;x<this.W;x++){
      const bottom=Math.min(this.near[x],this.H);if(sea>=bottom)continue;
      for(let y=sea;y<bottom;y++){
        const d=(y-sea)/Math.max(4,bottom-sea),wave=Math.sin(x*.18+t*(1+(p.wind||0)*3)+y*.35)*.5+.5;
        let c=this.groundColor("liquid",clamp(.85-d*.45));
        if(hot&&this.n(x*.08+t*.12,y*.06,3,991)>.7)c=color([1,.72,.22]);
        this.px(x,y,c);
        if(!hot&&wave>.86-(p.wind||0)*.2&&d<.55)this.blend(x,y,pack(220,235,255),.25);
        if(!hot&&Math.abs(x-sunX)<24&&d<.45&&this.n(x,y+t*5,2,701)>.58)this.blend(x,y,color(L.direct),.55*(1-d));
      }
    }
  }
  drawForeground(L){
    for(let x=0;x<this.W;x++){
      const top=Math.floor(this.near[x]),kind=this.material[x];
      for(let y=top;y<this.H;y++){
        const d=(y-top)/40,rough=this.n(x*.12,y*.12,2,522)-.5;
        this.px(x,y,this.groundColor(kind,clamp(.54-d*.28+rough*.13)));
      }
    }
    for(const r of this.rocks)for(let y=-r.r;y<=r.r;y++)for(let x=-r.r;x<=r.r;x++)if(x*x+y*y<=r.r*r.r)this.px(r.x+x,r.y+y,this.groundColor("rock",clamp(.68-x/r.r*.22-y/r.r*.12)));
  }
  drawPlants(L){
    if(!this.plants.length)return;const c=color(mul(this.mat.veg,.9));
    for(const p of this.plants){
      for(let y=0;y<p.s;y++)this.px(p.x,p.y-y,c);
      if(p.v>.35)for(let k=1;k<p.s;k+=2){this.px(p.x-k*.45,p.y-k,c);this.px(p.x+k*.45,p.y-k,c);}
    }
  }
  drawCity(L){
    const night=1-L.twilight,metal=pack(56,77,94),glass=pack(96,164,183),lights=pack(255,188,78);
    for(const b of this.city){
      for(let y=b.y-b.h;y<b.y;y++)for(let x=b.x;x<b.x+b.w;x++){
        const dome=b.dome&&((x-(b.x+b.w*.5))/(b.w*.55))**2+((y-(b.y-b.h))/(b.h*.8))**2<1;
        this.px(x,y,dome?glass:metal);if(night>.42&&((x+y)&2)===0)this.blend(x,y,lights,night);
      }
    }
  }
  drawWeather(t,L){
    const kind=this.weather,p=this.p;if(kind==="aurora"&&!L.twilight){
      for(let x=0;x<this.W;x+=2){const y=this.horizon*.17+this.n(x*.025+t*.09,0,3,811)*38;for(let k=0;k<28;k++)this.blend(x,y+k,pack(88,255,170),.13*(1-k/28));}
    }
    if(!["dust","ash","storm"].includes(kind))return;
    const c=kind==="dust"?pack(170,122,72):kind==="ash"?pack(92,84,79):pack(170,210,240),speed=kind==="storm"?120:30;
    for(const q of this.particles){
      q.y=(q.y+t*speed*q.v)%this.H;q.x=(q.x+t*(p.wind||0)*17*q.v)%this.W;
      if(kind==="storm")for(let k=0;k<5;k++)this.blend(q.x-k,q.y-k*2,c,.32*(1-k/5));else this.blend(q.x,q.y,c,.38);
    }
  }
  render(ctx,t,phase){
    this.initImage(ctx);
    const L=this.light(Math.sin(phase)),cel=this.drawSky(t,phase,L);
    this.drawClouds(t,L,cel.sunX); this.drawRidges(L); this.drawLiquid(t,L,cel.sunX);
    this.drawForeground(L); this.drawPlants(L); this.drawCity(L); this.drawWeather(t,L);
    ctx.putImageData(this.image,0,0);
  }
}
