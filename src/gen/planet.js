import { mulberry32 } from "../core/rng.js";
import { fbm } from "../core/noise.js";
import { BAYER, SHADE, shadeTable, hex2rgb } from "../core/color.js";

export const PT = {
  terran:{ caps:true, craters:0,
    bands:[[0.40,"#12335f"],[0.50,"#1d5fae"],[0.535,"#3e9bd6"],[0.565,"#d8c07a"],
           [0.66,"#58a14e"],[0.79,"#35753c"],[0.88,"#8a7f6d"],[1.01,"#e8ecf1"]], ice:"#dfe9f2" },
  ocean:{ caps:true, craters:0,
    bands:[[0.32,"#0d2a5e"],[0.52,"#164a8a"],[0.63,"#1f6cb5"],[0.69,"#3fa0d8"],
           [0.725,"#7cc8e8"],[0.77,"#dcc584"],[1.01,"#4c9450"]], ice:"#e6f0f8" },
  desert:{ caps:false, craters:4,
    bands:[[0.30,"#5d3419"],[0.45,"#7a4a20"],[0.58,"#9a6329"],[0.72,"#b98136"],
           [0.86,"#d5a24d"],[1.01,"#eec97f"]] },
  ice:{ caps:false, craters:0,
    bands:[[0.34,"#27528c"],[0.47,"#3f7cb8"],[0.60,"#6aa8d8"],[0.74,"#9fd0ea"],
           [0.88,"#cfe8f5"],[1.01,"#f2f8fc"]] },
  lava:{ caps:false, craters:0,
    bands:[[0.44,"#191118"],[0.58,"#3d1f24"],[0.70,"#7a2a1d"],[0.82,"#c8451c"],
           [0.92,"#ef7d1a"],[1.01,"#ffd54a"]] },
  gas:{ caps:false, craters:0, gas:true,
    schemes:[
      ["#c9a37a","#e0c297","#a8785a","#ead9b6","#8a5a44","#d9b287"],
      ["#4f7fae","#8fb8d8","#33597f","#c2d9e8","#6898c2","#274465"],
      ["#b06ad0","#d9a8ec","#7c3fa8","#eccdf5","#9a56c4","#5b2d7a"],
      ["#4f9e8a","#8fd0be","#2f6e5e","#c8e8de","#69b8a2","#1f4c40"]] },
  alien:{ caps:false, craters:0,
    bands:[[0.36,"#14532d"],[0.48,"#22884b"],[0.545,"#7ee08a"],[0.68,"#5b2d7a"],
           [0.84,"#7c3fa8"],[1.01,"#b06ad0"]] },
  moon:{ caps:false, craters:10,
    bands:[[0.30,"#2e2b33"],[0.46,"#4a4652"],[0.60,"#6b6675"],[0.74,"#8d8798"],
           [0.88,"#b3adbd"],[1.01,"#d8d3e0"]] }
};
export const PT_RU = {
  terran:"землеподобная", ocean:"океаническая", desert:"пустынная", ice:"ледяная",
  lava:"лавовая", gas:"газовый гигант", alien:"чужой мир", moon:"мёртвый мир"
};
export const TILT = -0.42, RING_SQ = 0.34;
const cosT = Math.cos(TILT), sinT = Math.sin(TILT);

/** Physical and visual surface parameters. They are stored on the generated
 * body, rather than chosen by the landing screen, so every view uses the same
 * deterministic planet. Values not implied by the class come from its seed. */
