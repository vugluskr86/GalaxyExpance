import { mulberry32 } from "../core/rng.js";
import { BAYER, SHADE, hex2rgb, shadeTable } from "../core/color.js";
import { TILT } from "./planet.js";

const cosT = Math.cos(TILT), sinT = Math.sin(TILT);
export const BH_PALS = {
  hot:["#fff4dc","#ffc45c","#f07d1a","#a83a10"],
  blue:["#eaf6ff","#8fd0ff","#3f8fe0","#1c4a8f"]
};
export function bakeBH(bh){
  bh.dens = new Uint8Array(64);
  const rng = mulberry32(bh.seed ^ 0xb1ac);
  let on = 1;
  for(let i=0;i<64;i++){
    if (rng() < 0.14) on = 1 - on;
    bh.dens[i] = (on && rng() < 0.85) ? (rng() < 0.4 ? 2 : 1) : 0;
  }
  bh.pal = shadeTable(BH_PALS[bh.colKey] || BH_PALS.hot, SHADE);
  bh.glow = hex2rgb((BH_PALS[bh.colKey] || BH_PALS.hot)[2]);
  const C = Math.ceil(bh.D*2.5);
  bh.C = C; bh.pr = bh.D/C;
  bh.cvs = document.createElement("canvas"); bh.cvs.width = C; bh.cvs.height = C;
  bh.pctx = bh.cvs.getContext("2d");
  bh.img = bh.pctx.createImageData(C, C);
}
export function renderBH(bh, t){
  const C = bh.C, pr = bh.pr, inv = 1/pr, sq = 0.30;
  const d = bh.img.data;
  for(let y=0; y<C; y++){
    for(let x=0; x<C; x++){
      const o = (y*C + x)*4;
      const sx = (x+0.5)/C*2 - 1, sy = (y+0.5)/C*2 - 1;
      const nx = sx*inv, ny = sy*inv;
      const dd = nx*nx + ny*ny;
      const bay = BAYER[(y & 3)*4 + (x & 3)];
      const ru = nx*cosT + ny*sinT;
      const rv = (-nx*sinT + ny*cosT)/sq;
      const rr = Math.sqrt(ru*ru + rv*rv);
      let disk = -1, front = false;
      if (rr > 1.30 && rr < 2.30){
        const phi = Math.atan2(rv*sq, ru);
        const di = bh.dens[(Math.floor(((phi/(Math.PI*2)) + t*0.30) * 64) % 64 + 64) % 64];
        if (di > 0){
          const band = rr < 1.52 ? 0 : (rr < 1.78 ? 1 : (rr < 2.05 ? 2 : 3));
          let lvl = (ru < 0 ? 0 : 2) + (di === 1 ? 1 : 0) + Math.round(bay*1.2);
          disk = band*8 + Math.min(4, Math.max(0, lvl));
          front = rv > 0;
        }
      }
      let r=0,g=0,b=0,a=0;
      if (disk >= 0 && front){
        const col = bh.pal[disk >> 3][disk & 7];
        r=col[0]; g=col[1]; b=col[2]; a=255;
      } else if (dd <= 0.90){ r=0; g=0; b=0; a=255; }
      else if (dd <= 1.14){
        if (bay > -0.30){ r=255; g=246; b=224; a=255; }
        else { r=0; g=0; b=0; a=255; }
      } else if (disk >= 0){
        const col = bh.pal[disk >> 3][disk & 7];
        r=col[0]; g=col[1]; b=col[2]; a=255;
      } else if (dd < 3.2 && bay < -0.28){
        r=bh.glow[0]; g=bh.glow[1]; b=bh.glow[2]; a=46;
      }
      d[o]=r; d[o+1]=g; d[o+2]=b; d[o+3]=a;
    }
  }
  bh.pctx.putImageData(bh.img, 0, 0);
}
