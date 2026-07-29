import test from "node:test";
import assert from "node:assert/strict";
import { makeItem } from "../src/game/items.js";
import { ComputerTerminal } from "../src/game/terminal.js";

test("bundled diagnostic demoscene runs through the protected GPU and FPU path",()=>{
  const computer=makeItem("comp_adv");
  const source=computer.memory.get("demoscene.asm");
  const binary=computer.memory.get("demoscene.bin");
  assert.ok(source?.code.includes(".protected"));
  assert.ok(binary?.data instanceof Uint8Array);

  const terminal=new ComputerTerminal();
  const result=computer.runtime.runBinary(binary.data,terminal);
  assert.equal(terminal.mode,"graphics");
  assert.equal(terminal.frames.length,108);
  assert.match(result.output.join("\n"),/HARDWARE DEMOSCENE/);
  assert.match(result.output.join("\n"),/DEMO COMPLETE/);
  assert.ok(result.steps>4_000);
});
