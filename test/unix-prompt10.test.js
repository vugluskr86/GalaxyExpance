import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {Assembler,CPU} from "../src/game/cpu.js";
import {ComputerTerminal} from "../src/game/terminal.js";
import {InodeFS,ProcessFDTable,VFSKernel} from "../src/game/vfs.js";

const encoder=new TextEncoder();

class PcvmStagingRunner{
  constructor(image){
    this.fs=InodeFS.deserialize(image);
    this.assembler=new Assembler();
    this.terminal=new ComputerTerminal();
    this.nextPid=2;
    this.trace=[];
  }

  inode(path,cwd=this.fs.readInode(this.fs.rootId)){
    return this.fs.resolvePath(cwd.id,path,0,0).inode;
  }

  read(path,cwd){
    const inode=this.inode(path,cwd);
    return inode?this.fs.readData(inode):null;
  }

  run(path,args,{environment={},cwd=null,fdTable=null,depth=0}={}){
    if(depth>64)throw new Error("PCVM process recursion limit");
    const workdir=cwd||this.fs.readInode(this.fs.rootId);
    const binary=this.read(path,workdir);
    if(!binary)throw new Error(`staging executable not found: ${path}`);
    const env={...environment,ARGS:args};
    const waits=new Map();
    let exitStatus=0,cpu;
    const vfs=new VFSKernel(this.fs,{uid:0,gid:0});
    const system={
      vfs,
      envGet:key=>env[key],
      envSet:(key,value)=>{
        if(!/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(key))return false;
        env[key]=String(value).slice(0,2047);return true;
      },
      envUnset:key=>{
        if(!Object.hasOwn(env,key))return false;
        delete env[key];return true;
      },
      envList:()=>encoder.encode(Object.entries(env).sort()
        .map(([key,value])=>`${key}=${value}`).join("\n")),
      procExit:status=>{exitStatus=status|0;return true;},
      procExec:(childPath,credentials,options)=>{
        const pid=this.nextPid++;
        const inherited=cpu._vfs?.clone()||new ProcessFDTable(this.fs,workdir);
        if(options){
          for(const [name,target] of [["stdin",0],["stdout",1],["stderr",2]]){
            const source=options[name];
            if(source!==null&&source!==undefined)inherited.dup(source,target);
          }
        }
        const childArgs=env.ARGS||childPath.split("/").at(-1);
        const traceEntry={path:childPath,args:childArgs};
        this.trace.push(traceEntry);
        try{
          const child=this.run(childPath,childArgs,{
            environment:{...env},cwd:inherited.cwd,fdTable:inherited,depth:depth+1});
          traceEntry.status=child.status;
          traceEntry.output=child.output.slice(-6);
          waits.set(pid,{pid,status:child.status});
        }catch(error){
          traceEntry.status=1;
          traceEntry.error=error.message;
          waits.set(pid,{pid,status:1,error});
        }
        return pid;
      },
      procWait:pid=>{
        const result=waits.get(pid);
        if(result)waits.delete(pid);
        return result||null;
      },
      memInfo:()=>({free:1024*1024,total:2*1024*1024}),
      time:()=>"2026-07-29 12:00:00",
    };
    const output=[];
    cpu=new CPU(2097152,value=>output.push(String(value)),this.terminal,system);
    cpu._vfs=fdTable||new ProcessFDTable(this.fs,workdir);
    const program=this.assembler.decodeBinary(binary);
    let result;
    try{
      result=cpu.run(program,150_000_000,true,{preempt:true});
    }catch(error){
      error.message+=` [${path} PC=${cpu.r.PC} SP=${cpu.r.SP} A=${cpu.r.A} `+
        `B=${cpu.r.B} C=${cpu.r.C} D=${cpu.r.D} trace=`+
        `${this.trace.slice(-8).map(call=>call.path).join(",")}]`;
      throw error;
    }
    cpu._vfs.closeAll();
    return{status:exitStatus,result,output,environment:env};
  }
}

function stagingRunner(){
  const image=new Uint8Array(fs.readFileSync(
    new URL("../system/unix/build/prompt10-staging.pcfs",import.meta.url)));
  const runner=new PcvmStagingRunner(image);
  const cwd=runner.inode("/usr/src/pcos/system/unix");
  assert.ok(cwd);
  return{runner,cwd};
}

test("Prompt 10 staging cat reads a source from the installed cwd",()=>{
  const {runner,cwd}=stagingRunner();
  const result=runner.run("/bin/cat.bin","cat.bin lib/crt0.asm",{cwd});
  assert.equal(result.status,0,result.output.join(" | "));
  assert.match(result.output.join(""),/PCOS user entry ABI/);
});

