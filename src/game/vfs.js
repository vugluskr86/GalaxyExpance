/** Иерархическая inode-based файловая система для PixelOS.
 *  Stage 1: VFS с каталогами, fd, permission checks.
 *  Старый плоский ComputerMemory импортируется через migration path. */
import {
  ABI_LIMITS,ERRNO,INODE_TYPES,OPEN_FLAGS,SEEK_WHENCE,
  STAT_LAYOUT,DIRENT_LAYOUT
} from "./protected-mode.js";
import { CPUFault } from "./cpu.js";

const textEncoder=new TextEncoder(),textDecoder=new TextDecoder();

/* ================================================================
 *  Disk image format: PCFS v1
 *  magic "PCFS" (4 bytes), version u8, totalBlocks u32 LE, checksum u32 LE
 *  checksum = FNV-1a хеш всех bytes после checksum поля.
 *  Blocks: blockSize=512, block 0 — суперблок, block 1+ — inode/data.
 * ================================================================ */
const PCFS_MAGIC=[0x50,0x43,0x46,0x53]; // "PCFS"
const PCFS_VERSION=1;
const BLOCK_SIZE=512;
const SUPERBLOCK_BYTES=4+1+4+4;
const INODES_PER_BLOCK=Math.floor(BLOCK_SIZE/64);

function inodeTableBlocks(blockCount){
  // The inode table is a fixed region. Growing it after data was allocated
  // would make later inode slots overlap file contents.
  return Math.max(1,Math.min(8,Math.floor((blockCount-1)/4)));
}

function fnv1a32(bytes,start=0,length=bytes.length){
  let hash=0x811c9dc5;
  for(let i=start;i<start+length;i++){
    hash^=bytes[i];
    hash=Math.imul(hash,0x01000193);
  }
  return hash>>>0;
}

/** Inode on-disk layout: 64 bytes
 *  offset 0:  u32 id (0 = free slot)
 *  offset 4:  u32 type (0=REGULAR, 1=DIRECTORY, 2=DEVICE — on disk; INODE_TYPES from ABI)
 *  offset 8:  u32 uid
 *  offset 12: u32 gid
 *  offset 16: u32 mode
 *  offset 20: u32 size (bytes)
 *  offset 24: u32 nlink
 *  offset 28: i32 mtime_sec
 *  offset 32: i32 mtime_nsec
 *  offset 36: u32 dataBlock
 *  offset 40: u32 dataBlocks
 *  offset 44: u32 parentInode
 *  offset 48: u32 reserved[4] */
function diskType(abiType){return abiType;} // on-disk matches ABI (0=REGULAR,1=DIR,2=DEV)
function abiType(diskType){return diskType;}

function writeInode(view,at,inode){
  view.setUint32(at+0,inode.id,true);
  view.setUint32(at+4,inode.type,true);
  view.setUint32(at+8,inode.uid,true);
  view.setUint32(at+12,inode.gid,true);
  view.setUint32(at+16,inode.mode,true);
  view.setUint32(at+20,inode.size,true);
  view.setUint32(at+24,inode.nlink,true);
  view.setInt32(at+28,inode.mtimeSec,true);
  view.setInt32(at+32,inode.mtimeNsec,true);
  view.setUint32(at+36,inode.dataBlock||0,true);
  view.setUint32(at+40,inode.dataBlocks||0,true);
  view.setUint32(at+44,inode.parentInode||0,true);
  for(let i=0;i<4;i++)view.setUint32(at+48+i*4,0,true);
}

function readInode(view,at){
  return {
    id:view.getUint32(at+0,true),
    type:view.getUint32(at+4,true),
    uid:view.getUint32(at+8,true),
    gid:view.getUint32(at+12,true),
    mode:view.getUint32(at+16,true),
    size:view.getUint32(at+20,true),
    nlink:view.getUint32(at+24,true),
    mtimeSec:view.getInt32(at+28,true),
    mtimeNsec:view.getInt32(at+32,true),
    dataBlock:view.getUint32(at+36,true),
    dataBlocks:view.getUint32(at+40,true),
    parentInode:view.getUint32(at+44,true),
  };
}

function packDirEntry(name,inodeId){
  const nameBytes=textEncoder.encode(name);
  if(nameBytes.length>ABI_LIMITS.NAME_MAX)
    throw new Error(`имя файла слишком длинное: ${name}`);
  const entry=new Uint8Array(4+nameBytes.length+4);
  const view=new DataView(entry.buffer);
  view.setUint32(0,nameBytes.length,true);
  entry.set(nameBytes,4);
  view.setUint32(4+nameBytes.length,inodeId,true);
  return entry;
}

function unpackDirEntry(bytes,offset=0){
  if(offset+8>bytes.length)return null;
  const view=new DataView(bytes.buffer,bytes.byteOffset+offset,4);
  const nameLen=view.getUint32(0,true);
  if(offset+4+nameLen+4>bytes.length)return null;
  const name=textDecoder.decode(bytes.slice(offset+4,offset+4+nameLen));
  const inode=new DataView(bytes.buffer,bytes.byteOffset+offset+4+nameLen,4).getUint32(0,true);
  return {name,inode,nextOffset:offset+4+nameLen+4};
}

