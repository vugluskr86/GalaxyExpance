// GENERATED from landing-view-src.html. Do not edit by hand.
// Run: node scripts/extract-landing-view-renderer.mjs
import { mulberry32 as projectMulberry32, hash2i } from "../core/rng.js";
/**
 * Creates the pixel landing renderer extracted from landing-view-src.html.
 *
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas Native target canvas. The
 *   game passes a 420×420 offscreen canvas; the renderer writes ImageData to
 *   it directly, without an intermediate resize.
 * @param {object} profile Surface configuration. It is copied on creation;
 *   create a new renderer after changing terrain/climate values.
 *
 * Required / physical parameters, supplied by game generation:
 * - seed — deterministic surface seed. It combines the world and body seeds.
 * - tempK, pressure, gravity — climate and particle fall speed.
 * - starT, starLum, orbitAU — stellar spectrum and irradiance.
 * - gN2, gO2, gCO2, gCH4, gSO2, gH2O — spectral scattering/absorption.
 * - dust, haze, wind — visibility, atmospheric colour and weather drift.
 * - liquid, liquidType, humidity, vegetation, flora, volcanism, minerals —
 *   terrain material, sea level, biome and L-system flora.
 * - relief, roughness — the three generated terrain ridges.
 * - lat, tilt, season, hour — local solar altitude and azimuth. hour is
 *   refreshed by render(seconds, phase) from the game rotation.
 * - cloudCover, cloudHeight, cloudSpeed — cloud shape, altitude and drift.
 * - plantIter, plantAngle, plantSize, plantDensity, plantVariants — grammar
 *   complexity, geometry, density and variants of plants/crystals.
 * - colony, moons, rings — WFC settlement, celestial bodies and ring arc.
 *
 * Renderer switches, generated with defaults but available for tools/sandbox:
 * cloudMode (auto|none|cirrus|cumulus|stratus|storm), plantMode
 * (auto|tree|broadleaf|conifer|bush|fern|succulent|alien|fungal|grass|crystal),
 * weatherMode (auto or manual), weatherPick, weatherPower, showCity,
 * showShip, showWFCGround, showPlants, exposure, levels, animate and dayLen.
 * The normal game currently supplies every physical parameter and the visual
 * switches from makeSurfaceProfile(); sandbox may override any of them.
 *
 * @returns {{profile: object, weather: string, render(seconds:number, phase?:number):void}}
 *   phase is radians: 0 corresponds to local 06:00, π/2 to noon.
 */
export function createLandingViewRenderer(canvas, profile){
const surfaceRnd=projectMulberry32((profile.seed??0)^0x6e624eb7);

"use strict";
/* ============================================================================
   ЭКРАН ПОСАДКИ

   Конвейер:
     planet → climate()  → биом, высота светила, конвекция
            → lighting() → прямой свет, свет неба, освещённость  ← ЯДРО
            → world()    → рельеф, жидкость, флора (L-системы), поселение (WFC)
            → frame()    → небо, светила, облака, хребты, вода, город, погода

   Свет: спектр звезды (чернотельный × светимость / расстояние²) проходит
   сквозь атмосферу с оптической толщей по каналам. Рассеянное уходит в цвет
   неба, прошедшее — в прямой свет. Отсюда: красный карлик даёт тусклую охру,
   метан красит небо в бирюзу и режет красный, серный аэрозоль душит синий,
   а закат краснеет сам, потому что растёт воздушная масса.
   ========================================================================== */

/* ------------------------------------------------------------- 0. базис */
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const smoothstep=(e0,e1,x)=>{const t=clamp((x-e0)/(e1-e0),0,1);return t*t*(3-2*t);};
const mulberry32=projectMulberry32;
const hash1=(i,s)=>(hash2i(i,0,s)>>>0)/4294967296;
const hash2=(x,y,s)=>(hash2i(x,y,s)>>>0)/4294967296;
function vn1(x,s){const i=Math.floor(x),f=x-i,u=f*f*(3-2*f);return lerp(hash1(i,s),hash1(i+1,s),u);}
function fbm1(x,oct,s){let a=0.5,f=1,v=0,n=0;for(let i=0;i<oct;i++){v+=a*vn1(x*f,s+i*77);n+=a;a*=0.5;f*=2;}return v/n;}
function ridged1(x,oct,s){let a=0.5,f=1,v=0,n=0;for(let i=0;i<oct;i++){v+=a*(1-Math.abs(vn1(x*f,s+i*31)*2-1));n+=a;a*=0.5;f*=2;}return v/n;}
function vn2(x,y,s){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);
  return lerp(lerp(hash2(ix,iy,s),hash2(ix+1,iy,s),ux),lerp(hash2(ix,iy+1,s),hash2(ix+1,iy+1,s),ux),uy);}
function fbm2(x,y,oct,s){let a=0.5,f=1,v=0,n=0;for(let i=0;i<oct;i++){v+=a*vn2(x*f,y*f,s+i*53);n+=a;a*=0.5;f*=2;}return v/n;}
const ri=(rnd,a,b)=>Math.floor(a+rnd()*(b-a+1));

/* цвет: упакованный ABGR для буфера, float-тройки для расчёта света */
const rgb=(r,g,b)=>(255<<24)|((clamp(b,0,255)|0)<<16)|((clamp(g,0,255)|0)<<8)|(clamp(r,0,255)|0);
const R=c=>c&255, G=c=>(c>>8)&255, B=c=>(c>>16)&255;
const mixc=(a,b,t)=>rgb(lerp(R(a),R(b),t),lerp(G(a),G(b),t),lerp(B(a),B(b),t));
const scalec=(c,k)=>rgb(R(c)*k,G(c)*k,B(c)*k);
const pack=v=>rgb(v[0]*255,v[1]*255,v[2]*255);
const unpack=c=>[R(c)/255,G(c)/255,B(c)/255];
const vmul=(a,b)=>[a[0]*b[0],a[1]*b[1],a[2]*b[2]];
const vsc=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const vadd=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const vlerp=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];
const lum=v=>v[0]*0.2126+v[1]*0.7152+v[2]*0.0722;
const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(v=>(v+0.5)/16-0.5);
function quant(c,x,y,levels){
  if(levels>=64)return c;
  const step=255/(levels-1), d=BAYER[(y&3)*4+(x&3)]*step;
  const q=v=>Math.round((v+d)/step)*step;
  return rgb(q(R(c)),q(G(c)),q(B(c)));
}
/* нормированный чернотельный цвет (максимум канала = 1) */
function blackbodyV(T){
  T=clamp(T,1000,40000)/100;let r,g,b;
  r=T<=66?255:clamp(329.7*Math.pow(T-60,-0.1332),0,255);
  g=T<=66?clamp(99.47*Math.log(T)-161.1,0,255):clamp(288.1*Math.pow(T-60,-0.0755),0,255);
  b=T>=66?255:T<=19?0:clamp(138.5*Math.log(T-10)-305.0,0,255);
  const m=Math.max(r,g,b)||1;
  return [r/m,g/m,b/m];
}
function hsl(h,s,l){
  const f=n=>{const k=(n+h*12)%12,a=s*Math.min(l,1-l);return l-a*Math.max(-1,Math.min(k-3,9-k,1));};
  return [f(0),f(8),f(4)];
}

/* --------------------------------------------------- 1. параметры мира */
const DEF={
  seed:20260729,
  /* физика */
  tempK:288, pressure:1, gravity:1,
  /* светило */
  starT:5800, starLum:1, orbitAU:1,
  /* состав атмосферы (доли, нормируются) */
  gN2:0.78, gO2:0.21, gCO2:0.01, gCH4:0, gSO2:0, gH2O:0.01,
  dust:0.08, haze:0.06, wind:0.3,
  /* поверхность */
  liquid:0.62, liquidType:'water', humidity:0.55,
  vegetation:0.55, flora:110, volcanism:0.06, minerals:0.3, magnetic:0.7,
  relief:0.55, roughness:0.5,
  /* орбита */
  lat:34, tilt:23, season:0.28, hour:9.5, moons:1, rings:false,
  /* облака */
  cloudMode:'auto', cloudCover:0.45, cloudHeight:0.5, cloudSpeed:0.5,
  /* флора */
  plantMode:'auto', plantIter:4, plantAngle:24, plantSize:1, plantDensity:0.6, plantVariants:4,
  /* поселение и вывод */
  colony:3, showCity:true, showShip:true, showWFCGround:false, showPlants:true,
  weatherMode:'auto', weatherPick:'clear', weatherPower:0.7,
  exposure:1, levels:26, animate:true, dayLen:0
};
let P=Object.assign({},DEF);

