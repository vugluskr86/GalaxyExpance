/** Нормативная спецификация protected mode для PCVM v3.
 *  Единственный нормативный источник числовых констант syscall, errno и
 *  бинарных раскладок структур. Assembly-файлы system/unix/include/*.inc
 *  генерируются из этого модуля и не должны редактироваться вручную. */
export const PROTECTED_ISA_VERSION=3;
export const PROTECTED_FEATURE=0x0001;
export const PCVM_V3_HEADER=Object.freeze({
  magic:0,
  version:4,
  featureFlags:5,
  instructionCount:7,
  bytes:9,
  byteOrder:"little-endian",
});

export const PROTECTED_OPCODES=Object.freeze({
  PM_ENABLE:Object.freeze({opcode:0x87,argc:0,privileged:true}),
  PM_DISABLE:Object.freeze({opcode:0x88,argc:0,privileged:true}),
  SET_UBASE:Object.freeze({opcode:0x89,argc:0,privileged:true}),
  SET_ULIMIT:Object.freeze({opcode:0x8a,argc:0,privileged:true}),
  SET_KSP:Object.freeze({opcode:0x8b,argc:0,privileged:true}),
  SET_IVT:Object.freeze({opcode:0x8c,argc:0,privileged:true}),
  ENTER_USER:Object.freeze({opcode:0x8d,argc:0,privileged:true}),
  SYSCALL:Object.freeze({opcode:0x8e,argc:1,privileged:false}),
  IRET:Object.freeze({opcode:0x8f,argc:0,privileged:true}),
  CLI:Object.freeze({opcode:0x90,argc:0,privileged:true}),
  STI:Object.freeze({opcode:0x91,argc:0,privileged:true}),
  KGET_FAULT:Object.freeze({opcode:0x92,argc:0,privileged:true}),
  KGET_ARG:Object.freeze({opcode:0x93,argc:1,privileged:true}),
  KCALL_HOST:Object.freeze({opcode:0x94,argc:0,privileged:true}),
  SYSRET:Object.freeze({opcode:0x95,argc:0,privileged:true}),
});

export const PROTECTED_EXCEPTIONS=Object.freeze({
  MEMORY_FAULT:1,
  EXECUTE_FAULT:2,
  WRITE_PROTECTION_FAULT:3,
  PRIVILEGE_FAULT:4,
  INVALID_OPCODE:5,
  DIVIDE_BY_ZERO:6,
  STACK_FAULT:7,
  INVALID_IRET:8,
  DOUBLE_FAULT:9,
  SYSCALL:32,
  TIMER:33,
});

export const IVT_LAYOUT=Object.freeze({
  entries:64,
  entryBytes:4,
  bytes:256,
  format:"u32 instruction index, little-endian",
});

export const PROCESS_MEMORY_LAYOUT=Object.freeze({
  IVT_BASE:0,
  KERNEL_STACK_BASE:IVT_LAYOUT.bytes,
  KERNEL_STACK_TOP:4096,
  USER_BASE:4096,
  MINIMUM_RAM:8192,
  GUARD_BYTES:256,
  MAX_STACK_BYTES:4096,
});

export const MEMORY_PERMISSIONS=Object.freeze({
  READ:1,
  WRITE:2,
  EXECUTE:4,
});

export const CONTEXT_FLAGS=Object.freeze({
  Z:1<<0,
  USER:1<<1,
  INTERRUPTS_ENABLED:1<<2,
});

/** Фиксированная часть context frame; после неё идут returnDepth × u32. */
export const CONTEXT_LAYOUT=Object.freeze({
  PC:0,SP:4,A:8,B:12,C:16,D:20,FLAGS:24,UBASE:28,ULIMIT:32,
  FA:40,FB:48,FC:56,FD:64,
  V0:72,V1:88,V2:104,V3:120,V4:136,V5:152,V6:168,V7:184,
  CAUSE:200,FAULT_ADDR:204,RETURN_DEPTH:208,RESERVED:212,
  fixedBytes:224,alignment:16,returnEntryBytes:4,
});

