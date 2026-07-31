/** Виртуальный процессор бортового компьютера.
 *  Ассемблер намеренно текстовый: исходники хранятся на DRIVE, а при запуске
 *  компилируются в компактное внутреннее представление и исполняются в RAM. */
import { BIOS_ASM } from "./bios.js";
import { PixelOS } from "./os.js";
import { ensureShipNetwork, networkTopology, scannerNetworkReadiness, scannerClientConfig, configureScannerClient, switchConfig, configureSwitch, dhcpLease, dhcpAll, udpSend, sendEthernet } from "./network.js";
import { NetBufManager } from "./net-buf.js";
import { ArpTable, macToString } from "./net-protocol.js";
import { installPCFD } from "./installer.js";
import {
  CONTEXT_FLAGS,CONTEXT_LAYOUT,PROTECTED_EXCEPTIONS,PROTECTED_FEATURE,
  PROTECTED_ISA_VERSION,PROTECTED_OPCODES,IVT_LAYOUT,MEMORY_PERMISSIONS,
  PROCESS_MEMORY_LAYOUT,PROCESS_INFO_LAYOUT,SYSINFO_LAYOUT,
  SYSCALL_ERRORS,SYSCALLS,contextFrameBytes
} from "./protected-mode.js";

export class CPUFault extends Error {
  constructor(cause,address=0,message="CPU fault"){
    super(message);this.name="CPUFault";this.cause=cause;this.address=address|0;
  }
}

export class Vector4 {
  constructor(x=0, y=0, z=0, w=0){ this.x=x; this.y=y; this.z=z; this.w=w; }
  clone(){ return new Vector4(this.x, this.y, this.z, this.w); }
  map(fn){ return new Vector4(fn(this.x,0), fn(this.y,1), fn(this.z,2), fn(this.w,3)); }
  toString(){ return `[${this.x}, ${this.y}, ${this.z}, ${this.w}]`; }
}

const OPS = new Set([
  "LOAD_A","LOAD_B","LOAD_C","LOAD_D","MOV_A_B","MOV_A_C","MOV_A_D",
  "MOV_B_A","MOV_C_A","MOV_D_A","LOAD_M_A","LOAD_M_B","STORE_A","STORE_B",
  "ADD_A_B","ADD_A_C","SUB_A_B","SUB_A_C","MUL_A_B","DIV_A_B",
  "AND_A_B","OR_A_B","XOR_A_B","CMP_A_B","INC_A","DEC_A",
  "JMP","JZ","JNZ","CALL","RET","PUSH_A","POP_A","NOP",
  "LOAD_F","LOAD_FB","LOAD_FC","LOAD_FD","ITOF","FTOI","FADD_FA_FB",
  "FSUB_FA_FB","FMUL_FA_FB","FDIV_FA_FB","FCMP_FA_FB","FABS_FA",
  "FNEG_FA","FSQRT_FA","FSIN_FA","FCOS_FA","FLOOR_FA","FCEIL_FA","FROUND_FA",
  "VSET","VLOAD","VSTORE","VMOV","VADD","VSUB","VMUL","VDIV","VDOT",
  "VCROSS","VNORM","VLEN","VLERP","VSCALE","VNEG","VABS","VSPLAT",
  "VSUM","VAVG","PRINT","PRINT_A","PRINT_FA","PRINT_V",
  "TERM_MODE","TERM_CLEAR","TERM_COLOR",
  "GFX_PIXEL","GFX_LINE","GFX_RECT","GFX_CIRCLE","GFX_BEGIN","GFX_FRAME","GFX_END",
  "IN_KEY","IN_CHAR","IN_MOUSE_X","IN_MOUSE_Y","IN_MOUSE_BUTTONS","IN_MOUSE_WHEEL",
  "SYS_TIME","HW_LIST","SLOT_LIST","PORT_LIST","BOOT",
  "OS_PID","IPC_SEND","IPC_RECV",
  "LOAD8_A_B","STORE8_A_B","LOAD32_A_B","STORE32_A_B",
  "INC_B","DEC_B","ADD_B_C","MEM_COPY","MEM_CMP",
  "FS_LIST","FS_READ","FS_WRITE","FS_DELETE","YIELD",
  "TTY_READLINE","PROC_EXEC","PROC_LIST","PROC_KILL","MEM_INFO",
  "STR_TOKEN","STR_HASH","STR_TO_INT","TTY_WRITE",
  "LEX_TOKEN","CMP_A_D","ADD_B_D",
  "MOV_C_B","MOV_B_C",
  "STORE64_FA_B",
  "MOV_B_D","SUB_A_D",
  "STORE16_A_B",
  "STR_IS_NUMBER",
  "HALT"
]);
const OP_NAMES=[...OPS];
const ARGC_OVERRIDES={
  LOAD_A:1,LOAD_B:1,LOAD_C:1,LOAD_D:1,
  LOAD_M_A:1,LOAD_M_B:1,STORE_A:1,STORE_B:1,
  JMP:1,JZ:1,JNZ:1,CALL:1,
  LOAD_F:1,LOAD_FB:1,LOAD_FC:1,LOAD_FD:1,
  VSET:5,VLOAD:2,VSTORE:2,VMOV:2,VADD:2,VSUB:2,VMUL:2,VDIV:2,
  VDOT:2,VCROSS:2,VNORM:1,VLEN:1,VLERP:2,VSCALE:1,VNEG:1,VABS:1,
  VSPLAT:1,VSUM:1,VAVG:1,
  PRINT:1,PRINT_V:1,TERM_MODE:1,TERM_COLOR:2,BOOT:1,
  GFX_PIXEL:3,GFX_LINE:5,GFX_RECT:6,GFX_CIRCLE:5,GFX_FRAME:1,
};
/** Зафиксированная machine-description table PCVM v2.
 * Новые инструкции разрешено только дописывать после существующих. */
export const ISA_TABLE=Object.freeze(OP_NAMES.map((name,index)=>Object.freeze({
  opcode:index+1,name,argc:ARGC_OVERRIDES[name]??0
})));
export const OPCODES=Object.freeze(Object.fromEntries(ISA_TABLE.map(row=>[row.name,row.opcode])));
export const OPERAND_COUNTS=Object.freeze(Object.fromEntries(ISA_TABLE.map(row=>[row.name,row.argc])));
const OPCODE_NAMES=Object.freeze(Object.fromEntries(OP_NAMES.map((name,index)=>[index+1,name])));
const PROTECTED_NAMES=Object.keys(PROTECTED_OPCODES);
const ALL_OPCODES=Object.freeze({...OPCODES,...Object.fromEntries(
  Object.entries(PROTECTED_OPCODES).map(([name,row])=>[name,row.opcode]))});
const ALL_OPERAND_COUNTS=Object.freeze({...OPERAND_COUNTS,...Object.fromEntries(
  Object.entries(PROTECTED_OPCODES).map(([name,row])=>[name,row.argc]))});
const ALL_OPCODE_NAMES=Object.freeze({...OPCODE_NAMES,...Object.fromEntries(
  Object.entries(PROTECTED_OPCODES).map(([name,row])=>[row.opcode,name]))});
const BYTECODE_MAGIC=[0x50,0x43,0x56,0x4d]; // PCVM
const BYTECODE_VERSION=2;
const textEncoder=new TextEncoder(), textDecoder=new TextDecoder();
const PRIVILEGED_LEGACY_OPS=new Set([
  "SYS_TIME","HW_LIST","SLOT_LIST","PORT_LIST","BOOT",
  "OS_PID","IPC_SEND","IPC_RECV",
  "FS_LIST","FS_READ","FS_WRITE","FS_DELETE",
  "PROC_EXEC","PROC_LIST","PROC_KILL","MEM_INFO",
  "TERM_MODE","TERM_CLEAR","TERM_COLOR",
  "GFX_PIXEL","GFX_LINE","GFX_RECT","GFX_CIRCLE","GFX_BEGIN","GFX_FRAME","GFX_END",
  "IN_KEY","IN_CHAR","IN_MOUSE_X","IN_MOUSE_Y","IN_MOUSE_BUTTONS","IN_MOUSE_WHEEL",
  "TTY_READLINE","TTY_WRITE"
]);

const number = (raw, line) => {
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`строка ${line}: ожидалось число, получено «${raw}»`);
  return value;
};

export class Assembler {
  assemble(source){
    const labels = new Map(), rows = [], dataWrites=[];
    let dataAddress=0,featureFlags=0;
    for (const [index, original] of source.split(/\r?\n/).entries()){
      let text = original.replace(/;.*$/, "").trim();
      if (!text) continue;
      const match = text.match(/^([A-Za-z_]\w*):/);
      let pendingLabel=null;
      if (match){
        if (labels.has(match[1])) throw new Error(`строка ${index+1}: повторная метка ${match[1]}`);
        pendingLabel=match[1];
        text = text.slice(match[0].length).trim();
        if (!text){labels.set(pendingLabel,rows.length);continue;}
      }
      const tokens = text.match(/"(?:\\.|[^"])*"|[^,\s]+/g) || [];
      let op = tokens.shift()?.toUpperCase();
      const value=token=>labels.has(token)?labels.get(token):number(token,index+1);
      if(op===".EQU"){
        const name=pendingLabel||tokens.shift();
        if(!name)throw new Error(`строка ${index+1}: .equ требует имя`);
        labels.set(name,value(tokens[0]));continue;
      }
      if(op===".PROTECTED"){featureFlags|=PROTECTED_FEATURE;continue;}
      if(op===".TEXT"||op===".DATA"||op===".RODATA"||op===".BSS")continue;
      if(op===".IMPORT"||op===".EXPORT"||op===".INCLUDE")continue;
      if(op===".ORG"){dataAddress=value(tokens[0]);if(pendingLabel)labels.set(pendingLabel,dataAddress);continue;}
      if(op===".BYTE"){
        if(pendingLabel)labels.set(pendingLabel,dataAddress);
        const data=Uint8Array.from(tokens.map(token=>value(token)&255));
        dataWrites.push({address:dataAddress,data});dataAddress+=data.length;continue;
      }
      if(op===".WORD"||op===".DWORD"){
        if(pendingLabel)labels.set(pendingLabel,dataAddress);
        const width=op===".WORD"?2:4,data=new Uint8Array(tokens.length*width),view=new DataView(data.buffer);
        tokens.forEach((token,i)=>width===2
          ?view.setInt16(i*width,value(token),true):view.setInt32(i*width,value(token),true));
        dataWrites.push({address:dataAddress,data});dataAddress+=data.length;continue;
      }
      if(op===".STRING"){
        if(pendingLabel)labels.set(pendingLabel,dataAddress);
        const value=JSON.parse(tokens.join(" "));
        const data=textEncoder.encode(value);
        dataWrites.push({address:dataAddress,data});dataAddress+=data.length;continue;
      }
      if(op===".ZERO"){
        if(pendingLabel)labels.set(pendingLabel,dataAddress);
        dataAddress+=value(tokens[0]);continue;
      }
      if(op===".ALIGN"){
        const alignment=value(tokens[0]);
        dataAddress=Math.ceil(dataAddress/alignment)*alignment;
        if(pendingLabel)labels.set(pendingLabel,dataAddress);
        continue;
      }
      if(pendingLabel)labels.set(pendingLabel,rows.length);
      /* Совместимость с мнемониками из предоставленного примера:
       * VADD_V0_V1 эквивалентно более общему VADD V0, V1. */
      let matchOp = op.match(/^(VLOAD|VSTORE)_V([0-7])$/);
      if (matchOp){ op=matchOp[1]; tokens.unshift("V"+matchOp[2]); }
      matchOp = op.match(/^(VMOV|VADD|VSUB|VMUL|VDIV|VDOT|VCROSS)_V([0-7])_V([0-7])$/);
      if (matchOp){ op=matchOp[1]; tokens.unshift("V"+matchOp[2],"V"+matchOp[3]); }
      matchOp = op.match(/^(VNORM|VLEN|VSCALE|VNEG|VABS|VSPLAT)_V([0-7])$/);
      if (matchOp){ op=matchOp[1]; tokens.unshift("V"+matchOp[2]); }
      matchOp = op.match(/^VEC_(SUM|AVG)_V([0-7])$/);
      if (matchOp){ op="V"+matchOp[1]; tokens.unshift("V"+matchOp[2]); }
      if (!OPS.has(op)&&!PROTECTED_NAMES.includes(op))
        throw new Error(`строка ${index+1}: неизвестная команда ${op}`);
      if(PROTECTED_NAMES.includes(op))featureFlags|=PROTECTED_FEATURE;
      const expected=ALL_OPERAND_COUNTS[op];
      if(tokens.length!==expected)
        throw new Error(`строка ${index+1}: ${op} требует операндов: ${expected}, получено: ${tokens.length}`);
      rows.push({ op, args:tokens, line:index+1 });
    }
    for (const row of rows){
      row.args=row.args.map((arg,argIndex)=>{
        if(labels.has(arg))return labels.get(arg);
        if(["JMP","JZ","JNZ","CALL"].includes(row.op)&&argIndex===0)
          return number(arg,row.line);
        return arg;
      });
    }
    rows.dataWrites=dataWrites;
    rows.featureFlags=featureFlags;
    rows.version=featureFlags?PROTECTED_ISA_VERSION:BYTECODE_VERSION;
    return rows;
  }
  assembleBinary(source){
    return this.encodeProgram(this.assemble(source));
  }
  encodeProgram(program){
    const chunks=[];
    const pushByte=value=>chunks.push(Uint8Array.of(value));
    const pushU16=value=>{ const b=new Uint8Array(2); new DataView(b.buffer).setUint16(0,value,true); chunks.push(b); };
    const pushF64=value=>{ const b=new Uint8Array(8); new DataView(b.buffer).setFloat64(0,value,true); chunks.push(b); };
    const featureFlags=(program.featureFlags||program.some(ins=>PROTECTED_NAMES.includes(ins.op)))
      ? (program.featureFlags|PROTECTED_FEATURE) : 0;
    const version=featureFlags?PROTECTED_ISA_VERSION:BYTECODE_VERSION;
    chunks.push(Uint8Array.from(BYTECODE_MAGIC));
    pushByte(version);
    if(version===PROTECTED_ISA_VERSION)pushU16(featureFlags);
    pushU16(program.length);
    for(const ins of program){
      const opcode=ALL_OPCODES[ins.op];
      if(!opcode)throw new Error(`невозможно закодировать неизвестную команду ${ins.op}`);
      pushByte(opcode);
      pushByte(ins.args.length);
      for(const raw of ins.args){
        const numeric=typeof raw==="number" ? raw : Number(raw);
        if((typeof raw==="number" || String(raw).trim()!=="") && Number.isFinite(numeric)){
          pushByte(0); pushF64(numeric);
        } else {
          const bytes=textEncoder.encode(String(raw));
          if(bytes.length>65535) throw new Error(`строка ${ins.line}: слишком длинный операнд`);
          pushByte(1); pushU16(bytes.length); chunks.push(bytes);
        }
      }
    }
    pushU16(program.dataWrites?.length||0);
    for(const segment of program.dataWrites||[]){
      const address=new Uint8Array(4);
      new DataView(address.buffer).setUint32(0,segment.address,true);
      chunks.push(address);pushU16(segment.data.length);chunks.push(segment.data);
    }
    const size=chunks.reduce((sum,chunk)=>sum+chunk.length,0);
    const binary=new Uint8Array(size);
    let offset=0;
    for(const chunk of chunks){ binary.set(chunk,offset); offset+=chunk.length; }
    return binary;
  }
  decodeBinary(input){
    const bytes=input instanceof Uint8Array ? input : new Uint8Array(input);
    let at=0;
    const need=count=>{ if(at+count>bytes.length)throw new Error("повреждённый бинарный файл"); };
    const u8=()=>{ need(1); return bytes[at++]; };
    const u16=()=>{ need(2); const value=new DataView(bytes.buffer,bytes.byteOffset+at,2).getUint16(0,true); at+=2; return value; };
    const f64=()=>{ need(8); const value=new DataView(bytes.buffer,bytes.byteOffset+at,8).getFloat64(0,true); at+=8; return value; };
    need(4);
    for(const magic of BYTECODE_MAGIC) if(u8()!==magic)throw new Error("неверная сигнатура PCVM");
    const version=u8();
    if(version!==BYTECODE_VERSION&&version!==PROTECTED_ISA_VERSION)
      throw new Error("неподдерживаемая версия байткода");
    const featureFlags=version===PROTECTED_ISA_VERSION?u16():0;
    const count=u16(), program=[];
    for(let index=0;index<count;index++){
      const opcode=u8(), op=ALL_OPCODE_NAMES[opcode];
      if(!op)throw new Error(`неизвестный машинный код 0x${opcode.toString(16)}`);
      if(PROTECTED_NAMES.includes(op)&&
        (version!==PROTECTED_ISA_VERSION||!(featureFlags&PROTECTED_FEATURE)))
        throw new Error(`opcode ${op} требует PCVM v3 protected feature`);
      const argc=u8(), args=[];
      if(argc!==ALL_OPERAND_COUNTS[op])
        throw new Error(`неверное число операндов ${op}: ${argc}, ожидалось ${ALL_OPERAND_COUNTS[op]}`);
      for(let i=0;i<argc;i++){
        const type=u8();
        if(type===0)args.push(f64());
        else if(type===1){ const length=u16(); need(length); args.push(textDecoder.decode(bytes.subarray(at,at+length))); at+=length; }
        else throw new Error(`неизвестный тип операнда ${type}`);
      }
      program.push({op,args,line:index+1});
    }
    const segments=u16(),dataWrites=[];
    for(let i=0;i<segments;i++){
      need(6);
      const address=new DataView(bytes.buffer,bytes.byteOffset+at,4).getUint32(0,true);at+=4;
      const length=u16();need(length);
      dataWrites.push({address,data:bytes.slice(at,at+length)});at+=length;
    }
    program.dataWrites=dataWrites;
    program.version=version;
    program.featureFlags=featureFlags;
    if(at!==bytes.length)throw new Error("лишние данные после программы");
    return program;
  }
}

