import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {Assembler} from "../src/game/cpu.js";
import {AssemblyCompiler,Linker} from "../src/game/toolchain.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const unix=path.join(root,"system","unix"),build=path.join(unix,"build");
const check=process.argv.includes("--check");
const compiler=new AssemblyCompiler(),linker=new Linker(new Assembler());
const read=relative=>fs.readFileSync(path.join(unix,relative),"utf8");
const compile=relative=>compiler.compile(read(relative),relative);
const libc=["crt0.asm","syscall.asm","string.asm","stdlib.asm","io.asm","path.asm","getopt.asm"]
  .map(name=>compile(`lib/${name}`));
const binary=linker.link([libc[0],compile("bin/top.asm"),...libc.slice(1)],{entry:"main"});
const target=path.join(build,"top.bin");
const old=fs.existsSync(target)?fs.readFileSync(target):null;
const stale=!old||Buffer.compare(old,Buffer.from(binary))!==0;
if(check&&stale){
  console.error("Stage 9 binary is stale; run node scripts/build-unix-stage9.mjs");
  process.exit(1);
}
if(!check){
  fs.mkdirSync(build,{recursive:true});
  fs.writeFileSync(target,binary);
}
console.log(check?"OK: Stage 9 binary is current":"OK: built top.bin");
