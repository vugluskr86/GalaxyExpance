import { fbm } from "../core/noise.js";
import { BAYER, LIMB, blackbody, lerp3, shadeTable } from "../core/color.js";

const NB = 6;
export function starDiam(T){
  const t = Math.min(1, Math.max(0, (T-2500)/35000));
  return Math.round(34 + t*40);
}
export function bakeStar(st){
  const w=128, h=64;
  const gA = new Uint8Array(w*h), gB = new Uint8Array(w*h);
  const nseed = (st.seed * 2654435761) | 0;
  const scale = 3.0;
  for(let ty=0; ty<h; ty++){
    const lat = (ty/h-0.5)*Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for(let tx=0; tx<w; tx++){
      const lon = tx/w*Math.PI*2;
      const px = cl*Math.cos(lon), py = sl, pz = cl*Math.sin(lon);
      const o = ty*w + tx;
      let a = fbm(px*scale, py*scale, pz*scale, nseed, 3);
      let b = fbm(px*scale*1.3+55, py*scale*1.3-21, pz*scale*1.3+13, nseed ^ 0x2c1b3c6d, 3);
      gA[o] = Math.floor(Math.min(0.999, Math.max(0, (a-0.5)*1.8+0.5))*NB);
      gB[o] = Math.floor(Math.min(0.999, Math.max(0, (b-0.5)*1.8+0.5))*NB);
    }
  }
  st.tex = { w, h, gA, gB };
  const base = blackbody(st.temp);
  const c = st.temp > 9000 ? 0.5 : (st.temp > 6500 ? 0.8 : 1.0);
  const dark = lerp3(base, [0,0,0], 0.42*c);
  const brite = lerp3(base, [255,255,255], 0.55);
  const cols = [];
  for(let i=0;i<NB;i++) cols.push(lerp3(dark, brite, i/(NB-1)));
  st.bandCols = shadeTable(cols, LIMB);
  st.coronaCol = lerp3(base, [255,255,255], 0.25);
  const C = Math.ceil(st.D*1.7);
  st.C = C; st.pr = st.D/C;
  st.cvs = document.createElement("canvas"); st.cvs.width = C; st.cvs.height = C;
  st.pctx = st.cvs.getContext("2d");
  st.img = st.pctx.createImageData(C, C);
  if (st.rot === undefined) st.rot = 0;
}
function coronaRay(ang, t){
  return 0.5 + 0.24*Math.sin(ang*7+t*0.9) + 0.16*Math.sin(ang*13-t*1.7) + 0.10*Math.sin(ang*23+t*2.6);
}
export function renderStar(st, t){
  const C = st.C, pr = st.pr, inv = 1/pr;
  const d = st.img.data;
  const tex = st.tex;
  const flick = Math.sin(t*3.1)*0.4 + Math.sin(t*7.7)*0.25;
  for(let y=0; y<C; y++){
    for(let x=0; x<C; x++){
      const o = (y*C + x)*4;
      const sx = (x+0.5)/C*2 - 1, sy = (y+0.5)/C*2 - 1;
      const nx = sx*inv, ny = sy*inv;
      const dd = nx*nx + ny*ny;
      const bay = BAYER[(y & 3)*4 + (x & 3)];
      let r=0,g=0,b=0,a=0;
      if (dd <= 1){
        const nz = Math.sqrt(1-dd);
        const lat = Math.asin(ny);
        let lonA = Math.atan2(nx, nz) + st.rot;
        let lonB = Math.atan2(nx, nz) - st.rot*0.55 + 2.1;
        let uA = lonA/(Math.PI*2); uA -= Math.floor(uA);
        let uB = lonB/(Math.PI*2); uB -= Math.floor(uB);
        const tv = Math.min(tex.h-1, Math.max(0, Math.floor((lat/Math.PI+0.5)*tex.h)));
        const oA = tv*tex.w + (Math.floor(uA*tex.w) % tex.w);
        const oB = tv*tex.w + (Math.floor(uB*tex.w) % tex.w);
        let band = Math.round((tex.gA[oA] + tex.gB[oB])/2 + bay*1.4 + flick*0.4);
        band = Math.min(NB-1, Math.max(0, band));
        let lvl = Math.round((1-nz)*4.6 + bay*1.1);
        lvl = Math.min(4, Math.max(0, lvl));
        const col = st.bandCols[band][lvl];
        r=col[0]; g=col[1]; b=col[2]; a=255;
      } else {
        const rad = Math.sqrt(dd);
        const ang = Math.atan2(sy, sx);
        const edge = 1.12 + coronaRay(ang, t + st.seed)*0.22;
        if (rad < edge){
          const pgl = (rad-1)/(edge-1);
          if (pgl + bay*0.9 < 0.72){
            r=st.coronaCol[0]; g=st.coronaCol[1]; b=st.coronaCol[2];
            a = pgl < 0.28 ? 190 : (pgl < 0.5 ? 120 : 70);
          }
        }
      }
      d[o]=r; d[o+1]=g; d[o+2]=b; d[o+3]=a;
    }
  }
  st.pctx.putImageData(st.img, 0, 0);
}
