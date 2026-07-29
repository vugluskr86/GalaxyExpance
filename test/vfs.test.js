import test from "node:test";
import assert from "node:assert/strict";
import {
  InodeFS, VFSKernel, ProcessFDTable, ErrnoError
} from "../src/game/vfs.js";
import {
  ABI_LIMITS,ERRNO,INODE_TYPES,OPEN_FLAGS,SEEK_WHENCE,
  STAT_LAYOUT,DIRENT_LAYOUT
} from "../src/game/protected-mode.js";
import { Assembler, CPU } from "../src/game/cpu.js";

const textEncoder=new TextEncoder();
let cpuCounter=0;
function makeCPU(bytes=2048){
  const assembler=new Assembler(),cpu=new CPU(bytes);
  cpu.configureProtectedMode({mode:"kernel",ubase:256,ulimit:bytes-256,ksp:bytes-64,ivt:64});
  for(let i=0;i<64;i++)cpu.view.setUint32(64+i*4,999,true);
  cpu.enterUserMode(0,bytes-256);
  return cpu;
}

test("InodeFS creates root directory and serializes correctly",()=>{
  const fs=new InodeFS(32);
  const root=fs.readInode(fs.rootId);
  assert.ok(root,"root inode exists");
  assert.equal(root.type,INODE_TYPES.DIRECTORY);
  assert.equal(root.uid,0);
  assert.equal(root.gid,0);
  assert.equal(root.mode,0o755);

  const image=fs.serialize();
  assert.equal(image.length,32*512);
  assert.deepEqual(Array.from(image.slice(0,4)),[0x50,0x43,0x46,0x53]);
  assert.equal(image[4],2);

  const fs2=InodeFS.deserialize(image);
  const root2=fs2.readInode(fs.rootId);
  assert.ok(root2);
  assert.equal(root2.type,INODE_TYPES.DIRECTORY);
  assert.equal(root2.mode,0o755);
});

test("InodeFS creates files and directories",()=>{
  const fs=new InodeFS(32);
  const root=fs.readInode(fs.rootId);
  const fileId=fs.allocateInode(INODE_TYPES.REGULAR,0,0,0o644);
  fs.dirAddEntry(root,"hello.txt",fileId);
  fs.writeData(fs.readInode(fileId),textEncoder.encode("HELLO WORLD"));

  assert.equal(fs.dirLookup(root,"hello.txt"),fileId);
  const file=fs.readInode(fileId);
  assert.equal(file.size,11);
  assert.deepEqual(fs.readData(file),textEncoder.encode("HELLO WORLD"));

  const dirId=fs.allocateInode(INODE_TYPES.DIRECTORY,0,0,0o755);
  fs.dirAddEntry(root,"subdir",dirId);
  const sub=fs.readInode(dirId);
  assert.equal(sub.type,INODE_TYPES.DIRECTORY);

  const entries=fs.readDirEntries(root);
  assert.equal(entries.length,2);
  assert.deepEqual(entries.map(e=>e.name).sort(),["hello.txt","subdir"]);
});

test("InodeFS resolves absolute and relative paths",()=>{
  const fs=new InodeFS(32);
  const root=fs.readInode(fs.rootId);
  const dirId=fs.allocateInode(INODE_TYPES.DIRECTORY,0,0,0o755);
  fs.dirAddEntry(root,"dir",dirId);
  const dir=fs.readInode(dirId);
  const fileId=fs.allocateInode(INODE_TYPES.REGULAR,0,0,0o644);
  fs.dirAddEntry(dir,"file",fileId);
  fs.writeData(fs.readInode(fileId),textEncoder.encode("DATA"));

  // absolute
  const r=fs.resolvePath(root,"/dir/file");
  assert.ok(r.inode);
  assert.equal(r.inode.id,fileId);
  assert.equal(r.leafName,"file");

  // root itself
  const r2=fs.resolvePath(root,"/");
  assert.ok(r2.inode);
  assert.equal(r2.inode.id,fs.rootId);

  // relative
  const r3=fs.resolvePath(dir,"file");
  assert.ok(r3.inode);
  assert.equal(r3.inode.id,fileId);

  // parent reference
  const r4=fs.resolvePath(dir,"..");
  assert.ok(r4.inode);
  assert.equal(r4.inode.id,fs.rootId);
});

