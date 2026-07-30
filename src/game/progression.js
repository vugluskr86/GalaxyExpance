/**
 * Compact meta-progression stored beside the economy. It deliberately has no
 * scene or market imports: every gameplay system can award progress without a
 * dependency cycle, while effects can query the same saved state read-only.
 */
export const SKILLS=Object.freeze(["trade","technical","research","leadership","combat","diplomacy"]);
const CAP=5;
const threshold=level=>level<=1?0:80*(level-1)*(level-1)+70*(level-1);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function state(world){
  if(!world?.data)throw new TypeError("A WorldSave is required for progression");
  const economy=world.data.economy??(world.data.economy={});
  const progress=economy.progression??(economy.progression={skills:{},stats:{},history:[],crew:{hired:[]}});
  progress.skills=progress.skills&&typeof progress.skills==="object"?progress.skills:{};
  progress.stats=progress.stats&&typeof progress.stats==="object"?progress.stats:{};
  progress.history=Array.isArray(progress.history)?progress.history:[];
  progress.crew=progress.crew&&typeof progress.crew==="object"?progress.crew:{hired:[]};
  progress.crew.hired=Array.isArray(progress.crew.hired)?progress.crew.hired:[];
  for(const skill of SKILLS)progress.skills[skill]=Math.max(0,Math.floor(progress.skills[skill]||0));
  return progress;
}

export const progressionState=world=>state(world);
export const skillXp=(world,skill)=>state(world).skills[skill]||0;
export function skillLevel(world,skill){
  const xp=skillXp(world,skill);let level=1;
  while(level<CAP&&xp>=threshold(level+1))level++;
  return level;
}
export const nextSkillXp=(world,skill)=>skillLevel(world,skill)>=CAP?null:threshold(skillLevel(world,skill)+1);

export function gainSkill(world,skill,amount,reason=""){
  if(!SKILLS.includes(skill)||!Number.isFinite(amount)||amount<=0)return null;
  const progress=state(world),before=skillLevel(world,skill);
  progress.skills[skill]+=Math.max(1,Math.floor(amount));
  const after=skillLevel(world,skill);
  progress.history.unshift({day:world.data.economy?.day||0,type:"skill",skill,amount:Math.floor(amount),before,after,reason});
  progress.history.length=120;return {skill,before,after,xp:progress.skills[skill]};
}

export function recordStat(world,name,amount=1,reason=""){
  const progress=state(world);
  /* Cashflow is intentionally signed: a purchase is an investment and a sale
     later reveals the actual net trading profit instead of only gross income. */
  progress.stats[name]=name.endsWith("Profit")?(progress.stats[name]||0)+amount:Math.max(0,(progress.stats[name]||0)+amount);
  progress.history.unshift({day:world.data.economy?.day||0,type:"stat",name,amount,reason});progress.history.length=120;
  return progress.stats[name];
}

const CREW=Object.freeze([
  {id:"broker",skill:"trade",level:2,cost:18000,bonus:{trade:.025}},
  {id:"engineer",skill:"technical",level:2,cost:22000,bonus:{technical:.08}},
  {id:"analyst",skill:"research",level:2,cost:24000,bonus:{research:.08}},
  {id:"marshal",skill:"leadership",level:3,cost:34000,bonus:{leadership:.08,combat:.03}},
  {id:"envoy",skill:"diplomacy",level:2,cost:26000,bonus:{diplomacy:.1}}
]);
export const crewCatalog=()=>CREW.map(entry=>({...entry,bonus:{...entry.bonus}}));
export const crewBonus=(world,skill)=>state(world).crew.hired.reduce((sum,id)=>sum+(CREW.find(crew=>crew.id===id)?.bonus?.[skill]||0),0);
export const availableCrew=world=>CREW.filter(crew=>skillLevel(world,crew.skill)>=crew.level&&!state(world).crew.hired.includes(crew.id));
export function hireCrew(world,id,spend){
  const crew=CREW.find(entry=>entry.id===id),progress=state(world);if(!crew)return {ok:false,reason:"unavailable"};
  if(progress.crew.hired.includes(id))return {ok:false,reason:"hired"};
  if(skillLevel(world,crew.skill)<crew.level)return {ok:false,reason:"skill"};
  if(typeof spend!=="function"||!spend(crew.cost))return {ok:false,reason:"credits"};
  progress.crew.hired.push(id);progress.history.unshift({day:world.data.economy?.day||0,type:"crew",id,cost:crew.cost});progress.history.length=120;
  return {ok:true,crew};
}

/** Qualitative map intelligence: more detail, never exact remote prices. */
export function rumorInsight(world,settlement){
  const trade=skillLevel(world,"trade"),research=skillLevel(world,"research");
  if(research>=4)return "research";
  if(trade>=3)return "trade";
  if(trade>=2||research>=2)return "basic";
  return null;
}

export function progressionSummary(world){
  const progress=state(world);
  return {skills:Object.fromEntries(SKILLS.map(skill=>[skill,{level:skillLevel(world,skill),xp:skillXp(world,skill),next:nextSkillXp(world,skill)}])),stats:{...progress.stats},crew:[...progress.crew.hired],history:progress.history.slice(0,20)};
}
