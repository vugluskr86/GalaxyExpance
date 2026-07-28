import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {Assembler} from "../src/game/cpu.js";
import {AssemblyCompiler,Linker} from "../src/game/toolchain.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const libDir=path.join(root,"system","unix","lib");
const buildDir=path.join(root,"system","unix","build");
const modules=[
  "crt0.asm","syscall.asm","string.asm","stdlib.asm","io.asm","path.asm",
  "getopt.asm"
];
const check=process.argv.includes("--check");
const compiler=new AssemblyCompiler(),assembler=new Assembler(),linker=new Linker(assembler);
const libcSource=modules.map(name=>
  `; module ${name}\n${fs.readFileSync(path.join(libDir,name),"utf8")}`).join("\n");
const libcObject=compiler.compile(libcSource,"libc");
const helloSource=fs.readFileSync(
  path.join(root,"examples","unix","hello-libc.asm"),"utf8");
const helloObject=compiler.compile(helloSource,"hello-libc");
const helloBinary=linker.link([libcObject,helloObject],{entry:"_start"});

const outputs=new Map([
  [path.join(buildDir,"libc.asm"),new TextEncoder().encode(libcSource)],
  [path.join(buildDir,"libc.obj"),libcObject],
  [path.join(buildDir,"hello-libc.obj"),helloObject],
  [path.join(buildDir,"hello-libc.bin"),helloBinary],
]);
let stale=false;
for(const [target,data] of outputs){
  const existing=fs.existsSync(target)?fs.readFileSync(target):null;
  const equal=existing&&Buffer.compare(existing,Buffer.from(data))===0;
  if(!equal)stale=true;
  if(!check){
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,data);
  }
}
if(check&&stale){
  console.error("Unix libc outputs are stale; run node scripts/build-unix-libc.mjs");
  process.exit(1);
}
console.log(check?"OK: Unix libc outputs are up-to-date":
  `OK: built libc.obj (${libcObject.length} bytes), hello-libc.bin (${helloBinary.length} bytes)`);