export function makeSurfaceProfile(body,sun={temp:5700,D:38}){
  const rng=mulberry32((body.seed^0x51f15e)>>>0),type=body.type||"moon";
  const flux=Math.pow((sun.D||38)/37.7,2)*Math.pow((sun.temp||5700)/5700,4)/Math.pow(Math.max(30,body.dist||100)/100,2);
  const base={terran:[1,.78,.21,.01,.06,.55,.62,.56],ocean:[1.4,.72,.24,.02,.04,.82,.82,.42],desert:[.05,.03,0,.88,.22,.05,.03,.58],ice:[.3,.84,0,.12,.2,.34,.08,.3],lava:[5,.18,0,.6,.55,.12,0,.85],gas:[12,.72,0,.08,.5,.8,0,.28],alien:[1,.55,.08,.16,.25,.42,.48,.64],moon:[0,0,0,.4,0,0,0,.42]}[type]||[0,0,0,.4,0,0,0,.42];
  const pressure=type==="moon"?0:Math.max(0,type==="gas"?8:base[0]*(.72+rng()*.72));
  const greenhouse=type==="lava"?170:type==="ocean"?28:type==="terran"?20:type==="alien"?18:type==="ice"?5:0;
  const tempK=Math.round(278*Math.pow(Math.max(.001,flux),.25)+greenhouse+(rng()-.5)*16);
  const liquidType=type==="lava"?"lava":type==="ice"?(tempK<130?"methane":"water"):type==="alien"?(rng()<.45?"ammonia":"water"):type==="terran"||type==="ocean"?"water":"none";
  const liquid=liquidType==="none"?0:Math.min(.94,Math.max(0,base[5]+(rng()-.5)*.22));
  const gCO2=type==="desert"?.84:type==="lava"?.45:type==="alien"?.2:type==="ice"?.07:.004+rng()*.018;
  const gCH4=type==="ice"?.12:type==="alien"?.08:type==="gas"?.08:0;
  const gSO2=type==="lava"?.28:0;
  const gH2O=liquidType==="water"?Math.min(.12,.01+liquid*.06):0;
  const vegetation=pressure>.25&&tempK>235&&tempK<335&&liquid>0.08?(type==="alien"?.2+rng()*.6:type==="terran"||type==="ocean"?.25+rng()*.65:rng()*.18):0;
  return {tempK,pressure,gravity:Math.max(.05,Math.min(3,(body.size||16)/18*(.8+rng()*.4))),starT:sun.temp||5700,starLum:flux*Math.pow(Math.max(.3,(body.dist||100)/100),2),orbitAU:(body.dist||100)/100,
    gN2:Math.max(0,base[1]-gCO2-gCH4),gO2:vegetation>.22?base[2]:0,gCO2,gCH4,gSO2,gH2O,
    dust:Math.min(1,base[3]+(rng()-.5)*.24),haze:Math.min(1,base[4]+(rng()-.5)*.2),wind:rng(),magnetic:rng(),
    liquid,liquidType,humidity:liquidType==="water"?Math.min(1,.18+liquid*.75+rng()*.15):rng()*.25,vegetation,flora:Math.floor(rng()*360),volcanism:type==="lava"?.6+rng()*.4:rng()*.18,minerals:Math.min(1,base[7]+(rng()-.5)*.35),relief:.28+rng()*.82,roughness:rng(),
    lat:-70+rng()*140,tilt:rng()*42,season:rng(),hour:rng()*24,cloudCover:pressure>.04?Math.min(1,(liquid*.65+vegetation*.2+rng()*.25)):0,cloudHeight:rng(),cloudSpeed:.15+rng()*1.2,
    plantIter:2+Math.floor(rng()*4),plantAngle:12+Math.floor(rng()*30),plantSize:.55+rng()*1.2,plantDensity:vegetation*(.5+rng()),plantVariants:1+Math.floor(rng()*4),colony:vegetation>.2&&rng()>.7?1+Math.floor(rng()*3):0};
}

const clamp01=v=>Math.max(0,Math.min(1,v));
const blendRgb=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*clamp01(t)));
function floraRgb(h){
  const c=(1-Math.abs((h/60)%6-3))*0.45+.2;
  const pick=n=>Math.round(255*Math.max(0,Math.min(1,c-Math.max(0,Math.min(1,Math.abs((h/60+n)%6-3)-1)))));
  return [pick(0),pick(4),pick(2)];
}
const LIQUID_RGB={water:[24,104,176],methane:[31,83,98],ammonia:[74,124,133],lava:[224,73,21]};

/** Palette used by the shared canvas globe renderer.  It derives visible
 * terrain, liquid and dust colours from the same profile as LandingScene. */
export function surfacePalette(body,cols){
  const q=body.surface;
  if (!q || PT[body.type]?.gas) return cols;
  const liquid=LIQUID_RGB[q.liquidType] || LIQUID_RGB.water;
  const liquidBands={terran:3,ocean:4,ice:2,alien:1}[body.type] || 0;
  const flora=floraRgb(q.flora||110), mineral=[145,78,48];
  return cols.map((source,i)=>{
    let col=typeof source === "string" ? hex2rgb(source) : source.slice();
    const isLiquid=i<liquidBands && q.liquid>.02;
    if (isLiquid) col=blendRgb(col,liquid,.48+q.liquid*.38);
    else if (q.vegetation>.02 && body.type!=="desert") col=blendRgb(col,flora,q.vegetation*.58);
    col=blendRgb(col,mineral,(q.minerals||0)*.10+(q.dust||0)*.28);
    return col;
  });
}

