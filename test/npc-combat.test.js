import test from "node:test";
import assert from "node:assert/strict";
import { AgentController } from "../src/game/agents.js";

const primary={kind:"planet",i:0,j:0};
const ship=(x,y)=>({
  primary,mode:"newton",destroyed:false,nose:0,integrity:100,
  ctrl:{left:false,right:false,retro:false,thrust:false},
  prop:{throttle:0,activeWeapon:{stats:{range:100}},weapon:null},
  globPos:()=>[x,y],fsdTo(target){this.destination=target;this.mode="cruise";}
});

test("NPC combat holds a weapon range, faces its target and fires through the common scene API",()=>{
  const own=ship(0,0),target=ship(80,0),npc={ship:own};
  const agent=new AgentController("pirate",{},3);
  const scene={fireNpcWeapon(pilot,enemy){this.shot={pilot,enemy};}};
  agent.combat(npc,target,scene);
  assert.equal(own.ctrl.thrust,true);
  assert.equal(own.nose,0);
  assert.equal(scene.shot.enemy,target);
  assert.equal(agent.state.combatTarget,target);
});

test("NPC orders use FSD to join a followed ship before formation flight",()=>{
  const own=ship(0,0),target=ship(50,0);target.primary={kind:"planet",i:1,j:0};
  const agent=new AgentController("trader",{},4);
  agent.setOrder("follow",target,{distance:25});
  agent.update({ship:own},1,{S:{planets:[{moonList:[]},{moonList:[]}]},npcs:[]});
  assert.equal(own.mode,"cruise");
  assert.deepEqual(own.destination,target.primary);
});
