/**
 * Shared Pixel Shipyard raster renderer.
 *
 * The editable generator and every game scene consume the same serialised
 * raster and its saved visual parameters.  A PNG is therefore an export
 * artifact, never the source of a hull's in-game appearance.
 */
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const lerp=(a,b,t)=>a+(b-a)*t;
const hash2=(x,y,seed)=>{
  let hash=x*374761393+y*668265263+seed*1274126177;
  hash=(hash^(hash>>>13))*1274126177;
  return ((hash^(hash>>>16))>>>0)/4294967296;
};

const PALETTES={
  steel:{hull:[212,.10,.56],accent:[212,.14,.38],glass:[192,.62,.56],engine:[218,.08,.30],glow:[28,1,.62],metal:[210,.05,.72]},
  rust:{hull:[24,.32,.50],accent:[16,.42,.32],glass:[186,.55,.55],engine:[20,.20,.26],glow:[42,1,.60],metal:[30,.14,.66]},
  alien:{hull:[142,.26,.44],accent:[152,.38,.28],glass:[86,.70,.58],engine:[160,.30,.24],glow:[96,1,.60],metal:[130,.12,.62]},
  imperial:{hull:[210,.05,.80],accent:[214,.10,.58],glass:[204,.60,.48],engine:[210,.04,.40],glow:[8,.95,.60],metal:[40,.30,.66]},
  neon:{hull:[262,.22,.44],accent:[286,.44,.34],glass:[318,.80,.62],engine:[258,.28,.26],glow:[176,1,.60],metal:[230,.20,.68]},
  void:{hull:[220,.14,.30],accent:[228,.20,.20],glass:[268,.60,.58],engine:[222,.12,.16],glow:[276,.95,.66],metal:[224,.06,.52]},
  sand:{hull:[44,.24,.62],accent:[36,.30,.44],glass:[196,.50,.52],engine:[40,.14,.34],glow:[18,.95,.58],metal:[46,.12,.76]}
};
const LIGHT={tl:[-1,-1],t:[0,-1],tr:[1,-1],l:[-1,0],r:[1,0],bl:[-1,1],b:[0,1],br:[1,1]};
const RENDER_DEFAULTS={light:"tl",edge:true,ao:true,outline:true,contrast:1,panels:.45,panelW:5,panelH:6,dither:.08,hueShift:0,satMul:1,lightMul:1,accentHue:32};
const materialKey={h:"hull",a:"accent",g:"glass",e:"engine",l:"glow",m:"metal"};

const renderParameters=data=>({...RENDER_DEFAULTS,...(data?.parameters||{})});
const materialAt=(data,x,y)=>data?.raster?.[y]?.[x]||".";
const solid=material=>material!=="."&&material!=="l";

/** Geometry in canvas pixels for the exported raster, including its border. */
export function shipyardRasterGeometry(data,cell=1){
  const image=data.image;
  const offsetX=image.crop?image.bounds.x0:0,offsetY=image.crop?image.bounds.y0:0;
  const columns=image.crop?image.bounds.x1-image.bounds.x0+1:image.gridWidth;
  const rows=image.crop?image.bounds.y1-image.bounds.y0+1:image.gridHeight;
  return {offsetX,offsetY,columns,rows,width:(columns+2)*cell,height:(rows+2)*cell,cell};
}

function shadeAt(data,x,y){
  const parameters=renderParameters(data),[lightX,lightY]=LIGHT[parameters.light]||LIGHT.tl;
  const front=solid(materialAt(data,x+lightX,y+lightY)),back=solid(materialAt(data,x-lightX,y-lightY));
  let shade=1;
  if(!front)shade=2;
  else if(!back&&parameters.ao)shade=0;
  if(parameters.edge&&!front&&!solid(materialAt(data,x+lightX*2,y+lightY*2)))shade=3;
  const panelW=Math.max(1,Number(parameters.panelW)||1),panelH=Math.max(1,Number(parameters.panelH)||1);
  if(parameters.panels>0){
    const panel=hash2(Math.floor(x/panelW),Math.floor(y/panelH),7);
    if(panel<parameters.panels*.5)shade=Math.max(0,shade-1);
    else if(panel>1-parameters.panels*.28)shade=Math.min(3,shade+1);
    if((x%panelW===0||y%panelH===0)&&hash2(x,y,13)<parameters.panels*.4)shade=Math.max(0,shade-1);
  }
  if(parameters.dither>0&&hash2(x*3,y*7,5)<parameters.dither)shade=clamp(shade+(hash2(x,y,11)<.5?-1:1),0,3);
  return shade;
}