const WORLDS={
  'Земного типа':{tempK:288,pressure:1,gravity:1,starT:5800,starLum:1,orbitAU:1,
    gN2:.78,gO2:.21,gCO2:.004,gCH4:0,gSO2:0,gH2O:.01,dust:.08,haze:.05,wind:.3,
    liquid:.66,liquidType:'water',humidity:.6,vegetation:.65,flora:110,minerals:.3,magnetic:.8,colony:3,relief:.55,roughness:.5,cloudCover:.45},
  'Марс':{tempK:215,pressure:0.006,gravity:.38,starT:5800,starLum:1,orbitAU:1.52,
    gN2:.03,gO2:0,gCO2:.95,gCH4:0,gSO2:0,gH2O:.001,dust:.85,haze:.25,wind:.55,
    liquid:0,liquidType:'none',humidity:.02,vegetation:0,minerals:.6,magnetic:.05,colony:2,relief:.7,roughness:.6,cloudCover:.05},
  'Титан':{tempK:94,pressure:1.5,gravity:.14,starT:5800,starLum:1,orbitAU:9.5,
    gN2:.95,gO2:0,gCO2:0,gCH4:.05,gSO2:0,gH2O:0,dust:.1,haze:.95,wind:.15,
    liquid:.25,liquidType:'methane',humidity:.5,vegetation:0,minerals:.15,magnetic:.1,colony:1,relief:.3,roughness:.3,cloudCover:.5},
  'Венера':{tempK:735,pressure:9.5,gravity:.9,starT:5800,starLum:1,orbitAU:.72,
    gN2:.03,gO2:0,gCO2:.955,gCH4:0,gSO2:.015,gH2O:0,dust:.2,haze:1,wind:.25,
    liquid:0,liquidType:'none',humidity:.1,vegetation:0,volcanism:.6,minerals:.5,magnetic:.02,colony:0,relief:.5,roughness:.45,cloudCover:1},
  'Луна':{tempK:250,pressure:0,gravity:.16,starT:5800,starLum:1,orbitAU:1,
    gN2:0,gO2:0,gCO2:0,gCH4:0,gSO2:0,gH2O:0,dust:.4,haze:0,wind:0,
    liquid:0,liquidType:'none',humidity:0,vegetation:0,minerals:.4,magnetic:0,colony:2,relief:.45,roughness:.7,cloudCover:0},
  'Красный карлик':{tempK:264,pressure:.8,gravity:.85,starT:3100,starLum:.015,orbitAU:.11,
    gN2:.6,gO2:.05,gCO2:.3,gCH4:.05,gSO2:0,gH2O:.02,dust:.15,haze:.3,wind:.4,
    liquid:.4,liquidType:'water',humidity:.5,vegetation:.7,flora:305,minerals:.45,magnetic:.5,colony:1,relief:.6,roughness:.5,cloudCover:.6},
  'Ледяной мир':{tempK:198,pressure:.6,gravity:.7,starT:3500,starLum:.08,orbitAU:.4,
    gN2:.8,gO2:0,gCO2:.05,gCH4:.1,gSO2:0,gH2O:.05,dust:.05,haze:.15,wind:.5,
    liquid:.35,liquidType:'ammonia',humidity:.7,vegetation:.05,flora:190,minerals:.2,magnetic:.4,colony:2,lat:62,relief:.6,roughness:.55,cloudCover:.55},
  'Вулканический':{tempK:520,pressure:1.8,gravity:1.3,starT:4200,starLum:.35,orbitAU:.4,
    gN2:.15,gO2:0,gCO2:.5,gCH4:0,gSO2:.35,gH2O:0,dust:.6,haze:.5,wind:.4,
    liquid:.2,liquidType:'lava',humidity:.15,vegetation:0,volcanism:.95,minerals:.8,magnetic:.3,colony:1,relief:.8,roughness:.75,cloudCover:.5},
  'Джунгли':{tempK:302,pressure:1.4,gravity:1.1,starT:4800,starLum:.55,orbitAU:.7,
    gN2:.7,gO2:.25,gCO2:.01,gCH4:0,gSO2:0,gH2O:.04,dust:.03,haze:.1,wind:.2,
    liquid:.5,liquidType:'water',humidity:.9,vegetation:1,flora:88,minerals:.25,magnetic:.7,colony:2,lat:4,relief:.45,roughness:.4,cloudCover:.7},
  'Метановое небо':{tempK:250,pressure:2.2,gravity:.9,starT:6600,starLum:1.6,orbitAU:1.6,
    gN2:.45,gO2:0,gCO2:.05,gCH4:.5,gSO2:0,gH2O:0,dust:.05,haze:.2,wind:.3,
    liquid:.3,liquidType:'methane',humidity:.4,vegetation:.3,flora:265,minerals:.4,magnetic:.5,colony:1,relief:.55,roughness:.5,cloudCover:.4},
  'Мегаполис':{tempK:291,pressure:1.1,gravity:1,starT:5800,starLum:1,orbitAU:1,
    gN2:.74,gO2:.2,gCO2:.03,gCH4:0,gSO2:.02,gH2O:.01,dust:.2,haze:.45,wind:.25,
    liquid:.4,liquidType:'water',humidity:.45,vegetation:.2,flora:110,minerals:.3,magnetic:.6,colony:4,relief:.35,roughness:.35,cloudCover:.5}
};

/* ------------------------------------------------ 2. климат и явления */
function climate(p){
  const T=p.tempK, atm=p.pressure;
  const airless=atm<0.02;
  const breathable=!airless&&atm>0.45&&atm<2.2&&T>250&&T<318&&p.gO2>0.12;
  let biome;
  if(airless)                             biome='безвоздушный реголит';
  else if(T>700)                          biome='расплавленная кора';
  else if(T>400&&atm>3)                   biome='парниковая топка';
  else if(p.volcanism>0.6)                biome='вулканическая пустошь';
  else if(T>420)                          biome='раскалённая пустошь';
  else if(T<95)                           biome='криогенный (метан/азот)';
  else if(T<235)                          biome='ледяная пустошь';
  else if(p.liquid>0.25&&p.vegetation>0.4)biome='умеренный биом';
  else if(p.liquid>0.25)                  biome='водный мир без биосферы';
  else if(p.vegetation>0.3)               biome='степь / тайга';
  else                                    biome='каменистая пустыня';

  const decl=p.tilt*Math.sin(p.season*Math.PI*2)*Math.PI/180;
  const la=p.lat*Math.PI/180, ha=(p.hour/24-0.5)*Math.PI*2;
  const sinAlt=Math.sin(la)*Math.sin(decl)+Math.cos(la)*Math.cos(decl)*Math.cos(ha);
  const alt=Math.asin(clamp(sinAlt,-1,1));
  const az=Math.atan2(Math.sin(ha),Math.cos(ha)*Math.sin(la)-Math.tan(decl)*Math.cos(la));
  const insol=p.starLum/Math.max(0.0004,p.orbitAU*p.orbitAU);   // в земных единицах
  return {airless,breathable,biome,alt,az,insol,
    wet:p.humidity*(p.liquidType==='water'?1:0.35)};
}
/* веса явлений */
function weatherWeights(p,c,L){
  const w={},atm=p.pressure,T=p.tempK;
  const day=L.dayFactor;
  const conv=clamp(day*c.wet*smoothstep(0.25,1.2,atm)*smoothstep(255,300,T),0,1);
  c.conv=conv;
  w.clear=1.0+(1-p.humidity)*1.5+(1-p.wind);
  if(atm<=0.05) return {clear:1,meteors:0.35+p.dust*0.2,aurora:p.magnetic*0.5};
  w.clouds=p.humidity*2.2*smoothstep(0.2,1,atm);
  w.fog=p.humidity*1.8*(1-p.wind)*smoothstep(0.3,1,atm)*(p.liquid>0.05?1:0.3)*(day<0.35?1.8:0.5);
  if(p.liquidType==='water'&&T>272&&T<340) w.rain=p.humidity*2.4*smoothstep(0.3,1,atm);
  if(p.liquidType==='methane'&&T<115)      w.rain=p.humidity*2.0;
  if(T<274&&p.humidity>0.15)               w.snow=p.humidity*2.2*smoothstep(0.15,1,atm)*smoothstep(274,200,T);
  if(T<268&&p.wind>0.45)                   w.blizzard=(w.snow||0)*p.wind*1.6;
  w.storm=conv*2.6;
  w.hail=conv*1.4*smoothstep(300,270,T)*smoothstep(0.5,1.2,p.gravity);
  w.tornado=conv*conv*1.9*smoothstep(0.3,0.9,p.wind)*smoothstep(1.4,0.6,p.gravity);
  w.dust=smoothstep(0.15,0,p.liquid)*p.dust*2.6*p.wind*smoothstep(0.02,0.4,atm);
  w.ash=p.volcanism*2.4*smoothstep(0.05,0.5,atm);
  w.aurora=p.magnetic*1.6*smoothstep(0.6,0,atm)*(day<0.3?2:0.2)*smoothstep(30,60,Math.abs(p.lat));
  w.meteors=smoothstep(0.4,0.02,atm)*0.8*(day<0.3?1.5:0.2);
  for(const k in w) if(!(w[k]>0)) delete w[k];
  return w;
}
function pickWeather(w,rnd){
  const keys=Object.keys(w);let s=0;for(const k of keys)s+=w[k];
  let r=rnd()*s;for(const k of keys){r-=w[k];if(r<=0)return k;}
  return 'clear';
}

/* ============================================================================
   3. СВЕТ  — ядро всей картинки
   ========================================================================== */
/* Коэффициенты на 1 атм: рассеяние (уходит в небо) и поглощение (съедается).
   Значения подобраны так, чтобы знакомые атмосферы выглядели узнаваемо. */