/** Запекает текстуру и спрайт планеты в p (мутирует объект). */
export function bakePlanet(p){
  const T = PT[p.type];
  const small = p.size < 12, big = p.size > 60;
  const w = big ? 200 : (small ? 72 : 128), h = Math.round(w/2);
  const idx = new Uint8Array(w*h);
  const cloud = new Uint8Array(w*h);
  const rng = mulberry32(p.seed ^ 0x9e3779b9);
  const nseed = (p.seed * 2654435761) | 0;
  const scale = T.gas ? 2.2 : 2.8;
  let cols;
  if (T.gas){ cols = T.schemes[Math.floor(rng()*T.schemes.length)]; }
  else { cols = T.bands.map(b => b[1]); if (T.caps) cols.push(T.ice); }
  cols = surfacePalette(p, cols);
  const capIdx = cols.length - 1;
  const craters = [];
  for(let i = 0; i < (T.craters||0); i++){
    const u = rng()*Math.PI*2, v = Math.acos(2*rng()-1);
    craters.push({ x:Math.sin(v)*Math.cos(u), y:Math.cos(v), z:Math.sin(v)*Math.sin(u), r:0.10+rng()*0.22 });
  }
  const bandFreq = 3 + Math.floor(rng()*4);
  const turb = 0.9 + rng()*1.4;
  for(let ty=0; ty<h; ty++){
    const lat = (ty/h - 0.5)*Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for(let tx=0; tx<w; tx++){
      const lon = tx/w*Math.PI*2;
      const px = cl*Math.cos(lon), py = sl, pz = cl*Math.sin(lon);
      const o = ty*w + tx;
      if (T.gas){
        const t = fbm(px*scale, py*scale, pz*scale, nseed, 4);
        const s = lat*bandFreq + (t-0.5)*turb*2;
        idx[o] = ((Math.floor(s) % cols.length) + cols.length) % cols.length;
      } else {
        let n = fbm(px*scale, py*scale, pz*scale, nseed, 4);
        n = Math.min(1, Math.max(0, (n-0.5)*1.9 + 0.5));
        for(const c of craters){
          const d = Math.sqrt((px-c.x)**2 + (py-c.y)**2 + (pz-c.z)**2);
          if (d < c.r){ n = d > c.r*0.75 ? Math.min(1, n+0.18) : Math.max(0, n*0.45-0.12); }
        }
        let ci = 0;
        for(let b=0; b<T.bands.length; b++){ if (n <= T.bands[b][0]){ ci = b; break; } }
        if (T.caps && Math.abs(sl) > 0.80 && n > 0.42) ci = capIdx;
        idx[o] = ci;
      }
      const cn = fbm(px*1.9+40, py*1.9-17, pz*1.9+8, nseed ^ 0x5bd1e995, 3);
      const cover=p.surface?.cloudCover ?? (p.clouds ? .5 : 0);
      const cutoff=.79-cover*.31;
      cloud[o] = cover>.02 && cn > cutoff ? 2 : (cover>.08 && cn > cutoff-.05 ? 1 : 0);
    }
  }
  p.tex = { w, h, idx, cloud };
  p.pal = shadeTable(cols, SHADE);
  p.cloudCols = shadeTable(["#f4f6fb","#c3cde0"], SHADE);
  p.ringDens = new Uint8Array(48);
  const rrng = mulberry32(p.seed ^ 0x1234abcd);
  let on = 1;
  for(let i=0;i<48;i++){ if (rrng()<0.22) on = 1-on; p.ringDens[i] = on ? (rrng()<0.35?2:1) : 0; }
  p.ringCols = shadeTable(["#d9cdb0","#8f8268"], SHADE);
  const D = p.size;
  const C = p.rings ? Math.ceil(D*2.3) : D + 4;
  p.C = C; p.pr = D/C;
  p.cvs = document.createElement("canvas"); p.cvs.width = C; p.cvs.height = C;
  p.pctx = p.cvs.getContext("2d");
  p.img = p.pctx.createImageData(C, C);
  if (p.rot === undefined){ p.rot = rng()*6; p.crot = rng()*6; }
  p.spin = 0.4 + ((p.seed % 13)/13)*0.9;
}

