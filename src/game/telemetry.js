import { configValue } from "../config/balance.js";

const clampHistory=(list,limit)=>{if(list.length>limit)list.splice(0,list.length-limit);return list;};
export function ensureTelemetry(world){
  if(!world?.data)throw new TypeError("A WorldSave is required for telemetry");
  const state=world.data.telemetry??(world.data.telemetry={version:1,events:[],samples:[]});
  state.version=1;state.events=Array.isArray(state.events)?state.events:[];state.samples=Array.isArray(state.samples)?state.samples:[];
  return state;
}
export function recordTelemetry(world,type,data={},meta={}){
  const state=ensureTelemetry(world),limit=configValue("telemetry.historyLimit");
  state.events.push({type,data:{...data},meta:{seed:world.data.clusterSeed??0,...meta},at:Date.now()});
  clampHistory(state.events,limit);return state.events.at(-1);
}
export function sampleTelemetry(world,scene){
  const state=ensureTelemetry(world),prop=scene?.playerShip?.prop,limit=configValue("telemetry.historyLimit");
  const sample={at:Date.now(),day:world.data.economy?.day||0,credits:world.data.economy?.credits||0,
    cargoMass:prop?.cargoMass||0,cargoCap:prop?.cargoCap||0,energy:prop?.energy||0,npcs:scene?.npcs?.length||0,
    planets:scene?.S?.planets?.length||0,particles:scene?.effects?.particles?.length||0};
  state.samples.push(sample);clampHistory(state.samples,limit);return sample;
}
export const telemetrySnapshot=world=>{const state=ensureTelemetry(world);return {events:[...state.events],samples:[...state.samples]};};
