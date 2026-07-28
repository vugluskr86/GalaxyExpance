import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {Assembler,CPU} from "../src/game/cpu.js";
import {ComputerTerminal} from "../src/game/terminal.js";
import {AssemblyCompiler,Linker} from "../src/game/toolchain.js";

const encoder=new TextEncoder();
const assembler=new Assembler();
const compiler=new AssemblyCompiler();
const linker=new Linker(assembler);

/** Compile an .asm source host-side into a PCVM binary ready for execution. */
function hostCompile(source,entry=null){
  const obj=compiler.compile(source,"host");
  const objects=entry?[obj]:[obj];
  return linker.link(objects,entry?{entry}:{});
}

/** Run a host-compiled binary inside PCVM with DRIVE services. */
function runPcvm(binary,driveFiles={},options={}){
  const {cpuBytes=2097152,maxSteps=30_000_000}=options;
  const terminal=new ComputerTerminal(),files=new Map();
  if(driveFiles._ttyLine)terminal.lineQueue.push(driveFiles._ttyLine);
  const output=[];
  const cpu=new CPU(cpuBytes,value=>output.push(String(value)),terminal,{
    fsRead:name=>{
      if(driveFiles[name]!==undefined){
        const v=driveFiles[name];
        return typeof v==="string"?encoder.encode(v):v;
      }
      return null;
    },
    fsWrite:(name,data)=>files.set(name,new Uint8Array(data)),
    time:()=>new Date(2026,6,28,12,0,0).toLocaleString("ru-RU"),
  });
  const program=assembler.decodeBinary(binary instanceof Uint8Array?binary:new Uint8Array(binary));
  const result=cpu.run(program,maxSteps,true);
  return{result,output,files,terminal};
}

/** Собрать PCVM-программу через self-hosted assembler + linker внутри PCVM. */
function selfHostBuild(source,fileName,assemblerBinary,linkerBinary){
  const asmResult=runPcvm(assemblerBinary,{_ttyLine:fileName,[fileName]:source});
  const obj=asmResult.files.get("a.obj");
  if(!obj)throw new Error(
    `self-hosted assembler did not produce a.obj: ${asmResult.output.slice(-5).join(" | ")}`);
  const objName=fileName.replace(/\.\w+$/,".obj");
  const linkResult=runPcvm(linkerBinary,{_ttyLine:objName,[objName]:obj},
    {cpuBytes:131072,maxSteps:100_000_000});
  const binary=linkResult.files.get("a.bin");
  if(!binary)throw new Error(
    `self-hosted linker did not produce a.bin: ${linkResult.output.slice(-5).join(" | ")}`);
  return{obj,binary};
}

const asmSource=fs.readFileSync(new URL("../system/assembler.asm",import.meta.url),"utf8");
const linkSource=fs.readFileSync(new URL("../system/linker.asm",import.meta.url),"utf8");
const assemblerBin=hostCompile(asmSource);
const linkerBin=hostCompile(linkSource,"main");

test("bootstrap: host-built assembler compiles a simple program inside PCVM",()=>{
  const source="LOAD_A 17\nPRINT_A\nHALT";
  const result=selfHostBuild(source,"test.asm",assemblerBin,linkerBin);
  const output=[];
  new CPU(8192,value=>output.push(String(value))).run(
    assembler.decodeBinary(result.binary));
  assert.deepEqual(output,["17"]);
});

test("bootstrap: self-hosted assembler2 compiles its own source",()=>{
  // assembler.bin + assembler.asm -> assembler2.obj + assembler2.bin
  const stage1=selfHostBuild(asmSource,"assembler.asm",assemblerBin,linkerBin);
  const assembler2Bin=stage1.binary;
  assert.ok(assembler2Bin.length>8000,"assembler2.bin should be >8KB");

  // assembler2.bin компилирует тестовую программу (через host линкер)
  const testSource="LOAD_A 42\nPRINT_A\nHALT";
  const result=selfHostBuild(testSource,"test2.asm",assembler2Bin,linkerBin);
  const output=[];
  new CPU(8192,value=>output.push(String(value))).run(
    assembler.decodeBinary(result.binary));
  assert.deepEqual(output,["42"]);
});

test("bootstrap: self-hosted assembler produces valid PCOB for linker source",()=>{
  // assembler.bin -> linker2.obj (binary PCOB)
  const asmResult=runPcvm(assemblerBin,{_ttyLine:"linker.asm","linker.asm":linkSource});
  const linker2Obj=asmResult.files.get("a.obj");
  assert.ok(linker2Obj,"should produce linker2.obj");
  // Verify binary PCOB magic
  assert.deepEqual(Array.from(linker2Obj.slice(0,4)),[0x50,0x43,0x4f,0x42],
    "linker2.obj should have PCOB magic");
  assert.ok(linker2Obj.length>4000,"linker2.obj should be substantial");

  // assembler.bin -> simple.obj
  const simpleObj=runPcvm(assemblerBin,{
    _ttyLine:"simple.asm",
    "simple.asm":"LOAD_A 77\nPRINT_A\nHALT",
  }).files.get("a.obj");
  assert.ok(simpleObj,"should produce simple.obj");

  // Host linker links simple.obj
  const simpleModule=compiler.read(simpleObj);
  assert.ok(simpleModule.payload.length>0);
  const output=[];
  const program=assembler.decodeBinary(simpleModule.payload);
  new CPU(8192,value=>output.push(String(value))).run(program);
  assert.deepEqual(output,["77"]);
});

