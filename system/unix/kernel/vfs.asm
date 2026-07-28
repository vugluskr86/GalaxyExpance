; VFS dispatch hook. The inode disk mechanism is provided by the DRIVE device.
.export vfs_init

vfs_init:
PRINT "PCOS kernel: VFS hook ready"
RET
