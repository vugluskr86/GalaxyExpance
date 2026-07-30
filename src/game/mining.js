/** Deterministic asteroid extraction.  A rock's deposit belongs to world state
 * and is reduced only after cargo, mass and fitted-miner checks all pass. */
import { makeItem } from "./items.js";
import { hash2i } from "../core/rng.js";
export function scanRock(scene,index){
  const prop=scene?.playerShip?.prop,rock=scene?.S?.belt?.rocks?.[index];
  if(!prop?.scanner)return {ok:false,reason:"no-scanner"};
  if(!rock?.deposit)return {ok:false,reason:"empty"};
  rock.deposit.scanned=true;return {ok:true,deposit:{...rock.deposit}};
}
export function mineRock(scene,index,seconds=1){
  const prop=scene?.playerShip?.prop,rock=scene?.S?.belt?.rocks?.[index],miner=prop?.miner,deposit=rock?.deposit;
  if(!miner)return {ok:false,reason:"no-miner"};
  if(!prop.reactor)return {ok:false,reason:"no-power"};
  if(!deposit||deposit.remaining<=0)return {ok:false,reason:"empty"};
  if(!deposit.scanned)return {ok:false,reason:"unscanned"};
  if(scene?.posOf&&scene.playerShip?.globPos){
    const target=scene.posOf({kind:"rock",i:index,j:0}),ship=scene.playerShip.globPos(scene);
    if(target&&Math.hypot(target[0]-ship[0],target[1]-ship[1])>(miner.stats.range||0))return {ok:false,reason:"range"};
  }
  const wanted=Math.max(1,Math.floor((miner.stats.rate||0)*Math.max(0,seconds)*deposit.richness));
  const item=makeItem(deposit.resourceId,Math.min(wanted,deposit.remaining));
  const free=Math.floor(Math.max(0,prop.cargoCap-prop.cargoMass)/item.def.mass);
  const massFree=Math.floor(Math.max(0,prop.maxTakeoffMass-prop.mass)/item.def.mass);
  const quantity=Math.min(item.qty,free,massFree);
  if(!quantity)return {ok:false,reason:massFree<=0?"overload":"capacity"};
  item.qty=quantity;prop.cargo.add(item);deposit.remaining-=quantity;
  deposit.cycles=(deposit.cycles||0)+1;deposit.heat=Math.min(1,(deposit.heat||0)+.12*quantity);
  const collapse=(hash2i(rock.rseed||index,deposit.cycles,deposit.remaining)>>>0)%100<Math.round(deposit.heat*7);
  if(collapse)deposit.remaining=0;
  return {ok:true,item,quantity,remaining:deposit.remaining,collapse,heat:deposit.heat};
}
