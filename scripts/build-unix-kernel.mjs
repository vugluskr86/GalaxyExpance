import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {Assembler} from "../src/game/cpu.js";
import {AssemblyCompiler,Linker} from "../src/game/toolchain.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const kernelDir=path.join(root,"system","unix","kernel");
const buildDir=path.join(root,"system","unix","build");
const modules=[
  "entry.asm","memory.asm","devices.asm","process.asm","scheduler.asm",
  "vfs.asm","permissions.asm","syscall.asm"
];
const check=process.argv.includes("--check");
const compiler=new AssemblyCompiler();
const assembler=new Assembler();
const linker=new Linker(assembler);

const objects=modules.map(name=>{
  const source=fs.readFileSync(path.join(kernelDir,name),"utf8");
  return compiler.compile(source,name);
});
const kernel=linker.link(objects,{entry:"main"});
const outputs=new Map([
  [path.join(buildDir,"kernel.bin"),kernel],
]);

let stale=false;
for(const [target,data] of outputs){
  const existing=fs.existsSync(target)?fs.readFileSync(target):null;
  const equal=existing!==null&&
    Buffer.compare(existing,Buffer.from(data))===0;
  if(!equal)stale=true;
  if(!check){
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,data);
  }
}
if(check&&stale){
  console.error("Unix kernel build outputs are stale; run node scripts/build-unix-kernel.mjs");
  process.exit(1);
}
console.log(check
  ?"OK: Unix kernel build outputs are up-to-date"
  :`OK: built kernel.bin (${kernel.length} bytes)`);
