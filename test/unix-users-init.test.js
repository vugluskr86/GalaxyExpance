import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {Assembler,CPU} from "../src/game/cpu.js";
import {AssemblyCompiler,Linker} from "../src/game/toolchain.js";
import {SYSCALLS,ERRNO,INODE_TYPES,OPEN_FLAGS} from "../src/game/protected-mode.js";
import {InodeFS,VFSKernel} from "../src/game/vfs.js";
import {ComputerTerminal} from "../src/game/terminal.js";

const enc=new TextEncoder();
function cpu(){
  const memory=new Uint8Array(8192);
  return {
    bytes:memory,view:new DataView(memory.buffer),r:{UBASE:1024,ULIMIT:4096},
    userRange(ptr,len){if(ptr<0||ptr+len>4096)throw new Error("range");return 1024+ptr;}
  };
}
function put(machine,at,text){
  const bytes=enc.encode(text);machine.bytes.set(bytes,machine.r.UBASE+at);return bytes.length;
}

test("stage 5 ABI fixes credential syscall numbers",()=>{
  assert.deepEqual(
    [SYSCALLS.SETUID,SYSCALLS.SETGID,SYSCALLS.GETUID,SYSCALLS.GETGID,SYSCALLS.SETSID],
    [0x0b,0x0c,0x0d,0x0e,0x0f]);
});

test("shadow and directory search permissions resist .. traversal",()=>{
  const store=new InodeFS(64),root=store.readInode(store.rootId);
  const etcId=store.allocateInode(INODE_TYPES.DIRECTORY,0,0,0o700);
  store.dirAddEntry(root,"etc",etcId);
  const etc=store.readInode(etcId);
  const shadowId=store.allocateInode(INODE_TYPES.REGULAR,0,0,0o600);
  store.dirAddEntry(etc,"shadow",shadowId);
  store.writeData(store.readInode(shadowId),enc.encode("root:secret"));
  const guest=new VFSKernel(store,{uid:1000,gid:100}),machine=cpu();
  const direct=put(machine,0,"/etc/shadow");
  assert.equal(guest.sysOpen(0,direct,OPEN_FLAGS.O_RDONLY,machine).D,-ERRNO.EACCES);
  const bypass=put(machine,64,"/etc/../etc/shadow");
  assert.equal(guest.sysOpen(64,bypass,OPEN_FLAGS.O_RDONLY,machine).D,-ERRNO.EACCES);
});

test("permission changes affect retained descriptors and setuid bits are rejected",()=>{
  const store=new InodeFS(64),root=store.readInode(store.rootId);
  const id=store.allocateInode(INODE_TYPES.REGULAR,1000,100,0o600);
  store.dirAddEntry(root,"owned",id);
  store.writeData(store.readInode(id),enc.encode("private"));
  const identity={uid:1000,gid:100,euid:1000,egid:100};
  const vfs=new VFSKernel(store,identity),machine=cpu(),len=put(machine,0,"owned");
  const opened=vfs.sysOpen(0,len,OPEN_FLAGS.O_RDONLY,machine);
  assert.equal(opened.D,0);
  identity.euid=2000;identity.egid=200;vfs.setCredentials(identity);
  assert.equal(vfs.sysRead(opened.A,100,7,machine).D,-ERRNO.EACCES);
  identity.euid=1000;identity.egid=100;vfs.setCredentials(identity);
  assert.equal(vfs.sysChmod(0,len,0o4755,machine).D,-ERRNO.EINVAL);
});