const GAS={
  gN2 :{sc:[0.20,0.47,1.12], ab:[0.00,0.00,0.01]},
  gO2 :{sc:[0.20,0.47,1.12], ab:[0.02,0.00,0.01]},
  gCO2:{sc:[0.26,0.50,0.96], ab:[0.10,0.05,0.03]},
  gCH4:{sc:[0.10,0.40,1.25], ab:[0.85,0.22,0.02]},   // ест красный → бирюза
  gSO2:{sc:[0.52,0.44,0.34], ab:[0.03,0.22,0.90]},   // ест синий  → охра
  gH2O:{sc:[0.34,0.44,0.62], ab:[0.30,0.10,0.05]}
};
function lighting(p,c){
  /* 3.1 нормируем состав */
  const keys=['gN2','gO2','gCO2','gCH4','gSO2','gH2O'];
  let tot=0; for(const k of keys) tot+=Math.max(0,p[k]);
  const frac={}; for(const k of keys) frac[k]=tot>0?Math.max(0,p[k])/tot:0;

  /* 3.2 оптические толщи по каналам */
  const sc=[0,0,0], ab=[0,0,0];
  for(const k of keys) for(let i=0;i<3;i++){
    sc[i]+=frac[k]*GAS[k].sc[i]*p.pressure;
    ab[i]+=frac[k]*GAS[k].ab[i]*p.pressure;
  }
  /* Ми-рассеяние на пыли и аэрозолях: почти серое, чуть жёлтое */
  const mie=(p.dust*1.5+p.haze*1.3)*Math.pow(clamp(p.pressure,0,10),0.55);
  const mieC=[mie*1.0,mie*0.92,mie*0.78];

  /* 3.3 воздушная масса от высоты светила */
  const sa=Math.sin(c.alt);
  const airmass=1/(clamp(sa,0.02,1)+0.15)*1.15;
  const above=clamp(sa,0,1);

  /* 3.4 спектр звезды и приход на верх атмосферы */
  const star=blackbodyV(p.starT);
  const top=vsc(star,c.insol);

  /* 3.5 прямой свет: экспоненциальное ослабление по каналам */
  const direct=[0,0,0];
  for(let i=0;i<3;i++){
    const tau=(sc[i]+ab[i]+mieC[i])*airmass;
    direct[i]=top[i]*Math.exp(-tau)*above;
  }
  /* 3.6 небо: рассеянное = то, что выбито из прямого луча рэлеевской частью */
  const skyC=[0,0,0];
  for(let i=0;i<3;i++){
    const s=1-Math.exp(-sc[i]*airmass*0.9);
    const surv=Math.exp(-(ab[i]+mieC[i]*0.6)*airmass*0.7);
    skyC[i]=top[i]*s*surv*0.85 + top[i]*(1-Math.exp(-mieC[i]))*surv*0.5;
  }
  /* сумерки: небо гаснет не мгновенно */
  const tw=smoothstep(-0.28,0.06,sa);
  const skyLit=vsc(skyC,lerp(0.05,1,tw)*(0.25+0.75*above));
  /* ночное свечение и звёздный свет */
  const night=vsc([0.012,0.016,0.030],lerp(1,0.25,clamp(p.pressure,0,2)/2)*(1-tw));
  const sky=vadd(skyLit,night);

  const amb=vadd(vsc(sky,0.9),vsc(direct,0.06));
  const illum=(lum(direct)*0.85+lum(amb)*0.9);          // условная освещённость
  const ev=P.exposure/Math.max(0.06,Math.pow(illum+0.02,0.42));  // мягкая экспозиция

  return {star,top,sc,ab,mie:mieC,airmass,direct,sky,amb,illum,ev,
    dayFactor:clamp(above*1.5+tw*0.25,0,1),
    tw, opt:(sc[0]+sc[1]+sc[2]+ab[0]+ab[1]+ab[2])/3+mie,
    visibility:clamp(1-p.dust*0.55-p.haze*0.45,0.08,1)};
}
/* цвет неба на заданной длине пути (зенит ≈ 1, горизонт ≈ 4) */
function skyAt(L,path){
  const out=[0,0,0];
  for(let i=0;i<3;i++){
    const s=1-Math.exp(-L.sc[i]*L.airmass*path*0.75);
    const surv=Math.exp(-(L.ab[i]+L.mie[i]*0.6)*L.airmass*path*0.6);
    out[i]=L.top[i]*s*surv*0.9+L.top[i]*(1-Math.exp(-L.mie[i]*path*0.8))*surv*0.55;
  }
  const k=lerp(0.05,1,L.tw)*(0.25+0.75*clamp(Math.sin(cli.alt),0,1));
  return vadd(vsc(out,k),vsc([0.012,0.016,0.030],(1-L.tw)*lerp(1,0.25,clamp(P.pressure,0,2)/2)));
}

/* ------------------------------------------ 4. материалы и таблица теней */
function palette(p){
  const m=p.minerals;
  const rock =vlerp([.38,.38,.41],[.59,.34,.21],m);
  const veg  =hsl(p.flora/360,.45,lerp(.16,.34,p.vegetation));
  return {
    r :rock, r2:vsc(rock,.62), s:vlerp([.77,.69,.52],[.81,.57,.38],m*.8),
    g :veg,  g2:vsc(veg,.6),   i:[.83,.89,.94],
    w :p.liquidType==='methane'?[.23,.29,.28]:p.liquidType==='ammonia'?[.31,.41,.46]:
       p.liquidType==='lava'?[.89,.38,.10]:[.15,.33,.49],
    l :[.94,.47,.12], m:vlerp([.49,.53,.57],[.59,.51,.38],m), gl:[.38,.71,.77],
    lit:[1,.81,.47]
  };
}
/* Таблица «материал × уровень освещённости → упакованный цвет».
   Считается раз в кадр: перекрашивать сцену попиксельно вектором дорого. */
const LEV=16; let LUT=null,MATS=null;
function buildLUT(L){
  MATS=palette(P); LUT={};
  const ev=L.ev;
  for(const k in MATS){
    const a=MATS[k],arr=new Uint32Array(LEV);
    for(let i=0;i<LEV;i++){
      const t=i/(LEV-1);
      let c=vadd(vmul(a,vsc(L.direct,t)),vmul(a,L.amb));
      if(k==='l'||k==='lit') c=vadd(c,vsc(a,0.9));            // самосвечение
      c=vsc(c,ev);
      c=[Math.pow(clamp(c[0],0,1),0.85),Math.pow(clamp(c[1],0,1),0.85),Math.pow(clamp(c[2],0,1),0.85)];
      arr[i]=pack(c);
    }
    LUT[k]=arr;
  }
}
const shadeC=(mat,t)=>LUT[mat][clamp(Math.round(t*(LEV-1)),0,LEV-1)];

/* ============================================================================
   5. L-СИСТЕМЫ: флора и кристаллы
   Форма растения — это грамматика, а параметры грамматики выводятся из
   планеты: слабая гравитация тянет вверх, тусклая звезда заставляет
   раскрывать крону шире и темнить лист, сухость превращает листья в иглы.
   ========================================================================== */
