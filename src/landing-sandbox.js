import { makeSurfaceProfile } from "./gen/planet.js";
import { createLandingViewRenderer } from "./gen/landing-view-renderer.generated.js";
import { applyDocument, getLocale, setLocale, t, tr } from "./i18n/index.js";

const $=id=>document.getElementById(id), canvas=$("view"), ctx=canvas.getContext("2d");
const ids=["pressure","cloud","dust","vegetation","relief"], outputs={pressure:"pressureOut",cloud:"cloudOut",dust:"dustOut",vegetation:"vegetationOut",relief:"reliefOut"};
let profile=null, renderer=null, hour=12;
applyDocument();
$("language").value=getLocale();
$("language").addEventListener("change",()=>{setLocale($("language").value);applyDocument();showProfile();});

function showProfile(){
  const rows=[[t("ui.temperature"),Math.round(profile.tempK)+" K"],[t("ui.pressure"),profile.pressure.toFixed(2)+" "+t("ui.atmospheres")],[t("ui.liquid"),tr(profile.liquidType)+" · "+Math.round(profile.liquid*100)+"%"],[t("ui.clouds"),Math.round(profile.cloudCover*100)+"%"],[t("ui.flora"),Math.round(profile.vegetation*100)+"%"],[t("ui.star"),profile.starT+" K"]];
  $("profile").innerHTML=rows.map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join("");
}
function syncControls(){
  $("pressure").value=profile.pressure; $("cloud").value=profile.cloudCover; $("dust").value=profile.dust;
  $("vegetation").value=profile.vegetation; $("relief").value=profile.relief;
  ids.forEach(id=>$(outputs[id]).textContent=Number($(id).value).toFixed(id==="pressure"?2:2));
  $("hourOut").textContent=hour.toFixed(1)+":00";
}
function rebuild(){
  const seed=Number($("seed").value)||482, type=$("type").value;
  profile=makeSurfaceProfile({type,seed,size:type==="moon"?10:22,dist:type==="lava"?160:320},{temp:5700,D:40},seed);
  profile.seed=seed; profile.moons=type==="terran"?1:0; profile.rings=false;
  renderer=createLandingViewRenderer(canvas,profile); syncControls(); showProfile();
}
function apply(){
  profile.pressure=Number($("pressure").value); profile.cloudCover=Number($("cloud").value); profile.dust=Number($("dust").value);
  profile.haze=profile.dust*.55; profile.vegetation=Number($("vegetation").value); profile.relief=Number($("relief").value);
  renderer=createLandingViewRenderer(canvas,profile); syncControls(); showProfile();
}
$("type").addEventListener("change",rebuild); $("seed").addEventListener("change",rebuild);
$("random").addEventListener("click",()=>{$("seed").value=Math.floor(Math.random()*99999);rebuild();});
ids.forEach(id=>$(id).addEventListener("input",apply));
$("hour").addEventListener("input",()=>{hour=Number($("hour").value);$("hourOut").textContent=hour.toFixed(1)+":00";});
rebuild();
function frame(ms){
  const phase=(hour-6)/24*Math.PI*2;
  renderer.render(ms/1000,phase);
  $("status").textContent=`${t("ui.weather")}: ${tr(renderer.weather)} · ${hour.toFixed(1)}:00`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