/* ================================================================
 *  InodeFS — иерархическая inode-based файловая система.
 * ================================================================ */
export class InodeFS {
  constructor(blockCount=256){
    this.blockSize=BLOCK_SIZE;
    this.blocks=Math.max(blockCount,3);
    this.buffer=new ArrayBuffer(this.blocks*BLOCK_SIZE);
    this.bytes=new Uint8Array(this.buffer);
    this.view=new DataView(this.buffer);
    this.nextInode=1;
    this.allocateSuperblock();
    this.rootId=this.allocateInode(INODE_TYPES.DIRECTORY,0,0,0o755);
  }

  serialize(){
    this.updateSuperblockChecksum();
    return new Uint8Array(this.bytes.slice(0,this.blocks*BLOCK_SIZE));
  }

  static deserialize(bytes){
    if(bytes.length<SUPERBLOCK_BYTES||bytes.length%BLOCK_SIZE!==0)
      throw new Error("invalid PCFS image: bad size");
    for(let i=0;i<4;i++)if(bytes[i]!==PCFS_MAGIC[i])
      throw new Error("invalid PCFS magic");
    if(bytes[4]!==PCFS_VERSION)
      throw new Error(`unsupported PCFS version ${bytes[4]}`);
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);
    const totalBlocks=view.getUint32(5,true);
    if(totalBlocks!==Math.floor(bytes.length/BLOCK_SIZE))
      throw new Error("invalid PCFS image: block count mismatch");
    const expectedChecksum=view.getUint32(9,true);
    const actualChecksum=fnv1a32(bytes,13,bytes.length-13);
    if(expectedChecksum!==actualChecksum)
      throw new Error("invalid PCFS image: checksum mismatch");

