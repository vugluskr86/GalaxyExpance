import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {Assembler,CPU} from "../src/game/cpu.js";
import {ComputerTerminal} from "../src/game/terminal.js";
import {PROCESS_INFO_LAYOUT} from "../src/game/protected-mode.js";

const encoder=new TextEncoder();
function processRecord({pid,ppid=1,uid=0,gid=0,state=0,ticks=0,memory=0,
  preemptions=0,command=""}){
  const data=new Uint8Array(PROCESS_INFO_LAYOUT.bytes),view=new DataView(data.buffer);
  view.setUint32(PROCESS_INFO_LAYOUT.PID,pid,true);
  view.setUint32(PROCESS_INFO_LAYOUT.PPID,ppid,true);
  view.setUint32(PROCESS_INFO_LAYOUT.UID,uid,true);
  view.setUint32(PROCESS_INFO_LAYOUT.GID,gid,true);
  view.setUint32(PROCESS_INFO_LAYOUT.STATE,state,true);
  view.setUint32(PROCESS_INFO_LAYOUT.TICKS,ticks,true);
  view.setUint32(PROCESS_INFO_LAYOUT.PREEMPTIONS,preemptions,true);
  view.setUint32(PROCESS_INFO_LAYOUT.MEMORY_BYTES,memory,true);
  data.set(encoder.encode(command).subarray(0,63),PROCESS_INFO_LAYOUT.COMMAND);
  return data;
}
function pidSnapshot(pids){
  const data=new Uint8Array(pids.length*4),view=new DataView(data.buffer);
  pids.forEach((pid,index)=>view.setUint32(index*4,pid,true));
  return data;
}
function executeTop(system,terminal=new ComputerTerminal(null,100,44),maxSteps=500000){
  const assembler=new Assembler();
  const binary=new Uint8Array(fs.readFileSync(
    new URL("../system/unix/build/top.bin",import.meta.url)));
  const output=[],cpu=new CPU(65536,value=>output.push(String(value)),terminal,system);
  const result=cpu.run(assembler.decodeBinary(binary),maxSteps,true,{preempt:true});
  return{assembler,binary,output,terminal,result};
}

test("top is a separate protected binary using only syscall ABI",()=>{
  const assembler=new Assembler();
  const binary=new Uint8Array(fs.readFileSync(
    new URL("../system/unix/build/top.bin",import.meta.url)));
  assert.equal(binary[5]&1,1);
  const program=assembler.decodeBinary(binary);
  assert.equal(program.some(ins=>[
    "PROC_LIST","MEM_INFO","TERM_CLEAR","TTY_READLINE"
  ].includes(ins.op)),false);
});

test("top renders sysinfo and ticks-sorted safe process records, then q exits",()=>{
  const terminal=new ComputerTerminal(null,100,44);
  terminal.lineQueue.push("q");
  const records=new Map([
    [2,processRecord({pid:2,uid:1000,state:1,ticks:900,memory:4096,command:"worker"})],
    [3,processRecord({pid:3,uid:1000,state:0,ticks:700,memory:2048,command:"ready-job"})],
    [4,processRecord({pid:4,uid:1000,state:4,ticks:500,memory:1024,command:"zombie-job"})],
    [5,processRecord({pid:5,uid:1000,state:5,ticks:300,memory:1024,command:"faulted-job"})],
    [1,processRecord({pid:1,uid:0,state:2,ticks:100,memory:8192,command:"init"})],
  ]);
  const requested=[];
  const context=executeTop({
    sysInfo:()=>({uptimeSec:42,uptimeNsec:0,totalRam:65536,freeRam:32768,
      totalDrive:131072,freeDrive:65536,processes:5,cpuThreads:4}),
    procList:()=>pidSnapshot([2,3,4,5,99,1]),
    procInfo:pid=>{requested.push(pid);return records.get(pid)||null;},
    sleep:()=>{},
    procExit:()=>true,
  },terminal);
  assert.equal(context.result.halted,true);
  const text=context.output.join("");
  assert.deepEqual(requested,[2,3,4,5,99,1]);
  assert.match(text,/top - up 42 RAM 32768\/65536 processes 5 threads 4/);
  assert.match(text,/PID USER STATE TICKS MEM COMMAND/);
  assert.ok(text.indexOf("worker")<text.indexOf("init"),`ticks order is preserved: ${text}`);
  assert.doesNotMatch(text,/99/,"disappeared PID is skipped");
  assert.match(text,/2 1000 running\s+900 4096 worker/);
  assert.match(text,/ready\s+700/);
  assert.match(text,/zombie\s+500/);
  assert.match(text,/faulted\s+300/);
  assert.match(text,/sleeping\s+100/);
});

test("process_info record contains no register or kernel-pointer fields",()=>{
  assert.deepEqual(Object.keys(PROCESS_INFO_LAYOUT),[
    "bytes","alignment","PID","PPID","UID","GID","STATE","EXIT_STATUS","TICKS",
    "PREEMPTIONS","MEMORY_BYTES","START_TIME_SEC","START_TIME_NSEC","COMMAND",
    "RESERVED0","RESERVED1","RESERVED2","RESERVED3","RESERVED4"
  ]);
  for(const forbidden of ["PC","SP","KSP","UBASE","ULIMIT","A","B","C","D"])
    assert.equal(Object.hasOwn(PROCESS_INFO_LAYOUT,forbidden),false);
});
