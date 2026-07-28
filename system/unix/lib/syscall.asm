; Thin Unix ABI wrappers. Arguments already occupy B/C/D unless documented.
.export libc_exit
.export libc_getpid
.export libc_getppid
.export libc_setuid
.export libc_setgid
.export libc_getuid
.export libc_getgid
.export libc_setsid
.export libc_spawn
.export libc_spawn_fds
.export libc_exec
.export libc_wait
.export libc_kill
.export libc_open
.export libc_read
.export libc_write
.export libc_close
.export libc_seek
.export libc_stat
.export libc_readdir
.export libc_mkdir
.export libc_unlink
.export libc_rename
.export libc_chmod
.export libc_chown
.export libc_getcwd
.export libc_chdir
.export libc_malloc
.export libc_free
.export libc_errno
.export libc_setenv
.export libc_getenv
.export libc_link

.org 7000
libc_errno: .dword 0

libc_capture_errno:
PUSH_A
MOV_A_D
JZ libc_capture_done
LOAD_B libc_errno
STORE32_A_B
libc_capture_done:
POP_A
RET

libc_exit:
SYSCALL 1
CALL libc_capture_errno
RET
libc_getpid:
SYSCALL 5
CALL libc_capture_errno
RET
libc_getppid:
SYSCALL 9
CALL libc_capture_errno
RET
libc_setuid:
SYSCALL 0x0b
CALL libc_capture_errno
RET
libc_setgid:
SYSCALL 0x0c
CALL libc_capture_errno
RET
libc_getuid:
SYSCALL 0x0d
CALL libc_capture_errno
RET
libc_getgid:
SYSCALL 0x0e
CALL libc_capture_errno
RET
libc_setsid:
SYSCALL 0x0f
CALL libc_capture_errno
RET
libc_spawn:
SYSCALL 3
CALL libc_capture_errno
RET
libc_spawn_fds:
SYSCALL 0x35
CALL libc_capture_errno
RET
libc_exec:
SYSCALL 8
CALL libc_capture_errno
RET
libc_wait:
SYSCALL 4
CALL libc_capture_errno
RET
libc_kill:
SYSCALL 6
CALL libc_capture_errno
RET
libc_open:
SYSCALL 0x20
CALL libc_capture_errno
RET
libc_read:
SYSCALL 0x21
CALL libc_capture_errno
RET
libc_write:
SYSCALL 0x22
CALL libc_capture_errno
RET
libc_close:
SYSCALL 0x23
CALL libc_capture_errno
RET
libc_seek:
SYSCALL 0x26
CALL libc_capture_errno
RET
libc_stat:
SYSCALL 0x27
CALL libc_capture_errno
RET
libc_readdir:
SYSCALL 0x28
CALL libc_capture_errno
RET
libc_mkdir:
SYSCALL 0x29
CALL libc_capture_errno
RET
libc_unlink:
SYSCALL 0x2a
CALL libc_capture_errno
RET
libc_rename:
SYSCALL 0x2b
CALL libc_capture_errno
RET
libc_chmod:
SYSCALL 0x2c
CALL libc_capture_errno
RET
libc_chown:
SYSCALL 0x2d
CALL libc_capture_errno
RET
libc_getcwd:
SYSCALL 0x2e
CALL libc_capture_errno
RET
libc_chdir:
SYSCALL 0x2f
CALL libc_capture_errno
RET
libc_malloc:
SYSCALL 0x10
CALL libc_capture_errno
RET
libc_free:
SYSCALL 0x11
CALL libc_capture_errno
RET
; B=key, C=value, D=(value_len<<16)|key_len.
libc_setenv:
SYSCALL 0x32
CALL libc_capture_errno
RET
; B=key, C=output, D=(capacity<<16)|key_len.
libc_getenv:
SYSCALL 0x33
CALL libc_capture_errno
RET
; B=old path, C=old length, D=(new_len<<16)|new_offset_from_B.
libc_link:
SYSCALL 0x34
CALL libc_capture_errno
RET
