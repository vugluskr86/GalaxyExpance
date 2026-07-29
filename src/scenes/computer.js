import { Assembler } from "../game/cpu.js";
import { t, tr } from "../i18n/index.js";

let panel = null;

export function openComputerEditor(item){
  closeComputerEditor();
  const stage = document.querySelector(".stage");
  const parent = stage ? stage.parentElement : null;
  if (!parent || !item || !item.memory) return;

  const mem = item.memory;
  const cpu = item.slots.cpu?.stats.threads || 0;
  const ram = item.slots.ram?.stats.capacityKb || 0;
  const gpu = item.slots.gpu?.stats.output || t("ui.none");
  let currentFile = null;

  const div = document.createElement("div");
  div.className = "editor-panel";
  div.innerHTML = `<div class="editor-header">
    <span>${item.name} · CPU ${cpu} ${t("ui.threads")} · RAM ${ram} ${t("ui.kb")} · DRIVE ${mem.ramKb} ${t("ui.kb")} · GPU ${gpu}</span>
    <button class="editor-close" title="${t("ui.close")}">×</button>
  </div>
  <div class="editor-body">
    <div class="editor-left">
      <div class="editor-toolbar">
        <input id="edFilename" type="text" placeholder="${t("ui.filenamePlaceholder")}" class="editor-filename">
        <button id="edNew" class="editor-toolbtn" title="${t("ui.newFile")}" aria-label="${t("ui.newFile")}">＋</button>
        <button id="edSave" class="editor-toolbtn" title="${t("ui.saveSource")}" aria-label="${t("ui.saveSource")}">▣</button>
        <button id="edBuild" class="editor-toolbtn" title="${t("ui.assemble")}" aria-label="${t("ui.assemble")}">⚙</button>
        <button id="edRun" class="editor-toolbtn editor-toolbtn-run" title="${t("ui.runBinary")}" aria-label="${t("ui.runBinary")}">▶</button>
      </div>
      <textarea id="edCode" class="editor-code" placeholder="${t("ui.assemblyPlaceholder")}" spellcheck="false"></textarea>
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
      `${t("ui.programs")}: ${progs.length} · ${t("ui.used")} ${(mem.totalBytes()/1024).toFixed(1)}/${mem.ramKb} ${t("ui.kb")}`;
    list.innerHTML = "";
    for(const p of progs){
      const row = document.createElement("div");
      row.className = "editor-file-row";
      const btn = document.createElement("button");
      btn.textContent = `${p.name} (${(p.size/1024).toFixed(1)} ${t("ui.kb")})`;
      btn.addEventListener("click", () => {
        if (currentFile && code.value !== (mem.get(currentFile)?.code || "")
            && !confirm(t("ui.unsavedConfirm"))) return;
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
        showMsg(t("ui.loaded") + ": " + p.name);
      });
      const del = document.createElement("button");
      del.textContent = "×";
      del.className = "editor-del";
      del.title = t("ui.delete");
      del.addEventListener("click", () => {
        mem.delete(p.name);
        if (currentFile === p.name){ fn.value = ""; code.value = ""; currentFile = null; }
        refreshList();
        showMsg(t("ui.deleted") + ": " + p.name);
      });
      row.appendChild(btn);
      row.appendChild(del);
      list.appendChild(row);
    }
  }

  div.querySelector(".editor-close").addEventListener("click", closeComputerEditor);

  div.querySelector("#edNew").addEventListener("click", () => {
    if (code.value && !confirm(t("ui.unsavedConfirm"))) return;
    fn.value = "";
    code.value = "";
    code.readOnly = false;
    currentFile = null;
    showMsg("");
    fn.focus();
  });

  div.querySelector("#edSave").addEventListener("click", () => {
    const name = fn.value.trim();
    if (!name){ showMsg(t("ui.enterFilename")); return; }
    if(code.readOnly){ showMsg(t("ui.binaryReadonly")); return; }
    if (!/\.(asm|bas)$/i.test(name)) fn.value = name + ".asm";
    const err = mem.save(fn.value, code.value);
    if (err){ showMsg(err); }
    else { showMsg(t("ui.saved") + ": " + fn.value); currentFile = fn.value; }
    refreshList();
  });

  div.querySelector("#edBuild").addEventListener("click",()=>{
    if(code.readOnly){ showMsg(t("ui.selectSource")); return; }
    try{
      const binary=new Assembler().assembleBinary(code.value);
      const sourceName=fn.value.trim() || "program.asm";
      const binaryName=sourceName.replace(/\.(asm|bas)$/i,"")+".bin";
      const err=mem.saveBinary(binaryName,binary);
      if(err)showMsg(err);
      else{ showMsg(`${t("ui.assembled")}: ${binaryName} · ${binary.length} ${t("ui.bytes")}`); refreshList(); }
    }catch(err){ showMsg(t("ui.buildError")+": "+tr(err.message)); }
  });

  div.querySelector("#edRun").addEventListener("click", () => {
    output.textContent = "";
    try {
      const file=mem.get(currentFile);
      if(!file?.data)throw new Error(t("ui.buildThenSelectBinary"));
      const terminal = window._pixelCosmosTerminal || null;
      const result = item.runtime.runBinary(file.data, terminal);
      terminal?.canvas?.focus();
      output.textContent = [
        ...result.output,
        `— HALT · ${result.steps} ${t("ui.instructions")} · CPU ${result.threads} ${t("ui.threads")}`,
        `RAM ${result.ramBytes/1024} ${t("ui.kb")} · GPU ${result.outputMode}`,
        result.registers
      ].join("\n");
      showMsg(t("ui.programFinished"));
    } catch (err){
      output.textContent = t("ui.error") + ": " + tr(err.message);
      showMsg(t("ui.executionError"));
    }
  });

  refreshList();
}

export function closeComputerEditor(){
  if (panel){ panel.remove(); panel = null; }
}