const SPECIES={
  tree:     {axiom:'F',rules:{F:'FF-[-F+F+F]+[+F-F-F]'},angle:22,scale:.62,iter:4,leaf:'blob'},
  broadleaf:{axiom:'X',rules:{X:'F[+X]F[-X]+X',F:'FF'},   angle:20,scale:.7, iter:5,leaf:'big'},
  conifer:  {axiom:'F',rules:{F:'F[+F]F[-F]F'},           angle:14,scale:.55,iter:4,leaf:'needle'},
  bush:     {axiom:'X',rules:{X:'F[+X][-X]FX',F:'FF'},    angle:28,scale:.62,iter:4,leaf:'blob'},
  fern:     {axiom:'X',rules:{X:'F+[[X]-X]-F[-FX]+X',F:'FF'},angle:25,scale:.6,iter:4,leaf:'needle'},
  succulent:{axiom:'F',rules:{F:'F[+F][-F]'},             angle:34,scale:.5, iter:3,leaf:'none',fat:true},
  alien:    {axiom:'X',rules:{X:'F[++X][--X]F[+X]X',F:'F'},angle:32,scale:.72,iter:4,leaf:'orb'},
  fungal:   {axiom:'F',rules:{F:'FF[+F][-F]'},            angle:18,scale:.5, iter:3,leaf:'cap'},
  grass:    {axiom:'X',rules:{X:'F[+X][-X]',F:'F'},       angle:12,scale:.8, iter:3,leaf:'none'},
  crystal:  {axiom:'F',rules:{F:'F[+F][-F]F'},            angle:38,scale:.55,iter:3,leaf:'none',crystal:true}
};
function autoSpecies(p,c,L){
  if(p.vegetation<0.05) return p.minerals>0.35?['crystal']:[];
  const list=[];
  const cold=p.tempK<268, hot=p.tempK>320, dry=p.humidity<0.3||p.liquid<0.12;
  const dim=L.insolLocal<0.35, weird=Math.abs(((p.flora%360)+360)%360-110)>70;
  if(weird)      list.push('alien');
  if(cold)       list.push('conifer');
  else if(dry)   list.push('succulent');
  else if(hot&&p.humidity>0.6) list.push('broadleaf','fern');
  else           list.push('tree');
  if(dim)        list.push('fungal');
  list.push('bush');
  if(p.vegetation>0.35) list.push('grass');
  return [...new Set(list)].slice(0,4);
}
/* 5.1 разворачивание грамматики */
function expandL(spec,iter,cap){
  let s=spec.axiom;
  for(let i=0;i<iter;i++){
    let o='';
    for(let k=0;k<s.length;k++){
      const ch=s[k];
      o+=(spec.rules[ch]!==undefined?spec.rules[ch]:ch);
      if(o.length>cap)break;
    }
    s=o; if(s.length>cap)break;
  }
  return s;
}
/* 5.2 черепашка → спрайт. Возвращает {w,h,ax,ay,pix} */
function growSprite(name,p,c,L,rnd){
  const spec=SPECIES[name];
  /* влияние планеты на грамматику */
  const g=clamp(p.gravity,0.05,3);
  const lightK=clamp(L.insolLocal,0.05,3);
  const iter=clamp(Math.round(P.plantIter+(name==='grass'?-1:0)+(g<0.5?1:0)),1,6);
  const angle=(P.plantAngle/24)*spec.angle*lerp(1.35,0.85,clamp(lightK,0,1.4));  // мало света — шире крона
  const seg=(2.6+3.4/Math.sqrt(g))*P.plantSize*(name==='grass'?0.45:1)*(spec.crystal?0.8:1);
  const str=expandL(spec,iter,26000);

  let x=0,y=0,ang=-90,len=seg,wid=Math.max(1,(1.6+0.9*g)*P.plantSize*(spec.fat?2:1));
  const st=[],segs=[],leaves=[];
  let minx=0,maxx=0,miny=0,maxy=0;
  for(let i=0;i<str.length;i++){
    const ch=str[i];
    if(ch==='F'||ch==='A'){
      const r=ang*Math.PI/180, l=len*(0.78+rnd()*0.44);
      const nx=x+Math.cos(r)*l, ny=y+Math.sin(r)*l;
      segs.push([x,y,nx,ny,wid]);
      x=nx;y=ny;
      if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;
    } else if(ch==='+') ang+=angle*(0.7+rnd()*0.6);
    else if(ch==='-')  ang-=angle*(0.7+rnd()*0.6);
    else if(ch==='['){ st.push([x,y,ang,len,wid]); len*=spec.scale; wid=Math.max(0.7,wid*0.68); }
    else if(ch===']'){ const s0=st.pop(); if(s0){ leaves.push([x,y]); [x,y,ang,len,wid]=s0; } }
    else if(ch==='X'&&spec.leaf!=='none') leaves.push([x,y]);
  }
  if(spec.leaf!=='none') leaves.push([x,y]);
  const pad=3;
  const w=Math.ceil(maxx-minx)+pad*2, h=Math.ceil(maxy-miny)+pad*2;
  if(w<2||h<2||w>200||h>200) return null;
  const pix=new Uint32Array(w*h);
  const ax=Math.round(-minx)+pad, ay=Math.round(-miny)+pad;
  const put=(px_,py_,c_)=>{px_|=0;py_|=0;if(px_<0||py_<0||px_>=w||py_>=h)return;pix[py_*w+px_]=c_;};
  /* цвета: ствол — от породы, лист — от оттенка флоры под цвет звезды */
  const barkA=vlerp([.26,.20,.15],[.34,.30,.26],p.minerals);
  const leafBase=hsl(((p.flora%360)+360)%360/360, spec.crystal?0.25:0.5,
                     lerp(0.34,0.17,clamp(1-lightK,0,1)));   // тусклая звезда → тёмный лист
  const crystalA=vlerp([.55,.62,.72],[.72,.55,.35],p.minerals);
  const shade=(a,t)=>{
    let cc=vadd(vmul(a,vsc(L.direct,t)),vmul(a,L.amb));
    cc=vsc(cc,L.ev);
    return pack([Math.pow(clamp(cc[0],0,1),.85),Math.pow(clamp(cc[1],0,1),.85),Math.pow(clamp(cc[2],0,1),.85)]);
  };
  const bark=[shade(barkA,.25),shade(barkA,.75)];
  const leafC=[shade(leafBase,.28),shade(leafBase,.7),shade(vsc(leafBase,1.25),1)];
  const cryC=[shade(crystalA,.3),shade(crystalA,.85),shade(vsc(crystalA,1.3),1)];
  /* ветви */
  for(const [x0,y0,x1,y1,ww] of segs){
    const n=Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0)));
    for(let k=0;k<=n;k++){
      const px_=lerp(x0,x1,k/n)+ax, py_=lerp(y0,y1,k/n)+ay;
      const rr=Math.max(0,Math.round(ww/2)-1);
      for(let dy=-rr;dy<=rr;dy++)for(let dx=-rr;dx<=rr;dx++){
        const litSide=dx<0?1:0;
        put(px_+dx,py_+dy,spec.crystal?cryC[litSide?1:0]:bark[litSide]);
      }
    }
  }
  /* листва */
  if(spec.leaf!=='none'){
    const size={blob:2,big:3,needle:1,orb:2,cap:4}[spec.leaf]||2;
    const rr=Math.max(1,Math.round(size*P.plantSize*lerp(1.35,0.8,clamp(lightK,0,1.5))));
    for(const [lx,ly] of leaves){
      for(let dy=-rr;dy<=rr;dy++)for(let dx=-rr;dx<=rr;dx++){
        if(dx*dx+dy*dy>rr*rr+0.4)continue;
        if(spec.leaf==='needle'&&Math.abs(dx)>0)continue;
        const t=hash2(Math.round(lx+dx),Math.round(ly+dy),P.seed)*0.5;
        const idx=(dx<0&&dy<0)?2:(t>0.3?1:0);
        put(lx+dx+ax,ly+dy+ay,leafC[idx]);
      }
    }
  } else if(spec.crystal){
    for(const [lx,ly] of leaves) put(lx+ax,ly+ay,cryC[2]);
  }
  return {w,h,ax,ay,pix};
}

/* ============================================================================
   6. WFC — планировка поселения, фасады, мозаика грунта
   ========================================================================== */
function wfc1d(tiles,n,rnd,pre){
  const T=tiles.length,dom=[];
  for(let i=0;i<n;i++){
    const d=new Uint8Array(T).fill(1);
    if(pre){const a=pre(i);if(a)for(let t=0;t<T;t++)d[t]=a.includes(t)?1:0;}
    dom.push(d);
  }
  const fits=(a,b)=>tiles[a].right===tiles[b].left;
  const prop=()=>{
    let ch=true;
    while(ch){
      ch=false;
      for(let i=0;i<n-1;i++){
        for(let t=0;t<T;t++){ if(!dom[i][t])continue;
          let ok=false;for(let u=0;u<T;u++)if(dom[i+1][u]&&fits(t,u)){ok=true;break;}
          if(!ok){dom[i][t]=0;ch=true;} }
        for(let u=0;u<T;u++){ if(!dom[i+1][u])continue;
          let ok=false;for(let t=0;t<T;t++)if(dom[i][t]&&fits(t,u)){ok=true;break;}
          if(!ok){dom[i+1][u]=0;ch=true;} }
      }
      for(let i=0;i<n;i++){let c=0;for(let t=0;t<T;t++)c+=dom[i][t];if(!c)return false;}
    }
    return true;
  };
  if(!prop())return null;
  for(;;){
    let best=-1,bc=99;
    for(let i=0;i<n;i++){let c=0;for(let t=0;t<T;t++)c+=dom[i][t];if(c>1&&c<bc){bc=c;best=i;}}
    if(best<0)break;
    let sum=0;for(let t=0;t<T;t++)if(dom[best][t])sum+=tiles[t].w;
    let r=rnd()*sum,pick=-1;
    for(let t=0;t<T;t++)if(dom[best][t]){r-=tiles[t].w;if(r<=0){pick=t;break;}}
    if(pick<0)for(let t=T-1;t>=0;t--)if(dom[best][t]){pick=t;break;}
    for(let t=0;t<T;t++)if(t!==pick)dom[best][t]=0;
    if(!prop())return null;
  }
  const out=[];for(let i=0;i<n;i++)for(let t=0;t<T;t++)if(dom[i][t]){out.push(t);break;}
  return out;
}
function wfc2d(tiles,w,h,rnd,pre){
  const T=tiles.length,N=w*h,dom=[];
  for(let i=0;i<N;i++){
    const d=new Uint8Array(T);
    for(const t of pre(i%w,(i/w)|0))d[t]=1;
    dom.push(d);
  }
  const okH=(a,b)=>tiles[a].r===tiles[b].l, okV=(a,b)=>tiles[a].d===tiles[b].u;
  const st=[];for(let i=0;i<N;i++)st.push(i);
  const step=()=>{
    while(st.length){
      const i=st.pop(),x=i%w,y=(i/w)|0;
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=w||ny>=h)continue;
        const j=ny*w+nx;let ch=false,cnt=0;
        for(let u=0;u<T;u++){
          if(!dom[j][u])continue;
          let sup=false;
          for(let t=0;t<T;t++){
            if(!dom[i][t])continue;
            if(dx===1?okH(t,u):dx===-1?okH(u,t):dy===1?okV(t,u):okV(u,t)){sup=true;break;}
          }
          if(!sup){dom[j][u]=0;ch=true;}else cnt++;
        }
        if(!cnt){for(let u=0;u<T;u++)dom[j][u]=0;dom[j][pre(nx,ny)[0]]=1;continue;}
        if(ch)st.push(j);
      }
    }
  };
  step();
  for(;;){
    let best=-1,bc=99;
    for(let i=0;i<N;i++){let c=0;for(let t=0;t<T;t++)c+=dom[i][t];if(c>1&&c<bc){bc=c;best=i;}}
    if(best<0)break;
    let sum=0;for(let t=0;t<T;t++)if(dom[best][t])sum+=tiles[t].w;
    let r=rnd()*sum,pick=-1;
    for(let t=0;t<T;t++)if(dom[best][t]){r-=tiles[t].w;if(r<=0){pick=t;break;}}
    if(pick<0)for(let t=T-1;t>=0;t--)if(dom[best][t]){pick=t;break;}
    for(let t=0;t<T;t++)if(t!==pick)dom[best][t]=0;
    st.push(best);step();
  }
  const out=new Int16Array(N);
  for(let i=0;i<N;i++){out[i]=0;for(let t=0;t<T;t++)if(dom[i][t]){out[i]=t;break;}}
  return out;
}
function cityTiles(sealed,colony){
  const d=[0,.35,.7,1,1.4][colony]||0;
  const T=[
    {id:'empty',left:'o',right:'o',w:2.5-d},
    {id:'road', left:'o',right:'r',w:1.6},
    {id:'road2',left:'r',right:'o',w:1.6},
    {id:'plaza',left:'r',right:'r',w:1+d*.4},
    {id:'low',  left:'r',right:'b',w:2+d},
    {id:'block',left:'b',right:'b',w:1.4+d},
    {id:'tall', left:'b',right:'r',w:.5+d*1.4},
    {id:'pad',  left:'r',right:'r',w:.7+d*.5},
    {id:'mast', left:'b',right:'b',w:.5},
    {id:'park', left:'r',right:'r',w:sealed?.15:.9}
  ];
  if(sealed){T.push({id:'dome',left:'r',right:'r',w:1.6+d});T.push({id:'tube',left:'b',right:'b',w:1.2});}
  else T.push({id:'spire',left:'b',right:'b',w:.4+d});
  return T;
}
const facadeTiles=sealed=>[
  {id:'base',left:'B',right:'F',w:1},{id:'floor',left:'F',right:'F',w:3.4},
  {id:'tech',left:'F',right:'F',w:1.1},{id:'balcony',left:'F',right:'F',w:sealed?.3:1.2},
  {id:'cornice',left:'F',right:'T',w:1},{id:'roof',left:'T',right:'T',w:1.6},
  {id:'antenna',left:'T',right:'T',w:.8},{id:'domeTop',left:'T',right:'T',w:sealed?1.4:.2}
];
function groundTiles(){
  const mats=['s','r','g','i','w'],T=[];
  for(const m of mats)T.push({id:m+m,mat:m,to:m,l:m,r:m,u:m,d:m,w:6,kind:'pure'});
  for(const a of mats)for(const b of mats) if(a!==b)
    T.push({id:a+'>'+b,mat:a,to:b,l:a,r:b,u:a,d:b,w:1,kind:'edge'});
  return T;
}

