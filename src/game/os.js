import { AssemblyCompiler, Linker } from "./toolchain.js";
import { CONTEXT_LAYOUT,PROTECTED_EXCEPTIONS,PROTECTED_FEATURE } from "./protected-mode.js";

export class MemoryManager {
  constructor(size){this.size=size;this.blocks=[];}
  allocate(size,pid){
    let start=0;
    for(const block of [...this.blocks].sort((a,b)=>a.start-b.start)){
      if(block.start-start>=size)break;
      start=block.start+block.size;
    }
    if(start+size>this.size)throw new Error("OS: недостаточно оперативной памяти");
    const block={start,size,pid};this.blocks.push(block);return block;
  }
  freeBlock(target){this.blocks=this.blocks.filter(block=>block!==target);}
  free(pid){this.blocks=this.blocks.filter(block=>block.pid!==pid);}
  freeBytes(){return this.size-this.blocks.reduce((sum,b)=>sum+b.size,0);}
}

export class ProcessManager {
  constructor(os){
    this.os=os;this.nextPid=1;this.freePids=[];this.processes=[];this.scheduled=false;
    this.cursor=0;this.quantum=1000;
  }
  allocatePid(){
    if(this.freePids.length)return this.freePids.shift();
    return this.nextPid++;
  }
  spawn(name,binary,{parentPid=0,pgid=null,autoReap=parentPid===0,
    uid=null,gid=null,euid=null,egid=null,fdTable=null}={}){
    const executable=this.os.linker.loadExecutable(binary);
    const descriptor=this.os.runtime.assembler.decodeBinary(executable);
    const pid=this.allocatePid();
    let memory;
    try{memory=this.os.memory.allocate(executable.length,pid);}
    catch(error){this.freePids.push(pid);this.freePids.sort((a,b)=>a-b);throw error;}
    const parent=this.processes.find(item=>item.pid===parentPid);
    const realUid=uid??parent?.uid??0,realGid=gid??parent?.gid??0;
    const process={pid,ppid:parentPid,pgid:pgid??(parentPid||pid),name,
      uid:realUid,gid:realGid,
      euid:euid??(uid!==null?realUid:parent?.euid??realUid),
      egid:egid??(gid!==null?realGid:parent?.egid??realGid),
      state:"ready",memory,messages:[],binary:executable,output:[],
      protected:!!(descriptor.featureFlags&PROTECTED_FEATURE),layout:null,cause:0,faultAddress:0,
      context:null,preemptions:0,ticks:0,startTime:Date.now(),exitCode:null,
      pendingEvents:[],autoReap,
      fdTable,
      env:{...(parent?.env||{})}};
    this.processes.push(process);this.schedule();return process;
  }
  exec(pid,name,binary){
    const process=this.processes.find(item=>item.pid===pid);
    if(!process)throw new Error(`процесс ${pid} не найден`);
    // Validate and reserve the replacement before touching the old image.
    const executable=this.os.linker.loadExecutable(binary);
    const descriptor=this.os.runtime.assembler.decodeBinary(executable);
    const replacement=this.os.memory.allocate(executable.length,-pid);
    this.os.memory.freeBlock(process.memory);
    replacement.pid=pid;
    Object.assign(process,{name,binary:executable,memory:replacement,machine:null,
      protected:!!(descriptor.featureFlags&PROTECTED_FEATURE),layout:null,
      context:null,cause:0,faultAddress:0,state:"ready",exitCode:null});
    this.schedule();
    return process;
  }
  schedule(delay=0){
    if(this.scheduled)return;this.scheduled=true;
    setTimeout(()=>this.runNext(),delay);
  }
  nextReady(){
    const count=this.processes.length;
    for(let offset=0;offset<count;offset++){
      const index=(this.cursor+offset)%count,process=this.processes[index];
      if(process.state==="ready"){
        this.cursor=(index+1)%count;
        return process;
      }
    }
    return null;
  }
  runNext(){
    this.scheduled=false;
    const process=this.nextReady();
    if(!process)return;
    process.state="running";
    try{
      process.machine ||= this.os.runtime.createMachine(process.binary,this.os.terminal,
        {pid:process.pid,os:this.os,process});
      if(process.context?.pendingIret){
        process.machine.cpu.interruptReturn();
        process.context.pendingIret=false;
        process.context.restored=true;
      }
      const result=process.machine.resume(this.quantum);
      process.ticks+=result.steps||0;
      process.output=process.machine.output;
      if(result.preempted){
        const cpu=process.machine.cpu,isTimer=process.machine.protected&&
          cpu.r.MODE==="kernel"&&cpu.r.CAUSE===PROTECTED_EXCEPTIONS.TIMER;
        process.state="ready";process.preemptions++;
        process.context=isTimer?{
          kind:"timer",pendingIret:true,restored:false,frame:cpu.r.KSP,
          pc:cpu.view.getInt32(cpu.r.KSP+CONTEXT_LAYOUT.PC,true),
          sp:cpu.view.getInt32(cpu.r.KSP+CONTEXT_LAYOUT.SP,true)
        }:{
          kind:"legacy",pendingIret:false,restored:false,pc:cpu.r.PC,sp:cpu.r.SP
        };
      }else if(process.machine.protected&&process.machine.cpu.r.MODE==="kernel"&&
        process.machine.cpu.r.CAUSE&&process.machine.cpu.r.CAUSE!==PROTECTED_EXCEPTIONS.SYSCALL){
        process.state="faulted";
        process.cause=process.machine.cpu.r.CAUSE;
        process.faultAddress=process.machine.cpu.r.FAULT_ADDR;
        process.error=`CPU fault ${process.cause} at ${process.faultAddress}`;
        process.exitCode=128+process.cause;
        this.terminate(process,128+process.cause,"faulted");
      }else if(result.yielded)process.state="ready";
      else this.terminate(process,process.exitCode??0,"zombie");
    }catch(error){
      process.error=error.message;
      this.terminate(process,1,"faulted");
    }
    if(this.processes.some(p=>p.state==="ready"))this.schedule(process.state==="ready"?50:0);
  }
  terminate(process,status,state="zombie"){
    if(["zombie","faulted"].includes(process.state)&&process.cleaned)return;
    process.exitCode=status|0;
    process.state=process.autoReap?(state==="faulted"?"faulted":"exited"):state;
    process.cleaned=true;
    this.os.memory.freeBlock(process.memory);
    process.machine?.cpu?._vfs?.closeAll?.();
    for(const child of this.processes.filter(item=>item.ppid===process.pid))
      child.ppid=1;
    const parent=this.processes.find(item=>item.pid===process.ppid);
    if(parent)parent.pendingEvents.push({type:"CHLD",pid:process.pid,status:process.exitCode});
  }
  exit(pid,status=0){
    const process=this.processes.find(item=>item.pid===pid);
    if(!process)return false;
    this.terminate(process,status,"zombie");return true;
  }
  wait(parentPid,targetPid=-1){
    const child=this.processes.find(item=>item.ppid===parentPid&&
      (targetPid===-1||item.pid===targetPid)&&
      ["zombie","faulted"].includes(item.state));
    if(!child)return null;
    const result={pid:child.pid,status:child.exitCode,state:child.state};
    this.reap(child);return result;
  }
  reap(process){
    const index=this.processes.indexOf(process);
    if(index<0)return false;
    this.processes.splice(index,1);
    this.freePids.push(process.pid);this.freePids.sort((a,b)=>a-b);
    return true;
  }
  kill(pid,event="KILL"){
    const p=this.processes.find(x=>x.pid===pid);
    if(!p)return false;
    p.pendingEvents.push({type:event});
    if(event==="KILL"||event==="TERM"){
      this.terminate(p,event==="KILL"?137:143,"zombie");
      if(p.autoReap)p.state="killed";
      return true;
    }
    return true;
  }
  send(from,to,data){
    const target=this.processes.find(p=>p.pid===to);
    if(!target)throw new Error(`процесс ${to} не найден`);
    target.messages.push({from,data:String(data)});
  }
  receive(pid){return this.processes.find(p=>p.pid===pid)?.messages.shift()||null;}
}

