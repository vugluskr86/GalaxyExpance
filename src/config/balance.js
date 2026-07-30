/* Runtime balance configuration.  Generator seeds and saved world state never
 * live here: this registry only owns tunable rules and rendering budgets. */
const STORE_KEY="pixel-cosmos.balance-config.v1";
const clone=value=>JSON.parse(JSON.stringify(value));
const defaults={
  economy:{startCredits:2500,transactionHistory:100,marketTargetBase:45,marketTargetRandom:55,producerSurplus:42,consumerReserve:24},
  effects:{lod0Cap:96,lod1Cap:240,lod2Cap:480},
  render:{systemZoomMin:.15,systemZoomDefault:.3,systemZoomMax:12,systemZoomWheel:1.18},
  surface:{canvasSize:420},
  telemetry:{historyLimit:120,sampleSeconds:1}
};
export const CONFIG_SCHEMA=Object.freeze([
  ["economy.startCredits",{domain:"economy",label:"ui.configStartCredits",min:0,max:1000000,step:100}],
  ["economy.transactionHistory",{domain:"economy",label:"ui.configTransactionHistory",min:10,max:1000,step:10}],
  ["economy.marketTargetBase",{domain:"economy",label:"ui.configMarketTarget",min:1,max:250,step:1}],
  ["economy.marketTargetRandom",{domain:"economy",label:"ui.configMarketVariance",min:0,max:250,step:1}],
  ["economy.producerSurplus",{domain:"economy",label:"ui.configProducerSurplus",min:0,max:250,step:1}],
  ["economy.consumerReserve",{domain:"economy",label:"ui.configConsumerReserve",min:0,max:250,step:1}],
  ["effects.lod0Cap",{domain:"effects",label:"ui.configEffectsLow",min:0,max:1000,step:8}],
  ["effects.lod1Cap",{domain:"effects",label:"ui.configEffectsMedium",min:0,max:2000,step:8}],
  ["effects.lod2Cap",{domain:"effects",label:"ui.configEffectsHigh",min:0,max:4000,step:8}],
  ["render.systemZoomMin",{domain:"render",label:"ui.configZoomMin",min:.05,max:2,step:.01}],
  ["render.systemZoomDefault",{domain:"render",label:"ui.configZoomDefault",min:.05,max:4,step:.01}],
  ["render.systemZoomMax",{domain:"render",label:"ui.configZoomMax",min:1,max:30,step:.5}],
  ["render.systemZoomWheel",{domain:"render",label:"ui.configZoomWheel",min:1.01,max:2,step:.01}],
  ["surface.canvasSize",{domain:"surface",label:"ui.configSurfaceCanvas",min:240,max:840,step:20}],
  ["telemetry.historyLimit",{domain:"telemetry",label:"ui.configTelemetryHistory",min:20,max:1000,step:10}],
  ["telemetry.sampleSeconds",{domain:"telemetry",label:"ui.configTelemetryPeriod",min:.25,max:10,step:.25}]
]);
const schema=new Map(CONFIG_SCHEMA);
let session={};const listeners=new Set();
const pathParts=path=>String(path).split(".");
const at=(object,path)=>pathParts(path).reduce((value,key)=>value?.[key],object);
const put=(object,path,value)=>{const parts=pathParts(path),last=parts.pop();let target=object;for(const part of parts)target=target[part]??(target[part]={});target[last]=value;};
const merge=(base,extra)=>{const out=clone(base);for(const [key,value] of Object.entries(extra||{})){if(value&&typeof value==="object"&&!Array.isArray(value))out[key]=merge(out[key]||{},value);else out[key]=value;}return out;};
function valid(path,value){const definition=schema.get(path);if(!definition||!Number.isFinite(Number(value)))return false;return Number(value)>=definition.min&&Number(value)<=definition.max;}
export const configSnapshot=()=>merge(defaults,session);
export const configValue=path=>at(configSnapshot(),path);
export function configEntries(domain){return CONFIG_SCHEMA.filter(([,definition])=>definition.domain===domain).map(([path,definition])=>({path,...definition,value:configValue(path)}));}
export function setConfig(path,value){if(!valid(path,value))throw new RangeError(`Invalid config ${path}`);put(session,path,Number(value));const snapshot=configSnapshot();for(const listener of listeners)listener({path,value:Number(value),snapshot});return snapshot;}
export function resetConfig(path=null){if(path){const parts=pathParts(path),last=parts.pop();let target=session;for(const part of parts){if(!target[part])return configSnapshot();target=target[part];}delete target[last];}else session={};const snapshot=configSnapshot();for(const listener of listeners)listener({path,value:null,snapshot});return snapshot;}
export const onConfigChange=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
export function saveConfigPreset(name="default"){const saved=loadConfigPresets();saved[String(name).trim()||"default"]=clone(session);globalThis.localStorage?.setItem(STORE_KEY,JSON.stringify(saved));return saved;}
export function loadConfigPresets(){try{const parsed=JSON.parse(globalThis.localStorage?.getItem(STORE_KEY)||"{}");return parsed&&typeof parsed==="object"?parsed:{};}catch{return {};}}
export function applyConfigPreset(name){const preset=loadConfigPresets()[name];if(!preset)throw new Error(`Preset ${name} not found`);session=merge({},preset);const snapshot=configSnapshot();for(const listener of listeners)listener({path:"*",value:null,snapshot});return snapshot;}
export const exportConfig=()=>JSON.stringify({version:1,overrides:session},null,2);
export function importConfig(source){const parsed=typeof source==="string"?JSON.parse(source):source;if(!parsed||parsed.version!==1||typeof parsed.overrides!=="object")throw new TypeError("Invalid balance config");for(const [path] of CONFIG_SCHEMA){const value=at(parsed.overrides,path);if(value!==undefined&&!valid(path,value))throw new RangeError(`Invalid config ${path}`);}session=clone(parsed.overrides);const snapshot=configSnapshot();for(const listener of listeners)listener({path:"*",value:null,snapshot});return snapshot;}
