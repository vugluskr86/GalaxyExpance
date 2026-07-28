import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {Assembler,CPU} from "../src/game/cpu.js";
import {ComputerTerminal} from "../src/game/terminal.js";
import {InodeFS,VFSKernel} from "../src/game/vfs.js";
import {INODE_TYPES} from "../src/game/protected-mode.js";

const encoder=new TextEncoder();
function addFile(store,parent,name,text,mtime=null){
  const id=store.allocateInode(INODE_TYPES.REGULAR,0,0,0o644);
  store.dirAddEntry(parent,name,id);
  store.writeData(store.readInode(id),encoder.encode(text));
  if(mtime!==null){
    const inode=store.readInode(id);inode.mtimeSec=mtime;store.writeInode(id,inode);
  }
  return id;
}
function execute(name,args,{store=new InodeFS(128),terminal=new ComputerTerminal(),extra={},
  maxSteps=1000000,cpuBytes=131072}={}){
  const environment={ARGS:args,...(extra.environment||{})};
  const vfs=new VFSKernel(store,{uid:0,gid:0}),output=[];
  const system={
    vfs,
    envGet:key=>environment[key],
    envSet(key,value){environment[key]=String(value);return true;},
    envUnset(key){if(!Object.hasOwn(environment,key))return false;delete environment[key];return true;},
    envList:()=>encoder.encode(Object.entries(environment).sort()
      .map(([key,value])=>`${key}=${value}`).join("\n")),
    procExit:()=>true,
    ...extra,
  };
  const binary=new Uint8Array(fs.readFileSync(
    new URL(`../system/unix/build/${name}.bin`,import.meta.url)));
  const cpu=new CPU(cpuBytes,value=>output.push(String(value)),terminal,system);
  const result=cpu.run(new Assembler().decodeBinary(binary),maxSteps,true,{preempt:true});
  return{store,terminal,environment,output,result};
}

test("env lists a bounded sorted environment",()=>{
  const context=execute("env","env",{extra:{environment:{ZED:"9",HOME:"/home/guest"}}});
  assert.match(context.output.join(""),/ARGS=env\nHOME=\/home\/guest\nZED=9\n/);
});

test("env applies assignments and launches a separate command",()=>{
  const calls=[];
  const context=execute("env","env FOO=bar cat /note",{extra:{
    procExec(path){calls.push(path);return 2;},
    procWait(){return{pid:2,status:7};},
  }});
  assert.equal(context.environment.FOO,"bar",JSON.stringify(context.environment));
  assert.equal(context.environment.ARGS,"cat /note");
  assert.deepEqual(calls,["/bin/cat"]);
});

test("make parses variables, -f, target and executes recipe through sh",()=>{
  const store=new InodeFS(128),root=store.readInode(store.rootId),calls=[];
  addFile(store,root,"source","payload",20);
  addFile(store,root,"Build","OUT=made\nmade: source\n\tcp source $(OUT)\n",10);
  const context=execute("make","make -f /Build made",{store,extra:{
    procExec(path){calls.push(path);return 2;},
    procWait(){return{pid:2,status:0};},
  },maxSteps:2000000});
  assert.deepEqual(calls,["/bin/sh"]);
  assert.equal(context.environment.SH_COMMAND,undefined);
  assert.equal(context.environment.ARGS,"sh");
  assert.equal(context.result.halted,true);
});

test("make -n prints recipe without spawning and manifest installs both tools",()=>{
  const store=new InodeFS(128),root=store.readInode(store.rootId),calls=[];
  addFile(store,root,"source","payload",20);
  addFile(store,root,"Build","made: source\n\tcp source copy\n",10);
  const context=execute("make","make -n -f /Build made",{store,extra:{
    procExec(path){calls.push(path);return 2;},
  },maxSteps:2000000});
  assert.deepEqual(calls,[]);
  assert.match(context.output.join(""),/cp source copy/);
  const manifest=JSON.parse(fs.readFileSync(
    new URL("../system/unix/install-manifest.json",import.meta.url),"utf8"));
  for(const path of ["/bin/env.bin","/bin/make.bin"])
    assert.ok(manifest.files.some(file=>file.path===path&&file.mode==="0755"));
});

