; Device bootstrap contains mechanism only; Unix policy stays in kernel modules.
.export devices_init

devices_init:
TERM_MODE text
TERM_COLOR 0x8fd3ff, 0x000000
PRINT "PCOS kernel: devices ready"
RET
