# C Compiler for PCVM — План работ

## Архитектура цели

**Целевая платформа**: PCVM v3 (Pixel Cosmos Virtual Machine) — 32-битная стековая/регистровая VM внутри игры.

**Регистры CPU**:
- Общего назначения: `A`, `B`, `C`, `D` (int32)
- Вещественные: `FA`, `FB`, `FC`, `FD` (float32)
- Векторные (SIMD): `V0`–`V7` (4×float32)
- Указатель стека: `SP`, счётчик команд: `PC`

**Системные вызовы**: терминал (печать, графика, ввод), файловая система (VFS), IPC, процессы, сеть, время.

**Модель памяти**: flat 32-bit, protected mode с разделением kernel/user, стек в user-space.

**Существующий тулчейн**:
- `AssemblyCompiler` — ассемблер `.asm` → PCOB объектный файл
- `Linker` — статическая линковка объектных файлов → исполняемый бинарник
- Шелл PCOS — команды `asm`, `link`, `run`

---

## Фаза 1: Подмножество языка (C89 subset)

Компилятор реализует упрощённое подмножество C, достаточное для написания утилит и программ в игре.

### Типы данных
| Тип C         | Размер | PCVM регистр |
|---------------|--------|-------------|
| `char`        | 8 бит  | A (int32)   |
| `short`       | 16 бит | A (int32)   |
| `int`         | 32 бит | A–D         |
| `long`        | 32 бит | A–D         |
| `float`       | 32 бит | FA–FD       |
| `double`      | 32 бит | FA–FD (без double precision) |
| `void`        | —      | —            |
| `char*`, `int*` и т.д. | 32 бит | A–D |

### Операторы
- Арифметика: `+`, `-`, `*`, `/`, `%` (int и float)
- Сравнения: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Логические: `&&`, `||`, `!`
- Побитовые: `&`, `|`, `^`, `~`, `<<`, `>>`
- Присваивание: `=`, `+=`, `-=` и т.д.
- Инкремент/декремент: `++`, `--` (префиксный и постфиксный)
- Условный: `?:`
- Приведение типов (cast): `(int)`, `(float)`

### Управляющие конструкции
- `if` / `else`
- `while`, `do` / `while`
- `for`
- `switch` / `case` / `default` / `break` (с целочисленными константами)
- `return`
- `goto` (с локальными метками)

### Функции
- Определение: `тип имя(параметры) { тело }`
- Вызов: `имя(аргументы)`
- Соглашение вызова: параметры через стек, возврат в `A` (int) или `FA` (float)
- До 4 параметров передаются в A–D, остальные через стек
- Поддержка рекурсии (ограничена размером стека, default 4096 байт)

### Переменные и область видимости
- Локальные переменные на стеке
- Глобальные переменные в секции `.DATA`
- `static` (локальные с постоянным адресом в DATA)
- `const` (проверка на этапе компиляции, размещаются в DATA)

### Препроцессор
- `#define` (константы и макросы без параметров)
- `#include "..."` (локальные файлы)
- `#include <...>` (системные заголовки из `/usr/include`)
- `#ifdef` / `#ifndef` / `#else` / `#endif`
- Комментарии `//` и `/* */`

### Без реализации в v1
- `struct`, `union`, `enum` — только в следующих версиях
- Массивы — только через указатели + malloc
- Указатели на функции
- `sizeof` (только для базовых типов, не для массивов)
- `typedef`
- Variadic функции
- `inline`

---

## Фаза 2: Архитектура компилятора

Компилятор будет написан на JavaScript (Node.js) как отдельный CLI-инструмент, который запускается вне игры для компиляции `.c` → `.obj`, затем `.obj` пакуется в PCFD образ.

```
файл.c → [Препроцессор] → [Лексер] → [Парсер] → [AST] → [Генератор кода] → файл.obj
```

### 2.1 Препроцессор (`src/compiler/preprocessor.js`)
- Обработка `#include`, `#define`, условной компиляции
- Вывод единого препроцессированного текста
- Отслеживание `#line` для сообщений об ошибках

### 2.2 Лексер (`src/compiler/lexer.js`)
- Токенизация: ключевые слова, идентификаторы, числа (dec, hex), строки, символы, операторы
- Пробелы и комментарии пропускаются
- Вывод потока токенов с позициями в исходном файле

### 2.3 Парсер (`src/compiler/parser.js`)
- Рекурсивный спуск (recursive descent) без генераторов
- AST узлы: `Program`, `FunctionDecl`, `VarDecl`, `BinaryExpr`, `CallExpr`, `IfStmt`, `WhileStmt`, `ForStmt`, `ReturnStmt`, `Block`, и т.д.
- Таблица символов с областями видимости (scope stack)
- Проверка типов на месте

