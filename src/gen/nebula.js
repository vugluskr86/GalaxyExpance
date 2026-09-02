import { mulberry32 } from "../core/rng.js";
import { fbm } from "../core/noise.js";
import { BAYER, hex2rgb, lerp3 } from "../core/color.js";

export const NEB_HUES = [["#7c3fa8","#d4537e"],["#1d9e75","#378add"],["#d85a30","#b06ad0"],
                         ["#378add","#7ee08a"],["#d4537e","#4fd0c0"]];
export const NEB_SPAN = 640;

function smoothf(t){ return t*t*(3-2*t); }

/** Фоновая туманность системы (мягкие края, дыры, дизеринг) — как в обсерватории. */
export function bakeSystemNebula(neb){
  const N = 220;
  const cvs = document.createElement("canvas");
  cvs.width = N; cvs.height = N;
  const ctx = cvs.getContext("2d");
  const img = ctx.createImageData(N, N);
  const d = img.data;
  const rng = mulberry32(neb.seed);
  const [h1, h2] = NEB_HUES[neb.hue % NEB_HUES.length];
  const c1 = hex2rgb(h1), c2 = hex2rgb(h2);
  const s1 = Math.floor(rng()*99999), s2 = Math.floor(rng()*99999), s3 = Math.floor(rng()*99999);
  const edgeSeed=Math.floor(rng()*99999),angle=rng()*Math.PI,aspect=0.68+rng()*0.5;
  const ca=Math.cos(angle),sa=Math.sin(angle);
  const sc = 0.028 / neb.scale;
  for(let y=0; y<N; y++){
    for(let x=0; x<N; x++){
      const o = (y*N + x)*4;
      const bay = BAYER[(y & 3)*4 + (x & 3)];
      /* A noisy, rotated ellipse gives the cloud a real silhouette instead
       * of fading a full rectangular sprite at its four edges. */
      const ux=(x+.5)/N*2-1,uy=(y+.5)/N*2-1;
      const rx=(ux*ca-uy*sa)/aspect,ry=ux*sa+uy*ca;
      const radial=Math.hypot(rx,ry);
      const edge=0.66+fbm((x+37)*0.045,(y+19)*0.045,5.2,edgeSeed,3)*0.54;
      const fall=smoothf(Math.max(0,Math.min(1,(edge-radial)/0.34)));
      if(fall<=0.01){d[o+3]=0;continue;}
      const n = fbm(x*sc, y*sc, 3.7, s1, 4);
      const hole = fbm(x*0.05, y*0.05, 8.1, s3, 3);
      let dens=((n-0.46)*2.4*neb.dens-Math.max(0,(hole-0.62))*2.0+bay*0.12)*fall;
      if (dens <= 0){ d[o+3]=0; continue; }
      const mix = fbm(x*0.04, y*0.04, 5.5, s2, 3);
      const col = lerp3(c1, c2, Math.min(1, Math.max(0, (mix-0.3)*2.5)));
      d[o] = col[0]; d[o+1] = col[1]; d[o+2] = col[2];
      d[o+3] = dens > 0.55 ? 64 : (dens > 0.28 ? 44 : 26);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cvs;
}

/** Спрайт туманности на карте галактики (радиальное затухание × fbm). */
export function bakeGalaxyNebSprite(neb){
  if (neb._sprite) return neb._sprite;
  const N = 96;
  const cvs = document.createElement("canvas");
  cvs.width = N; cvs.height = N;
  const ctx = cvs.getContext("2d");
  const img = ctx.createImageData(N, N);
  const d = img.data;
  const [h1, h2] = NEB_HUES[neb.hue % NEB_HUES.length];
  const c1 = hex2rgb(h1), c2 = hex2rgb(h2);
  const rng = mulberry32(neb.seed);
  const s1 = Math.floor(rng()*99999), s2 = Math.floor(rng()*99999);
  for(let y=0; y<N; y++){
    for(let x=0; x<N; x++){
      const o = (y*N + x)*4;
      const ux = x/N*2 - 1, uy = y/N*2 - 1;
      const rr = Math.hypot(ux, uy);
      if (rr > 1){ d[o+3]=0; continue; }
      const bay = BAYER[(y & 3)*4 + (x & 3)];
      const fall = smoothf(Math.max(0, 1 - rr));
      const n = fbm(x*0.06, y*0.06, 2.2, s1, 3);
      let dens = ((n - 0.42)*2.2 + bay*0.14) * fall;
      if (dens <= 0.04){ d[o+3]=0; continue; }
      const mix = fbm(x*0.045, y*0.045, 6.5, s2, 3);
      const col = lerp3(c1, c2, Math.min(1, Math.max(0, (mix-0.3)*2.5)));
      d[o]=col[0]; d[o+1]=col[1]; d[o+2]=col[2];
      d[o+3] = dens > 0.5 ? 84 : (dens > 0.26 ? 56 : 30);
    }
  }
  ctx.putImageData(img, 0, 0);
  neb._sprite = cvs;
  return cvs;
}
