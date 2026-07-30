import test from "node:test";
import assert from "node:assert/strict";
import { Assembler, CPU, CPUFault, ComputerRuntime, ISA_TABLE, OPCODES, OPERAND_COUNTS } from "../src/game/cpu.js";
import { ComputerTerminal } from "../src/game/terminal.js";
import { makeItem } from "../src/game/items.js";
import fs from "node:fs";
import { AssemblyCompiler, Linker } from "../src/game/toolchain.js";
import { MemoryManager, PixelOS } from "../src/game/os.js";
import {
  ABI_LIMITS,CONTEXT_LAYOUT,DEBUG_REGS_LAYOUT,DIRENT_LAYOUT,ERRNO,
  IVT_LAYOUT,MEMORY_PERMISSIONS,OPEN_FLAGS,PROCESS_INFO_LAYOUT,
  PROCESS_MEMORY_LAYOUT,PROCESS_STATES,PROTECTED_EXCEPTIONS,PROTECTED_FEATURE,
  PROTECTED_ISA_VERSION,PROTECTED_OPCODES,PCVM_V3_HEADER,
  SEEK_WHENCE,STAT_LAYOUT,SYSCALLS,SYSCALL_ERRORS,
  SYSINFO_LAYOUT,TIMESPEC_LAYOUT,UTSNAME_LAYOUT,
  INODE_TYPES,SYSCALL_ARG_SPECS,generateAssemblyConstants,contextFrameBytes,
} from "../src/game/protected-mode.js";

const execute = (source, terminal=new ComputerTerminal()) => {
  const output=[];
  const cpu=new CPU(8192,value=>output.push(String(value)),terminal);
  return { output, terminal, result:cpu.run(new Assembler().assemble(source)) };
};

test("assembler resolves labels and CPU executes a loop", () => {
  const { output, result }=execute(`
    LOAD_A 3
    loop: DEC_A
    JNZ loop
    PRINT_A
    HALT
  `);
  assert.deepEqual(output,["0"]);
  assert.equal(result.registers.includes("A=0"),true);
});

test("assembler emits PCVM machine code which can be decoded and executed",()=>{
  const assembler=new Assembler();
  const binary=assembler.assembleBinary("LOAD_A 40\nLOAD_B 2\nADD_A_B\nPRINT_A\nHALT");
  assert.deepEqual(Array.from(binary.slice(0,4)),[0x50,0x43,0x56,0x4d]);
  const output=[];
  new CPU(8192,value=>output.push(String(value))).run(assembler.decodeBinary(binary));
  assert.deepEqual(output,["42"]);
});

test("ISA has a fixed complete table of 134 opcodes and operand counts",()=>{
  assert.equal(ISA_TABLE.length,134);
  assert.deepEqual(ISA_TABLE.map(row=>row.opcode),Array.from({length:134},(_,i)=>i+1));
  assert.equal(new Set(ISA_TABLE.map(row=>row.name)).size,134);
  assert.equal(OPCODES.LOAD_A,1);
  assert.equal(OPCODES.HALT,134);
  assert.equal(OPERAND_COUNTS.LOAD_A,1);
  assert.equal(OPERAND_COUNTS.VSET,5);
  assert.equal(OPERAND_COUNTS.GFX_RECT,6);
  assert.equal(OPERAND_COUNTS.HALT,0);
});

test("protected-mode v3 specification has stable non-overlapping ABI",()=>{
  assert.equal(PROTECTED_ISA_VERSION,3);
  assert.equal(PROTECTED_FEATURE,1);
  assert.equal(PCVM_V3_HEADER.bytes,9);
  assert.equal(PCVM_V3_HEADER.instructionCount,7);
  const legacyOpcodes=new Set(ISA_TABLE.map(row=>row.opcode));
  const extension=Object.values(PROTECTED_OPCODES);
  assert.deepEqual(extension.map(row=>row.opcode),
    Array.from({length:15},(_,index)=>0x87+index));
  assert.equal(extension.some(row=>legacyOpcodes.has(row.opcode)),false);
  assert.equal(PROTECTED_OPCODES.SYSCALL.argc,1);
  assert.equal(PROTECTED_OPCODES.SYSCALL.privileged,false);
  assert.equal(PROTECTED_OPCODES.IRET.privileged,true);
  assert.equal(PROTECTED_OPCODES.KGET_FAULT.privileged,true);
  assert.equal(PROTECTED_OPCODES.KGET_ARG.argc,1);
  assert.equal(PROTECTED_OPCODES.KCALL_HOST.privileged,true);
  assert.equal(PROTECTED_OPCODES.SYSRET.privileged,true);
  assert.equal(IVT_LAYOUT.entries*IVT_LAYOUT.entryBytes,IVT_LAYOUT.bytes);
  assert.equal(PROTECTED_EXCEPTIONS.SYSCALL,32);
  assert.equal(SYSCALLS.TTY_WRITE,0x41);
  assert.equal(CONTEXT_LAYOUT.fixedBytes%CONTEXT_LAYOUT.alignment,0);
  assert.equal(contextFrameBytes(0),224);
  assert.equal(contextFrameBytes(1),240);
  assert.throws(()=>contextFrameBytes(-1),/returnDepth/);
});

test("PCVM v3 encodes protected opcodes and executes SYSCALL in user mode",()=>{
  const assembler=new Assembler();
  const binary=assembler.assembleBinary(`
    .protected
    LOAD_A 900
    SET_KSP
    PM_ENABLE
    LOAD_A 128
    SET_ULIMIT
    LOAD_A 256
    SET_UBASE
    LOAD_A 64
    SET_IVT
    LOAD_A user
    LOAD_B 128
    ENTER_USER
    user:
    SYSCALL 5
    HALT
  `);
  assert.deepEqual(Array.from(binary.slice(0,9)),
    [0x50,0x43,0x56,0x4d,3,PROTECTED_FEATURE,0,14,0]);
  const program=assembler.decodeBinary(binary);
  assert.equal(program.version,3);
  assert.equal(program.featureFlags,PROTECTED_FEATURE);
  assert.deepEqual(program.slice(-3).map(ins=>ins.op),["ENTER_USER","SYSCALL","HALT"]);
  const cpu=new CPU(1024,()=>{},null,{pid:()=>77});
  cpu.run(program);
  assert.equal(cpu.r.MODE,"user");
  assert.equal(cpu.r.A,77);
  assert.equal(cpu.r.D,SYSCALL_ERRORS.OK);

  const invalid=binary.slice();
  invalid[5]=0;
  assert.throws(()=>assembler.decodeBinary(invalid),/protected feature/);
});

test("protected user mode translates memory and enforces the whole range",()=>{
  const assembler=new Assembler(),cpu=new CPU(512);
  cpu.configureProtectedMode({mode:"user",ubase:128,ulimit:64,ksp:512});
  cpu.r.SP=64;
  cpu.run(assembler.assemble(`
    LOAD_A 77
    STORE_A 0
    LOAD_B 8
    STORE32_A_B
    PUSH_A
    LOAD_A 0
    POP_A
    HALT
  `),1000,false);
  assert.equal(cpu.bytes[128],77);
  assert.equal(cpu.view.getInt32(136,true),77);
  assert.equal(cpu.view.getInt32(188,true),77);
  assert.equal(cpu.r.A,77);
  assert.equal(cpu.r.SP,64);
  assert.equal(cpu.bytes[0],0);

  assert.throws(()=>cpu.addr(61,4),
    /виртуальный адрес 61/);
  assert.throws(()=>cpu.addr(-1,1),
    /виртуальный адрес -1/);
});

test("protected fault enters IVT and IRET restores the full user context",()=>{
  const assembler=new Assembler(),cpu=new CPU(2048);
  const program=assembler.assemble(`
    LOAD_B 65
    LOAD32_A_B
    HALT
    LOAD_A 999
    HALT
  `);
  cpu.configureProtectedMode({mode:"kernel",ubase:256,ulimit:64,ksp:1800,ivt:64,ie:true});
  cpu.view.setUint32(64+PROTECTED_EXCEPTIONS.MEMORY_FAULT*4,3,true);
  Object.assign(cpu.r,{A:17,C:19,D:23,FA:1.5,FB:2.5,FC:3.5,FD:4.5,Z:true});
  Object.assign(cpu.r.V[3],{x:11,y:12,z:13,w:14});
  cpu.callStack=[7,9];
  cpu.enterUserMode(0,64);

  cpu.run(program,100,false);
  assert.equal(cpu.r.MODE,"kernel");
  assert.equal(cpu.r.PC,5);
  assert.equal(cpu.r.CAUSE,PROTECTED_EXCEPTIONS.MEMORY_FAULT);
  assert.equal(cpu.r.FAULT_ADDR,65);
  assert.equal(cpu.r.IE,false);
  assert.equal(cpu.view.getInt32(cpu.r.KSP+CONTEXT_LAYOUT.PC,true),1);
  assert.equal(cpu.view.getInt32(cpu.r.KSP+CONTEXT_LAYOUT.RETURN_DEPTH,true),2);

  cpu.interruptReturn();
  assert.equal(cpu.r.MODE,"user");
  assert.equal(cpu.r.PC,1);
  assert.equal(cpu.r.SP,64);
  assert.deepEqual([cpu.r.A,cpu.r.B,cpu.r.C,cpu.r.D],[17,65,19,23]);
  assert.deepEqual([cpu.r.FA,cpu.r.FB,cpu.r.FC,cpu.r.FD],[1.5,2.5,3.5,4.5]);
  assert.deepEqual([cpu.r.V[3].x,cpu.r.V[3].y,cpu.r.V[3].z,cpu.r.V[3].w],[11,12,13,14]);
  assert.deepEqual(cpu.callStack,[7,9]);
  assert.equal(cpu.r.Z,true);
  assert.equal(cpu.r.IE,true);
  assert.equal(cpu.r.KSP,1800);
  assert.equal(cpu.r.CAUSE,0);
});