test("InodeFS path resolution throws ENOENT/ENOTDIR/EACCES",()=>{
  const fs=new InodeFS(32);
  const root=fs.readInode(fs.rootId);
  const fileId=fs.allocateInode(INODE_TYPES.REGULAR,0,0,0o644);
  fs.dirAddEntry(root,"file",fileId);
  fs.writeData(fs.readInode(fileId),textEncoder.encode("ok"));

  // A missing final component is returned to callers such as open(O_CREAT).
  assert.equal(fs.resolvePath(root,"/nonexistent").inode,null);

  // ENOTDIR
  assert.throws(()=>fs.resolvePath(root,"/file/sub"),/ENOTDIR|not a directory/);

  // Root escape via ..
  assert.throws(()=>fs.resolvePath(root,"/../.."),/EACCES|outside root/);
});

test("InodeFS supports rename between directories",()=>{
  const fs=new InodeFS(32);
  const root=fs.readInode(fs.rootId);
  const dirA=fs.allocateInode(INODE_TYPES.DIRECTORY,0,0,0o755);
  const dirB=fs.allocateInode(INODE_TYPES.DIRECTORY,0,0,0o755);
  fs.dirAddEntry(root,"a",dirA);
  fs.dirAddEntry(root,"b",dirB);
  const fileId=fs.allocateInode(INODE_TYPES.REGULAR,0,0,0o644);
  fs.dirAddEntry(fs.readInode(dirA),"x",fileId);
  fs.writeData(fs.readInode(fileId),textEncoder.encode("MOVED"));

  // rename /a/x → /b/y
  const oldEntries=fs.readDirEntries(fs.readInode(dirA));
  assert.ok(oldEntries.some(e=>e.name==="x"));
  const oldId=fs.dirRemoveEntry(fs.readInode(dirA),"x");
  fs.dirAddEntry(fs.readInode(dirB),"y",oldId);

  assert.equal(fs.dirLookup(fs.readInode(dirA),"x"),null);
  assert.equal(fs.dirLookup(fs.readInode(dirB),"y"),fileId);
  assert.deepEqual(fs.readData(fs.readInode(fileId)),textEncoder.encode("MOVED"));
});

test("InodeFS serialization round-trip preserves tree",()=>{
  const fs=new InodeFS(64);
  const root=fs.readInode(fs.rootId);
  const sub=fs.allocateInode(INODE_TYPES.DIRECTORY,0,0,0o755);
  fs.dirAddEntry(root,"sub",sub);
  const f1=fs.allocateInode(INODE_TYPES.REGULAR,0,0,0o644);
  fs.dirAddEntry(fs.readInode(sub),"a.bin",f1);
  fs.writeData(fs.readInode(f1),textEncoder.encode("BINARY DATA"));
  const f2=fs.allocateInode(INODE_TYPES.REGULAR,0,0,0o600);
  fs.dirAddEntry(root,"secret",f2);
  fs.writeData(fs.readInode(f2),textEncoder.encode("SECRET"));

  const image=fs.serialize();
  const fs2=InodeFS.deserialize(image);

  const r2=fs2.readInode(fs2.rootId);
  const entries=fs2.readDirEntries(r2);
  assert.equal(entries.length,2);
  assert.equal(fs2.dirLookup(r2,"sub"),sub);
  assert.deepEqual(fs2.readData(fs2.readInode(f1)),textEncoder.encode("BINARY DATA"));
  assert.deepEqual(fs2.readData(fs2.readInode(f2)),textEncoder.encode("SECRET"));

  const resolved=fs2.resolvePath(r2,"/sub/a.bin");
  assert.ok(resolved.inode);
  assert.equal(resolved.inode.id,f1);
});

test("InodeFS corrupt image detection",()=>{
  const fs=new InodeFS(32);
  fs.writeData(fs.readInode(fs.rootId),textEncoder.encode("TEST"));
  const image=fs.serialize();

  // corrupt magic
  const bad=new Uint8Array(image);
  bad[0]=0;
  assert.throws(()=>InodeFS.deserialize(bad),/invalid PCFS magic/);

  // wrong block count
  const bad2=new Uint8Array(image.slice(0,image.length-512));
  assert.throws(()=>InodeFS.deserialize(bad2),/invalid PCFS image/);
});

