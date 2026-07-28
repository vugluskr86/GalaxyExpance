import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {Assembler,CPU} from "../src/game/cpu.js";
import {ComputerTerminal} from "../src/game/terminal.js";
import {InodeFS,VFSKernel} from "../src/game/vfs.js";
import {INODE_TYPES} from "../src/game/protected-mode.js";

const encoder=new TextEncoder(),decoder=new TextDecoder();
function addFile(store,parent,name,text,mode=0o644){
  const id=store.allocateInode(INODE_TYPES.REGULAR,0,0,mode);
  store.dirAddEntry(parent,name,id);
  store.writeData(store.readInode(id),encoder.encode(text));
  return id;
}
function runtime(args,{store=new InodeFS(128),terminal=new ComputerTerminal(),extra={}}={}){
  const vfs=new VFSKernel(store,{uid:0,gid:0}),output=[];
  const system={
    vfs,envGet:key=>key==="ARGS"?args:undefined,procExit:()=>true,...extra,
  };
  return{store,vfs,terminal,output,system};
}
function execute(name,context,maxSteps=300000){
  const assembler=new Assembler();
  const binary=new Uint8Array(fs.readFileSync(
    new URL(`../system/unix/build/${name}.bin`,import.meta.url)));
  const cpu=new CPU(65536,value=>context.output.push(String(value)),
    context.terminal,context.system);
  return cpu.run(assembler.decodeBinary(binary),maxSteps,true,{preempt:true});
}

test("stage 7/8 artifacts are separate protected binaries without privileged FS opcodes",()=>{
  const assembler=new Assembler();
  const names=["sh","ls","cat","grep","cp","mv","mkdir","rm","link",
    "chown","chgrp","user","find"];
  for(const name of names){
    const binary=new Uint8Array(fs.readFileSync(
      new URL(`../system/unix/build/${name}.bin`,import.meta.url)));
    assert.equal(binary[5]&1,1,`${name}.bin protected`);
    const program=assembler.decodeBinary(binary);
    assert.ok(program.length>0);
    assert.equal(program.some(ins=>["FS_READ","FS_WRITE","FS_DELETE","PROC_EXEC"]
      .includes(ins.op)),false,`${name}.bin uses syscall ABI`);
  }
});

test("cat streams a file and cp preserves complete content",()=>{
  const store=new InodeFS(128),root=store.readInode(store.rootId);
  addFile(store,root,"source","alpha\nbeta\n");
  const cat=runtime("cat /source",{store});
  execute("cat",cat);
  assert.match(cat.output.join(""),/alpha\nbeta/);
  const cp=runtime("cp /source /copy",{store});
  execute("cp",cp);
  const copy=store.resolvePath(root,"/copy",0,0).inode;
  assert.equal(decoder.decode(store.readData(copy)),"alpha\nbeta\n");
  addFile(store,root,"file name","quoted");
  const quoted=runtime('cat "/file name"',{store});
  execute("cat",quoted);
  assert.equal(quoted.output.join(""),"quoted");
});

test("mkdir, link and rm mutate VFS through their individual binaries",()=>{
  const store=new InodeFS(128),root=store.readInode(store.rootId);
  addFile(store,root,"source","payload");
  execute("mkdir",runtime("mkdir /created",{store}));
  assert.equal(store.resolvePath(root,"/created",0,0).inode.type,INODE_TYPES.DIRECTORY);
  execute("link",runtime("link /source /alias",{store}));
  const source=store.resolvePath(root,"/source",0,0).inode;
  assert.equal(store.resolvePath(root,"/alias",0,0).inode.id,source.id);
  assert.equal(source.nlink,2);
  execute("rm",runtime("rm /alias",{store}));
  assert.equal(store.resolvePath(root,"/alias",0,0).inode,null);
  assert.equal(store.readInode(source.id).nlink,1);
});

test("mkdir -p creates every missing path component",()=>{
  const store=new InodeFS(128),root=store.readInode(store.rootId);
  execute("mkdir",runtime("mkdir -p /one/two/three",{store}));
  assert.equal(store.resolvePath(root,"/one/two/three",0,0).inode.type,
    INODE_TYPES.DIRECTORY);
});

test("find walks recursively and rm -r removes children before parents",()=>{
  const store=new InodeFS(128),root=store.readInode(store.rootId);
  const oneId=store.allocateInode(INODE_TYPES.DIRECTORY,0,0,0o755);
  store.dirAddEntry(root,"one",oneId);
  const one=store.readInode(oneId);
  const twoId=store.allocateInode(INODE_TYPES.DIRECTORY,0,0,0o755);
  store.dirAddEntry(one,"two",twoId);
  addFile(store,store.readInode(twoId),"leaf","x");
  const found=runtime("find /one",{store});
  execute("find",found,1000000);
  assert.equal(found.output.join(""),"/one\n/one/two\n/one/two/leaf\n");
  execute("rm",runtime("rm -r /one",{store}),1000000);
  assert.equal(store.dirLookup(root,"one"),null);
});

test("ls iterates every readdir page and -a controls hidden names",()=>{
  const store=new InodeFS(128),root=store.readInode(store.rootId);
  for(const name of ["alpha",".hidden","beta","gamma","delta","epsilon",
    "zeta","eta","theta","iota"])
    addFile(store,root,name,name);
  const normal=runtime("ls /",{store});
  execute("ls",normal);
  const normalText=normal.output.join("");
  for(const name of ["alpha","beta","gamma","delta","epsilon","zeta","eta","theta","iota"])
    assert.match(normalText,new RegExp(`${name}\\n`));
  assert.doesNotMatch(normalText,/\.hidden/);
  const all=runtime("ls -a /",{store});
  execute("ls",all);
  assert.match(all.output.join(""),/\.hidden\n/);
  const long=runtime("ls -l /",{store});
  execute("ls",long,1000000);
  assert.match(long.output.join(""),/0 420 0 0 5 alpha\n/);
});