export class CPU {
  constructor(memoryBytes, output=()=>{}, terminal=null, system=null){
    if (!Number.isInteger(memoryBytes) || memoryBytes < 64) throw new Error("для запуска требуется не менее 64 байт RAM");
    this.memory = new ArrayBuffer(memoryBytes);
    this.bytes = new Uint8Array(this.memory);
    this.view = new DataView(this.memory);
    this.output = output;
    this.terminal = terminal;
    this.system = system;
    this.reset();
  }
  reset(){
    this.bytes.fill(0);
    this.r = { A:0,B:0,C:0,D:0, FA:0,FB:0,FC:0,FD:0, PC:0,
      SP:this.bytes.length, Z:false, MODE:"real",UBASE:0,ULIMIT:this.bytes.length,
      KSP:this.bytes.length,IVT:0,IE:false,CAUSE:0,FAULT_ADDR:0,
      V:Array.from({length:8},()=>new Vector4()) };
    this.callStack = [];
    this.protection=null;
    this.requestYield=false;
  }
  configureProtectedMode({mode="kernel",ubase=0,ulimit=this.bytes.length,ksp=this.bytes.length,ivt=0,ie=false}={}){
    if(!["kernel","user"].includes(mode))throw new Error(`неверный режим CPU: ${mode}`);
    for(const [name,value] of Object.entries({ubase,ulimit,ksp,ivt}))
      if(!Number.isInteger(value)||value<0)throw new Error(`${name} должен быть неотрицательным целым`);
    if(ubase+ulimit>this.bytes.length)throw new Error("область user mode выходит за пределы RAM");
    if(ksp>this.bytes.length||ivt>this.bytes.length)throw new Error("служебный адрес вне RAM");
    Object.assign(this.r,{MODE:mode,UBASE:ubase,ULIMIT:ulimit,KSP:ksp,IVT:ivt,IE:!!ie});
    if(mode==="user"&&(this.r.SP<0||this.r.SP>ulimit))this.r.SP=ulimit;
  }
  enterUserMode(pc=this.r.PC,sp=this.r.ULIMIT){
    if(this.r.MODE==="real")throw new Error("protected mode не настроен");
    if(!Number.isInteger(pc)||pc<0)throw new Error("неверный user PC");
    if(!Number.isInteger(sp)||sp<0||sp>this.r.ULIMIT)throw new Error("неверный user SP");
    Object.assign(this.r,{MODE:"user",PC:pc,SP:sp});
  }
  configureUserProtection({textLimit,regions,stackBase}){
    if(!Number.isInteger(textLimit)||textLimit<0)throw new Error("invalid protected TEXT limit");
    if(!Array.isArray(regions)||!regions.length)throw new Error("protected memory map is empty");
    const normalized=regions.map(region=>{
      if(!Number.isInteger(region.start)||!Number.isInteger(region.end)||
        region.start<0||region.end<region.start||region.end>this.r.ULIMIT)
        throw new Error(`invalid protected region ${region.name||""}`);
      return {...region,permissions:region.permissions|0};
    }).sort((a,b)=>a.start-b.start);
    this.protection={textLimit,regions:normalized,stackBase};
  }
  requireKernel(){
    if(this.r.MODE==="user")
      throw new CPUFault(PROTECTED_EXCEPTIONS.PRIVILEGE_FAULT,0,"привилегированная операция в user mode");
  }
  kernelRange(address,size){
    if(!Number.isInteger(address)||!Number.isInteger(size)||address<0||size<0||
      address>this.bytes.length||size>this.bytes.length-address)
      throw new Error("kernel stack или IVT вне физической RAM");
    return address;
  }
  dispatchFault(fault,faultPC=this.r.PC){
    if(!(fault instanceof CPUFault))throw fault;
    if(this.r.MODE==="real")throw fault;
    if(this.r.MODE!=="user")
      throw new Error(`kernel panic: fault ${fault.cause} at ${fault.address}`);
    const depth=this.callStack.length,frameBytes=contextFrameBytes(depth);
    const frame=this.kernelRange(this.r.KSP-frameBytes,frameBytes),v=this.view;
    const u32=(offset,value)=>v.setInt32(frame+offset,value|0,true);
    u32(CONTEXT_LAYOUT.PC,faultPC);u32(CONTEXT_LAYOUT.SP,this.r.SP);
    u32(CONTEXT_LAYOUT.A,this.r.A);u32(CONTEXT_LAYOUT.B,this.r.B);
    u32(CONTEXT_LAYOUT.C,this.r.C);u32(CONTEXT_LAYOUT.D,this.r.D);
    const flags=(this.r.Z?CONTEXT_FLAGS.Z:0)|CONTEXT_FLAGS.USER|
      (this.r.IE?CONTEXT_FLAGS.INTERRUPTS_ENABLED:0);
    u32(CONTEXT_LAYOUT.FLAGS,flags);u32(CONTEXT_LAYOUT.UBASE,this.r.UBASE);
    u32(CONTEXT_LAYOUT.ULIMIT,this.r.ULIMIT);
    for(const [index,name] of ["FA","FB","FC","FD"].entries())
      v.setFloat64(frame+CONTEXT_LAYOUT.FA+index*8,this.r[name],true);
    for(let index=0;index<8;index++){
      const vector=this.r.V[index],at=frame+CONTEXT_LAYOUT.V0+index*16;
      [vector.x,vector.y,vector.z,vector.w].forEach((value,lane)=>
        v.setFloat32(at+lane*4,value,true));
    }
    u32(CONTEXT_LAYOUT.CAUSE,fault.cause);u32(CONTEXT_LAYOUT.FAULT_ADDR,fault.address);
    u32(CONTEXT_LAYOUT.RETURN_DEPTH,depth);u32(CONTEXT_LAYOUT.RESERVED,frameBytes);
    this.callStack.forEach((value,index)=>u32(CONTEXT_LAYOUT.fixedBytes+index*4,value));
    const ivtEntry=this.kernelRange(this.r.IVT+fault.cause*4,4);
    const handler=v.getUint32(ivtEntry,true);
    Object.assign(this.r,{MODE:"kernel",KSP:frame,SP:frame,PC:handler,
      CAUSE:fault.cause,FAULT_ADDR:fault.address,IE:false});
    return handler;
  }
  interruptReturn(){
    this.requireKernel();
    if(this.r.MODE!=="kernel")throw new CPUFault(PROTECTED_EXCEPTIONS.INVALID_IRET,0,"IRET вне kernel mode");
    const frame=this.r.KSP,v=this.view;
    this.kernelRange(frame,CONTEXT_LAYOUT.fixedBytes);
    const i32=offset=>v.getInt32(frame+offset,true);
    const depth=i32(CONTEXT_LAYOUT.RETURN_DEPTH),frameBytes=i32(CONTEXT_LAYOUT.RESERVED);
    if(depth<0||frameBytes!==contextFrameBytes(depth))
      throw new CPUFault(PROTECTED_EXCEPTIONS.INVALID_IRET,frame,"повреждённый context frame");
    this.kernelRange(frame,frameBytes);
    const flags=i32(CONTEXT_LAYOUT.FLAGS);
    Object.assign(this.r,{
      PC:i32(CONTEXT_LAYOUT.PC),SP:i32(CONTEXT_LAYOUT.SP),
      A:i32(CONTEXT_LAYOUT.A),B:i32(CONTEXT_LAYOUT.B),
      C:i32(CONTEXT_LAYOUT.C),D:i32(CONTEXT_LAYOUT.D),
      Z:!!(flags&CONTEXT_FLAGS.Z),MODE:flags&CONTEXT_FLAGS.USER?"user":"kernel",
      IE:!!(flags&CONTEXT_FLAGS.INTERRUPTS_ENABLED),
      UBASE:i32(CONTEXT_LAYOUT.UBASE),ULIMIT:i32(CONTEXT_LAYOUT.ULIMIT),
      FA:v.getFloat64(frame+CONTEXT_LAYOUT.FA,true),
      FB:v.getFloat64(frame+CONTEXT_LAYOUT.FB,true),
      FC:v.getFloat64(frame+CONTEXT_LAYOUT.FC,true),
      FD:v.getFloat64(frame+CONTEXT_LAYOUT.FD,true),
      CAUSE:0,FAULT_ADDR:0,KSP:frame+frameBytes,
    });
    for(let index=0;index<8;index++){
      const at=frame+CONTEXT_LAYOUT.V0+index*16;
      this.r.V[index]=new Vector4(...[0,4,8,12].map(offset=>v.getFloat32(at+offset,true)));
    }
    this.callStack=Array.from({length:depth},(_,index)=>
      i32(CONTEXT_LAYOUT.fixedBytes+index*4));
  }
  checkUserAccess(virtual,length,access){
    if(!this.protection||length===0)return;
    const required=access==="write"?MEMORY_PERMISSIONS.WRITE:MEMORY_PERMISSIONS.READ;
    const region=this.protection.regions.find(item=>
      virtual>=item.start&&virtual+length<=item.end);
    if(access==="stack"){
      if(!region||region.name!=="stack")
        throw new CPUFault(PROTECTED_EXCEPTIONS.STACK_FAULT,virtual,
          `stack access ${virtual}..${virtual+length-1} crossed guard range`);
      return;
    }
    if(!region||!(region.permissions&required))
      throw new CPUFault(PROTECTED_EXCEPTIONS.MEMORY_FAULT,virtual,
        `${access} access ${virtual}..${virtual+length-1} is not permitted`);
  }
  validateExecute(pc){
    if(this.r.MODE!=="user")return pc;
    const limit=this.protection?.textLimit;
    if(!Number.isInteger(pc)||pc<0||(limit!==undefined&&limit!==null&&pc>=limit))
      throw new CPUFault(PROTECTED_EXCEPTIONS.EXECUTE_FAULT,pc,
        `execute address ${pc} is outside user TEXT`);
    return pc;
  }
  addr(value, size=1, access="read"){
    const virtual=Math.trunc(value),length=Math.trunc(size);
    if(!Number.isFinite(value)||!Number.isInteger(length)||length<0)
      throw new Error("неверный адрес или размер памяти");
    if(this.r.MODE==="user"){
      if(virtual<0||virtual>this.r.ULIMIT||length>this.r.ULIMIT-virtual)
        throw new CPUFault(PROTECTED_EXCEPTIONS.MEMORY_FAULT,virtual,
          `виртуальный адрес ${virtual}..${virtual+length-1} вне user RAM (0..${this.r.ULIMIT-1})`);
      this.checkUserAccess(virtual,length,access);
      const physical=this.r.UBASE+virtual;
      if(physical<0||physical>this.bytes.length||length>this.bytes.length-physical)
        throw new Error("трансляция user RAM вышла за физическую RAM");
      return physical;
    }
    if(virtual<0||virtual>this.bytes.length||length>this.bytes.length-virtual)
      throw new Error(`адрес ${virtual}..${virtual+length-1} вне RAM (0..${this.bytes.length-1})`);
    return virtual;
  }
  userRange(address,size=1,access="read"){
    const virtual=Math.trunc(address),length=Math.trunc(size);
    if(!Number.isFinite(address)||!Number.isInteger(length)||length<0||
      virtual<0||virtual>this.r.ULIMIT||length>this.r.ULIMIT-virtual)
      throw new CPUFault(PROTECTED_EXCEPTIONS.MEMORY_FAULT,virtual,
        `invalid syscall user range ${virtual}..${virtual+length-1}`);
    const physical=this.r.UBASE+virtual;
    if(physical<0||physical>this.bytes.length||length>this.bytes.length-physical)
      throw new CPUFault(PROTECTED_EXCEPTIONS.MEMORY_FAULT,virtual,
        "syscall user range is outside physical RAM");
    this.checkUserAccess(virtual,length,access);
    return physical;
  }
  userText(address,length){
    const at=this.userRange(address,length);
    return textDecoder.decode(this.bytes.subarray(at,at+length));
  }
  executeSystemCall(number){
    const ok=(A=this.r.A,B=this.r.B,C=this.r.C)=>({A:A|0,B:B|0,C:C|0,D:SYSCALL_ERRORS.OK});
    const fail=(error=SYSCALL_ERRORS.NOT_SUPPORTED)=>({A:-1,B:this.r.B,C:this.r.C,D:error});
    try{
      switch(number){
        case SYSCALLS.EXIT:
          // EXIT never returns to user code. Mark the current quantum finished
          // after notifying the process manager, otherwise the wrapper RET can
          // continue into a dead process (or fault with RET without CALL).
          this.system?.procExit?.(this.r.A);
          this.requestYield=true;
          return ok(this.r.A);
        case SYSCALLS.YIELD:
          this.system?.yield?.();this.requestYield=true;return ok(0);
        case SYSCALLS.SPAWN: {
          const name=this.userText(this.r.B,this.r.C);
          const credentials=this.r.D===0?null:
            {uid:this.r.D&0xffff,gid:(this.r.D>>>16)&0x7fff};
          const pid=this.system?.procExec?.(name,credentials);
          return pid===undefined||pid<0?fail(SYSCALL_ERRORS.NOT_FOUND):ok(pid);
        }
        case SYSCALLS.SPAWN_FD: {
          const name=this.userText(this.r.B,this.r.C);
          const decode=shift=>{
            const encoded=(this.r.D>>>shift)&0xff;
            return encoded?encoded-1:null;
          };
          const pid=this.system?.procExec?.(name,null,
            {stdin:decode(0),stdout:decode(8),stderr:decode(16)});
          return pid===undefined||pid<0?fail(SYSCALL_ERRORS.NOT_FOUND):ok(pid);
        }
        case SYSCALLS.WAIT: {
          if(!this.system?.procWait)return fail();
          const result=this.system.procWait(this.r.B);
          if(!result)return fail(SYSCALL_ERRORS.BUSY);
          if(this.r.C){
            const at=this.userRange(this.r.C,4,"write");
            this.view.setInt32(at,result.status|0,true);
          }
          return ok(result.pid);
        }
        case SYSCALLS.GETPID: return ok(this.system?.pid?.()||0);
        case SYSCALLS.GETPPID: return ok(this.system?.ppid?.()||0);
        case SYSCALLS.GETUID: return ok(this.system?.uid?.()||0);
        case SYSCALLS.GETGID: return ok(this.system?.gid?.()||0);
        case SYSCALLS.SETUID:
          return this.system?.setuid?.(this.r.B)?ok(0):fail(SYSCALL_ERRORS.PERMISSION);
        case SYSCALLS.SETGID:
          return this.system?.setgid?.(this.r.B)?ok(0):fail(SYSCALL_ERRORS.PERMISSION);
        case SYSCALLS.SETSID:
          return this.system?.setsid?.()!==false?ok(this.system?.pid?.()||0):fail(SYSCALL_ERRORS.PERMISSION);
        case SYSCALLS.EXEC: {
          const name=this.userText(this.r.B,this.r.C);
          return this.system?.procReplace?.(name)?ok(0):fail(SYSCALL_ERRORS.NOT_FOUND);
        }
        case SYSCALLS.PROCESS_INFO: {
          const info=this.system?.procInfo?.(this.r.B);
          if(!info)return fail(SYSCALL_ERRORS.NOT_FOUND);
          const size=Math.min(info.length,Math.max(0,this.r.D));
          this.bytes.set(info.subarray(0,size),this.userRange(this.r.C,size,"write"));
          return ok(size);
        }
        case SYSCALLS.KILL:
          return this.system?.procKill?.(this.r.A)?ok(0):fail(SYSCALL_ERRORS.NOT_FOUND);
        case SYSCALLS.PROCESS_LIST: {
          const data=this.system?.procList?.()||new Uint8Array();
          const size=Math.min(data.length,Math.max(0,this.r.C));
          this.bytes.set(data.subarray(0,size),this.userRange(this.r.B,size,"write"));
          return ok(size);
        }
        case SYSCALLS.ALLOC: {
          if(!this.system?.memAlloc)return fail();
          const address=this.system?.memAlloc?.(this.r.B);
          return address===undefined||address<0?fail(SYSCALL_ERRORS.IO):ok(address);
        }
        case SYSCALLS.FREE:
          if(!this.system?.memFree)return fail();
          return this.system?.memFree?.(this.r.B)?ok(0):fail(SYSCALL_ERRORS.INVALID);
        case SYSCALLS.MEM_INFO: {
          const info=this.system?.memInfo?.()||{free:0,total:this.r.ULIMIT};
          return ok(info.free,info.total);
        }
        case SYSCALLS.LIST: {
          const data=this.system?.fsList?.()||new Uint8Array();
          const size=Math.min(data.length,Math.max(0,this.r.C));
          this.bytes.set(data.subarray(0,size),this.userRange(this.r.B,size,"write"));
          return ok(size);
        }
        case SYSCALLS.READ: {
          if(this.system?.vfs?.sysRead){
            const result=this.system.vfs.sysRead(this.r.B,this.r.C,this.r.D,this);
            Object.assign(this.r,result);return result;
          }
          const name=this.userText(this.r.B,this.r.C),data=this.system?.fsRead?.(name);
          if(!data)return fail(SYSCALL_ERRORS.NOT_FOUND);
          const size=Math.min(data.length,Math.max(0,this.r.A));
          this.bytes.set(data.subarray(0,size),this.userRange(this.r.D,size,"write"));
          return ok(size,this.r.B,this.r.C);
        }
        case SYSCALLS.WRITE: {
          if(this.system?.vfs?.sysWrite){
            const result=this.system.vfs.sysWrite(this.r.B,this.r.C,this.r.D,this);
            Object.assign(this.r,result);return result;
          }
          const name=this.userText(this.r.B,this.r.C),size=Math.max(0,this.r.A);
          const at=this.userRange(this.r.D,size);
          this.system?.fsWrite?.(name,this.bytes.slice(at,at+size));
          return ok(size);
        }
        case SYSCALLS.DELETE: {
          const name=this.userText(this.r.B,this.r.C);
          return this.system?.fsDelete?.(name)?ok(0):fail(SYSCALL_ERRORS.NOT_FOUND);
        }
        case SYSCALLS.DUP: {
          const result=this.system?.vfs?.sysDup?.(this.r.B,this);
          return result?ok(result.A,result.B,result.C):fail(SYSCALL_ERRORS.NOT_SUPPORTED);
        }
        case SYSCALLS.DUP2: {
          const result=this.system?.vfs?.sysDup2?.(this.r.B,this.r.C,this);
          return result?ok(result.A,result.B,result.C):fail(SYSCALL_ERRORS.NOT_SUPPORTED);
        }
        case SYSCALLS.OPEN: {
          const result=this.system?.vfs?.sysOpen?.(this.r.B,this.r.C,this.r.D,this);
          if(!result)return fail();
          Object.assign(this.r,result);return result;
        }
        case SYSCALLS.CLOSE: {
          const result=this.system?.vfs?.sysClose?.(this.r.B,this);
          if(!result)return fail();
          Object.assign(this.r,result);return result;
        }
        case SYSCALLS.SEEK: {
          const result=this.system?.vfs?.sysSeek?.(this.r.B,this.r.C,this.r.D,this);
          if(!result)return fail();
          Object.assign(this.r,result);return result;
        }
        case SYSCALLS.STAT: {
          const result=this.system?.vfs?.sysStat?.(this.r.B,this.r.C,this.r.D,this);
          if(!result)return fail();
          Object.assign(this.r,result);return result;
        }
        case SYSCALLS.READDIR: {
          const result=this.system?.vfs?.sysReaddir?.(this.r.B,this.r.C,this.r.D,this);
          if(!result)return fail();
          Object.assign(this.r,result);return result;
        }
        case SYSCALLS.MKDIR: {
          const result=this.system?.vfs?.sysMkdir?.(this.r.B,this.r.C,this.r.D,this);
          if(!result)return fail();
          Object.assign(this.r,result);return result;
        }
        case SYSCALLS.UNLINK: {
          const result=this.system?.vfs?.sysUnlink?.(this.r.B,this.r.C,this);
          if(!result)return fail();
          Object.assign(this.r,result);return result;
        }
        case SYSCALLS.RENAME: {
          const newOffset=this.r.D&0xffff,newLen=(this.r.D>>>16)&0xffff;
          const result=this.system?.vfs?.sysRename?.(
            this.r.B,this.r.C,this.r.B+newOffset,newLen,this);
          if(!result)return fail();
          Object.assign(this.r,result);return result;
        }
        case SYSCALLS.CHMOD: {
          const result=this.system?.vfs?.sysChmod?.(this.r.B,this.r.C,this.r.D,this);
          if(!result)return fail();
          Object.assign(this.r,result);return result;
        }
        case SYSCALLS.CHOWN: {
          const result=this.system?.vfs?.sysChown?.(this.r.B,this.r.C,this.r.D>>16,this.r.D&0xffff,this);
          if(!result)return fail();
          Object.assign(this.r,result);return result;
        }
        case SYSCALLS.GETCWD: {
          const result=this.system?.vfs?.sysGetcwd?.(this.r.B,this.r.C,this);
          if(!result)return fail();
          Object.assign(this.r,result);return result;
        }
        case SYSCALLS.CHDIR: {
          const result=this.system?.vfs?.sysChdir?.(this.r.B,this.r.C,this);
          if(!result)return fail();
          Object.assign(this.r,result);return result;
        }
        case SYSCALLS.IPC_SEND:
          this.system?.ipcSend?.(this.r.A,this.r.B);return ok(0);
        case SYSCALLS.IPC_RECV: {
          const message=this.system?.ipcReceive?.();
          return message?ok(message.from,Number(message.data)||0):fail(SYSCALL_ERRORS.BUSY);
        }
        case SYSCALLS.ENV_SET: {
          const keyLen=this.r.D&0xffff,valueLen=(this.r.D>>>16)&0xffff;
          const key=this.userText(this.r.B,keyLen);
          if(valueLen===0){
            const separator=key.indexOf("=");
            if(separator>=0)
              return this.system?.envSet?.(key.slice(0,separator),key.slice(separator+1))
                ?ok(0):fail(SYSCALL_ERRORS.PERMISSION);
            return this.system?.envUnset?.(key)?ok(0):fail(SYSCALL_ERRORS.PERMISSION);
          }
          const value=this.userText(this.r.C,valueLen);
          return this.system?.envSet?.(key,value)?ok(0):fail(SYSCALL_ERRORS.PERMISSION);
        }
        case SYSCALLS.ENV_GET: {
          const keyLen=this.r.D&0xffff,capacity=(this.r.D>>>16)&0xffff;
          const value=this.system?.envGet?.(this.userText(this.r.B,keyLen));
          if(value===undefined)return fail(SYSCALL_ERRORS.NOT_FOUND);
          const data=textEncoder.encode(value),size=Math.min(data.length,capacity);
          this.bytes.set(data.subarray(0,size),this.userRange(this.r.C,size,"write"));
          return ok(size);
        }
        case SYSCALLS.LINK: {
          const newOffset=this.r.D&0xffff,newLen=(this.r.D>>>16)&0xffff;
          const result=this.system?.vfs?.sysLink?.(
            this.r.B,this.r.C,this.r.B+newOffset,newLen,this);
          if(!result)return fail();
          Object.assign(this.r,result);return result;
        }
        case SYSCALLS.ENV_LIST: {
          const data=this.system?.envList?.()||new Uint8Array();
          const size=Math.min(data.length,Math.max(0,this.r.C));
          this.bytes.set(data.subarray(0,size),this.userRange(this.r.B,size,"write"));
          return ok(size);
        }
        case SYSCALLS.TTY_READ: {
          const line=this.terminal?.readLine?.();
          if(line===null||line===undefined)return fail(SYSCALL_ERRORS.BUSY);
          const data=textEncoder.encode(line),size=Math.min(data.length,Math.max(0,this.r.C));
          this.bytes.set(data.subarray(0,size),this.userRange(this.r.B,size,"write"));
          return ok(size);
        }
        case SYSCALLS.TTY_WRITE: {
          const text=this.userText(this.r.B,this.r.C);
          this.output(text);this.terminal?.print(text);return ok(this.r.C);
        }
        case SYSCALLS.TTY_MODE: {
          const mode=this.r.A===0?"text":this.r.A===1?"graphics":null;
          if(!mode)return fail(SYSCALL_ERRORS.INVALID);
          if(mode==="graphics"&&this.system?.outputMode&&this.system.outputMode!=="graphics")
            return fail(SYSCALL_ERRORS.NOT_SUPPORTED);
          this.terminal?.setMode(mode);return ok(0);
        }
        case SYSCALLS.TTY_CLEAR:
          this.terminal?.clear();return ok(0);
        case SYSCALLS.TTY_COLOR:
          this.terminal?.setColors(this.r.A,this.r.B);return ok(0);
        case SYSCALLS.TIME: {
          const text=String(this.system?.time?.()||new Date().toLocaleTimeString("ru-RU"));
          const data=textEncoder.encode(text),size=Math.min(data.length,Math.max(0,this.r.C));
          if(size)this.bytes.set(data.subarray(0,size),this.userRange(this.r.B,size,"write"));
          return ok(size);
        }
        case SYSCALLS.SLEEP:
          this.system?.sleep?.(this.r.A);return ok(0);
        case SYSCALLS.SYSINFO: {
          const info=this.system?.sysInfo?.();
          if(!info)return fail(SYSCALL_ERRORS.NOT_SUPPORTED);
          const at=this.userRange(this.r.B,SYSINFO_LAYOUT.bytes,"write");
          const out=new Uint8Array(SYSINFO_LAYOUT.bytes),view=new DataView(out.buffer);
          view.setUint32(SYSINFO_LAYOUT.UPTIME_SEC,info.uptimeSec>>>0,true);
          view.setUint32(SYSINFO_LAYOUT.UPTIME_NSEC,info.uptimeNsec>>>0,true);
          view.setUint32(SYSINFO_LAYOUT.TOTAL_RAM,info.totalRam>>>0,true);
          view.setUint32(SYSINFO_LAYOUT.FREE_RAM,info.freeRam>>>0,true);
          view.setUint32(SYSINFO_LAYOUT.TOTAL_DRIVE,info.totalDrive>>>0,true);
          view.setUint32(SYSINFO_LAYOUT.FREE_DRIVE,info.freeDrive>>>0,true);
          view.setUint32(SYSINFO_LAYOUT.PROCESSES,info.processes>>>0,true);
          view.setUint32(SYSINFO_LAYOUT.CPU_THREADS,info.cpuThreads>>>0,true);
          this.bytes.set(out,at);
          return ok(0);
        }
        case SYSCALLS.HARDWARE_INFO: {
          /* The scanner is a normal user program.  Its only privileged input
           * is this bounded, read-only device snapshot; the program never
           * receives JavaScript objects or access to another process. */
          const report=this.system?.deviceInfo?.();
          if(report===undefined||report===null)return fail(SYSCALL_ERRORS.NOT_SUPPORTED);
          const data=textEncoder.encode(String(report));
          const size=Math.min(data.length,Math.max(0,this.r.C));
          if(size)this.bytes.set(data.subarray(0,size),this.userRange(this.r.B,size,"write"));
          return ok(size);
        }
        case SYSCALLS.SCANNER_OPEN:
          /* A PCOS binary asks its host computer to expose the radio panel.
           * The callback is registered only by the active SystemScene, so
           * running scanner.bin outside a system cannot fabricate survey data. */
          return this.system?.openSystemScanner?.()?ok(0):fail(SYSCALL_ERRORS.NOT_SUPPORTED);
        /* --- сетевые сисколлы (0x56–0x5A) ---
         * Ядро assembly получает через эти сисколлы доступ к симулируемому
         * сетевому оборудованию (Ethernet, устройства). Пользовательские
         * программы вызывают SYS_NET_*, ядро транслирует в JS-бридж.
         * Все протоколы выше Ethernet (ARP, IP, UDP, TCP, DHCP, DNS)
         * реализуются на assembly в ядре. */
        case SYSCALLS.NET_INFO: {
          /* B=device_buf_ptr, C=device_buf_bytes — список сетевых устройств.
           * Каждый элемент: kind(u8), mac(6 байт), ports(u8), powered(u8).
           * Ядро читает этот список при инициализации сетевой подсистемы. */
          const data = this.system?.netInfo?.();
          if (!data) return fail(SYSCALL_ERRORS.NOT_SUPPORTED);
          const size = Math.min(data.length, Math.max(0, this.r.C));
          if (size) this.bytes.set(data.subarray(0, size), this.userRange(this.r.B, size, "write"));
          return ok(size);
        }
        case SYSCALLS.NET_LINK_STATUS: {
          /* B=mac_ptr — указатель на 6-байтный MAC в user memory.
           * Возвращает A=1 если устройство подключено к коммутатору, иначе 0. */
          const mac = this.bytes.subarray(this.userRange(this.r.B, 6, "read"), this.userRange(this.r.B, 6, "read") + 6);
          const status = this.system?.netLinkStatus?.(mac);
          return status !== undefined ? ok(status ? 1 : 0) : fail(SYSCALL_ERRORS.NOT_SUPPORTED);
        }
        case SYSCALLS.NET_SEND: {
          /* B=src_mac_ptr (6 байт), C=dst_mac_ptr (6 байт), D=frame_ptr.
           * Фрейм хранится как: [2 байта длина, N байт данные].
           * Отправляет Ethernet-фрейм в симулированную сеть. */
          const srcMac = this.bytes.subarray(this.userRange(this.r.B, 6, "read"), this.userRange(this.r.B, 6, "read") + 6);
          const dstMac = this.bytes.subarray(this.userRange(this.r.C, 6, "read"), this.userRange(this.r.C, 6, "read") + 6);
          const framePtr = this.userRange(this.r.D, 2, "read");
          const length = this.view.getUint16(framePtr, true);
          const data = this.bytes.subarray(framePtr + 2, framePtr + 2 + length);
          const result = this.system?.netSend?.(srcMac, dstMac, data);
          return result?.ok ? ok(result.bytesSent || length) : fail(SYSCALL_ERRORS.IO);
        }
        case SYSCALLS.NET_RECV: {
          /* B=mac_ptr (6 байт), C=buf_ptr, D=buf_bytes.
           * Читает один входящий фрейм для устройства с данным MAC.
           * Формат фрейма в буфере: [2 байта src_mac_offset(не используется), 2 байта длина, N байт данные].
           * Возвращает A=количество прочитанных байт (0 если фреймов нет). */
          const mac = this.bytes.subarray(this.userRange(this.r.B, 6, "read"), this.userRange(this.r.B, 6, "read") + 6);
          const maxLen = Math.max(0, this.r.D);
          if (maxLen < 4) return fail(SYSCALL_ERRORS.INVALID);
          const frame = this.system?.netRecv?.(mac);
          if (!frame || !frame.data || frame.data.length === 0) return ok(0);
          const totalLen = Math.min(4 + frame.data.length, maxLen);
          const out = this.userRange(this.r.C, totalLen, "write");
          this.view.setUint16(out, 0, true);                  // резерв (смещение src MAC)
          this.view.setUint16(out + 2, frame.data.length, true); // длина данных
          if (totalLen > 4) this.bytes.set(frame.data.subarray(0, totalLen - 4), out + 4);
          return ok(totalLen);
        }
        case SYSCALLS.NET_DEVICE_IO: {
          /* B=mac_ptr (6 байт), C=cmd (u32), D=data_ptr.
           * Команды ввода-вывода для устройств (сканер, антенна, коммутатор).
           * cmd: 1=статус, 2=сканирование, 3=конфигурация DHCP, 4=конфигурация DNS.
           * data_ptr указывает на структуру в user memory. */
          const mac = this.bytes.subarray(this.userRange(this.r.B, 6, "read"), this.userRange(this.r.B, 6, "read") + 6);
          const cmd = this.r.C | 0;
          const dataPtr = this.r.D ? this.userRange(this.r.D, 256, "read") : 0; // максимум 256 байт данных
          let payload = null;
          if (dataPtr) {
            const dataLen = Math.min(256, this.view.getUint16(dataPtr, true) || 256);
            payload = this.bytes.subarray(dataPtr + 2, dataPtr + 2 + dataLen);
          }
          const result = this.system?.netDeviceIO?.(mac, cmd, payload);
          if (!result) return fail(SYSCALL_ERRORS.NOT_SUPPORTED);
          if (!result.ok) return fail(result.errno ? -result.errno : SYSCALL_ERRORS.IO);
          // Записываем ответные данные, если есть
          if (result.data && this.r.D) {
            const outPtr = this.userRange(this.r.D, Math.min(result.data.length + 2, 258), "write");
            this.view.setUint16(outPtr, result.data.length, true);
            this.bytes.set(result.data.subarray(0, Math.min(result.data.length, 256)), outPtr + 2);
          }
          return ok(result.status || 0);
        }
        case SYSCALLS.GFX_PIXEL:
          this.terminal?.pixel(this.r.A,this.r.B,this.terminal?.fg);return ok(0);
        case SYSCALLS.GFX_LINE:
          this.terminal?.line(this.r.A,this.r.B,this.r.C,this.r.D,this.terminal?.fg);return ok(0);
        case SYSCALLS.GFX_RECT:
          this.terminal?.rect(this.r.A,this.r.B,this.r.C,this.r.D,this.terminal?.fg,false);return ok(0);
        case SYSCALLS.GFX_CIRCLE:
          this.terminal?.circle(this.r.A,this.r.B,this.r.C,this.terminal?.fg,!!this.r.D);return ok(0);
        case SYSCALLS.GFX_BEGIN:
          this.terminal?.beginAnimation();return ok(0);
        case SYSCALLS.GFX_FRAME:
          this.terminal?.animationFrame(this.r.A);return ok(0);
        case SYSCALLS.GFX_END:
          this.terminal?.endAnimation();return ok(0);
        case SYSCALLS.GFX_TEXT: {
          const text=this.userText(this.r.C,this.r.D);
          this.terminal?.text(this.r.A,this.r.B,text,this.terminal?.fg);
          return ok(this.r.D);
        }
        case SYSCALLS.INPUT_KEY: {
          const key=this.terminal?.readKey();
          return ok(key?.keyCode||0);
        }
        case SYSCALLS.INPUT_MOUSE_X:return ok(this.terminal?.mouse.x||0);
        case SYSCALLS.INPUT_MOUSE_Y:return ok(this.terminal?.mouse.y||0);
        case SYSCALLS.INPUT_MOUSE_BUTTONS:return ok(this.terminal?.mouse.buttons||0);
        case SYSCALLS.INPUT_MOUSE_WHEEL:return ok(this.terminal?.readWheel()||0);
        default:return fail();
      }
    }catch(error){
      if(error instanceof CPUFault)
        return fail(SYSCALL_ERRORS.BAD_ADDRESS);
      throw error;
    }
  }
  systemCall(number,returnPC=this.r.PC){
    if(!Number.isInteger(number)||number<0)
      return {A:-1,B:this.r.B,C:this.r.C,D:SYSCALL_ERRORS.INVALID};
    if(this.r.MODE==="real"){
      const result=this.executeSystemCall(number);
      Object.assign(this.r,result);this.setZ(result.A);return result;
    }
    if(this.r.MODE!=="user")
      throw new CPUFault(PROTECTED_EXCEPTIONS.PRIVILEGE_FAULT,number,
        "SYSCALL can only be issued from user mode");
    this.dispatchFault(new CPUFault(PROTECTED_EXCEPTIONS.SYSCALL,number,"system call"),returnPC);
    if(this.system?.kernelManagedSyscalls)return null;
    const frame=this.r.KSP,result=this.executeSystemCall(number);
    this.view.setInt32(frame+CONTEXT_LAYOUT.A,result.A,true);
    this.view.setInt32(frame+CONTEXT_LAYOUT.B,result.B,true);
    this.view.setInt32(frame+CONTEXT_LAYOUT.C,result.C,true);
    this.view.setInt32(frame+CONTEXT_LAYOUT.D,result.D,true);
    const flags=this.view.getInt32(frame+CONTEXT_LAYOUT.FLAGS,true);
    this.view.setInt32(frame+CONTEXT_LAYOUT.FLAGS,
      result.A===0?flags|CONTEXT_FLAGS.Z:flags&~CONTEXT_FLAGS.Z,true);
    this.interruptReturn();
    return result;
  }
  vec(name, line){
    const index = Number(String(name).toUpperCase().replace(/^V/,""));
    if (!Number.isInteger(index) || index < 0 || index > 7) throw new Error(`строка ${line}: неверный регистр ${name}`);
    return index;
  }
  setZ(value){ this.r.Z = value === 0; return value; }
  push(value){
    this.r.SP-=4;
    if(this.r.MODE==="user"&&this.protection&&this.r.SP<this.protection.stackBase)
      throw new CPUFault(PROTECTED_EXCEPTIONS.STACK_FAULT,this.r.SP,"user stack overflow");
    this.view.setInt32(this.addr(this.r.SP,4,"stack"),value|0,true);
  }
  pop(){
    if(this.r.MODE==="user"&&this.protection&&this.r.SP+4>this.r.ULIMIT)
      throw new CPUFault(PROTECTED_EXCEPTIONS.STACK_FAULT,this.r.SP,"user stack underflow");
    const at = this.addr(this.r.SP,4,"stack");
    const value = this.view.getInt32(at, true);
    this.r.SP += 4;
    return value;
  }
  readVector(address){
    const a=this.addr(address,16);
    return new Vector4(...[0,4,8,12].map(x=>this.view.getFloat32(a+x,true)));
  }
  writeVector(address,v){
    const a=this.addr(address,16,"write");
    [v.x,v.y,v.z,v.w].forEach((x,i)=>this.view.setFloat32(a+i*4,x,true));
  }
  run(program, maxSteps=100000, reset=true, options={}){
    if(reset){
      this.reset();
      for(const segment of program.dataWrites||[]){
        const start=this.addr(segment.address,segment.data.length);
        this.bytes.set(segment.data,start);
      }
    }
    let steps=0, halted=false, yielded=false, preempted=false, bootFile=null;
    while (!halted && (this.r.MODE==="user"||
      (this.r.PC >= 0 && this.r.PC < program.length))){
      if(steps>=maxSteps){
        if(!options.preempt)throw new Error(`превышен лимит ${maxSteps} инструкций`);
        if(this.r.MODE==="user"&&this.r.IE)
          this.dispatchFault(new CPUFault(PROTECTED_EXCEPTIONS.TIMER,0,"timer quantum"),this.r.PC);
        preempted=true;break;
      }
      steps++;
      const faultPC=this.r.PC;
      try{this.validateExecute(faultPC);}
      catch(error){
        if(error instanceof CPUFault){this.dispatchFault(error,faultPC);continue;}
        throw error;
      }
      const ins=program[this.r.PC++], a=ins.args, n=i=>{
        const name=String(a[i]).toUpperCase();
        return ["A","B","C","D","FA","FB","FC","FD"].includes(name)
          ? this.r[name] : number(a[i],ins.line);
      };
      const bin=(fn)=>this.setZ(fn(this.r.A,this.r.B)|0);
      const vbin=(fn)=>{
        const d=this.vec(a[0],ins.line), s=this.vec(a[1],ins.line);
        this.r.V[d]=this.r.V[d].map((x,i)=>fn(x,[this.r.V[s].x,this.r.V[s].y,this.r.V[s].z,this.r.V[s].w][i]));
      };
      try {
      if(this.r.MODE==="user"&&PRIVILEGED_LEGACY_OPS.has(ins.op))this.requireKernel();
      switch(ins.op){
        case "LOAD_A": this.r.A=this.setZ(n(0)|0); break; case "LOAD_B": this.r.B=n(0)|0; break;
        case "LOAD_C": this.r.C=n(0)|0; break; case "LOAD_D": this.r.D=n(0)|0; break;
        case "MOV_A_B": this.r.A=this.setZ(this.r.B); break; case "MOV_A_C": this.r.A=this.setZ(this.r.C); break;
        case "MOV_A_D": this.r.A=this.setZ(this.r.D); break; case "MOV_B_A": this.r.B=this.r.A; break;
        case "MOV_C_A": this.r.C=this.r.A; break; case "MOV_D_A": this.r.D=this.r.A; break;
        case "LOAD_M_A": this.r.A=this.setZ(this.bytes[this.addr(n(0))]); break;
        case "LOAD_M_B": this.r.B=this.bytes[this.addr(n(0))]; break;
        case "STORE_A": this.bytes[this.addr(n(0),1,"write")]=this.r.A; break; case "STORE_B": this.bytes[this.addr(n(0),1,"write")]=this.r.B; break;
        case "ADD_A_B": this.r.A=bin((x,y)=>x+y); break; case "ADD_A_C": this.r.A=this.setZ((this.r.A+this.r.C)|0); break;
        case "SUB_A_B": this.r.A=bin((x,y)=>x-y); break; case "SUB_A_C": this.r.A=this.setZ((this.r.A-this.r.C)|0); break;
        case "MUL_A_B": this.r.A=bin((x,y)=>x*y); break;
        case "DIV_A_B": if(!this.r.B) throw new Error("деление на ноль"); this.r.A=this.setZ(Math.trunc(this.r.A/this.r.B)); break;
        case "AND_A_B": this.r.A=bin((x,y)=>x&y); break; case "OR_A_B": this.r.A=bin((x,y)=>x|y); break;
        case "XOR_A_B": this.r.A=bin((x,y)=>x^y); break; case "CMP_A_B": this.setZ(this.r.A-this.r.B); break;
        case "INC_A": this.r.A=this.setZ((this.r.A+1)|0); break; case "DEC_A": this.r.A=this.setZ((this.r.A-1)|0); break;
        case "JMP": this.r.PC=n(0); break; case "JZ": if(this.r.Z)this.r.PC=n(0); break;
        case "JNZ": if(!this.r.Z)this.r.PC=n(0); break;
        case "CALL": this.callStack.push(this.r.PC); this.r.PC=n(0); break;
        case "RET": if(!this.callStack.length)throw new Error("RET без CALL"); this.r.PC=this.callStack.pop(); break;
        case "PUSH_A": this.push(this.r.A); break; case "POP_A": this.r.A=this.setZ(this.pop()); break; case "NOP": break;
        case "LOAD_F": this.r.FA=n(0); break; case "LOAD_FB": this.r.FB=n(0); break;
        case "LOAD_FC": this.r.FC=n(0); break; case "LOAD_FD": this.r.FD=n(0); break;
        case "ITOF": this.r.FA=this.r.A; break; case "FTOI": this.r.A=this.setZ(Math.trunc(this.r.FA)); break;
        case "FADD_FA_FB": this.r.FA+=this.r.FB; break; case "FSUB_FA_FB": this.r.FA-=this.r.FB; break;
        case "FMUL_FA_FB": this.r.FA*=this.r.FB; break;
        case "FDIV_FA_FB": if(!this.r.FB)throw new Error("деление на ноль"); this.r.FA/=this.r.FB; break;
        case "FCMP_FA_FB": this.setZ(this.r.FA-this.r.FB); break; case "FABS_FA": this.r.FA=Math.abs(this.r.FA); break;
        case "FNEG_FA": this.r.FA=-this.r.FA; break; case "FSQRT_FA": this.r.FA=Math.sqrt(this.r.FA); break;
        case "FSIN_FA": this.r.FA=Math.sin(this.r.FA); break; case "FCOS_FA": this.r.FA=Math.cos(this.r.FA); break;
        case "FLOOR_FA": this.r.FA=Math.floor(this.r.FA); break; case "FCEIL_FA": this.r.FA=Math.ceil(this.r.FA); break;
        case "FROUND_FA": this.r.FA=Math.round(this.r.FA); break;
        case "VSET": { const d=this.vec(a[0],ins.line); this.r.V[d]=new Vector4(n(1),n(2),n(3),n(4)); break; }
        case "VLOAD": this.r.V[this.vec(a[0],ins.line)]=this.readVector(n(1)); break;
        case "VSTORE": this.writeVector(n(1),this.r.V[this.vec(a[0],ins.line)]); break;
        case "VMOV": this.r.V[this.vec(a[0],ins.line)]=this.r.V[this.vec(a[1],ins.line)].clone(); break;
        case "VADD": vbin((x,y)=>x+y); break; case "VSUB": vbin((x,y)=>x-y); break;
        case "VMUL": vbin((x,y)=>x*y); break; case "VDIV": vbin((x,y)=>y?x/y:0); break;
        case "VDOT": { const x=this.r.V[this.vec(a[0],ins.line)],y=this.r.V[this.vec(a[1],ins.line)]; this.r.FA=x.x*y.x+x.y*y.y+x.z*y.z+x.w*y.w; break; }
        case "VCROSS": { const d=this.vec(a[0],ins.line),x=this.r.V[d],y=this.r.V[this.vec(a[1],ins.line)]; this.r.V[d]=new Vector4(x.y*y.z-x.z*y.y,x.z*y.x-x.x*y.z,x.x*y.y-x.y*y.x,0); break; }
        case "VNORM": { const d=this.vec(a[0],ins.line),v=this.r.V[d],l=Math.hypot(v.x,v.y,v.z,v.w)||1; this.r.V[d]=v.map(x=>x/l); break; }
        case "VLEN": { const v=this.r.V[this.vec(a[0],ins.line)]; this.r.FA=Math.hypot(v.x,v.y,v.z,v.w); break; }
        case "VLERP": { const d=this.vec(a[0],ins.line),v=this.r.V[d],b=this.r.V[this.vec(a[1],ins.line)]; this.r.V[d]=v.map((x,i)=>x+([b.x,b.y,b.z,b.w][i]-x)*this.r.FA); break; }
        case "VSCALE": { const d=this.vec(a[0],ins.line); this.r.V[d]=this.r.V[d].map(x=>x*this.r.FA); break; }
        case "VNEG": { const d=this.vec(a[0],ins.line); this.r.V[d]=this.r.V[d].map(x=>-x); break; }
        case "VABS": { const d=this.vec(a[0],ins.line); this.r.V[d]=this.r.V[d].map(Math.abs); break; }
        case "VSPLAT": this.r.V[this.vec(a[0],ins.line)]=new Vector4(this.r.FA,this.r.FA,this.r.FA,this.r.FA); break;
        case "VSUM": { const v=this.r.V[this.vec(a[0],ins.line)]; this.r.FA=v.x+v.y+v.z+v.w; break; }
        case "VAVG": { const v=this.r.V[this.vec(a[0],ins.line)]; this.r.FA=(v.x+v.y+v.z+v.w)/4; break; }
        case "PRINT": { const value=JSON.parse(a.join(" ")); this.output(value); this.terminal?.print(value); break; }
        case "PRINT_A": this.output(String(this.r.A)); this.terminal?.print(this.r.A); break;
        case "PRINT_FA": this.output(String(this.r.FA)); this.terminal?.print(this.r.FA); break;
        case "PRINT_V": { const value=this.r.V[this.vec(a[0],ins.line)].toString(); this.output(value); this.terminal?.print(value); break; }
        case "TERM_MODE": if(!this.terminal)throw new Error("терминал не подключён"); this.terminal.setMode(String(a[0]).toLowerCase()); break;
        case "TERM_CLEAR": this.terminal?.clear(); break;
        case "TERM_COLOR": if(!this.terminal)throw new Error("терминал не подключён"); this.terminal.setColors(n(0),a[1]===undefined?this.terminal.bg:n(1)); break;
        case "GFX_PIXEL": this.terminal?.pixel(n(0),n(1),n(2)); break;
        case "GFX_LINE": this.terminal?.line(n(0),n(1),n(2),n(3),n(4)); break;
        case "GFX_RECT": this.terminal?.rect(n(0),n(1),n(2),n(3),n(4),!!n(5)); break;
        case "GFX_CIRCLE": this.terminal?.circle(n(0),n(1),n(2),n(3),!!n(4)); break;
        case "GFX_BEGIN": if(!this.terminal)throw new Error("терминал не подключён"); this.terminal.beginAnimation(); break;
        case "GFX_FRAME": if(!this.terminal)throw new Error("терминал не подключён"); this.terminal.animationFrame(n(0)); break;
        case "GFX_END": if(!this.terminal)throw new Error("терминал не подключён"); this.terminal.endAnimation(); break;
        case "IN_KEY": { const key=this.terminal?.readKey(); this.r.A=this.setZ(key?.keyCode||0); break; }
        case "IN_CHAR": { const key=this.terminal?.readKey(); this.r.A=this.setZ(key?.key?.codePointAt(0)||0); break; }
        case "IN_MOUSE_X": this.r.A=this.setZ(this.terminal?.mouse.x||0); break;
        case "IN_MOUSE_Y": this.r.A=this.setZ(this.terminal?.mouse.y||0); break;
        case "IN_MOUSE_BUTTONS": this.r.A=this.setZ(this.terminal?.mouse.buttons||0); break;
        case "IN_MOUSE_WHEEL": this.r.A=this.setZ(this.terminal?.readWheel()||0); break;
        case "SYS_TIME": {
          const value=this.system?.time?.() || new Date().toLocaleTimeString("ru-RU");
          this.output(value); this.terminal?.print(value); break;
        }
        case "HW_LIST": for(const value of this.system?.hardware?.() || []){ this.output(value); this.terminal?.print(value); } break;
        case "SLOT_LIST": for(const value of this.system?.slots?.() || []){ this.output(value); this.terminal?.print(value); } break;
        case "PORT_LIST": for(const value of this.system?.ports?.() || []){ this.output(value); this.terminal?.print(value); } break;
        case "BOOT": bootFile=JSON.parse(a.join(" ")); halted=true; break;
        case "OS_PID": this.r.A=this.setZ(this.system?.pid?.()||0); break;
        case "IPC_SEND": this.system?.ipcSend?.(this.r.A,this.r.B); this.setZ(0); break;
        case "IPC_RECV": {
          const message=this.system?.ipcReceive?.();
          this.r.A=message?.from||0;this.r.B=Number(message?.data)||0;this.setZ(message?1:0);break;
        }
        case "LOAD8_A_B": this.r.A=this.setZ(this.bytes[this.addr(this.r.B)]); break;
        case "STORE8_A_B": this.bytes[this.addr(this.r.B,1,"write")]=this.r.A; break;
        case "LOAD32_A_B": this.r.A=this.setZ(this.view.getInt32(this.addr(this.r.B,4),true)); break;
        case "STORE32_A_B": this.view.setInt32(this.addr(this.r.B,4,"write"),this.r.A,true); break;
        case "INC_B": this.r.B=(this.r.B+1)|0; break;
        case "DEC_B": this.r.B=(this.r.B-1)|0; break;
        case "ADD_B_C": this.r.B=(this.r.B+this.r.C)|0; break;
        case "MEM_COPY": {
          const src=this.addr(this.r.B,this.r.D),dst=this.addr(this.r.C,this.r.D,"write");
          this.bytes.copyWithin(dst,src,src+this.r.D);break;
        }
        case "MEM_CMP": {
          const left=this.addr(this.r.B,this.r.D),right=this.addr(this.r.C,this.r.D);
          let diff=0;for(let i=0;i<this.r.D&&!diff;i++)diff=this.bytes[left+i]-this.bytes[right+i];
          this.r.A=this.setZ(diff);break;
        }
        case "FS_LIST": {
          const data=this.system?.fsList?.()||new Uint8Array();
          const size=Math.min(data.length,this.r.C);this.bytes.set(data.subarray(0,size),this.addr(this.r.B,size,"write"));
          this.r.A=this.setZ(size);break;
        }
        case "FS_READ": {
          const nameAt=this.addr(this.r.B,this.r.C);
          const name=textDecoder.decode(this.bytes.subarray(nameAt,nameAt+this.r.C));
          const data=this.system?.fsRead?.(name);if(!data){this.r.A=this.setZ(-1);break;}
          const available=this.r.MODE==="user"?this.r.ULIMIT-this.r.D:this.bytes.length-this.r.D;
          const size=Math.max(0,Math.min(data.length,available));
          this.bytes.set(data.subarray(0,size),this.addr(this.r.D,size,"write"));
          this.r.A=this.setZ(size);break;
        }
        case "FS_WRITE": {
          const length=this.r.A,nameAt=this.addr(this.r.B,this.r.C);
          const name=textDecoder.decode(this.bytes.subarray(nameAt,nameAt+this.r.C));
          const dataAt=this.addr(this.r.D,length),data=this.bytes.slice(dataAt,dataAt+length);
          this.system?.fsWrite?.(name,data);this.r.A=this.setZ(length);break;
        }
        case "FS_DELETE": {
          const at=this.addr(this.r.B,this.r.C);
          const name=textDecoder.decode(this.bytes.subarray(at,at+this.r.C));
          this.r.A=this.setZ(this.system?.fsDelete?.(name)?1:0);break;
        }
        case "YIELD": yielded=true;halted=true;break;
        case "TTY_READLINE": {
          const line=this.terminal?.readLine?.();
          if(line===null||line===undefined){this.r.A=this.setZ(0);break;}
          const data=textEncoder.encode(line),size=Math.min(data.length,this.r.C);
          this.bytes.set(data.subarray(0,size),this.addr(this.r.B,size,"write"));this.r.A=this.setZ(size);break;
        }
        case "PROC_EXEC": {
          const at=this.addr(this.r.B,this.r.C);
          const name=textDecoder.decode(this.bytes.subarray(at,at+this.r.C));
          this.r.A=this.setZ(this.system?.procExec?.(name)||-1);break;
        }
        case "PROC_LIST": {
          const data=this.system?.procList?.()||new Uint8Array(),size=Math.min(data.length,this.r.C);
          this.bytes.set(data.subarray(0,size),this.addr(this.r.B,size,"write"));this.r.A=this.setZ(size);break;
        }
        case "PROC_KILL": this.r.A=this.setZ(this.system?.procKill?.(this.r.A)?1:0);break;
        case "MEM_INFO": {
          const info=this.system?.memInfo?.()||{free:0,total:this.bytes.length};
          this.r.A=this.setZ(info.free);this.r.B=info.total;break;
        }
        case "STR_TOKEN": {
          const virtualStart=this.r.B,start=this.addr(virtualStart,this.r.C),end=start+this.r.C,index=this.r.D;
          let at=start,current=0,found=false;
          while(at<end){
            while(at<end&&this.bytes[at]<=32)at++;
            const tokenStart=at;while(at<end&&this.bytes[at]>32)at++;
            if(tokenStart<at){
              if(current===index){this.r.B=virtualStart+tokenStart-start;this.r.A=this.setZ(at-tokenStart);found=true;break;}
              current++;
            }
          }
          if(!found)this.r.A=this.setZ(0);
          break;
        }
        case "STR_HASH": {
          const start=this.addr(this.r.B,this.r.C);let hash=0x811c9dc5;
          for(let i=0;i<this.r.C;i++){hash^=this.bytes[start+i];hash=Math.imul(hash,0x01000193);}
          this.r.A=this.setZ(hash|0);break;
        }
        case "STR_TO_INT": {
          const at=this.addr(this.r.B,this.r.C);
          const text=textDecoder.decode(this.bytes.subarray(at,at+this.r.C));
          const value=Number.parseInt(text.trim(),0);
          this.r.A=this.setZ(Number.isFinite(value)?value:0);break;
        }
        case "TTY_WRITE": {
          const at=this.addr(this.r.B,this.r.C);
          const text=textDecoder.decode(this.bytes.subarray(at,at+this.r.C));
          this.output(text);this.terminal?.print(text);break;
        }
        case "LEX_TOKEN": {
          const virtualStart=this.r.B,virtualEnd=this.r.C;
          if(virtualEnd<virtualStart)throw new Error("неверный диапазон lexer");
          const physicalStart=this.addr(virtualStart,0),end=this.addr(virtualEnd,0);
          let at=physicalStart;
          for(;;){
            while(at<end&&this.bytes[at]<=32)at++;
            if(at<end&&this.bytes[at]===59){
              while(at<end&&this.bytes[at]!==10)at++;
              continue;
            }
            break;
          }
          if(at>=end){
            this.r.B=virtualEnd;this.r.D=virtualEnd;this.r.A=this.setZ(0);break;
          }
          const start=at;
          if(this.bytes[at]===34){
            at++;
            while(at<end){
              if(this.bytes[at]===92){at+=2;continue;}
              if(this.bytes[at++]===34)break;
            }
          }else while(at<end&&this.bytes[at]>32&&this.bytes[at]!==59)at++;
          this.r.B=virtualStart+start-physicalStart;
          this.r.D=virtualStart+at-physicalStart;
          this.r.FA=at<end?this.bytes[at]:0;
          this.r.A=this.setZ(at-start);break;
        }
        case "CMP_A_D": this.setZ(this.r.A-this.r.D);break;
        case "ADD_B_D": this.r.B=(this.r.B+this.r.D)|0;break;
        case "MOV_C_B": this.r.C=this.r.B;break;
        case "MOV_B_C": this.r.B=this.r.C;break;
        case "STORE64_FA_B": this.view.setFloat64(this.addr(this.r.B,8,"write"),this.r.FA,true);break;
        case "MOV_B_D": this.r.B=this.r.D;break;
        case "SUB_A_D": this.r.A=this.setZ((this.r.A-this.r.D)|0);break;
        case "STORE16_A_B": this.view.setUint16(this.addr(this.r.B,2,"write"),this.r.A&0xffff,true);break;
        case "STR_IS_NUMBER": {
          const at=this.addr(this.r.B,this.r.C);
          const text=textDecoder.decode(this.bytes.subarray(at,at+this.r.C));
          this.r.A=this.setZ(text.trim()!==""&&Number.isFinite(Number(text))?1:0);break;
        }
        case "PM_ENABLE":
          this.requireKernel();this.r.MODE="kernel";break;
        case "PM_DISABLE":
          this.requireKernel();this.r.MODE="real";this.r.IE=false;break;
        case "SET_UBASE":
          this.requireKernel();
          if(this.r.A<0||this.r.A+this.r.ULIMIT>this.bytes.length)
            throw new CPUFault(PROTECTED_EXCEPTIONS.MEMORY_FAULT,this.r.A,"invalid UBASE");
          this.r.UBASE=this.r.A;break;
        case "SET_ULIMIT":
          this.requireKernel();
          if(this.r.A<0||this.r.UBASE+this.r.A>this.bytes.length)
            throw new CPUFault(PROTECTED_EXCEPTIONS.MEMORY_FAULT,this.r.A,"invalid ULIMIT");
          this.r.ULIMIT=this.r.A;break;
        case "SET_KSP":
          this.requireKernel();this.kernelRange(this.r.A,0);this.r.KSP=this.r.A;break;
        case "SET_IVT":
          this.requireKernel();this.kernelRange(this.r.A,256);this.r.IVT=this.r.A;break;
        case "ENTER_USER":
          this.requireKernel();this.enterUserMode(this.r.A,this.r.B);break;
        case "SYSCALL":
          this.systemCall(n(0),this.r.PC);
          if(this.requestYield){this.requestYield=false;yielded=true;halted=true;}
          break;
        case "IRET":
          this.interruptReturn();break;
        case "CLI":
          this.requireKernel();this.r.IE=false;break;
        case "STI":
          this.requireKernel();this.r.IE=true;break;
        case "KGET_FAULT":
          this.requireKernel();this.r.A=this.setZ(this.r.FAULT_ADDR|0);break;
        case "KGET_ARG": {
          this.requireKernel();
          const index=n(0),offset=[
            CONTEXT_LAYOUT.A,CONTEXT_LAYOUT.B,CONTEXT_LAYOUT.C,CONTEXT_LAYOUT.D
          ][index];
          if(offset===undefined)
            throw new CPUFault(PROTECTED_EXCEPTIONS.INVALID_OPCODE,index,"invalid syscall argument index");
          this.r.A=this.setZ(this.view.getInt32(this.r.KSP+offset,true));
          break;
        }
        case "KCALL_HOST": {
          this.requireKernel();
          if(this.r.CAUSE!==PROTECTED_EXCEPTIONS.SYSCALL)
            throw new CPUFault(PROTECTED_EXCEPTIONS.PRIVILEGE_FAULT,this.r.CAUSE,
              "KCALL_HOST outside syscall trap");
          const result=this.executeSystemCall(this.r.FAULT_ADDR);
          Object.assign(this.r,result);this.setZ(result.A);
          // Host calls issued by the protected kernel may request a scheduler
          // yield as well.  Honour it here just as the user-mode SYSCALL path
          // does, otherwise a waiting shell can spin before its child runs.
          if(this.requestYield){this.requestYield=false;yielded=true;halted=true;}
          break;
        }
        case "SYSRET": {
          this.requireKernel();
          if(this.r.CAUSE!==PROTECTED_EXCEPTIONS.SYSCALL)
            throw new CPUFault(PROTECTED_EXCEPTIONS.INVALID_IRET,this.r.KSP,
              "SYSRET outside syscall trap");
          const frame=this.r.KSP;
          for(const [name,offset] of Object.entries({
            A:CONTEXT_LAYOUT.A,B:CONTEXT_LAYOUT.B,C:CONTEXT_LAYOUT.C,D:CONTEXT_LAYOUT.D
          }))this.view.setInt32(frame+offset,this.r[name]|0,true);
          const flags=this.view.getInt32(frame+CONTEXT_LAYOUT.FLAGS,true);
          this.view.setInt32(frame+CONTEXT_LAYOUT.FLAGS,
            this.r.A===0?flags|CONTEXT_FLAGS.Z:flags&~CONTEXT_FLAGS.Z,true);
          this.interruptReturn();break;
        }
        case "HALT": halted=true; break;
      }
      } catch(error){
        if(error instanceof CPUFault){
          this.dispatchFault(error,faultPC);
          continue;
        }
        throw error;
      }
    }
    return { steps, registers:this.dumpRegisters(), bootFile, yielded,preempted,
      halted:!yielded&&!preempted&&(halted || this.r.PC<0 || this.r.PC>=program.length) };
  }
  dumpRegisters(){
    return `A=${this.r.A} B=${this.r.B} C=${this.r.C} D=${this.r.D}\n` +
      `FA=${this.r.FA} FB=${this.r.FB} PC=${this.r.PC} SP=${this.r.SP}\n` +
      `MODE=${this.r.MODE} UBASE=${this.r.UBASE} ULIMIT=${this.r.ULIMIT} KSP=${this.r.KSP} IVT=${this.r.IVT} IE=${Number(this.r.IE)}\n` +
      `V0=${this.r.V[0]} V1=${this.r.V[1]}`;
  }
}

