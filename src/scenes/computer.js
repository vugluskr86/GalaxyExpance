import { ComputerMemory } from "../game/computer.js";

/** Боковая панель редактора программ борткомпьютера.
 *  Вызывается из OutfitScene при клике на компьютер. */
let panel = null;  // текущая открытая панель

export function openComputerEditor(item, ctx){
  closeComputerEditor();
  const layout = document.querySelector(".layout");
  if (!layout || !item || !item.memory) return;

  const mem = item.memory;
  let currentFile = null;

  const div = document.createElement("div");
  div.className = "editor-panel";
  div.innerHTML = `<div class="editor-header">
    <span>${item.name} · ${mem.ramKb} КБ</span>
    <button class="editor-close" title="Закрыть">×</button>
  </div>
  <div class="editor-body">
    <div class="editor-left">
      <div class="editor-toolbar">
        <input id="edFilename" type="text" placeholder="имя.bas" class="editor-filename">
        <button id="edNew">Новый</button>
        <button id="edSave">Сохранить</button>
      </div>
      <textarea id="edCode" class="editor-code" placeholder="введите код..." spellcheck="false"></textarea>
      <div class="editor-msg" id="edMsg"></div>
    </div>
    <div class="editor-right">
      <div class="editor-info" id="edInfo"></div>
      <div class="editor-list" id="edList"></div>
    </div>
  </div>`;

  layout.appendChild(div);
  panel = div;

  const fn = div.querySelector("#edFilename");
  const code = div.querySelector("#edCode");
  const msg = div.querySelector("#edMsg");
  const info = div.querySelector("#edInfo");
  const list = div.querySelector("#edList");

  function showMsg(txt){ msg.textContent = txt; }

  function refreshList(){
    const progs = mem.list();
    info.textContent = `Программ: ${progs.length} · занято ${(mem.totalBytes()/1024).toFixed(1)}/${mem.ramKb} КБ`;
    list.innerHTML = "";
    for(const p of progs){
      const row = document.createElement("div");
      row.className = "editor-file-row";
      const btn = document.createElement("button");
      btn.textContent = `${p.name} (${(p.size/1024).toFixed(1)} КБ)`;
      btn.addEventListener("click", () => {
        if (currentFile && code.value !== (mem.get(currentFile)?.code || "") && !confirm("Несохранённые изменения будут потеряны. Продолжить?")) return;
        const prog = mem.get(p.name);
        fn.value = p.name;
        code.value = prog ? prog.code : "";
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
    currentFile = null;
    showMsg("");
    fn.focus();
  });

  div.querySelector("#edSave").addEventListener("click", () => {
    const name = fn.value.trim();
    if (!name){ showMsg("Введите имя файла"); return; }
    if (!name.endsWith(".bas")) fn.value = name + ".bas";
    const err = mem.save(fn.value, code.value);
    if (err){ showMsg(err); }
    else { showMsg("Сохранено: " + fn.value); currentFile = fn.value; }
    refreshList();
  });

  refreshList();
}

export function closeComputerEditor(){
  if (panel){ panel.remove(); panel = null; }
}