test("privilege faults use IVT and faults in kernel mode panic",()=>{
  const cpu=new CPU(1024);
  cpu.configureProtectedMode({mode:"kernel",ubase:256,ulimit:64,ksp:900,ivt:64});
  cpu.view.setUint32(64+PROTECTED_EXCEPTIONS.PRIVILEGE_FAULT*4,12,true);
  cpu.enterUserMode(4,64);
  let fault;
  try{cpu.requireKernel();}catch(error){fault=error;}
  assert.ok(fault instanceof CPUFault);
  assert.equal(fault.cause,PROTECTED_EXCEPTIONS.PRIVILEGE_FAULT);
  cpu.dispatchFault(fault,4);
  assert.equal(cpu.r.MODE,"kernel");
  assert.equal(cpu.r.PC,12);
  cpu.interruptReturn();
  assert.equal(cpu.r.MODE,"user");
  assert.equal(cpu.r.PC,4);

  cpu.r.MODE="kernel";
  assert.throws(()=>cpu.dispatchFault(
    new CPUFault(PROTECTED_EXCEPTIONS.MEMORY_FAULT,99)),/kernel panic/);
});

test("protected syscalls validate user pointers and return through IRET",()=>{
  const files=new Map([["demo.bin",Uint8Array.of(10,20,30,40)]]);
  const cpu=new CPU(2048,()=>{},null,{
    fsRead:name=>files.get(name),
    fsList:()=>new TextEncoder().encode([...files.keys()].join("\n")),
    pid:()=>41
  });
  cpu.configureProtectedMode({mode:"kernel",ubase:256,ulimit:256,ksp:1800,ivt:64,ie:true});
  cpu.enterUserMode(7,256);
  cpu.bytes.set(new TextEncoder().encode("demo.bin"),256);
  Object.assign(cpu.r,{A:3,B:0,C:8,D:32});

  const result=cpu.systemCall(SYSCALLS.READ,8);
  assert.deepEqual(result,{A:3,B:0,C:8,D:0});
  assert.equal(cpu.r.MODE,"user");
  assert.equal(cpu.r.PC,8);
  assert.equal(cpu.r.A,3);
  assert.equal(cpu.r.D,SYSCALL_ERRORS.OK);
  assert.equal(cpu.r.KSP,1800);
  assert.equal(cpu.r.IE,true);
  assert.deepEqual(Array.from(cpu.bytes.slice(256+32,256+35)),[10,20,30]);

  Object.assign(cpu.r,{A:8,B:250,C:8,D:0});
  const invalid=cpu.systemCall(SYSCALLS.READ,9);
  assert.equal(invalid.A,-1);
  assert.equal(invalid.D,SYSCALL_ERRORS.BAD_ADDRESS);
  assert.equal(cpu.r.MODE,"user");
  assert.equal(cpu.r.PC,9);

  const pid=cpu.systemCall(SYSCALLS.GETPID,10);
  assert.equal(pid.A,41);
  assert.equal(pid.D,SYSCALL_ERRORS.OK);
});

test("legacy hardware and OS instructions are privileged in user mode",()=>{
  const assembler=new Assembler(),cpu=new CPU(1024);
  const program=assembler.assemble("FS_LIST\nHALT\nHALT");
  cpu.configureProtectedMode({mode:"kernel",ubase:256,ulimit:128,ksp:900,ivt:64});
  cpu.view.setUint32(64+PROTECTED_EXCEPTIONS.PRIVILEGE_FAULT*4,2,true);
  cpu.enterUserMode(0,128);
  cpu.run(program,100,false);
  assert.equal(cpu.r.MODE,"kernel");
  assert.equal(cpu.r.CAUSE,PROTECTED_EXCEPTIONS.PRIVILEGE_FAULT);
  assert.equal(cpu.r.PC,3);
});

test("protected translation covers SIMD, copies, strings and lexer cursors",()=>{
  const assembler=new Assembler(),terminal=new ComputerTerminal(),output=[];
  const cpu=new CPU(512,value=>output.push(String(value)),terminal);
  cpu.configureProtectedMode({mode:"user",ubase:192,ulimit:128});
  cpu.bytes.set(new TextEncoder().encode("OK one two"),200);
  cpu.r.B=8;cpu.r.C=2;
  cpu.systemCall(SYSCALLS.TTY_WRITE);
  assert.deepEqual(output,["OK"]);

  cpu.r.PC=0;cpu.r.B=11;cpu.r.C=18;cpu.r.D=1;
  cpu.run(assembler.assemble("STR_TOKEN\nHALT"),100,false);
  assert.equal(cpu.r.B,15);
  assert.equal(cpu.r.A,3);

  cpu.r.PC=0;cpu.r.B=8;cpu.r.C=18;
  cpu.run(assembler.assemble("LEX_TOKEN\nHALT"),100,false);
  assert.equal(cpu.r.B,8);
  assert.equal(cpu.r.D,10);

  cpu.bytes.set(Uint8Array.of(1,2,3,4),192+32);
  cpu.r.PC=0;cpu.r.B=32;cpu.r.C=48;cpu.r.D=4;
  cpu.run(assembler.assemble("MEM_COPY\nHALT"),100,false);
  assert.deepEqual(Array.from(cpu.bytes.slice(192+48,192+52)),[1,2,3,4]);

  cpu.writeVector(64,{x:1,y:2,z:3,w:4});
  assert.deepEqual([...new Float32Array(cpu.memory,192+64,4)],[1,2,3,4]);
  assert.throws(()=>cpu.writeVector(120,{x:0,y:0,z:0,w:0}),/виртуальный адрес 120/);
});

test("assembler and binary decoder enforce the fixed operand counts",()=>{
  const assembler=new Assembler();
  assert.throws(()=>assembler.assemble("LOAD_A\nHALT"),/LOAD_A требует операндов: 1/);
  const binary=assembler.assembleBinary("LOAD_A 7\nHALT");
  binary[8]=0;
  assert.throws(()=>assembler.decodeBinary(binary),/неверное число операндов LOAD_A/);
});

test("runtime rejects corrupt binary files",()=>{
  const computer=makeItem("comp_basic");
  assert.throws(()=>computer.runtime.runBinary(Uint8Array.of(1,2,3,4)),/сигнатура|повреждённый/);
});

test("SIMD aliases from the original example work", () => {
  const { output }=execute(`
    VSET V0, 1, 2, 3, 4
    VSET V1, 5, 6, 7, 8
    VADD_V0_V1
    LOAD_F 0.5
    VSCALE_V0
    PRINT_V V0
    HALT
  `);
  assert.deepEqual(output,["[3, 4, 5, 6]"]);
});

test("text terminal receives processor output", () => {
  const terminal=new ComputerTerminal();
  execute(`TERM_MODE text\nTERM_COLOR 0x00ff00, 0\nPRINT "READY"\nHALT`,terminal);
  assert.equal(terminal.mode,"text");
  assert.equal(terminal.fg,"#00ff00");
  assert.equal(terminal.lines[0],"READY");
});

test("graphics instructions call the terminal device", () => {
  const calls=[];
  const terminal={
    mode:"text", bg:"#000000", mouse:{x:0,y:0,buttons:0},
    setMode(mode){this.mode=mode;}, clear(){calls.push(["clear"]);},
    setColors(){}, print(){}, readKey(){return null;}, readWheel(){return 0;},
    pixel(...args){calls.push(["pixel",...args]);},
    line(...args){calls.push(["line",...args]);},
    rect(...args){calls.push(["rect",...args]);},
    circle(...args){calls.push(["circle",...args]);}
  };
  execute(`
    TERM_MODE graphics
    TERM_CLEAR
    GFX_PIXEL 10, 20, 0xff0000
    GFX_LINE 0, 0, 10, 10, 0xffffff
    GFX_RECT 2, 3, 20, 10, 0x00ff00, 1
    GFX_CIRCLE 50, 50, 8, 0x0000ff, 0
    HALT
  `,terminal);
  assert.deepEqual(calls,[
    ["clear"],
    ["pixel",10,20,0xff0000],
    ["line",0,0,10,10,0xffffff],
    ["rect",2,3,20,10,0x00ff00,true],
    ["circle",50,50,8,0x0000ff,false]
  ]);
});

test("keyboard and mouse input are visible to the CPU", () => {
  const terminal=new ComputerTerminal();
  terminal.keys.push({key:"A",code:"KeyA",keyCode:65});
  terminal.mouse={x:123,y:45,buttons:1,wheel:-2};
  const { output }=execute(`
    IN_KEY
    PRINT_A
    IN_MOUSE_X
    PRINT_A
    IN_MOUSE_Y
    PRINT_A
    IN_MOUSE_BUTTONS
    PRINT_A
    IN_MOUSE_WHEEL
    PRINT_A
    HALT
  `,terminal);
  assert.deepEqual(output,["65","123","45","1","-2"]);
  assert.equal(terminal.mouse.wheel,0);
});

test("graphics coordinates can come from CPU registers", () => {
  const calls=[];
  const terminal={
    bg:"#000", mouse:{x:0,y:0,buttons:0}, setMode(){}, clear(){}, setColors(){},
    print(){}, readKey(){return null;}, readWheel(){return 0;},
    pixel(...args){calls.push(args);}, line(){}, rect(){}, circle(){}
  };
  execute("LOAD_C 12\nLOAD_D 34\nGFX_PIXEL C, D, 0xff00ff\nHALT",terminal);
  assert.deepEqual(calls,[[12,34,0xff00ff]]);
});

test("graphics mode depends on the installed GPU", () => {
  const computer=makeItem("comp_basic");
  assert.throws(
    ()=>computer.runtime.run("GFX_PIXEL 0, 0, 0xffffff\nHALT",new ComputerTerminal()),
    /graphics/
  );
  computer.install(makeItem("gpu_graphics"));
  assert.doesNotThrow(
    ()=>computer.runtime.run("GFX_PIXEL 0, 0, 0xffffff\nHALT",new ComputerTerminal())
  );
});

test("runtime RAM size comes from the installed module", () => {
  const computer=makeItem("comp_basic");
  const runtime=new ComputerRuntime(computer);
  assert.equal(runtime.ramBytes,8*1024);
  computer.install(makeItem("ram_64"));
  assert.equal(runtime.ramBytes,64*1024);
});

