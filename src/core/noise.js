import { hash3f } from "./rng.js";

function smoothf(t){ return t*t*(3-2*t); }

export function vnoise3(px, py, pz, seed){
  const x0 = Math.floor(px), y0 = Math.floor(py), z0 = Math.floor(pz);
  const fx = smoothf(px-x0), fy = smoothf(py-y0), fz = smoothf(pz-z0);
  let res = 0;
  for(let dz=0; dz<=1; dz++) for(let dy=0; dy<=1; dy++) for(let dx=0; dx<=1; dx++){
    const w = (dx?fx:1-fx)*(dy?fy:1-fy)*(dz?fz:1-fz);
    res += w*hash3f(x0+dx, y0+dy, z0+dz, seed);
  }
  return res;
}
export function fbm(px, py, pz, seed, oct){
  let a=0.5, f=1, sum=0, norm=0;
  for(let i=0;i<oct;i++){ sum += a*vnoise3(px*f,py*f,pz*f,seed+i*7919); norm+=a; a*=0.5; f*=2; }
  return sum/norm;
}