test("hard-link, rename, saved-cwd and open-fd permission bypasses are rejected",()=>{
  const store=new InodeFS(128),root=store.readInode(store.rootId);
  const privateId=store.allocateInode(INODE_TYPES.DIRECTORY,0,0,0o755);
  store.dirAddEntry(root,"private",privateId);
  const privateDir=store.readInode(privateId);
  const secretId=addFile(store,privateDir,"secret","classified",0o600,0,0);
  const identity={uid:1000,gid:100,euid:1000,egid:100};
  const guest=new VFSKernel(store,identity),guestCpu=cpu();
  const rootVfs=new VFSKernel(store,{uid:0,gid:0}),rootCpu=cpu();

  // Enter while searchable, then revoke search permission. A retained cwd
  // inode must be refreshed rather than retaining stale mode bits.
  let length=put(guestCpu,0,"/private");
  assert.equal(guest.sysChdir(0,length,guestCpu).D,0);
  length=put(rootCpu,0,"/private");
  assert.equal(rootVfs.sysChmod(0,length,0o700,rootCpu).D,0);
  length=put(guestCpu,64,"secret");
  assert.equal(guest.sysOpen(64,length,OPEN_FLAGS.O_RDONLY,guestCpu).D,-ERRNO.EACCES);

  // Restore search, open as owner/root, then revoke inode mode. Reads through
  // the retained descriptor are checked against the fresh inode.
  rootVfs.sysChmod(0,8,0o755,rootCpu);
  const rootSecret=put(rootCpu,64,"/private/secret");
  const fd=rootVfs.sysOpen(64,rootSecret,OPEN_FLAGS.O_RDONLY,rootCpu).A;
  rootVfs.sysChmod(64,rootSecret,0,rootCpu);
  rootVfs.setCredentials({uid:1000,gid:100,euid:1000,egid:100});
  assert.equal(rootVfs.sysRead(fd,200,4,rootCpu).D,-ERRNO.EACCES);

  // A guest cannot manufacture an alias or move a root-owned file through a
  // directory it cannot write.
  const oldPath="/private/secret",newPath="/secret-link";
  const oldLen=put(guestCpu,128,oldPath),newLen=put(guestCpu,128+oldLen,newPath);
  assert.equal(guest.sysLink(128,oldLen,128+oldLen,newLen,guestCpu).D,-ERRNO.EACCES);
  assert.equal(guest.sysRename(128,oldLen,128+oldLen,newLen,guestCpu).D,-ERRNO.EACCES);
  assert.equal(store.readInode(secretId).nlink,1);
});

test("stage 5 database defaults and installer ownership are Unix-like",()=>{
  const base=new URL("../system/unix/",import.meta.url);
  const manifest=JSON.parse(fs.readFileSync(new URL("install-manifest.json",base),"utf8"));
  const shadow=manifest.files.find(row=>row.path==="/etc/shadow");
  const guest=manifest.directories.find(row=>row.path==="/home/guest");
  assert.deepEqual([shadow.mode,shadow.uid,shadow.gid],["0600",0,0]);
  assert.deepEqual([guest.mode,guest.uid,guest.gid],["0750",1000,100]);
  assert.match(fs.readFileSync(new URL("etc/passwd",base),"utf8"),
    /^guest:x:1000:100:.*:\/home\/guest:\/bin\/sh$/m);
});

test("stage 5/6 programs are separate protected PCVM binaries",()=>{
  const assembler=new Assembler(),base=new URL("../system/unix/build/",import.meta.url);
  for(const name of ["login.bin","passwd.bin","logger.bin","init.bin"]){
    const binary=new Uint8Array(fs.readFileSync(new URL(name,base)));
    const decoded=assembler.decodeBinary(binary);
    assert.ok(decoded.length>0,`${name} is non-empty`);
    assert.equal(binary[5]&1,1,`${name} is PCVM v3 protected`);
  }
});

test("init parser and restart/recovery policy are implemented in Assembly",()=>{
  const source=fs.readFileSync(
    new URL("../system/unix/init/init.asm",import.meta.url),"utf8");
  assert.match(source,/init_validate_config:/);
  assert.match(source,/init_reap_loop:/);
  assert.match(source,/init_recovery:/);
  assert.match(source,/LOAD_D 5[\s\S]*CMP_A_D/);
  assert.doesNotMatch(source,/KCALL_HOST|FS_READ|PROC_EXEC/);
  const config=fs.readFileSync(
    new URL("../system/unix/etc/init.conf",import.meta.url),"utf8");
  assert.match(config,/\[service logger\][\s\S]*restart=always/);
  assert.match(config,/\[service login\][\s\S]*tty=console/);
});

