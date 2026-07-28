; Минимальный процесс-получатель.
; Очередью сообщений управляет shell: send <pid> и recv <pid>.
.protected
LOAD_A 0
SYSCALL 0x42
PRINT "Процесс-получатель запущен."
HALT