/** Полная нормативная таблица системных вызовов PCVM v3.
 *  Диапазоны:
 *    0x01–0x0F  процессы
 *    0x10–0x1F  память и дескрипторы
 *    0x20–0x2F  файловая система
 *    0x30–0x3F  IPC
 *    0x40–0x4F  терминал
 *    0x50–0x5F  время и система
 *    0x60–0x6F  графика
 *    0x70–0x7F  ввод
 *    0x80–0x8F  отладка
 *  Существующие номера нельзя перенумеровывать. */
export const SYSCALLS=Object.freeze({
  /* --- процессы (0x01–0x0F) --- */
  EXIT:0x01,
  YIELD:0x02,
  SPAWN:0x03,
  WAIT:0x04,
  GETPID:0x05,
  KILL:0x06,
  PROCESS_LIST:0x07,
  EXEC:0x08,
  GETPPID:0x09,
  PROCESS_INFO:0x0A,
  SETUID:0x0B,
  SETGID:0x0C,
  GETUID:0x0D,
  GETGID:0x0E,
  SETSID:0x0F,

  /* --- память и дескрипторы (0x10–0x1F) --- */
  ALLOC:0x10,
  FREE:0x11,
  MEM_INFO:0x12,
  DUP:0x13,
  DUP2:0x14,
  /* 0x15–0x1F reserved: brk, sbrk, mmap, munmap, pipe */

  /* --- файловая система (0x20–0x2F) --- */
  OPEN:0x20,
  READ:0x21,
  WRITE:0x22,
  CLOSE:0x23,
  LIST:0x24,
  DELETE:0x25,
  SEEK:0x26,
  STAT:0x27,
  READDIR:0x28,
  MKDIR:0x29,
  UNLINK:0x2A,
  RENAME:0x2B,
  CHMOD:0x2C,
  CHOWN:0x2D,
  GETCWD:0x2E,
  CHDIR:0x2F,

  /* --- IPC (0x30–0x3F) --- */
  IPC_SEND:0x30,
  IPC_RECV:0x31,
  ENV_SET:0x32,
  ENV_GET:0x33,
  LINK:0x34,
  SPAWN_FD:0x35,
  ENV_LIST:0x36,
  /* 0x35–0x3F reserved: pipe, fifo, socket */

  /* --- терминал (0x40–0x4F) --- */
  TTY_READ:0x40,
  TTY_WRITE:0x41,
  TTY_MODE:0x42,
  TTY_CLEAR:0x43,
  TTY_COLOR:0x44,
  /* 0x45–0x4F reserved: tty_ioctl, tty_info */

  /* --- время и система (0x50–0x5F) --- */
  TIME:0x50,
  SLEEP:0x51,
  UNAME:0x52,
  SYSINFO:0x53,
  /** B=output buffer, C=capacity.  Returns the number of UTF-8 bytes.
   * The report is a snapshot of the current computer's fitted parts, internal
   * slots and exposed ports; it deliberately contains no other process data. */
  HARDWARE_INFO:0x54,
  /** Open the system-scanner UI associated with the current on-board PC.
   * It succeeds only while that PC is installed in an active system scene. */
  SCANNER_OPEN:0x55,
  /** B=device_buf_ptr, C=device_buf_bytes — список сетевых устройств с MAC, типом, портами */
  NET_INFO:0x56,
  /** B=mac_ptr — проверка статуса линка для устройства */
  NET_LINK_STATUS:0x57,
  /** B=src_mac_ptr, C=dst_mac_ptr, D=frame_ptr — отправка Ethernet-фрейма; длина в поле данных фрейма */
  NET_SEND:0x58,
  /** B=mac_ptr, C=buf_ptr, D=buf_bytes — чтение входящего Ethernet-фрейма */
  NET_RECV:0x59,
  /** B=mac_ptr, C=cmd, D=data_ptr — device I/O (scanner/antenna/switch) */
  NET_DEVICE_IO:0x5A,
  /* 0x5B–0x5F reserved */

  /* --- графика (0x60–0x6F) --- */
  GFX_PIXEL:0x60,
  GFX_LINE:0x61,
  GFX_RECT:0x62,
  GFX_CIRCLE:0x63,
  GFX_BEGIN:0x64,
  GFX_FRAME:0x65,
  GFX_END:0x66,
  /** Draw UTF-8 text in graphics mode. A=x, B=y, C=ptr, D=len. */
  GFX_TEXT:0x67,
  /* 0x68–0x6F reserved */

  /* --- ввод (0x70–0x7F) --- */
  INPUT_KEY:0x70,
  INPUT_MOUSE_X:0x71,
  INPUT_MOUSE_Y:0x72,
  INPUT_MOUSE_BUTTONS:0x73,
  INPUT_MOUSE_WHEEL:0x74,
  /* 0x75–0x7F reserved */

  /* --- отладка (0x80–0x8F) --- */
  DEBUG_READ_REGS:0x80,
  DEBUG_READ_MEM:0x81,
  DEBUG_SET_BREAK:0x82,
  DEBUG_CLEAR_BREAK:0x83,
  DEBUG_CONTINUE:0x84,
  DEBUG_STEP:0x85,
  /* 0x86–0x8F reserved */

  /* 0x90–0xFF свободны для будущего использования */
});

