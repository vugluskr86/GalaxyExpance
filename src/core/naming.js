import { mulberry32 } from "./rng.js";

const DG = ["le","ex","eg","za","ce","bi","so","us","es","ar","ma","in","di","re",
            "at","en","be","ra","la","ve","ti","ed","or","qu","an","te","is","ri","on","ol"];

/** Имя в духе Elite из хеша (детерминированно). */
export function nameFromHash(h){
  const rng = mulberry32(h);
  const n = 2 + Math.floor(rng()*2) + (rng() < 0.3 ? 1 : 0);
  let s = "";
  for(let i=0;i<n;i++) s += DG[Math.floor(rng()*DG.length)];
  s = s[0].toUpperCase() + s.slice(1);
  if (rng() < 0.22) s += " " + ["II","III","IV","V","IX"][Math.floor(rng()*5)];
  return s;
}
