/** Глобальные настройки вида и ускорения времени. */
export const WARP = [0, 1, 5, 25, 100, 1000, 10000, 100000];

export const settings = {
  dust: 0.7,
  lod: 2,
  rot: 0.01,
  twinkle: true,
  labels: true,
  /** Ускорение времени. 1× = реальное время: низкая орбита ~3.5 часа,
   *  «год» внутренней планеты ~3 часа. Для наблюдения нужен варп —
   *  ровно как в KSP. */
  speed: 1
};
export function warpIndex(){
  const i = WARP.indexOf(settings.speed);
  return i < 0 ? 1 : i;
}
export function warpStep(dir){
  const i = Math.max(0, Math.min(WARP.length - 1, warpIndex() + dir));
  settings.speed = WARP[i];
}
