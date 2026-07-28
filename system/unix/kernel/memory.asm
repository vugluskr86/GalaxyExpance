; Physical layout owned by the Assembly kernel.
.export memory_init

memory_init:
; IVT 0x0000..0x00ff, kernel stack below 0x2000, user RAM at 0x2000.
LOAD_A 57344
SET_ULIMIT
LOAD_A 8192
SET_UBASE
LOAD_A 8192
SET_KSP
LOAD_A 0
SET_IVT
RET
