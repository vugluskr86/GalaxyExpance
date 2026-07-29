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
const libcNames=["crt0.asm","syscall.asm","string.asm","stdlib.asm","io.asm","path.asm","getopt.asm"];
const libc=libcNames.map(name=>compile(`lib/${name}`));
const utilities=compile("lib/utilities.asm");
const shellParser=compile("lib/shell-parser.asm");
const names=["ls","cat","grep","cp","mv","mkdir","rm","link","chown","chgrp","user","find","ps"];
const programs=[["bin/sh.asm","sh.bin",[shellParser]],
  ...names.map(name=>[`bin/${name}.asm`,`${name}.bin`,[utilities]])];

let stale=false;
for(const [source,name,extra] of programs){
  const binary=linker.link([libc[0],compile(source),...extra,...libc.slice(1)],{entry:"main"});
  const target=path.join(build,name),old=fs.existsSync(target)?fs.readFileSync(target):null;
  if(!old||Buffer.compare(old,Buffer.from(binary))!==0)stale=true;
  if(!check){fs.mkdirSync(build,{recursive:true});fs.writeFileSync(target,binary);}
}
if(check&&stale){
  console.error("Stage 7/8 binaries are stale; run node scripts/build-unix-stage7-8.mjs");
  process.exit(1);
}
console.log(check?"OK: Stage 7/8 binaries are current":
  `OK: built sh and ${names.length} separate utility binaries`);
