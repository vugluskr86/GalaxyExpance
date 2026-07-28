/** Нормативная спецификация protected mode для PCVM v3. */
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

export const SYSCALLS=Object.freeze({
  EXIT:0x01,YIELD:0x02,SPAWN:0x03,WAIT:0x04,GETPID:0x05,KILL:0x06,
  PROCESS_LIST:0x07,
  ALLOC:0x10,FREE:0x11,MEM_INFO:0x12,
  OPEN:0x20,READ:0x21,WRITE:0x22,CLOSE:0x23,LIST:0x24,DELETE:0x25,
  IPC_SEND:0x30,IPC_RECV:0x31,
  TTY_READ:0x40,TTY_WRITE:0x41,TTY_MODE:0x42,TTY_CLEAR:0x43,TTY_COLOR:0x44,
  TIME:0x50,SLEEP:0x51,
  GFX_PIXEL:0x60,GFX_LINE:0x61,GFX_RECT:0x62,GFX_CIRCLE:0x63,
  GFX_BEGIN:0x64,GFX_FRAME:0x65,GFX_END:0x66,
  INPUT_KEY:0x70,INPUT_MOUSE_X:0x71,INPUT_MOUSE_Y:0x72,
  INPUT_MOUSE_BUTTONS:0x73,INPUT_MOUSE_WHEEL:0x74,
});

export const SYSCALL_ERRORS=Object.freeze({
  OK:0,
  NOT_FOUND:-2,
  IO:-5,
  BAD_FILE:-9,
  BAD_ADDRESS:-14,
  BUSY:-16,
  INVALID:-22,
  NOT_SUPPORTED:-38,
});

export const contextFrameBytes=returnDepth=>{
  if(!Number.isInteger(returnDepth)||returnDepth<0)
    throw new Error("returnDepth должен быть неотрицательным целым");
  const raw=CONTEXT_LAYOUT.fixedBytes+returnDepth*CONTEXT_LAYOUT.returnEntryBytes;
  return (raw+CONTEXT_LAYOUT.alignment-1)&-CONTEXT_LAYOUT.alignment;
};