test("VFSKernel open/read/write/close flows",()=>{
  const fs=new InodeFS(64);
  const vfs=new VFSKernel(fs);
  const cpu=makeCPU(4096);

  // create file via open O_CREAT
  const path="test.txt";
  const pathBytes=textEncoder.encode(path);
  cpu.bytes.set(pathBytes,cpu.r.UBASE+0);
  cpu.r.B=0;cpu.r.C=pathBytes.length;cpu.r.D=OPEN_FLAGS.O_RDWR|OPEN_FLAGS.O_CREAT;
  const openRes=vfs.sysOpen(cpu.r.B,cpu.r.C,cpu.r.D,cpu);
  assert.equal(openRes.D,ERRNO.OK);
  const fd=openRes.A;
  assert.ok(fd>=0,`fd=${fd}`);

  // write
  const data=textEncoder.encode("HELLO VFS");
  cpu.bytes.set(data,cpu.r.UBASE+100);
  cpu.r.A=fd;cpu.r.B=fd;cpu.r.C=100;cpu.r.D=data.length;
  // use B for fd
  const writeRes=vfs.sysWrite(fd,100,data.length,cpu);
  assert.equal(writeRes.D,ERRNO.OK);
  assert.equal(writeRes.A,data.length);

  // seek to beginning
  const seekRes=vfs.sysSeek(fd,0,SEEK_WHENCE.SEEK_SET,cpu);
  assert.equal(seekRes.D,ERRNO.OK);
  assert.equal(seekRes.A,0);

  // read
  cpu.r.B=fd;cpu.r.C=50;cpu.r.D=data.length;
  const readRes=vfs.sysRead(fd,50,data.length,cpu);
  assert.equal(readRes.D,ERRNO.OK);
  assert.equal(readRes.A,data.length);
  assert.deepEqual(cpu.bytes.slice(cpu.r.UBASE+50,cpu.r.UBASE+50+data.length),data);

  // stat
  const statRes=vfs.sysStat(0,pathBytes.length,200,cpu);
  assert.equal(statRes.D,ERRNO.OK);
  assert.equal(cpu.view.getUint32(cpu.r.UBASE+200+STAT_LAYOUT.SIZE,true),data.length);

  // close
  const closeRes=vfs.sysClose(fd,cpu);
  assert.equal(closeRes.D,ERRNO.OK);

  // EBADF after close
  const badRead=vfs.sysRead(fd,50,10,cpu);
  assert.equal(badRead.D,-ERRNO.EBADF);
});

test("VFSKernel mkdir, readdir",()=>{
  const fs=new InodeFS(64);
  const vfs=new VFSKernel(fs);
  const cpu=makeCPU(4096);

  const name="mydir";
  const bytes=textEncoder.encode(name);
  cpu.bytes.set(bytes,cpu.r.UBASE);
  cpu.r.B=0;cpu.r.C=bytes.length;cpu.r.D=0o755;
  const res=vfs.sysMkdir(cpu.r.B,cpu.r.C,cpu.r.D,cpu);
  assert.equal(res.D,ERRNO.OK);

  // duplicate
  const dup=vfs.sysMkdir(cpu.r.B,cpu.r.C,cpu.r.D,cpu);
  assert.equal(dup.D,-ERRNO.EEXIST);

  // open the directory
  cpu.r.B=0;cpu.r.C=bytes.length;cpu.r.D=OPEN_FLAGS.O_RDONLY;
  const openRes=vfs.sysOpen(cpu.r.B,cpu.r.C,cpu.r.D,cpu);
  assert.equal(openRes.D,ERRNO.OK);
  const fd=openRes.A;

  // An empty directory is EOF and therefore writes zero bytes.
  cpu.r.A=fd;cpu.r.B=fd;cpu.r.C=200;cpu.r.D=512;
  const readdirRes=vfs.sysReaddir(fd,200,512,cpu);
  assert.equal(readdirRes.D,ERRNO.OK);
  assert.equal(readdirRes.A,0);
});