/** Числовые ограничения ABI (разделяемые JS и Assembly). */
export const ABI_LIMITS=Object.freeze({
  NAME_MAX:255,
  PATH_MAX:1024,
  FD_MAX:32,
  ARG_MAX:2048,
  ENV_MAX:256,
  ENV_VALUE_MAX:2048,
  MAX_PROCESSES:256,
});

/** Полная нормативная таблица кодов ошибок (errno).
 *  Возвращаются из syscall как отрицательные значения в регистре D.
 *  Номера соответствуют стандартным Linux errno. */
export const ERRNO=Object.freeze({
  OK:0,
  EPERM:1,
  ENOENT:2,
  ESRCH:3,
  EINTR:4,
  EIO:5,
  ENXIO:6,
  E2BIG:7,
  ENOEXEC:8,
  EBADF:9,
  ECHILD:10,
  EAGAIN:11,
  ENOMEM:12,
  EACCES:13,
  EFAULT:14,
  EBUSY:16,
  EEXIST:17,
  EXDEV:18,
  ENOTDIR:20,
  EISDIR:21,
  EINVAL:22,
  ENFILE:23,
  EMFILE:24,
  ENOSPC:28,
  ESPIPE:29,
  EROFS:30,
  EPIPE:32,
  ENAMETOOLONG:36,
  ENOSYS:38,
  ENOTEMPTY:39,
});

/** Устаревшие short-name алиасы для обратной совместимости.
 *  @deprecated используйте ERRNO напрямую. */
export const SYSCALL_ERRORS=Object.freeze({
  OK:0,
  NOT_FOUND:-ERRNO.ENOENT,
  IO:-ERRNO.EIO,
  BAD_FILE:-ERRNO.EBADF,
  BAD_ADDRESS:-ERRNO.EFAULT,
  PERMISSION:-ERRNO.EPERM,
  BUSY:-ERRNO.EBUSY,
  INVALID:-ERRNO.EINVAL,
  NOT_SUPPORTED:-ERRNO.ENOSYS,
});

/* ================================================================
 *  Бинарные раскладки структур (little-endian, все offsets в байтах)
 * ================================================================ */

/** struct timespec — 8 байт, выравнивание 4 */
export const TIMESPEC_LAYOUT=Object.freeze({
  bytes:8,
  alignment:4,
  SEC:0,    // i32, seconds
  NSEC:4,   // i32, nanoseconds 0..999999999
});

/** struct stat — 56 байт, выравнивание 4
 *  Порядок полей зафиксирован, нельзя переставлять. */
