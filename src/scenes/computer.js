import { Assembler } from "../game/cpu.js";

let panel = null;

export function openComputerEditor(item){
  closeComputerEditor();
  const stage = document.querySelector(".stage");
  const parent = stage ? stage.parentElement : null;
  if (!parent || !item || !item.memory) return;

  const mem = item.memory;
  const cpu = item.slots.cpu?.stats.threads || 0;
  const ram = item.slots.ram?.stats.capacityKb || 0;
  const gpu = item.slots.gpu?.stats.output || "нет";
  let currentFile = null;

  const div = document.createElement("div");
  div.className = "editor-panel";
  div.innerHTML = `<div class="editor-header">
    <span>${item.name} · CPU ${cpu} поток(а) · RAM ${ram} КБ · DRIVE ${mem.ramKb} КБ · GPU ${gpu}</span>
    <button class="editor-close" title="Закрыть">×</button>
  </div>
  <div class="editor-body">
    <div class="editor-left">
      <div class="editor-toolbar">
        <input id="edFilename" type="text" placeholder="имя.asm" class="editor-filename">
        <button id="edNew" class="editor-toolbtn" title="Новый файл" aria-label="Новый файл">＋</button>
        <button id="edSave" class="editor-toolbtn" title="Сохранить исходник" aria-label="Сохранить исходник">▣</button>
        <button id="edBuild" class="editor-toolbtn" title="Собрать в машинный код" aria-label="Собрать в машинный код">⚙</button>
        <button id="edRun" class="editor-toolbtn editor-toolbtn-run" title="Запустить выбранный бинарный файл" aria-label="Запустить выбранный бинарный файл">▶</button>
      </div>
      <textarea id="edCode" class="editor-code" placeholder="введите assembly..." spellcheck="false"></textarea>
      <div class="editor-msg" id="edMsg"></div>
      <pre class="console-output" id="edOutput"></pre>
    </div>
    <div class="editor-right">
      <div class="editor-info" id="edInfo"></div>
      <div class="editor-list" id="edList"></div>
    </div>
  </div>`;

  parent.insertBefore(div, stage.nextSibling);
  panel = div;

  const fn = div.querySelector("#edFilename");
  const code = div.querySelector("#edCode");
  const msg = div.querySelector("#edMsg");
  const info = div.querySelector("#edInfo");
  const list = div.querySelector("#edList");
  const output = div.querySelector("#edOutput");

  function showMsg(txt){ msg.textContent = txt; }

  function refreshList(){
    const progs = mem.list();
    info.textContent =
      `Программ: ${progs.length} · занято ${(mem.totalBytes()/1024).toFixed(1)}/${mem.ramKb} КБ`;
    list.innerHTML = "";
    for(const p of progs){
      const row = document.createElement("div");
      row.className = "editor-file-row";
      const btn = document.createElement("button");
      btn.textContent = `${p.name} (${(p.size/1024).toFixed(1)} КБ)`;
      btn.addEventListener("click", () => {
        if (currentFile && code.value !== (mem.get(currentFile)?.code || "")
            && !confirm("Несохранённые изменения будут потеряны. Продолжить?")) return;
        const prog = mem.get(p.name);
        fn.value = p.name;
        if(prog?.data){
          code.value=Array.from(prog.data,(byte,index)=>
            (index%16===0?"\n":"")+byte.toString(16).padStart(2,"0")).join("").trim();
          code.readOnly=true;
        }else{
          code.value = prog?.code || "";
          code.readOnly=false;
        }
        currentFile = p.name;
        showMsg("Загружено: " + p.name);
      });
      const del = document.createElement("button");
      del.textContent = "×";
      del.className = "editor-del";
      del.title = "Удалить";
      del.addEventListener("click", () => {
        mem.delete(p.name);
        if (currentFile === p.name){ fn.value = ""; code.value = ""; currentFile = null; }
        refreshList();
        showMsg("Удалено: " + p.name);
      });
      row.appendChild(btn);
      row.appendChild(del);
      list.appendChild(row);
    }
  }

  div.querySelector(".editor-close").addEventListener("click", closeComputerEditor);

  div.querySelector("#edNew").addEventListener("click", () => {
    if (code.value && !confirm("Несохранённые изменения будут потеряны. Продолжить?")) return;
    fn.value = "";
    code.value = "";
    code.readOnly = false;
    currentFile = null;
    showMsg("");
    fn.focus();
  });

  div.querySelector("#edSave").addEventListener("click", () => {
    const name = fn.value.trim();
    if (!name){ showMsg("Введите имя файла"); return; }
    if(code.readOnly){ showMsg("Бинарный файл нельзя редактировать"); return; }
    if (!/\.(asm|bas)$/i.test(name)) fn.value = name + ".asm";
    const err = mem.save(fn.value, code.value);
    if (err){ showMsg(err); }
    else { showMsg("Сохранено: " + fn.value); currentFile = fn.value; }
    refreshList();
  });

  div.querySelector("#edBuild").addEventListener("click",()=>{
    if(code.readOnly){ showMsg("Выберите исходный .asm файл"); return; }
    try{
      const binary=new Assembler().assembleBinary(code.value);
      const sourceName=fn.value.trim() || "program.asm";
      const binaryName=sourceName.replace(/\.(asm|bas)$/i,"")+".bin";
      const err=mem.saveBinary(binaryName,binary);
      if(err)showMsg(err);
      else{ showMsg(`Собрано: ${binaryName} · ${binary.length} Б`); refreshList(); }
    }catch(err){ showMsg("Ошибка сборки: "+err.message); }
  });

  div.querySelector("#edRun").addEventListener("click", () => {
    output.textContent = "";
    try {
      const file=mem.get(currentFile);
      if(!file?.data)throw new Error("сначала соберите .asm и выберите созданный .bin");
      const terminal = window._pixelCosmosTerminal || null;
      const result = item.runtime.runBinary(file.data, terminal);
      terminal?.canvas?.focus();
      output.textContent = [
        ...result.output,
        `— HALT · ${result.steps} инструкций · CPU ${result.threads} поток(а)`,
        `RAM ${result.ramBytes/1024} КБ · GPU ${result.outputMode}`,
        result.registers
      ].join("\n");
      showMsg("Программа завершена");
    } catch (err){
      output.textContent = "ОШИБКА: " + err.message;
      showMsg("Ошибка выполнения");
    }
  });

  refreshList();
}

export function closeComputerEditor(){
  if (panel){ panel.remove(); panel = null; }
}
