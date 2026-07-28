.protected
.export main
.import libc_puts

.org 8000
hello_text: .string "hello from self-hosted libc"

main:
LOAD_B hello_text
LOAD_C 27
CALL libc_puts
LOAD_A 0
RET
