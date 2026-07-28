; Динамическая линковка: значение находится в DATA другого модуля.
.protected
.import shared_value

main:
LOAD_A 0
SYSCALL 0x42
PRINT "Dynamic link: shared value ="
LOAD_B shared_value
LOAD8_A_B
PRINT_A
HALT
