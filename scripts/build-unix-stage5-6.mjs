import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {Assembler} from "../src/game/cpu.js";
import {AssemblyCompiler,Linker} from "../src/game/toolchain.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const unix=path.join(root,"system","unix");
const build=path.join(unix,"build");
const check=process.argv.includes("--check");
const compiler=new AssemblyCompiler(),assembler=new Assembler(),linker=new Linker(assembler);
const libcModules=["crt0.asm","syscall.asm","string.asm","stdlib.asm","io.asm","path.asm","getopt.asm"];
const compile=relative=>compiler.compile(fs.readFileSync(path.join(unix,relative),"utf8"),relative);
const libc=libcModules.map(name=>compile(`lib/${name}`));
const userdb=compile("lib/userdb.asm");
const apps=[
  ["bin/login.asm","login.bin",[userdb]],
  ["bin/passwd.asm","passwd.bin",[userdb]],
  ["sbin/logger.asm","logger.bin",[]],
  ["init/init.asm","init.bin",[]],
  ["bin/sh.asm","sh.bin",[]],
];
let stale=false;
for(const [source,name,extra] of apps){
  // crt0 must be the first text module: the current static linker resolves
  // entry symbols but preserves module text order.
  const binary=linker.link([libc[0],compile(source),...extra,...libc.slice(1)],{entry:"main"});
  const target=path.join(build,name);
  const previous=fs.existsSync(target)?fs.readFileSync(target):null;
  if(!previous||Buffer.compare(previous,Buffer.from(binary))!==0)stale=true;
  if(!check){
    fs.mkdirSync(build,{recursive:true});
    fs.writeFileSync(target,binary);
  }
}
if(check&&stale){
  console.error("Stage 5/6 binaries are stale; run node scripts/build-unix-stage5-6.mjs");
  process.exit(1);
}
console.log(check?"OK: Unix user binaries are current":"OK: built login, passwd, logger, init and sh");
