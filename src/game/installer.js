import {InodeFS} from "./vfs.js";
import {INODE_TYPES} from "./protected-mode.js";

const encoder=new TextEncoder(),decoder=new TextDecoder();
const MAGIC="PCFD",VERSION=1;

export function fnv1a32(bytes){
  let value=0x811c9dc5;
  for(const byte of bytes){value^=byte;value=Math.imul(value,0x01000193);}
  return value>>>0;
}

/** Decode the portable, manifest-first installation image. */
export function decodePCFD(raw){
  const bytes=typeof raw==="string"
    ? Uint8Array.from(atob(raw),char=>char.charCodeAt(0))
    : raw instanceof Uint8Array?raw:new Uint8Array(raw);
  if(bytes.length<9||decoder.decode(bytes.subarray(0,4))!==MAGIC)
    throw new Error("PCFD: неверная сигнатура");
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint8(4)!==VERSION)throw new Error("PCFD: неподдерживаемая версия");
  const count=view.getUint32(5,true);let at=9,required=0;
  const entries=[];
  for(let index=0;index<count;index++){
    if(at+2>bytes.length)throw new Error("PCFD: обрезанный путь");
    const pathBytes=view.getUint16(at,true);at+=2;
    if(at+pathBytes+20>bytes.length)throw new Error("PCFD: обрезанная запись");
    const path=decoder.decode(bytes.subarray(at,at+pathBytes));at+=pathBytes;
    const uid=view.getUint32(at,true),gid=view.getUint32(at+4,true),mode=view.getUint32(at+8,true);
    const size=view.getUint32(at+12,true),checksum=view.getUint32(at+16,true);at+=20;
    if(at+size>bytes.length)throw new Error(`PCFD: обрезаны данные ${path}`);
    const data=bytes.slice(at,at+size);at+=size;
    if(!/^\/[A-Za-z0-9._+\/-]+$/.test(path)||path.includes("//")||path.includes("/../"))
      throw new Error(`PCFD: небезопасный путь ${path}`);
    if(fnv1a32(data)!==checksum)throw new Error(`PCFD: checksum ${path}`);
    entries.push({path,uid,gid,mode,size,checksum,data});required+=size;
  }
  if(at!==bytes.length)throw new Error("PCFD: лишние данные");
  return {entries,required};
}

function parentPath(path){return path.slice(0,path.lastIndexOf("/"))||"/";}
function passwordHash(password,salt){
  let state=fnv1a32(encoder.encode(salt+password));
  const word=new Uint8Array(4),view=new DataView(word.buffer);
  for(let round=0;round<1024;round++){view.setUint32(0,state,true);state=fnv1a32(word);}
  return `0x${state.toString(16).padStart(8,"0")}`;
}
function ensureDirectory(fs,path,uid=0,gid=0,mode=0o755){
  if(path==="/")return fs.readInode(fs.rootId);
  let current=fs.readInode(fs.rootId);
  for(const name of path.split("/").filter(Boolean)){
    let id=fs.dirLookup(current,name);
    if(!id){
      id=fs.allocateInode(INODE_TYPES.DIRECTORY,uid,gid,mode);
      fs.dirAddEntry(current,name,id);
    }
    current=fs.readInode(id);
    if(current.type!==INODE_TYPES.DIRECTORY)throw new Error(`PCFD: ${path} не каталог`);
  }
  return current;
}

/**
 * Raw-media half of the installer. It validates every package entry and builds
 * a fresh PCFS image before publishing it to the target, so partial installs
 * are never bootable.
 */
export function installPCFD(raw,targetStorage,{rootPassword="",guest=true}={}){
  const pkg=decodePCFD(raw);
  const capacity=(targetStorage?.ramKb||0)*1024;
  if(capacity<512*32)throw new Error("Installer: target DRIVE слишком мал");
  if(pkg.required>capacity)throw new Error("Installer: образ не помещается на target DRIVE");
  if(new Set(pkg.entries.map(entry=>entry.path)).size!==pkg.entries.length)
    throw new Error("PCFD: дублирующийся путь");
  const directoryRecord=pkg.entries.find(entry=>entry.path==="/.pcfd-directories.json");
  let directories=[];
  try{directories=directoryRecord?JSON.parse(decoder.decode(directoryRecord.data)):[];}
  catch{throw new Error("PCFD: directory manifest");}
  if(!Array.isArray(directories))throw new Error("PCFD: directory manifest");
  let entries=pkg.entries.filter(entry=>entry!==directoryRecord);
  if(rootPassword){
    entries=entries.map(entry=>{
      if(entry.path!=="/etc/shadow")return entry;
      const text=decoder.decode(entry.data).replace(/^root:[^:\n]*:([^\n]*)$/m,
        (_,salt)=>`root:${passwordHash(rootPassword,salt)}:${salt}`);
      const data=encoder.encode(text);return {...entry,data,size:data.length,checksum:fnv1a32(data)};
    });
  }
  if(!guest){
    directories=directories.filter(directory=>directory.path!=="/home/guest");
    entries=entries.map(entry=>{
      if(!["/etc/passwd","/etc/group","/etc/shadow"].includes(entry.path))return entry;
      const data=encoder.encode(decoder.decode(entry.data).split("\n")
        .filter(line=>!line.startsWith("guest:")).join("\n"));
      return {...entry,data,size:data.length,checksum:fnv1a32(data)};
    });
  }
  const blocks=Math.max(128,Math.ceil((entries.reduce((sum,entry)=>sum+entry.size,0)+entries.length*160+8192)/512)*2);
  if(blocks*512>capacity)throw new Error("Installer: нет места для PCFS metadata");
  const volume=new InodeFS(blocks);
  for(const directory of directories.sort((left,right)=>left.path.length-right.path.length))
    ensureDirectory(volume,directory.path,directory.uid,directory.gid,parseInt(String(directory.mode),8));
  for(const entry of entries){
    const parent=ensureDirectory(volume,parentPath(entry.path));
    const name=entry.path.slice(entry.path.lastIndexOf("/")+1);
    if(volume.dirLookup(parent,name))throw new Error(`PCFD: duplicate ${entry.path}`);
    const id=volume.allocateInode(INODE_TYPES.REGULAR,entry.uid,entry.gid,entry.mode);
    volume.dirAddEntry(parent,name,id);
    volume.writeData(volume.readInode(id),entry.data);
  }
  const kernel=entries.find(entry=>entry.path==="/kernel.bin");
  if(!kernel)throw new Error("PCFD: отсутствует /kernel.bin");
  const image=volume.serialize();
  // Verify the product before a single target field changes.
  const verified=InodeFS.deserialize(image);
  if(!verified.resolvePath(verified.rootId,"/kernel.bin",0,0).inode)
    throw new Error("Installer: PCFS verification failed");
  targetStorage.programs=[];
  for(const entry of entries.filter(entry=>entry.path==="/kernel.bin"||/^\/(?:bin|sbin)\/.+\.bin$/.test(entry.path))){
    const writeError=targetStorage.saveBinary(entry.path==="/kernel.bin"?"kernel.bin":entry.path,entry.data);
    if(writeError)throw new Error(writeError);
  }
  targetStorage.pcfsImage=image;
  targetStorage.installation={bootable:true,bootFile:"kernel.bin",rootPasswordSet:!!rootPassword,
    guest:!!guest,manifestEntries:entries.length,verified:true};
  return {files:entries.length,bytes:entries.reduce((sum,entry)=>sum+entry.size,0),pcfsBytes:image.length};
}
