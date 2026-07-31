/** Canvas-терминал виртуального компьютера: текстовый/графический вывод и
 * очередь событий клавиатуры и мыши. */
export class ComputerTerminal {
  constructor(canvas=null, width=420, height=420){
    this.canvas=canvas;
    /* Логическое разрешение остаётся 420×420 для Assembly. Физический буфер
     * canvas может быть больше, чтобы браузер не растягивал уже готовый текст. */
    this.width=width;
    this.height=height;
    if(canvas){
      const rect=canvas.getBoundingClientRect();
      const dpr=Math.min(2,window.devicePixelRatio || 1);
      canvas.width=Math.max(width,Math.round(rect.width*dpr));
      canvas.height=Math.max(height,Math.round(rect.width*dpr));
    }
    this.ctx=canvas?.getContext?.("2d") || null;
    this.scaleX=canvas ? canvas.width/width : 1;
    this.scaleY=canvas ? canvas.height/height : 1;
    this.ctx?.setTransform(this.scaleX,0,0,this.scaleY,0,0);
    this.mode="text";
    this.fg="#7ee08a"; this.bg="#000000";
    /* 9 логических px превращаются ровно в 12 px при штатном масштабе 4/3. */
    this.fontSize=9; this.lineHeight=11;
    this.col=0; this.row=0; this.lines=[""];
    this.keys=[]; this.mouse={x:0,y:0,buttons:0,wheel:0};
    this.inputLine="";this.prompt="";this.lineListeners=new Set();this.keyListeners=new Set();this.lineQueue=[];
    this.recording=false; this.frameCommands=[]; this.frames=[]; this.animationTimer=null;
    this.clear();
    if (canvas) this.bind();
  }
  bind(){
    const c=this.canvas;
    c.addEventListener("keydown",e=>{
      const special={
        Escape:27, Tab:9, Enter:13, Backspace:8,
        ArrowLeft:37, ArrowUp:38, ArrowRight:39, ArrowDown:40,
        Home:36, End:35, PageUp:33, PageDown:34, Delete:46, Insert:45
      };
      const printable=(typeof e.key==="string" && e.key.length===1) ? e.key.charCodeAt(0) : 0;
      const keyCode=special[e.key] || printable || Number(e.keyCode) || Number(e.which) || 0;
      const key={key:e.key,code:e.code,keyCode};
      if([...this.keyListeners].some(listener=>listener(key))){
        e.preventDefault();e.stopPropagation();return;
      }
      this.keys.push(key);
      // Graphics applications own raw keyboard input.  Do not pass the same
      // event to the shell line editor: doing so briefly repaints the PCOS
      // prompt over the framebuffer before the application draws its next frame.
      if(this.mode==="graphics"){
        e.preventDefault();e.stopPropagation();return;
      }
      if(e.ctrlKey&&e.code==="KeyC"){
        this.inputLine="";this.lines.push("");this.lineQueue.push("\x03");
        for(const fn of this.lineListeners)fn("\x03");
      }else if(e.key==="Enter"){
        const line=this.inputLine;this.lines[this.lines.length-1]=this.prompt+line;
        this.lines.push("");this.inputLine="";this.lineQueue.push(line);
        for(const fn of this.lineListeners)fn(line);
      }else if(e.key==="Backspace")this.inputLine=this.inputLine.slice(0,-1);
      else if(e.key.length===1)this.inputLine+=e.key;
      this.renderText();
      e.preventDefault(); e.stopPropagation();
    });
    const mouse=e=>{
      const r=c.getBoundingClientRect();
      this.mouse.x=Math.max(0,Math.min(this.width-1,Math.floor((e.clientX-r.left)/r.width*this.width)));
      this.mouse.y=Math.max(0,Math.min(this.height-1,Math.floor((e.clientY-r.top)/r.height*this.height)));
      this.mouse.buttons=e.buttons;
    };
    c.addEventListener("pointermove",mouse);
    c.addEventListener("pointerdown",e=>{ this.focus(); mouse(e); });
    // The framed display is also a terminal control.  A click on its title or
    // bezel must restore keyboard focus just like a click on the phosphor.
    c.closest?.(".terminal-frame")?.addEventListener("pointerdown",()=>this.focus());
    c.addEventListener("focus",()=>{ if(this.mode==="text") this.renderText(); });
    c.addEventListener("pointerup",mouse);
    c.addEventListener("wheel",e=>{ this.mouse.wheel+=Math.sign(e.deltaY); e.preventDefault(); },{passive:false});
    c.addEventListener("contextmenu",e=>e.preventDefault());
  }
  setMode(mode){
    if (mode !== "text" && mode !== "graphics") throw new Error("режим терминала: text или graphics");
    this.mode=mode; this.clear();
    // A PCOS graphical application owns the keyboard. The shell command is
    // often submitted from another focused control, so explicitly move focus
    // to the terminal canvas when graphics mode starts.
    if(mode==="graphics") this.focus();
  }
  color(value){
    if (typeof value === "string" && value.startsWith("#")) return value;
    return "#" + (Number(value) & 0xffffff).toString(16).padStart(6,"0");
  }
  setColors(fg,bg=this.bg){ this.fg=this.color(fg); this.bg=this.color(bg); }
  clear(){
    if(this.recording){ this.frameCommands.push(["clear"]); return; }
    this.col=0; this.row=0; this.lines=[""];
    if(this.ctx){ this.ctx.fillStyle=this.bg; this.ctx.fillRect(0,0,this.width,this.height); }
  }
  print(value){
    const text=String(value);
    if(this.mode !== "text") return;
    for(const part of text.split("\n")){
      this.lines[this.lines.length-1]+=part;
      this.lines.push("");
    }
    const max=Math.floor(this.height/this.lineHeight);
    if(this.lines.length>max) this.lines=this.lines.slice(-max);
    this.renderText();
  }
  renderText(){
    if(!this.ctx) return;
    this.ctx.fillStyle=this.bg; this.ctx.fillRect(0,0,this.width,this.height);
    this.ctx.fillStyle=this.fg; this.ctx.font=`${this.fontSize}px monospace`;
    this.ctx.textBaseline="top";
    this.lines.forEach((line,i)=>this.ctx.fillText(line,6,i*this.lineHeight+4));
    if(this.prompt || this.inputLine)this.ctx.fillText(this.prompt+this.inputLine,6,(this.lines.length-1)*this.lineHeight+4);
  }
  pixel(x,y,color=this.fg){
    if(this.recording){ this.frameCommands.push(["pixel",x,y,color]); return; }
    if(this.mode!=="graphics" || !this.ctx)return;
    this.ctx.fillStyle=this.color(color); this.ctx.fillRect(Math.trunc(x),Math.trunc(y),1,1);
  }
  line(x1,y1,x2,y2,color=this.fg){
    if(this.recording){ this.frameCommands.push(["line",x1,y1,x2,y2,color]); return; }
    if(this.mode!=="graphics" || !this.ctx)return;
    this.ctx.strokeStyle=this.color(color); this.ctx.beginPath();
    this.ctx.moveTo(x1,y1); this.ctx.lineTo(x2,y2); this.ctx.stroke();
  }
  rect(x,y,w,h,color=this.fg,fill=false){
    if(this.recording){ this.frameCommands.push(["rect",x,y,w,h,color,fill]); return; }
    if(this.mode!=="graphics" || !this.ctx)return;
    this.ctx[fill?"fillStyle":"strokeStyle"]=this.color(color);
    this.ctx[fill?"fillRect":"strokeRect"](x,y,w,h);
  }
  circle(x,y,r,color=this.fg,fill=false){
    if(this.recording){ this.frameCommands.push(["circle",x,y,r,color,fill]); return; }
    if(this.mode!=="graphics" || !this.ctx)return;
    this.ctx[fill?"fillStyle":"strokeStyle"]=this.color(color);
    this.ctx.beginPath(); this.ctx.arc(x,y,r,0,Math.PI*2); this.ctx[fill?"fill":"stroke"]();
  }
  text(x,y,value,color=this.fg){
    if(this.recording){ this.frameCommands.push(["text",x,y,String(value),color]); return; }
    if(this.mode!=="graphics" || !this.ctx)return;
    this.ctx.fillStyle=this.color(color);
    this.ctx.font=`${this.fontSize}px monospace`;
    this.ctx.textBaseline="top";
    this.ctx.fillText(String(value),Math.trunc(x),Math.trunc(y));
  }
  readKey(){ return this.keys.shift() || null; }
  focus(){this.canvas?.focus?.({preventScroll:true});}
  onKey(listener){ this.keyListeners.add(listener);return()=>this.keyListeners.delete(listener); }
  readWheel(){ const v=this.mouse.wheel; this.mouse.wheel=0; return v; }
  setPrompt(prompt){this.prompt=String(prompt);this.renderText();}
  onLine(listener){this.lineListeners.add(listener);return()=>this.lineListeners.delete(listener);}
  readLine(){return this.lineQueue.shift()??null;}
  beginAnimation(){
    if(this.animationTimer) clearTimeout(this.animationTimer);
    this.animationTimer=null; this.frames=[]; this.frameCommands=[]; this.recording=true;
  }
  animationFrame(delay=16){
    if(!this.recording) throw new Error("GFX_FRAME без GFX_BEGIN");
    this.frames.push({delay:Math.max(0,Math.trunc(delay)),commands:this.frameCommands});
    this.frameCommands=[];
  }
  endAnimation(){
    if(!this.recording) throw new Error("GFX_END без GFX_BEGIN");
    if(this.frameCommands.length) this.animationFrame(16);
    this.recording=false;
    this.playAnimation();
  }
  playAnimation(){
    if(!this.ctx || !this.frames.length) return;
    let index=0;
    const next=()=>{
      if(index>=this.frames.length){ this.animationTimer=null; return; }
      const frame=this.frames[index++];
      for(const [method,...args] of frame.commands) this[method](...args);
      this.animationTimer=setTimeout(next,frame.delay);
    };
    next();
  }
}
