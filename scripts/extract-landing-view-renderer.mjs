import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=fs.readFileSync(path.join(root,"landing-view-src.html"),"utf8");
const script=source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if(!script)throw new Error("landing-view.html: inline renderer script not found");
const uiAt=script.indexOf("const SCHEMA=");
if(uiAt<0)throw new Error("landing-view.html: renderer/UI boundary not found");

let core=script.slice(0,uiAt);
core=core.replace("const cv=document.getElementById('view'),ctx=cv.getContext('2d');","const cv=canvas,ctx=cv.getContext('2d');");
core=core.replace("const W=384,H=216;","const W=420,H=420;");
core=core.replace("  renderReadout();","");
/* The renderer keeps the original algorithms, but its random stream is the
 * game's canonical one and is therefore stable for a world/profile seed. */
core=core.replace(/function mulberry32\(a\)\{[^\n]*\}/,"const mulberry32=projectMulberry32;");
core=core.replace(/function hash1\(i,s\)\{[^\n]*\}/,"const hash1=(i,s)=>(hash2i(i,0,s)>>>0)/4294967296;");
core=core.replace(/function hash2\(x,y,s\)\{[^\n]*\}/,"const hash2=(x,y,s)=>(hash2i(x,y,s)>>>0)/4294967296;");
core=core.replaceAll("Math.random()","surfaceRnd()");

const out=`// GENERATED from landing-view-src.html. Do not edit by hand.\n`+
`// Run: node scripts/extract-landing-view-renderer.mjs\n`+
`import { mulberry32 as projectMulberry32, hash2i } from "../core/rng.js";\n`+
`/**\n`+
` * Creates the pixel landing renderer extracted from landing-view-src.html.\n`+
` *\n`+
` * @param {HTMLCanvasElement|OffscreenCanvas} canvas Native target canvas. The\n`+
` *   game passes a 420×420 offscreen canvas; the renderer writes ImageData to\n`+
` *   it directly, without an intermediate resize.\n`+
` * @param {object} profile Surface configuration. It is copied on creation;\n`+
` *   create a new renderer after changing terrain/climate values.\n`+
` *\n`+
` * Required / physical parameters, supplied by game generation:\n`+
` * - seed — deterministic surface seed. It combines the world and body seeds.\n`+
` * - tempK, pressure, gravity — climate and particle fall speed.\n`+
` * - starT, starLum, orbitAU — stellar spectrum and irradiance.\n`+
` * - gN2, gO2, gCO2, gCH4, gSO2, gH2O — spectral scattering/absorption.\n`+
` * - dust, haze, wind — visibility, atmospheric colour and weather drift.\n`+
` * - liquid, liquidType, humidity, vegetation, flora, volcanism, minerals —\n`+
` *   terrain material, sea level, biome and L-system flora.\n`+
` * - relief, roughness — the three generated terrain ridges.\n`+
` * - lat, tilt, season, hour — local solar altitude and azimuth. hour is\n`+
` *   refreshed by render(seconds, phase) from the game rotation.\n`+
` * - cloudCover, cloudHeight, cloudSpeed — cloud shape, altitude and drift.\n`+
` * - plantIter, plantAngle, plantSize, plantDensity, plantVariants — grammar\n`+
` *   complexity, geometry, density and variants of plants/crystals.\n`+
` * - colony, moons, rings — WFC settlement, celestial bodies and ring arc.\n`+
` *\n`+
` * Renderer switches, generated with defaults but available for tools/sandbox:\n`+
` * cloudMode (auto|none|cirrus|cumulus|stratus|storm), plantMode\n`+
` * (auto|tree|broadleaf|conifer|bush|fern|succulent|alien|fungal|grass|crystal),\n`+
` * weatherMode (auto or manual), weatherPick, weatherPower, showCity,\n`+
` * showShip, showWFCGround, showPlants, exposure, levels, animate and dayLen.\n`+
` * The normal game currently supplies every physical parameter and the visual\n`+
` * switches from makeSurfaceProfile(); sandbox may override any of them.\n`+
` *\n`+
` * @returns {{profile: object, weather: string, render(seconds:number, phase?:number):void}}\n`+
` *   phase is radians: 0 corresponds to local 06:00, π/2 to noon.\n`+
` */\n`+
`export function createLandingViewRenderer(canvas, profile){\n`+
`const surfaceRnd=projectMulberry32((profile.seed??0)^0x6e624eb7);\n${core}\n`+
`  P=Object.assign({},DEF,profile,{\n`+
`    seed:profile.seed??DEF.seed, moons:profile.moons??0, rings:profile.rings??false,\n`+
`    exposure:profile.exposure??1.55, levels:profile.levels??26\n`+
`  });\n`+
`  buildWorld();\n`+
`  let previous=0;\n`+
`  return {\n`+
`    get diagnostics(){ return { plantSprites:world.plants.sprites.length, plantItems:world.plants.items.length, weather:curWeather, cloudKind }; },\n`+
`    get profile(){ return {...P}; },\n`+
`    get weather(){ return curWeather; },\n`+
`    render(seconds,phase=0){\n`+
`      P.hour=((phase/(Math.PI*2))*24+6+24)%24;\n`+
`      cli=climate(P); L=lighting(P,cli); L.insolLocal=cli.insol; wq=weatherWeights(P,cli,L); buildLUT(L);\n`+
`      const dt=Math.min(.1,Math.max(0,seconds-previous)); previous=seconds; tsec=seconds; frame(dt);\n`+
`    }\n`+
`  };\n`+
`}\n`;
fs.writeFileSync(path.join(root,"src/gen/landing-view-renderer.generated.js"),out);