    // Create FS without constructor side effects (no superblock re-write)
    const fs=Object.create(InodeFS.prototype);
    fs.blockSize=BLOCK_SIZE;fs.blocks=totalBlocks;
    fs.buffer=new ArrayBuffer(totalBlocks*BLOCK_SIZE);
    fs.bytes=new Uint8Array(fs.buffer);
    fs.view=new DataView(fs.buffer);
    fs.bytes.set(bytes);
    // find root inode
    let rootId=0,maxInode=0;
    const tableBlocks=inodeTableBlocks(totalBlocks);
    for(let block=1;block<=tableBlocks;block++){
      for(let i=0;i<INODES_PER_BLOCK;i++){
        const at=block*BLOCK_SIZE+i*64;
        const id=fs.view.getUint32(at,true);
        if(id>maxInode)maxInode=id;
        if(rootId===0&&id>0&&
          fs.view.getUint32(at+4,true)===INODE_TYPES.DIRECTORY&&
          fs.view.getUint32(at+44,true)===0)rootId=id;
      }
    }
    if(rootId===0)throw new Error("invalid PCFS image: root inode missing");
    fs.rootId=rootId;
    fs.nextInode=maxInode+1;
    return fs;
  }

  allocateSuperblock(){
    this.bytes.set(PCFS_MAGIC,0);
    this.bytes[4]=PCFS_VERSION;
    this.view.setUint32(5,this.blocks,true);
    this.view.setUint32(9,0,true);
  }

  updateSuperblockChecksum(){
    const checksum=fnv1a32(this.bytes,13,this.blocks*BLOCK_SIZE-13);
    this.view.setUint32(9,checksum,true);
  }

  inodeTableBlock(inodeId){
    return 1+Math.floor((inodeId-1)/INODES_PER_BLOCK);
  }

  inodeOffset(inodeId){
    const block=this.inodeTableBlock(inodeId);
    return block*BLOCK_SIZE+((inodeId-1)%INODES_PER_BLOCK)*64;
  }

  readInode(id){
    if(id<=0||id>=this.nextInode)return null;
    const offset=this.inodeOffset(id);
    const slotId=this.view.getUint32(offset,true);
    if(slotId!==id)return null; // id mismatch = free/slot-reused
    return readInode(this.view,offset);
  }

  writeInode(id,inode){
    if(!inode||!inode.id||inode.id!==id)throw new Error(`inode id mismatch: ${inode?.id} vs ${id}`);
    const offset=this.inodeOffset(id);
    writeInode(this.view,offset,inode);
  }

  /** Allocate a free inode slot. Returns inode id. */
  allocateInode(type,uid,gid,mode){
    const maxInode=inodeTableBlocks(this.blocks)*INODES_PER_BLOCK;
    for(let id=1;id<=maxInode;id++){
      if(id>=this.nextInode)this.nextInode=id+1;
      const offset=this.inodeOffset(id);
      if(this.view.getUint32(offset,true)===0){ // free slot: id==0
        const now=Math.floor(Date.now()/1000);
        const inode={
          id,type,uid,gid,mode,size:0,nlink:1,
          mtimeSec:now,mtimeNsec:0,dataBlock:0,dataBlocks:0,parentInode:0
        };
        writeInode(this.view,offset,inode);
        return id;
      }
    }
    throw new Error("inode table exhausted");
  }

  freeInode(id){
    const inode=this.readInode(id);
    if(!inode)return false;
    if(inode.dataBlock){
      const end=inode.dataBlock+inode.dataBlocks;
      for(let block=inode.dataBlock;block<end;block++)
        this.bytes.fill(0,block*BLOCK_SIZE,(block+1)*BLOCK_SIZE);
    }
    const offset=this.inodeOffset(id);
    // mark free: set id=0
    this.view.setUint32(offset,0,true);
    return true;
  }

  allocateBlocks(count){
    if(count===0)return 0;
    const tableEnd=1+inodeTableBlocks(this.blocks);
    const used=new Set();
    for(let id=1;id<this.nextInode;id++){
      const inode=this.readInode(id);
      if(inode&&inode.dataBlock){
        for(let b=inode.dataBlock;b<inode.dataBlock+inode.dataBlocks;b++)
          used.add(b);
      }
    }
    for(let start=tableEnd;start+count<=this.blocks;start++){
      let free=true;
      for(let b=start;b<start+count;b++){
        if(used.has(b)||this.bytes[b*BLOCK_SIZE]!==0){free=false;break;}
      }
      if(free){return start;}
    }
    throw new Error("disk full");
  }

  storageInfo(){
    const tableBlocks=inodeTableBlocks(this.blocks),used=new Set();
    for(let id=1;id<this.nextInode;id++){
      const inode=this.readInode(id);
      if(!inode?.dataBlock)continue;
      for(let block=inode.dataBlock;block<inode.dataBlock+inode.dataBlocks;block++)
        used.add(block);
    }
    const dataBlocks=Math.max(0,this.blocks-1-tableBlocks);
    return {
      totalBytes:this.blocks*BLOCK_SIZE,
      freeBytes:Math.max(0,dataBlocks-used.size)*BLOCK_SIZE
    };
  }

  /* ---------- data I/O ---------- */
  readData(inode){
    const fresh=this.readInode(inode.id);
    if(!fresh||!fresh.dataBlock||fresh.size===0)return new Uint8Array(0);
    const start=fresh.dataBlock*BLOCK_SIZE;
    return new Uint8Array(this.bytes.slice(start,start+fresh.size));
  }

  writeData(inode,data,offset=0){
    let fresh=this.readInode(inode.id);
    if(!fresh){
      fresh=inode;
    }
    const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
    const newSize=Math.max(fresh.size,offset+bytes.length);
    const needBlocks=Math.ceil(newSize/BLOCK_SIZE);
    if(needBlocks>fresh.dataBlocks){
      const oldBlock=fresh.dataBlock,oldSize=fresh.size,oldCount=fresh.dataBlocks;
      const newBlock=this.allocateBlocks(needBlocks);
      if(oldBlock&&oldSize>0){
        this.bytes.copyWithin(newBlock*BLOCK_SIZE,oldBlock*BLOCK_SIZE,oldBlock*BLOCK_SIZE+oldSize);
      }
      if(oldBlock){
        for(let b=oldBlock;b<oldBlock+oldCount;b++)this.bytes.fill(0,b*BLOCK_SIZE,(b+1)*BLOCK_SIZE);
      }
      fresh.dataBlock=newBlock;
      fresh.dataBlocks=needBlocks;
    }
    this.bytes.set(bytes,fresh.dataBlock*BLOCK_SIZE+offset);
    fresh.size=newSize;
    fresh.mtimeSec=Math.floor(Date.now()/1000);
    fresh.mtimeNsec=0;
    this.writeInode(fresh.id,fresh);
  }

  truncateData(inode,size){
    if(size>inode.size)throw new Error("truncate expansion not supported");
    inode.size=size;
    const needBlocks=size===0?0:Math.ceil(size/BLOCK_SIZE);
    if(needBlocks<inode.dataBlocks){
      for(let b=inode.dataBlock+needBlocks;b<inode.dataBlock+inode.dataBlocks;b++)
        this.bytes.fill(0,b*BLOCK_SIZE,(b+1)*BLOCK_SIZE);
      inode.dataBlocks=needBlocks;
    }
    if(size===0)inode.dataBlock=0;
    inode.mtimeSec=Math.floor(Date.now()/1000);
    inode.mtimeNsec=0;
    this.writeInode(inode.id,inode);
  }

  /* ---------- directory operations ---------- */
  readDirEntries(inode){
    const fresh=this.readInode(inode.id)||inode;
    if(fresh.type!==INODE_TYPES.DIRECTORY)return [];
    const data=this.readData(fresh);
    const entries=[];
    let offset=0;
    while(offset<data.length){
      const e=unpackDirEntry(data,offset);
      if(!e)break;
      entries.push({name:e.name,inode:e.inode});
      offset=e.nextOffset;
    }
    return entries;
  }

  writeDirEntries(inode,entries){
    const parts=entries.map(({name,inode})=>packDirEntry(name,inode));
    const total=parts.reduce((sum,p)=>sum+p.length,0);
    const data=new Uint8Array(total);
    let offset=0;
    for(const part of parts){data.set(part,offset);offset+=part.length;}
    this.writeData(inode,data,0);
    const fresh=this.readInode(inode.id);
    if(fresh&&fresh.size>total)this.truncateData(fresh,total);
    // refresh the caller's inode reference after write
    Object.assign(inode,this.readInode(inode.id)||inode);
  }

  dirLookup(dirInode,name){
    const fresh=this.readInode(dirInode.id)||dirInode;
    const entries=this.readDirEntries(fresh);
    const found=entries.find(e=>e.name===name);
    return found?found.inode:null;
  }

  dirAddEntry(dirInode,name,childInodeId){
    const child=this.readInode(childInodeId);
    if(!child)throw errnoError(ERRNO.ENOENT,"child inode not found");
    const entries=this.readDirEntries(dirInode);
    if(entries.some(e=>e.name===name))
      throw errnoError(ERRNO.EEXIST,`${name} already exists`);
    entries.push({name,inode:childInodeId});
    this.writeDirEntries(dirInode,entries);
    child.parentInode=dirInode.id;
    this.writeInode(childInodeId,child);
  }

  dirRemoveEntry(dirInode,name){
    const entries=this.readDirEntries(dirInode);
    const idx=entries.findIndex(e=>e.name===name);
    if(idx<0)throw errnoError(ERRNO.ENOENT,`${name} does not exist`);
    const inodeId=entries[idx].inode;
    entries.splice(idx,1);
    this.writeDirEntries(dirInode,entries);
    return inodeId;
  }

  /* ---------- path resolution ---------- */
  resolvePath(cwdInode,path,uid=0,gid=0){
    if(typeof path!=="string"||path.length>ABI_LIMITS.PATH_MAX)
      throw errnoError(ERRNO.ENAMETOOLONG,"path too long");
    const absolute=path.startsWith("/");
    const components=path.split("/").filter(part=>part!==""&&part!==".");
    let current=absolute?this.readInode(this.rootId):(this.readInode(cwdInode.id)||cwdInode);
    if(components.length===0)return {inode:current,parent:null,leafName:""};

    for(let i=0;i<components.length;i++){
      const name=components[i];
      if(current.type!==INODE_TYPES.DIRECTORY)
        throw errnoError(ERRNO.ENOTDIR,`${name}: not a directory`);
      if(!hasAccess(current,uid,gid,1))
        throw errnoError(ERRNO.EACCES,`${name}: search permission denied`);
      if(name===".."){
        if(current.id===this.rootId)
          throw errnoError(ERRNO.EACCES,"outside root");
        current=this.readInode(current.parentInode);
        if(!current)throw errnoError(ERRNO.ENOENT,"parent inode not found");
        if(i===components.length-1)
          return {inode:current,parent:this.readInode(current.parentInode),leafName:".."};
        continue;
      }

      const childId=this.dirLookup(current,name);
      if(!childId){
        if(i===components.length-1)
          return {inode:null,parent:current,leafName:name};
        throw errnoError(ERRNO.ENOENT,`${name}: not found`);
      }

      const child=this.readInode(childId);
      if(!child)throw errnoError(ERRNO.ENOENT,`${name}: inode not found`);
      if(i===components.length-1)
        return {inode:child,parent:current,leafName:name};
      if(child.type!==INODE_TYPES.DIRECTORY)
        throw errnoError(ERRNO.ENOTDIR,`${name}: not a directory`);
      current=child;
    }
    return {inode:current,parent:null,leafName:""};
  }

  /* ---------- ABI struct marshalling ---------- */
  statToBuffer(inode,out,offset=0){
    const view=new DataView(out.buffer,out.byteOffset+offset,STAT_LAYOUT.bytes);
    view.setUint32(STAT_LAYOUT.INO,inode.id,true);
    view.setUint32(STAT_LAYOUT.TYPE,inode.type,true);
    view.setUint32(STAT_LAYOUT.UID,inode.uid,true);
    view.setUint32(STAT_LAYOUT.GID,inode.gid,true);
    view.setUint32(STAT_LAYOUT.MODE,inode.mode,true);
    view.setUint32(STAT_LAYOUT.SIZE,inode.size,true);
    view.setUint32(STAT_LAYOUT.NLINK,inode.nlink,true);
    view.setInt32(STAT_LAYOUT.MTIME_SEC,inode.mtimeSec,true);
    view.setInt32(STAT_LAYOUT.MTIME_NSEC,inode.mtimeNsec,true);
    view.setInt32(STAT_LAYOUT.CTIME_SEC,inode.mtimeSec,true);
    view.setInt32(STAT_LAYOUT.CTIME_NSEC,0,true);
    view.setUint32(STAT_LAYOUT.DEVICE,0,true);
    for(const pad of [STAT_LAYOUT.RESERVED0,STAT_LAYOUT.RESERVED1])
      view.setUint32(pad,0,true);
  }

  direntToBuffer(name,inode,out,offset=0){
    const nameBytes=textEncoder.encode(name);
    const nameLen=Math.min(nameBytes.length,ABI_LIMITS.NAME_MAX);
    // Clear DIRENT before writing
    for(let i=0;i<DIRENT_LAYOUT.bytes;i++)out[offset+i]=0;
    const view=new DataView(out.buffer,out.byteOffset+offset,DIRENT_LAYOUT.bytes);
    view.setUint32(DIRENT_LAYOUT.INO,inode.id,true);
    view.setUint32(DIRENT_LAYOUT.TYPE,inode.type,true);
    view.setUint32(DIRENT_LAYOUT.NAME_LEN,nameLen,true);
    for(let i=0;i<nameLen&&i<256;i++)out[offset+DIRENT_LAYOUT.NAME+i]=nameBytes[i];
  }

  /* ---------- migration ---------- */
  importFlatFiles(flatList){
    const root=this.readInode(this.rootId);
    if(!root)return;
    for(const file of flatList){
      if(file.name.includes("/"))continue;
      const inodeId=this.allocateInode(INODE_TYPES.REGULAR,0,0,0o644);
      let data;
      if(file.data)data=file.data;
      else if(file.code!==undefined)data=textEncoder.encode(file.code);
      else continue;
      this.writeData({id:inodeId,dataBlock:0,dataBlocks:0,size:0},data,0);
      this.dirAddEntry(root,file.name,inodeId);
    }
  }
}

