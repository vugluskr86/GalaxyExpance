import test from "node:test";
import assert from "node:assert/strict";
import { configEntries, configValue, exportConfig, importConfig, resetConfig, setConfig } from "../src/config/balance.js";
import { recordTelemetry, sampleTelemetry, telemetrySnapshot } from "../src/game/telemetry.js";

test("balance overrides validate, export and restore without changing defaults",()=>{
  const original=configValue("economy.marketTargetBase");
  setConfig("economy.marketTargetBase",77);
  assert.equal(configValue("economy.marketTargetBase"),77);
  assert.throws(()=>setConfig("economy.marketTargetBase",-1),RangeError);
  const payload=exportConfig();resetConfig();assert.equal(configValue("economy.marketTargetBase"),original);
  importConfig(payload);assert.equal(configValue("economy.marketTargetBase"),77);
  assert.ok(configEntries("economy").some(entry=>entry.path==="economy.marketTargetBase"));
  resetConfig();
});

test("telemetry keeps bounded live-world samples and diagnostic events",()=>{
  const world={data:{clusterSeed:42,economy:{day:3,credits:900}}};
  recordTelemetry(world,"credits",{amount:50});
  sampleTelemetry(world,{playerShip:{prop:{cargoMass:2,cargoCap:5,energy:7}},S:{planets:[{}]},npcs:[{}],effects:{particles:[{}]}});
  const snapshot=telemetrySnapshot(world);
  assert.equal(snapshot.events[0].meta.seed,42);
  assert.equal(snapshot.samples[0].credits,900);
  assert.equal(snapshot.samples[0].particles,1);
});
