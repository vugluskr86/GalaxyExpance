import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {Assembler,CPU} from "../src/game/cpu.js";
import {ComputerTerminal} from "../src/game/terminal.js";
import { SCANNER_MEDIA_MANIFEST } from "../src/game/scanner-media.generated.js";

test("scanner is compiled from scanner.c and renders both SCAN_DESIGN screens inside PCVM",()=>{
  const c=fs.readFileSync(new URL("../examples/c/scanner.c",import.meta.url),"utf8");
  const asm=fs.readFileSync(new URL("../system/unix/build/scanner.asm",import.meta.url),"utf8");
  assert.match(c,/SYSTEM SCANNER/);
  assert.match(c,/PLANETARY SURVEY/);
  assert.doesNotMatch(c,/_sys_scan_list|SCANNER_OPEN|0x55/);
  assert.match(asm,/CALL _sys_gfx_text/);
  assert.doesNotMatch(asm,/SYSCALL 0x55/);

  const binary=new Uint8Array(fs.readFileSync(new URL("../system/unix/build/scanner.bin",import.meta.url)));
  const terminal=new ComputerTerminal();
  terminal.playAnimation=function(){};
  const cpu=new CPU(262144,()=>{},terminal,{outputMode:"graphics"});
  terminal.keys.push({keyCode:9});
  const first=cpu.run(new Assembler().decodeBinary(binary),250000,true,{preempt:true});
  assert.equal(first.halted,false);
  assert.equal(terminal.mode,"graphics");
  const commands=terminal.frames.flatMap(frame=>frame.commands);
  assert.ok(commands.some(command=>command[0]==="text"&&command[3].includes("SYSTEM SCANNER")));
  assert.ok(commands.some(command=>command[0]==="line"));
  assert.ok(commands.some(command=>command[0]==="rect"));

});

test("graphics mode consumes raw keys without invoking the shell line editor",()=>{
  const previousWindow=globalThis.window;
  globalThis.window={devicePixelRatio:1};
  const listeners={};
  const ctx={setTransform(){},fillRect(){},fillText(){}};
  const canvas={
    width:420,height:420,tabIndex:0,
    getBoundingClientRect(){return {width:420,height:420,left:0,top:0};},
    getContext(){return ctx;},
    addEventListener(type,fn){listeners[type]=fn;},
    closest(){return null;},focus(){}
  };
  const terminal=new ComputerTerminal(canvas);
  terminal.setPrompt("pcos:/# ");
  terminal.setMode("graphics");
  let lines=0;
  terminal.onLine(()=>lines++);
  let prevented=false,stopped=false;
  listeners.keydown({key:"ArrowDown",code:"ArrowDown",keyCode:40,
    preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
  assert.equal(terminal.readKey().keyCode,40);
  assert.equal(lines,0);
  assert.equal(terminal.inputLine,"");
  assert.equal(terminal.mode,"graphics");
  assert.equal(prevented,true);
  assert.equal(stopped,true);
  globalThis.window=previousWindow;
});

test("scanner source disk contains the native binary, C source, ABI and documentation",()=>{
  const paths=SCANNER_MEDIA_MANIFEST.entries.map(entry=>entry.path);
  assert.equal(SCANNER_MEDIA_MANIFEST.entry,"/usr/bin/scanner.bin");
  assert.equal(SCANNER_MEDIA_MANIFEST.compiler,"PCVM native C compiler");
  for(const required of ["/usr/bin/scanner.bin","/usr/src/pcos-scanner/scanner.c","/usr/src/pcos-scanner/build/scanner.asm","/usr/include/pcos.h","/usr/share/doc/pcos-scanner/BUILD.md","/usr/share/doc/pcos-scanner/INTEGRATION.md"])
    assert.ok(paths.includes(required),`${required} must be shipped on the scanner disk`);
  assert.ok(fs.statSync(new URL("../system/unix/build/scanner.pcfd",import.meta.url)).size>0);
});