test("grep streams matching lines and -n prefixes line numbers",()=>{
  const store=new InodeFS(128),root=store.readInode(store.rootId);
  addFile(store,root,"log","zero\nneedle one\nskip\nneedle two\n");
  const context=runtime("grep -n needle /log",{store});
  const result=execute("grep",context,1000000);
  assert.equal(result.halted,true);
  assert.equal(context.output.join(""),"2:needle one\n4:needle two\n");
});

test("sh executes builtins and resolves external commands through /bin PATH",()=>{
  const store=new InodeFS(128),terminal=new ComputerTerminal(),spawned=[],env={};
  terminal.lineQueue.push("pwd","cat /note","exit");
  const context=runtime("",{store,terminal,extra:{
    envSet(key,value){env[key]=value;return true;},
    envGet:key=>env[key],
    procExec(path){spawned.push(path);return 2;},
    procWait(){return{pid:2,status:0};},
  }});
  execute("sh",context,500000);
  assert.deepEqual(spawned,["/bin/cat"]);
  assert.equal(env.ARGS,"cat /note");
  assert.match(terminal.lines.join("\n"),/\//);
});

test("sh executes semicolon sequence nodes outside quotes",()=>{
  const store=new InodeFS(128),terminal=new ComputerTerminal(),spawned=[],env={};
  terminal.lineQueue.push("cat /a; cat /b","exit");
  const context=runtime("",{store,terminal,extra:{
    envSet(key,value){env[key]=value;return true;},
    envGet:key=>env[key],
    procExec(path){spawned.push({path,args:env.ARGS});return spawned.length+1;},
    procWait(pid){return{pid,status:0};},
  }});
  execute("sh",context,700000);
  assert.deepEqual(spawned,[
    {path:"/bin/cat",args:"cat /a"},
    {path:"/bin/cat",args:" cat /b"},
  ]);
});

test("sh opens redirections and passes descriptors atomically to SPAWN_FD",()=>{
  const store=new InodeFS(128),root=store.readInode(store.rootId);
  addFile(store,root,"note","payload");
  const terminal=new ComputerTerminal(),env={},calls=[];
  terminal.lineQueue.push("cat /note > /out","exit");
  const context=runtime("",{store,terminal,extra:{
    envSet(key,value){env[key]=value;return true;},
    envGet:key=>env[key],
    procExec(path,credentials,options){calls.push({path,credentials,options});return 2;},
    procWait(){return{pid:2,status:0};},
  }});
  execute("sh",context,700000);
  assert.equal(store.resolvePath(root,"/out",0,0).inode.type,INODE_TYPES.REGULAR);
  assert.equal(calls[0].path,"/bin/cat");
  assert.equal(calls[0].options.stdout>=3,true);
});

test("sh executes pipeline nodes with connected inherited descriptors",()=>{
  const store=new InodeFS(128),root=store.readInode(store.rootId);
  addFile(store,root,"a","payload");
  const terminal=new ComputerTerminal(),env={},calls=[];
  terminal.lineQueue.push("cat /a | cat","exit");
  const context=runtime("",{store,terminal,extra:{
    envSet(key,value){env[key]=value;return true;},
    envGet:key=>env[key],
    procExec(path,credentials,options){calls.push({path,options});return calls.length+1;},
    procWait(pid){return{pid,status:0};},
  }});
  execute("sh",context,900000);
  assert.equal(calls.length,2);
  assert.equal(calls[0].options.stdout>=3,true);
  assert.equal(calls[1].options.stdin>=3,true);
  assert.equal(store.dirLookup(root,".pcos-pipe"),null);
});

test("sh expands $? from the preceding command and handles Ctrl+C",()=>{
  const terminal=new ComputerTerminal(),env={HOME:"/root"},calls=[],keys=[];
  terminal.lineQueue.push("cat /missing; cat $?; cat $HOME","\x03","exit");
  const context=runtime("",{terminal,extra:{
    envSet(key,value){env[key]=value;return true;},
    envGet(key){keys.push(key);return env[key];},
    procExec(path){calls.push({path,args:env.ARGS});return calls.length+1;},
    procWait(pid){return{pid,status:calls.length===1?7:0};},
  }});
  execute("sh",context,900000);
  assert.equal(calls[1].args," cat 7");
  assert.ok(keys.includes("HOME"));
  assert.equal(calls[2].args," cat /root");
  assert.match(terminal.lines.join("\n"),/\^C/);
});

test("utility sources expose the required Stage 8 command-specific behavior",()=>{
  const source=fs.readFileSync(
    new URL("../system/unix/lib/utilities.asm",import.meta.url),"utf8");
  for(const symbol of ["util_ls","util_cat","util_grep","util_cp","util_mv",
    "util_mkdir","util_rm","util_link","util_chown","util_chgrp","util_user","util_find"])
    assert.match(source,new RegExp(`\\.export ${symbol}`));
  assert.match(source,/util_cp_loop:/);
  assert.match(source,/LOAD_D -18[\s\S]*CALL util_cp/);
  assert.match(source,/SYSCALL 0x28/);
});