test("Lissajous example computes and draws 256 points", () => {
  const source=fs.readFileSync(new URL("../examples/lissajous.asm",import.meta.url),"utf8");
  let circles=0,frames=0,started=false,ended=false;
  const terminal={
    bg:"#000", mouse:{x:0,y:0,buttons:0}, setMode(){}, clear(){}, setColors(){},
    print(){}, readKey(){return null;}, readWheel(){return 0;},
    pixel(){}, line(){}, rect(){}, circle(x,y){
      assert.ok(x>=40 && x<=380);
      assert.ok(y>=40 && y<=380);
      circles++;
    },
    beginAnimation(){started=true;},
    animationFrame(delay){assert.equal(delay,12); frames++;},
    endAnimation(){ended=true;}
  };
  const computer=makeItem("comp_adv");
  const result=computer.runtime.runBinary(new Assembler().assembleBinary(source),terminal);
  assert.equal(circles,256);
  assert.equal(frames,256);
  assert.equal(started,true);
  assert.equal(ended,true);
  assert.ok(result.steps>1000);
});

test("all bundled user examples use protected syscall ABI",()=>{
  const directory=new URL("../examples/",import.meta.url);
  const forbidden=/^(?:TERM_|GFX_|IN_|FS_|PROC_|IPC_|OS_PID|MEM_INFO)/;
  for(const name of fs.readdirSync(directory).filter(name=>name.endsWith(".asm"))){
    const source=fs.readFileSync(new URL(name,directory),"utf8");
    assert.match(source,/^\.protected$/m,`${name} must select PCVM v3`);
    const direct=source.split(/\r?\n/).map(line=>line.replace(/;.*$/,"").trim())
      .filter(line=>forbidden.test(line));
    assert.deepEqual(direct,[],`${name} bypasses syscall ABI`);
  }

  const computer=makeItem("comp_adv"),terminal=new ComputerTerminal();
  const os=new PixelOS(computer,computer.runtime,terminal);
  os.processes.schedule=()=>{};os.processes.quantum=100000;
  const source=fs.readFileSync(new URL("../examples/lissajous.asm",import.meta.url),"utf8");
  const process=os.processes.spawn("lissajous.bin",
    computer.runtime.assembler.assembleBinary(source));
  os.processes.runNext();
  assert.equal(process.state,"exited");
  assert.equal(process.protected,true);
  assert.equal(process.cause,0);
  assert.equal(terminal.mode,"graphics");
  assert.equal(terminal.frames.length,256);
});

test("BIOS lists hardware and automatically boots os.bin from DRIVE", () => {
  const computer=makeItem("comp_adv");
  const terminal=new ComputerTerminal();
  const boot=computer.runtime.boot(terminal);
  assert.equal(boot.file,"os.bin");
  assert.ok(boot.bios.output.some(line=>String(line).includes("CPU:")));
  assert.ok(boot.bios.output.some(line=>String(line).includes("Периферия 1")));
  assert.ok(boot.bios.output.some(line=>String(line).includes("KEYBOARD")));
  assert.ok(boot.os.output.includes("PIXEL COSMOS OS"));
  assert.match(boot.os.registers,/MODE=kernel/);
  assert.match(boot.bios.registers,/MODE=real/);
  assert.equal(computer.memory.get("os.bin").data[4],PROTECTED_ISA_VERSION);
  assert.ok(terminal.lines.some(line=>line.includes("PIXEL COSMOS BIOS")));
  assert.ok(terminal.lines.some(line=>line.includes("Система загружена")));
});

test("BIOS reports a missing operating system", () => {
  const computer=makeItem("comp_basic");
  computer.memory.delete("os.bin");
  assert.throws(()=>computer.runtime.boot(new ComputerTerminal()),/не найден/);
});

test("static and dynamic linker resolve an external library",()=>{
  const assembler=new Assembler(),compiler=new AssemblyCompiler(),linker=new Linker(assembler);
  const main=compiler.compile(fs.readFileSync(new URL("../examples/process-main.asm",import.meta.url),"utf8"),"main");
  const lib=compiler.compile(fs.readFileSync(new URL("../examples/lib-math.asm",import.meta.url),"utf8"),"math");
  for(const dynamic of [false,true]){
    const linked=linker.link([main,lib],{dynamic});
    const executable=linker.loadExecutable(linked),output=[];
    new CPU(8192,x=>output.push(String(x)),new ComputerTerminal()).run(assembler.decodeBinary(executable));
    assert.ok(output.includes("42"));
  }
});

test("ABI stage 0: all syscall numbers are unique and follow reserved ranges",()=>{
  const numbers=Object.values(SYSCALLS);
  assert.equal(new Set(numbers).size,numbers.length,"duplicate syscall numbers detected");

  // check that legacy 0x01-0x07, 0x10-0x12, 0x20-0x25, 0x30-0x31, 0x40-0x44, 0x50-0x51, 0x60-0x66, 0x70-0x74 are preserved
  assert.equal(SYSCALLS.EXIT,0x01);
  assert.equal(SYSCALLS.YIELD,0x02);
  assert.equal(SYSCALLS.SPAWN,0x03);
  assert.equal(SYSCALLS.WAIT,0x04);
  assert.equal(SYSCALLS.GETPID,0x05);
  assert.equal(SYSCALLS.KILL,0x06);
  assert.equal(SYSCALLS.PROCESS_LIST,0x07);
  assert.equal(SYSCALLS.ALLOC,0x10);
  assert.equal(SYSCALLS.FREE,0x11);
  assert.equal(SYSCALLS.MEM_INFO,0x12);
  assert.equal(SYSCALLS.OPEN,0x20);
  assert.equal(SYSCALLS.READ,0x21);
  assert.equal(SYSCALLS.WRITE,0x22);
  assert.equal(SYSCALLS.CLOSE,0x23);
  assert.equal(SYSCALLS.LIST,0x24);
  assert.equal(SYSCALLS.DELETE,0x25);
  assert.equal(SYSCALLS.IPC_SEND,0x30);
  assert.equal(SYSCALLS.IPC_RECV,0x31);
  assert.equal(SYSCALLS.TTY_READ,0x40);
  assert.equal(SYSCALLS.TTY_WRITE,0x41);
  assert.equal(SYSCALLS.TTY_MODE,0x42);
  assert.equal(SYSCALLS.TTY_CLEAR,0x43);
  assert.equal(SYSCALLS.TTY_COLOR,0x44);
  assert.equal(SYSCALLS.TIME,0x50);
  assert.equal(SYSCALLS.SLEEP,0x51);
  assert.equal(SYSCALLS.GFX_PIXEL,0x60);
  assert.equal(SYSCALLS.GFX_LINE,0x61);
  assert.equal(SYSCALLS.GFX_RECT,0x62);
  assert.equal(SYSCALLS.GFX_CIRCLE,0x63);
  assert.equal(SYSCALLS.GFX_BEGIN,0x64);
  assert.equal(SYSCALLS.GFX_FRAME,0x65);
  assert.equal(SYSCALLS.GFX_END,0x66);
  assert.equal(SYSCALLS.INPUT_KEY,0x70);
  assert.equal(SYSCALLS.INPUT_MOUSE_X,0x71);
  assert.equal(SYSCALLS.INPUT_MOUSE_Y,0x72);
  assert.equal(SYSCALLS.INPUT_MOUSE_BUTTONS,0x73);
  assert.equal(SYSCALLS.INPUT_MOUSE_WHEEL,0x74);

  // new stage 0 syscalls
  assert.equal(SYSCALLS.EXEC,0x08);
  assert.equal(SYSCALLS.GETPPID,0x09);
  assert.equal(SYSCALLS.PROCESS_INFO,0x0A);
  assert.equal(SYSCALLS.DUP,0x13);
  assert.equal(SYSCALLS.DUP2,0x14);
  assert.equal(SYSCALLS.SEEK,0x26);
  assert.equal(SYSCALLS.STAT,0x27);
  assert.equal(SYSCALLS.READDIR,0x28);
  assert.equal(SYSCALLS.MKDIR,0x29);
  assert.equal(SYSCALLS.UNLINK,0x2A);
  assert.equal(SYSCALLS.RENAME,0x2B);
  assert.equal(SYSCALLS.CHMOD,0x2C);
  assert.equal(SYSCALLS.CHOWN,0x2D);
  assert.equal(SYSCALLS.GETCWD,0x2E);
  assert.equal(SYSCALLS.CHDIR,0x2F);
  assert.equal(SYSCALLS.UNAME,0x52);
  assert.equal(SYSCALLS.SYSINFO,0x53);
  assert.equal(SYSCALLS.DEBUG_READ_REGS,0x80);
  assert.equal(SYSCALLS.DEBUG_READ_MEM,0x81);
  assert.equal(SYSCALLS.DEBUG_SET_BREAK,0x82);
  assert.equal(SYSCALLS.DEBUG_CLEAR_BREAK,0x83);
  assert.equal(SYSCALLS.DEBUG_CONTINUE,0x84);
  assert.equal(SYSCALLS.DEBUG_STEP,0x85);

  // verify ranges
  const ranges={
    process:[0x01,0x0F],memory:[0x10,0x1F],files:[0x20,0x2F],
    ipc:[0x30,0x3F],terminal:[0x40,0x4F],time:[0x50,0x5F],
    graphics:[0x60,0x6F],input:[0x70,0x7F],debug:[0x80,0x8F]
  };
  for(const [group,[min,max]] of Object.entries(ranges)){
    for(const number of numbers){
      if(number>=min&&number<=max)continue;
    }
    // each syscall must be in exactly one defined range
  }
  for(const number of numbers){
    const inRange=Object.entries(ranges).some(([,r])=>number>=r[0]&&number<=r[1]);
    assert.ok(inRange,
      `syscall 0x${number.toString(16)} is not in any reserved range`);
  }
});

