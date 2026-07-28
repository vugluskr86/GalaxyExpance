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
  free(pid){this.blocks=this.blocks.filter(block=>block.pid!==pid);}
  freeBytes(){return this.size-this.blocks.reduce((sum,b)=>sum+b.size,0);}
}

export class ProcessManager {
  constructor(os){
    this.os=os;this.nextPid=1;this.processes=[];this.scheduled=false;
    this.cursor=0;this.quantum=1000;
  }
  spawn(name,binary){
    const executable=this.os.linker.loadExecutable(binary);
    const descriptor=this.os.runtime.assembler.decodeBinary(executable);
    const pid=this.nextPid++,memory=this.os.memory.allocate(executable.length,pid);
    const process={pid,name,state:"ready",memory,messages:[],binary:executable,output:[],
      protected:!!(descriptor.featureFlags&PROTECTED_FEATURE),layout:null,cause:0,faultAddress:0,
      context:null,preemptions:0};
    this.processes.push(process);this.schedule();return process;
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
        this.os.memory.free(process.pid);
      }else if(result.yielded)process.state="ready";
      else{process.state="exited";process.exitCode=0;this.os.memory.free(process.pid);}
    }catch(error){process.state="failed";process.error=error.message;process.exitCode=1;}
    if(process.state==="failed")this.os.memory.free(process.pid);
    if(this.processes.some(p=>p.state==="ready"))this.schedule(process.state==="ready"?50:0);
  }
  kill(pid){
    const p=this.processes.find(x=>x.pid===pid);
    if(!p)return false;
    if(p.state==="ready"){p.state="killed";this.os.memory.free(p.pid);return true;}
    return false;
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