/* ================================================================
 *  Per-process open file table
 * ================================================================ */

class FDesc {
  constructor(inodeId,flags){this.inodeId=inodeId;this.offset=0;this.flags=flags;this.refs=1;}
}

export class ProcessFDTable {
  constructor(fs,cwdInode){
    this.fs=fs;
    // stdin/stdout/stderr are device-owned reserved descriptors.
    this.fds=[{reserved:true},{reserved:true},{reserved:true}];
    this.cwd=cwdInode;
  }

  allocate(inodeId,flags){
    const fd=new FDesc(inodeId,flags);
    for(let i=0;i<this.fds.length;i++){
      if(!this.fds[i]){this.fds[i]=fd;return i;}
    }
    this.fds.push(fd);return this.fds.length-1;
  }
  get(fd){
    if(fd<0||fd>=this.fds.length||!this.fds[fd]||this.fds[fd].reserved)
      throw errnoError(ERRNO.EBADF,`bad fd ${fd}`);
    return this.fds[fd];
  }
  close(fd){
    const desc=this.get(fd);
    this.fds[fd]=null;
    desc.refs--;
  }
  dup(oldFd,newFd){
    const desc=this.get(oldFd);
    if(newFd!==undefined){
      if(newFd<0||newFd>=ABI_LIMITS.FD_MAX)throw errnoError(ERRNO.EINVAL,"fd out of range");
      if(newFd===oldFd)return newFd;
      if(this.fds[newFd]&&!this.fds[newFd].reserved)this.close(newFd);
      while(this.fds.length<=newFd)this.fds.push(null);
      desc.refs++;
      this.fds[newFd]=desc;return newFd;
    }
    for(let fd=3;fd<ABI_LIMITS.FD_MAX;fd++){
      if(!this.fds[fd]){
        desc.refs++;
        this.fds[fd]=desc;
        return fd;
      }
    }
    throw errnoError(ERRNO.EMFILE,"file descriptor table full");
  }
  closeAll(){
    for(let fd=0;fd<this.fds.length;fd++){
      if(this.fds[fd]&&!this.fds[fd].reserved)this.close(fd);
    }
  }
  clone(){
    const copy=new ProcessFDTable(this.fs,this.cwd);
    copy.fds=this.fds.map(desc=>{
      if(!desc||desc.reserved)return desc?{reserved:true}:null;
      desc.refs++;
      return desc;
    });
    return copy;
  }
}