test("VFSKernel getcwd and chdir",()=>{
  const fs=new InodeFS(64);
  const vfs=new VFSKernel(fs);
  const cpu=makeCPU(4096);

  // create directory
  const name="home";
  const bytes=textEncoder.encode(name);
  cpu.bytes.set(bytes,cpu.r.UBASE);
  cpu.r.B=0;cpu.r.C=bytes.length;cpu.r.D=0o755;
  vfs.sysMkdir(cpu.r.B,cpu.r.C,cpu.r.D,cpu);

  // chdir
  const chdirRes=vfs.sysChdir(0,bytes.length,cpu);
  assert.equal(chdirRes.D,ERRNO.OK);

  // getcwd должен вернуть /home
  cpu.r.B=300;cpu.r.C=64;
  const cwdRes=vfs.sysGetcwd(300,64,cpu);
  assert.equal(cwdRes.D,ERRNO.OK);
  const cwdPath=new TextDecoder().decode(cpu.bytes.slice(cpu.r.UBASE+300,cpu.r.UBASE+300+cwdRes.A));
  assert.equal(cwdPath,"/home");

  // create file in the new cwd
  const fname="note.txt";
  const fbytes=textEncoder.encode(fname);
  cpu.bytes.set(fbytes,cpu.r.UBASE+400);
  cpu.r.B=400;cpu.r.C=fbytes.length;cpu.r.D=OPEN_FLAGS.O_RDWR|OPEN_FLAGS.O_CREAT;
  const openRes=vfs.sysOpen(cpu.r.B,cpu.r.C,cpu.r.D,cpu);
  assert.equal(openRes.D,ERRNO.OK);

  // verify it's at /home/note.txt
  cpu.r.B=400;cpu.r.C=fbytes.length;
  const statRes=vfs.sysStat(400,fbytes.length,cpu.r.UBASE+500,cpu);
  assert.equal(statRes.D,ERRNO.OK);
});

test("VFSKernel permission checks (owner/group/other)",()=>{
  const fs=new InodeFS(64);
  // create file owned by uid=1000
  const root=fs.readInode(fs.rootId);
  const fileId=fs.allocateInode(INODE_TYPES.REGULAR,1000,1000,0o600);
  fs.dirAddEntry(root,"private",fileId);
  fs.writeData(fs.readInode(fileId),textEncoder.encode("X"));

  // open as root (uid=0) — allowed
  const vfsRoot=new VFSKernel(fs,{uid:0,gid:0});
  const cpu=makeCPU(4096);
  const name=textEncoder.encode("private");
  cpu.bytes.set(name,cpu.r.UBASE);
  cpu.r.B=0;cpu.r.C=7;cpu.r.D=OPEN_FLAGS.O_RDONLY;
  const rootOpen=vfsRoot.sysOpen(cpu.r.B,cpu.r.C,cpu.r.D,cpu);
  assert.equal(rootOpen.D,ERRNO.OK);

  // open as owner (uid=1000) — allowed
  const vfsOwner=new VFSKernel(fs,{uid:1000,gid:1000});
  const cpu2=makeCPU(4096);
  cpu2.bytes.set(name,cpu2.r.UBASE);
  cpu2.r.B=0;cpu2.r.C=7;cpu2.r.D=OPEN_FLAGS.O_RDONLY;
  const ownerOpen=vfsOwner.sysOpen(cpu2.r.B,cpu2.r.C,cpu2.r.D,cpu2);
  assert.equal(ownerOpen.D,ERRNO.OK);

  // open as other (uid=2000) — denied (mode 0o600)
  const vfsOther=new VFSKernel(fs,{uid:2000,gid:2000});
  const cpu3=makeCPU(4096);
  cpu3.bytes.set(name,cpu3.r.UBASE);
  cpu3.r.B=0;cpu3.r.C=7;cpu3.r.D=OPEN_FLAGS.O_RDONLY;
  const otherOpen=vfsOther.sysOpen(cpu3.r.B,cpu3.r.C,cpu3.r.D,cpu3);
  assert.equal(otherOpen.D,-ERRNO.EACCES);
});

