import test from "node:test";
import assert from "node:assert/strict";
import { WorldSave } from "../src/game/savegame.js";
import { changeCredits, marketQuote } from "../src/game/economy.js";
import { crewBonus, gainSkill, hireCrew, progressionSummary, rumorInsight, skillLevel } from "../src/game/progression.js";

const settlement={id:"sys-career/planet-0",factionId:"frontier",specialization:"agri",security:.6,population:.7};
const context={settlement,body:{id:settlement.id,dist:120}};

test("skills persist in economy state and trade experience lowers buying price",()=>{
  const world=new WorldSave({clusterSeed:600,player:{credits:100000}});
  const before=marketQuote(world,settlement.id,"food",context).buyPrice;
  gainSkill(world,"trade",500,"test career");
  assert.ok(skillLevel(world,"trade")>1);
  assert.ok(marketQuote(world,settlement.id,"food",context).buyPrice<before);
  assert.equal(progressionSummary(world).skills.trade.xp,500);
  assert.equal(rumorInsight(world,settlement),"trade");
});

test("qualified crew is unlocked by skills, hired through common credits and grants a bonus",()=>{
  const world=new WorldSave({clusterSeed:601,player:{credits:100000}});
  gainSkill(world,"trade",200,"test crew");
  const result=hireCrew(world,"broker",cost=>!!changeCredits(world,-cost,{kind:"crew-hire"}));
  assert.equal(result.ok,true);assert.ok(crewBonus(world,"trade")>0);
  assert.equal(progressionSummary(world).crew.includes("broker"),true);
});
