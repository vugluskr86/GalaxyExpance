import { BIOS_ASM, DEFAULT_OS_ASM } from "./bios.js";
import { Assembler } from "./cpu.js";
import { DEMOSCENE_ASM } from "./demoscene.js";
import { SCANNER_ASM, SCANNER_BIN } from "./scanner-generated.js";

/** Бортовой компьютер корабля: хранилище программ с ограничением по RAM (КБ).
 *  Размер программы считается как длина кода в байтах (UTF-8). */
const enc = new TextEncoder();

export class ComputerMemory {
  constructor(ramKb = 32){
    this.ramKb = ramKb;           // максимальный объём, КБ
    this.programs = [];           // [{ name, code, size }]
    // предустановленные программы
    this.programs.push(this._encode("hello.asm", `; Pixel Cosmos ASM
.protected
PRINT "Привет, капитан!"
LOAD_A 6
LOAD_B 7
MUL_A_B
PRINT "6 × 7 ="
PRINT_A
VSET V0, 1, 2, 3, 4
LOAD_F 2
VSCALE_V0
PRINT_V V0
HALT`));
    this.programs.push(this._encode("os.asm", DEFAULT_OS_ASM));
    this.programs.push(this._binary("os.bin",new Assembler().assembleBinary(DEFAULT_OS_ASM)));
    this.programs.push(this._encode("demoscene.asm", DEMOSCENE_ASM));
    this.programs.push(this._binary("demoscene.bin",new Assembler().assembleBinary(DEMOSCENE_ASM)));
    this.programs.push(this._binary("scanner.bin", SCANNER_BIN));
  }
  _encode(name, code){
    const size = enc.encode(code).length;
    return { name, code, size };
  }
  _binary(name, data){
    const bytes=data instanceof Uint8Array ? data : new Uint8Array(data);
    return {name,data:new Uint8Array(bytes),size:bytes.length};
  }
  /** Суммарный размер всех программ в байтах. */
  totalBytes(){
    return this.programs.reduce((s, p) => s + p.size, 0);
  }
  /** Свободно байт. */
  freeBytes(){
    return this.ramKb * 1024 - this.totalBytes();
  }
  /** Список имён программ. */
  list(){ return this.programs.map(p => ({ name: p.name, size: p.size })); }
  /** Получить код программы по имени. */
  get(name){ return this.programs.find(p => p.name === name) || null; }
  /** Сохранить программу. Возвращает null если успех, или строку ошибки. */
  save(name, code){
    const newSize = enc.encode(code).length;
    const old = this.programs.find(p => p.name === name);
    const oldSize = old ? old.size : 0;
    if (this.totalBytes() - oldSize + newSize > this.ramKb * 1024){
      return "Недостаточно памяти (свободно " +
        Math.floor(this.freeBytes()/1024*10)/10 + " КБ, нужно " +
        Math.ceil(newSize/1024*10)/10 + " КБ)";
    }
    if (old){ old.code = code; old.size = newSize; }
    else this.programs.push(this._encode(name, code));
    return null;
  }
  saveBinary(name,data){
    const binary=this._binary(name,data);
    const old=this.programs.find(p=>p.name===name);
    const oldSize=old?.size || 0;
    if(this.totalBytes()-oldSize+binary.size>this.ramKb*1024)return "Недостаточно места на DRIVE";
    if(old)Object.assign(old,binary);
    else this.programs.push(binary);
    return null;
  }
  /** Удалить программу по имени. */
  delete(name){
    const idx = this.programs.findIndex(p => p.name === name);
    if (idx >= 0) this.programs.splice(idx, 1);
  }
}

/**
 * Энергонезависимая память корпуса. Она намеренно отделена от носителей:
 * смена диска не сбрасывает порядок загрузки и не заменяет прошивку.
 */
export class ComputerFirmware {
  constructor({biosSource=BIOS_ASM,bootDevice=null,bootFile="os.bin"}={}){
    this.biosSource=String(biosSource);
    this.settings={bootDevice,bootFile};
  }
  saveSettings(settings){
    this.settings={
      bootDevice:settings?.bootDevice ?? null,
      bootFile:String(settings?.bootFile || "os.bin")
    };
  }
  replaceBios(source){
    if(typeof source!=="string" || !source.trim())throw new Error("BIOS не может быть пустым");
    this.biosSource=source;
  }
}