class BiosSetupSession {
  constructor(runtime,terminal){
    this.runtime=runtime;this.terminal=terminal;this.closed=false;this.confirmSave=false;
    const settings=runtime.computer.firmware.settings;
    this.draft={...settings};
    const selected=runtime.bootDevices().findIndex(device=>device.id===settings.bootDevice);
    this.selected=Math.max(0,selected);
    this.render();
  }
  get devices(){ return this.runtime.bootDevices(); }
  get dirty(){ return this.draft.bootDevice!==this.runtime.computer.firmware.settings.bootDevice ||
    this.draft.bootFile!==this.runtime.computer.firmware.settings.bootFile; }
  render(){
    const terminal=this.terminal;if(!terminal)return;
    terminal.setMode?.("text");terminal.setColors?.(0x7ee08a,0x000000);terminal.clear?.();
    const write=line=>terminal.print?.(line);
    write("PIXEL COSMOS BIOS SETUP");
    write("NVRAM: " + this.runtime.computer.firmware.biosSource.length + " B firmware");
    write("CPU: " + (this.runtime.parts.cpu?.name || "не установлен") +
      " · " + this.runtime.threads + " поток(а)");
    write("RAM: " + (this.runtime.parts.ram?.name || "не установлена") +
      " · " + this.runtime.ramBytes/1024 + " КБ");
    write("СЛОТЫ:");
    for(const slot of this.runtime.computer.slotDefs)
      write(`  ${slot.name}: ${this.runtime.parts[slot.id]?.name || "пусто"}`);
    write("");write("ЗАГРУЗОЧНЫЙ НОСИТЕЛЬ:");
    if(!this.devices.length)write("  Нет установленного загрузочного носителя");
    this.devices.forEach((device,index)=>write(`${index===this.selected?">":" "} ${device.name}`));
    if(this.confirmSave){
      write("");write("Сохранить изменения в NVRAM? Enter/Y — да, Esc/N — нет");
    }else{
      write("");write("↑/↓ — выбрать · Enter — назначить · Esc — выйти");
    }
  }
  handleKey(key){
    if(this.closed)return true;
    const code=key?.code || key?.key;
    if(this.confirmSave){
      if(code==="Enter" || key?.key?.toLowerCase()==="y")return this.finish(true);
      if(code==="Escape" || key?.key?.toLowerCase()==="n")return this.finish(false);
      return true;
    }
    if(code==="ArrowUp" && this.devices.length){
      this.selected=(this.selected+this.devices.length-1)%this.devices.length;this.render();return true;
    }
    if(code==="ArrowDown" && this.devices.length){
      this.selected=(this.selected+1)%this.devices.length;this.render();return true;
    }
    if(code==="Enter"){
      const device=this.devices[this.selected];if(device)this.draft.bootDevice=device.id;
      this.render();return true;
    }
    if(code==="Escape"){
      this.confirmSave=true;this.render();
      return true;
    }
    return true;
  }
  finish(save){
    this.closed=true;
    if(save)this.runtime.computer.firmware.saveSettings(this.draft);
    this.runtime.biosSession=null;
    this.runtime.lastBoot=this.runtime.bootFromFirmware(this.terminal);
    return true;
  }
}

