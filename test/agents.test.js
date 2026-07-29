import test from "node:test";
import assert from "node:assert/strict";
import { AgentController } from "../src/game/agents.js";

const system=()=>({
  S:{planets:[{moonList:[]},{moonList:[]}]},
  playerShip:null
});
const npc=()=>({ship:{
  primary:{kind:"planet",i:0,j:0}, integrity:100,
  prop:{cargoMass:0,cargoCap:10,throttle:0}, mode:"newton",
  fsdTo(target,alt){this.destination=target;this.altitude=alt;},
  globPos(){return [0,0];}
}});

test("agent profiles select weighted goals and retain a decision history",()=>{
  const agent=new AgentController({role:"Тест",goalWeights:{explore:1}},{cadence:[10,10]},42);
  const pilot=npc(),world=system();
  agent.update(pilot,1,world);
  assert.equal(agent.state.goal,"explore");
  assert.equal(pilot.ship.destination.kind,"planet");
  assert.equal(agent.state.history[0].type,"goal");
});

test("custom function rules and hooks are preserved in configurable agents",()=>{
  let observed=null;
  const agent=new AgentController("ranger",{
    rules:[{when:()=>true,action:"flee"}],cadence:[10,10],
    hooks:{onGoal:event=>{observed=event.goal;}}
  },9);
  const pilot=npc(),world=system();
  agent.update(pilot,1,world);
  assert.equal(agent.state.goal,"flee");
  assert.equal(observed,"flee");
  assert.equal(pilot.ship.destination.kind,"planet");
});
