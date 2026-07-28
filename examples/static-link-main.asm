; Статическая линковка: функция triple находится в отдельной библиотеке.
.protected
.import triple

main:
LOAD_A 0
SYSCALL 0x42
PRINT "Static link: 14 * 3 ="
LOAD_A 14
CALL triple
PRINT_A
HALT
