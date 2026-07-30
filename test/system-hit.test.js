import test from "node:test";
import assert from "node:assert/strict";
import { chooseSystemHit } from "../src/scenes/system.js";

const hit=(kind,d,r=1)=>({s:{kind,i:0,j:0},d,r});

test("planet selection wins over an overlapping asteroid",()=>{
  const selected=chooseSystemHit([
    hit("rock",0.1,2),
    hit("planet",12,50),
  ]);
  assert.equal(selected.s.kind,"planet");
});

test("hit selection uses distance only inside the same object priority",()=>{
  const selected=chooseSystemHit([
    hit("rock",2,2),
    hit("rock",.25,2),
    hit("cargo",8,3),
  ]);
  assert.equal(selected.s.kind,"cargo");

  const nearestRock=chooseSystemHit([hit("rock",2,2),hit("rock",.25,2)]);
  assert.equal(nearestRock.d,.25);
});