/* ============================================================================
   7. МИР
   ========================================================================== */
const W=420,H=420;
let world=null,cli=null,L=null,wq=null,curWeather='clear',cloudKind='none';

function buildWorld(){
  const p=P;
  cli=climate(p);
  L=lighting(p,cli);
  L.insolLocal=cli.insol;                 // для флоры: сколько света реально доходит
  wq=weatherWeights(p,cli,L);
  buildLUT(L);
  const rnd=mulberry32(p.seed>>>0), s=p.seed|0;
  const horizon=Math.round(H*0.52);

  const relief=p.relief, rgh=p.roughness;
  const mkRidge=(amp,scale,base,oct,sd,ridge)=>{
    const a=new Float32Array(W);
    for(let x=0;x<W;x++){
      const n=ridge?ridged1(x/scale,oct,sd):fbm1(x/scale,oct,sd);
      a[x]=base-amp*(n*0.85+0.15*fbm1(x/(scale*0.22),3,sd+9)*rgh);
    }
    return a;
  };
  const far =mkRidge(28*relief+6, 90,horizon-3,4,s+11,rgh>0.5);
  const mid =mkRidge(40*relief+8, 55,horizon+7,5,s+37,rgh>0.6);
  const near=mkRidge(26*relief+10,26,H-26,    5,s+71,false);

  let seaY=H+9;
  if(p.liquid>0.01&&p.liquidType!=='none'){
    const sorted=Array.from(mid).sort((a,b)=>a-b);
    seaY=sorted[Math.floor(clamp(1-p.liquid,0,0.999)*(sorted.length-1))];
  }
  const hot=p.tempK>640;
  const matAt=(x,y,slope)=>{
    const alt=(seaY-y)/Math.max(8,seaY-Math.min(far[x],mid[x]));
    if(p.tempK<235||(p.tempK<268&&alt>0.55))return 'i';
    if(hot&&alt<0.2)return 'l';
    if(p.vegetation>0.15&&alt<0.75&&Math.abs(slope)<1.6&&p.tempK>250&&p.tempK<330)return 'g';
    if(Math.abs(slope)>1.4||alt>0.8)return 'r';
    return (p.liquid>0.15||p.dust>0.4)?'s':'r';
  };
  const mat=new Array(W);
  for(let x=0;x<W;x++){
    const sl=(mid[Math.min(W-1,x+1)]-mid[Math.max(0,x-1)])*0.5;
    mat[x]=matAt(x,mid[x],sl);
  }

  /* 7.1 поселение */
  let city=null;
  if(p.colony>0&&P.showCity){
    const sealed=!cli.breathable, tiles=cityTiles(sealed,p.colony);
    const cell=[10,9,8,7,6][p.colony]||8;
    const span=Math.round(W*[0,.14,.3,.55,.9][p.colony]);
    let bx=0,bs=1e9;
    for(let x=0;x<W-span;x+=4){
      let r0=0,wet=0;
      for(let i=0;i<span;i++){const j=x+i;r0+=Math.abs(mid[j+1]-mid[j]);if(mid[j]>seaY-1)wet++;}
      const sc=r0+wet*40; if(sc<bs){bs=sc;bx=x;}
    }
    const n=Math.max(2,Math.floor(span/cell));
    const idx=wfc1d(tiles,n,rnd,i=>(i===0||i===n-1)?[0,1,2]:null);
    if(idx){
      const ft=facadeTiles(sealed),buildings=[];
      for(let i=0;i<n;i++){
        const t=tiles[idx[i]],x=bx+i*cell;
        if(t.id==='empty')continue;
        const gy=Math.min(mid[clamp(x+(cell>>1),0,W-1)],seaY);
        const hh={low:[5,9],block:[8,15],tall:[16,30],spire:[26,48],dome:[7,13],tube:[4,6],mast:[18,34]}[t.id];
        const hgt=hh?ri(rnd,hh[0],hh[1]):0;
        const fh=Math.max(2,Math.round(hgt/4));
        const fac=['low','block','tall','spire'].includes(t.id)
          ? wfc1d(ft,fh,rnd,i=>i===0?[0]:i===fh-1?[5,6,7]:null):null;
        buildings.push({type:t.id,x,w:cell-1,h:hgt,gy,fac,ft,seed:Math.floor(rnd()*1e6)});
      }
      city={bx,span,cell,buildings,sealed};
    }
  }

  /* 7.2 мозаика грунта */
  let ground=null;
  
  if(P.showWFCGround){
    const tiles=groundTiles(),cs=6,gw=Math.ceil(W/cs),gh=6;
    const idOf=m=>tiles.findIndex(t=>t.id===m+m);
    const pre=(gx,gy)=>{
      const x=clamp(gx*cs,0,W-1);
      let m=mat[x]; if(mid[x]>seaY-1)m='w'; if(m==='l')m='r';
      const list=[idOf(m)];
      for(let i=0;i<tiles.length;i++)if(tiles[i].mat===m)list.push(i);
      return list;
    };
    ground={cs,gw,gh,idx:wfc2d(tiles,gw,gh,rnd,pre),tiles};
  }

  /* 7.3 флора: спрайты из L-систем + расстановка по слоям */
  const plants={sprites:[],items:[]};
  if(P.showPlants){
    const names=P.plantMode==='auto'?autoSpecies(p,cli,L):[P.plantMode];
    for(const nm of names){
      if(!SPECIES[nm])continue;
      for(let v=0;v<P.plantVariants;v++){
        const sp=growSprite(nm,p,cli,L,mulberry32(s+v*131+nm.length*77));
        if(sp){sp.name=nm;plants.sprites.push(sp);}
      }
    }
    if(plants.sprites.length){
      const dens=P.plantDensity*(p.vegetation>0.02?p.vegetation:0.35);
      const place=(count,line,layer,scale)=>{
        for(let i=0;i<count;i++){
          const x=Math.floor(rnd()*W);
          if(line[x]>=seaY-1)continue;
          const cand=plants.sprites.filter(sp=>layer==='near'?true:sp.name!=='grass');
          if(!cand.length)continue;
          const sp=cand[Math.floor(rnd()*cand.length)];
          plants.items.push({sp,x,y:Math.round(line[x]),layer,scale});
        }
      };
      place(Math.round(90*dens), mid, 'mid', 1);
      place(Math.round(46*dens), near,'near',1.4);
      plants.items.sort((a,b)=>a.y-b.y);
    }
  }

  const stars=[];
  for(let i=0;i<300;i++)stars.push({x:hash1(i,s+3)*W,y:hash1(i,s+5)*horizon,b:hash1(i,s+7)});
  const rocks=[];
  for(let i=0;i<40;i++){
    const x=hash1(i,s+13)*W;
    rocks.push({x,y:near[Math.floor(clamp(x,0,W-1))]+hash1(i,s+17)*10,r:1+hash1(i,s+19)*3.5});
  }
  world={horizon,far,mid,near,seaY,mat,city,ground,plants,stars,rocks};

  curWeather=P.weatherMode==='auto'?pickWeather(wq,mulberry32(p.seed^0x5eed)):P.weatherPick;
  cloudKind=pickCloud();
  initParticles();

}
/* тип облачности: либо задан, либо выводится из погоды и климата */
function pickCloud(){
  if(P.cloudMode!=='auto')return P.cloudMode;
  if(P.pressure<0.05)return 'none';
  if(['storm','tornado','hail'].includes(curWeather))return 'storm';
  if(['rain','snow','blizzard'].includes(curWeather))return 'stratus';
  if(P.humidity>0.65)return 'cumulus';
  if(P.humidity>0.3)return 'cirrus';
  return P.haze>0.5?'stratus':'none';
}

