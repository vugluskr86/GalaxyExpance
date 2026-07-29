import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {Assembler} from "../src/game/cpu.js";
import {AssemblyCompiler,Linker} from "../src/game/toolchain.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const unix=path.join(root,"system","unix"),build=path.join(unix,"build");
const check=process.argv.includes("--check");
const compiler=new AssemblyCompiler(),assembler=new Assembler(),linker=new Linker(assembler);
const read=relative=>fs.readFileSync(path.join(unix,relative),"utf8");
const compile=relative=>compiler.compile(read(relative),relative);
const libc=["crt0.asm","syscall.asm","string.asm","stdlib.asm","io.asm","path.asm","getopt.asm"]
  .map(name=>compile(`lib/${name}`));
let stale=false;
for(const name of ["env","make"]){
  const binary=linker.link([libc[0],compile(`bin/${name}.asm`),...libc.slice(1)],{entry:"main"});
  const target=path.join(build,`${name}.bin`);
  const old=fs.existsSync(target)?fs.readFileSync(target):null;
  if(!old||Buffer.compare(old,Buffer.from(binary))!==0)stale=true;
  if(!check){
    fs.mkdirSync(build,{recursive:true});
    fs.writeFileSync(target,binary);
  }
}
for(const name of ["assembler","linker"]){
  const binary=assembler.assembleBinary(read(`bin/${name}.asm`));
  const target=path.join(build,`${name}.bin`);
  const old=fs.existsSync(target)?fs.readFileSync(target):null;
  if(!old||Buffer.compare(old,Buffer.from(binary))!==0)stale=true;
  if(!check){
    fs.mkdirSync(build,{recursive:true});
    fs.writeFileSync(target,binary);
  }
}
if(check&&stale){
  console.error("make/env/toolchain binaries are stale; run node scripts/build-unix-make-env.mjs");
  process.exit(1);
}
console.log(check?"OK: make/env/toolchain binaries are current":
  "OK: built make.bin, env.bin, assembler.bin and linker.bin");
