# План профилирования Pixel Cosmos

## Уже внедрено

### 1. FPS-оверлей (`src/main.js`)
Выводит в `#npInfo` строку: `FPS:58 | upd:2.3ms | draw:1.1ms`
- Накапливает `performance.now()` замеры для `mgr.update()` и `mgr.draw()`
- Сбрасывает аккумуляторы раз в 1 секунду
- Включается автоматически, убрать: удалить блок `perf*` переменных и `perfOverlay`

### 2. Performance marks в SystemScene (`src/scenes/system.js`)
Условные (по `window.__PERF_MARKS = true` в консоли):
- `sys-update` — полный `update(dt)` от шага орбит до камеры
- `save` — `world.capture()` + `world.persist()`

Включение в Chrome DevTools console:
```js
window.__PERF_MARKS = true;
```

---

## Инструкция: запись трейса

### Подготовка
```js
// В консоли браузера:
window.__PERF_MARKS = true;
```

### Шаг 1: Запись сцены с планетами + NPC
1. Открыть Chrome DevTools → Performance tab
2. Нажать Record (●)
3. В игре: дождаться загрузки системы с 5+ планетами, NPC активны
4. Записать 5 секунд при скорости 1×
5. Остановить запись
6. **Что искать**: функции >1ms, особенно `SystemScene.update`, `stepSystem`

### Шаг 2: Запись на высоком варпе
1. Нажать Record
2. В игре: нажать `]` до 100× варпа
3. Записать 3 секунды
4. Остановить
5. **Что искать**: длинные `dt` → много подшагов в `stepSystem`, `ship.update`

### Шаг 3: Запись пояса астероидов
1. Найти систему с поясом (belt)
2. Zoom out чтобы видно максимум камней
3. Записать 5 секунд при 1×
4. **Что искать**: `draw()` → цикл по `S.belt.rocks`

---

## Гипотезы узких мест (для проверки в flame chart)

| # | Гипотеза | Файл | Строки | Почему |
|---|----------|------|--------|--------|
| 1 | **Physics sub-steps** | `src/gen/system.js` | `stepSystem()` | При варпе 100× `dt` ~1.6s — если планеты интегрируются мелким шагом |
| 2 | **NPC AI × физика** | `src/game/ship.js` | `update()` | До 12 NPC, каждый со своей физикой и агентным AI |
| 3 | **Двойной проход NPC** | `src/scenes/system.js` | 439–442 | `n.update()` + `updateNpcEconomy(n)` — два цикла по NPC |
| 4 | **Орбиты — fillRect на пиксель** | `src/scenes/system.js` | `drawWorldCircleAt` (465), `drawOrbit` (502), `drawTrack` (477) | Сотни вызовов `fillRect(1,1)` вместо одного `stroke()` |
| 5 | **savegame JSON** | `src/game/savegame.js` | `persist()` | `localStorage.setItem()` с растущим payload |
| 6 | **renderStar per-frame** | `src/gen/star.js` | `renderStar()` | Грануляция + limb darkening + corona rays каждый кадр |
| 7 | **Эффекты (particles)** | `src/game/effects.js` | `update()`, `draw()` | Фильтрация массива `.filter()` + `fillRect` на каждую частицу |

---

## Метод исключения (disabling subsystems)

В Chrome console поочерёдно отключать подсистемы и замерять FPS по оверлею:

```js
// 1. Отключить NPC
const origNpcs = mgr.current.npcs;
mgr.current.npcs = [];

// 2. Отключить эффекты
const origEffects = mgr.current.effects;
mgr.current.effects = { update:()=>{}, draw:()=>{}, engine:()=>{}, muzzle:()=>{}, impact:()=>{} };

// 3. Отключить автосохранение
mgr.current._noSave = true;  // (требует модификации кода — см. ниже)

// 4. Отключить орбиты (пропустить drawOrbit/drawTrack)
// Вручную закомментировать вызовы в draw()
```

Восстановление: перезагрузить страницу (F5).

### Патч для пропуска автосохранения
В `src/scenes/system.js:460` добавить условие:
```js
if(this.world&&!this._noSave&&(!this._lastSaveReal||nowReal-this._lastSaveReal>=3000)){
```

---

## Быстрые победы (без профилирования)

Эти оптимизации можно сделать сразу — причина тормозов очевидна из кода:

### A. Орбиты через `stroke()` вместо `fillRect()`
**Файл**: `src/scenes/system.js` — `drawOrbit()`, `drawWorldCircleAt()`, `drawTrack()`
**Суть**: Заменить десятки/сотни `fillRect(x,y,1,1)` на один `beginPath() + arc()/moveTo+lineTo + stroke()`.
**Выигрыш**: уменьшение числа вызовов canvas API в 10–50×.

### B. Кэш орбит в оффскрин-канвас
**Суть**: Орбиты планет не меняются (если корабль не жжёт двигатель). Отрисовать один раз в `OffscreenCanvas`, перерисовывать только при `playerShip.burning === true`.
**Выигрыш**: экономия на пересчёте орбит каждый кадр.

### C. Throttle savegame через requestIdleCallback
**Суть**: `world.capture()` (сериализация) может быть дорогой. Обернуть в `requestIdleCallback` или `setTimeout(0)` чтобы не блокировать кадр.
**Выигрыш**: исчезновение фризов при автосохранении.

---

## Чек-лист профилирования

- [ ] Записать Chrome Performance trace: 1× скорость, система с 5+ планетами
- [ ] Записать Chrome Performance trace: 100× варп
- [ ] Записать Chrome Performance trace: пояс астероидов
- [ ] Проанализировать flame chart — найти функции >1ms
- [ ] Методом исключения (disabling) измерить вклад NPC
- [ ] Методом исключения измерить вклад эффектов
- [ ] Методом исключения измерить вклад автосохранения
- [ ] Реализовать быстрые победы (A–C)
- [ ] Повторить замеры после оптимизаций