/** Resolve the exact material colour saved with this hull instance. */
export function shipyardMaterialColor(data,material,x,y){
  const parameters=renderParameters(data),key=materialKey[material]||"hull";
  let [hue,saturation,lightness]=(PALETTES[data.palette]||PALETTES.steel)[key];
  if(key==="accent"||key==="metal")hue=lerp(hue,parameters.accentHue,.5);
  hue+=parameters.hueShift;saturation*=parameters.satMul;lightness*=parameters.lightMul;
  const offset=[-.15,0,.09,.19][shadeAt(data,x,y)]*parameters.contrast;
  return `hsl(${((hue%360)+360)%360} ${clamp(saturation*100,0,100).toFixed(1)}% ${clamp((lightness+offset)*100,3,97).toFixed(1)}%)`;
}

function drawBackground(ctx,x,y,geometry,background){
  if(background==="dock"||background==="dark"){
    ctx.fillStyle="#0a0e14";ctx.fillRect(x,y,geometry.width,geometry.height);
  }
  if(background==="dock"){
    ctx.fillStyle="#111926";
    for(let row=0;row<geometry.rows+2;row+=4)for(let column=0;column<geometry.columns+2;column+=4)
      if((column+row)%8===0)ctx.fillRect(x+column*geometry.cell,y+row*geometry.cell,geometry.cell*4,geometry.cell*4);
  }
}

/**
 * Draw a serialised hull.  `x` and `y` denote the top-left corner of the
 * one-cell border, matching the JSON/PNG coordinate contract.
 */
export function drawShipyardRaster(ctx,data,{x=0,y=0,cell=1,background=null,outline=undefined,resize=false}={}){
  const geometry=shipyardRasterGeometry(data,cell),parameters=renderParameters(data);
  if(resize){ctx.canvas.width=Math.ceil(geometry.width);ctx.canvas.height=Math.ceil(geometry.height);}
  ctx.save();ctx.imageSmoothingEnabled=false;
  drawBackground(ctx,x,y,geometry,background);
  const drawOutline=outline??parameters.outline;
  const x0=geometry.offsetX,x1=x0+geometry.columns-1,y0=geometry.offsetY,y1=y0+geometry.rows-1;
  const put=(gridX,gridY,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x+(gridX-geometry.offsetX+1)*cell),Math.round(y+(gridY-geometry.offsetY+1)*cell),Math.ceil(cell),Math.ceil(cell));};
  if(drawOutline)for(let gridY=y0-1;gridY<=y1+1;gridY++)for(let gridX=x0-1;gridX<=x1+1;gridX++){
    if(solid(materialAt(data,gridX,gridY)))continue;
    let near=false;
    for(let dy=-1;dy<=1&&!near;dy++)for(let dx=-1;dx<=1;dx++)if(solid(materialAt(data,gridX+dx,gridY+dy))){near=true;break;}
    if(near)put(gridX,gridY,"hsl(220 30% 7%)");
  }
  for(let gridY=y0;gridY<=y1;gridY++)for(let gridX=x0;gridX<=x1;gridX++){
    const material=materialAt(data,gridX,gridY);if(material===".")continue;
    if(material==="l"){
      ctx.globalAlpha=.55+.45*hash2(gridX,gridY,3);
      put(gridX,gridY,shipyardMaterialColor(data,material,gridX,gridY));ctx.globalAlpha=1;
    }else put(gridX,gridY,shipyardMaterialColor(data,material,gridX,gridY));
  }
  ctx.restore();
  return geometry;
}
