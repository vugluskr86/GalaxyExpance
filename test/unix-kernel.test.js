import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {Assembler,CPU} from "../src/game/cpu.js";
import {AssemblyCompiler,Linker} from "../src/game/toolchain.js";
import {ComputerTerminal} from "../src/game/terminal.js";

const kernelNames=[
  "entry.asm","memory.asm","devices.asm","process.asm","scheduler.asm",
  "vfs.asm","permissions.asm","syscall.asm"
];

function buildKernel(){
  const compiler=new AssemblyCompiler(),assembler=new Assembler();
  const objects=kernelNames.map(name=>compiler.compile(
    fs.readFileSync(new URL(`../system/unix/kernel/${name}`,import.meta.url),"utf8"),
    name));
  return {assembler,binary:new Linker(assembler).link(objects,{entry:"main"})};
}

test("Unix stage 2 links a separate modular kernel.bin",()=>{
  const {assembler,binary}=buildKernel();
  const program=assembler.decodeBinary(binary);
  assert.equal(new TextDecoder().decode(binary.slice(0,4)),"PCVM");
  assert.ok(program.some(ins=>ins.op==="PM_ENABLE"));
  assert.ok(program.some(ins=>ins.op==="SET_IVT"));
  assert.ok(program.some(ins=>ins.op==="BOOT"&&ins.args[0]==='"/sbin/init.bin"'));
});

test("BIOS -> kernel.bin -> Assembly init.bin is the only PID 1 payload",()=>{
  const {assembler,binary}=buildKernel(),terminal=new ComputerTerminal();
  const bios=new CPU(65536,undefined,terminal).run(assembler.assemble(`
    PRINT "BIOS: kernel.bin"
    BOOT "kernel.bin"
    HALT
  `));
  assert.equal(bios.bootFile,"kernel.bin");

  const kernelCpu=new CPU(65536,undefined,terminal);
  const kernel=kernelCpu.run(assembler.decodeBinary(binary));
  assert.equal(kernel.bootFile,"/sbin/init.bin");
  assert.equal(kernelCpu.r.MODE,"kernel");
  assert.equal(kernelCpu.r.IVT,0);
  assert.equal(kernelCpu.r.UBASE,8192);
  assert.equal(kernelCpu.view.getUint32(32*4,true)>0,true);

  const initBinary=new Uint8Array(fs.readFileSync(
    new URL("../system/unix/build/init.bin",import.meta.url)));
  const initProgram=assembler.decodeBinary(initBinary);
  assert.ok(initProgram.some(ins=>ins.op==="SYSCALL"&&Number(ins.args[0])===32),
    "init opens /etc/init.conf through the syscall ABI");
  assert.ok(initProgram.some(ins=>ins.op==="SYSCALL"&&Number(ins.args[0])===3),
    "init spawns services rather than kernel booting a shell");
  const initSource=fs.readFileSync(
    new URL("../system/unix/init/init.asm",import.meta.url),"utf8");
  assert.match(initSource,/init_reap_loop:/);
  assert.match(initSource,/init_recovery:/);
  assert.doesNotMatch(initSource,/dummy init/i);
});

test("Unix kernel has no direct JS PixelOS shell bootstrap",()=>{
  const entry=fs.readFileSync(
    new URL("../system/unix/kernel/entry.asm",import.meta.url),"utf8");
  assert.doesNotMatch(entry,/PixelOS|Shell готова|new\s+PixelOS/);
  assert.match(entry,/BOOT "\/sbin\/init\.bin"/);
});