test("Prompt 10 staging shell redirects a real child into VFS",()=>{
  const {runner,cwd}=stagingRunner();
  const command="cat.bin lib/crt0.asm > build/redirect.asm";
  const result=runner.run("/bin/sh.bin","sh",{cwd,environment:{SH_COMMAND:command}});
  assert.equal(result.status,0,`${result.output.join(" | ")} ${JSON.stringify(runner.trace)}`);
  const redirected=runner.read("/usr/src/pcos/system/unix/build/redirect.asm");
  assert.ok(redirected);
  assert.match(new TextDecoder().decode(redirected),/PCOS user entry ABI/);
});

test("Prompt 10 make detects an indirect dependency cycle",()=>{
  const {runner,cwd}=stagingRunner();
  const id=runner.fs.allocateInode(0,0,0,0o644);
  runner.fs.dirAddEntry(cwd,"Cycle",id);
  runner.fs.writeData(runner.fs.readInode(id),encoder.encode("a: b\nb: a\n"));
  const result=runner.run("/bin/make.bin","make -f Cycle a",{cwd});
  assert.equal(result.status,1,JSON.stringify(runner.trace));
  assert.ok(runner.trace.length<10,"cycle should stop without exhausting process depth");
  assert.match(runner.trace.flatMap(call=>call.output).join(""),/make: cycle/);
});

test("Prompt 10 make propagates a failed recipe status",()=>{
  const {runner,cwd}=stagingRunner();
  const id=runner.fs.allocateInode(0,0,0,0o644);
  runner.fs.dirAddEntry(cwd,"Failure",id);
  runner.fs.writeData(runner.fs.readInode(id),
    encoder.encode("all:\n\tmissing-command.bin\n"));
  const result=runner.run("/bin/make.bin","make -f Failure all",{cwd});
  assert.equal(result.status,1,JSON.stringify(runner.trace));
});

test("Prompt 10 clean staging rebuilds hello through make, sh and self-hosted tools",()=>{
  const {runner,cwd}=stagingRunner();
  const result=runner.run("/bin/make.bin","make -f Makefile hello.bin",
    {cwd,environment:{PATH:"/bin",USER:"root",HOME:"/root",SHELL:"/bin/sh.bin"}});
  assert.equal(result.status,0,`${result.output.join(" | ")}\n${JSON.stringify(runner.trace)}`);
  const hello=runner.read("/usr/src/pcos/system/unix/hello.bin");
  assert.ok(hello,"make did not create hello.bin");
  assert.deepEqual(Array.from(hello.slice(0,4)),[0x50,0x43,0x56,0x4d],
    JSON.stringify(runner.trace));
  let decoded;
  try{decoded=runner.assembler.decodeBinary(hello);}
  catch(error){
    error.message+=` size=${hello.length} trace=${JSON.stringify(runner.trace)}`;
    throw error;
  }
  assert.ok(decoded.length>0);
  const execution=runner.run("/usr/src/pcos/system/unix/hello.bin","hello.bin",{cwd});
  assert.equal(execution.status,0,execution.output.join(" | "));
  assert.match(execution.output.join(""),/hello from self-hosted libc/);
  assert.ok(runner.trace.some(call=>call.path==="/bin/assembler.bin"));
  assert.ok(runner.trace.some(call=>call.path==="/bin/linker.bin"));
  assert.ok(runner.trace.some(call=>call.path==="/bin/sh.bin"));
});

test("Prompt 10 clean staging completes the full self-hosted bootstrap",{
  timeout:180_000
},()=>{
  const {runner,cwd}=stagingRunner();
  const result=runner.run("/bin/make.bin","make -f Makefile bootstrap",{
    cwd,
    environment:{PATH:"/bin",USER:"root",HOME:"/root",SHELL:"/bin/sh.bin"}
  });
  assert.equal(result.status,0,
    `${result.output.join(" | ")}\n${JSON.stringify(runner.trace.slice(-30))}`);

  const outputs=[
    "assembler2.bin","linker2.bin",
    "hello.bin","env.bin","make.bin","sh.bin",
    "ls.bin","cat.bin","grep.bin","cp.bin","mv.bin","mkdir.bin","rm.bin",
    "link-util.bin","top.bin","find.bin","chown.bin","chgrp.bin","user.bin",
    "kernel.bin","init.bin","logger.bin","login.bin","passwd.bin"
  ];
  for(const path of outputs){
    const binary=runner.read(`/usr/src/pcos/system/unix/${path}`);
    assert.ok(binary,`bootstrap did not create ${path}; `+
      `trace=${JSON.stringify(runner.trace.slice(-40))}`);
    assert.deepEqual(Array.from(binary.slice(0,4)),[0x50,0x43,0x56,0x4d],
      `${path} has invalid PCVM magic`);
    assert.ok(runner.assembler.decodeBinary(binary).length>0,
      `${path} is an empty PCVM program`);
  }
});
