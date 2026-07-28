# Примеры линковки

## Статическая линковка

Исходники:

- `static-link-main.asm` — основная программа;
- `static-link-library.asm` — библиотека с функцией `triple`.

Команды в shell Pixel OS:

```text
asm static-link-main.asm static-main.obj
asm static-link-library.asm static-library.obj
link static-demo.bin static-main.obj static-library.obj --static
run static-demo.bin
```

Линкер объединяет TEXT обоих объектов в единый protected `PCVM v3`. Программа вызывает
функцию библиотеки и выводит `42`.

## Динамическая линковка

Исходники:

- `dynamic-link-main.asm` — основная программа;
- `dynamic-link-library.asm` — библиотека, экспортирующая DATA-символ
  `shared_value`.

Команды:

```text
asm dynamic-link-main.asm dynamic-main.obj
asm dynamic-link-library.asm dynamic-library.obj
link dynamic-demo.dyn dynamic-main.obj dynamic-library.obj --dynamic
run dynamic-demo.dyn
```

Результат имеет формат `PCDL v2` и сохраняет модули внутри bundle. При
загрузке разрешается `ABS_DATA` relocation, после чего программа выводит
значение `73`.

Self-hosted `system/linker.asm` использует фиксированные выходные имена
`a.bin` для `--static` и `a.dyn` для `--dynamic`.

Все исходники примеров содержат `.protected`. Доступ к терминалу, графике,
вводу, файлам и процессам выполняется через `SYSCALL`; прямые аппаратные
инструкции предназначены только для BIOS и kernel mode.