export const STAT_LAYOUT=Object.freeze({
  bytes:56,
  alignment:4,
  INO:0,        // u32, inode number
  TYPE:4,       // u32, 0=regular, 1=directory, 2=device
  UID:8,        // u32, owner user id
  GID:12,       // u32, owner group id
  MODE:16,      // u32, Unix permission bits (0400/0200/0100 ...)
  SIZE:20,      // u32, file size in bytes
  NLINK:24,     // u32, hard link count
  MTIME_SEC:28, // i32, modification time seconds
  MTIME_NSEC:32,// i32, modification time nanoseconds
  CTIME_SEC:36, // i32, creation time seconds
  CTIME_NSEC:40,// i32, creation time nanoseconds
  DEVICE:44,    // u32, device id for device inodes
  RESERVED0:48, // u32, padding
  RESERVED1:52, // u32, padding
});

/** struct dirent — 268 байт, выравнивание 4
 *  Фиксированного размера для простоты чтения. */
export const DIRENT_LAYOUT=Object.freeze({
  bytes:268,
  alignment:4,
  INO:0,           // u32, inode number
  TYPE:4,          // u32, 0=regular, 1=directory, 2=device
  NAME_LEN:8,      // u32, actual name byte count (<= NAME_MAX)
  NAME:12,         // u8[256], UTF-8 name, null-padded
});

/** struct process_info — 128 байт, выравнивание 4
 *  Безопасная read-only копия для user mode. */
export const PROCESS_INFO_LAYOUT=Object.freeze({
  bytes:128,
  alignment:4,
  PID:0,             // u32
  PPID:4,            // u32, parent PID
  UID:8,             // u32
  GID:12,            // u32
  STATE:16,          // u32, 0=ready, 1=running, 2=sleeping, 3=stopped, 4=zombie, 5=faulted
  EXIT_STATUS:20,    // i32, exit code (только для exited/zombie)
  TICKS:24,          // u32, total CPU ticks
  PREEMPTIONS:28,    // u32, preemption count
  MEMORY_BYTES:32,   // u32, allocated RAM
  START_TIME_SEC:36, // i32, process start time seconds
  START_TIME_NSEC:40,// i32
  COMMAND:44,        // u8[64], process name, null-padded
  RESERVED0:108,     // u32, padding to 128
  RESERVED1:112,
  RESERVED2:116,
  RESERVED3:120,
  RESERVED4:124,
});

/** struct debug_regs — 224 байта (фиксированная часть context frame без стека возврата) */
export const DEBUG_REGS_LAYOUT=Object.freeze({
  bytes:224,
  alignment:4,
  PC:CONTEXT_LAYOUT.PC,
  SP:CONTEXT_LAYOUT.SP,
  A:CONTEXT_LAYOUT.A,
  B:CONTEXT_LAYOUT.B,
  C:CONTEXT_LAYOUT.C,
  D:CONTEXT_LAYOUT.D,
  FLAGS:CONTEXT_LAYOUT.FLAGS,
  UBASE:CONTEXT_LAYOUT.UBASE,
  ULIMIT:CONTEXT_LAYOUT.ULIMIT,
  FA:CONTEXT_LAYOUT.FA,
  FB:CONTEXT_LAYOUT.FB,
  FC:CONTEXT_LAYOUT.FC,
  FD:CONTEXT_LAYOUT.FD,
  V0:CONTEXT_LAYOUT.V0,
  V1:CONTEXT_LAYOUT.V1,
  V2:CONTEXT_LAYOUT.V2,
  V3:CONTEXT_LAYOUT.V3,
  V4:CONTEXT_LAYOUT.V4,
  V5:CONTEXT_LAYOUT.V5,
  V6:CONTEXT_LAYOUT.V6,
  V7:CONTEXT_LAYOUT.V7,
  CAUSE:CONTEXT_LAYOUT.CAUSE,
  FAULT_ADDR:CONTEXT_LAYOUT.FAULT_ADDR,
});

