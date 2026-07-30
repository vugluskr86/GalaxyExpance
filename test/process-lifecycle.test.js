import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {makeItem} from "../src/game/items.js";
import {ComputerTerminal} from "../src/game/terminal.js";
import {PixelOS} from "../src/game/os.js";
import {Assembler,CPU} from "../src/game/cpu.js";
import {AssemblyCompiler,Linker} from "../src/game/toolchain.js";

function makeOS(){
  const computer=makeItem("comp_adv");
  const os=new PixelOS(computer,computer.runtime,new ComputerTerminal());
  os.processes.schedule=()=>{};
  return os;
}

test("stage 3 parent observes zombie and wait reaps with status",()=>{
  const os=makeOS(),binary=new Assembler().assembleBinary(".protected\nHALT");
  const parent=os.processes.spawn("parent.bin",binary,{parentPid:0,autoReap:false});
  const child=os.processes.spawn("child.bin",binary,{parentPid:parent.pid,pgid:parent.pid});
  os.processes.runNext(); // parent
  os.processes.runNext(); // child

  assert.equal(child.ppid,parent.pid);
  assert.equal(child.pgid,parent.pid);
  assert.equal(child.state,"zombie");
  assert.ok(parent.pendingEvents.some(event=>event.type==="CHLD"&&event.pid===child.pid));
  const waited=os.processes.wait(parent.pid,child.pid);
  assert.deepEqual(waited,{pid:child.pid,status:0,state:"zombie"});
  assert.equal(os.processes.processes.includes(child),false);
});

test("stage 3 PID is reused only after reap",()=>{
  const os=makeOS(),binary=new Assembler().assembleBinary(".protected\nHALT");
  const parent=os.processes.spawn("parent.bin",binary,{autoReap:false});
  const child=os.processes.spawn("one.bin",binary,{parentPid:parent.pid});
  os.processes.exit(child.pid,7);
  const before=os.processes.spawn("before.bin",binary,{parentPid:parent.pid});
  assert.notEqual(before.pid,child.pid);
  os.processes.wait(parent.pid,child.pid);
  const after=os.processes.spawn("after.bin",binary,{parentPid:parent.pid});
  assert.equal(after.pid,child.pid);
});

test("host-prompt commands are auto-reaped instead of lingering as exited",()=>{
  const os=makeOS(),binary=new Assembler().assembleBinary(".protected\nHALT");
  const command=os.processes.spawn("cat",binary);
  os.processes.runNext();
  assert.equal(os.processes.processes.some(process=>process.pid===command.pid),false);
  const replacement=os.processes.spawn("chown",binary);
  assert.equal(replacement.pid,command.pid,"auto-reaped PID is reusable");
});

test("stage 5 child inherits credentials and environment unless root overrides them",()=>{
  const os=makeOS(),binary=new Assembler().assembleBinary(".protected\nHALT");
  const parent=os.processes.spawn("login.bin",binary,
    {uid:1000,gid:100,euid:1000,egid:100,autoReap:false});
  parent.env={USER:"guest",HOME:"/home/guest",SHELL:"/bin/sh"};
  const shell=os.processes.spawn("sh.bin",binary,{parentPid:parent.pid});
  assert.deepEqual([shell.uid,shell.gid,shell.euid,shell.egid],[1000,100,1000,100]);
  assert.deepEqual(shell.env,parent.env);
  assert.notEqual(shell.env,parent.env);
  const service=os.processes.spawn("service.bin",binary,
    {parentPid:parent.pid,uid:2000,gid:200});
  assert.deepEqual([service.uid,service.gid,service.euid,service.egid],[2000,200,2000,200]);
});

test("stage 3 exit adopts orphans at PID 1 and TERM kills sleeping child",()=>{
  const os=makeOS(),binary=new Assembler().assembleBinary(".protected\nHALT");
  const init=os.processes.spawn("init.bin",binary,{parentPid:0,autoReap:false});
  assert.equal(init.pid,1);
  const parent=os.processes.spawn("parent.bin",binary,{parentPid:init.pid});
  const child=os.processes.spawn("child.bin",binary,{parentPid:parent.pid});
  child.state="sleeping";
  os.processes.exit(parent.pid,0);
  assert.equal(child.ppid,1);
  assert.equal(os.processes.kill(child.pid,"TERM"),true);
  assert.equal(child.state,"zombie");
  assert.equal(child.exitCode,143);
});

test("stage 3 exec validates and reserves before replacing address space",()=>{
  const os=makeOS(),assembler=new Assembler();
  const oldBinary=assembler.assembleBinary(".protected\nLOAD_A 1\nHALT");
  const replacement=assembler.assembleBinary(".protected\nLOAD_A 2\nHALT");
  const process=os.processes.spawn("old.bin",oldBinary,{autoReap:false});
  const original={name:process.name,binary:process.binary,memory:process.memory};

  assert.throws(()=>os.processes.exec(process.pid,"bad.bin",Uint8Array.of(1,2,3)),
    /сигнатур|формат|PCVM/);
  assert.equal(process.name,original.name);
  assert.equal(process.binary,original.binary);
  assert.equal(process.memory,original.memory);

  os.memory.size=original.memory.size;
  assert.throws(()=>os.processes.exec(process.pid,"new.bin",replacement),
    /недостаточно оперативной памяти/);
  assert.equal(process.name,original.name);
  assert.equal(process.memory,original.memory);
});

