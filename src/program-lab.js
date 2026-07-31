import { Assembler } from "./game/cpu.js";
import { ComputerTerminal } from "./game/terminal.js";
import { CATALOG, makeItem } from "./game/items.js";
import { Propulsion } from "./game/propulsion.js";

const $ = (id) => document.getElementById(id);
const terminal = new ComputerTerminal($("terminal"));
window._pixelCosmosTerminal = terminal;
let prop = null,
  computer = null,
  lastBinary = null,
  scannerFrame = 0;

const shipSlots = [
  "hull",
  "engine",
  "tank",
  "reactor",
  "antenna",
  "scanner",
  "hyperdrive",
  "capacitor",
  "gyro",
  "mining",
  "shield",
  "droid",
  "scoop",
];
const partSlots = ["gpu", "cpu", "ram", "drive", "peripheral"];
const examples = [
  ["terminal-text.asm", "/examples/terminal-text.asm"],
  ["terminal-input.asm", "/examples/terminal-input.asm"],
  ["terminal-graphics.asm", "/examples/terminal-graphics.asm"],
  ["lissajous.asm", "/examples/lissajous.asm"],
  ["hello.c", "/examples/c/hello.c"],
  ["scanner.c", "/examples/c/scanner.c"],
  ["scanner.asm (generated)", "/examples/c/scanner.asm"],
];

function selectControl(slot, container) {
  const defs = CATALOG.filter((item) => item.slot === slot);
  const row = document.createElement("div");
  row.className = "control";
  const label = document.createElement("label");
  label.textContent = slot.toUpperCase();
  const select = document.createElement("select");
  select.dataset.slot = slot;
  if (
    ![
      "hull",
      "reactor",
      "scanner",
      "antenna",
      "gpu",
      "cpu",
      "ram",
      "drive",
      "peripheral",
    ].includes(slot)
  )
    select.add(new Option("— пусто —", ""));
  for (const def of defs)
    select.add(new Option(`${def.name} [${def.cls}${def.rating}]`, def.id));
  row.append(label, select);
  container.append(row);
  return select;
}
const shipSelects = Object.fromEntries(
  shipSlots.map((slot) => [slot, selectControl(slot, $("equipment"))]),
);
const partSelects = Object.fromEntries(
  partSlots.map((slot) => [slot, selectControl(slot, $("computerParts"))]),
);

function setPreset() {
  const values = {
    hull: "hull_dreadnought",
    engine: "eng_nuke",
    tank: "tank_l",
    reactor: "reactor_mk2",
    antenna: "antenna_long",
    scanner: "scanner_deep",
    hyperdrive: "hyper_l",
    capacitor: "cap_l",
    gyro: "gyro_precise",
    mining: "miner_pro",
    shield: "shield_l",
    droid: "droid_x",
    scoop: "scoop_fuel",
    gpu: "gpu_graphics",
    cpu: "cpu_quad",
    ram: "ram_4096",
    drive: "drive_hard_big",
    peripheral: "term_graphics",
  };
  for (const [slot, id] of Object.entries(values)) {
    const select = shipSelects[slot] || partSelects[slot];
    if (select && [...select.options].some((o) => o.value === id))
      select.value = id;
  }
}
function log(message) {
  $("status").textContent = String(message);
}

function rebuildEquipment() {
  prop = new Propulsion();
  for (const [slot, select] of Object.entries(shipSelects)) {
    const id = select.value;
    if (!id) continue;
    const item = makeItem(id);
    if (slot === "hull") prop.slots.hull = item;
    else prop.slots[slot] = item;
  }
  computer = makeItem("comp_expand");
  for (const [slot, select] of Object.entries(partSelects))
    computer.slots[slot] = select.value ? makeItem(select.value) : null;
  prop.slots.computer1 = computer;
  prop.slots.terminal1 = makeItem("term_graphics");
  prop.slots.terminal1.connectedComputerId = computer.instanceId;
  prop._bindNetworkComputers();
  computer.runtime.openSystemScanner = () => {
    openScanner();
    return true;
  };
  log(
    `Корабль создан\n${computer.name}\nRAM ${computer.runtime.ramBytes / 1024} КБ · GPU ${computer.runtime.outputMode}\nСканер: ${prop.scanner?.name || "нет"}\nАнтенна: ${prop.antenna?.name || "нет"}`,
  );
}

function installPcos() {
  try {
    if (!computer) rebuildEquipment();
    const media = makeItem("drive_installer");
    const target = computer.slots.drive;
    if (!target?.storage) throw new Error("Выбранный DRIVE не имеет хранилища");
    computer.slots.peripheral2 = makeItem("drive_hard_big");
    computer.slots.peripheral4 = media;
    const result = computer.runtime.runUnattendedInstall(media, target);
    computer.firmware.saveSettings({
      bootDevice: "drive",
      bootFile: "kernel.bin",
    });
    computer.runtime.activeStorage = target.storage;
    log(
      `PCOS установлен: ${result.files} файлов, ${result.bytes} Б\nЗагрузочный слот: DRIVE`,
    );
  } catch (error) {
    log(`Ошибка установки: ${error.message}`);
  }
}
function boot() {
  try {
    if (!computer) rebuildEquipment();
    terminal.setMode("text");
    terminal.clear();
    terminal.focus();
    const result = computer.runtime.boot(terminal);
    log(
      `Загрузка выполнена: ${result.file || "firmware"}\nТерминал активен. Введите help.`,
    );
  } catch (error) {
    log(`Ошибка загрузки: ${error.message}\nНажмите «Переустановить PCOS».`);
  }
}
function sendLine(line) {
  terminal.focus();
  terminal.lineQueue.push(line);
  for (const fn of terminal.lineListeners) fn(line);
}