test("ABI stage 0: errno constants match Linux values and legacy aliases work",()=>{
  assert.equal(ERRNO.OK,0);
  assert.equal(ERRNO.EPERM,1);
  assert.equal(ERRNO.ENOENT,2);
  assert.equal(ERRNO.ESRCH,3);
  assert.equal(ERRNO.EINTR,4);
  assert.equal(ERRNO.EIO,5);
  assert.equal(ERRNO.ENXIO,6);
  assert.equal(ERRNO.E2BIG,7);
  assert.equal(ERRNO.ENOEXEC,8);
  assert.equal(ERRNO.EBADF,9);
  assert.equal(ERRNO.ECHILD,10);
  assert.equal(ERRNO.EAGAIN,11);
  assert.equal(ERRNO.ENOMEM,12);
  assert.equal(ERRNO.EACCES,13);
  assert.equal(ERRNO.EFAULT,14);
  assert.equal(ERRNO.EBUSY,16);
  assert.equal(ERRNO.EEXIST,17);
  assert.equal(ERRNO.EXDEV,18);
  assert.equal(ERRNO.ENOTDIR,20);
  assert.equal(ERRNO.EISDIR,21);
  assert.equal(ERRNO.EINVAL,22);
  assert.equal(ERRNO.ENFILE,23);
  assert.equal(ERRNO.EMFILE,24);
  assert.equal(ERRNO.ENOSPC,28);
  assert.equal(ERRNO.ESPIPE,29);
  assert.equal(ERRNO.EROFS,30);
  assert.equal(ERRNO.EPIPE,32);
  assert.equal(ERRNO.ENAMETOOLONG,36);
  assert.equal(ERRNO.ENOSYS,38);

  // legacy aliases
  assert.equal(SYSCALL_ERRORS.NOT_FOUND,-ERRNO.ENOENT);
  assert.equal(SYSCALL_ERRORS.IO,-ERRNO.EIO);
  assert.equal(SYSCALL_ERRORS.BAD_FILE,-ERRNO.EBADF);
  assert.equal(SYSCALL_ERRORS.BAD_ADDRESS,-ERRNO.EFAULT);
  assert.equal(SYSCALL_ERRORS.BUSY,-ERRNO.EBUSY);
  assert.equal(SYSCALL_ERRORS.INVALID,-ERRNO.EINVAL);
  assert.equal(SYSCALL_ERRORS.NOT_SUPPORTED,-ERRNO.ENOSYS);
});

test("ABI stage 0: struct sizes and field offsets are correct",()=>{
  assert.equal(TIMESPEC_LAYOUT.bytes,8);
  assert.equal(TIMESPEC_LAYOUT.SEC,0);
  assert.equal(TIMESPEC_LAYOUT.NSEC,4);

  assert.equal(STAT_LAYOUT.bytes,56);
  assert.equal(STAT_LAYOUT.INO,0);
  assert.equal(STAT_LAYOUT.TYPE,4);
  assert.equal(STAT_LAYOUT.UID,8);
  assert.equal(STAT_LAYOUT.GID,12);
  assert.equal(STAT_LAYOUT.MODE,16);
  assert.equal(STAT_LAYOUT.SIZE,20);
  assert.equal(STAT_LAYOUT.NLINK,24);
  assert.equal(STAT_LAYOUT.MTIME_SEC,28);
  assert.equal(STAT_LAYOUT.MTIME_NSEC,32);
  assert.equal(STAT_LAYOUT.CTIME_SEC,36);
  assert.equal(STAT_LAYOUT.CTIME_NSEC,40);
  assert.equal(STAT_LAYOUT.DEVICE,44);

  assert.equal(DIRENT_LAYOUT.bytes,268);
  assert.equal(DIRENT_LAYOUT.INO,0);
  assert.equal(DIRENT_LAYOUT.TYPE,4);
  assert.equal(DIRENT_LAYOUT.NAME_LEN,8);
  assert.equal(DIRENT_LAYOUT.NAME,12);

  assert.equal(PROCESS_INFO_LAYOUT.bytes,128);
  assert.equal(PROCESS_INFO_LAYOUT.PID,0);
  assert.equal(PROCESS_INFO_LAYOUT.PPID,4);
  assert.equal(PROCESS_INFO_LAYOUT.UID,8);
  assert.equal(PROCESS_INFO_LAYOUT.GID,12);
  assert.equal(PROCESS_INFO_LAYOUT.STATE,16);
  assert.equal(PROCESS_INFO_LAYOUT.EXIT_STATUS,20);
  assert.equal(PROCESS_INFO_LAYOUT.TICKS,24);
  assert.equal(PROCESS_INFO_LAYOUT.PREEMPTIONS,28);
  assert.equal(PROCESS_INFO_LAYOUT.MEMORY_BYTES,32);
  assert.equal(PROCESS_INFO_LAYOUT.START_TIME_SEC,36);
  assert.equal(PROCESS_INFO_LAYOUT.START_TIME_NSEC,40);
  assert.equal(PROCESS_INFO_LAYOUT.COMMAND,44);

  assert.equal(DEBUG_REGS_LAYOUT.bytes,224);
  assert.equal(DEBUG_REGS_LAYOUT.PC,CONTEXT_LAYOUT.PC);

  assert.equal(SYSINFO_LAYOUT.bytes,40);
  assert.equal(SYSINFO_LAYOUT.UPTIME_SEC,0);
  assert.equal(SYSINFO_LAYOUT.TOTAL_RAM,8);
  assert.equal(SYSINFO_LAYOUT.FREE_RAM,12);
  assert.equal(SYSINFO_LAYOUT.TOTAL_DRIVE,16);
  assert.equal(SYSINFO_LAYOUT.FREE_DRIVE,20);
  assert.equal(SYSINFO_LAYOUT.PROCESSES,24);
  assert.equal(SYSINFO_LAYOUT.CPU_THREADS,28);

  assert.equal(UTSNAME_LAYOUT.bytes,384);
  assert.equal(UTSNAME_LAYOUT.SYSNAME,0);
  assert.equal(UTSNAME_LAYOUT.NODENAME,64);
  assert.equal(UTSNAME_LAYOUT.RELEASE,128);
  assert.equal(UTSNAME_LAYOUT.VERSION,192);
  assert.equal(UTSNAME_LAYOUT.MACHINE,256);
  assert.equal(UTSNAME_LAYOUT.RESERVED,320);
});

test("ABI stage 0: ABI limits are reasonable",()=>{
  assert.equal(ABI_LIMITS.NAME_MAX,255);
  assert.equal(ABI_LIMITS.PATH_MAX,1024);
  assert.equal(ABI_LIMITS.FD_MAX,32);
  assert.equal(ABI_LIMITS.ARG_MAX,2048);
  assert.equal(ABI_LIMITS.ENV_MAX,256);
  assert.equal(ABI_LIMITS.ENV_VALUE_MAX,2048);
  assert.equal(ABI_LIMITS.MAX_PROCESSES,256);
});

test("ABI stage 0: Assembly constants match host JS constants",()=>{
  const inc=generateAssemblyConstants();
  assert.ok(inc.length>500,"generated Assembly constants are too short");

  // verify that each JS SYSCALL entry appears exactly once in the generated .inc
  for(const [name,number] of Object.entries(SYSCALLS)){
    const expected=`SYS_${name}, 0x${number.toString(16)}`;
    const needle=`.equ SYS_${name},`;
    const found=inc.split("\n").filter(line=>line.trim().startsWith(needle));
    assert.equal(found.length,1,`syscall ${name} should appear exactly once in .inc`);
    assert.ok(found[0].includes(expected),
      `${name} .inc line mismatch: ${found[0].trim()} vs expected ${expected}`);
  }

  // verify ERRNO entries
  for(const [name,number] of Object.entries(ERRNO)){
    const found=inc.split("\n").filter(line=>line.includes(`.equ ${name},`));
    assert.equal(found.length,1,`errno ${name} should appear exactly once`);
  }

  // verify struct sizes
  for(const layoutName of ["TIMESPEC","STAT","DIRENT","PROCESS_INFO","DEBUG_REGS","SYSINFO","UTSNAME"]){
    const byteline=inc.split("\n").find(line=>
      line.includes(`.equ ${layoutName}_BYTES,`));
    assert.ok(byteline,`${layoutName}_BYTES missing from .inc`);
  }

  // verify enum constants
  assert.ok(inc.includes(".equ O_RDONLY, 0"));
  assert.ok(inc.includes(".equ SEEK_SET, 0"));
  assert.ok(inc.includes(".equ REGULAR, 0"));
  assert.ok(inc.includes(".equ READY, 0"));
  assert.ok(inc.includes(".equ PROTECTED_ISA_VERSION, 3"));
  assert.ok(inc.includes(".equ PROTECTED_FEATURE, 1"));
  assert.ok(inc.includes(".equ EXC_SYSCALL, 32"));
  assert.ok(inc.includes(".equ CONTEXT_FIXED_BYTES, 224"));
});

test("ABI stage 0: SYSCALL_ARG_SPECS covers all defined syscalls",()=>{
  const withSpecs=Object.keys(SYSCALL_ARG_SPECS).map(Number);
  for(const number of Object.values(SYSCALLS)){
    assert.ok(withSpecs.includes(number),
      `syscall 0x${number.toString(16)} has no argument spec`);
  }
});

test("ABI stage 0: OPEN_FLAGS, SEEK_WHENCE, INODE_TYPES, PROCESS_STATES are complete",()=>{
  assert.equal(OPEN_FLAGS.O_RDONLY,0);
  assert.equal(OPEN_FLAGS.O_WRONLY,1);
  assert.equal(OPEN_FLAGS.O_RDWR,2);
  assert.equal(OPEN_FLAGS.O_CREAT,4);
  assert.equal(OPEN_FLAGS.O_TRUNC,8);
  assert.equal(OPEN_FLAGS.O_APPEND,16);

  assert.equal(SEEK_WHENCE.SEEK_SET,0);
  assert.equal(SEEK_WHENCE.SEEK_CUR,1);
  assert.equal(SEEK_WHENCE.SEEK_END,2);

  assert.equal(INODE_TYPES.REGULAR,0);
  assert.equal(INODE_TYPES.DIRECTORY,1);
  assert.equal(INODE_TYPES.DEVICE,2);

  assert.equal(PROCESS_STATES.READY,0);
  assert.equal(PROCESS_STATES.RUNNING,1);
  assert.equal(PROCESS_STATES.SLEEPING,2);
  assert.equal(PROCESS_STATES.STOPPED,3);
  assert.equal(PROCESS_STATES.ZOMBIE,4);
  assert.equal(PROCESS_STATES.FAULTED,5);
});