function runUserdb(source){
  const compiler=new AssemblyCompiler(),assembler=new Assembler();
  const wrapper=compiler.compile(source,"userdb-test.asm");
  const library=compiler.compile(fs.readFileSync(
    new URL("../system/unix/lib/userdb.asm",import.meta.url),"utf8"),"userdb.asm");
  const binary=new Linker(assembler).link([wrapper,library],{entry:"main"});
  const output=[];
  new CPU(65536,value=>output.push(Number(value))).run(assembler.decodeBinary(binary),200000);
  return output;
}
function gameHash(password,salt){
  const bytes=new TextEncoder(),word=new Uint8Array(4),view=new DataView(word.buffer);
  const fnv=data=>{
    let value=0x811c9dc5;
    for(const byte of data)value=Math.imul((value^byte)>>>0,0x01000193)>>>0;
    return value;
  };
  let value=fnv(bytes.encode(salt+password));
  for(let round=0;round<1024;round++){
    view.setUint32(0,value,true);value=fnv(word);
  }
  return value|0;
}

test("Assembly password hash uses salt, 1024 rounds and fixed-work compare",()=>{
  const output=runUserdb(`
    .protected
    .export main
    .import password_hash
    .import password_compare_constant
    main:
    LOAD_B password
    LOAD_C 5
    LOAD_D salt
    CALL password_hash
    PRINT_A
    LOAD_B equal_a
    LOAD_C equal_b
    LOAD_D 4
    CALL password_compare_constant
    PRINT_A
    LOAD_B equal_a
    LOAD_C unequal
    LOAD_D 4
    CALL password_compare_constant
    PRINT_A
    HALT
    .org 13000
    password: .string "guest"
    salt: .string "guestslt"
    equal_a: .string "same"
    equal_b: .string "same"
    unequal: .string "xxxx"
  `);
  assert.deepEqual(output,[gameHash("guest","guestslt"),1,0]);
});

test("Assembly userdb parser finds complete names and extracts fields",()=>{
  const output=runUserdb(`
    .protected
    .export main
    .import userdb_find
    .import userdb_field
    main:
    LOAD_A 5
    LOAD_B database
    LOAD_C 69
    LOAD_D wanted
    CALL userdb_find
    PRINT_A
    MOV_B_A
    LOAD_C 40
    LOAD_D 2
    CALL userdb_field
    MOV_B_A
    STR_TO_INT
    PRINT_A
    HALT
    .org 13200
    wanted: .string "guest"
    database: .string "root:x:0:0:root:/root:/bin/sh\\nguest:x:1000:100:Guest:/home/guest:/bin/sh\\n"
  `);
  assert.equal(output[0]>=0,true);
  assert.equal(output[1],1000);
});

test("Assembly userdb parser rejects partial and malformed account names",()=>{
  const output=runUserdb(`
    .protected
    .export main
    .import userdb_find
    main:
    LOAD_A 5
    LOAD_B malformed
    LOAD_C 24
    LOAD_D wanted
    CALL userdb_find
    PRINT_A
    LOAD_A 5
    LOAD_B partial
    LOAD_C 17
    LOAD_D wanted
    CALL userdb_find
    PRINT_A
    HALT
    .org 13400
    wanted: .string "guest"
    malformed: .string "guest-without-separator\\n"
    partial: .string "guest2:x:1001:100"
  `);
  assert.deepEqual(output,[-1,-1]);
});

function addFile(store,parent,name,data,mode=0o644,uid=0,gid=0){
  const id=store.allocateInode(INODE_TYPES.REGULAR,uid,gid,mode);
  store.dirAddEntry(parent,name,id);
  store.writeData(store.readInode(id),enc.encode(data));
  return id;
}

