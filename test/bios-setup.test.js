import assert from "node:assert/strict";
import test from "node:test";
import { makeItem } from "../src/game/items.js";
import { ComputerTerminal } from "../src/game/terminal.js";

test("МК-3М has four universal peripheral slots for floppy and hard disks",()=>{
  const computer=makeItem("comp_expand"),hardDisk=makeItem("drive_hard");
  assert.equal(computer.slotDefs.filter(slot=>slot.id.startsWith("peripheral")).length,4);
  assert.equal(computer.slots.peripheral1.id,"drive_floppy");
  assert.equal(computer.accepts(hardDisk),true);
  assert.equal(computer.install(hardDisk),null);
  assert.equal(computer.slots.peripheral2,hardDisk);
  assert.equal(computer.memory,computer.slots.drive.storage);
});

test("Delete enters BIOS setup and saved boot disk selection survives exit",()=>{
  const computer=makeItem("comp_expand"),hardDisk=makeItem("drive_hard"),terminal=new ComputerTerminal();
  computer.install(hardDisk);
  terminal.keys.push({key:"Delete",code:"Delete",keyCode:46});
  const entered=computer.runtime.boot(terminal);
  assert.ok(entered.setup);
  assert.match(terminal.lines.join("\n"),/BIOS SETUP/);

  entered.setup.handleKey({key:"ArrowDown",code:"ArrowDown"});
  entered.setup.handleKey({key:"ArrowDown",code:"ArrowDown"});
  entered.setup.handleKey({key:"Enter",code:"Enter"});
  entered.setup.handleKey({key:"Escape",code:"Escape"});
  assert.match(terminal.lines.join("\n"),/Сохранить изменения/);
  entered.setup.handleKey({key:"Enter",code:"Enter"});

  assert.equal(computer.firmware.settings.bootDevice,"peripheral2");
  assert.equal(computer.runtime.activeStorage,hardDisk.storage);
  assert.equal(computer.runtime.lastBoot.file,"os.bin");
  assert.equal(computer.runtime.os.storage,hardDisk.storage);
});

test("BIOS source is stored in firmware memory, independent of the boot medium",()=>{
  const computer=makeItem("comp_expand"),terminal=new ComputerTerminal();
  computer.firmware.replaceBios('PRINT "CUSTOM NVRAM BIOS"\nBOOT "os.bin"\nHALT');
  const boot=computer.runtime.boot(terminal);
  assert.ok(boot.bios.output.includes("CUSTOM NVRAM BIOS"));
  assert.equal(boot.file,"os.bin");
});

test("Esc always asks whether BIOS Setup settings should be saved",()=>{
  const computer=makeItem("comp_expand"),terminal=new ComputerTerminal();
  const setup=computer.runtime.openBiosSetup(terminal);
  setup.handleKey({key:"Escape",code:"Escape"});
  assert.match(terminal.lines.join("\n"),/Сохранить изменения/);
});