/** struct sysinfo — 40 байт, выравнивание 4 */
export const SYSINFO_LAYOUT=Object.freeze({
  bytes:40,
  alignment:4,
  UPTIME_SEC:0,      // u32, uptime in seconds
  UPTIME_NSEC:4,     // u32
  TOTAL_RAM:8,       // u32, total physical RAM bytes
  FREE_RAM:12,       // u32, free physical RAM bytes
  TOTAL_DRIVE:16,    // u32, total drive bytes
  FREE_DRIVE:20,     // u32, free drive bytes
  PROCESSES:24,      // u32, number of processes
  CPU_THREADS:28,    // u32, hardware threads
  RESERVED0:32,      // u32
  RESERVED1:36,      // u32
});

/** struct utsname — 384 байта, выравнивание 4 */
export const UTSNAME_LAYOUT=Object.freeze({
  bytes:384,
  alignment:4,
  SYSNAME:0,     // u8[64], "PCOS"
  NODENAME:64,   // u8[64], hostname
  RELEASE:128,   // u8[64], kernel version
  VERSION:192,   // u8[64], build info
  MACHINE:256,   // u8[64], "pcvm"
  RESERVED:320,  // u8[64]
});

/** Syscall argument block layouts per call group.
 *  A содержит номер syscall, B–D — аргументы.
 *  Если аргумент является указателем, он проходит проверку userRange перед
 *  доступом ядра. Размер буфера всегда передаётся отдельным регистром;
 *  ядро не читает размер из user memory. */

/** SYSCALL_EXEC: A=0x08, B=path_ptr, C=path_len, D=argv_ptr (0 если нет) */
/** SYSCALL_WAIT: A=0x04, B=pid (-1 для любого), C=status_ptr (0 если не нужен) */
/** SYSCALL_PROCESS_INFO: A=0x0A, B=pid, C=buf_ptr, D=buf_bytes */
/** SYSCALL_OPEN: A=0x20, B=path_ptr, C=path_len, D=flags (0=O_RDONLY, 1=O_WRONLY, 2=O_RDWR) */
/** SYSCALL_READ: A=0x21, B=fd, C=buf_ptr, D=count */
/** SYSCALL_WRITE: A=0x22, B=fd, C=data_ptr, D=count */
/** SYSCALL_CLOSE: A=0x23, B=fd */
/** SYSCALL_SEEK: A=0x26, B=fd, C=offset (i32), D=whence (0=SET,1=CUR,2=END) */
/** SYSCALL_STAT: A=0x27, B=path_ptr, C=path_len, D=stat_buf_ptr */
/** SYSCALL_READDIR: A=0x28, B=fd, C=dirent_buf_ptr, D=buf_bytes */
/** SYSCALL_MKDIR: A=0x29, B=path_ptr, C=path_len, D=mode */
/** SYSCALL_UNLINK: A=0x2A, B=path_ptr, C=path_len */
/** SYSCALL_RENAME: A=0x2B, B=old_ptr, C=old_len, D=new_ptr (new_len via stack/ext) */
/**  Для RENAME длина нового пути передаётся в C как u32 смещение в buf: */
/**  A=0x2B, B=old_ptr, C=old_len, D=(new_len<<16)|new_offset_in_buf */
/** SYSCALL_CHMOD: A=0x2C, B=path_ptr, C=path_len, D=mode */
/** SYSCALL_CHOWN: A=0x2D, B=path_ptr, C=path_len, D=(gid<<16)|uid */
/** SYSCALL_GETCWD: A=0x2E, B=buf_ptr, C=buf_bytes */
/** SYSCALL_CHDIR: A=0x2F, B=path_ptr, C=path_len */
/** SYSCALL_DUP: A=0x13, B=old_fd */
/** SYSCALL_DUP2: A=0x14, B=old_fd, C=new_fd */
/** SYSCALL_UNAME: A=0x52, B=utsname_buf_ptr */
/** SYSCALL_SYSINFO: A=0x53, B=sysinfo_buf_ptr */
/** SYSCALL_HARDWARE_INFO: A=0x54, B=buf_ptr, C=buf_bytes */
/** SYSCALL_SCANNER_OPEN: A=0x55 */
/** SYSCALL_DEBUG_READ_REGS: A=0x80, B=pid, C=debug_regs_buf_ptr */
/** SYSCALL_DEBUG_READ_MEM: A=0x81, B=pid, C=vaddr, D=buf_and_len */