test("VFSKernel chmod and chown",()=>{
  const fs=new InodeFS(64);
  const root=fs.readInode(fs.rootId);
  const fileId=fs.allocateInode(INODE_TYPES.REGULAR,0,0,0o644);
  fs.dirAddEntry(root,"mod",fileId);
  fs.writeData(fs.readInode(fileId),textEncoder.encode("ok"));
  const name=textEncoder.encode("mod");

  const cpu=makeCPU(4096);
  cpu.bytes.set(name,cpu.r.UBASE);
  cpu.r.B=0;cpu.r.C=3;

  // chmod to 0600
  const vfs=new VFSKernel(fs,{uid:0,gid:0});
  const chmodRes=vfs.sysChmod(0,3,0o600,cpu);
  assert.equal(chmodRes.D,ERRNO.OK);
  const inode=fs.readInode(fileId);
  assert.equal(inode.mode,0o600);

  // chown to uid=500, gid=500
  cpu.r.B=0;cpu.r.C=3;cpu.r.D=(500<<16)|500;
  // bug: sysChown takes (ptr,len,uid,gid,cpu) but we pass D as uid<<16|gid
  const chownRes=vfs.sysChown(0,3,500,500,cpu);
  assert.equal(chownRes.D,ERRNO.OK);
  const inode2=fs.readInode(fileId);
  assert.equal(inode2.uid,500);
  assert.equal(inode2.gid,500);

  // non-root chown denied
  const vfsUser=new VFSKernel(fs,{uid:1000,gid:1000});
  const denied=vfsUser.sysChown(0,3,0,0,cpu);
  assert.equal(denied.D,-ERRNO.EPERM);
});

test("VFSKernel unlink and rename throw ENOTEMPTY",()=>{
  const fs=new InodeFS(64);
  const root=fs.readInode(fs.rootId);
  const dirId=fs.allocateInode(INODE_TYPES.DIRECTORY,0,0,0o755);
  fs.dirAddEntry(root,"mydir",dirId);
  const fileId=fs.allocateInode(INODE_TYPES.REGULAR,0,0,0o644);
  fs.dirAddEntry(fs.readInode(dirId),"child",fileId);

  const cpu=makeCPU(4096);
  const name=textEncoder.encode("mydir");
  cpu.bytes.set(name,cpu.r.UBASE);
  const vfs=new VFSKernel(fs);

  // unlink non-empty dir
  const unlinkRes=vfs.sysUnlink(0,5,cpu);
  assert.equal(unlinkRes.D,-39); // ENOTEMPTY

  // rename fails on non-existent old path
  cpu.bytes.set(textEncoder.encode("nope"),cpu.r.UBASE+100);
  cpu.r.B=100;cpu.r.C=4;cpu.r.D=0;
  // TODO: sysRename needs both paths, for now test ENOENT
  const renFail=vfs.sysRename(100,4,0,5,cpu);
  assert.equal(renFail.D,-ERRNO.ENOENT);
});

test("VFSKernel dup shares the open-file-description offset",()=>{
  const fs=new InodeFS(64);
  const vfs=new VFSKernel(fs);
  const cpu=makeCPU(4096);

  const name=textEncoder.encode("dup.txt");
  cpu.bytes.set(name,cpu.r.UBASE);
  cpu.r.B=0;cpu.r.C=7;cpu.r.D=OPEN_FLAGS.O_RDWR|OPEN_FLAGS.O_CREAT;
  const openRes=vfs.sysOpen(0,7,cpu.r.D,cpu);
  assert.equal(openRes.D,ERRNO.OK);
  const fd1=openRes.A;

  // write 10 bytes
  const data=textEncoder.encode("0123456789");
  cpu.bytes.set(data,cpu.r.UBASE+200);
  vfs.sysWrite(fd1,200,10,cpu);

  // dup to fd2
  cpu.r.A=fd1;cpu.r.B=fd1;
  const dupRes=vfs.sysDup(fd1,cpu);
  assert.equal(dupRes.D,ERRNO.OK);
  const fd2=dupRes.A;
  assert.notEqual(fd2,fd1);

  // seek fd1 to 5
  vfs.sysSeek(fd1,5,SEEK_WHENCE.SEEK_SET,cpu);
  // dup shares the same open-file description, including its offset.
  cpu.r.A=fd2;cpu.r.B=fd2;cpu.r.C=400;cpu.r.D=3;
  const readRes=vfs.sysRead(fd2,400,3,cpu);
  assert.equal(readRes.D,ERRNO.OK);
  assert.equal(readRes.A,3);
  assert.deepEqual(cpu.bytes.slice(cpu.r.UBASE+400,cpu.r.UBASE+403),
    textEncoder.encode("567"));

  // Closing one duplicate invalidates that fd without closing the shared
  // open-file description still referenced by the other.
  vfs.sysClose(fd1,cpu);
  assert.equal(vfs.sysRead(fd1,400,1,cpu).D,-ERRNO.EBADF);
  vfs.sysClose(fd2,cpu);
  // EBADF after close
  assert.equal(vfs.sysRead(fd2,400,1,cpu).D,-ERRNO.EBADF);
});

