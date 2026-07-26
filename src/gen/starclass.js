/** Спектральная классификация O–M + коричневые карлики (L). */
export const CLS = [
  { c:"O", col:"#9fb8ff", lum:1.00, temp:35000 },
  { c:"B", col:"#b7ccff", lum:0.90, temp:18000 },
  { c:"A", col:"#dfe6ff", lum:0.78, temp:9000 },
  { c:"F", col:"#fff4e0", lum:0.66, temp:6800 },
  { c:"G", col:"#ffe9b0", lum:0.55, temp:5700 },
  { c:"K", col:"#ffc98a", lum:0.42, temp:4400 },
  { c:"M", col:"#ff9a6b", lum:0.30, temp:3100 },
  { c:"L", col:"#a34a2e", lum:0.18, temp:1600 }
];
export const CLS_RU = {
  O:"голубые сверхгиганты", B:"бело-голубые звёзды", A:"белые звёзды",
  F:"жёлто-белые звёзды", G:"жёлтые карлики", K:"оранжевые карлики",
  M:"красные карлики", L:"коричневые карлики"
};

/** roll∈[0,1) → индекс класса; armBias смещает популяцию к молодым голубым. */
export function classFromRoll(roll, armBias, bluePop){
  const blue = bluePop * (0.15 + 0.85*armBias);
  const w = [0.004 + blue*0.02, 0.015 + blue*0.06, 0.04 + blue*0.08, 0.08, 0.13, 0.22, 0.9, 0.32];
  const total = w.reduce((a,b)=>a+b);
  let acc = 0;
  for(let i=0;i<8;i++){ acc += w[i]; if (roll < acc/total) return i; }
  return 7;
}
