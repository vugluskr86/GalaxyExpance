.protected
.export main
.import libc_puts
main:
LOAD_B umount_text
LOAD_C 38
CALL libc_puts
LOAD_A 0
RET
.org 8700
umount_text: .string "umount: use umount <mountpoint>\n"
