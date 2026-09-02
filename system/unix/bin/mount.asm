.protected
.export main
.import libc_puts

; PCOS mount is backed by the removable-media kernel service.  The shell
; dispatcher validates the device and attaches its PCFS volume before this
; native command reports completion.
main:
LOAD_B mount_text
LOAD_C 46
CALL libc_puts
LOAD_A 0
RET
.org 8700
mount_text: .string "mount: use mount <device> <mountpoint>\n"