test("linking examples produce static TEXT and dynamic DATA programs",()=>{
  const assembler=new Assembler(),compiler=new AssemblyCompiler(),linker=new Linker(assembler);
  const execute=(mainName,libraryName,dynamic)=>{
    const main=compiler.compile(
      fs.readFileSync(new URL(`../examples/${mainName}`,import.meta.url),"utf8"),mainName);
    const library=compiler.compile(
      fs.readFileSync(new URL(`../examples/${libraryName}`,import.meta.url),"utf8"),libraryName);
    const output=[],binary=linker.loadExecutable(linker.link([main,library],{dynamic}));
    new CPU(8192,value=>output.push(String(value)),new ComputerTerminal())
      .run(assembler.decodeBinary(binary));
    return output;
  };
  assert.ok(execute("static-link-main.asm","static-link-library.asm",false).includes("42"));
  assert.ok(execute("dynamic-link-main.asm","dynamic-link-library.asm",true).includes("73"));
});

test("PCOB v2 contains two-pass symbols and text/data relocations",()=>{
  const compiler=new AssemblyCompiler();
  const object=compiler.read(compiler.compile(`
    .import external
    .export main
    main:
    JMP local
    JZ local
    JNZ local
    CALL external
    LOAD_A payload
    local:
    HALT
    payload: .dword payload
  `,"reloc-test"));
  assert.equal(object.version,2);
  assert.deepEqual(object.symbols.find(symbol=>symbol.name==="main"),
    {name:"main",section:"TEXT",value:0,exported:true});
  assert.equal(object.symbols.find(symbol=>symbol.name==="local").value,5);
  assert.equal(object.symbols.find(symbol=>symbol.name==="payload").section,"DATA");
  assert.equal(object.symbols.find(symbol=>symbol.name==="external").section,"UND");
  assert.deepEqual(object.relocations.filter(item=>item.type==="ABS_TEXT").map(item=>item.opcode),
    ["JMP","JZ","JNZ","CALL"]);
  assert.equal(object.relocations.find(item=>item.opcode==="LOAD_A").type,"ABS_DATA");
  assert.equal(object.relocations.find(item=>item.section==="DATA").width,4);
});

test("linker validates relocation target sections",()=>{
  const assembler=new Assembler(),compiler=new AssemblyCompiler(),linker=new Linker(assembler);
  const caller=compiler.compile(".import value\nmain:\nCALL value\nHALT","caller");
  const data=compiler.compile(".export value\nvalue: .dword 1","data");
  assert.throws(()=>linker.link([caller,data]),/ожидалась TEXT/);
});

test("binary PCOB linker combines modules and applies external relocation",()=>{
  const assembler=new Assembler(),linker=new Linker(assembler);
  const hash=value=>{
    let result=0x811c9dc5;
    for(const byte of new TextEncoder().encode(value)){
      result^=byte;result=Math.imul(result,0x01000193);
    }
    return result|0;
  };
  const object=(payload,symbols,relocations)=>{
    const bytes=new Uint8Array(13+payload.length+symbols.length*16+relocations.length*16);
    bytes.set([0x50,0x43,0x4f,0x42,2]);const view=new DataView(bytes.buffer);
    view.setUint32(5,payload.length,true);view.setUint16(9,symbols.length,true);
    view.setUint16(11,relocations.length,true);let at=13;bytes.set(payload,at);at+=payload.length;
    for(const symbol of symbols){
      for(const value of symbol){view.setInt32(at,value,true);at+=4;}
    }
    for(const relocation of relocations){
      for(const value of relocation){view.setInt32(at,value,true);at+=4;}
    }
    return bytes;
  };
  const symbolHash=hash("double");
  const main=object(assembler.assembleBinary("LOAD_A 21\nCALL 0\nPRINT_A\nHALT"),
    [[symbolHash,0,0,1]],[[1,0,1,symbolHash]]);
  const library=object(assembler.assembleBinary("MOV_B_A\nADD_A_B\nRET"),
    [[symbolHash,1,0,2]],[]);
  for(const dynamic of [false,true]){
    const executable=linker.loadExecutable(linker.link([main,library],{dynamic})),output=[];
    new CPU(8192,value=>output.push(String(value))).run(assembler.decodeBinary(executable));
    assert.deepEqual(output,["42"]);
  }

  const source=fs.readFileSync(new URL("../system/linker.asm",import.meta.url),"utf8");
  const terminal=new ComputerTerminal(),files=new Map();
  terminal.lineQueue.push("main.obj math.obj");
  new CPU(65536,()=>{},terminal,{
    fsRead:name=>name==="main.obj"?main:name==="math.obj"?library:null,
    fsWrite:(name,data)=>files.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(source)));
  const selfHostedDynamic=files.get("a.dyn");
  const dynamicView=new DataView(selfHostedDynamic.buffer);
  const embeddedMainSize=dynamicView.getUint32(7,true);
  const embeddedMain=linker.compiler.read(selfHostedDynamic.slice(11,11+embeddedMainSize));
  assert.equal(assembler.decodeBinary(embeddedMain.payload)[1].args[0],4);
  const dynamicExecutable=linker.loadExecutable(selfHostedDynamic),output=[];
  new CPU(8192,value=>output.push(String(value)))
    .run(assembler.decodeBinary(dynamicExecutable));
  assert.deepEqual(output,["42"]);

  const staticTerminal=new ComputerTerminal(),staticFiles=new Map();
  staticTerminal.lineQueue.push("main.obj math.obj --static");
  new CPU(65536,()=>{},staticTerminal,{
    fsRead:name=>name==="main.obj"?main:name==="math.obj"?library:null,
    fsWrite:(name,data)=>staticFiles.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(source)));
  const staticExecutable=staticFiles.get("a.bin"),staticOutput=[];
  assert.equal(new TextDecoder().decode(staticExecutable.slice(0,4)),"PCVM");
  new CPU(8192,value=>staticOutput.push(String(value)))
    .run(assembler.decodeBinary(staticExecutable));
  assert.deepEqual(staticOutput,["42"]);

  const explicitDynamicTerminal=new ComputerTerminal(),explicitDynamicFiles=new Map();
  explicitDynamicTerminal.lineQueue.push("main.obj math.obj --dynamic");
  new CPU(65536,()=>{},explicitDynamicTerminal,{
    fsRead:name=>name==="main.obj"?main:name==="math.obj"?library:null,
    fsWrite:(name,data)=>explicitDynamicFiles.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(source)));
  assert.equal(new TextDecoder().decode(explicitDynamicFiles.get("a.dyn").slice(0,4)),"PCDL");

  const invalidModeTerminal=new ComputerTerminal(),invalidModeFiles=new Map();
  invalidModeTerminal.lineQueue.push("main.obj math.obj --unknown");
  new CPU(65536,()=>{},invalidModeTerminal,{
    fsRead:name=>name==="main.obj"?main:name==="math.obj"?library:null,
    fsWrite:(name,data)=>invalidModeFiles.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(source)));
  assert.equal(invalidModeFiles.size,0);

  const dataHash=hash("library_byte");
  const dataMain=object(assembler.assembleBinary("HALT\n.org 0\n.byte 1, 2, 3, 4"),[],[]);
  const dataLibrary=object(
    assembler.assembleBinary("LOAD_B 0\nLOAD8_A_B\nHALT\n.org 0\n.byte 77"),
    [[dataHash,2,0,2]],[[0,0,2,dataHash]]
  );
  const dataTerminal=new ComputerTerminal(),dataFiles=new Map();
  dataTerminal.lineQueue.push("data-main.obj data-lib.obj");
  new CPU(65536,()=>{},dataTerminal,{
    fsRead:name=>name==="data-main.obj"?dataMain:name==="data-lib.obj"?dataLibrary:null,
    fsWrite:(name,data)=>dataFiles.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(source)));
  const dataDynamic=dataFiles.get("a.dyn"),dataDynamicView=new DataView(dataDynamic.buffer);
  const firstDataObjectSize=dataDynamicView.getUint32(7,true);
  const secondDataObjectOffset=11+firstDataObjectSize;
  const secondDataObjectSize=dataDynamicView.getUint32(secondDataObjectOffset,true);
  const embeddedLibrary=linker.compiler.read(dataDynamic.slice(
    secondDataObjectOffset+4,secondDataObjectOffset+4+secondDataObjectSize
  ));
  assert.equal(assembler.decodeBinary(embeddedLibrary.payload)[0].args[0],4);

  const staticDataTerminal=new ComputerTerminal(),staticDataFiles=new Map();
  staticDataTerminal.lineQueue.push("data-main.obj data-lib.obj --static");
  new CPU(65536,()=>{},staticDataTerminal,{
    fsRead:name=>name==="data-main.obj"?dataMain:name==="data-lib.obj"?dataLibrary:null,
    fsWrite:(name,data)=>staticDataFiles.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(source)));
  const staticDataProgram=assembler.decodeBinary(staticDataFiles.get("a.bin"));
  assert.equal(staticDataProgram[1].args[0],4);
  assert.deepEqual(staticDataProgram.dataWrites.map(segment=>[
    segment.address,...segment.data
  ]),[[0,1,2,3,4],[4,77]]);

  const localHash=hash("local_entry");
  const localObject=object(
    assembler.assembleBinary('JMP 0\nPRINT "BAD"\nLOAD_A 17\nPRINT_A\nHALT'),
    [[localHash,1,2,0]],[[0,0,1,localHash]]
  );
  const localTerminal=new ComputerTerminal(),localFiles=new Map();
  localTerminal.lineQueue.push("local.obj");
  new CPU(65536,()=>{},localTerminal,{
    fsRead:name=>name==="local.obj"?localObject:null,
    fsWrite:(name,data)=>localFiles.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(source)));
  const localOutput=[];
  new CPU(8192,value=>localOutput.push(String(value)))
    .run(assembler.decodeBinary(localFiles.get("a.bin")));
  assert.deepEqual(localOutput,["17"]);

  const corruptLibrary=new Uint8Array(library);corruptLibrary[0]=0;
  const rejected=new Map(),rejectedTerminal=new ComputerTerminal();
  rejectedTerminal.lineQueue.push("main.obj broken.obj");
  new CPU(65536,()=>{},rejectedTerminal,{
    fsRead:name=>name==="main.obj"?main:name==="broken.obj"?corruptLibrary:null,
    fsWrite:(name,data)=>rejected.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(source)));
  assert.equal(rejected.has("a.dyn"),false);

  const truncated=new Uint8Array(library.slice(0,-1)),truncatedFiles=new Map();
  const truncatedTerminal=new ComputerTerminal();
  truncatedTerminal.lineQueue.push("main.obj truncated.obj");
  new CPU(65536,()=>{},truncatedTerminal,{
    fsRead:name=>name==="main.obj"?main:name==="truncated.obj"?truncated:null,
    fsWrite:(name,data)=>truncatedFiles.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(source)));
  assert.equal(truncatedFiles.has("a.dyn"),false);

  const noExports=object(assembler.assembleBinary("HALT"),[],[]);
  const unresolvedFiles=new Map(),unresolvedTerminal=new ComputerTerminal();
  unresolvedTerminal.lineQueue.push("main.obj empty.obj");
  new CPU(65536,()=>{},unresolvedTerminal,{
    fsRead:name=>name==="main.obj"?main:name==="empty.obj"?noExports:null,
    fsWrite:(name,data)=>unresolvedFiles.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(source)));
  assert.equal(unresolvedFiles.has("a.dyn"),false);

  const duplicateProvider=object(assembler.assembleBinary("HALT"),
    [[symbolHash,1,0,2]],[]);
  const duplicateFiles=new Map(),duplicateTerminal=new ComputerTerminal();
  duplicateTerminal.lineQueue.push("one.obj two.obj");
  new CPU(65536,()=>{},duplicateTerminal,{
    fsRead:name=>name==="one.obj"?duplicateProvider:name==="two.obj"?library:null,
    fsWrite:(name,data)=>duplicateFiles.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(source)));
  assert.equal(duplicateFiles.has("a.dyn"),false);

  const invalidRelocation=new Uint8Array(main);
  new DataView(invalidRelocation.buffer).setInt32(13+
    assembler.assembleBinary("LOAD_A 21\nCALL 0\nPRINT_A\nHALT").length+16+8,99,true);
  const invalidRelocationFiles=new Map(),invalidRelocationTerminal=new ComputerTerminal();
  invalidRelocationTerminal.lineQueue.push("bad-reloc.obj math.obj");
  new CPU(65536,()=>{},invalidRelocationTerminal,{
    fsRead:name=>name==="bad-reloc.obj"?invalidRelocation:name==="math.obj"?library:null,
    fsWrite:(name,data)=>invalidRelocationFiles.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(source)));
  assert.equal(invalidRelocationFiles.has("a.dyn"),false);

  const dataProvider=object(assembler.assembleBinary("HALT"),
    [[symbolHash,2,0,2]],[]);
  const wrongSectionFiles=new Map(),wrongSectionTerminal=new ComputerTerminal();
  wrongSectionTerminal.lineQueue.push("main.obj data.obj");
  new CPU(65536,()=>{},wrongSectionTerminal,{
    fsRead:name=>name==="main.obj"?main:name==="data.obj"?dataProvider:null,
    fsWrite:(name,data)=>wrongSectionFiles.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(source)));
  assert.equal(wrongSectionFiles.has("a.dyn"),false);

  const outOfBoundsRelocation=new Uint8Array(main);
  new DataView(outOfBoundsRelocation.buffer).setInt32(13+
    assembler.assembleBinary("LOAD_A 21\nCALL 0\nPRINT_A\nHALT").length+16,999,true);
  const boundsFiles=new Map(),boundsTerminal=new ComputerTerminal();
  boundsTerminal.lineQueue.push("bounds.obj math.obj");
  new CPU(65536,()=>{},boundsTerminal,{
    fsRead:name=>name==="bounds.obj"?outOfBoundsRelocation:name==="math.obj"?library:null,
    fsWrite:(name,data)=>boundsFiles.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(source)));
  assert.equal(boundsFiles.has("a.dyn"),false);

  const badOperandRelocation=new Uint8Array(main);
  new DataView(badOperandRelocation.buffer).setInt32(13+
    assembler.assembleBinary("LOAD_A 21\nCALL 0\nPRINT_A\nHALT").length+16+4,5,true);
  const operandFiles=new Map(),operandTerminal=new ComputerTerminal();
  operandTerminal.lineQueue.push("operand.obj math.obj");
  new CPU(65536,()=>{},operandTerminal,{
    fsRead:name=>name==="operand.obj"?badOperandRelocation:name==="math.obj"?library:null,
    fsWrite:(name,data)=>operandFiles.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(source)));
  assert.equal(operandFiles.has("a.dyn"),false);
});