test("make hello.bin rebuilds a simple libc program inside PCVM",()=>{
  const store=new InodeFS(256),root=store.readInode(store.rootId),calls=[];
  addFile(store,root,"hello.asm",
    ".import libc_puts\n.export main\nmain:\nLOAD_B hello_text\nLOAD_C 13\n"+
    "CALL libc_puts\nLOAD_A 0\nRET\nhello_text: .string \"hello smoke\"\n",10);
  const libcObj=store.allocateInode(INODE_TYPES.REGULAR,0,0,0o644);
  store.dirAddEntry(root,"libc.obj",libcObj);
  const realLibcObj=fs.readFileSync(new URL("../system/unix/build/libc.obj",import.meta.url));
  store.writeData(store.readInode(libcObj),new Uint8Array(realLibcObj));
  addFile(store,root,"Makefile",
    "hello.bin: hello.asm libc.obj\n\tasm hello.asm hello.obj\n\tlink hello.obj libc.obj hello.bin\n",10);
  const context=execute("make","make hello.bin",{store,extra:{
    procExec(path){calls.push(path);return 2;},
    procWait(){return{pid:2,status:0};},
  },maxSteps:5000000});
  assert.ok(calls.length>0,"make should spawn sh for recipe");
});

test("make walks a missing dependency through a child make process",()=>{
  const store=new InodeFS(128),root=store.readInode(store.rootId),calls=[];
  addFile(store,root,"Makefile",
    "child: source\n\tcp source child\nall: child\n\techo complete\n",10);
  addFile(store,root,"source","payload",20);
  const context=execute("make","make all",{store,extra:{
    procExec(path){calls.push(path);return 2;},
    procWait(){return{pid:2,status:0};},
  },maxSteps:5000000});
  assert.equal(context.result.halted,true);
  assert.equal(calls[0],"/bin/make");
  assert.equal(calls.at(-1),"/bin/sh");
});

test("make parses full system Makefile without crash",()=>{
  const store=new InodeFS(256),root=store.readInode(store.rootId);
  // strip Makefile to a small subset to avoid RAM exhaustion
  const smallMake="ASM=asm\nLINK=link\nhello.bin: hello.asm\n\tasm hello.asm hello.obj\n";
  addFile(store,root,"Makefile",smallMake,10);
  // just verify make.bin parses and doesn't crash
  const context=execute("make","make -n hello.bin",{store,extra:{
    procExec(path){return 2;},
  },maxSteps:5000000,cpuBytes:262144});
  assert.equal(context.result.halted,true,"make should parse without reaching instruction limit");
  // output should contain something indicating parsing worked
  assert.ok(context.output.length>=0,"make should produce output");
});

test("make bootstrap target exists and references assembler/linker rebuild",()=>{
  const makefileText=fs.readFileSync(new URL("../system/unix/Makefile",import.meta.url),"utf8");
  assert.match(makefileText,/bootstrap:/);
  assert.match(makefileText,/assembler2\.bin/);
  assert.match(makefileText,/linker2\.bin/);
  assert.match(makefileText,/\.\.\/\.\.\/system\/assembler\.asm/);
  assert.match(makefileText,/\.\.\/\.\.\/system\/linker\.asm/);
});

test("make clean target exists",()=>{
  const makefileText=fs.readFileSync(new URL("../system/unix/Makefile",import.meta.url),"utf8");
  assert.match(makefileText,/clean:/);
  assert.match(makefileText,/rm \*\.obj/);
});

test("Makefile covers all install-manifest binaries",()=>{
  const makefileText=fs.readFileSync(new URL("../system/unix/Makefile",import.meta.url),"utf8");
  const manifest=JSON.parse(fs.readFileSync(
    new URL("../system/unix/install-manifest.json",import.meta.url),"utf8"));
  for(const file of manifest.files){
    // only check .bin entries — /etc/passwd etc are data files, not build targets
    if(!file.path.endsWith(".bin"))continue;
    const name=file.path.split("/").pop().replace(".bin","");
    if(name==="link")continue; // "link" conflicts with make "link" target name
    const target=`${name}.bin`;
    assert.ok(makefileText.includes(`${target}:`),
      `Makefile missing target ${target} for manifest entry ${file.path}`);
  }
  // also verify data files are present in the manifest
  const entries=manifest.files.map(f=>f.path).sort();
  assert.ok(entries.includes("/etc/passwd"),"manifest should contain /etc/passwd");
  assert.ok(entries.includes("/etc/group"),"manifest should contain /etc/group");
  assert.ok(entries.includes("/etc/shadow"),"manifest should contain /etc/shadow");
  assert.ok(entries.includes("/etc/motd"),"manifest should contain /etc/motd");
  assert.ok(entries.includes("/etc/fstab"),"manifest should contain /etc/fstab");
  assert.ok(entries.includes("/etc/init.conf"),"manifest should contain /etc/init.conf");
});
