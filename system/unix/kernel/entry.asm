; PCOS Unix kernel entry. BIOS loads this PCVM binary in real mode.
.protected
.export main
.import devices_init
.import memory_init
.import process_init
.import scheduler_init
.import vfs_init
.import permissions_init
.import syscall_init

main:
PM_ENABLE
CLI
CALL memory_init
CALL devices_init
CALL process_init
CALL scheduler_init
CALL vfs_init
CALL permissions_init
CALL syscall_init
PRINT "PCOS kernel: protected mode"
PRINT "PCOS kernel: starting PID 1 /sbin/init.bin"
STI
BOOT "/sbin/init.bin"
HALT