### 2.4 Генератор кода (`src/compiler/codegen.js`)
- Проход по AST → линейный список псевдо-инструкций PCVM asm
- Выделение регистров: простой greedy allocator (4 регистра + spill на стек)
- Конвертация в текстовый `.asm`, совместимый с существующим `AssemblyCompiler`

### 2.5 Драйвер (`scripts/compile-c.mjs`)
- CLI: `node scripts/compile-c.mjs source.c -o output.obj`
- Вызывает preprocessor → lexer → parser → codegen → assembler
- Флаг `--lib` для компиляции в библиотеку (без `main`)
- Флаг `-I` для указания путей include

---

## Фаза 3: Стандартная библиотека (`libc/`)

Библиотека пишется частично на C (компилируется новым компилятором), частично на asm (для syscall wrapper'ов).

### 3.1 Системные вызовы (asm wrapper'ы)
| Функция        | Сисколл          | Описание                        |
|----------------|------------------|---------------------------------|
| `_sys_print`   | `0x41` (TTY_WRITE) | Вывод строки на терминал     |
| `_sys_clear`   | `0x43` (TTY_CLEAR) | Очистка терминала            |
| `_sys_input`   | `0x70` (IN_KEY)    | Чтение клавиши               |
| `_sys_time`    | `0x50` (SYS_TIME)  | Системное время              |
| `_sys_yield`   | `0x6F` (YIELD)     | Отдать управление            |
| `_sys_spawn`   | `0x52` (SPAWN)     | Запустить процесс            |
| `_sys_exit`    | `0x53` (EXIT)      | Завершить процесс            |
| `_sys_open`    | `0x57` (FS_LIST)   | Открыть файл (через FS API)  |
| `_sys_read`    | `0x58` (FS_READ)   | Читать из файла              |
| `_sys_write`   | `0x59` (FS_WRITE)  | Писать в файл                |
| `_sys_malloc`  | `0x54` (MEM_INFO)  | Выделить память (через mm)   |
| `_sys_free`    | `0x55` (MEM_FREE)  | Освободить память            |
| `_sys_ipc_send`| `0x5C` (IPC_SEND)  | Отправить сообщение          |
| `_sys_ipc_recv`| `0x5D` (IPC_RECV)  | Получить сообщение           |

### 3.2 Стандартные заголовки

**`<stddef.h>`** — базовые определения
```c
#define NULL ((void*)0)
typedef unsigned int size_t;
typedef int ptrdiff_t;
```

**`<stdint.h>`** — целочисленные типы
```c
typedef signed char int8_t;
typedef unsigned char uint8_t;
typedef short int16_t;
typedef unsigned short uint16_t;
typedef int int32_t;
typedef unsigned int uint32_t;
```

**`<stdbool.h>`**
```c
#define bool int
#define true 1
#define false 0
```

**`<stdio.h>`** — ввод/вывод
```c
void putchar(char c);
void puts(const char* s);
void print_int(int n);
void print_float(float f);
char getchar(void);
int gets(char* buf, int max);
```

**`<stdlib.h>`** — стандартная библиотека
```c
void* malloc(size_t size);
void free(void* ptr);
int atoi(const char* s);
float atof(const char* s);
void itoa(int n, char* buf, int base);
int rand(void);
void srand(unsigned int seed);
void exit(int status);
```

**`<string.h>`** — работа со строками
```c
size_t strlen(const char* s);
char* strcpy(char* dst, const char* src);
char* strncpy(char* dst, const char* src, size_t n);
int strcmp(const char* a, const char* b);
int strncmp(const char* a, const char* b, size_t n);
char* strchr(const char* s, char c);
void* memset(void* ptr, int value, size_t n);
void* memcpy(void* dst, const void* src, size_t n);
```

**`<math.h>`** — математика (использует float-регистры)
```c
float sinf(float x);
float cosf(float x);
float sqrtf(float x);
float fabsf(float x);
float floorf(float x);
float ceilf(float x);
float roundf(float x);
```

**`<pcos.h>`** — специфичное для Pixel Cosmos
```c
void gfx_pixel(int x, int y, int color);
void gfx_line(int x1, int y1, int x2, int y2, int color);
void gfx_rect(int x, int y, int w, int h, int color);
void gfx_circle(int x, int y, int r, int color, int fill);
void term_clear(void);
void term_color(int fg, int bg);
int input_key(void);      // неблокирующее чтение клавиши
int input_mouse_x(void);
int input_mouse_y(void);
int input_mouse_buttons(void);
void process_yield(void);
int process_spawn(const char* name, const char* path);
void process_kill(int pid);
```

### 3.3 Реализация libc (файлы)

```
libc/
├── include/
│   ├── stddef.h
│   ├── stdint.h
│   ├── stdbool.h
│   ├── stdio.h
│   ├── stdlib.h
│   ├── string.h
│   ├── math.h
│   └── pcos.h
├── sys/
│   └── syscalls.asm     — asm wrapper'ы для сисколлов
├── stdio.c              — putchar, puts, print_int, print_float, getchar, gets
├── stdlib.c             — malloc/free, atoi/atof, itoa, rand, exit
├── string.c             — strlen, strcpy, strcmp, memset, memcpy, strchr
├── math.c               — sinf, cosf, sqrtf (через FSIN/FCOS/FSQRT инструкции)
└── pcos.c               — gfx_*, term_*, input_*, process_*
```

Функции, требующие прямых инструкций CPU (`FSIN`, `FCOS`, `FSQRT`, векторы), реализуются с inline assembly через `asm__()` intrinsic.

---

## Фаза 4: Интеграция в игру

### 4.1 Скрипт сборки (`scripts/build-libc.mjs`)
- Компилирует все `.c` файлы libc в `.obj`
- Ассемблирует `syscalls.asm`
- Линкует в `libc.a` (архив объектных файлов)
- Копирует заголовки в `system/unix/include/`

### 4.2 Модификация `scripts/build-unix-stage7-8.mjs`
- Добавить libc в PCFD образ как `/usr/lib/libc.a`
- Добавить заголовки как `/usr/include/*.h`

### 4.3 Модификация `src/game/os.js`
- Добавить команду `cc` в шелл: `cc source.c -o program.bin`
  - Вызывает компилятор (JS, встроенный в игру)
  - Затем ассемблер → линковщик с libc.a
- Путь поиска заголовков: `/usr/include`

### 4.4 Тестовые программы
```
examples/c/
├── hello.c         — puts("Hello from C!")
├── mandelbrot.c    — ASCII-арт фрактала Мандельброта
├── fib.c           — рекурсивный Фибоначчи
├── sort.c          — пузырьковая сортировка
└── term-paint.c    — рисование пикселей через gfx_pixel
```

---

## Фаза 5: Тестирование

### 5.1 Unit-тесты (`test/c-compiler.test.js`)
- Лексер: все типы токенов
- Парсер: все конструкции языка
- Codegen: проверка выхлопа asm для каждой конструкции
- Сквозные тесты: `.c` → `.obj` → выполнение в CPU

### 5.2 Тесты libc (`test/libc.test.js`)
- Каждая функция стандартной библиотеки
- Проверка граничных случаев (NULL, пустые строки, переполнение)

---

## Статус реализации (актуально на 2026-07-31)

### ✅ Этап 1: Препроцессор и лексер — ГОТОВО
- [x] Директория `src/compiler/` создана
- [x] `preprocessor.js` (208 строк): `#include`, `#define`, `#ifdef`/`#ifndef`/`#else`/`#endif`, удаление комментариев
- [x] `lexer.js` (410 строк): все ключевые слова C89 + `typedef`, `sizeof`, все операторы и разделители, TokenStream wrapper
- [ ] Тесты лексера — НЕТ

### ✅ Этап 2: Парсер — ГОТОВО
- [x] AST-узлы (`parser.js`, 680 строк): Program, FunctionDecl, VarDecl, все конструкции языка
- [x] Парсинг выражений (Pratt parser с приоритетами)
- [x] Парсинг инструкций: `if`/`else`, `while`, `do`/`while`, `for`, `return`, `switch`/`case`/`default`, `goto`/метки, `break`
- [x] Парсинг объявлений функций и переменных, `static`, `const`
- [x] Таблица символов со scope stack и проверка типов (void, char, short, int, long, float, double)
- [x] Дополнительно: поддержка `typedef` и `sizeof` (включены в парсер, сверх v1-скоупа)
- [ ] Тесты парсера — НЕТ

### ✅ Этап 3: Генератор кода — ГОТОВО
- [x] Фреймворк генерации (`codegen.js`, 624 строки): линейный список инструкций через класс CodeGen
- [x] Выделение регистров: greedy allocator (A–D для int, FA–FD для float) + spill на стек
- [x] Генерация выражений (арифметика, сравнения, логические, побитовые, присваивания, ++/--, ?:, cast)
- [x] Генерация управляющих конструкций (метки и переходы)
- [x] Генерация вызовов функций: ABI (первые 4 аргумента в регистрах, остальные на стеке, возврат в A/FA)
- [x] Генерация prologue/epilogue (стек-фрейм, сдвиг SP)
- [x] Вывод в `.asm` формат, совместимый с AssemblyCompiler / PCOB v2
- [ ] Тесты codegen — НЕТ

### ✅ Этап 4: CLI драйвер — ГОТОВО
- [x] `scripts/compile-c.mjs` (117 строк): полный пайплайн preprocessor → lexer → parser → codegen → assembler
- [x] Флаги: `-o`, `-I`, `--lib`, `--help`
- [x] Интеграция с AssemblyCompiler (импорт из `src/game/toolchain.js`)

### ✅ Этап 5: libc — системные вызовы — ГОТОВО
- [x] `libc/sys/syscalls.asm` (155 строк): обёртки для TTY, графики, ввода, времени, yield, spawn, exit, FS, IPC, памяти
- [x] Тесты: есть `test/unix-libc.test.js` (self-hosted libc через stage4)

### ⬜ Этап 6: libc — stdio — НЕТ
- [ ] `putchar`, `puts` — не реализованы в C (только в self-hosted asm libc)
- [ ] `print_int`, `print_float` — через PRINT_A в asm
- [ ] `getchar`, `gets` — не реализованы
- [ ] Заголовок `libc/include/stdio.h` — ЕСТЬ (частичный)

### ⬜ Этап 7: libc — stdlib — НЕТ
- [ ] Файл `libc/stdlib.c` — не создан
- [ ] `malloc`, `free`, `atoi`, `atof`, `itoa`, `rand`, `srand`, `exit`
- [ ] Заголовок — не создан

### ⬜ Этап 8: libc — string — НЕТ
- [ ] Файл `libc/string.c` — не создан
- [ ] `strlen`, `strcpy`, `strcmp`, `memset`, `memcpy` и т.д.
- [ ] Заголовок — не создан

### ⬜ Этап 9: libc — math — НЕТ
- [ ] Файл `libc/math.c` — не создан
- [ ] `sinf`, `cosf`, `sqrtf`, `fabsf`, `floorf`, `ceilf`, `roundf`
- [ ] Заголовок — не создан

### 🔶 Этап 10: libc — pcos — ЧАСТИЧНО
- [x] `libc/pcos.c`: gfx_pixel, gfx_rect, term_clear, term_color, input_key, input_key_blocking, process_yield
- [ ] gfx_line, gfx_circle — нет
- [ ] input_mouse_* — нет
- [ ] process_spawn, process_kill — нет
- [x] Заголовок `libc/include/pcos.h` — ЕСТЬ

### 🔶 Этап 11: Интеграция в игру — В ПРОЦЕССЕ
- [x] Компилятор интегрирован: `scripts/compile-c.mjs` вызывает AssemblyCompiler → .obj
- [x] `scanner.obj` и `hello.obj` скомпилированы из примеров C
- [x] `system/unix/Makefile` включает правила сборки C-программ (scanner)
- [ ] `scripts/build-libc.mjs` — не создан (сборка libc.a)
- [ ] Команда `cc` в шелле PCOS — нет (только внешний CLI)
- [ ] Копирование заголовков в `/usr/include/` внутри PCFD образа

### ⬜ Этап 12: Документация — НЕТ
- [ ] `C_COMPILER.md` — руководство пользователя
- [ ] `LIBC_REFERENCE.md` — описание всех функций libc

### 🔷 Реализовано сверх плана v1
- `typedef` и `sizeof` в парсере (запланированы на v2)
- `scanner.c` — реальная программа 274 строки, компилируется и собирается в игре
- `system/unix/Makefile` — интегрированная сборка C программ внутри игры

---

## Оценка трудозатрат

| Этап                       | Часы  | Статус     |
|----------------------------|-------|------------|
| Препроцессор + лексер      | 8–12  | ✅ Выполнено |
| Парсер                     | 16–24 | ✅ Выполнено |
| Генератор кода             | 20–30 | ✅ Выполнено |
| CLI драйвер                | 4–6   | ✅ Выполнено |
| libc (все модули)          | 16–20 | 🔶 4/10 модулей |
| Интеграция в игру          | 8–12  | 🔶 Частично |
| Тесты                      | 12–16 | 🔶 Только libc |
| Документация               | 4–6   | ⬜ Нет |
| **Выполнено**              | **~60–80** | |
| **Осталось**               | **~30–50** | |