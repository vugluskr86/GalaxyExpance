import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {Assembler,CPU} from "../src/game/cpu.js";
import {ComputerTerminal} from "../src/game/terminal.js";

test("scanner is a protected Assembly system program with a graphical spectrum and system launch",()=>{
  const source=fs.readFileSync(new URL("../system/unix/bin/scanner.asm",import.meta.url),"utf8");
  assert.match(source,/SYSCALL 0x42/);
  assert.match(source,/SYSCALL 0x62/);
  assert.match(source,/SYSCALL 0x55/);
  const binary=new Uint8Array(fs.readFileSync(new URL("../system/unix/build/scanner.bin",import.meta.url)));
  let opened=0;
  const output=[],terminal=new ComputerTerminal(),cpu=new CPU(65536,value=>output.push(String(value)),terminal,{outputMode:"graphics",openSystemScanner:()=>{opened++;return true;}});
  const result=cpu.run(new Assembler().decodeBinary(binary),300000,true,{preempt:true});
  assert.equal(result.halted,true);
  const text=output.join("");
  assert.match(text,/PCOS scanner 1\.1/);
  assert.match(text,/spectrum acquired/);
  assert.equal(terminal.mode,"graphics");
  assert.equal(opened,1);
});