export const SYSCALL_ARG_SPECS=Object.freeze({
  // process
  [SYSCALLS.EXIT]:       {A:"code"},
  [SYSCALLS.YIELD]:      {},
  [SYSCALLS.SPAWN]:      {B:"path_ptr", C:"path_len"},
  [SYSCALLS.SPAWN_FD]:   {B:"path_ptr", C:"path_len", D:"fd_spec"},
  [SYSCALLS.WAIT]:       {B:"pid", C:"status_ptr"},
  [SYSCALLS.GETPID]:     {},
  [SYSCALLS.KILL]:       {B:"pid"},
  [SYSCALLS.PROCESS_LIST]:{B:"buf_ptr", C:"buf_bytes"},
  [SYSCALLS.EXEC]:       {B:"path_ptr", C:"path_len", D:"argv_ptr"},
  [SYSCALLS.GETPPID]:    {},
  [SYSCALLS.PROCESS_INFO]:{B:"pid", C:"buf_ptr", D:"buf_bytes"},
  [SYSCALLS.SETUID]:     {B:"uid"},
  [SYSCALLS.SETGID]:     {B:"gid"},
  [SYSCALLS.GETUID]:     {},
  [SYSCALLS.GETGID]:     {},
  [SYSCALLS.SETSID]:     {},
  // memory
  [SYSCALLS.ALLOC]:      {B:"bytes"},
  [SYSCALLS.FREE]:       {B:"address"},
  [SYSCALLS.MEM_INFO]:   {},
  [SYSCALLS.DUP]:        {B:"old_fd"},
  [SYSCALLS.DUP2]:       {B:"old_fd", C:"new_fd"},
  // files (0x20–0x25 legacy name-based ABI сохраняется)
  [SYSCALLS.OPEN]:       {B:"path_ptr", C:"path_len", D:"flags"},
  [SYSCALLS.READ]:       {B:"fd", C:"buf_ptr", D:"count"},
  [SYSCALLS.WRITE]:      {B:"fd", C:"data_ptr", D:"count"},
  [SYSCALLS.CLOSE]:      {B:"fd"},
  [SYSCALLS.LIST]:       {B:"buf_ptr", C:"buf_bytes"},
  [SYSCALLS.DELETE]:     {B:"path_ptr", C:"path_len"},
  [SYSCALLS.SEEK]:       {B:"fd", C:"offset_i32", D:"whence"},
  [SYSCALLS.STAT]:       {B:"path_ptr", C:"path_len", D:"stat_buf_ptr"},
  [SYSCALLS.READDIR]:    {B:"fd", C:"dirent_buf_ptr", D:"buf_bytes"},
  [SYSCALLS.MKDIR]:      {B:"path_ptr", C:"path_len", D:"mode"},
  [SYSCALLS.UNLINK]:     {B:"path_ptr", C:"path_len"},
  [SYSCALLS.RENAME]:     {B:"old_ptr", C:"old_len", D:"new_spec"},
  [SYSCALLS.CHMOD]:      {B:"path_ptr", C:"path_len", D:"mode"},
  [SYSCALLS.CHOWN]:      {B:"path_ptr", C:"path_len", D:"owner_spec"},
  [SYSCALLS.GETCWD]:     {B:"buf_ptr", C:"buf_bytes"},
  [SYSCALLS.CHDIR]:      {B:"path_ptr", C:"path_len"},
  // IPC
  [SYSCALLS.IPC_SEND]:   {B:"pid", C:"data"},
  [SYSCALLS.IPC_RECV]:   {},
  [SYSCALLS.ENV_SET]:    {B:"key_ptr", C:"value_ptr", D:"packed_lengths"},
  [SYSCALLS.ENV_GET]:    {B:"key_ptr", C:"buffer_ptr", D:"packed_lengths"},
  [SYSCALLS.LINK]:       {B:"old_ptr", C:"old_len", D:"new_spec"},
  [SYSCALLS.ENV_LIST]:   {B:"buf_ptr", C:"buf_bytes"},
  // terminal
  [SYSCALLS.TTY_READ]:   {B:"buf_ptr", C:"buf_bytes"},
  [SYSCALLS.TTY_WRITE]:  {B:"data_ptr", C:"data_len"},
  [SYSCALLS.TTY_MODE]:   {B:"mode"},
  [SYSCALLS.TTY_CLEAR]:  {},
  [SYSCALLS.TTY_COLOR]:  {B:"fg", C:"bg"},
  // time/system
  [SYSCALLS.TIME]:       {B:"buf_ptr", C:"buf_bytes"},
  [SYSCALLS.SLEEP]:      {B:"ms"},
  [SYSCALLS.UNAME]:      {B:"utsname_buf_ptr"},
  [SYSCALLS.SYSINFO]:    {B:"sysinfo_buf_ptr"},
  [SYSCALLS.HARDWARE_INFO]:{B:"buf_ptr", C:"buf_bytes"},
  [SYSCALLS.SCANNER_OPEN]:{},
  // network
  [SYSCALLS.NET_INFO]:       {B:"buf_ptr", C:"buf_bytes"},
  [SYSCALLS.NET_LINK_STATUS]:{B:"mac_ptr"},
  [SYSCALLS.NET_SEND]:       {B:"src_mac_ptr", C:"dst_mac_ptr", D:"frame_ptr"},
  [SYSCALLS.NET_RECV]:       {B:"mac_ptr", C:"buf_ptr", D:"buf_bytes"},
  [SYSCALLS.NET_DEVICE_IO]:  {B:"mac_ptr", C:"cmd", D:"data_ptr"},
  // graphics
  [SYSCALLS.GFX_PIXEL]:  {B:"x", C:"y"},
  [SYSCALLS.GFX_LINE]:   {B:"x1", C:"y1", D:"x2(ext)"},
  [SYSCALLS.GFX_RECT]:   {B:"x", C:"y", D:"spec"},
  [SYSCALLS.GFX_CIRCLE]: {B:"x", C:"y", D:"spec"},
  [SYSCALLS.GFX_BEGIN]:  {},
  [SYSCALLS.GFX_TEXT]:   {A:"x", B:"y", C:"text_ptr", D:"text_len"},
  [SYSCALLS.GFX_FRAME]:  {B:"delay_ms"},
  [SYSCALLS.GFX_END]:    {},
  // input
  [SYSCALLS.INPUT_KEY]:         {},
  [SYSCALLS.INPUT_MOUSE_X]:     {},
  [SYSCALLS.INPUT_MOUSE_Y]:     {},
  [SYSCALLS.INPUT_MOUSE_BUTTONS]:{},
  [SYSCALLS.INPUT_MOUSE_WHEEL]: {},
  // debug
  [SYSCALLS.DEBUG_READ_REGS]:   {B:"pid", C:"debug_regs_buf_ptr"},
  [SYSCALLS.DEBUG_READ_MEM]:    {B:"pid", C:"vaddr", D:"buf_and_len"},
  [SYSCALLS.DEBUG_SET_BREAK]:   {},
  [SYSCALLS.DEBUG_CLEAR_BREAK]: {},
  [SYSCALLS.DEBUG_CONTINUE]:    {},
  [SYSCALLS.DEBUG_STEP]:        {},
});