/* ================================================================
 *  VFS Kernel Interface
 * ================================================================ */
export class VFSKernel {
  constructor(fs,processOwner={uid:0,gid:0}){
    this.fs=fs;
    this.owner=processOwner;
    this.uid=processOwner.euid??processOwner.uid??0;
    this.gid=processOwner.egid??processOwner.gid??0;
  }

  setCredentials(processOwner){
    this.owner=processOwner;
    this.uid=processOwner.euid??processOwner.uid??0;
    this.gid=processOwner.egid??processOwner.gid??0;
  }

  sysOpen(pathPtr,pathLen,flags,cpu){
    try{
      const path=readUserString(cpu,pathPtr,pathLen);
      if(path.length>ABI_LIMITS.PATH_MAX)return errnoResult(ERRNO.ENAMETOOLONG);
      const resolved=this.fs.resolvePath(this._cwdInode(cpu),path,this.uid,this.gid);
      if(!resolved.inode){
        if(!(flags&OPEN_FLAGS.O_CREAT))return errnoResult(ERRNO.ENOENT);
        return this._create(resolved,path,cpu,flags);
      }
      return this._open(resolved.inode,flags,cpu);
    }catch(e){return catchErrno(e);}
  }

  sysClose(fd,cpu){try{this._ft(cpu).close(fd);return okResult(0);}catch(e){return catchErrno(e);}}

  sysRead(fd,bufPtr,count,cpu){
    try{
      if(fd===0&&this._ft(cpu).fds[fd]?.reserved){
        const line=cpu.terminal?.readLine?.();
        if(line===null||line===undefined)return errnoResult(ERRNO.EAGAIN);
        const data=new TextEncoder().encode(line);
        const size=Math.min(data.length,Math.max(0,count));
        cpu.bytes.set(data.subarray(0,size),cpu.userRange(bufPtr,size,"write"));
        return okResult(size);
      }
      const desc=this._ft(cpu).get(fd);
      if((desc.flags&3)===OPEN_FLAGS.O_WRONLY)return errnoResult(ERRNO.EACCES);
      const inode=this.fs.readInode(desc.inodeId);
      if(!inode)return errnoResult(ERRNO.ENOENT);
      if(!hasReadAccess(inode,this.uid,this.gid))return errnoResult(ERRNO.EACCES);
      const data=this.fs.readData(inode);
      const avail=Math.min(Math.max(0,count),data.length-desc.offset);
      const readBytes=data.slice(desc.offset,desc.offset+avail);
      const userPtr=cpu.userRange(bufPtr,avail,"write");
      cpu.bytes.set(readBytes,userPtr);
      desc.offset+=avail;
      return okResult(avail);
    }catch(e){return catchErrno(e);}
  }