async function loadExample() {
  const url = $("example").value;
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  const isBinary = url.endsWith(".bin");
  if (isBinary) {
    lastBinary = new Uint8Array(await response.arrayBuffer());
    $("source").value = `; binary ${lastBinary.length} bytes`;
  } else $("source").value = await response.text();
  $("filename").value = url.split("/").pop();
  $("buildLog").textContent = `Загружено: ${url}`;
}
function assemble() {
  const name = $("filename").value.trim();
  if (name.endsWith(".c"))
    throw new Error("C собирается host-скриптом; см. PROGRAMS_MANUAL.md");
  lastBinary = new Assembler().assembleBinary($("source").value);
  $("buildLog").textContent =
    `ASM → ${name.replace(/\.asm$/i, "")}.bin · ${lastBinary.length} Б`;
  return lastBinary;
}
function runBinary() {
  try {
    if (!computer) rebuildEquipment();
    const binary = lastBinary || assemble();
    terminal.setMode("text");
    terminal.clear();
    terminal.focus();
    const result = computer.runtime.runBinary(binary, terminal);
    $("buildLog").textContent =
      `HALT · ${result.steps} инструкций\n${result.output.join("\n")}`;
  } catch (error) {
    $("buildLog").textContent = `Ошибка: ${error.message}`;
  }
}
function saveDrive() {
  try {
    if (!computer) rebuildEquipment();
    const binary = lastBinary || assemble();
    const base =
      $("filename")
        .value.trim()
        .replace(/\.(asm|c|bin)$/i, "") || "program";
    const name = `${base}.bin`,
      error = computer.memory?.saveBinary(name, binary);
    if (error) throw new Error(error);
    $("buildLog").textContent =
      `Сохранено на DRIVE: ${name} · ${binary.length} Б`;
  } catch (error) {
    $("buildLog").textContent = `Ошибка: ${error.message}`;
  }
}
function downloadBinary() {
  try {
    const binary = lastBinary || assemble(),
      base = $("filename").value.replace(/\.(asm|c|bin)$/i, "") || "program";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([binary]));
    a.download = `${base}.bin`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  } catch (error) {
    $("buildLog").textContent = `Ошибка: ${error.message}`;
  }
}

function openScanner() {
  $("scannerDialog").showModal();
  drawScanner();
}
function drawScanner() {
  if (!$("scannerDialog").open) return;
  const canvas = $("scannerCanvas"),
    ctx = canvas.getContext("2d"),
    freq = Number($("scanFreq").value);
  ctx.fillStyle = "#02070c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#183858";
  for (let x = 0; x < canvas.width; x += 70) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  ctx.strokeStyle = "#7ee08a";
  ctx.beginPath();
  for (let x = 0; x < canvas.width; x++) {
    const f = 100 + (x / canvas.width) * 900,
      peak = Math.exp(-Math.pow((f - 640) / 38, 2)) * 90,
      noise =
        18 +
        9 * Math.sin(x * 0.17 + scannerFrame * 0.09) +
        5 * Math.sin(x * 0.047);
    const y = canvas.height - 25 - noise - peak;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  const tx = ((freq - 100) / 900) * canvas.width;
  ctx.strokeStyle = "#ffd166";
  ctx.beginPath();
  ctx.moveTo(tx, 0);
  ctx.lineTo(tx, canvas.height);
  ctx.stroke();
  scannerFrame++;
  requestAnimationFrame(drawScanner);
}

for (const [label, url] of examples) $("example").add(new Option(label, url));
$("maxPreset").onclick = () => {
  setPreset();
  rebuildEquipment();
};
$("applyEquipment").onclick = rebuildEquipment;
$("installPcos").onclick = installPcos;
$("boot").onclick = boot;
$("reset").onclick = () => {
  computer?.runtime?.os?.stop?.();
  terminal.setMode("text");
  terminal.clear();
  rebuildEquipment();
};
$("loadExample").onclick = () =>
  loadExample().catch((error) => ($("buildLog").textContent = error.message));
$("assemble").onclick = () => {
  try {
    assemble();
  } catch (error) {
    $("buildLog").textContent = `Ошибка: ${error.message}`;
  }
};
$("runSource").onclick = runBinary;
$("saveDrive").onclick = saveDrive;
$("download").onclick = downloadBinary;
$("fileInput").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  $("filename").value = file.name;
  if (file.name.endsWith(".bin")) {
    lastBinary = new Uint8Array(await file.arrayBuffer());
    $("source").value = `; binary ${lastBinary.length} bytes`;
  } else {
    $("source").value = await file.text();
    lastBinary = null;
  }
};
$("sendCommand").onclick = () => {
  sendLine($("command").value);
  $("command").value = "";
};
$("command").addEventListener("keydown", (event) => {
  if (event.key === "Enter") $("sendCommand").click();
});
document
  .querySelectorAll("[data-command]")
  .forEach(
    (button) => (button.onclick = () => sendLine(button.dataset.command)),
  );
$("closeScanner").onclick = () => $("scannerDialog").close();
for (const id of ["scanFreq", "scanBearing", "scanBeam"])
  $(id).oninput = () => {
    const suffix = id === "scanFreq" ? " MHz" : "°";
    $(id + "Out").textContent = $(id).value + suffix;
  };
setPreset();
rebuildEquipment();
installPcos();
boot();
loadExample().catch(() => {});
