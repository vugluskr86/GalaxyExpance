import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {InodeFS} from "../src/game/vfs.js";
import {INODE_TYPES} from "../src/game/protected-mode.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const unix=path.join(root,"system","unix");
const output=path.join(unix,"build","prompt10-staging.pcfs");
const check=process.argv.includes("--check");
const encoder=new TextEncoder();
const image=new InodeFS(16384);

function directory(unixPath){
  let current=image.readInode(image.rootId);
  for(const name of unixPath.split("/").filter(Boolean)){
    let id=image.dirLookup(current,name);
    if(!id){
      id=image.allocateInode(INODE_TYPES.DIRECTORY,0,0,0o755);
      image.dirAddEntry(current,name,id);
    }
    current=image.readInode(id);
    if(current.type!==INODE_TYPES.DIRECTORY)
      throw new Error(`staging path is not a directory: ${unixPath}`);
  }
  return current;
}

function addFile(unixPath,bytes,mode=0o644){
  const parentPath=path.posix.dirname(unixPath);
  const name=path.posix.basename(unixPath);
  const parent=directory(parentPath);
  if(image.dirLookup(parent,name))throw new Error(`duplicate staging path: ${unixPath}`);
  const id=image.allocateInode(INODE_TYPES.REGULAR,0,0,mode);
  image.dirAddEntry(parent,name,id);
  image.writeData(image.readInode(id),bytes instanceof Uint8Array?bytes:encoder.encode(bytes));
}

function addHostFile(source,unixPath,mode=0o644){
  const bytes=new Uint8Array(fs.readFileSync(path.join(root,source)));
  addFile(unixPath,bytes,mode);
}

for(const name of ["make","sh","assembler","linker","cat","mv","rm"])
  addHostFile(`system/unix/build/${name}.bin`,`/bin/${name}.bin`,0o755);

addHostFile("system/assembler.asm","/usr/src/pcos/system/assembler.asm");
addHostFile("system/linker.asm","/usr/src/pcos/system/linker.asm");
addHostFile("system/unix/Makefile","/usr/src/pcos/system/unix/Makefile");
addHostFile("examples/unix/hello-libc.asm","/usr/src/pcos/system/unix/hello.asm");

for(const relativeDir of ["lib","bin","kernel","init","sbin","include"]){
  const hostDir=path.join(unix,relativeDir);
  for(const entry of fs.readdirSync(hostDir,{withFileTypes:true})){
    if(!entry.isFile()||!/\.(?:asm|inc)$/i.test(entry.name))continue;
    addHostFile(`system/unix/${relativeDir}/${entry.name}`,
      `/usr/src/pcos/system/unix/${relativeDir}/${entry.name}`);
  }
}
directory("/usr/src/pcos/system/unix/build");

// InodeFS uses wall-clock mtimes for normal runtime writes.  A generated
// staging image must instead be byte-for-byte reproducible for --check.
for(let id=1;id<=image.inodeBlocks*8;id++){
  const inode=image.readInode(id);
  if(!inode)continue;
  inode.mtimeSec=1_700_000_000;
  inode.mtimeNsec=0;
  image.writeInode(id,inode);
}

const bytes=image.serialize();
const current=fs.existsSync(output)?new Uint8Array(fs.readFileSync(output)):null;
const stale=!current||Buffer.compare(Buffer.from(current),Buffer.from(bytes))!==0;
if(check&&stale){
  console.error("Prompt 10 staging image is stale; run node scripts/build-unix-staging.mjs");
  process.exit(1);
}
if(!check){
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,bytes);
}
console.log(check?"OK: Prompt 10 staging image is current":
  `OK: built Prompt 10 staging image (${bytes.length} bytes)`);
