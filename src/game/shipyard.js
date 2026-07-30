/**
 * Pixel Shipyard import boundary.
 *
 * The generator owns the ship's logical grid; the game deliberately stores the
 * exported JSON unchanged in spirit, but keeps only fields defined by the v1
 * contract.  This makes save files stable when the generator gains new UI-only
 * fields.  A PNG is optional: JSON alone is still useful for equipment mounts.
 */
export const SHIPYARD_FORMAT="pixel-shipyard/v1";

const object=value=>value&&typeof value==="object"&&!Array.isArray(value);
const integer=value=>Number.isInteger(value);
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=message=>{throw new Error(message);};

/** Validate and normalise the public Pixel Shipyard v1 interchange object. */
export function validateShipyardData(value){
  if(!object(value)||value.format!==SHIPYARD_FORMAT)fail("Unsupported Pixel Shipyard format");
  if(!integer(value.seed)||value.seed<0)fail("Shipyard seed must be a non-negative integer");
  if(typeof value.algorithm!=="string"||typeof value.palette!=="string")fail("Shipyard algorithm and palette are required");
  const source=value.image;
  if(!object(source)||!integer(source.gridWidth)||source.gridWidth<1||!integer(source.gridHeight)||source.gridHeight<1||!integer(source.scale)||source.scale<1||typeof source.crop!=="boolean")fail("Invalid shipyard image geometry");
  const bounds=source.bounds;
  if(!object(bounds)||![bounds.x0,bounds.y0,bounds.x1,bounds.y1].every(integer)||bounds.x0<0||bounds.y0<0||bounds.x1<bounds.x0||bounds.y1<bounds.y0||bounds.x1>=source.gridWidth||bounds.y1>=source.gridHeight)fail("Invalid shipyard bounds");
  if(!object(value.stats)||!Array.isArray(value.slots)||!object(value.parameters))fail("Shipyard stats, slots and parameters are required");
  const ids=new Set();
  const slots=value.slots.map(raw=>{
    if(!object(raw)||typeof raw.id!=="string"||!raw.id||typeof raw.type!=="string"||!integer(raw.x)||!integer(raw.y)||!Number.isFinite(raw.rotation)||typeof raw.mount!=="string")fail("Invalid shipyard slot");
    if(ids.has(raw.id)||raw.x<0||raw.x>=source.gridWidth||raw.y<0||raw.y>=source.gridHeight)fail("Duplicate or out-of-grid shipyard slot");
    ids.add(raw.id);
    if(raw.size!==undefined&&(!object(raw.size)||!integer(raw.size.w)||raw.size.w<1||!integer(raw.size.h)||raw.size.h<1))fail("Invalid shipyard slot size");
    if(raw.direction!==undefined&&(!object(raw.direction)||![-1,0,1].includes(raw.direction.x)||![-1,0,1].includes(raw.direction.y)))fail("Invalid shipyard slot direction");
    return {id:raw.id,type:raw.type,x:raw.x,y:raw.y,rotation:raw.rotation,mount:raw.mount,...(raw.size?{size:{w:raw.size.w,h:raw.size.h}}:{}),...(raw.direction?{direction:{x:raw.direction.x,y:raw.direction.y}}:{})};
  });
  const raster=validRaster(value.raster,source.gridWidth,source.gridHeight)?[...value.raster]:undefined;
  return {format:SHIPYARD_FORMAT,seed:value.seed,algorithm:value.algorithm,palette:value.palette,
    image:{gridWidth:source.gridWidth,gridHeight:source.gridHeight,scale:source.scale,crop:source.crop,bounds:{x0:bounds.x0,y0:bounds.y0,x1:bounds.x1,y1:bounds.y1},background:source.background||"transparent",origin:"top-left",axis:{x:"right",y:"down"},slotCoordinates:"grid-pixels-before-scale"},
    stats:clone(value.stats),slots,parameters:clone(value.parameters),...(raster?{raster}:{})};
}

const MATERIALS=new Set(["h","a","g","e","m"]);
const validRaster=(raster,width,height)=>Array.isArray(raster)&&raster.length===height&&raster.every(row=>typeof row==="string"&&row.length===width&&[...row].every(cell=>cell==="."||MATERIALS.has(cell)));
const seeded=(seed=>{let state=seed>>>0;return()=>{state|=0;state=state+0x6d2b79f5|0;let q=Math.imul(state^state>>>15,1|state);q=q+Math.imul(q^q>>>7,61|q)^q;return((q^q>>>14)>>>0)/4294967296;};});

/** Pick a visible hull pixel on a requested row. Weapon mount data must
 * describe the ship itself, rather than a fixed canvas coordinate: a narrow
 * scout otherwise receives left/right mounts in transparent space. */
function rasterEdge(rows,y,side){
  const row=rows[Math.max(0,Math.min(rows.length-1,y))]||"";
  const range=Array.from({length:row.length},(_,index)=>index);
  if(side==="right")range.reverse();
  const x=range.find(index=>row[index]!==".");
  return x===undefined?Math.floor(row.length/2):x;
}

function rasterAnchor(rows,x,y){
  const yy=Math.max(0,Math.min(rows.length-1,y));
  if(rows[yy]?.[x]&&rows[yy][x]!==".")return {x,y:yy};
  let best=null;
  for(let row=0;row<rows.length;row++)for(let column=0;column<rows[row].length;column++){
    if(rows[row][column]===".")continue;
    const distance=Math.abs(column-x)+Math.abs(row-yy);
    if(!best||distance<best.distance)best={x:column,y:row,distance};
  }
  return best?{x:best.x,y:best.y}:{x:Math.max(0,x),y:yy};
}