test("stage 3 Assembly kernel owns PCB states and lifecycle entry points",()=>{
  const source=fs.readFileSync(
    new URL("../system/unix/kernel/process.asm",import.meta.url),"utf8");
  for(const state of ["STATE_READY","STATE_RUNNING","STATE_SLEEPING",
    "STATE_STOPPED","STATE_ZOMBIE","STATE_FAULTED"])
    assert.match(source,new RegExp(`${state}: \\.equ`));
  for(const routine of ["process_spawn","process_exec_commit","process_exit",
    "process_fault","process_wait","process_kill","process_adopt_orphans"])
    assert.match(source,new RegExp(`\\.export ${routine}`));
});

test("stage 3 protected syscall is dispatched and returned by Assembly",()=>{
  let hostPidCalls=0;
  const cpu=new CPU(8192,undefined,undefined,{
    kernelManagedSyscalls:true,
    pid:()=>{hostPidCalls++;return 999;}
  });
  const program=new Assembler().assemble(`
    .protected
    PM_ENABLE
    LOAD_A 4096
    SET_ULIMIT
    LOAD_A 4096
    SET_UBASE
    LOAD_A 4096
    SET_KSP
    LOAD_A 0
    SET_IVT
    LOAD_A syscall_handler
    LOAD_B 128
    STORE32_A_B
    LOAD_A user_main
    LOAD_B 3000
    ENTER_USER
  user_main:
    SYSCALL 5
    HALT
  syscall_handler:
    KGET_FAULT
    LOAD_D 5
    CMP_A_D
    JNZ unsupported
    LOAD_A 77
    LOAD_D 0
    SYSRET
  unsupported:
    LOAD_A -1
    LOAD_D -38
    SYSRET
  `);
  cpu.run(program);
  assert.equal(cpu.r.MODE,"user");
  assert.equal(cpu.r.A,77);
  assert.equal(cpu.r.D,0);
  assert.equal(hostPidCalls,0,"host process policy must not run");
});

test("stage 3 Assembly PCB executes spawn -> exit -> wait -> reap",()=>{
  const assembler=new Assembler(),compiler=new AssemblyCompiler();
  const harness=compiler.compile(`
    .protected
    .export main
    .import process_init
    .import process_spawn
    .import process_exit
    .import process_wait
    .import process_table
    .org 6000
    child_pid: .dword 0
  main:
    CALL process_init
    LOAD_A 1
    LOAD_D 1
    CALL process_spawn
    LOAD_B child_pid
    STORE32_A_B
    LOAD_C 7
    CALL process_exit
    LOAD_A 1
    LOAD_C 2
    CALL process_wait
    HALT
  `,"stage3-harness.asm");
  const processSource=fs.readFileSync(
    new URL("../system/unix/kernel/process.asm",import.meta.url),"utf8");
  const binary=new Linker(assembler).link([
    harness,compiler.compile(processSource,"process.asm")
  ]);
  const cpu=new CPU(16384);
  cpu.run(assembler.decodeBinary(binary));
  assert.equal(cpu.r.A,2,"wait returns reaped child PID");
  assert.equal(cpu.view.getUint32(6000,true),2);
  assert.equal(cpu.view.getUint32(4096+2*64,true),0,"reap clears PCB PID");
  assert.equal(cpu.view.getUint32(4096+64+8,true),1,"PID 1 keeps PGID 1");
});

test("stage 3 Assembly PCB adopts orphans and applies TERM status",()=>{
  const assembler=new Assembler(),compiler=new AssemblyCompiler();
  const harness=compiler.compile(`
    .protected
    .export main
    .import process_init
    .import process_spawn
    .import process_exit
    .import process_kill
  main:
    CALL process_init
    LOAD_A 1
    LOAD_D 1
    CALL process_spawn
    LOAD_A 2
    LOAD_D 2
    CALL process_spawn
    LOAD_A 2
    LOAD_C 0
    CALL process_exit
    LOAD_A 3
    LOAD_C 1
    CALL process_kill
    HALT
  `,"stage3-events.asm");
  const processSource=fs.readFileSync(
    new URL("../system/unix/kernel/process.asm",import.meta.url),"utf8");
  const binary=new Linker(assembler).link([
    harness,compiler.compile(processSource,"process.asm")
  ]);
  const cpu=new CPU(16384);
  cpu.run(assembler.decodeBinary(binary));
  const child=4096+3*64;
  assert.equal(cpu.view.getUint32(child+4,true),1,"orphan is adopted by PID 1");
  assert.equal(cpu.view.getUint32(child+12,true),4,"TERM leaves a zombie");
  assert.equal(cpu.view.getInt32(child+16,true),143);
});