/** Возвращаемое значение syscall: A = результат (или -1 при ошибке),
 *  B–C = дополнительные выходные значения, D = 0 (OK) или отрицательный errno. */

/** Флаги открытия файла (O_*) */
export const OPEN_FLAGS=Object.freeze({
  O_RDONLY:0,
  O_WRONLY:1,
  O_RDWR:2,
  O_CREAT:4,
  O_TRUNC:8,
  O_APPEND:16,
});

/** SEEK_WHENCE */
export const SEEK_WHENCE=Object.freeze({
  SEEK_SET:0,
  SEEK_CUR:1,
  SEEK_END:2,
});

/** Inode types */
export const INODE_TYPES=Object.freeze({
  REGULAR:0,
  DIRECTORY:1,
  DEVICE:2,
});

/** Process states */
export const PROCESS_STATES=Object.freeze({
  READY:0,
  RUNNING:1,
  SLEEPING:2,
  STOPPED:3,
  ZOMBIE:4,
  FAULTED:5,
});

export const contextFrameBytes=returnDepth=>{
  if(!Number.isInteger(returnDepth)||returnDepth<0)
    throw new Error("returnDepth должен быть неотрицательным целым");
  const raw=CONTEXT_LAYOUT.fixedBytes+returnDepth*CONTEXT_LAYOUT.returnEntryBytes;
  return (raw+CONTEXT_LAYOUT.alignment-1)&-CONTEXT_LAYOUT.alignment;
};

