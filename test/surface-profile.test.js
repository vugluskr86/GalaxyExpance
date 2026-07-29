import test from "node:test";
import assert from "node:assert/strict";
import { makeSurfaceProfile, surfacePalette } from "../src/gen/planet.js";
import { SurfaceRenderer } from "../src/gen/surface-renderer.js";
import { createLandingViewRenderer } from "../src/gen/landing-view-renderer.generated.js";

test("planet surface profile is seed-stable and exposes landing renderer parameters",()=>{
  const planet={type:"terran",seed:73421,size:22,dist:320};
  const a=makeSurfaceProfile(planet,{temp:5600,D:40}),b=makeSurfaceProfile(planet,{temp:5600,D:40});
  assert.deepEqual(a,b);
  for(const key of ["tempK","pressure","gravity","gN2","gO2","gCO2","dust","haze","wind","liquid","humidity","vegetation","flora","volcanism","minerals","relief","roughness","cloudCover","cloudHeight","cloudSpeed","magnetic","colony"])assert.ok(key in a,key);
  assert.ok(a.tempK>0&&a.gravity>0);
});

test("surface profile combines the world seed and exposes every source-renderer setting",()=>{
  const body={type:"terran",seed:73421,size:22,dist:320},sun={temp:5600,D:40};
  const a=makeSurfaceProfile(body,sun,901),b=makeSurfaceProfile(body,sun,901),other=makeSurfaceProfile(body,sun,902);
  assert.deepEqual(a,b);
  assert.notEqual(a.seed,other.seed);
  for(const key of ["seed","starLum","orbitAU","lat","tilt","season","hour","cloudMode","cloudCover","cloudHeight","cloudSpeed","plantMode","plantIter","plantAngle","plantSize","plantDensity","plantVariants","weatherMode","weatherPick","weatherPower","showCity","showShip","showWFCGround","showPlants","exposure","levels"])assert.ok(key in a,key);
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

test("the landing scene executes the renderer extracted from landing-view.html",()=>{
  let frame=null;
  const canvas={width:420,height:420,getContext:()=>({
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
    putImageData:image=>{frame=image;}
  })};
  const profile={...makeSurfaceProfile({type:"terran",seed:482,size:22,dist:310},{temp:5700,D:40},77),seed:482,moons:1,rings:false,cloudMode:"storm",weatherMode:"clear",showPlants:false};
  const renderer=createLandingViewRenderer(canvas,profile);
  assert.equal(renderer.profile.cloudMode,"storm");
  assert.equal(renderer.profile.weatherMode,"clear");
  assert.equal(renderer.profile.showPlants,false);
  renderer.render(.1,Math.PI/2);
  assert.equal(frame.data.length,420*420*4);
  let lum=0;
  for(let i=0;i<frame.data.length;i+=40)lum+=frame.data[i]+frame.data[i+1]+frame.data[i+2];
  assert.ok(lum>10000,"daylight frame should not be near-black");
});

test("a vegetated world creates visible L-system plants in the source renderer",()=>{
  const canvas={width:420,height:420,getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}})};
  const profile={...makeSurfaceProfile({type:"terran",seed:808,size:24,dist:180},{temp:5800,D:40},91),seed:808,liquid:0,vegetation:1,plantDensity:1,showPlants:true,showWFCGround:true};
  const renderer=createLandingViewRenderer(canvas,profile);
  assert.ok(renderer.diagnostics.plantSprites>0);
  assert.ok(renderer.diagnostics.plantItems>0);
});
