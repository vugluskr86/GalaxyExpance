import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {Assembler,CPU} from "../src/game/cpu.js";
import {AssemblyCompiler,Linker} from "../src/game/toolchain.js";
import {ComputerTerminal} from "../src/game/terminal.js";

const assembler=new Assembler(),compiler=new AssemblyCompiler();
const libcObject=()=>fs.readFileSync(
  new URL("../system/unix/build/libc.obj",import.meta.url));
function app(source){
  return new Linker(assembler).link([
    libcObject(),compiler.compile(`.protected\n.export main\n${source}`,"test-main")
  ],{entry:"_start"});
}

test("stage 4 libc links crt0 + main and exits with main status",()=>{
  let status=null;
  const binary=app(`
    .org 9000
    seen_argc: .dword 0
    seen_argv: .dword 0
    seen_envp: .dword 0
    main:
    PUSH_A
    MOV_A_B
    PUSH_A
    MOV_A_C
    PUSH_A
    POP_A
    LOAD_B seen_envp
    STORE32_A_B
    POP_A
    LOAD_B seen_argv
    STORE32_A_B
    POP_A
    LOAD_B seen_argc
    STORE32_A_B
    LOAD_A 7
    RET
  `);
  const cpu=new CPU(16384,undefined,undefined,{procExit:value=>{status=value;}});
  const program=assembler.decodeBinary(binary);
  for(const segment of program.dataWrites)
    cpu.bytes.set(segment.data,segment.address);
  cpu.r.A=3;cpu.r.B=111;cpu.r.C=222;
  cpu.run(program,100000,false);
  assert.equal(status,7);
  assert.equal(cpu.view.getInt32(9000,true),3);
  assert.equal(cpu.view.getInt32(9004,true),111);
  assert.equal(cpu.view.getInt32(9008,true),222);
  assert.equal(cpu.r.SP,16384);
  assert.equal(cpu.callStack.length,0);
});

test("stage 4 hello program uses libc_puts",()=>{
  const terminal=new ComputerTerminal(),output=[];
  const binary=fs.readFileSync(
    new URL("../system/unix/build/hello-libc.bin",import.meta.url));
  new CPU(16384,value=>output.push(String(value)),terminal,{procExit:()=>{}})
    .run(assembler.decodeBinary(binary));
  assert.deepEqual(output,["hello from self-hosted libc"]);
});

test("stage 4 self-hosted assembler/linker output runs the libc example",()=>{
  const output=[],binary=fs.readFileSync(
    new URL("../system/unix/build/hello-libc-selfhost.bin",import.meta.url));
  new CPU(16384,value=>output.push(String(value)),new ComputerTerminal(),
    {procExit:()=>{}}).run(assembler.decodeBinary(binary));
  assert.deepEqual(output,["hello from self-hosted libc"]);
});

test("stage 4 strlen, bounded strcpy and integer formatting execute in Assembly",()=>{
  const binary=app(`
    .org 9000
    source: .string "abc"
    .byte 0
    target: .zero 8
    number: .zero 8
    result_len: .dword 0
    result_copy: .dword 0
    result_fmt: .dword 0
    main:
    LOAD_B source
    LOAD_C 8
    CALL libc_strlen
    LOAD_B result_len
    STORE32_A_B
    LOAD_B target
    LOAD_C 8
    LOAD_D source
    CALL libc_strcpy
    LOAD_B result_copy
    STORE32_A_B
    LOAD_B 42
    LOAD_C number
    LOAD_D 8
    CALL libc_format_hex
    LOAD_B result_fmt
    STORE32_A_B
    LOAD_A 0
    RET
  `);
  const cpu=new CPU(16384,undefined,undefined,{procExit:()=>{}});
  cpu.run(assembler.decodeBinary(binary));
  assert.equal(cpu.view.getInt32(9020,true),3);
  assert.equal(cpu.view.getInt32(9024,true),9004);
  assert.equal(cpu.view.getInt32(9028,true),2,
    `count=${cpu.view.getInt32(7212,true)} value=${cpu.view.getInt32(7200,true)} bytes=${[...cpu.bytes.slice(9012,9016)]}`);
  assert.equal(new TextDecoder().decode(cpu.bytes.slice(9004,9008)).replace(/\0+$/,""),"abc");
  assert.equal(new TextDecoder().decode(cpu.bytes.slice(9012,9014)),"2a");
});