/** Interactive front-end for installer.bin. Raw PCFD copying remains an
 * atomic media operation; this session owns only the user's choices. */
class InstallerSession {
  constructor(runtime,terminal,source){
    this.runtime=runtime;this.terminal=terminal;this.source=source;this.state="target";
    this.targets=runtime.bootDevices().filter(device=>device.storage!==source.storage);
    this.selected=0;this.rootPassword="";this.guest=true;this.error="";this.result=null;
    this.render();
  }
  render(){
    const terminal=this.terminal;if(!terminal)return;
    terminal.setMode?.("text");terminal.setColors?.(0x7ee08a,0);terminal.clear?.();
    const write=value=>terminal.print?.(value);
    write("PCOS INSTALLER 1.0");
    write(`RAM ${this.runtime.ramBytes/1024} КБ · package ${Math.round((this.source.storage.totalBytes?.()||0)/1024)} КБ`);
    if(this.state==="target"){
      write("");write("Выберите target DRIVE (↑/↓, Enter):");
      if(!this.targets.length)write("  Нет другого установленного накопителя");
      this.targets.forEach((target,index)=>write(`${index===this.selected?">":" "} ${target.name} · ${target.storage.ramKb} КБ`));
    }else if(this.state==="root"){
      write("Введите пароль root (Enter для шаблонного):");write("*".repeat(this.rootPassword.length));
    }else if(this.state==="guest"){
      write("Создать учётную запись guest? Y/n");
    }else if(this.state==="confirm"){
      write(`Форматировать ${this.targets[this.selected]?.name}? Все данные будут заменены.`);
      write("Enter — установить, Esc — отмена");
    }else if(this.state==="done"){
      write("");write(`Установка завершена: ${this.result.files} файлов, ${this.result.bytes} Б.`);
      write("PCFS проверен. BIOS настроен на kernel.bin. Esc — перезагрузка.");
    }else if(this.state==="error"){
      write("ОШИБКА УСТАНОВКИ: "+this.error);write("Esc — назад к выбору диска");
    }
  }
  handleKey(key){
    const code=key?.code||key?.key;
    if(this.state==="target"){
      if(code==="ArrowUp"&&this.targets.length)this.selected=(this.selected+this.targets.length-1)%this.targets.length;
      else if(code==="ArrowDown"&&this.targets.length)this.selected=(this.selected+1)%this.targets.length;
      else if(code==="Enter"&&this.targets.length)this.state="root";
      this.render();return true;
    }
    if(this.state==="root"){
      if(code==="Enter")this.state="guest";
      else if(code==="Backspace")this.rootPassword=this.rootPassword.slice(0,-1);
      else if(key?.key?.length===1&&this.rootPassword.length<64)this.rootPassword+=key.key;
      this.render();return true;
    }
    if(this.state==="guest"){
      if(code==="KeyN"||key?.key==="n"||key?.key==="N")this.guest=false;
      if(code==="Enter"||code==="KeyY"||code==="KeyN"||key?.key?.toLowerCase()==="y"||key?.key?.toLowerCase()==="n")this.state="confirm";
      this.render();return true;
    }
    if(this.state==="confirm"){
      if(code==="Escape"){this.state="target";this.render();return true;}
      if(code!=="Enter")return true;
      try{this.result=this.runtime.installFromMedia(this.source,this.targets[this.selected],{rootPassword:this.rootPassword,guest:this.guest});this.state="done";}
      catch(error){this.error=error.message;this.state="error";}
      this.render();return true;
    }
    if(this.state==="done"&&code==="Escape"){
      this.runtime.installerSession=null;this.runtime.lastBoot=this.runtime.bootFromFirmware(this.terminal);return true;
    }
    if(this.state==="error"&&code==="Escape"){this.state="target";this.render();return true;}
    return true;
  }
}

