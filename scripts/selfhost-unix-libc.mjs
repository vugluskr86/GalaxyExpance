import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {Assembler,CPU} from "../src/game/cpu.js";
import {ComputerTerminal} from "../src/game/terminal.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const buildDir=path.join(root,"system","unix","build");
const check=process.argv.includes("--check");
const assembler=new Assembler(),encoder=new TextEncoder();
const assemblerSource=fs.readFileSync(path.join(root,"system","assembler.asm"),"utf8");
const linkerSource=fs.readFileSync(path.join(root,"system","linker.asm"),"utf8");
const libcSource=fs.readFileSync(path.join(buildDir,"libc.asm"),"utf8");
const helloSource=fs.readFileSync(
  path.join(root,"examples","unix","hello-libc.asm"),"utf8");

function assembleOnPcvm(name,source){
  const terminal=new ComputerTerminal(),files=new Map(),output=[];
  terminal.lineQueue.push(name);
  const cpu=new CPU(2_097_152,value=>output.push(String(value)),terminal,{
    fsRead:file=>file===name?encoder.encode(source):null,
    fsWrite:(file,data)=>files.set(file,new Uint8Array(data))
  });
  cpu.run(assembler.decodeBinary(assembler.assembleBinary(assemblerSource)),30_000_000);
  const object=files.get("a.obj");
  if(!object)throw new Error(
    `self-hosted assembler did not produce ${name}: ${output.join(" | ")}`);
  return object;
}

function linkOnPcvm(name,object){
  const terminal=new ComputerTerminal(),files=new Map();
  terminal.lineQueue.push(name);
  const cpu=new CPU(131_072,()=>{},terminal,{
    fsRead:file=>file===name?object:null,
    fsWrite:(file,data)=>files.set(file,new Uint8Array(data))
  });
  cpu.run(assembler.decodeBinary(assembler.assembleBinary(linkerSource)),100_000_000);
  const binary=files.get("a.bin");
  if(!binary)throw new Error("self-hosted linker did not produce a.bin");
  return binary;
}

const libcSelfSource=libcSource.replace(
  /^\s*\.import\s+(?!main\s*$)[A-Za-z_]\w*\s*$/gmi,"");
const libcObject=assembleOnPcvm("libc.asm",libcSelfSource);
// A single self-hosted translation unit avoids the current two-object buffer
// limit while still resolving main through the real two-pass assembler.
const combinedSource=`${libcSelfSource}\n${helloSource}`.replace(
  /^\s*\.import\s+[A-Za-z_]\w*\s*$/gmi,"");
const helloObject=assembleOnPcvm("hello-selfhost.asm",combinedSource);
const helloBinary=linkOnPcvm("hello-selfhost.obj",helloObject);
const outputs=new Map([
  [path.join(buildDir,"libc-selfhost.obj"),libcObject],
  [path.join(buildDir,"hello-libc-selfhost.obj"),helloObject],
  [path.join(buildDir,"hello-libc-selfhost.bin"),helloBinary],
]);
let stale=false;
for(const [target,data] of outputs){
  const existing=fs.existsSync(target)?fs.readFileSync(target):null;
  const equal=existing&&Buffer.compare(existing,Buffer.from(data))===0;
  if(!equal)stale=true;
  if(!check)fs.writeFileSync(target,data);
}
if(check&&stale){
  console.error("Self-hosted libc outputs are stale; run node scripts/selfhost-unix-libc.mjs");
  process.exit(1);
}
console.log(check?"OK: self-hosted libc outputs are up-to-date":
  `OK: PCVM built libc.obj (${libcObject.length}) and hello.bin (${helloBinary.length})`);
