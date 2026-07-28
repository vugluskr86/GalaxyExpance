.protected
.export main
.import libc_puts

main:
LOAD_B logger_ready
LOAD_C 22
CALL libc_puts
LOAD_A 0
RET

.org 9300
logger_ready: .string "logger: service ready\n"
