import { hash2i } from "../core/rng.js";
import { makeItem } from "./items.js";
import { communicationStatus } from "./equipment.js";
import { recordProbeData, scanReadiness } from "./intel.js";
const removeProbe=(prop,id)=>{const item=prop?.cargo.items.find(entry=>entry.id===id);return item?prop.cargo.remove(item,1):null;};
const sameBody=(a,b)=>!!a&&!!b&&a.kind===b.kind&&a.i===b.i&&a.j===b.j;
export function launchProbe(scene,kind,target){
  const prop=scene?.playerShip?.prop,id=kind==="space"?"probe_space":"probe";
  const readiness=scanReadiness(scene,target,{surface:kind!=="space",requiresProbe:true});
  if(!readiness.ok)return {ok:false,reason:readiness.reason};
  if(!removeProbe(prop,id))return {ok:false,reason:"no-probe"};
  const seed=hash2i(scene.S.seed||0,target.i||0,target.j||0),targetPos=scene.posOf?.(target),shipPos=scene.playerShip?.globPos?.(scene),distance=targetPos&&shipPos?Math.hypot(targetPos[0]-shipPos[0],targetPos[1]-shipPos[1]):0;
  const scanTier=Math.max(1,Math.floor((readiness.scan?.resolution||1)*Math.max(.5,readiness.scan?.signal||1)));
  const quality=Math.min(3,1+((seed>>>0)%3),scanTier+1),lost=(seed>>>0)%29===0,mission={id:`probe-${seed>>>0}-${scene.probes.length}`,kind,target:{...target},distance,quality,lost,progress:0,duration:(kind==="space"?22:14)+Math.min(30,Math.floor(distance/20)),seed,ready:false,delivered:false};
  scene.probes.push(mission);return {ok:true,mission};
}
export function updateProbes(scene,dt){for(const mission of scene?.probes||[])if(!mission.ready){mission.progress+=Math.max(0,dt);if(mission.progress>=mission.duration)mission.ready=true;}}
export function deliverProbeReports(scene){
  const prop=scene?.playerShip?.prop;
  const reports=[];for(const mission of scene?.probes||[]){if(!mission.ready||mission.delivered)continue;
    if(!communicationStatus(prop,mission.distance).ok)continue;
    if(mission.lost){reports.push("зонд потерян после выполнения манёвра");mission.delivered=true;continue;}
    const target=scene.obj?.(mission.target),resource=target?.deposit?.resourceId||target?.surface?.minerals>0.5?"min_rare":"ore_fe";
    mission.report={quality:mission.quality,resource,poi:(mission.seed>>>0)%5===0};
    /* Surface cargo has no map marker until a probe observes it. Revealing it
       here (rather than while rendering) makes discovery durable and keeps
       the same result after reload. */
    const recovered=[];
    if(mission.kind==="planet"){
      for(const floating of scene.cargoField||[]){
        if(floating.landed&&!floating.discovered&&sameBody(floating.landed,mission.target)){
          floating.discovered=true;recovered.push(floating.item.name);
        }
      }
      if(recovered.length)mission.report.surfaceCargo=recovered;
    }
    if(scene.world)recordProbeData(scene.world,scene,mission,mission.report);
    if(mission.kind==="space"&&(mission.seed>>>0)%7===0){const item=makeItem("scanner_deep");item.unique=true;item.uniqueNote="найден космическим зондом";prop.inventory.add(item);reports.push("зонд передал уникальное оборудование");}
    else reports.push(mission.kind==="space"?`космический зонд: аномалия, качество ${mission.quality}`:`планетарный зонд: ${resource}, качество ${mission.quality}`+(recovered.length?` · найден груз: ${recovered.join(", ")}`:""));mission.delivered=true;}
  return reports;
}