test("memory manager allocates first-fit blocks and frees process memory",()=>{
  const memory=new MemoryManager(100);
  assert.deepEqual(memory.allocate(20,1),{start:0,size:20,pid:1});
  assert.deepEqual(memory.allocate(30,2),{start:20,size:30,pid:2});
  memory.free(1);
  assert.deepEqual(memory.allocate(10,3),{start:0,size:10,pid:3});
  assert.equal(memory.freeBytes(),60);
});

test("OS shell assembles, links and schedules a binary process",async()=>{
  const computer=makeItem("comp_adv"),terminal=new ComputerTerminal();
  const os=new PixelOS(computer,computer.runtime,terminal);
  computer.memory.save("main.asm",fs.readFileSync(new URL("../examples/process-main.asm",import.meta.url),"utf8"));
  computer.memory.save("math.asm",fs.readFileSync(new URL("../examples/lib-math.asm",import.meta.url),"utf8"));
  os.execute("asm main.asm main.obj");
  os.execute("asm math.asm math.obj");
  os.execute("link app.bin main.obj math.obj --dynamic");
  os.execute("run app.bin");
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(os.processes.processes.length,0,"host-launched command is auto-reaped");
  assert.ok(terminal.lines.some(line=>line.includes("42")));
  assert.equal(os.memory.freeBytes(),os.memory.size);
});

test("new PixelOS assemblies default to protected PCVM v3",()=>{
  const computer=makeItem("comp_adv"),os=new PixelOS(computer,computer.runtime,new ComputerTerminal());
  computer.memory.save("plain.asm","LOAD_A 7\nHALT");
  os.execute("asm plain.asm plain.obj");
  os.execute("link plain.bin plain.obj");
  const executable=computer.memory.get("plain.bin").data;
  const program=computer.runtime.assembler.decodeBinary(executable);
  assert.equal(program.version,PROTECTED_ISA_VERSION);
  assert.equal(program.featureFlags,PROTECTED_FEATURE);
  os.processes.schedule=()=>{};
  const process=os.processes.spawn("plain.bin",executable);
  os.processes.runNext();
  assert.equal(process.protected,true);
  assert.equal(process.state,"exited");
  assert.equal(process.machine.cpu.r.MODE,"user");
});

test("PixelOS loader creates IVT, kernel stack and isolated user memory",()=>{
  const computer=makeItem("comp_adv"),terminal=new ComputerTerminal();
  const os=new PixelOS(computer,computer.runtime,terminal),assembler=new Assembler();
  const binary=assembler.assembleBinary(`
    .protected
    .org 0
    marker: .byte 65
    SYSCALL 5
    PRINT_A
    LOAD_B marker
    LOAD8_A_B
    PRINT_A
    HALT
  `);
  const process=os.processes.spawn("user.bin",binary);
  os.processes.runNext();

  assert.equal(process.state,"exited");
  assert.equal(process.protected,true);
  assert.deepEqual(process.output,["1","65"]);
  assert.equal(process.machine.cpu.r.MODE,"user");
  assert.equal(process.layout.ivt.base,0);
  assert.equal(process.layout.kernelStack.base,IVT_LAYOUT.bytes);
  assert.equal(process.layout.kernelStack.top,PROCESS_MEMORY_LAYOUT.KERNEL_STACK_TOP);
  assert.equal(process.layout.user.base,PROCESS_MEMORY_LAYOUT.USER_BASE);
  assert.equal(process.machine.cpu.bytes[process.layout.user.base],65);
  assert.equal(process.machine.cpu.view.getUint32(
    PROTECTED_EXCEPTIONS.MEMORY_FAULT*IVT_LAYOUT.entryBytes,true),
    process.layout.faultHandler);
  assert.equal(os.memory.freeBytes(),os.memory.size);
});

test("PixelOS marks only a protected process faulted on privileged access",()=>{
  const computer=makeItem("comp_adv");
  const os=new PixelOS(computer,computer.runtime,new ComputerTerminal());
  const binary=new Assembler().assembleBinary(".protected\nFS_LIST\nHALT");
  const process=os.processes.spawn("bad.bin",binary);
  os.processes.runNext();

  assert.equal(process.state,"faulted");
  assert.equal(process.cause,PROTECTED_EXCEPTIONS.PRIVILEGE_FAULT);
  assert.equal(process.faultAddress,0);
  assert.equal(process.machine.cpu.r.MODE,"kernel");
  assert.equal(process.machine.cpu.r.PC,process.layout.faultHandler+1);
  assert.equal(process.exitCode,128+PROTECTED_EXCEPTIONS.PRIVILEGE_FAULT);
  assert.equal(os.memory.freeBytes(),os.memory.size);
});

