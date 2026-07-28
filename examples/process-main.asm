; Программа, использующая внешнюю библиотеку.
.protected
.import double

main:
LOAD_A 0
SYSCALL 0x42
PRINT "Вызов функции из lib-math:"
LOAD_A 21
CALL double
PRINT_A
HALT