  sysWrite(fd,dataPtr,count,cpu){
    try{
      if((fd===1||fd===2)&&this._ft(cpu).fds[fd]?.reserved){
        const text=new TextDecoder().decode(
          cpu.bytes.subarray(cpu.userRange(dataPtr,count),cpu.userRange(dataPtr,count)+count));
        cpu.output(text);
        cpu.terminal?.print(text);
        return okResult(count);
      }
      const desc=this._ft(cpu).get(fd);
      if((desc.flags&3)===OPEN_FLAGS.O_RDONLY)return errnoResult(ERRNO.EACCES);
      const inode=this.fs.readInode(desc.inodeId);
      if(!inode)return errnoResult(ERRNO.ENOENT);
      const userPtr=cpu.userRange(dataPtr,count);
      const data=cpu.bytes.slice(userPtr,userPtr+count);
      if(desc.flags&OPEN_FLAGS.O_APPEND)desc.offset=inode.size;
      if(!hasWriteAccess(inode,this.uid,this.gid))return errnoResult(ERRNO.EACCES);
      this.fs.writeData(inode,data,desc.offset);
      desc.offset+=count;
      return okResult(count);
    }catch(e){return catchErrno(e);}
  }

  sysSeek(fd,offset,whence,cpu){
    try{
      const desc=this._ft(cpu).get(fd);
      const inode=this.fs.readInode(desc.inodeId);
      if(!inode)return errnoResult(ERRNO.ENOENT);
      let base;
      switch(whence){
        case SEEK_WHENCE.SEEK_SET:base=0;break;
        case SEEK_WHENCE.SEEK_CUR:base=desc.offset;break;
        case SEEK_WHENCE.SEEK_END:base=inode.size;break;
        default:return errnoResult(ERRNO.EINVAL);
      }
      desc.offset=Math.max(0,Math.min(base+offset,inode.size));
      return okResult(desc.offset);
    }catch(e){return catchErrno(e);}
  }

  sysStat(pathPtr,pathLen,bufPtr,cpu){
    try{
      const path=readUserString(cpu,pathPtr,pathLen);
      const resolved=this.fs.resolvePath(this._cwdInode(cpu),path,this.uid,this.gid);
      if(!resolved.inode)return errnoResult(ERRNO.ENOENT);
      return this._statInode(resolved.inode,bufPtr,cpu);
    }catch(e){return catchErrno(e);}
  }

  sysReaddir(fd,bufPtr,bufBytes,cpu){
    try{
      const desc=this._ft(cpu).get(fd);
      const inode=this.fs.readInode(desc.inodeId);
      if(!inode)return errnoResult(ERRNO.ENOENT);
      if(inode.type!==INODE_TYPES.DIRECTORY)return errnoResult(ERRNO.ENOTDIR);
      const entries=this.fs.readDirEntries(inode);
      const buf=cpu.userRange(bufPtr,bufBytes,"write");
      let wrote=0;
      let index=Math.max(0,desc.offset|0);
      for(;index<entries.length;index++){
        const entry=entries[index];
        const child=this.fs.readInode(entry.inode);
        if(!child)continue;
        if(wrote+DIRENT_LAYOUT.bytes>bufBytes)break;
        this.fs.direntToBuffer(entry.name,child,cpu.bytes,buf+wrote);
        wrote+=DIRENT_LAYOUT.bytes;
      }
      desc.offset=index;
      return okResult(wrote);
    }catch(e){return catchErrno(e);}
  }

  sysMkdir(pathPtr,pathLen,mode,cpu){
    try{
      const path=readUserString(cpu,pathPtr,pathLen);
      const resolved=this.fs.resolvePath(this._cwdInode(cpu),path,this.uid,this.gid);
      if(resolved.inode)return errnoResult(ERRNO.EEXIST);
      if(!resolved.parent)return errnoResult(ERRNO.EACCES);
      if(!hasWriteAccess(resolved.parent,this.uid,this.gid))return errnoResult(ERRNO.EACCES);
      const inodeId=this.fs.allocateInode(INODE_TYPES.DIRECTORY,this.uid,this.gid,mode||0o755);
      this.fs.dirAddEntry(resolved.parent,resolved.leafName||path,inodeId);
      return okResult(0);
    }catch(e){return catchErrno(e);}
  }