/** Кадр планеты: освещение (lx,ly,lz), облака и кольца с перекрытием. */
export function renderPlanetBody(p, lx, ly, lz){
  const C = p.C, pr = p.pr, inv = 1/pr;
  const d = p.img.data;
  const tex = p.tex;
  for(let y=0; y<C; y++){
    for(let x=0; x<C; x++){
      const o = (y*C + x)*4;
      const sx = (x+0.5)/C*2 - 1, sy = (y+0.5)/C*2 - 1;
      const nx = sx*inv, ny = sy*inv;
      const dd = nx*nx + ny*ny;
      const bay = BAYER[(y & 3)*4 + (x & 3)];
      let ringLvl = -1, ringFront = false, rr = 0;
      if (p.rings){
        const ru = nx*cosT + ny*sinT;
        const rv = (-nx*sinT + ny*cosT)/RING_SQ;
        rr = Math.sqrt(ru*ru + rv*rv);
        if (rr > 1.35 && rr < 2.15){
          const di = p.ringDens[Math.min(47, Math.floor((rr-1.35)/0.8*48))];
          if (di > 0){ ringLvl = di-1; ringFront = rv > 0; }
        }
      }
      let r=0,g=0,b=0,a=0;
      if (dd <= 1){
        const nz = Math.sqrt(1-dd);
        const lat = Math.asin(ny);
        let lon = Math.atan2(nx, nz) + p.rot;
        let u = lon/(Math.PI*2); u -= Math.floor(u);
        const tv = Math.min(tex.h-1, Math.max(0, Math.floor((lat/Math.PI+0.5)*tex.h)));
        const to = tv*tex.w + (Math.floor(u*tex.w) % tex.w);
        const dot = Math.max(0, nx*lx + ny*ly + nz*lz);
        let lvl = Math.round((1-dot)*4 + bay*1.3);
        lvl = Math.min(4, Math.max(0, lvl));
        let col = p.pal[tex.idx[to]][lvl];
        if (p.clouds || p.surface?.cloudCover > .02){
          let cu = (Math.atan2(nx, nz) + p.crot)/(Math.PI*2); cu -= Math.floor(cu);
          const cv = tex.cloud[tv*tex.w + (Math.floor(cu*tex.w) % tex.w)];
          if (cv > 0) col = p.cloudCols[2-cv][lvl];
        }
        r=col[0]; g=col[1]; b=col[2]; a=255;
        if (ringLvl >= 0 && ringFront){
          const rl = Math.min(4, Math.max(0, Math.round((rr-1.1)*1.4 + 1 + bay*1.2)));
          const rc = p.ringCols[ringLvl][rl];
          r=rc[0]; g=rc[1]; b=rc[2]; a=255;
        }
      } else if (ringLvl >= 0){
        const rl = Math.min(4, Math.max(0, Math.round((rr-1.1)*1.4 + 1 + bay*1.2)));
        const rc = p.ringCols[ringLvl][rl];
        r=rc[0]; g=rc[1]; b=rc[2]; a=255;
      }
      d[o]=r; d[o+1]=g; d[o+2]=b; d[o+3]=a;
    }
  }
  p.pctx.putImageData(p.img, 0, 0);
}

/**
 * Returns a body sprite suitable for its current on-screen LOD.  The high
 * levels reuse the deterministic texture but rasterise it at a denser native
 * resolution, avoiding a blurred canvas upscale when the camera is close.
 */
export function renderPlanetLod(p,lx,ly,lz,lod=0){
  if(lod<=0){renderPlanetBody(p,lx,ly,lz);return p.cvs;}
  const factor=lod===1?2:3;
  const C=Math.min(512,Math.max(p.C+1,Math.round(p.C*factor)));
  p._lodSprites ||= Object.create(null);
  let sprite=p._lodSprites[C];
  if(!sprite){
    const cvs=document.createElement("canvas");cvs.width=C;cvs.height=C;
    const pctx=cvs.getContext("2d");
    sprite={cvs,pctx,img:pctx.createImageData(C,C)};p._lodSprites[C]=sprite;
  }
  // Do not mutate the simulation body: a view only changes raster resolution.
  const view={...p,...sprite,C,pr:p.pr};
  renderPlanetBody(view,lx,ly,lz);
  return sprite.cvs;
}

/** Спутники планеты из переданного rng (порядок вызовов = контракт генерации!). */
export function genMoons(p, rng, sun){
  p.moonList = [];
  const base = (p.rings ? p.size*1.15 : p.size/2) + 8;
  for(let i=0; i<p.moons; i++){
    const m = {
      type: rng() < 0.6 ? "moon" : "ice",
      seed: Math.floor(rng()*99999),
      size: 6 + Math.floor(rng()*4),
      rings:false, clouds:false, moons:0,
      orbR: base + i*8 + rng()*3,
      ang: rng()*Math.PI*2,
      w: (1.5 - i*0.28) * (rng()<0.15 ? -1 : 1)
    };
    m.dist=p.dist;m.surface=makeSurfaceProfile(m,sun);bakePlanet(m);
    p.moonList.push(m);
  }
}
