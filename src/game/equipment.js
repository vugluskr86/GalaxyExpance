/**
 * Runtime state for ship equipment.  Definitions in items.js describe a
 * module's static characteristics; this file combines them with installation,
 * power and distance.  It deliberately has no scene dependency so probes,
 * networking and UI can all use the same answer.
 */
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));

export function communicationStatus(propulsion,distance=0,{interference=0}={}){
  const antenna=propulsion?.antenna;
  if(!antenna)return {ok:false,reason:"no-antenna",signal:0,range:0,channels:0};
  if(!propulsion?.hasWorkingComputer?.())return {ok:false,reason:"no-power",signal:0,range:antenna.stats.range||0,channels:antenna.stats.channels||0};
  const range=Math.max(0,antenna.stats.range||0),ratio=range>0?distance/range:Infinity;
  if(ratio>1)return {ok:false,reason:"out-of-range",signal:0,range,channels:antenna.stats.channels||0};
  const signal=clamp((1-ratio*.72)*(antenna.stats.signalQuality??1)-interference);
  if(signal<.12)return {ok:false,reason:"interference",signal,range,channels:antenna.stats.channels||0};
  return {ok:true,reason:null,signal,range,channels:antenna.stats.channels||0};
}

export function scannerStatus(propulsion,distance=0,{interference=0}={}){
  const scanner=propulsion?.scanner;
  if(!scanner)return {ok:false,reason:"no-scanner",resolution:0,signal:0,range:0,modes:[]};
  if(!propulsion?.hasWorkingComputer?.())return {ok:false,reason:"no-power",resolution:0,signal:0,range:scanner.stats.range||0,modes:[]};
  const range=Math.max(0,scanner.stats.range||0),ratio=range>0?distance/range:Infinity;
  if(ratio>1)return {ok:false,reason:"out-of-range",resolution:0,signal:0,range,modes:scanner.stats.modes||[]};
  const signal=clamp(1-ratio*.7-interference);
  const resolution=signal<.15?0:Math.min(scanner.stats.resolution||0,signal<.45?1:99);
  return {ok:resolution>0,reason:resolution>0?null:"interference",resolution,signal,range,modes:scanner.stats.modes||[]};
}

export const equipmentReason=reason=>({
  "no-antenna":"нет антенны", "no-scanner":"нет сканера", "no-power":"нет питания/компьютера",
  "out-of-range":"вне дальности", "interference":"помехи", "overload":"перегрузка"
}[reason]||"недоступно");