  sysUnlink(pathPtr,pathLen,cpu){
    try{
      const path=readUserString(cpu,pathPtr,pathLen);
      const resolved=this.fs.resolvePath(this._cwdInode(cpu),path,this.uid,this.gid);
      if(!resolved.inode)return errnoResult(ERRNO.ENOENT);
      if(resolved.inode.type===INODE_TYPES.DIRECTORY){
        const entries=this.fs.readDirEntries(resolved.inode);
        if(entries.length>0)return errnoResult(ERRNO.ENOTEMPTY);
      }
      if(!hasWriteAccess(resolved.parent||resolved.inode,this.uid,this.gid))
        return errnoResult(ERRNO.EACCES);
      if(resolved.parent)this.fs.dirRemoveEntry(resolved.parent,resolved.leafName);
      resolved.inode.nlink=Math.max(0,resolved.inode.nlink-1);
      if(resolved.inode.nlink===0)this.fs.freeInode(resolved.inode.id);
      else this.fs.writeInode(resolved.inode.id,resolved.inode);
      return okResult(0);
    }catch(e){return catchErrno(e);}
  }

  sysRename(oldPtr,oldLen,newPtr,newLen,cpu){
    try{
      const oldPath=readUserString(cpu,oldPtr,oldLen);
      const newPath=readUserString(cpu,newPtr,newLen);
      const oldResolved=this.fs.resolvePath(this._cwdInode(cpu),oldPath,this.uid,this.gid);
      if(!oldResolved.inode)return errnoResult(ERRNO.ENOENT);
      if(!oldResolved.parent)return errnoResult(ERRNO.EACCES,"cannot rename root");
      if(!hasWriteAccess(oldResolved.parent,this.uid,this.gid))return errnoResult(ERRNO.EACCES);
      const newResolved=this.fs.resolvePath(this._cwdInode(cpu),newPath,this.uid,this.gid);
      if(!newResolved.parent)return errnoResult(ERRNO.ENOENT);
      if(!hasWriteAccess(newResolved.parent,this.uid,this.gid))return errnoResult(ERRNO.EACCES);
      if(newResolved.inode){
        if(newResolved.inode.type===INODE_TYPES.DIRECTORY)return errnoResult(ERRNO.EISDIR);
        if(newResolved.inode.id===oldResolved.inode.id)return okResult(0);
        this.fs.dirRemoveEntry(newResolved.parent,newResolved.leafName);
        newResolved.inode.nlink=Math.max(0,newResolved.inode.nlink-1);
        if(newResolved.inode.nlink===0)this.fs.freeInode(newResolved.inode.id);
        else this.fs.writeInode(newResolved.inode.id,newResolved.inode);
      }
      const oldId=this.fs.dirRemoveEntry(oldResolved.parent,oldResolved.leafName);
      this.fs.dirAddEntry(newResolved.parent,newResolved.leafName,oldId);
      return okResult(0);
    }catch(e){return catchErrno(e);}
  }

  sysLink(oldPtr,oldLen,newPtr,newLen,cpu){
    try{
      const oldPath=readUserString(cpu,oldPtr,oldLen);
      const newPath=readUserString(cpu,newPtr,newLen);
      const source=this.fs.resolvePath(this._cwdInode(cpu),oldPath,this.uid,this.gid);
      if(!source.inode)return errnoResult(ERRNO.ENOENT);
      if(source.inode.type===INODE_TYPES.DIRECTORY)return errnoResult(ERRNO.EPERM);
      const target=this.fs.resolvePath(this._cwdInode(cpu),newPath,this.uid,this.gid);
      if(target.inode)return errnoResult(ERRNO.EEXIST);
      if(!target.parent)return errnoResult(ERRNO.ENOENT);
      if(!hasWriteAccess(target.parent,this.uid,this.gid)||
        !hasAccess(target.parent,this.uid,this.gid,1))return errnoResult(ERRNO.EACCES);
      this.fs.dirAddEntry(target.parent,target.leafName,source.inode.id);
      source.inode.nlink++;
      this.fs.writeInode(source.inode.id,source.inode);
      return okResult(0);
    }catch(e){return catchErrno(e);}
  }

  sysChmod(pathPtr,pathLen,mode,cpu){
    try{
      if(mode&0o6000)return errnoResult(ERRNO.EINVAL);
      const path=readUserString(cpu,pathPtr,pathLen);
      const resolved=this.fs.resolvePath(this._cwdInode(cpu),path,this.uid,this.gid);
      if(!resolved.inode)return errnoResult(ERRNO.ENOENT);
      if(this.uid!==0&&this.uid!==resolved.inode.uid)return errnoResult(ERRNO.EPERM);
      resolved.inode.mode=mode&0o1777;
      this.fs.writeInode(resolved.inode.id,resolved.inode);
      return okResult(0);
    }catch(e){return catchErrno(e);}
  }

  sysChown(pathPtr,pathLen,uid,gid,cpu){
    try{
      const path=readUserString(cpu,pathPtr,pathLen);
      const resolved=this.fs.resolvePath(this._cwdInode(cpu),path,this.uid,this.gid);
      if(!resolved.inode)return errnoResult(ERRNO.ENOENT);
      if(this.uid!==0)return errnoResult(ERRNO.EPERM);
      resolved.inode.uid=uid;resolved.inode.gid=gid;
      this.fs.writeInode(resolved.inode.id,resolved.inode);
      return okResult(0);
    }catch(e){return catchErrno(e);}
  }