test("VFS migration from flat ComputerMemory",()=>{
  const flatFiles=[
    {name:"hello.asm",code:"HALT"},
    {name:"os.bin",data:Uint8Array.of(0x50,0x43,0x56,0x4d,2,0,1,0,134)}
  ];
  const fs=new InodeFS(64);
  fs.importFlatFiles(flatFiles);
  const root=fs.readInode(fs.rootId);
  const entries=fs.readDirEntries(root);
  assert.equal(entries.length,2);

  const hello=fs.dirLookup(root,"hello.asm");
  assert.ok(hello);
  assert.deepEqual(fs.readData(fs.readInode(hello)),textEncoder.encode("HALT"));

  const osId=fs.dirLookup(root,"os.bin");
  assert.ok(osId);
  assert.deepEqual(fs.readData(fs.readInode(osId)),Uint8Array.of(0x50,0x43,0x56,0x4d,2,0,1,0,134));
});

test("VFSKernel invalid user pointer returns EFAULT",()=>{
  const fs=new InodeFS(64);
  const vfs=new VFSKernel(fs);
  const cpu=makeCPU(2048);

  // pass pointer beyond ULIMIT
  cpu.r.B=cpu.r.ULIMIT+1;cpu.r.C=10;cpu.r.D=0;
  const res=vfs.sysOpen(cpu.r.B,cpu.r.C,cpu.r.D,cpu);
  assert.equal(res.D,-ERRNO.EFAULT);
});

test("VFS enum structs match layout expectations",()=>{
  assert.equal(STAT_LAYOUT.bytes,56);
  assert.equal(STAT_LAYOUT.INO,0);
  assert.equal(STAT_LAYOUT.TYPE,4);
  assert.equal(STAT_LAYOUT.SIZE,20);
  assert.equal(STAT_LAYOUT.MODE,16);

  assert.equal(DIRENT_LAYOUT.bytes,268);
  assert.equal(DIRENT_LAYOUT.NAME,12);
  assert.equal(DIRENT_LAYOUT.NAME_LEN,8);

  assert.equal(OPEN_FLAGS.O_RDONLY,0);
  assert.equal(OPEN_FLAGS.O_WRONLY,1);
  assert.equal(OPEN_FLAGS.O_RDWR,2);
  assert.equal(OPEN_FLAGS.O_CREAT,4);
  assert.equal(OPEN_FLAGS.O_TRUNC,8);
  assert.equal(OPEN_FLAGS.O_APPEND,16);
});

test("VFSKernel rename overwrites existing target",()=>{
  const fs=new InodeFS(64);
  const root=fs.readInode(fs.rootId);
  const vfs=new VFSKernel(fs);
  const cpu=makeCPU(4096);

  // create /old.txt and /new.txt
  const f1=fs.allocateInode(INODE_TYPES.REGULAR,0,0,0o644);
  fs.dirAddEntry(root,"old.txt",f1);
  fs.writeData(fs.readInode(f1),textEncoder.encode("OLD"));
  const f2=fs.allocateInode(INODE_TYPES.REGULAR,0,0,0o644);
  fs.dirAddEntry(root,"new.txt",f2);
  fs.writeData(fs.readInode(f2),textEncoder.encode("NEW"));

  // rename /old.txt → /new.txt (overwrite)
  const oldBytes=textEncoder.encode("old.txt");
  const newBytes=textEncoder.encode("new.txt");
  cpu.bytes.set(oldBytes,cpu.r.UBASE);
  cpu.bytes.set(newBytes,cpu.r.UBASE+100);
  const renRes=vfs.sysRename(0,7,100,7,cpu);
  assert.equal(renRes.D,ERRNO.OK);

  assert.equal(fs.dirLookup(root,"old.txt"),null);
  const remaining=fs.dirLookup(root,"new.txt");
  assert.ok(remaining);
  assert.deepEqual(fs.readData(fs.readInode(remaining)),textEncoder.encode("OLD"));
});

