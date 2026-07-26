export const BAYER = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5].map(v => v/16 - 0.5);
export const SHADE = [1, 0.85, 0.68, 0.5, 0.34];
export const LIMB  = [1, 0.92, 0.82, 0.70, 0.55];

export function hex2rgb(h){
  return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
}
export function lerp3(a,b,t){
  return [Math.round(a[0]+(b[0]-a[0])*t), Math.round(a[1]+(b[1]-a[1])*t), Math.round(a[2]+(b[2]-a[2])*t)];
}
export function shadeTable(cols, mults){
  return cols.map(c => {
    const rgb = typeof c === "string" ? hex2rgb(c) : c;
    return mults.map(s => [Math.round(rgb[0]*s), Math.round(rgb[1]*s), Math.round(rgb[2]*s)]);
  });
}
export function clamp255(v){ return Math.min(255, Math.max(0, Math.round(v))); }
export function blackbody(T){
  const t = T/100; let r,g,b;
  r = t <= 66 ? 255 : 329.698727446*Math.pow(t-60, -0.1332047592);
  g = t <= 66 ? 99.4708025861*Math.log(t)-161.1195681661 : 288.1221695283*Math.pow(t-60, -0.0755148492);
  b = t >= 66 ? 255 : (t <= 19 ? 0 : 138.5177312231*Math.log(t-10)-305.0447927307);
  return [clamp255(r), clamp255(g), clamp255(b)];
}
