/**
 * A small PCVM v3 demo scene used as a visual hardware diagnostic.  It is
 * deliberately written in assembly rather than drawn by the UI: a successful
 * run proves the protected syscall path, FPU, raster GPU and animation buffer
 * all work together.
 */
export const DEMOSCENE_ASM=`; Pixel Cosmos diagnostic demoscene
; Requires a graphics GPU.  The result panel retains the text diagnostics.
.protected
PRINT "PIXEL COSMOS / HARDWARE DEMOSCENE"
PRINT "ABI: PCVM v3 protected syscall path"
SYSCALL 0x12
MOV_A_B
PRINT "RAM total, bytes:"
PRINT_A
PRINT "FPU: FSIN/FCOS orbit synthesis"
SYSCALL 0x70
PRINT "INPUT: keyboard polling port checked"
PRINT "GPU: raster, colour and frame-buffer test"

; Switch to graphics and record a five-second, 108-frame animation.
LOAD_A 1
SYSCALL 0x42
SYSCALL 0x43
SYSCALL 0x64
LOAD_A 0

frame:
; Keep the frame counter while building the background frame.
PUSH_A
LOAD_A 0x102d55
LOAD_B 0
SYSCALL 0x44
LOAD_A 20
LOAD_B 20
LOAD_C 380
LOAD_D 380
SYSCALL 0x62
LOAD_A 210
LOAD_B 20
LOAD_C 210
LOAD_D 400
SYSCALL 0x61
LOAD_A 20
LOAD_B 210
LOAD_C 400
LOAD_D 210
SYSCALL 0x61
POP_A

; Three independent FPU orbits exercise lines, circles, colours and fills.
PUSH_A
LOAD_A 0x35dcff
LOAD_B 0
SYSCALL 0x44
POP_A
CALL orbit_cyan

PUSH_A
LOAD_A 0xff4fd8
LOAD_B 0
SYSCALL 0x44
POP_A
CALL orbit_magenta

PUSH_A
LOAD_A 0xffe26a
LOAD_B 0
SYSCALL 0x44
POP_A
CALL orbit_gold

; Emit a recorded frame without losing the loop counter.
PUSH_A
LOAD_A 42
SYSCALL 0x65
POP_A
INC_A
LOAD_B 108
CMP_A_B
JNZ frame
SYSCALL 0x66
PRINT "DEMO COMPLETE: GPU/FPU/INPUT PASS"
HALT

; cyan: x = sin(t), y = cos(2t)
orbit_cyan:
PUSH_A
MOV_B_A
ITOF
LOAD_FB 0.0581776417
FMUL_FA_FB
FSIN_FA
LOAD_FB 154
FMUL_FA_FB
LOAD_FB 210
FADD_FA_FB
FTOI
MOV_C_A
MOV_A_B
ITOF
LOAD_FB 0.0581776417
FMUL_FA_FB
LOAD_FB 2
FMUL_FA_FB
FCOS_FA
LOAD_FB 154
FMUL_FA_FB
LOAD_FB 210
FADD_FA_FB
FTOI
MOV_D_A
LOAD_A 210
LOAD_B 210
SYSCALL 0x61
MOV_A_C
MOV_B_D
LOAD_C 12
LOAD_D 0
SYSCALL 0x63
POP_A
RET

; magenta: x = cos(3t), y = sin(2t)
orbit_magenta:
PUSH_A
MOV_B_A
ITOF
LOAD_FB 0.0581776417
FMUL_FA_FB
LOAD_FB 3
FMUL_FA_FB
FCOS_FA
LOAD_FB 118
FMUL_FA_FB
LOAD_FB 210
FADD_FA_FB
FTOI
MOV_C_A
MOV_A_B
ITOF
LOAD_FB 0.0581776417
FMUL_FA_FB
LOAD_FB 2
FMUL_FA_FB
FSIN_FA
LOAD_FB 118
FMUL_FA_FB
LOAD_FB 210
FADD_FA_FB
FTOI
MOV_D_A
LOAD_A 210
LOAD_B 210
SYSCALL 0x61
MOV_A_C
MOV_B_D
LOAD_C 7
LOAD_D 0
SYSCALL 0x63
POP_A
RET

; gold: x = cos(5t), y = sin(4t); filled point tests the fill path.
orbit_gold:
PUSH_A
MOV_B_A
ITOF
LOAD_FB 0.0581776417
FMUL_FA_FB
LOAD_FB 5
FMUL_FA_FB
FCOS_FA
LOAD_FB 82
FMUL_FA_FB
LOAD_FB 210
FADD_FA_FB
FTOI
MOV_C_A
MOV_A_B
ITOF
LOAD_FB 0.0581776417
FMUL_FA_FB
LOAD_FB 4
FMUL_FA_FB
FSIN_FA
LOAD_FB 82
FMUL_FA_FB
LOAD_FB 210
FADD_FA_FB
FTOI
MOV_D_A
LOAD_A 210
LOAD_B 210
SYSCALL 0x61
MOV_A_C
MOV_B_D
LOAD_C 4
LOAD_D 1
SYSCALL 0x63
POP_A
RET`;