/* ============================================================================
   8. КАДР
   ========================================================================== */
const cv=canvas,ctx=cv.getContext('2d');
const img=ctx.createImageData(W,H),buf=new Uint32Array(img.data.buffer);
let flash=0,tsec=0,skyRow=new Uint32Array(H);

const px=(x,y,c)=>{x|=0;y|=0;if(x<0||y<0||x>=W||y>=H)return;buf[y*W+x]=c;};
const blend=(x,y,c,a)=>{x|=0;y|=0;if(x<0||y<0||x>=W||y>=H||a<=0)return;
  const i=y*W+x;buf[i]=mixc(buf[i],c,a>1?1:a);};

function frame(dt){
  const p=P;
  const sunX=W*0.5+Math.sin(cli.az)*W*0.62;
  const sunY=world.horizon-Math.sin(cli.alt)*world.horizon*1.15;
  drawSky(sunX,sunY);
  drawCelestial(sunX,sunY);
  if(curWeather==='aurora'||(wq.aurora||0)>1.2)drawAurora();
  drawClouds(sunX,sunY);
  drawRidges();
  drawWater(sunX);
  drawPlants('mid');
  if(world.city)drawCity();
  drawForeground();
  drawPlants('near');
  if(P.showShip)drawLander();
  drawWeather(dt);
  post();
  ctx.putImageData(img,0,0);
}
/* 8.1 небо — прямо из модели рассеяния */
function drawSky(sunX,sunY){
  const hz=world.horizon;
  for(let y=0;y<H;y++){
    const t=clamp(y/hz,0,1);
    const path=lerp(1,4.2,Math.pow(t,1.5));
    const c=vsc(skyAt(L,path),L.ev);
    skyRow[y]=pack([Math.pow(clamp(c[0],0,1),.85),Math.pow(clamp(c[1],0,1),.85),Math.pow(clamp(c[2],0,1),.85)]);
  }
  for(let y=0;y<H;y++){const c=skyRow[y];for(let x=0;x<W;x++)buf[y*W+x]=quant(c,x,y,P.levels);}
  /* звёзды: видны там, где мало рассеяния */
  const see=clamp((1-clamp(L.opt,0,1.4)/1.4)*(1-L.tw)*1.5,0,1)*L.visibility;
  if(see>0.03)for(const st of world.stars){
    const b=st.b*see;
    if(b>0.1)blend(st.x,st.y,rgb(230,238,255),b*(0.55+0.45*Math.sin(tsec*2+st.x)));
  }
  /* ореол: радиус растёт с мутностью, яркость — с освещённостью */
  const gl=14+P.haze*90+P.dust*60+L.mie[0]*40;
  if(sunY<hz+20&&L.dayFactor>0.02){
    const sc=vsc(L.direct,L.ev*1.4), sun=pack([clamp(sc[0],0,1),clamp(sc[1],0,1),clamp(sc[2],0,1)]);
    for(let y=Math.max(0,sunY-gl);y<Math.min(hz+8,sunY+gl);y++)
      for(let x=Math.max(0,sunX-gl);x<Math.min(W,sunX+gl);x++){
        const d=Math.hypot(x-sunX,y-sunY)/gl;
        if(d<1)blend(x,y,sun,(1-d)*(1-d)*0.6);
      }
  }
}
function drawCelestial(sunX,sunY){
  const p=P;
  if(sunY<world.horizon+4){
    const r=2.5+Math.log10(Math.max(0.02,cli.insol)+1)*3+p.starT/9000;
    const dc=vsc(L.direct,L.ev*2.2);
    disc(sunX,sunY,r+1,pack([clamp(dc[0],0,1),clamp(dc[1],0,1),clamp(dc[2],0,1)]));
    disc(sunX,sunY,r,pack(vlerp(L.star,[1,1,1],0.55)));
  }
  for(let m=0;m<p.moons;m++){
    const a=(p.hour/24*Math.PI*2)*(0.6+m*0.28)+m*2.1+p.seed%7;
    const mx=W*0.5+Math.cos(a)*W*0.4, my=world.horizon-Math.abs(Math.sin(a))*world.horizon*0.85-4;
    if(my>world.horizon)continue;
    const r=4+m*2.5;
    const mc=vadd(vmul([.62,.62,.59],vsc(L.direct,0.9)),vmul([.62,.62,.59],L.amb));
    disc(mx,my,r,pack(vsc(mc,L.ev).map(v=>clamp(v,0,1))));
    const dx=Math.sign(mx-sunX)||1;
    for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){
      if(x*x+y*y>r*r)continue;
      if((x*dx)/r>-0.15+Math.sin(a*1.7)*0.5)blend(mx+x,my+y,rgb(18,20,30),0.72);
    }
  }
  if(p.rings)for(let x=0;x<W;x++){
    const y=world.horizon-40-Math.sin(x/W*Math.PI)*22;
    for(let k=0;k<7;k++) if(hash1(x*7+k,p.seed)>0.35)blend(x,y+k*1.6,rgb(210,200,180),0.28-k*0.02);
  }
}
function disc(cx,cy,r,c){for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=r*r)px(cx+x,cy+y,c);}
function drawAurora(){
  const a=clamp(wq.aurora||0,0,3)*0.3*(1-L.tw);
  if(a<0.02)return;
  for(let x=0;x<W;x++){
    const n=fbm1(x/40+tsec*0.12,3,P.seed+5);
    const top=world.horizon*0.15+n*30,len=30+fbm1(x/25-tsec*0.2,2,P.seed+8)*60;
    for(let y=top;y<top+len;y++){
      const f=1-(y-top)/len;
      blend(x,y,mixc(rgb(80,255,150),rgb(120,90,255),n),f*f*a*0.6);
    }
  }
}
/* 8.2 облака: четыре типа, освещаются тем же прямым и рассеянным светом */
const CLOUDS={
  cirrus :{top:.10,thick:14,cover:.42,stretch:5.5,soft:.55,dark:.92,speed:1.5},
  cumulus:{top:.30,thick:26,cover:.55,stretch:1.6,soft:.35,dark:.72,speed:1.0},
  stratus:{top:.22,thick:22,cover:.85,stretch:3.2,soft:.5, dark:.62,speed:0.6},
  storm  :{top:.05,thick:52,cover:.9, stretch:1.9,soft:.25,dark:.28,speed:1.2}
};
function drawClouds(sunX,sunY){
  if(cloudKind==='none'||P.pressure<0.03)return;
  const cfg=CLOUDS[cloudKind]; if(!cfg)return;
  const cover=clamp(P.cloudMode==='auto'?cfg.cover*(0.5+P.humidity):P.cloudCover,0,1);
  if(cover<0.04)return;
  const hz=world.horizon;
  const baseY=hz-(6+P.cloudHeight*44);
  const topY=Math.max(2,baseY-cfg.thick*(0.6+P.cloudHeight*0.9));
  const drift=tsec*cfg.speed*(4+P.wind*26)*P.cloudSpeed;
  /* цвета: верх освещён прямым светом, низ — только небом (у туч почти чёрный) */
  const topC=vadd(vmul([.92,.92,.95],vsc(L.direct,0.95)),vmul([.92,.92,.95],L.amb));
  const botA=[.92,.92,.95*1.0];
  const botC=vadd(vmul(botA,vsc(L.amb,1.05)),vsc(L.direct,0.05*cfg.dark));
  const cTop=pack(vsc(topC,L.ev).map(v=>clamp(v,0,1)));
  const cBot=pack(vsc(vsc(botC,cfg.dark),L.ev).map(v=>clamp(v,0,1)));
  const anvil=cloudKind==='storm';
  for(let x=0;x<W;x++){
    /* грозовая наковальня: шапка расползается в стороны */
    const spread=anvil?smoothstep(0,1,fbm1((x+drift*0.3)/70,2,P.seed+17))*10:0;
    for(let y=topY-spread;y<baseY;y++){
      const t=clamp((y-(topY-spread))/Math.max(1,baseY-(topY-spread)),0,1);
      const n=fbm2((x+drift)/(26*cfg.stretch),y/(cfg.stretch>3?26:13),4,P.seed+91);
      /* плоское основание у кучевых и туч, размытое у перистых */
      const shape=anvil?smoothstep(0,.25,t)*smoothstep(1,.85,t)
                : cloudKind==='cumulus'?smoothstep(0,.4,t)*(1-Math.pow(t,4))
                : smoothstep(0,.3,t)*smoothstep(1,.7,t);
      const d=(n-(1-cover*0.9))*3.2*shape;
      if(d<=0)continue;
      const c=mixc(cBot,cTop,Math.pow(1-t,anvil?2.2:1.3)*(0.35+0.65*smoothstep(0.4,0.8,n)));
      blend(x,y,c,clamp(d,0,1)*(1-cfg.soft*0.4));
    }
  }
  /* подсветка низа облаков на закате — свет идёт снизу-сбоку */
  if(L.tw>0.02&&L.tw<0.85){
    const gc=pack(vsc(vsc(L.direct,L.ev*1.6),1).map(v=>clamp(v,0,1)));
    for(let x=0;x<W;x++)for(let y=baseY-6;y<baseY;y++)
      blend(x,y,gc,0.16*(1-Math.abs(x-sunX)/W)*(1-L.tw));
  }
  if(anvil&&flash>0.15)for(let x=0;x<W;x++)for(let y=topY-6;y<baseY;y++)
    blend(x,y,rgb(220,230,255),flash*0.35*Math.max(0,1-Math.abs(y-baseY)/40));
}
/* 8.3 рельеф */
function drawRidges(){
  const aer=clamp(L.opt*0.35+P.dust*0.45+P.haze*0.4,0,0.85);
  const layers=[[world.far,0.78],[world.mid,0.32]];
  for(let li=0;li<layers.length;li++){
    const[h,depth]=layers[li];
    for(let x=0;x<W;x++){
      const sl=(h[Math.min(W-1,x+1)]-h[Math.max(0,x-1)])*0.5;
      const lit=clamp(0.55-sl*0.4,0,1);
      const m=li===0?'r':world.mat[x];
      const skyC=skyRow[clamp(Math.floor(h[x])-2,0,H-1)];
      const bottom=li===0?world.mid[x]:Math.min(world.seaY,world.near[x]);
      for(let y=Math.floor(h[x]);y<bottom;y++){
        const d=(y-h[x])/26;
        let c=shadeC(m==='r'?(vn2(x/7,y/7,P.seed+1)>0.5?'r':'r2'):m, clamp(lit-d*0.3,0,1));
        c=mixc(c,skyC,aer*depth);
        px(x,y,quant(c,x,y,P.levels));
      }
    }
  }
}
/* 8.4 жидкость */
function drawWater(sunX){
  const p=P;
  if(p.liquid<0.01||p.liquidType==='none')return;
  const sea=world.seaY, hot=p.liquidType==='lava';
  for(let x=0;x<W;x++){
    const bottom=Math.min(world.near[x],H);
    if(sea>=bottom)continue;
    for(let y=Math.floor(sea);y<bottom;y++){
      const d=(y-sea)/Math.max(4,bottom-sea);
      const wave=Math.sin(x*0.19+tsec*(1.2+p.wind*3)+y*0.4)*0.5+0.5;
      let c=shadeC(hot?'l':'w',clamp(0.85-d*0.5,0,1));
      if(!hot){
        c=mixc(c,skyRow[clamp(Math.floor(sea)-6,0,H-1)],(1-d)*0.38*(1-p.wind*0.4));
        if(wave>0.86-p.wind*0.25&&d<0.5)c=mixc(c,shadeC('i',1),0.4*(1-d));
      } else {
        const g=fbm2(x/12+tsec*0.4,y/6,3,p.seed+4);
        if(g>0.72)c=mixc(c,rgb(255,224,140),0.6);
      }
      px(x,y,quant(c,x,y,P.levels));
    }
    if(!hot&&L.dayFactor>0.05&&Math.abs(x-sunX)<26){
      const k=1-Math.abs(x-sunX)/26;
      const dc=vsc(L.direct,L.ev*1.5), sun=pack([clamp(dc[0],0,1),clamp(dc[1],0,1),clamp(dc[2],0,1)]);
      for(let y=Math.floor(sea);y<Math.min(bottom,sea+30);y++){
        const f=1-(y-sea)/30;
        if(hash2(x,Math.floor(y+tsec*3),p.seed)<0.35*k*f)blend(x,y,sun,0.8*k*f);
      }
    }
  }
}
/* 8.5 флора */
function drawPlants(layer){
  const pl=world.plants; if(!pl||!pl.items.length)return;
  const aer=layer==='mid'?clamp(L.opt*0.2+P.haze*0.25,0,0.5):0;
  for(const it of pl.items){
    if(it.layer!==layer)continue;
    const sp=it.sp, skyC=skyRow[clamp(it.y-10,0,H-1)];
    for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++){
      const c=sp.pix[y*sp.w+x]; if(!c)continue;
      const dx=it.x+x-sp.ax, dy=it.y+y-sp.ay;
      px(dx,dy,aer>0?mixc(c,skyC,aer):c);
    }
  }
}
/* 8.6 поселение */
function drawCity(){
  const C=world.city, night=1-L.dayFactor;
  const metal=t=>shadeC('m',t), glass=t=>shadeC('gl',t), litC=shadeC('lit',1);
  for(const b of C.buildings){
    const rnd=mulberry32(b.seed), x0=b.x, x1=b.x+b.w, gy=Math.floor(b.gy);
    if(b.type==='pad'){
      for(let x=x0;x<=x1;x++){px(x,gy-1,metal(.5));px(x,gy,metal(.35));}
      for(let x=x0+1;x<x1;x+=2)blend(x,gy-2,litC,0.6+0.4*Math.sin(tsec*4+x));
      continue;
    }
    if(b.type==='park'){
      for(let x=x0;x<=x1;x++){
        const h=2+Math.floor(hash1(x,b.seed)*4);
        for(let y=gy-h;y<gy;y++)px(x,y,shadeC('g',.8));
      }
      continue;
    }
    if(['road','road2','plaza'].includes(b.type)){for(let x=x0;x<=x1;x++)px(x,gy-1,metal(.3));continue;}
    if(b.type==='mast'){
      const cx=(x0+x1)>>1;
      for(let y=gy-b.h;y<gy;y++)px(cx,y,metal(.6));
      blend(cx,gy-b.h,rgb(255,80,60),0.4+0.6*Math.abs(Math.sin(tsec*2)));
      continue;
    }
    if(b.type==='dome'||b.type==='tube'){
      const cx=(x0+x1)/2,r=b.type==='dome'?(b.w/2+1):b.w/2;
      for(let y=gy-b.h;y<gy;y++)for(let x=x0;x<=x1;x++){
        const dx=(x-cx)/r,dy=(y-gy)/b.h;
        if(dx*dx+dy*dy<=1){
          let c=mixc(glass(clamp(.4-dx*.5,0,1)),metal(.55),.35);
          if(night>0.55&&hash2(x,y,b.seed)<0.25)c=mixc(c,litC,0.7);
          px(x,y,c);
        }
      }
      continue;
    }
    const fh=b.fac?b.fac.length:1, step=Math.max(2,Math.round(b.h/fh));
    let y=gy;
    for(let i=0;i<fh;i++){
      const t=b.fac?b.ft[b.fac[i]].id:'floor', top=y-step;
      for(let yy=top;yy<y;yy++)for(let x=x0;x<=x1;x++){
        const edge=(x===x0||x===x1);
        px(x,yy,metal(edge?.4:(t==='tech'?.5:.62)));
      }
      if(t==='floor'||t==='balcony')
        for(let x=x0+1;x<x1;x+=2)for(let yy=top+1;yy<y-1;yy+=2){
          const on=night>0.45&&hash2(x,yy,b.seed)<0.55;
          blend(x,yy,on?litC:glass(.6),on?0.95:0.75);
        }
      if(t==='tech')for(let x=x0;x<=x1;x+=3)blend(x,top+1,metal(.9),0.6);
      if(t==='balcony'&&!C.sealed)for(let x=x0-1;x<=x1+1;x++)blend(x,top,metal(.45),0.8);
      if(t==='cornice')for(let x=x0-1;x<=x1+1;x++)px(x,top,metal(.7));
      if(t==='domeTop'){
        const cx=(x0+x1)/2,r=b.w/2+1;
        for(let yy=top-r;yy<top;yy++)for(let x=x0-1;x<=x1+1;x++){
          const dx=(x-cx)/r,dy=(yy-top)/r;
          if(dx*dx+dy*dy<=1)px(x,yy,mixc(glass(.6),metal(.55),.4));
        }
      }
      if(t==='antenna'){
        const cx=(x0+x1)>>1;
        for(let yy=top-ri(rnd,4,10);yy<top;yy++)px(cx,yy,metal(.6));
        blend(cx,top-6,rgb(255,80,60),0.5+0.5*Math.sin(tsec*3+b.x));
      }
      y=top;
    }
  }
}
/* 8.7 передний план */
function drawForeground(){
  const g=world.ground;
  for(let x=0;x<W;x++){
    const top=Math.floor(world.near[x]);
    for(let y=top;y<H;y++){
      let m=world.mat[x];
      if(g){
        const gx=Math.min(g.gw-1,Math.floor(x/g.cs)), gy=Math.min(g.gh-1,Math.floor((y-top)/g.cs));
        const t=g.tiles[g.idx[gy*g.gw+gx]];
        m=(t.kind==='edge'&&((x%g.cs)+(y%g.cs))/(g.cs*2)>0.5)?t.to:t.mat;
      }
      if(m==='r'&&vn2(x/7,y/7,P.seed+1)<0.5)m='r2';
      const d=(y-top)/30;
      px(x,y,quant(shadeC(m,clamp(0.5-d*0.35,0,1)),x,y,P.levels));
    }
    px(x,top,shadeC(world.mat[x],0.95));
  }
  for(const r of world.rocks)
    for(let y=-r.r;y<=r.r;y++)for(let x=-r.r;x<=r.r;x++){
      if(x*x+y*y>r.r*r.r)continue;
      px(r.x+x,r.y+y,shadeC('r',clamp(0.6-x/r.r*0.45-y/r.r*0.25,0,1)));
    }
}
function drawLander(){
  const x0=Math.round(W*0.14), gy=Math.round(world.near[clamp(x0,0,W-1)])+4;
  const body=shadeC('m',.7), dark=shadeC('m',.35);
  for(let y=gy-16;y<gy-4;y++)for(let x=x0-7;x<=x0+7;x++){
    const t=(y-(gy-16))/12, wd=7-Math.abs(t-0.5)*4;
    if(Math.abs(x-x0)<=wd)px(x,y,Math.abs(x-x0)>wd-2?dark:body);
  }
  for(let x=x0-3;x<=x0+3;x++)px(x,gy-13,shadeC('gl',.8));
  for(const s of[-6,6]){
    for(let k=0;k<8;k++)px(x0+s+Math.sign(s)*k*0.5,gy-5+k,dark);
    for(let x=-2;x<=2;x++)px(x0+s+Math.sign(s)*4+x,gy+3,dark);
  }
  if(1-L.dayFactor>0.35){
    blend(x0,gy-18,rgb(255,90,70),0.5+0.5*Math.sin(tsec*3));
    for(let x=x0-10;x<=x0+10;x++)blend(x,gy+3,shadeC('lit',1),0.12*(1-Math.abs(x-x0)/12));
  }
}

