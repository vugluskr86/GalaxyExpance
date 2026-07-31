; scanner.asm — reliable PCOS launcher for the game-owned ScannerScene
.protected
.export main
main:
  SYSCALL 0x55          ; SCANNER_OPEN
  HALT