/** Экспорт для генерации Assembly .inc файлов.
 *  Возвращает строку .equ-деклараций для включения в Assembly исходники. */
export const generateAssemblyConstants=()=>{
  const lines=[];
  const equ=(name,value)=>lines.push(`.equ ${name}, ${value}`);
  const section=title=>{ lines.push(""); lines.push(`; ${title}`); };
  const hex=v=>{
    if(typeof v==="number")return `0x${(v>>>0).toString(16)}`;
    return String(v);
  };

  section("=== Syscall numbers (PCVM v3) ===");
  for(const [name,number] of Object.entries(SYSCALLS))equ(`SYS_${name}`,`0x${number.toString(16)}`);

  section("=== Limits ===");
  for(const [name,value] of Object.entries(ABI_LIMITS))equ(name,value);

  section("=== Errno ===");
  for(const [name,value] of Object.entries(ERRNO))equ(name,value);

  section("=== Open flags ===");
  for(const [name,value] of Object.entries(OPEN_FLAGS))equ(name,value);

  section("=== Seek whence ===");
  for(const [name,value] of Object.entries(SEEK_WHENCE))equ(name,value);

  section("=== Inode types ===");
  for(const [name,value] of Object.entries(INODE_TYPES))equ(name,value);

  section("=== Process states ===");
  for(const [name,value] of Object.entries(PROCESS_STATES))equ(name,value);

  section("=== Struct layouts (offsets and sizes) ===");

  const struct=(name,layout)=>{
    section(`${name} (${layout.bytes} байт, выравнивание ${layout.alignment})`);
    equ(`${name}_BYTES`,layout.bytes);
    for(const [field,offset] of Object.entries(layout)){
      if(field==="bytes"||field==="alignment")continue;
      equ(`${name}_${field}`,offset);
    }
  };

  struct("TIMESPEC",TIMESPEC_LAYOUT);
  struct("STAT",STAT_LAYOUT);
  struct("DIRENT",DIRENT_LAYOUT);
  struct("PROCESS_INFO",PROCESS_INFO_LAYOUT);
  struct("DEBUG_REGS",DEBUG_REGS_LAYOUT);
  struct("SYSINFO",SYSINFO_LAYOUT);
  struct("UTSNAME",UTSNAME_LAYOUT);

  section("=== Protected mode constants ===");
  equ("PROTECTED_ISA_VERSION",PROTECTED_ISA_VERSION);
  equ("PROTECTED_FEATURE",PROTECTED_FEATURE);
  for(const [name,row] of Object.entries(PROTECTED_OPCODES))
    equ(`OP_${name}`,`0x${row.opcode.toString(16)}`);
  for(const [name,value] of Object.entries(PROTECTED_EXCEPTIONS))
    equ(`EXC_${name}`,value);
  equ("CONTEXT_FIXED_BYTES",CONTEXT_LAYOUT.fixedBytes);
  equ("CONTEXT_ALIGNMENT",CONTEXT_LAYOUT.alignment);

  return lines.join("\n")+"\n";
};
