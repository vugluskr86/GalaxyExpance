import { AssemblyCompiler, Linker } from "./toolchain.js";
import { CONTEXT_LAYOUT,PROTECTED_EXCEPTIONS,PROTECTED_FEATURE } from "./protected-mode.js";
import {InodeFS,ProcessFDTable,VFSKernel} from "./vfs.js";
import { networkCommand } from "./network.js";

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
    uid=null,gid=null,euid=null,egid=null,fdTable=null,env=null}={}){
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
      fdTable:fdTable||(this.os.fs?new ProcessFDTable(this.os.fs,this.os.cwd||this.os.fs.readInode(this.os.fs.rootId)):null),
      env:{...(parent?.env||{}),...(env||{})}};
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
      this.os.vfs?.setCredentials(process);
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
    this.os.persistFs();
    for(const child of this.processes.filter(item=>item.ppid===process.pid))
      child.ppid=1;
    const parent=this.processes.find(item=>item.pid===process.ppid);
    if(parent)parent.pendingEvents.push({type:"CHLD",pid:process.pid,status:process.exitCode});
    // Commands started by the interactive host prompt have no parent process
    // that could call wait(). They are intentionally auto-reaped instead of
    // accumulating inert `exited` rows in `ps` forever.
    if(process.autoReap)this.reap(process);
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
    this.fs=null;this.vfs=null;
    if(runtime.storage?.pcfsImage){
      try{this.fs=InodeFS.deserialize(runtime.storage.pcfsImage);this.vfs=new VFSKernel(this.fs,{uid:0,gid:0});}
      catch(error){terminal?.print(`PCFS: ${error.message}`);}
    }
    this.mounts=new Map();
    if(this.fs)this.mounts.set("/",{device:"/dev/drive0",path:"/",fs:this.fs,storage:runtime.storage,root:true});
    this.cwd=this.fs?.readInode(this.fs.rootId)||null;
    this.processes=new ProcessManager(this);
    this.compiler=new AssemblyCompiler();
    this.linker=new Linker(runtime.assembler);
    this.unsubscribe=terminal?.onLine?.(line=>this.execute(line));
    terminal?.setPrompt?.(this.fs?"pcos:/# ":"pcos$ ");
    terminal?.focus?.();
    terminal?.print(this.fs?"PCOS: установленный PCFS подключён. help — список команд.":"Shell готова. help — список команд.");
  }
  stop(){this.unsubscribe?.();this.terminal?.setPrompt?.("");}
  print(value){this.terminal?.print(value);}
  get storage(){return this.runtime.storage || this.computer.memory;}
  persistFs(){if(this.fs&&this.storage)this.storage.pcfsImage=this.fs.serialize();}
  cwdPath(){return this.fs&&this.cwd?this.vfs._inodePath(this.cwd.id):"/";}
  updatePrompt(){this.terminal?.setPrompt?.(this.fs?`pcos:${this.cwdPath()}# `:"pcos$ ");}
  storageDevices(){return this.runtime.storageDevices?.()||[];}
  mountedPath(path){
    const absolute=String(path||"").startsWith("/")?String(path):null;
    if(!absolute)return null;
    const match=[...this.mounts.values()].filter(m=>m.path!=="/"&&(absolute===m.path||absolute.startsWith(m.path+"/")))
      .sort((a,b)=>b.path.length-a.path.length)[0];
    return match?{mount:match,path:absolute.slice(match.path.length)||"/"}:null;
  }
  mount(deviceName,target){
    if(!this.fs)throw new Error("mount доступна после загрузки PCFS");
    const device=this.storageDevices().find(item=>item.device===deviceName);
    if(!device)throw new Error(`${deviceName}: устройство не подключено или носитель не вставлен`);
    if(!device.storage?.pcfsImage)throw new Error(`${deviceName}: носитель не отформатирован в PCFS`);
    const path=String(target||"").replace(/\/+$/,"")||"/";
    if(!path.startsWith("/"))throw new Error("mount: точка монтирования должна быть абсолютной");
    if(path==="/")throw new Error("mount: корневой носитель уже подключён");
    if(this.mounts.has(path))throw new Error(`mount: ${path} уже подключён`);
    let fs;try{fs=InodeFS.deserialize(device.storage.pcfsImage);}catch(error){throw new Error(`mount: ${error.message}`);}
    const mount={device:device.device,path,fs,storage:device.storage,reader:device.reader,media:device.media};
    this.mounts.set(path,mount);return mount;
  }
  unmount(target){
    const mount=[...this.mounts.values()].find(item=>item.path===target||item.device===target);
    if(!mount||mount.root)throw new Error(`umount: ${target}: нет съёмной точки монтирования`);
    mount.storage.pcfsImage=mount.fs.serialize();this.mounts.delete(mount.path);return mount;
  }
  mountLines(){return [...this.mounts.values()].map(m=>`${m.device} on ${m.path} type pcfs (rw)`);}
  deviceLines(){
    const mounted=new Set([...this.mounts.values()].map(m=>m.device));
    return this.storageDevices().map(device=>`${device.device}\t${device.removable?"removable":"fixed"}\t${Math.max(0,device.storage?.ramKb||0)}K\t${mounted.has(device.device)?"mounted":device.storage?"ready":"empty"}\t${device.label}`);
  }
  mountedFile(name){
    const resolved=this.mountedPath(name);if(!resolved)return null;
    const inode=resolved.mount.fs.resolvePath(resolved.mount.fs.readInode(resolved.mount.fs.rootId),resolved.path,0,0).inode;
    if(!inode)throw new Error(`файл ${name} не найден`);
    return {name,data:resolved.mount.fs.readData(inode),size:inode.size,mount:resolved.mount};
  }
  file(name){
    const mounted=this.mountedFile(name);if(mounted)return mounted;
    if(this.fs){
      const path=String(name||"");
      const inode=this.fs.resolvePath(this.cwd||this.fs.readInode(this.fs.rootId),path,0,0).inode;
      if(!inode)throw new Error(`файл ${name} не найден`);
      return {name:path,data:this.fs.readData(inode),size:inode.size};
    }
    const file=this.storage?.get(name);
    if(!file)throw new Error(`файл ${name} не найден`);
    return file;
  }
  /** Applications are installed under /usr/bin; /bin remains the compatibility
   * location for the compact base system.  Resolving here keeps `scanner`
   * usable from the board terminal without duplicating the binary. */
  commandFile(command){
    let lastError;
    for(const directory of ["/usr/bin","/bin"]){
      try{return this.file(`${directory}/${command}.bin`);}
      catch(error){lastError=error;}
    }
    for(const mount of [...this.mounts.values()].filter(item=>!item.root)){
      try{return this.file(`${mount.path}/usr/bin/${command}.bin`);}
      catch(error){lastError=error;}
      try{return this.file(`${mount.path}/bin/${command}.bin`);}
      catch(error){lastError=error;}
    }
    throw lastError||new Error(`команда не найдена: ${command}`);
  }
  execute(line){
    const args=line.trim().match(/"[^"]*"|\S+/g)||[],cmd=(args.shift()||"").toLowerCase();
    try{
      if(!cmd)return;
      if(["ip","ping","netstat","dhcp","nslookup","curl"].includes(cmd)){
        for(const value of networkCommand(this.runtime.networkProp,line))this.print(value);
      }
      if(cmd==="help")this.print("help ls cd ps mem run kill send recv asm link mount umount lsblk time clear ip ping netstat dhcp nslookup curl");
      else if(["ip","ping","netstat","dhcp","nslookup","curl"].includes(cmd)){}
      else if(cmd==="mount"){
        if(!args.length){for(const value of this.mountLines())this.print(value);}
        else if(args[0]==="-a"){
          const fstab=this.file("/etc/fstab");const text=new TextDecoder().decode(fstab.data);
          for(const row of text.split(/\r?\n/)){
            const [device,path,,options=""]=row.trim().split(/\s+/);if(!device||device.startsWith("#")||options.includes("noauto")||path==="/")continue;
            try{this.mount(device,path);this.print(`${device} mounted on ${path}`);}catch(error){this.print(`mount: ${error.message}`);}
          }
        }else{
          if(args.length!==2)throw new Error("usage: mount <device> <mountpoint>");
          const mounted=this.mount(args[0],args[1]);this.print(`${mounted.device} mounted on ${mounted.path}`);
        }
      }
      else if(cmd==="umount"){
        if(args.length!==1)throw new Error("usage: umount <mountpoint|device>");
        const mounted=this.unmount(args[0]);this.print(`${mounted.device} unmounted from ${mounted.path}`);
      }
      else if(cmd==="lsblk")for(const value of this.deviceLines())this.print(value);
      else if(cmd==="ls"){
        if(this.fs){
          const path=args[0]||".",mounted=this.mountedPath(path);
          if(mounted){
            const directory=mounted.mount.fs.resolvePath(mounted.mount.fs.readInode(mounted.mount.fs.rootId),mounted.path,0,0).inode;
            if(!directory)throw new Error(`каталог ${path} не найден`);
            for(const entry of mounted.mount.fs.readDirEntries(directory)){
              const inode=mounted.mount.fs.readInode(entry.inode);this.print(`${entry.name}${inode?.type===1?"/":""}  ${inode?.size||0} Б`);
            }
            return this.terminal?.renderText?.();
          }
          const directory=this.fs.resolvePath(this.cwd||this.fs.readInode(this.fs.rootId),path,0,0).inode;
          if(!directory)throw new Error(`каталог ${path} не найден`);
          for(const entry of this.fs.readDirEntries(directory)){
            const inode=this.fs.readInode(entry.inode);this.print(`${entry.name}${inode?.type===1?"/":""}  ${inode?.size||0} Б`);
          }
        }else for(const f of this.storage.list())this.print(`${f.name}  ${f.size} Б`);
      }
      else if(cmd==="cd"){
        if(!this.fs)throw new Error("cd доступна после загрузки установленного PCFS");
        const path=args[0]||"/",directory=this.fs.resolvePath(this.cwd||this.fs.readInode(this.fs.rootId),path,0,0).inode;
        if(!directory)throw new Error(`каталог ${path} не найден`);
        if(directory.type!==1)throw new Error(`${path}: не каталог`);
        this.cwd=directory;this.updatePrompt();
      }
      else if(cmd==="ps")for(const p of this.processes.processes)this.print(`${p.pid}  ${p.state}  ${p.name}`);
      else if(cmd==="mem")this.print(`RAM: ${this.memory.freeBytes()}/${this.memory.size} Б свободно`);
      else if(cmd==="time")this.print(new Date().toLocaleString("ru-RU"));
      else if(cmd==="clear")this.terminal.clear();
      else if(cmd==="run"){
        const file=this.file(args[0]);if(!file.data)throw new Error("нужен бинарный файл");
        const p=this.processes.spawn(file.name,file.data,{env:{ARGS:[file.name,...args.slice(1)].join(" "),PATH:"/usr/bin:/bin"}});this.print(`PID ${p.pid} запущен`);
      }else if(cmd==="kill")this.print(this.processes.kill(Number(args[0]))?"остановлен":"процесс не найден или уже выполняется");
      else if(cmd==="send"){this.processes.send(0,Number(args[0]),args.slice(1).join(" "));this.print("отправлено");}
      else if(cmd==="recv"){const m=this.processes.receive(Number(args[0]));this.print(m?`${m.from}: ${m.data}`:"очередь пуста");}
      else if(cmd==="asm"){
        const source=this.file(args[0]);if(source.code===undefined)throw new Error("нужен .asm");
        const out=args[1]||args[0].replace(/\.asm$/i,".obj");
        const userSource=/^\.protected\s*$/mi.test(source.code)
          ? source.code : `.protected\n${source.code}`;
        const err=this.storage.saveBinary(out,this.compiler.compile(userSource,args[0]));
        if(err)throw new Error(err);this.print(`создан ${out}`);
      }else if(cmd==="link"){
        const dynamic=args.includes("--dynamic"),clean=args.filter(a=>a!=="--dynamic");
        const out=clean.shift();if(!out)throw new Error("link <out.bin> <a.obj>... [--dynamic]");
        const objects=clean.map(name=>this.file(name).data);
        const binary=this.linker.link(objects,{dynamic});
        const err=this.storage.saveBinary(out,binary);if(err)throw new Error(err);
        this.print(`создан ${out} (${dynamic?"dynamic":"static"})`);
      }else if(this.fs){
        const file=this.commandFile(cmd);
        const p=this.processes.spawn(cmd,file.data,{env:{ARGS:[cmd,...args].join(" "),PATH:"/usr/bin:/bin"}});
        this.print(`PID ${p.pid} запущен`);
      }else this.print(`команда не найдена: ${cmd}`);
    }catch(error){this.print("error: "+error.message);}
    this.terminal?.renderText?.();
  }
}
