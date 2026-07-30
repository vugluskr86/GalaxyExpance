import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {Assembler,CPU} from "../src/game/cpu.js";
import {ComputerTerminal} from "../src/game/terminal.js";

test("scanner is a protected Assembly system program with a graphical spectrum and system launch (self-hosted v3.0)",()=>{
  const source=fs.readFileSync(new URL("../system/unix/bin/scanner.asm",import.meta.url),"utf8");
  // Self-hosted scanner использует сисколлы напрямую
  assert.match(source,/SYSCALL 0x42/);  // TTY_MODE
  assert.match(source,/SYSCALL 0x62/);  // GFX_RECT
  assert.match(source,/0x56/);  // SYS_NET_INFO (упоминается в комментарии)
  const binary=new Uint8Array(fs.readFileSync(new URL("../system/unix/build/scanner.bin",import.meta.url)));
  const output=[],terminal=new ComputerTerminal();
  const cpu=new CPU(65536,value=>output.push(String(value)),terminal,{outputMode:"graphics"});
  const result=cpu.run(new Assembler().decodeBinary(binary),300000,true,{preempt:true});
  assert.equal(result.halted,true);
  const text=output.join("");
  assert.match(text,/SCANOS v3\.0/);
  assert.equal(terminal.mode,"graphics");
});