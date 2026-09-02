import assert from "node:assert/strict";
import test from "node:test";
import {byId,itemStatLines,makeItem} from "../src/game/items.js";
import {INSTALL_PCFD_BASE64} from "../src/game/install-media.generated.js";
import {installPCFD} from "../src/game/installer.js";
import {PixelOS} from "../src/game/os.js";
import {ComputerTerminal} from "../src/game/terminal.js";
import {Propulsion} from "../src/game/propulsion.js";
import {restoreShip,snapshotShip} from "../src/game/savegame.js";

const installerBytes=Uint8Array.from(atob(INSTALL_PCFD_BASE64),char=>char.charCodeAt(0));

test("tape recorder and floppy drive keep each removable medium as its own item",()=>{
  const tapeDrive=makeItem("drive_magnetic"),floppy=makeItem("drive_floppy");
  const tape=makeItem("magnetic_tape"),disk=makeItem("magnetic_disk");
  assert.equal(tapeDrive.storage,undefined);
  assert.equal(floppy.storage,undefined);
  assert.equal(tapeDrive.canInsertMedia(tape),true);
  assert.equal(tapeDrive.canInsertMedia(disk),false);
  tapeDrive.insertMedia(tape);floppy.insertMedia(disk);
  assert.equal(tapeDrive.ejectMedia(),tape);
  assert.equal(floppy.insertedMedia,disk);
  assert.doesNotMatch(itemStatLines(byId("drive_floppy")).join(" "),/undefined/);
});

test("scanner disk is mounted from /dev/fd0 and resolves scanner as a PCOS utility",()=>{
  const computer=makeItem("comp_expand"),scannerDisk=makeItem("magnetic_disk_scanner");
  const floppy=computer.slots.peripheral1;
  floppy.insertMedia(scannerDisk);
  installPCFD(installerBytes,computer.slots.drive.storage,{rootPassword:"root"});
  computer.runtime.activeStorage=computer.slots.drive.storage;
  const terminal=new ComputerTerminal(),os=new PixelOS(computer,computer.runtime,terminal);
  os.execute("lsblk");
  assert.ok(terminal.lines.some(line=>line.includes("/dev/fd0")&&line.includes("PCOS Scanner")));
  os.execute("mount /dev/fd0 /mnt/scanner");
  assert.equal(os.mounts.get("/mnt/scanner")?.media,scannerDisk);
  assert.ok(os.file("/mnt/scanner/usr/bin/scanner.bin").data.length>0);
  assert.ok(os.commandFile("scanner").data.length>0);
  os.execute("umount /mnt/scanner");
  assert.equal(os.mounts.has("/mnt/scanner"),false);
});

test("restoring an older player ship grants the scanner disk once",()=>{
  const old={prop:new Propulsion()},saved=snapshotShip(old);
  saved.prop.cargo=[];
  const restored={prop:new Propulsion()};
  restoreShip(restored,saved,{ensureScannerMedia:true});
  assert.equal(restored.prop.cargo.count("magnetic_disk_scanner"),1);
  restoreShip(restored,snapshotShip(restored),{ensureScannerMedia:true});
  assert.equal(restored.prop.cargo.count("magnetic_disk_scanner"),1);
});