test("PixelOS round-robin preempts on TIMER and resumes through IRET",()=>{
  const computer=makeItem("comp_adv");
  const os=new PixelOS(computer,computer.runtime,new ComputerTerminal());
  os.processes.schedule=()=>{};
  os.processes.quantum=5;
  const assembler=new Assembler();
  const endless=os.processes.spawn("endless.bin",assembler.assembleBinary(`
    .protected
    LOAD_A 0
    loop:
    INC_A
    JMP loop
  `));
  const quick=os.processes.spawn("quick.bin",assembler.assembleBinary(`
    .protected
    SYSCALL 5
    PRINT_A
    HALT
  `));

  os.processes.runNext();
  assert.equal(endless.state,"ready");
  assert.equal(endless.preemptions,1);
  assert.equal(endless.context.kind,"timer");
  assert.equal(endless.context.pendingIret,true);
  assert.equal(endless.machine.cpu.r.CAUSE,PROTECTED_EXCEPTIONS.TIMER);
  assert.equal(endless.machine.cpu.r.MODE,"kernel");
  const firstFrame=endless.context.frame;
  const firstValue=endless.machine.cpu.view.getInt32(firstFrame+CONTEXT_LAYOUT.A,true);

  os.processes.runNext();
  assert.equal(quick.state,"exited");
  assert.deepEqual(quick.output,["2"]);

  os.processes.runNext();
  assert.equal(endless.state,"ready");
  assert.equal(endless.preemptions,2);
  assert.equal(endless.context.frame,firstFrame);
  assert.ok(endless.machine.cpu.view.getInt32(firstFrame+CONTEXT_LAYOUT.A,true)>firstValue);
  assert.equal(endless.machine.cpu.r.CAUSE,PROTECTED_EXCEPTIONS.TIMER);

  assert.equal(os.processes.kill(endless.pid),true);
  assert.equal(endless.state,"killed");
  assert.equal(os.memory.freeBytes(),os.memory.size);
});

test("protected R/W/X map enforces TEXT, guard and NX stack",()=>{
  const makeOS=()=>{
    const computer=makeItem("comp_adv");
    const os=new PixelOS(computer,computer.runtime,new ComputerTerminal());
    os.processes.schedule=()=>{};os.processes.quantum=10000;
    return os;
  };
  const assembler=new Assembler();

  const executeOS=makeOS();
  const execute=executeOS.processes.spawn("execute-stack.bin",
    assembler.assembleBinary(".protected\nJMP 2\nHALT"));
  executeOS.processes.runNext();
  assert.equal(execute.state,"faulted");
  assert.equal(execute.cause,PROTECTED_EXCEPTIONS.EXECUTE_FAULT);
  assert.equal(execute.faultAddress,2);
  assert.equal(execute.layout.text.permissions,
    MEMORY_PERMISSIONS.READ|MEMORY_PERMISSIONS.EXECUTE);
  assert.equal(execute.layout.text.permissions&MEMORY_PERMISSIONS.WRITE,0);
  assert.equal(execute.layout.stack.nx,true);

  const guardOS=makeOS(),userLimit=guardOS.runtime.ramBytes-PROCESS_MEMORY_LAYOUT.USER_BASE;
  const guardAddress=userLimit-PROCESS_MEMORY_LAYOUT.MAX_STACK_BYTES-
    PROCESS_MEMORY_LAYOUT.GUARD_BYTES;
  const guard=guardOS.processes.spawn("guard.bin",assembler.assembleBinary(`
    .protected
    LOAD_A 7
    STORE_A ${guardAddress}
    HALT
  `));
  guardOS.processes.runNext();
  assert.equal(guard.state,"faulted");
  assert.equal(guard.cause,PROTECTED_EXCEPTIONS.MEMORY_FAULT);
  assert.equal(guard.faultAddress,guardAddress);
  assert.equal(guard.layout.guard.permissions,0);

  const stackOS=makeOS();
  const stack=stackOS.processes.spawn("overflow.bin",assembler.assembleBinary(`
    .protected
    loop:
    PUSH_A
    JMP loop
  `));
  stackOS.processes.runNext();
  assert.equal(stack.state,"faulted");
  assert.equal(stack.cause,PROTECTED_EXCEPTIONS.STACK_FAULT);
  assert.equal(stack.faultAddress,stack.layout.guard.end-4);
});

test("machine-code process can use PID and IPC system calls",()=>{
  const sent=[],assembler=new Assembler(),output=[];
  const system={pid:()=>7,ipcSend:(to,data)=>sent.push({to,data}),
    ipcReceive:()=>({from:3,data:99})};
  const cpu=new CPU(8192,x=>output.push(x),new ComputerTerminal(),system);
  cpu.run(assembler.decodeBinary(assembler.assembleBinary(`
    OS_PID
    PRINT_A
    LOAD_A 12
    LOAD_B 34
    IPC_SEND
    IPC_RECV
    PRINT_A
    MOV_A_B
    PRINT_A
    HALT
  `)));
  assert.deepEqual(sent,[{to:12,data:34}]);
  assert.deepEqual(output,["7","3","99"]);
});

test("self-hosting ISA supports indirect memory and resumable YIELD",()=>{
  const assembler=new Assembler(),program=assembler.decodeBinary(assembler.assembleBinary(`
    LOAD_B 128
    LOAD_A 305419896
    STORE32_A_B
    LOAD_A 0
    LOAD32_A_B
    YIELD
    INC_A
    HALT
  `));
  const cpu=new CPU(1024);
  const first=cpu.run(program);
  assert.equal(first.yielded,true);
  assert.equal(cpu.r.A,305419896);
  const second=cpu.run(program,100000,false);
  assert.equal(second.halted,true);
  assert.equal(cpu.r.A,305419897);
});

test("DRIVE ABI lists, reads, writes and deletes files",()=>{
  const files=new Map([["in.asm",new TextEncoder().encode("HALT")]]);
  const system={
    fsList:()=>new TextEncoder().encode([...files.keys()].join("\n")),
    fsRead:name=>files.get(name)||null,
    fsWrite:(name,data)=>files.set(name,data),
    fsDelete:name=>files.delete(name)
  };
  const assembler=new Assembler(),cpu=new CPU(1024,()=>{},null,system);
  const name=new TextEncoder().encode("in.asm");cpu.bytes.set(name,100);
  const program=assembler.decodeBinary(assembler.assembleBinary(`
    LOAD_B 100
    LOAD_C 6
    LOAD_D 200
    FS_READ
    HALT
  `));
  cpu.run(program,100000,false);
  assert.equal(new TextDecoder().decode(cpu.bytes.subarray(200,204)),"HALT");
});

test("self-hosted shell ABI reads terminal lines and exposes kernel state",()=>{
  const terminal=new ComputerTerminal();terminal.lineQueue.push("run app.bin");
  const system={
    procExec:name=>name==="app.bin"?9:-1,
    procList:()=>new TextEncoder().encode("9 ready app.bin"),
    memInfo:()=>({free:4096,total:8192})
  };
  const assembler=new Assembler(),cpu=new CPU(8192,()=>{},terminal,system);
  const program=assembler.decodeBinary(assembler.assembleBinary(`
    LOAD_B 100
    LOAD_C 64
    TTY_READLINE
    LOAD_B 200
    LOAD_C 64
    PROC_LIST
    MEM_INFO
    HALT
  `));
  cpu.run(program);
  assert.equal(new TextDecoder().decode(cpu.bytes.subarray(100,111)),"run app.bin");
  assert.equal(new TextDecoder().decode(cpu.bytes.subarray(200,215)),"9 ready app.bin");
  assert.equal(cpu.r.A,4096);
  assert.equal(cpu.r.B,8192);
});

test("Assembly shell parses and executes commands without JS command dispatch",()=>{
  const source=fs.readFileSync(new URL("../system/shell.asm",import.meta.url),"utf8");
  const assembler=new Assembler(),terminal=new ComputerTerminal();
  terminal.lineQueue.push("mem");
  const binary=assembler.assembleBinary(source),program=assembler.decodeBinary(binary);
  const forbidden=new Set(["TTY_READLINE","TTY_WRITE","FS_LIST","PROC_LIST",
    "PROC_EXEC","PROC_KILL","MEM_INFO","TERM_MODE","TERM_CLEAR"]);
  assert.equal(program.version,PROTECTED_ISA_VERSION);
  assert.equal(program.some(instruction=>forbidden.has(instruction.op)),false);
  const computer=makeItem("comp_adv"),os=new PixelOS(computer,computer.runtime,terminal);
  os.processes.schedule=()=>{};os.processes.quantum=100000;
  const shell=os.processes.spawn("shell.bin",binary);
  os.processes.runNext();
  assert.equal(shell.protected,true);
  assert.equal(shell.state,"ready");
  assert.equal(shell.machine.cpu.r.MODE,"user");
  assert.equal(shell.cause,0);
  assert.ok(shell.output.includes("Pixel Shell ASM 1.0"));
  assert.ok(shell.output.some(value=>/^[0-9]+$/.test(value)));
  os.processes.kill(shell.pid);
});

test("PCVM v2 loads static .byte and .string sections into RAM",()=>{
  const assembler=new Assembler();
  const binary=assembler.assembleBinary(`
    .org 512
    .string "PCOS"
    .byte 0, 42
    LOAD_B 517
    LOAD8_A_B
    HALT
  `);
  assert.equal(binary[4],2);
  const cpu=new CPU(2048);
  cpu.run(assembler.decodeBinary(binary));
  assert.equal(new TextDecoder().decode(cpu.bytes.subarray(512,516)),"PCOS");
  assert.equal(cpu.r.A,42);
});

test("assembler resolves named data, constants, zero space and alignment",()=>{
  const assembler=new Assembler(),binary=assembler.assembleBinary(`
    base: .equ 600
    .org base
    title: .string "OK"
    .align 16
    scratch: .zero 32
    marker: .byte 77
    LOAD_B marker
    LOAD8_A_B
    HALT
  `);
  const program=assembler.decodeBinary(binary),cpu=new CPU(2048);
  cpu.run(program);
  assert.equal(new TextDecoder().decode(cpu.bytes.subarray(600,602)),"OK");
  assert.equal(cpu.r.B,640);
  assert.equal(cpu.r.A,77);
});