test("PCFS v2 supports more than 64 inodes and reads compatible v1 images",()=>{
  const large=new InodeFS(1024),root=large.readInode(large.rootId);
  for(let index=0;index<100;index++){
    const id=large.allocateInode(INODE_TYPES.REGULAR,0,0,0o644);
    large.dirAddEntry(root,`f${index}`,id);
  }
  assert.equal(large.readDirEntries(large.readInode(large.rootId)).length,100);
  assert.ok(new DataView(large.serialize().buffer).getUint32(13,true)>8);

  // A small v2 image has the same implicit inode-table size as v1. Re-tag it
  // and refresh the v1 checksum to exercise the compatibility reader.
  const legacy=new InodeFS(32).serialize();
  legacy[4]=1;
  let hash=0x811c9dc5;
  for(let index=13;index<legacy.length;index++){
    // v1 has no inodeBlocks field; these bytes were reserved and must be zero.
    if(index<17)legacy[index]=0;
    hash^=legacy[index];
    hash=Math.imul(hash,0x01000193);
  }
  new DataView(legacy.buffer).setUint32(9,hash>>>0,true);
  assert.equal(InodeFS.deserialize(legacy).readInode(1).type,INODE_TYPES.DIRECTORY);
});

test("VFSKernel readdir advances the directory cursor",()=>{
  const fs=new InodeFS(64),kernel=new VFSKernel(fs),cpu=makeCPU(4096);
  const root=fs.readInode(fs.rootId);
  for(const name of ["a","b","c"]){
    const id=fs.allocateInode(INODE_TYPES.REGULAR,0,0,0o644);
    fs.dirAddEntry(root,name,id);
  }
  cpu.bytes.set(textEncoder.encode("/"),cpu.r.UBASE+100);
  const fd=kernel.sysOpen(100,1,0,cpu).A;
  assert.equal(kernel.sysReaddir(fd,200,DIRENT_LAYOUT.bytes,cpu).A,DIRENT_LAYOUT.bytes);
  const first=new TextDecoder().decode(cpu.bytes.subarray(
    cpu.r.UBASE+200+DIRENT_LAYOUT.NAME,cpu.r.UBASE+201+DIRENT_LAYOUT.NAME));
  assert.equal(kernel.sysReaddir(fd,500,DIRENT_LAYOUT.bytes,cpu).A,DIRENT_LAYOUT.bytes);
  const second=new TextDecoder().decode(cpu.bytes.subarray(
    cpu.r.UBASE+500+DIRENT_LAYOUT.NAME,cpu.r.UBASE+501+DIRENT_LAYOUT.NAME));
  assert.notEqual(first,second);
  assert.equal(kernel.sysReaddir(fd,800,DIRENT_LAYOUT.bytes,cpu).A,DIRENT_LAYOUT.bytes);
  assert.equal(kernel.sysReaddir(fd,1100,DIRENT_LAYOUT.bytes,cpu).A,0);
});

test("ProcessFDTable clone preserves cwd and shared open-file descriptions",()=>{
  const fs=new InodeFS(64),kernel=new VFSKernel(fs),cpu=makeCPU(4096);
  const root=fs.readInode(fs.rootId);
  const id=fs.allocateInode(INODE_TYPES.REGULAR,0,0,0o644);
  fs.dirAddEntry(root,"shared",id);
  fs.writeData(fs.readInode(id),textEncoder.encode("ab"));
  cpu.bytes.set(textEncoder.encode("/shared"),cpu.r.UBASE+100);
  const fd=kernel.sysOpen(100,7,0,cpu).A;
  const child=Object.assign(Object.create(Object.getPrototypeOf(cpu)),cpu,
    {_vfs:cpu._vfs.clone()});
  kernel.sysRead(fd,300,1,cpu);
  kernel.sysRead(fd,400,1,child);
  assert.equal(child._vfs.get(fd).offset,2);
});