/**
 * Runtime presets use the same grid-and-material model as pixel-shipyard.html,
 * so every stock hull is visibly generated even before a player imports an
 * exported PNG.  Imported JSON/PNG always replaces this lightweight preset.
 */
export function makeBuiltinShipyardHull(hullId,hullStats={}){
  let seed=2166136261;for(const char of String(hullId))seed=Math.imul(seed^char.charCodeAt(0),16777619);
  const rand=seeded(seed),weapons=Math.max(1,Math.min(5,hullStats.weaponSlots||1));
  const width=28+weapons*2,height=38+Math.min(14,Math.max(0,Math.round((hullStats.hullInt||300)/150)));
  const mid=(width-1)/2,rows=[];
  for(let y=0;y<height;y++){
    const t=y/(height-1),body=(1-Math.pow(1-t,1.7))*(.23+.12*weapons)*(1-.20*Math.max(0,t-.72)/.28);
    let row="";
    for(let x=0;x<width;x++){
      const dx=Math.abs(x-mid)/(width/2),inside=dx<body*(.88+.15*Math.sin(t*Math.PI));
      let cell=".";
      if(inside){
        const edge=dx>body-.045;
        cell=edge||rand()<.08?"a":rand()<.035?"m":"h";
      }
      row+=cell;
    }
    rows.push(row);
  }
  // Symmetric cockpit and engine cells make the preset immediately legible.
  const paint=(y,x,cell)=>rows[y]=rows[y].slice(0,x)+cell+rows[y].slice(x+1);
  const cockpitY=Math.max(5,Math.round(height*.22));for(let x=Math.round(mid)-2;x<=Math.round(mid)+2;x++)paint(cockpitY,x,"g");
  for(const x of [Math.round(mid)-4,Math.round(mid)+3])for(let y=height-3;y<height;y++)paint(y,x,"e");
  const engine=rasterAnchor(rows,Math.round(mid),height-2);
  const cockpit=rasterAnchor(rows,Math.round(mid),cockpitY);
  const center=rasterAnchor(rows,Math.round(mid),Math.round(height*.55));
  const slots=[{id:"engine-0",type:"engine",...engine,rotation:180,mount:"rear",direction:{x:0,y:1}},
    {id:"cockpit-0",type:"cockpit",...cockpit,rotation:0,mount:"internal"},
    {id:"center-0",type:"utility",...center,rotation:0,mount:"center"}];
  for(let i=0;i<weapons;i++){
    const y=Math.round(height*(.36+i*.07)),side=i%2?"right":"left";
    slots.push({id:`weapon-${i}`,type:"weapon",x:rasterEdge(rows,y,side),y,rotation:0,mount:side,direction:{x:0,y:-1}});
  }
  const unsignedSeed=seed>>>0;
  return makeShipyardHull({format:SHIPYARD_FORMAT,seed:unsignedSeed,algorithm:"builtin",palette:["steel","rust","alien","imperial","neon"][unsignedSeed%5],
    image:{gridWidth:width,gridHeight:height,scale:1,crop:false,bounds:{x0:0,y0:0,x1:width-1,y1:height-1}},stats:{...hullStats},slots,parameters:{preset:hullId},raster:rows});
}

/** Size of the exported PNG, including the one-cell border around its content. */
export function shipyardPngSize(image){
  const cells=image.crop
    ? {w:image.bounds.x1-image.bounds.x0+3,h:image.bounds.y1-image.bounds.y0+3}
    : {w:image.gridWidth+2,h:image.gridHeight+2};
  return {width:cells.w*image.scale,height:cells.h*image.scale};
}

/**
 * Translate a generator grid mount into the PNG coordinate system.
 *
 * Slots are grid cells *before* PNG scaling.  The exporter includes a one-cell
 * margin, and cropping shifts the zero point to bounds.x0/bounds.y0.  Therefore
 * the required cropped mapping is exactly:
 *   pngX = (slot.x - bounds.x0 + 1) * scale
 *   pngY = (slot.y - bounds.y0 + 1) * scale
 * The returned centre is used for a readable marker, while x/y remain the
 * top-left coordinates from the interchange specification.
 */
export function shipyardSlotToPng(slot,image){
  const offsetX=image.crop?image.bounds.x0:0,offsetY=image.crop?image.bounds.y0:0;
  const x=(slot.x-offsetX+1)*image.scale,y=(slot.y-offsetY+1)*image.scale;
  return {x,y,centerX:x+image.scale/2,centerY:y+image.scale/2};
}

/** Map semantic generator mounts to the current equipment model when possible. */
export function shipyardBindings(data){
  let weapon=0;
  return data.slots.map(slot=>{
    let gameSlot=null;
    if(slot.type==="engine")gameSlot="engine";
    else if(slot.type==="cockpit")gameSlot="computer";
    else if(slot.type==="utility")gameSlot="hull";
    else if(slot.type==="weapon"&&weapon<5)gameSlot=`weapon${++weapon}`;
    else if(slot.type==="weapon")weapon++;
    return {slot,gameSlot,png:shipyardSlotToPng(slot,data.image)};
  });
}

/** A save-safe custom hull payload. pngDataUrl is added only after PNG import. */
export function makeShipyardHull(data,pngDataUrl=null){
  const normalised=validateShipyardData(data);
  return {...normalised,...(typeof pngDataUrl==="string"?{pngDataUrl}: {})};
}

const imageCache=new Map();
/** Browser-only, lazy PNG cache. It is intentionally harmless in node tests. */
export function shipyardImage(dataUrl){
  if(typeof Image==="undefined"||typeof dataUrl!=="string")return null;
  if(!imageCache.has(dataUrl)){const image=new Image();image.src=dataUrl;imageCache.set(dataUrl,image);}
  const image=imageCache.get(dataUrl);
  return image.complete&&image.naturalWidth?image:null;
}