/* ============================================================================
   9. ПОГОДА
   ========================================================================== */
let parts=[],bolt=null,tor=null;
function initParticles(){
  parts=[];bolt=null;tor=null;
  const n={rain:260,snow:200,blizzard:340,hail:120,dust:300,ash:180,storm:300,tornado:260}[curWeather]||0;
  for(let i=0;i<Math.round(n*P.weatherPower);i++)parts.push(newPart());
  if(curWeather==='tornado')tor={x:W*(0.35+surfaceRnd()*0.35),phase:surfaceRnd()*6};
}
const newPart=()=>({x:surfaceRnd()*W*1.4-W*0.2,y:surfaceRnd()*H-40,v:0.4+surfaceRnd(),r:surfaceRnd(),a:surfaceRnd()*6.28});
function drawWeather(dt){
  const p=P,w=curWeather,pw=P.weatherPower,gv=clamp(p.gravity,0.05,3);
  const wind=(p.wind*2+(w==='blizzard'||w==='tornado'?2.5:0))*(1+pw);
  const fall={rain:150,snow:22,blizzard:40,hail:210,dust:30,ash:14,storm:170,tornado:60}[w]||0;
  if(w==='fog'||p.haze>0.6){
    for(let i=0;i<5;i++){
      const y=world.horizon-8+i*7+Math.sin(tsec*0.4+i)*2;
      for(let x=0;x<W;x++)
        blend(x,y,shadeC('i',.8),fbm2((x+tsec*8*p.wind)/50,i,2,p.seed+31)*0.25*(w==='fog'?1:0.5)*pw);
    }
  }
  for(const q of parts){
    q.y+=fall*q.v*dt*Math.sqrt(gv)*0.35;
    q.x+=wind*q.v*dt*18+(w==='snow'?Math.sin(tsec*2+q.a)*8*dt:0);
    if(tor){const dx=q.x-tor.x,d=Math.max(6,Math.abs(dx));q.x-=Math.sign(dx)*(40/d)*dt*40;q.y-=(30/d)*dt*20;}
    if(q.y>H+4||q.x<-W*0.25||q.x>W*1.25){Object.assign(q,newPart());q.y=-4;}
    const gy=world.near[clamp(Math.floor(q.x),0,W-1)];
    if(q.y>gy+2&&w!=='dust'&&w!=='ash'){Object.assign(q,newPart());q.y=-4;continue;}
    if(w==='rain'||w==='storm'){
      const len=3+q.v*4;
      for(let k=0;k<len;k++)blend(q.x-wind*k*0.12,q.y-k,rgb(170,200,230),0.35*(1-k/len));
    } else if(w==='snow'||w==='blizzard'){
      blend(q.x,q.y,rgb(240,246,255),w==='blizzard'?0.85:0.7);
      if(q.r>0.7)blend(q.x+1,q.y,rgb(240,246,255),0.35);
    } else if(w==='hail'){blend(q.x,q.y,rgb(220,235,245),0.9);blend(q.x,q.y+1,rgb(180,200,220),0.5);}
    else if(w==='dust'){
      const c=shadeC('s',clamp(0.4+q.r*0.5,0,1));
      for(let k=0;k<4;k++)blend(q.x-k*1.6,q.y,c,0.3*(1-k/4));
    } else if(w==='ash'){
      const hotp=q.r>0.85;
      blend(q.x,q.y,hotp?rgb(255,140,50):rgb(80,76,74),hotp?0.9:0.55);
    } else if(w==='tornado')blend(q.x,q.y,shadeC('s',0.3+q.r*0.3),0.5);
  }
  if(w==='dust'||w==='blizzard'||w==='ash'){
    const c=w==='blizzard'?shadeC('i',.9):w==='ash'?rgb(70,64,62):shadeC('s',.6);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)
      if(((x+y)&1)===0)blend(x,y,c,0.16*pw*(y/H*0.6+0.4));
  }
  if(w==='meteors'&&surfaceRnd()<0.04){
    const x=surfaceRnd()*W,y=surfaceRnd()*world.horizon*0.7;
    for(let k=0;k<14;k++)blend(x+k*1.6,y+k*0.9,rgb(255,240,210),1-k/14);
  }
  if(tor)drawTornado();
  if((w==='storm'||w==='tornado')&&surfaceRnd()<0.02*pw)strike();
  if(bolt){
    for(let i=0;i<bolt.length-1;i++){
      const a=bolt[i],b=bolt[i+1],n=Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]));
      for(let k=0;k<=n;k++)blend(lerp(a[0],b[0],k/n),lerp(a[1],b[1],k/n),rgb(230,240,255),1);
    }
    bolt=null;
  }
  if(flash>0){
    for(let i=0;i<buf.length;i++)buf[i]=mixc(buf[i],rgb(226,236,255),flash*0.5);
    flash=Math.max(0,flash-dt*4.5);
  }
}
function strike(){
  const x0=surfaceRnd()*W, base=world.horizon-24, gy=world.mid[clamp(Math.floor(x0),0,W-1)];
  const pts=[[x0,base-20]];let x=x0,y=base-20;
  while(y<gy){y+=4+surfaceRnd()*8;x+=(surfaceRnd()-0.5)*16;pts.push([x,Math.min(y,gy)]);}
  bolt=pts;flash=1;
}
function drawTornado(){
  const base=world.mid[clamp(Math.floor(tor.x),0,W-1)], top=world.horizon-30;
  for(let y=top;y<base;y++){
    const t=(y-top)/(base-top), wob=Math.sin(tsec*1.6+t*5+tor.phase)*10*(1-t*0.6);
    const r=lerp(16,3.5,Math.pow(t,0.65)), cx=tor.x+wob;
    for(let x=-r;x<=r;x++){
      const e=Math.abs(x)/r, spin=Math.sin(tsec*7+t*9+x*0.4);
      blend(cx+x,y,shadeC('s',clamp(0.25+0.3*spin,0,1)),(0.25+0.55*e)*(0.6+0.4*spin)*0.9);
    }
  }
  for(let i=0;i<40;i++){
    const a=tsec*5+i,r=10+surfaceRnd()*22;
    blend(tor.x+Math.cos(a)*r,base-Math.abs(Math.sin(a))*6,shadeC('s',0.4),0.5);
  }
  tor.x+=Math.sin(tsec*0.3)*0.35;
}
function post(){
  const vis=L.visibility;
  if(vis<0.98){
    const hz=mixc(shadeC('s',.7),skyRow[world.horizon],0.5);
    for(let y=0;y<H;y++){
      const k=(1-vis)*smoothstep(world.horizon-40,world.horizon+30,y)*0.5;
      if(k<0.01)continue;
      for(let x=0;x<W;x++)buf[y*W+x]=mixc(buf[y*W+x],hz,k);
    }
  }
}

/* ============================================================================
   10. ИНТЕРФЕЙС
   ========================================================================== */

  P=Object.assign({},DEF,profile,{
    seed:profile.seed??DEF.seed, moons:profile.moons??0, rings:profile.rings??false,
    exposure:profile.exposure??1.55, levels:profile.levels??26
  });
  buildWorld();
  let previous=0;
  return {
    get diagnostics(){ return { plantSprites:world.plants.sprites.length, plantItems:world.plants.items.length, weather:curWeather, cloudKind }; },
    get profile(){ return {...P}; },
    get weather(){ return curWeather; },
    render(seconds,phase=0){
      P.hour=((phase/(Math.PI*2))*24+6+24)%24;
      cli=climate(P); L=lighting(P,cli); L.insolLocal=cli.insol; wq=weatherWeights(P,cli,L); buildLUT(L);
      const dt=Math.min(.1,Math.max(0,seconds-previous)); previous=seconds; tsec=seconds; frame(dt);
    }
  };
}