export class PixelOS {
  constructor(computer,runtime,terminal){
    this.computer=computer;this.runtime=runtime;this.terminal=terminal;
    this.startTime=Date.now();
    this.memory=new MemoryManager(runtime.ramBytes);
    this.processes=new ProcessManager(this);
    this.compiler=new AssemblyCompiler();
    this.linker=new Linker(runtime.assembler);
    this.unsubscribe=terminal?.onLine?.(line=>this.execute(line));
    terminal?.setPrompt?.("pcos$ ");
    terminal?.print("Shell готова. help — список команд.");
  }
  stop(){this.unsubscribe?.();this.terminal?.setPrompt?.("");}
  print(value){this.terminal?.print(value);}
  file(name){
    const file=this.computer.memory?.get(name);
    if(!file)throw new Error(`файл ${name} не найден`);
    return file;
  }
  execute(line){
    const args=line.trim().match(/"[^"]*"|\S+/g)||[],cmd=(args.shift()||"").toLowerCase();
    try{
      if(!cmd)return;
      if(cmd==="help")this.print("help ls ps mem run kill send recv asm link time clear");
      else if(cmd==="ls")for(const f of this.computer.memory.list())this.print(`${f.name}  ${f.size} Б`);
      else if(cmd==="ps")for(const p of this.processes.processes)this.print(`${p.pid}  ${p.state}  ${p.name}`);
      else if(cmd==="mem")this.print(`RAM: ${this.memory.freeBytes()}/${this.memory.size} Б свободно`);
      else if(cmd==="time")this.print(new Date().toLocaleString("ru-RU"));
      else if(cmd==="clear")this.terminal.clear();
      else if(cmd==="run"){
        const file=this.file(args[0]);if(!file.data)throw new Error("нужен бинарный файл");
        const p=this.processes.spawn(file.name,file.data);this.print(`PID ${p.pid} запущен`);
      }else if(cmd==="kill")this.print(this.processes.kill(Number(args[0]))?"остановлен":"процесс не найден или уже выполняется");
      else if(cmd==="send"){this.processes.send(0,Number(args[0]),args.slice(1).join(" "));this.print("отправлено");}
      else if(cmd==="recv"){const m=this.processes.receive(Number(args[0]));this.print(m?`${m.from}: ${m.data}`:"очередь пуста");}
      else if(cmd==="asm"){
        const source=this.file(args[0]);if(source.code===undefined)throw new Error("нужен .asm");
        const out=args[1]||args[0].replace(/\.asm$/i,".obj");
        const userSource=/^\.protected\s*$/mi.test(source.code)
          ? source.code : `.protected\n${source.code}`;
        const err=this.computer.memory.saveBinary(out,this.compiler.compile(userSource,args[0]));
        if(err)throw new Error(err);this.print(`создан ${out}`);
      }else if(cmd==="link"){
        const dynamic=args.includes("--dynamic"),clean=args.filter(a=>a!=="--dynamic");
        const out=clean.shift();if(!out)throw new Error("link <out.bin> <a.obj>... [--dynamic]");
        const objects=clean.map(name=>this.file(name).data);
        const binary=this.linker.link(objects,{dynamic});
        const err=this.computer.memory.saveBinary(out,binary);if(err)throw new Error(err);
        this.print(`создан ${out} (${dynamic?"dynamic":"static"})`);
      }else this.print(`команда не найдена: ${cmd}`);
    }catch(error){this.print("error: "+error.message);}
    this.terminal?.renderText?.();
  }
}