test("stage 4 wrapper stores errno per process",()=>{
  const binary=app(`
    .org 9000
    path: .string "missing"
    result: .dword 0
    main:
    LOAD_B path
    LOAD_C 7
    LOAD_D 0
    CALL libc_open
    LOAD_B result
    STORE32_A_B
    LOAD_A 0
    RET
  `);
  const vfs={sysOpen:()=>({A:-1,B:0,C:0,D:-2})};
  const cpu=new CPU(16384,undefined,undefined,{vfs,procExit:()=>{}});
  cpu.run(assembler.decodeBinary(binary));
  assert.equal(cpu.view.getInt32(7000,true),-2);
  assert.equal(cpu.view.getInt32(9007,true),-1);
});

test("stage 4 buffered fwrite retries short writes",()=>{
  let calls=0;
  const binary=app(`
    .org 9000
    text: .string "abcde"
    result: .dword 0
    main:
    LOAD_B 3
    LOAD_C text
    LOAD_D 5
    CALL libc_fwrite
    LOAD_B result
    STORE32_A_B
    LOAD_A 0
    RET
  `);
  const vfs={sysWrite:(fd,ptr,count)=>{calls++;return{A:Math.min(2,count),B:0,C:0,D:0};}};
  const cpu=new CPU(16384,undefined,undefined,{vfs,procExit:()=>{}});
  cpu.run(assembler.decodeBinary(binary));
  assert.equal(calls,3);
  assert.equal(cpu.view.getInt32(9005,true),5);
});

test("stage 4 printf supports %s, %d and %x",()=>{
  const output=[],binary=app(`
    .org 9000
    fmt_s: .string "%s"
    fmt_d: .string "%d"
    fmt_x: .string "%x"
    word: .string "ok"
    args_s: .dword word, 2
    args_d: .dword 42
    args_x: .dword 42
    main:
    LOAD_B fmt_s
    LOAD_C 2
    LOAD_D args_s
    CALL libc_printf
    LOAD_B fmt_d
    LOAD_C 2
    LOAD_D args_d
    CALL libc_printf
    LOAD_B fmt_x
    LOAD_C 2
    LOAD_D args_x
    CALL libc_printf
    LOAD_A 0
    RET
  `);
  new CPU(16384,value=>output.push(String(value)),new ComputerTerminal(),
    {procExit:()=>{}}).run(assembler.decodeBinary(binary));
  assert.deepEqual(output,["ok","42","2a"]);
});

test("stage 4 path_join and getopt are bounded Assembly routines",()=>{
  const binary=app(`
    .org 9000
    destination: .string "usr"
    .zero 13
    right: .string "bin"
    .byte 0
    arg0: .string "tool"
    .byte 0
    arg1: .string "-a"
    .byte 0
    options: .string "ab"
    .byte 0
    argv: .dword arg0, arg1
    joined: .dword 0
    option: .dword 0
    main:
    LOAD_B destination
    LOAD_C 16
    LOAD_D right
    CALL libc_path_join
    LOAD_B joined
    STORE32_A_B
    LOAD_A 2
    LOAD_B argv
    LOAD_C options
    CALL libc_getopt
    LOAD_B option
    STORE32_A_B
    LOAD_A 0
    RET
  `);
  const cpu=new CPU(16384,undefined,undefined,{procExit:()=>{}});
  cpu.run(assembler.decodeBinary(binary));
  assert.equal(new TextDecoder().decode(cpu.bytes.slice(9000,9008)),"usr/bin\0");
  assert.equal(cpu.view.getInt32(9039,true),7);
  assert.equal(cpu.view.getInt32(9043,true),97);
});

test("stage 4 malloc reports OOM consistently",()=>{
  const binary=app(`
    .org 9000
    result: .dword 0
    main:
    LOAD_B 4096
    CALL libc_malloc
    LOAD_B result
    STORE32_A_B
    LOAD_A 0
    RET
  `);
  const cpu=new CPU(16384,undefined,undefined,{
    memAlloc:()=>-1,procExit:()=>{}
  });
  cpu.run(assembler.decodeBinary(binary));
  assert.equal(cpu.view.getInt32(9000,true),-1);
  assert.equal(cpu.view.getInt32(7000,true),-5);
});