test("login.bin authenticates guest, sets environment/credentials and spawns passwd shell",()=>{
  const store=new InodeFS(128),root=store.readInode(store.rootId);
  const etcId=store.allocateInode(INODE_TYPES.DIRECTORY,0,0,0o755);
  store.dirAddEntry(root,"etc",etcId);
  const etc=store.readInode(etcId);
  addFile(store,etc,"passwd",
    "root:x:0:0:root:/root:/bin/sh\nguest:x:1000:100:Guest:/home/guest:/bin/sh\n");
  addFile(store,etc,"shadow",
    "; generated\nguest:0x8bd5f861:guestslt\n",0o600);
  const identity={uid:0,gid:0,euid:0,egid:0},vfs=new VFSKernel(store,identity);
  const terminal=new ComputerTerminal();
  terminal.lineQueue.push("guest","guest");
  const env={},spawned=[];
  const system={
    vfs,
    setgid(value){identity.gid=value;identity.egid=value;vfs.setCredentials(identity);return true;},
    setuid(value){identity.uid=value;identity.euid=value;vfs.setCredentials(identity);return true;},
    envSet(key,value){env[key]=value;return true;},
    procExec(name){spawned.push(name);return 2;},
    procWait(){return{pid:2,status:0};},
  };
  const assembler=new Assembler();
  const binary=new Uint8Array(fs.readFileSync(
    new URL("../system/unix/build/login.bin",import.meta.url)));
  const machine=new CPU(65536,()=>{},terminal,system);
  machine.run(assembler.decodeBinary(binary),500000);
  assert.deepEqual(spawned,["/bin/sh"],terminal.lines.join("|"));
  assert.deepEqual(env,{USER:"guest",HOME:"/home/guest",SHELL:"/bin/sh"});
  assert.deepEqual([identity.euid,identity.egid],[1000,100]);
});

test("passwd.bin verifies old password and atomically replaces root-owned shadow",()=>{
  const store=new InodeFS(128),root=store.readInode(store.rootId);
  const etcId=store.allocateInode(INODE_TYPES.DIRECTORY,0,0,0o755);
  store.dirAddEntry(root,"etc",etcId);
  const etc=store.readInode(etcId);
  addFile(store,etc,"shadow","guest:0x8bd5f861:guestslt\n",0o600);
  const identity={uid:0,gid:0,euid:0,egid:0},vfs=new VFSKernel(store,identity);
  const terminal=new ComputerTerminal();
  terminal.lineQueue.push("guest","guest","newsecret");
  const assembler=new Assembler();
  const binary=new Uint8Array(fs.readFileSync(
    new URL("../system/unix/build/passwd.bin",import.meta.url)));
  const passwdCpu=new CPU(65536,()=>{},terminal,{vfs,uid:()=>0});
  passwdCpu.run(assembler.decodeBinary(binary),500000);
  const resolved=store.resolvePath(root,"/etc/shadow",0,0);
  const content=new TextDecoder().decode(store.readData(resolved.inode));
  const expected=(gameHash("newsecret","guestslt")>>>0).toString(16).padStart(8,"0");
  const temporary=store.resolvePath(root,"/etc/shadow.new",0,0).inode;
  assert.equal(content,`guest:0x${expected}:guestslt\n`,terminal.lines.join("|"));
  assert.deepEqual([resolved.inode.mode,resolved.inode.uid,resolved.inode.gid],
    [0o600,0,0]);
  assert.equal(store.resolvePath(root,"/etc/shadow.new",0,0).inode,null);
});

