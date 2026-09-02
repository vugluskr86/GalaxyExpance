.protected
.export main
.import libc_puts
main:
LOAD_B lsblk_text
LOAD_C 53
CALL libc_puts
LOAD_A 0
RET
.org 8700
lsblk_text: .string "lsblk: PCOS lists inserted media through the shell\n"