  sysGetcwd(bufPtr,bufBytes,cpu){
    try{
      const path=this._inodePath(this._cwdInode(cpu).id);
      const pathBytes=textEncoder.encode(path);
      const size=Math.min(pathBytes.length,bufBytes);
      const userPtr=cpu.userRange(bufPtr,size,"write");
      cpu.bytes.set(pathBytes.subarray(0,size),userPtr);
      return okResult(size);
    }catch(e){return catchErrno(e);}
  }

  sysChdir(pathPtr,pathLen,cpu){
    try{
      const path=readUserString(cpu,pathPtr,pathLen);
      const resolved=this.fs.resolvePath(this._cwdInode(cpu),path,this.uid,this.gid);
      if(!resolved.inode)return errnoResult(ERRNO.ENOENT);
      if(resolved.inode.type!==INODE_TYPES.DIRECTORY)return errnoResult(ERRNO.ENOTDIR);
      if(!hasAccess(resolved.inode,this.uid,this.gid,1))return errnoResult(ERRNO.EACCES);
      this._ft(cpu).cwd=resolved.inode;
      return okResult(0);
    }catch(e){return catchErrno(e);}
  }

  sysDup(oldFd,cpu){try{return okResult(this._ft(cpu).dup(oldFd));}catch(e){return catchErrno(e);}}
  sysDup2(oldFd,newFd,cpu){try{return okResult(this._ft(cpu).dup(oldFd,newFd));}catch(e){return catchErrno(e);}}

  _ft(cpu){
    if(!cpu._vfs){
      const root=this.fs.readInode(this.fs.rootId);
      cpu._vfs=new ProcessFDTable(this.fs,root);
    }
    return cpu._vfs;
  }
  _cwdInode(cpu){
    const table=this._ft(cpu);
    const fresh=this.fs.readInode(table.cwd.id);
    if(fresh)table.cwd=fresh;
    return table.cwd;
  }
  _create(resolved,path,cpu,flags){
    if(!resolved.parent)return errnoResult(ERRNO.EACCES);
    if(!hasWriteAccess(resolved.parent,this.uid,this.gid))return errnoResult(ERRNO.EACCES);
    const inodeId=this.fs.allocateInode(INODE_TYPES.REGULAR,this.uid,this.gid,0o644);
    this.fs.dirAddEntry(resolved.parent,resolved.leafName||path,inodeId);
    const fd=this._ft(cpu).allocate(inodeId,flags);
    return okResult(fd);
  }
  _open(inode,flags,cpu){
    const acc=flags&3;
    if((acc===OPEN_FLAGS.O_WRONLY||acc===OPEN_FLAGS.O_RDWR)&&!hasWriteAccess(inode,this.uid,this.gid))
      return errnoResult(ERRNO.EACCES);
    if(!hasReadAccess(inode,this.uid,this.gid))return errnoResult(ERRNO.EACCES);
    if(flags&OPEN_FLAGS.O_TRUNC)this.fs.truncateData(inode,0);
    return okResult(this._ft(cpu).allocate(inode.id,flags));
  }
  _statInode(inode,bufPtr,cpu){
    const userBuf=cpu.userRange(bufPtr,STAT_LAYOUT.bytes,"write");
    this.fs.statToBuffer(inode,cpu.bytes,userBuf);
    return okResult(0);
  }
  _inodePath(inodeId){
    const parts=[];
    let current=this.fs.readInode(inodeId);
    while(current&&current.id!==this.fs.rootId){
      const parent=this.fs.readInode(current.parentInode);
      if(!parent)break;
      const entries=this.fs.readDirEntries(parent);
      const found=entries.find(e=>e.inode===current.id);
      if(found)parts.unshift(found.name);else parts.unshift("?");
      current=parent;
    }
    return parts.length===0?"/":"/"+parts.join("/");
  }
}

/* ================================================================
 *  Helpers
 * ================================================================ */
export class ErrnoError extends Error {
  constructor(errno,message=""){super(message);this.name="ErrnoError";this.errno=errno;}
}
function errnoError(errno,message){return new ErrnoError(errno,message);}
function okResult(A=0,B=0,C=0){return{A:A|0,B:B|0,C:C|0,D:ERRNO.OK};}
function errnoResult(errno){return{A:-1,B:0,C:0,D:-(typeof errno==="number"?errno:ERRNO.EINVAL)};}
function catchErrno(e){
  if(e instanceof ErrnoError)return{A:-1,B:0,C:0,D:-e.errno};
  if(e instanceof CPUFault)return{A:-1,B:0,C:0,D:-ERRNO.EFAULT};
  return{A:-1,B:0,C:0,D:-ERRNO.EIO};
}
function readUserString(cpu,ptr,len){
  const at=cpu.userRange(ptr,len);
  return textDecoder.decode(cpu.bytes.subarray(at,at+len));
}
function hasAccess(inode,uid,gid,bits){
  if(uid===0)return true;
  if(inode.uid===uid)return(inode.mode>>6)&bits?true:false;
  if(inode.gid===gid)return(inode.mode>>3)&bits?true:false;
  return inode.mode&bits?true:false;
}
function hasReadAccess(inode,uid,gid){return hasAccess(inode,uid,gid,4);}
function hasWriteAccess(inode,uid,gid){return hasAccess(inode,uid,gid,2);}
