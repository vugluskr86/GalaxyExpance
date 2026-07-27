/** Бортовой компьютер корабля: хранилище программ с ограничением по RAM (КБ).
 *  Размер программы считается как длина кода в байтах (UTF-8). */
const enc = new TextEncoder();

export class ComputerMemory {
  constructor(ramKb = 32){
    this.ramKb = ramKb;           // максимальный объём, КБ
    this.programs = [];           // [{ name, code, size }]
    // предустановленные программы
    this.programs.push(this._encode("hello.bas", `rem "Привет, капитан!"\nprint "Pixel Cosmos v1.0"\nprint "Бортовой компьютер МК-1 готов."`));
  }
  _encode(name, code){
    const size = enc.encode(code).length;
    return { name, code, size };
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
  /** Удалить программу по имени. */
  delete(name){
    const idx = this.programs.findIndex(p => p.name === name);
    if (idx >= 0) this.programs.splice(idx, 1);
  }
}