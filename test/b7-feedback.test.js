import test from "node:test";
import assert from "node:assert/strict";
import { SceneManager } from "../src/scenes/manager.js";
import { LandingScene } from "../src/scenes/landing.js";
import { OutfitScene } from "../src/scenes/outfit.js";

test("failed action results become visible manager notifications",()=>{
  const manager=new SceneManager({});let received=null;
  manager.onNotice=notice=>{received=notice;};
  assert.equal(manager.actionResult({ok:false,reason:"no-power"}),false);
  assert.equal(received.level,"error");
  assert.match(received.message,/no power/i);
  assert.equal(manager.actionResult(false),false);
  assert.equal(received.level,"warning");
});

test("landing surface opens the ship screen without taking off",()=>{
  const ship={mode:"landed",prop:null};let pushed=null;
  const landing={
    sys:{playerShip:ship},p:{},mgr:{push:scene=>{pushed=scene;}},
    presetMap:()=>({}),surfaceNotice:()=>"",savePreset:()=>{},loadPreset:()=>{},removePreset:()=>{},
    copyProfile:()=>{},exportProfiles:()=>{},importProfiles:()=>{}
  };
  const action=LandingScene.prototype.panelSpec.call(landing).find(item=>item.kind==="action");
  assert.equal(action.label,"К кораблю");
  assert.equal(action.run(),true);
  assert.ok(pushed instanceof OutfitScene);
  assert.equal(ship.mode,"landed");
});
