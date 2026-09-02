import test from "node:test";
import assert from "node:assert/strict";
import { SystemScene } from "../src/scenes/system.js";

test("system wheel zoom keeps the world point beneath the cursor fixed",()=>{
  const scene={ctx:{SCR:420},cam:{x:37,y:-21},zoom:.8};
  scene.worldAt=SystemScene.prototype.worldAt;
  const mx=83,my=317,before=scene.worldAt(mx,my);
  SystemScene.prototype.onWheel.call(scene,mx,my,-1);
  const after=scene.worldAt(mx,my);
  assert.ok(Math.abs(after.x-before.x)<1e-10);
  assert.ok(Math.abs(after.y-before.y)<1e-10);
});