export class ComputerRuntime {
  constructor(computer){
    this.computer=computer;this.active=0;this.assembler=new Assembler();
    this.activeStorage=null;this.biosSession=null;this.installerSession=null;this._terminal=null;this._unsubscribeKey=null;
  }
  get parts(){ return this.computer.slots; }
  get threads(){ return this.parts.cpu?.stats.threads || 0; }
  get ramBytes(){ return (this.parts.ram?.stats.capacityKb || 0)*1024; }
  get outputMode(){ return this.parts.gpu?.stats.output || null; }
  get storage(){ return this.activeStorage || this.computer.memory; }
  bootDevices(){
    return this.computer.slotDefs.flatMap(slot=>{
      const item=this.parts[slot.id];
      return item?.storage ? [{id:slot.id,name:`${slot.name}: ${item.name}`,item,storage:item.storage}] : [];
    });
  }
  selectedBootDevice(){
    const devices=this.bootDevices(),selected=this.computer.firmware?.settings?.bootDevice;
    return devices.find(device=>device.id===selected) ||
      devices.find(device=>device.storage.installationMedia) || devices[0] || null;
  }
  attachTerminal(terminal){
    if(!terminal || terminal===this._terminal)return;
    this._unsubscribeKey?.();this._terminal=terminal;
    this._unsubscribeKey=terminal.onKey?.(key=>{
      if(this.biosSession)return this.biosSession.handleKey(key);
      if(this.installerSession)return this.installerSession.handleKey(key);
      if(key.code==="Delete"){this.openBiosSetup(terminal);return true;}
      return false;
    }) || null;
  }
  openBiosSetup(terminal=null){
    this.attachTerminal(terminal);this.os?.stop?.();
    this.biosSession=new BiosSetupSession(this,terminal);
    return this.biosSession;
  }
  installFromMedia(source,target,{rootPassword="",guest=true}={}){
    if(this.ramBytes<8192)throw new Error("Installer: требуется не менее 8 КБ RAM");
    if(!source?.storage?.installerPackage)throw new Error("Installer: PCFD package не найден");
    if(!target?.storage||target.storage===source.storage)throw new Error("Installer: выберите другой target DRIVE");
    const result=installPCFD(source.storage.installerPackage,target.storage,{rootPassword,guest});
    this.computer.firmware.saveSettings({bootDevice:target.id,bootFile:"kernel.bin"});
    this.activeStorage=target.storage;
    return result;
  }
  runUnattendedInstall(source,target){return this.installFromMedia(source,target,{rootPassword:"root",guest:true});}
  systemServices(context=null){
    const label=item=>item ? `${item.name} [${item.tag}]` : "не установлен";
    return {
      outputMode:this.outputMode,
      vfs:context?.os?.vfs||null,
      time:()=>new Date().toLocaleString("ru-RU"),
      hardware:()=>[
        `CPU: ${label(this.parts.cpu)} · ${this.threads} поток(а)`,
        `RAM: ${label(this.parts.ram)} · ${this.ramBytes/1024} КБ`,
        `GPU: ${label(this.parts.gpu)} · режим ${this.outputMode || "нет"}`,
        `DRIVE: ${label(this.parts.drive)} · ${this.parts.drive?.stats.capacityKb || 0} КБ`,
        `NVRAM: BIOS ${this.computer.firmware?.biosSource.length || 0} Б · boot ${this.selectedBootDevice()?.name || "не выбран"}`
      ],
      slots:()=>this.computer.slotDefs.map(slot=>
        `${slot.name}: ${this.computer.slots[slot.id]?.name || "пусто"}`),
      ports:()=>[
        "DISPLAY: canvas 420x420 · text/graphics",
        "KEYBOARD: browser key events",
        "MOUSE: x/y/buttons/wheel",
        ...this.computer.slotDefs.filter(s=>s.id.startsWith("peripheral"))
          .map(s=>`${s.name.toUpperCase()}: ${this.computer.slots[s.id]?.name || "пусто"}`)
      ],
      /** Textual ABI payload for the Assembly scanner.  Keeping formatting
       * here means the ABI exposes a copy, not mutable host equipment. */
      deviceInfo:()=>[
        "ONBOARD HARDWARE",
        ...[
          `CPU: ${label(this.parts.cpu)} · ${this.threads} thread(s)`,
          `RAM: ${label(this.parts.ram)} · ${this.ramBytes/1024} KB`,
          `GPU: ${label(this.parts.gpu)} · ${this.outputMode || "none"}`,
          `DRIVE: ${label(this.parts.drive)} · ${this.parts.drive?.stats.capacityKb || 0} KB`,
          `NVRAM: BIOS ${this.computer.firmware?.biosSource.length || 0} B`
        ],
        "INTERNAL SLOTS",
        ...this.computer.slotDefs.map(slot=>
          `${slot.name}: ${this.computer.slots[slot.id]?.name || "empty"}`),
        "PORTS",
        "DISPLAY: canvas 420x420 text/graphics",
        "KEYBOARD: browser key events",
        "MOUSE: x/y/buttons/wheel",
        ...this.computer.slotDefs.filter(s=>s.id.startsWith("peripheral"))
          .map(s=>`${s.name.toUpperCase()}: ${this.computer.slots[s.id]?.name || "empty"}`)
      ].join("\n")+"\n",
      openSystemScanner:()=>this.openSystemScanner?.()===true,
      pid:()=>context?.pid||0,
      ppid:()=>context?.process?.ppid||0,
      uid:()=>context?.process?.uid||0,
      gid:()=>context?.process?.gid||0,
      setuid:uid=>{
        const process=context?.process;if(!process)return false;
        if(process.euid!==0&&uid!==process.uid)return false;
        process.euid=uid|0;return true;
      },
      setgid:gid=>{
        const process=context?.process;if(!process||process.euid!==0)return false;
        process.gid=gid|0;process.egid=gid|0;return true;
      },
      setsid:()=>{
        const process=context?.process;if(!process)return false;
        process.pgid=process.pid;return true;
      },
      envSet:(key,value)=>{
        const process=context?.process;
        if(!process||!/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(key))return false;
        process.env||=Object.create(null);
        if(Object.keys(process.env).length>=32&&!Object.hasOwn(process.env,key))return false;
        process.env[key]=String(value).slice(0,ABI_LIMITS.ENV_VALUE_MAX-1);return true;
      },
      envGet:key=>context?.process?.env?.[key],
      envUnset:key=>{
        const process=context?.process;
        if(!process?.env||!Object.hasOwn(process.env,key))return false;
        delete process.env[key];return true;
      },
      envList:()=>textEncoder.encode(Object.entries(context?.process?.env||{})
        .sort(([left],[right])=>left.localeCompare(right))
        .map(([key,value])=>`${key}=${value}`).join("\n")),
      ipcSend:(to,data)=>context?.os?.processes.send(context.pid,to,data),
      ipcReceive:()=>context?.os?.processes.receive(context.pid),
      fsList:()=>textEncoder.encode(this.storage?.list().map(f=>f.name).join("\n") || ""),
      fsRead:name=>{
        const file=this.storage?.get(name);
        return file?.data ? new Uint8Array(file.data) :
          file?.code!==undefined ? textEncoder.encode(file.code) : null;
      },
      fsWrite:(name,data)=>this.storage ? this.storage.saveBinary(name,data) : "DRIVE не установлен",
      fsDelete:name=>{const exists=!!this.storage?.get(name);if(exists)this.storage.delete(name);return exists;},
      procExec:(name,credentials=null,spawnOptions=null)=>{
        const file=this.storage?.get(name);if(!file?.data)return -1;
        if(credentials&&context?.process?.euid!==0)return -1;
        const inheritedFDs=context?.process?.machine?.cpu?._vfs?.clone?.()||null;
        if(inheritedFDs&&spawnOptions){
          for(const [key,target] of [["stdin",0],["stdout",1],["stderr",2]]){
            const source=spawnOptions[key];
            if(source!==null&&source!==undefined)inheritedFDs.dup(source,target);
          }
        }
        return context?.os?.processes.spawn(name,file.data,
          {parentPid:context?.pid||0,pgid:context?.process?.pgid,
            fdTable:inheritedFDs,...(credentials||{})}).pid||-1;
      },
      procReplace:name=>{
        const file=this.storage?.get(name);if(!file?.data||!context?.process)return false;
        context.os.processes.exec(context.pid,name,file.data);return true;
      },
      procExit:status=>context?.os?.processes.exit(context.pid,status),
      procWait:pid=>context?.os?.processes.wait(context.pid,pid),
      procInfo:pid=>{
        const process=context?.os?.processes.processes.find(item=>item.pid===pid);
        if(!process)return null;
        const data=new Uint8Array(PROCESS_INFO_LAYOUT.bytes),view=new DataView(data.buffer);
        const state={ready:0,running:1,sleeping:2,stopped:3,zombie:4,faulted:5}[process.state]??5;
        view.setUint32(PROCESS_INFO_LAYOUT.PID,process.pid>>>0,true);
        view.setUint32(PROCESS_INFO_LAYOUT.PPID,process.ppid>>>0,true);
        view.setUint32(PROCESS_INFO_LAYOUT.UID,(process.euid??process.uid??0)>>>0,true);
        view.setUint32(PROCESS_INFO_LAYOUT.GID,(process.egid??process.gid??0)>>>0,true);
        view.setUint32(PROCESS_INFO_LAYOUT.STATE,state,true);
        view.setInt32(PROCESS_INFO_LAYOUT.EXIT_STATUS,process.exitCode??0,true);
        view.setUint32(PROCESS_INFO_LAYOUT.TICKS,process.ticks>>>0,true);
        view.setUint32(PROCESS_INFO_LAYOUT.PREEMPTIONS,process.preemptions>>>0,true);
        view.setUint32(PROCESS_INFO_LAYOUT.MEMORY_BYTES,process.memory?.size>>>0||0,true);
        const started=Math.max(0,process.startTime||0);
        view.setUint32(PROCESS_INFO_LAYOUT.START_TIME_SEC,Math.floor(started/1000)>>>0,true);
        view.setUint32(PROCESS_INFO_LAYOUT.START_TIME_NSEC,
          Math.floor((started%1000)*1e6)>>>0,true);
        data.set(textEncoder.encode(String(process.name||"").slice(0,63)),
          PROCESS_INFO_LAYOUT.COMMAND);
        return data;
      },
      procList:()=>{
        const processes=[...(context?.os?.processes.processes||[])]
          .sort((a,b)=>(b.ticks-a.ticks)||(a.pid-b.pid));
        const data=new Uint8Array(processes.length*4),view=new DataView(data.buffer);
        processes.forEach((process,index)=>view.setUint32(index*4,process.pid>>>0,true));
        return data;
      },
      procKill:pid=>context?.os?.processes.kill(pid)||false,
      memAlloc:size=>{
        if(!context?.os||!context?.pid||size<=0)return -1;
        try{return context.os.memory.allocate(size,context.pid).start;}
        catch{return -1;}
      },
      memFree:address=>{
        const block=context?.os?.memory.blocks.find(item=>
          item.pid===context?.pid&&item.start===address&&item!==context?.process?.memory);
        if(!block)return false;
        context.os.memory.freeBlock(block);return true;
      },
      memInfo:()=>({free:context?.os?.memory.freeBytes()||0,total:context?.os?.memory.size||this.ramBytes}),
      /* --- сетевые bridge-методы для SYS_NET_* сисколлов ---
       * Каждый метод транслирует вызов из ядра assembly в JS-симуляцию сети.
       * MAC-адреса передаются как Uint8Array(6). */
      /** Возвращает бинарный буфер со списком сетевых устройств */
      netInfo:() => {
        if (!this._networkProp) return null;
        const { nodes } = networkTopology(this._networkProp);
        // Формат: [kind(u8)][mac(6)][ports(u8)][powered(u8)] = 9 байт на устройство
        const data = new Uint8Array(nodes.length * 9);
        const view = new DataView(data.buffer);
        nodes.forEach((node, i) => {
          const off = i * 9;
          const kindMap = { computer: 1, switch: 2, scanner: 3, antenna: 4, weapon: 5, engine: 6, gyro: 7 };
          data[off] = kindMap[node.kind] || 0;
          const macParts = node.mac.split(":").map(h => parseInt(h, 16));
          for (let j = 0; j < 6; j++) data[off + 1 + j] = macParts[j] || 0;
          data[off + 7] = node.ports || 1;
          data[off + 8] = node.powered ? 1 : 0;
        });
        return data;
      },
      /** Проверяет, подключён ли MAC к сети (есть хотя бы один линк) */
      netLinkStatus: (mac) => {
        if (!this._networkProp) return false;
        const { nodes, links } = networkTopology(this._networkProp);
        const macStr = [...mac].map(b => b.toString(16).padStart(2, "0")).join(":");
        const node = nodes.find(n => n.mac === macStr);
        if (!node) return false;
        return links.some(link => link.a === node.id || link.b === node.id);
      },
      /** Отправка Ethernet-фрейма */
      netSend: (srcMac, dstMac, data) => {
        if (!this._networkProp) return { ok: false, reason: "no-network" };
        const { nodes, byId } = networkTopology(this._networkProp);
        const srcMacStr = [...srcMac].map(b => b.toString(16).padStart(2, "0")).join(":");
        const dstMacStr = [...dstMac].map(b => b.toString(16).padStart(2, "0")).join(":");
        const srcNode = nodes.find(n => n.mac === srcMacStr);
        const dstNode = nodes.find(n => n.mac === dstMacStr);
        if (!srcNode || !dstNode) return { ok: false, reason: "unknown-mac" };
        const result = udpSend(this._networkProp, srcNode.id, dstNode.id, { raw: data });
        if (result.ok) return { ok: true, bytesSent: data.length };
        return { ok: false, reason: result.reason || "send-failed" };
      },
      /** Чтение входящего Ethernet-фрейма */
      netRecv: (mac) => {
        if (!this._networkProp) return null;
        const { nodes, network } = networkTopology(this._networkProp);
        const macStr = [...mac].map(b => b.toString(16).padStart(2, "0")).join(":");
        const node = nodes.find(n => n.mac === macStr);
        if (!node) return null;
        // Ищем последний входящий фрейм для этого узла
        const frameIndex = network.frames.findLastIndex(f => f.to === node.id);
        if (frameIndex < 0) return null;
        const frame = network.frames[frameIndex];
        network.frames.splice(frameIndex, 1); // Удаляем прочитанный фрейм
        const payload = frame.payload?.raw;
        return payload ? { data: payload } : null;
      },
      /** Ввод-вывод устройства (сканер, антенна, коммутатор) */
      netDeviceIO: (mac, cmd, payload) => {
        if (!this._networkProp) return { ok: false, reason: "no-network" };
        const { nodes, network } = networkTopology(this._networkProp);
        const macStr = [...mac].map(b => b.toString(16).padStart(2, "0")).join(":");
        const node = nodes.find(n => n.mac === macStr);
        if (!node) return { ok: false, reason: "unknown-mac" };
        const textEncoder = new TextEncoder();
        const textDecoder = new TextDecoder();
        switch (cmd) {
          case 1: // Статус устройства
            if (node.kind === "scanner") {
              const status = JSON.stringify({ range: node.item?.stats?.range || 0, resolution: node.item?.stats?.resolution || 0 });
              return { ok: true, data: textEncoder.encode(status), status: 1 };
            }
            if (node.kind === "antenna") {
              const status = JSON.stringify({ range: node.item?.stats?.range || 0, channels: node.item?.stats?.channels || 0 });
              return { ok: true, data: textEncoder.encode(status), status: 1 };
            }
            if (node.kind === "switch") {
              const config = switchConfig(this._networkProp, node.id);
              const status = JSON.stringify({ dhcpEnabled: config.dhcpEnabled, dnsEnabled: config.dnsEnabled, subnet: config.subnet, domain: config.domain, leaseMinutes: config.leaseMinutes });
              return { ok: true, data: textEncoder.encode(status), status: 1 };
            }
            return { ok: true, data: textEncoder.encode("{}"), status: 0 };
          case 3: // Конфигурация DHCP
            if (node.kind === "switch" && payload) {
              const patch = JSON.parse(textDecoder.decode(payload));
              configureSwitch(this._networkProp, node.id, patch);
              return { ok: true, status: 0 };
            }
            return { ok: false, reason: "not-switch" };
          case 4: // Конфигурация DNS
            if (node.kind === "switch" && payload) {
              const patch = JSON.parse(textDecoder.decode(payload));
              configureSwitch(this._networkProp, node.id, patch);
              return { ok: true, status: 0 };
            }
            return { ok: false, reason: "not-switch" };
          default:
            return { ok: false, reason: "unknown-cmd" };
        }
      },
      sysInfo:()=>{
        const os=context?.os,now=Date.now(),started=os?.startTime||now;
        const totalDrive=(this.parts.drive?.stats.capacityKb||0)*1024;
        const storage=os?.vfs?.fs?.storageInfo?.();
        return {
          uptimeSec:Math.max(0,Math.floor((now-started)/1000)),uptimeNsec:0,
          totalRam:os?.memory.size||this.ramBytes,
          freeRam:os?.memory.freeBytes()||0,
          totalDrive:storage?.totalBytes||totalDrive,
          freeDrive:storage?.freeBytes??totalDrive,
          processes:os?.processes.processes.length||0,
          cpuThreads:this.threads
        };
      }
    };
  }
  run(source, terminal=null){
    /* Служебный shortcut тоже проходит через полный цикл ассемблер → .bin →
     * декодер CPU. В игровом интерфейсе исходник напрямую запустить нельзя. */
    return this.runBinary(this.assembler.assembleBinary(source),terminal);
  }
  runBinary(binary,terminal=null,context=null){
    if (!this.threads) throw new Error("CPU не установлен");
    if (!this.ramBytes) throw new Error("RAM не установлена");
    if (!this.outputMode) throw new Error("GPU не установлен");
    if (this.active >= this.threads) throw new Error(`все потоки CPU заняты (${this.threads})`);
    const bytes=binary instanceof Uint8Array ? binary : new Uint8Array(binary);
    if(bytes.length>this.ramBytes)throw new Error(`программа ${bytes.length} Б не помещается в RAM ${this.ramBytes} Б`);
    const program=this.assembler.decodeBinary(bytes);
    const needsGraphics=program.some(ins=>ins.op.startsWith("GFX_") ||
      (ins.op==="TERM_MODE" && String(ins.args[0]).toLowerCase()==="graphics"));
    if(needsGraphics && this.outputMode!=="graphics")throw new Error("графические инструкции требуют GPU с режимом graphics");
    const output=[];
    this.active++;
    try{
      const cpu=new CPU(this.ramBytes,line=>output.push(line),terminal,this.systemServices(context));
      return {...cpu.run(program),output,threads:this.threads,ramBytes:this.ramBytes,outputMode:this.outputMode};
    }finally{this.active--;}
  }
  createMachine(binary,terminal=null,context=null){
    const bytes=binary instanceof Uint8Array?binary:new Uint8Array(binary);
    if(bytes.length>this.ramBytes)throw new Error(`программа ${bytes.length} Б не помещается в RAM ${this.ramBytes} Б`);
    const program=this.assembler.decodeBinary(bytes);
    const output=[],cpu=new CPU(this.ramBytes,line=>output.push(line),terminal,this.systemServices(context));
    const isProtected=!!(program.featureFlags&PROTECTED_FEATURE);
    let layout=null;
    if(isProtected){
      if(this.ramBytes<PROCESS_MEMORY_LAYOUT.MINIMUM_RAM)
        throw new Error(`protected process требует не менее ${PROCESS_MEMORY_LAYOUT.MINIMUM_RAM} Б RAM`);
      const handler=program.length;
      program.push({op:"HALT",args:[],line:handler+1,kernelHandler:true});
      const userLimit=this.ramBytes-PROCESS_MEMORY_LAYOUT.USER_BASE;
      const stackSize=Math.min(PROCESS_MEMORY_LAYOUT.MAX_STACK_BYTES,
        Math.max(1024,Math.floor(userLimit/4)));
      const stackBase=userLimit-stackSize;
      const guardStart=stackBase-PROCESS_MEMORY_LAYOUT.GUARD_BYTES;
      layout={
        ivt:{base:PROCESS_MEMORY_LAYOUT.IVT_BASE,size:IVT_LAYOUT.bytes},
        kernelStack:{
          base:PROCESS_MEMORY_LAYOUT.KERNEL_STACK_BASE,
          top:PROCESS_MEMORY_LAYOUT.KERNEL_STACK_TOP,
          size:PROCESS_MEMORY_LAYOUT.KERNEL_STACK_TOP-PROCESS_MEMORY_LAYOUT.KERNEL_STACK_BASE
        },
        user:{
          base:PROCESS_MEMORY_LAYOUT.USER_BASE,
          limit:userLimit
        },
        text:{start:0,end:handler,permissions:MEMORY_PERMISSIONS.READ|MEMORY_PERMISSIONS.EXECUTE,
          addressSpace:"instructions"},
        heap:{start:0,end:guardStart,permissions:MEMORY_PERMISSIONS.READ|MEMORY_PERMISSIONS.WRITE},
        guard:{start:guardStart,end:stackBase,permissions:0},
        stack:{start:stackBase,end:userLimit,
          permissions:MEMORY_PERMISSIONS.READ|MEMORY_PERMISSIONS.WRITE,nx:true},
        faultHandler:handler
      };
      cpu.configureProtectedMode({mode:"kernel",ubase:layout.user.base,
        ulimit:layout.user.limit,ksp:layout.kernelStack.top,ivt:layout.ivt.base,ie:true});
      for(let cause=0;cause<IVT_LAYOUT.entries;cause++)
        cpu.view.setUint32(layout.ivt.base+cause*IVT_LAYOUT.entryBytes,handler,true);
      cpu.configureUserProtection({textLimit:handler,stackBase,
        regions:[
          {name:"heap",start:layout.heap.start,end:layout.heap.end,
            permissions:layout.heap.permissions},
          {name:"guard",start:layout.guard.start,end:layout.guard.end,permissions:0},
          {name:"stack",start:layout.stack.start,end:layout.stack.end,
            permissions:layout.stack.permissions}
        ]});
      for(const segment of program.dataWrites||[]){
        if(segment.address<0||segment.address+segment.data.length>layout.heap.end)
          throw new Error(`loader: DATA ${segment.address}..${segment.address+segment.data.length-1} вне RW heap/data`);
        cpu.bytes.set(segment.data,layout.user.base+segment.address);
      }
      cpu.enterUserMode(0,layout.user.limit);
    }else{
      for(const segment of program.dataWrites||[]){
        if(segment.address<0||segment.address+segment.data.length>cpu.bytes.length)
          throw new Error(`loader: DATA ${segment.address}..${segment.address+segment.data.length-1} вне RAM`);
        cpu.bytes.set(segment.data,segment.address);
      }
    }
    const machine={cpu,program,output,protected:isProtected,layout,
      resume:(maxSteps=100000,options={preempt:true})=>cpu.run(program,maxSteps,false,options)};
    if(context?.process){
      if(context.process.fdTable)cpu._vfs=context.process.fdTable;
      context.process.protected=isProtected;
      context.process.layout=layout;
    }
    return machine;
  }
  bootFromFirmware(terminal=null){
    this.os?.stop?.();
    const device=this.selectedBootDevice();
    this.activeStorage=device?.storage || null;
    if(!this.storage)throw new Error("BIOS: загрузочный носитель не установлен");
    const source=this.computer.firmware?.biosSource || BIOS_ASM;
    const bios=this.runBinary(this.assembler.assembleBinary(source),terminal);
    if (!bios.bootFile) return { bios, os:null };
    const bootFile=this.computer.firmware?.settings?.bootFile || bios.bootFile;
    const file=this.storage.get(bootFile);
    if (!file) throw new Error(`BIOS: загрузочный файл «${bootFile}» не найден на ${device?.name || "DRIVE"}`);
    if(!file.data)throw new Error(`BIOS: «${bios.bootFile}» не является бинарным файлом`);
    const os=this.runBinary(file.data,terminal);
    if(this.storage.installationMedia){
      this.installerSession=new InstallerSession(this,terminal,device);
      return {bios,installer:this.installerSession,file:file.name};
    }
    this.os=new PixelOS(this.computer,this,terminal);
    return { bios, os, kernel:this.os, file:file.name };
  }
  boot(terminal=null){
    this.attachTerminal(terminal);
    const pendingDelete=terminal?.keys?.findIndex?.(key=>key.code==="Delete") ?? -1;
    if(pendingDelete>=0){terminal.keys.splice(pendingDelete,1);return {bios:null,os:null,setup:this.openBiosSetup(terminal)};}
    return this.bootFromFirmware(terminal);
  }
}