function runInit(config,{wait=()=>null,maxSteps=50000,failPaths=[]}={}){
  const store=new InodeFS(128),root=store.readInode(store.rootId);
  if(config!==null){
    const etcId=store.allocateInode(INODE_TYPES.DIRECTORY,0,0,0o755);
    store.dirAddEntry(root,"etc",etcId);
    addFile(store,store.readInode(etcId),"init.conf",config);
  }
  const vfs=new VFSKernel(store,{uid:0,gid:0}),spawned=[],credentials=[];
  let pid=1;
  const system={
    vfs,
    procExec(path,owner){
      spawned.push(path);credentials.push(owner);
      return failPaths.includes(path)?-1:++pid;
    },
    procWait(){return wait({spawned,pid});},
    procExit(){return true;},
  };
  const assembler=new Assembler(),terminal=new ComputerTerminal();
  const binary=new Uint8Array(fs.readFileSync(
    new URL("../system/unix/build/init.bin",import.meta.url)));
  const cpu=new CPU(65536,()=>{},terminal,system);
  cpu.run(assembler.decodeBinary(binary),maxSteps,true,{preempt:true});
  return{spawned,credentials,terminal,cpu};
}

test("init.bin parses service paths from config instead of hard-coded JS paths",()=>{
  const config=fs.readFileSync(
    new URL("../system/unix/etc/init.conf",import.meta.url),"utf8");
  const result=runInit(config);
  assert.deepEqual(result.spawned.slice(0,2),
    ["/sbin/logger.bin","/bin/login.bin"],result.terminal.lines.join("|"));
});

test("init.bin resolves configured root and guest/users credentials",()=>{
  const guest=runInit(`[service guest-worker]
exec=/bin/guest-worker.bin
restart=never
tty=none
user=guest
group=users
`);
  assert.deepEqual(guest.credentials[0],{uid:1000,gid:100});
  const invalid=runInit(`[service bad]
exec=/bin/bad.bin
restart=never
tty=none
user=unknown
group=root
`);
  assert.deepEqual(invalid.spawned,["/bin/sh.bin"]);
});

test("init.bin enters recovery for missing and malformed configuration",()=>{
  assert.deepEqual(runInit(null).spawned,["/bin/sh.bin"]);
  const malformed="[service broken]\nexec=/missing.bin\nrestart=sometimes\n";
  assert.deepEqual(runInit(malformed).spawned,["/bin/sh.bin"]);
  assert.deepEqual(runInit(oneService("never"),{
    failPaths:["/sbin/worker.bin"]}).spawned,
    ["/sbin/worker.bin","/bin/sh.bin"]);
});

const oneService=policy=>`[service worker]
exec=/sbin/worker.bin
restart=${policy}
tty=none
user=root
group=root
`;
function oneExit(status){
  let delivered=false;
  return({pid})=>{
    if(delivered)return null;
    delivered=true;return{pid,status};
  };
}

test("init.bin implements never/on-failure/always restart policies",()=>{
  assert.deepEqual(runInit(oneService("never"),{wait:oneExit(1)}).spawned,
    ["/sbin/worker.bin"]);
  assert.deepEqual(runInit(oneService("on-failure"),{wait:oneExit(0)}).spawned,
    ["/sbin/worker.bin"]);
  assert.deepEqual(runInit(oneService("on-failure"),{wait:oneExit(1)}).spawned,
    ["/sbin/worker.bin","/sbin/worker.bin"]);
  assert.deepEqual(runInit(oneService("always"),{wait:oneExit(0)}).spawned,
    ["/sbin/worker.bin","/sbin/worker.bin"]);
});

test("init.bin rate-limits crash loops and handles shutdown event",()=>{
  const crashing=runInit(oneService("always"),{
    wait:({pid})=>({pid,status:1}),maxSteps:200000});
  assert.equal(crashing.spawned.at(-1),"/bin/sh.bin");
  assert.ok(crashing.spawned.filter(path=>path==="/sbin/worker.bin").length<=5);
  const shutdown=runInit(oneService("always"),{
    wait:()=>({pid:-2,status:0}),maxSteps:50000});
  assert.deepEqual(shutdown.spawned,["/sbin/worker.bin"]);
  assert.match(shutdown.terminal.lines.join("\n"),/shutdown clean/);
});