---

## Профилирование памяти

### Симптомы утечки
- JS heap растёт монотонно, не снижается после GC
- Переключение сцен (System→Cluster→System) увеличивает baseline
- Долгая игра (>10 мин) вызывает фризы или падение FPS

### Инструменты

| Инструмент | Что даёт |
|---|---|
| **Chrome → Memory → Allocation sampling** | Профиль распределения памяти: кто сколько аллоцирует |
| **Chrome → Memory → Heap snapshot** (2 снимка) | Сравнение двух снимков (до/после действия): объекты, которые не были собраны |
| **`performance.memory`** (Chrome-only) | Быстрый мониторинг: `usedJSHeapSize`, `totalJSHeapSize` |
| **Консольный сэмплер** (memory-sampler.js) | Автоматический лог в `#npPerf` каждые 5 секунд |
| **Выделение per-frame** | `performance.measureUserAgentSpecificMemory()` — детальный отчёт |

### Внедрение: консольный сэмплер

В Chrome DevTools console выполнить:
```js
// Запустить мониторинг JS heap (вывод в #npPerf раз в 5 сек)
const memPoll = setInterval(() => {
  if (!performance.memory) return;
  const mb = (v) => (v / 1024 / 1024).toFixed(1) + "MB";
  const used = performance.memory.usedJSHeapSize;
  const total = performance.memory.totalJSHeapSize;
  const limit = performance.memory.jsHeapSizeLimit;
  const pct = (used / limit * 100).toFixed(1);
  npPerf.textContent = `HEAP: ${mb(used)} / ${mb(total)} (limit ${mb(limit)}) = ${pct}%`;
  // Сохранить для построения графика:
  window._memLog = window._memLog || [];
  window._memLog.push({ t: Date.now(), used, total, limit });
}, 5000);

// Остановить мониторинг: clearInterval(memPoll)
```

Построить график по логу:
```js
// В консоли DevTools:
if (window._memLog?.length) {
  console.table(window._memLog.map((e, i) => ({
    sec: ((e.t - window._memLog[0].t) / 1000).toFixed(0),
    usedMB: (e.used / 1024 / 1024).toFixed(1),
    totalMB: (e.total / 1024 / 1024).toFixed(1),
    pct: (e.used / e.limit * 100).toFixed(1) + "%"
  })));
}
// Или скопировать в буфер для вставки в Excel/Sheets:
copy(JSON.stringify(window._memLog.map(e => ({
  time: (e.t - window._memLog[0].t) / 1000,
  usedMB: +(e.used / 1024 / 1024).toFixed(1),
  totalMB: +(e.total / 1024 / 1024).toFixed(1)
}))));
```

### Методика поиска утечки

#### Шаг 1: Baseline в разных сценах
1. Открыть систему, подождать 10 сек, сделать Heap Snapshot #1
2. Нажать «← назад» в галактику, сделать Snapshot #2
3. Кликнуть по другой звезде (переход в новую систему), Snapshot #3
4. Сравнить #3 с #1: объекты с положительным delta — потенциальная утечка

#### Шаг 2: Allocation sampling (кто аллоцирует)
1. Перейти в Memory → Allocation sampling → Start
2. 30 секунд игры
3. Остановить
4. Искать необычно большие аллокации или растущие массивы

#### Шаг 3: Проверка гипотез (отключение подсистем)
```js
// 1. Временно закомментировать canvas рендеринг планет
//    (renderPlanetLod аллоцирует оффскрин-канвасы каждый кадр)
//    в src/scenes/system.js:604 заменить на:
//    sctx.fillStyle = "#8497b8";
//    sctx.fillRect(Math.round(this.ssx(x)), Math.round(this.ssy(y)), 2, 2);

// 2. Отключить автосохранение (уже есть _noSave)
mgr.current._noSave = true;

// 3. Отключить NPC
const origNpcs = mgr.current.npcs; mgr.current.npcs = [];
```

### Ожидаемые источники утечек

| # | Гипотеза | Файл | Механизм |
|---|----------|------|----------|
| 1 | **Оффскрин-канвасы планет** | `src/gen/planet.js` → `renderPlanetLod()` | Каждый кадр создаётся новый OffscreenCanvas/ImageData, старые не освобождаются |
| 2 | **renderStar per-frame** | `src/gen/star.js` | Грануляция каждый кадр пересоздаёт ImageData |
| 3 | **Накопление эффектов** | `src/game/effects.js` | Массив `this.particles` монотонно растёт (filter не срабатывает при dt=0) |
| 4 | **savegame JSON** | `src/game/savegame.js` | `capture()` создаёт глубокую копию состояния каждый раз, мусор копится |
| 5 | **Замыкания в render path** | `src/scenes/system.js:draw()` | `drawBody`/`drawBracket` — функции создаются каждый кадр |
| 6 | **Event listeners** | `src/main.js` | `beforeunload` не чистится при смене сцен |
| 7 | **Scene stack** | `src/scenes/manager.js` | Умершие сцены удерживаются в `stack` и не GC-ятся |

### Быстрые победы (без профилирования)

1. **Кэшировать оффскрин-канвасы планет** — `renderPlanetLod` должен проверять, изменились ли параметры, и возвращать кэшированный спрайт
2. **Переиспользовать ImageData** — вместо `new ImageData()` каждый кадр, создать один буфер и перезаписывать в него
3. **Убрать создание функций в draw()** — вынести `drawBody`/`drawBracket` в методы класса/модуля
4. **Очищать scene stack глубже 3** — `setStack()` должен явно удалять ссылки на старые сцены