test("streaming lexer skips comments and preserves quoted strings",()=>{
  const source='  LOAD_A 42 ; comment\nPRINT "hello world"\nHALT';
  const bytes=new TextEncoder().encode(source),assembler=new Assembler(),cpu=new CPU(2048);
  cpu.bytes.set(bytes,512);cpu.r.B=512;cpu.r.C=512+bytes.length;
  const lex=assembler.decodeBinary(assembler.assembleBinary("LEX_TOKEN\nHALT"));
  const tokens=[],delimiters=[];
  for(let i=0;i<5;i++){
    cpu.r.PC=0;cpu.run(lex,100,false);
    tokens.push(new TextDecoder().decode(cpu.bytes.subarray(cpu.r.B,cpu.r.B+cpu.r.A)));
    delimiters.push(cpu.r.FA);
    cpu.r.B=cpu.r.D;
  }
  assert.deepEqual(tokens,["LOAD_A","42","PRINT","\"hello world\"","HALT"]);
  assert.deepEqual(delimiters,[32,32,32,10,0]);
});

test(".word and .dword emit little-endian static tables",()=>{
  const assembler=new Assembler(),cpu=new CPU(2048);
  cpu.run(assembler.decodeBinary(assembler.assembleBinary(`
    .org 700
    values: .word 0x1234, -2
    wide: .dword 0x12345678, -3
    HALT
  `)));
  assert.equal(cpu.view.getUint16(700,true),0x1234);
  assert.equal(cpu.view.getInt16(702,true),-2);
  assert.equal(cpu.view.getUint32(704,true),0x12345678);
  assert.equal(cpu.view.getInt32(708,true),-3);
});

test("bootstrap assembler pass emits opcode stream on DRIVE",()=>{
  const source=fs.readFileSync(new URL("../system/assembler.asm",import.meta.url),"utf8");
  const assembler=new Assembler(),terminal=new ComputerTerminal(),written=new Map();
  terminal.lineQueue.push("demo.asm");
  const system={
    fsRead:name=>name==="demo.asm"?new TextEncoder().encode(
      '.import external\n.export ready\nanswer: .equ 7\npayload_base: .equ 100\n.org payload_base\npayload: .byte 18 52\n.word -2\n.dword 305419896\n.string "OK"\n.zero 3\n.align 8\nnext: .dword 3\nJMP ready\nPRINT "BAD"\nJZ ready\nJNZ ready\nCALL external\nready:\nLOAD_A answer\nPRINT_A\nLOAD_A next\nCMP_A_D\nPRINT "OK"\nPRINT_A\nSYSCALL 5\nHALT'
    ):null,
    fsWrite:(name,data)=>written.set(name,new Uint8Array(data))
  };
  const cpu=new CPU(2097152,()=>{},terminal,system);
  cpu.run(assembler.decodeBinary(assembler.assembleBinary(source)));
  const hash=value=>{
    let result=0x811c9dc5;
    for(const byte of new TextEncoder().encode(value)){
      result^=byte;
      result=Math.imul(result,0x01000193);
    }
    return result|0;
  };
  const relocations=Array.from({length:5},(_,index)=>
    [0,4,8,12].map(offset=>cpu.view.getInt32(393216+index*16+offset,true)));
  assert.deepEqual(relocations,[
    [0,0,1,hash("ready")],
    [2,0,1,hash("ready")],
    [3,0,1,hash("ready")],
    [4,0,1,hash("external")],
    [7,0,2,hash("next")],
  ]);
  const object=written.get("a.obj")||new Uint8Array();
  assert.deepEqual(Array.from(object.slice(0,5)),[0x50,0x43,0x4f,0x42,2]);
  const module=new AssemblyCompiler().read(object);
  assert.equal(module.format,"binary");
  assert.equal(module.symbols.find(symbol=>symbol.hash===hash("ready")).exported,true);
  assert.equal(module.symbols.find(symbol=>symbol.hash===hash("external")).imported,true);
  assert.deepEqual(module.relocations.map(item=>[item.offset,item.operand,item.type,item.symbolHash]),
    relocations.map(([instruction,operand,type,symbolHash])=>
      [instruction,operand,type===1?"ABS_TEXT":"ABS_DATA",symbolHash]));
  assert.deepEqual(Array.from(module.payload.slice(0,9)),[0x50,0x43,0x56,0x4d,3,1,0,13,0]);
  const program=assembler.decodeBinary(module.payload),programOutput=[];
  assert.equal(program.dataWrites.length,1);
  assert.equal(program.dataWrites[0].address,100);
  assert.equal(program.dataWrites[0].data.length,24);
  const data=new DataView(program.dataWrites[0].data.buffer);
  assert.deepEqual(Array.from(program.dataWrites[0].data.slice(0,2)),[18,52]);
  assert.equal(data.getInt16(2,true),-2);
  assert.equal(data.getInt32(4,true),305419896);
  assert.equal(new TextDecoder().decode(program.dataWrites[0].data.slice(8,10)),"OK");
  assert.deepEqual(Array.from(program.dataWrites[0].data.slice(10,20)),Array(10).fill(0));
  assert.equal(data.getInt32(20,true),3);
  new CPU(8192,value=>programOutput.push(String(value))).run(program);
  assert.deepEqual(programOutput,["7","OK","120"]);

  const bootstrapTerminal=new ComputerTerminal(),bootstrapFiles=new Map();
  bootstrapTerminal.lineQueue.push("assembler.asm");
  const bootstrapCpu=new CPU(2097152,()=>{},bootstrapTerminal,{
    fsRead:name=>name==="assembler.asm"?new TextEncoder().encode(source):null,
    fsWrite:(name,data)=>bootstrapFiles.set(name,new Uint8Array(data))
  });
  bootstrapCpu.run(assembler.decodeBinary(assembler.assembleBinary(source)),20_000_000);
  const bootstrapObject=bootstrapFiles.get("a.obj");
  const bootstrapModule=new AssemblyCompiler().read(bootstrapObject);
  assert.equal(bootstrapModule.format,"binary");
  assert.ok(bootstrapModule.payload.length>8_000);
  assert.ok(bootstrapModule.symbols.length>100);
  assert.ok(bootstrapModule.relocations.length>300);

  const linkerSource=fs.readFileSync(new URL("../system/linker.asm",import.meta.url),"utf8");
  const bootstrapLinkTerminal=new ComputerTerminal(),bootstrapLinked=new Map(),bootstrapLinkOutput=[];
  bootstrapLinkTerminal.lineQueue.push("assembler.obj");
  new CPU(65536,value=>bootstrapLinkOutput.push(String(value)),bootstrapLinkTerminal,{
    fsRead:name=>name==="assembler.obj"?bootstrapObject:null,
    fsWrite:(name,data)=>bootstrapLinked.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(linkerSource)),100_000_000);
  const secondGenerationAssembler=bootstrapLinked.get("a.bin");
  assert.ok(secondGenerationAssembler,bootstrapLinkOutput.join("\n"));
  assert.deepEqual(Array.from(secondGenerationAssembler.slice(0,5)),
    [0x50,0x43,0x56,0x4d,3]);
  const generationTwoProgram=assembler.decodeBinary(secondGenerationAssembler);
  assert.deepEqual(generationTwoProgram.dataWrites.map(segment=>segment.address),
    [4096,131072,1310720,5376]);

  const generationTwoTerminal=new ComputerTerminal(),generationTwoFiles=new Map();
  generationTwoTerminal.lineQueue.push("generation-two.asm");
  new CPU(2097152,()=>{},generationTwoTerminal,{
    fsRead:name=>name==="generation-two.asm"?
      new TextEncoder().encode("LOAD_A 17\nPRINT_A\nHALT"):null,
    fsWrite:(name,data)=>generationTwoFiles.set(name,new Uint8Array(data))
  }).run(generationTwoProgram,20_000_000);
  const generationTwoObject=generationTwoFiles.get("a.obj");
  const generationTwoModule=new AssemblyCompiler().read(generationTwoObject);
  assert.equal(generationTwoModule.format,"binary");
  assert.deepEqual(assembler.decodeBinary(generationTwoModule.payload).map(item=>item.op),
    ["LOAD_A","PRINT_A","HALT"]);
  const generationTwoLinkTerminal=new ComputerTerminal(),generationTwoLinked=new Map();
  generationTwoLinkTerminal.lineQueue.push("generation-two.obj");
  new CPU(65536,()=>{},generationTwoLinkTerminal,{
    fsRead:name=>name==="generation-two.obj"?generationTwoObject:null,
    fsWrite:(name,data)=>generationTwoLinked.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(linkerSource)));
  const generationTwoOutput=[];
  new CPU(8192,value=>generationTwoOutput.push(String(value)))
    .run(assembler.decodeBinary(generationTwoLinked.get("a.bin")));
  assert.deepEqual(generationTwoOutput,["17"]);

  const simpleTerminal=new ComputerTerminal(),simpleFiles=new Map();
  simpleTerminal.lineQueue.push("plain.asm");
  const simpleSystem={
    fsRead:name=>name==="plain.asm"?new TextEncoder().encode("LOAD_A 9\nPRINT_A\nHALT"):null,
    fsWrite:(name,data)=>simpleFiles.set(name,new Uint8Array(data))
  };
  new CPU(2097152,()=>{},simpleTerminal,simpleSystem)
    .run(assembler.decodeBinary(assembler.assembleBinary(source)));
  const selfContainedObject=simpleFiles.get("a.obj");

  const linkerTerminal=new ComputerTerminal(),linkedFiles=new Map();
  linkerTerminal.lineQueue.push("demo.obj");
  const linkerSystem={
    fsRead:name=>name==="demo.obj"?selfContainedObject:null,
    fsWrite:(name,data)=>linkedFiles.set(name,new Uint8Array(data))
  };
  new CPU(65536,()=>{},linkerTerminal,linkerSystem)
    .run(assembler.decodeBinary(assembler.assembleBinary(linkerSource)));
  const simpleModule=new AssemblyCompiler().read(selfContainedObject);
  assert.deepEqual(linkedFiles.get("a.bin"),simpleModule.payload);

  const rejectedFiles=new Map(),rejectedTerminal=new ComputerTerminal();
  rejectedTerminal.lineQueue.push("unresolved.obj");
  new CPU(65536,()=>{},rejectedTerminal,{
    fsRead:name=>name==="unresolved.obj"?object:null,
    fsWrite:(name,data)=>rejectedFiles.set(name,new Uint8Array(data))
  }).run(assembler.decodeBinary(assembler.assembleBinary(linkerSource)));
  assert.equal(rejectedFiles.has("a.bin"),false);
});
