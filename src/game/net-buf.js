/**
 * net-buf.js — Кольцевые буферы RX/TX для сетевой подсистемы ядра.
 * =============================================================================
 * Каждый сетевой интерфейс (NIC, коммутатор) имеет два буфера: RX и TX.
 * Буферы реализованы в JS для эффективности; ядро assembly обращается к ним
 * через сисколлы SYS_NET_SEND / SYS_NET_RECV.
 *
 * Структура буфера:
 *   readIdx  — индекс начала непрочитанных данных в окне
 *   writeIdx — индекс начала свободного места в окне
 *   count    — количество фреймов в буфере
 *   frames   — массив { data: Uint8Array } (кольцевая очередь)
 *   dropped  — счётчик потерянных фреймов (переполнение)
 *   maxFrames — максимальное число фреймов
 *   maxBytes  — максимальный суммарный размер данных (байт)
 * =============================================================================
 */

/** Один кольцевой буфер (RX или TX) для сетевого интерфейса. */
export class NetBuf {
  /**
   * @param {number} maxFrames — максимальное число фреймов (по умолчанию 16)
   * @param {number} maxBytes — максимальный суммарный размер (по умолчанию 4096)
   */
  constructor(maxFrames = 16, maxBytes = 4096) {
    this.maxFrames = maxFrames;
    this.maxBytes = maxBytes;
    /** @type {{data: Uint8Array}[]} */
    this.frames = [];
    this.totalFrames = 0;     // общее число фреймов за всё время
    this.totalDropped = 0;    // общее число отброшенных фреймов
    this.currentBytes = 0;    // текущий суммарный размер данных
  }

  /** Сброс буфера в исходное состояние. */
  reset() {
    this.frames = [];
    this.totalFrames = 0;
    this.totalDropped = 0;
    this.currentBytes = 0;
  }

  /**
   * Запись фрейма в буфер.
   * @param {Uint8Array} data — данные фрейма
   * @returns {{ok: boolean, dropped?: boolean}} — результат записи
   */
  write(data) {
    if (!(data instanceof Uint8Array) || data.length === 0) {
      return { ok: false, reason: "empty-frame" };
    }

    this.totalFrames++;

    // Проверяем лимиты
    if (this.frames.length >= this.maxFrames ||
        this.currentBytes + data.length > this.maxBytes) {
      this.totalDropped++;
      return { ok: false, dropped: true, reason: "buffer-full" };
    }

    // Копируем данные (владеем своей копией, caller может переиспользовать буфер)
    const copy = new Uint8Array(data);
    this.frames.push({ data: copy });
    this.currentBytes += data.length;
    return { ok: true };
  }

  /**
   * Чтение одного фрейма из буфера (FIFO).
   * @returns {Uint8Array|null} — данные фрейма или null если буфер пуст
   */
  read() {
    if (this.frames.length === 0) return null;
    const frame = this.frames.shift();
    this.currentBytes -= frame.data.length;
    return frame.data;
  }

  /**
   * Просмотр первого фрейма без извлечения.
   * @returns {Uint8Array|null}
   */
  peek() {
    if (this.frames.length === 0) return null;
    return this.frames[0].data;
  }

  /** @returns {number} — количество фреймов в буфере */
  get count() { return this.frames.length; }

  /** @returns {number} — доступно байт для чтения */
  get available() { return this.currentBytes; }

  /** @returns {number} — свободно байт */
  get free() { return this.maxBytes - this.currentBytes; }
}

/**
 * Пара буферов (RX + TX) для одного сетевого интерфейса.
 */
export class NetInterface {
  /**
   * @param {string} mac — MAC-адрес интерфейса (строка "xx:xx:xx:xx:xx:xx")
   */
  constructor(mac) {
    this.mac = mac;
    this.rx = new NetBuf(16, 4096);
    this.tx = new NetBuf(16, 4096);
  }
}

/**
 * Управление всеми сетевыми интерфейсами корабля.
 */
export class NetBufManager {
  constructor() {
    /** @type {Map<string, NetInterface>} */
    this.interfaces = new Map();
  }

  /**
   * Получить (или создать) интерфейс по MAC-адресу.
   * @param {string} mac
   * @returns {NetInterface}
   */
  getOrCreate(mac) {
    if (!this.interfaces.has(mac)) {
      this.interfaces.set(mac, new NetInterface(mac));
    }
    return this.interfaces.get(mac);
  }

  /**
   * Записать фрейм во входной буфер (RX) интерфейса.
   * Вызывается при получении Ethernet-фрейма из симуляции.
   * @param {string} mac — MAC получателя
   * @param {Uint8Array} data — данные фрейма
   * @returns {{ok: boolean}}
   */
  deliverToRx(mac, data) {
    const iface = this.getOrCreate(mac);
    return iface.rx.write(data);
  }

  /**
   * Прочитать фрейм из входного буфера (RX).
   * Вызывается ядром через SYS_NET_RECV.
   * @param {string} mac
   * @returns {{data: Uint8Array}|null}
   */
  receiveFromRx(mac) {
    const iface = this.interfaces.get(mac);
    if (!iface) return null;
    const data = iface.rx.read();
    return data ? { data } : null;
  }

  /** Сброс всех буферов (например, при перезагрузке сети). */
  resetAll() {
    for (const iface of this.interfaces.values()) {
      iface.rx.reset();
      iface.tx.reset();
    }
  }
}