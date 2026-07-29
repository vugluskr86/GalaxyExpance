import assert from "node:assert/strict";
import test from "node:test";
import {makeItem} from "../src/game/items.js";
import {starterInventory} from "../src/game/inventory.js";
import {decodePCFD} from "../src/game/installer.js";
import {InodeFS} from "../src/game/vfs.js";
import {ComputerTerminal} from "../src/game/terminal.js";

test("PCFD installation medium contains installer, manifest payload and full Unix source tree",()=>{
  const media=makeItem("drive_installer"),pkg=decodePCFD(media.storage.installerPackage);
  assert.ok(media.storage.get("installer.bin")?.data);
  assert.ok(media.storage.get("os.bin")?.data,"BIOS boot alias missing");
  assert.ok(media.storage.get("install.pcfd")?.data,"PCFD image is not present on the media");
  assert.match(media.def.stats.driveType,/pcfd/);
  assert.ok(pkg.entries.some(entry=>entry.path==="/kernel.bin"));
  assert.ok(pkg.entries.some(entry=>entry.path==="/bin/sh.bin"));
  assert.ok(pkg.entries.some(entry=>entry.path==="/usr/src/pcos/system/unix/lib/syscall.asm"));
  assert.ok(pkg.entries.some(entry=>entry.path==="/usr/src/pcos/system/unix/include/syscall.inc"));
  assert.ok(pkg.entries.some(entry=>entry.path==="/etc/shadow"));
  assert.ok(pkg.entries.some(entry=>entry.path==="/install.conf"));
  assert.ok(pkg.required>144*1024,"the complete image must use high-capacity media");
});

test("installer.bin boots interactively, formats target atomically and selects kernel.bin",()=>{
  const computer=makeItem("comp_expand"),media=makeItem("drive_installer"),terminal=new ComputerTerminal();
  computer.install(media);
  computer.firmware.saveSettings({bootDevice:"peripheral2",bootFile:"os.bin"});
  const started=computer.runtime.boot(terminal);
  assert.ok(started.installer,"installer session was not entered from boot media");

  const setup=started.installer;
  setup.handleKey({code:"Enter",key:"Enter"});
  for(const key of "secret")setup.handleKey({code:"Key"+key.toUpperCase(),key});
  setup.handleKey({code:"Enter",key:"Enter"});
  setup.handleKey({code:"KeyY",key:"y"});
  setup.handleKey({code:"Enter",key:"Enter"});

  const target=computer.slots.drive.storage;
  assert.equal(target.installation.bootable,true);
  assert.equal(target.installation.verified,true);
  assert.equal(computer.firmware.settings.bootDevice,"drive");
  assert.equal(computer.firmware.settings.bootFile,"kernel.bin");
  assert.ok(target.get("kernel.bin")?.data);
  const root=InodeFS.deserialize(target.pcfsImage);
  assert.ok(root.resolvePath(root.rootId,"/kernel.bin",0,0).inode);
  assert.ok(root.resolvePath(root.rootId,"/sbin/init.bin",0,0).inode);
  assert.ok(root.resolvePath(root.rootId,"/bin/login.bin",0,0).inode);
  assert.ok(root.resolvePath(root.rootId,"/bin/sh.bin",0,0).inode);
  assert.equal(root.resolvePath(root.rootId,"/home/guest",0,0).inode.mode,0o750);

  setup.handleKey({code:"Escape",key:"Escape"});
  assert.equal(computer.runtime.lastBoot.file,"kernel.bin");
  const os=computer.runtime.lastBoot.kernel;
  assert.ok(os.fs,"installed PCFS was not mounted after reboot");
  for(const name of ["cat","cp","ps","chgrp","chown","mkdir","mv","passwd","rm","top","user"])
    assert.ok(os.file(`/bin/${name}.bin`).data,`${name}.bin is absent from installed /bin`);
  os.execute("ls");
  assert.ok(terminal.lines.some(line=>line.startsWith("bin/")),"ls did not read PCFS root");
  os.execute("cd /bin");
  assert.equal(os.cwdPath(),"/bin");
  os.execute("ls");
  assert.ok(terminal.lines.some(line=>line.startsWith("cat.bin")),"cd did not affect ls cwd");
});

test("starter inventory provides the bootable high-capacity installer medium",()=>{
  const inventory=starterInventory();
  assert.equal(inventory.count("drive_installer"),1);
});
