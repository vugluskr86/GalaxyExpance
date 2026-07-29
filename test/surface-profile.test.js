import test from "node:test";
import assert from "node:assert/strict";
import { makeSurfaceProfile, surfacePalette } from "../src/gen/planet.js";
import { SurfaceRenderer } from "../src/gen/surface-renderer.js";

test("planet surface profile is seed-stable and exposes landing renderer parameters",()=>{
  const planet={type:"terran",seed:73421,size:22,dist:320};
  const a=makeSurfaceProfile(planet,{temp:5600,D:40}),b=makeSurfaceProfile(planet,{temp:5600,D:40});
  assert.deepEqual(a,b);
  for(const key of ["tempK","pressure","gravity","gN2","gO2","gCO2","dust","haze","wind","liquid","humidity","vegetation","flora","volcanism","minerals","relief","roughness","cloudCover","cloudHeight","cloudSpeed","magnetic","colony"])assert.ok(key in a,key);
  assert.ok(a.tempK>0&&a.gravity>0);
});

test("surface palette carries generated liquid, vegetation and dust into canvas rendering",()=>{
  const body={type:"terran",surface:{liquid:.8,liquidType:"water",vegetation:.7,flora:130,minerals:.4,dust:.1}};
  const base=["#4b3321","#6f512f","#c49658","#80765c"];
  const palette=surfacePalette(body,base);
  assert.notDeepEqual(palette[0],[75,51,33]);
  assert.notDeepEqual(palette[3],[128,118,92]);
});

test("landing surface renderer builds its terrain, flora and weather from the profile",()=>{
  const profile={...makeSurfaceProfile({type:"terran",seed:9182,size:22,dist:320},{temp:5600,D:40}),plantDensity:1,vegetation:1,cloudCover:.8,humidity:.8,wind:.7};
  const renderer=new SurfaceRenderer(profile,9182);
  assert.equal(renderer.near.length,420);
  assert.ok(renderer.plants.length>0);
  assert.ok(["clouds","storm","clear"].includes(renderer.weather));
});