test("bootstrap: linker2 links a self-hosted object inside PCVM",()=>{
  const linker2=selfHostBuild(linkSource,"linker.asm",assemblerBin,linkerBin).binary;
  const simpleObj=runPcvm(assemblerBin,{
    _ttyLine:"simple.asm",
    "simple.asm":"LOAD_A 91\nPRINT_A\nHALT",
  }).files.get("a.obj");
  assert.ok(simpleObj);
  const linked=runPcvm(linker2,{_ttyLine:"simple.obj","simple.obj":simpleObj},
    {cpuBytes:2097152,maxSteps:100_000_000});
  const binary=linked.files.get("a.bin");
  assert.ok(binary,`linker2 output: ${linked.output.slice(-8).join(" | ")}`);
  const output=[];
  new CPU(8192,value=>output.push(String(value))).run(assembler.decodeBinary(binary));
  assert.deepEqual(output,["91"]);
});

test("bootstrap: second generation rebuild uses assembler2 and linker2 only",()=>{
  const assembler2=selfHostBuild(asmSource,"assembler.asm",assemblerBin,linkerBin).binary;
  const linker2=selfHostBuild(linkSource,"linker.asm",assemblerBin,linkerBin).binary;
  const assembler3=selfHostBuild(asmSource,"assembler.asm",assembler2,linker2).binary;
  const linker3=selfHostBuild(linkSource,"linker.asm",assembler2,linker2).binary;
  assert.ok(assembler3.length>8000);
  assert.ok(linker3.length>8000);

  const result=selfHostBuild("LOAD_A 123\nPRINT_A\nHALT","generation3.asm",
    assembler3,linker3);
  const output=[];
  new CPU(8192,value=>output.push(String(value))).run(
    assembler.decodeBinary(result.binary));
  assert.deepEqual(output,["123"]);
});

test("bootstrap: hello-libc rebuild through self-hosted toolchain",()=>{
  const libcSrc=fs.readFileSync(new URL("../system/unix/build/libc.asm",import.meta.url),"utf8");
  const helloSrc=fs.readFileSync(new URL("../examples/unix/hello-libc.asm",import.meta.url),"utf8");
  const combined=`${libcSrc.replace(
    /^\s*\.import\s+(?!main\s*$)[A-Za-z_]\w*\s*$/gmi,"")}\n${helloSrc.replace(
    /^\s*\.import\s+[A-Za-z_]\w*\s*$/gmi,"")}`;
  const stage=selfHostBuild(combined,"hello-selfhost.asm",assemblerBin,linkerBin);
  assert.ok(stage.obj.length>1000);
  assert.ok(stage.binary.length>500);
  const runOutput=[];
  new CPU(65536,value=>runOutput.push(String(value)),null,{
    pid:()=>1,time:()=>"12:00:00",procExit:()=>true,
  }).run(assembler.decodeBinary(stage.binary));
  assert.ok(runOutput.some(line=>String(line).includes("hello")),
    `output should contain hello: ${runOutput.join("|")}`);
});

test("bootstrap: Makefile references assembler2/linker2 bootstrap target",()=>{
  const text=fs.readFileSync(new URL("../system/unix/Makefile",import.meta.url),"utf8");
  assert.match(text,/bootstrap:/);
  assert.match(text,/assembler2\.bin/);
  assert.match(text,/linker2\.bin/);
  assert.match(text,/\.\.\/\.\.\/system\/assembler\.asm/);
  assert.match(text,/\.\.\/\.\.\/system\/linker\.asm/);
  const bootBody=text.slice(text.indexOf("bootstrap:"),
    text.indexOf("\n\n",text.indexOf("bootstrap:"))||text.length);
  assert.match(bootBody,/toolchain/);
  assert.match(bootBody,/all/);
});

test("bootstrap: assembler2/linker2 targets are self-contained",()=>{
  const text=fs.readFileSync(new URL("../system/unix/Makefile",import.meta.url),"utf8");
  assert.match(text,/assembler2\.bin: assembler2\.obj/);
  assert.match(text,/linker2\.bin: linker2\.obj/);
  const block=text.slice(text.indexOf("assembler2.obj:"),
    text.indexOf("\n\n",text.indexOf("assembler2.obj:"))||text.length);
  assert.doesNotMatch(block,/libc/,"assembler2 should not depend on libc");
});
