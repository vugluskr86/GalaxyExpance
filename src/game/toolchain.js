const enc=new TextEncoder(), dec=new TextDecoder();
const pack=(magic,value)=>{
  const body=enc.encode(JSON.stringify(value)), out=new Uint8Array(4+body.length);
  out.set(enc.encode(magic),0); out.set(body,4); return out;
};
const unpack=(magic,input)=>{
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(dec.decode(bytes.subarray(0,4))!==magic)throw new Error(`ожидался формат ${magic}`);
  return JSON.parse(dec.decode(bytes.subarray(4)));
};
const tokens=text=>text.match(/"(?:\\.|[^"])*"|[^,\s]+/g)||[];
const identifier=value=>/^[A-Za-z_]\w*$/.test(value||"");
const CONTROL=new Set(["JMP","JZ","JNZ","CALL"]);
const REGISTERS=new Set(["A","B","C","D","FA","FB","FC","FD",..."V0 V1 V2 V3 V4 V5 V6 V7".split(" ")]);

const dataSize=(op,args,offset)=>{
  if(op===".BYTE")return args.length;
  if(op===".WORD")return args.length*2;
  if(op===".DWORD")return args.length*4;
  if(op===".STRING")return enc.encode(JSON.parse(args.join(" "))).length;
  if(op===".ZERO")return Number(args[0]);
  if(op===".ALIGN")return Math.ceil(offset/Number(args[0]))*Number(args[0])-offset;
  return 0;
};

/** PCOB v2: двухпроходный перемещаемый объект с symbol и relocation tables. */
export class AssemblyCompiler {
  compile(source,name="module"){
    const imports=[],exports=[],lines=[];
    for(const [lineIndex,original] of source.split(/\r?\n/).entries()){
      const text=original.replace(/;.*$/,"").trim();
      if(!text)continue;
      let match=text.match(/^\.import\s+([A-Za-z_]\w*)$/i);
      if(match){imports.push(match[1]);continue;}
      match=text.match(/^\.export\s+([A-Za-z_]\w*)$/i);
      if(match){exports.push(match[1]);continue;}
      lines.push({text,line:lineIndex+1});
    }

    // Pass 1: define every local symbol and assign section-relative offsets.
    const symbols=new Map(imports.map(symbol=>[symbol,{name:symbol,section:"UND",value:0,imported:true}]));
    let textOffset=0,dataOffset=0;
    for(const row of lines){
      let text=row.text,label=null;
      const labelMatch=text.match(/^([A-Za-z_]\w*):/);
      if(labelMatch){label=labelMatch[1];text=text.slice(labelMatch[0].length).trim();}
      const parts=tokens(text),op=(parts.shift()||"").toUpperCase();
      const isData=op.startsWith(".");
      if(label){
        if(symbols.has(label)&&!symbols.get(label).imported)throw new Error(`строка ${row.line}: повторный символ ${label}`);
        symbols.set(label,{name:label,section:isData?"DATA":"TEXT",value:isData?dataOffset:textOffset});
      }
      if(!op)continue;
      if(op===".ORG"){dataOffset=Number(parts[0]);continue;}
      if(isData){dataOffset+=dataSize(op,parts,dataOffset);continue;}
      textOffset++;
    }
    for(const symbol of exports){
      const entry=symbols.get(symbol);
      if(!entry||entry.section==="UND")throw new Error(`экспорт ${symbol} не определён в ${name}`);
      entry.exported=true;
    }

    // Pass 2: record every address which must be fixed by the linker.
    const relocations=[];
    let instruction=0,dataCursor=0;
    for(const row of lines){
      let text=row.text;
      const labelMatch=text.match(/^([A-Za-z_]\w*):/);
      if(labelMatch)text=text.slice(labelMatch[0].length).trim();
      const parts=tokens(text),op=(parts.shift()||"").toUpperCase();
      if(!op)continue;
      if(op===".ORG"){dataCursor=Number(parts[0]);continue;}
      if(op.startsWith(".")){
        const width=op===".WORD"?2:op===".DWORD"?4:1;
        if([".BYTE",".WORD",".DWORD"].includes(op))parts.forEach((operand,index)=>{
          if(identifier(operand)&&(symbols.has(operand)||imports.includes(operand)))
            relocations.push({section:"DATA",offset:dataCursor+index*width,width,symbol:operand,type:"ABS_DATA",line:row.line});
        });
        dataCursor+=dataSize(op,parts,dataCursor);
        continue;
      }
      parts.forEach((operand,index)=>{
        if(!identifier(operand)||REGISTERS.has(operand.toUpperCase()))return;
        if(!symbols.has(operand)&&!imports.includes(operand))return;
        const known=symbols.get(operand);
        const type=CONTROL.has(op)?"ABS_TEXT":
          /^LOAD_[ABCD]$/.test(op)&&known?.section==="TEXT"?"ABS_TEXT":
          /^LOAD_[ABCD]$/.test(op)&&known?.section==="UND"?"ABS_ANY":"ABS_DATA";
        relocations.push({
          section:"TEXT",offset:instruction,operand:index,width:8,symbol:operand,
          type,opcode:op,line:row.line
        });
      });
      instruction++;
    }
    const clean=lines.map(row=>row.text).join("\n");
    return pack("PCOB",{version:2,name,imports,exports,symbols:[...symbols.values()],relocations,
      sections:{text:{size:textOffset},data:{size:dataOffset}},source:clean});
  }
  read(input){
    const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
    if(dec.decode(bytes.subarray(0,4))!=="PCOB")throw new Error("ожидался формат PCOB");
    // Host PCOB v2 использует JSON body; self-hosted PCOB v2 — компактные таблицы.
    if(bytes[4]===0x7b)return JSON.parse(dec.decode(bytes.subarray(4)));
    if(bytes[4]!==2||bytes.length<13)throw new Error("неподдерживаемая версия PCOB");
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const payloadSize=view.getUint32(5,true),symbolCount=view.getUint16(9,true);
    const relocationCount=view.getUint16(11,true);
    let at=13;
    if(at+payloadSize+symbolCount*16+relocationCount*16!==bytes.length)
      throw new Error("повреждённый PCOB v2");
    const payload=bytes.slice(at,at+payloadSize);at+=payloadSize;
    const sectionNames=["UND","TEXT","DATA","CONST"],symbols=[];
    for(let index=0;index<symbolCount;index++,at+=16){
      const hash=view.getInt32(at,true),sectionId=view.getInt32(at+4,true);
      const value=view.getInt32(at+8,true),flags=view.getInt32(at+12,true);
      symbols.push({hash,section:sectionNames[sectionId]||"UNKNOWN",value,
        imported:!!(flags&1),exported:!!(flags&2)});
    }
    const typeNames={1:"ABS_TEXT",2:"ABS_DATA"},relocations=[];
    for(let index=0;index<relocationCount;index++,at+=16)
      relocations.push({section:"TEXT",offset:view.getInt32(at,true),
        operand:view.getInt32(at+4,true),type:typeNames[view.getInt32(at+8,true)]||"UNKNOWN",
        symbolHash:view.getInt32(at+12,true)});
    return {version:2,format:"binary",payload,symbols,relocations,
      imports:symbols.filter(item=>item.imported).map(item=>item.hash),
      exports:symbols.filter(item=>item.exported).map(item=>item.hash)};
  }
}

export class Linker {
  constructor(assembler){this.assembler=assembler;this.compiler=new AssemblyCompiler();}
  link(objects,{dynamic=false,entry="main"}={}){
    const modules=objects.map(bytes=>this.compiler.read(bytes));
    if(modules.some(module=>module.format==="binary")){
      if(!modules.every(module=>module.format==="binary"))
        throw new Error("нельзя смешивать JSON и binary PCOB в одной линковке");
      return this.linkBinary(modules,{dynamic,entry});
    }
    const providers=new Map();
    for(const mod of modules)for(const symbol of mod.exports){
      if(providers.has(symbol))throw new Error(`повторный экспорт ${symbol}`);
      const definition=mod.symbols?.find(item=>item.name===symbol&&item.section!=="UND");
      if(!definition)throw new Error(`экспорт ${symbol} не определён в ${mod.name}`);
      providers.set(symbol,{module:mod.name,...definition});
    }
    for(const mod of modules){
      for(const symbol of mod.imports)
        if(!providers.has(symbol))throw new Error(`неразрешённый символ ${symbol} в ${mod.name}`);
      for(const relocation of mod.relocations||[]){
        const local=mod.symbols?.find(item=>item.name===relocation.symbol&&item.section!=="UND");
        const target=local||providers.get(relocation.symbol);
        if(!target)throw new Error(`relocation: символ ${relocation.symbol} не разрешён в ${mod.name}`);
        const expected=relocation.type==="ABS_TEXT"?"TEXT":
          relocation.type==="ABS_DATA"?"DATA":target.section;
        if(relocation.type!=="ABS_ANY"&&target.section!==expected)
          throw new Error(`relocation ${relocation.opcode||relocation.section}: ${relocation.symbol} имеет секцию ${target.section}, ожидалась ${expected}`);
        relocation.resolved={module:target.module||mod.name,section:target.section,value:target.value};
      }
    }
    if(dynamic)return pack("PCDL",{version:2,entry,modules});
    return this.assembler.assembleBinary(modules.map(m=>`; module ${m.name}\n${m.source}`).join("\n"));
  }
  linkBinary(modules,{dynamic=false}={}){
    const decoded=modules.map((module,index)=>({
      ...module,index,program:this.assembler.decodeBinary(module.payload)
    }));
    let textCursor=0,dataCursor=0;
    for(const module of decoded){
      module.textBase=textCursor;textCursor+=module.program.length;
      module.dataBase=dataCursor;
      const extent=(module.program.dataWrites||[]).reduce(
        (max,segment)=>Math.max(max,segment.address+segment.data.length),0);
      dataCursor=(dataCursor+extent+3)&~3;
    }
    const providers=new Map();
    for(const module of decoded)for(const symbol of module.symbols.filter(item=>item.exported)){
      if(providers.has(symbol.hash))throw new Error(`повторный экспорт hash ${symbol.hash}`);
      providers.set(symbol.hash,{module,symbol});
    }
    for(const module of decoded)for(const relocation of module.relocations){
      const local=module.symbols.find(symbol=>symbol.hash===relocation.symbolHash&&symbol.section!=="UND");
      const provider=local?{module,symbol:local}:providers.get(relocation.symbolHash);
      if(!provider)throw new Error(`неразрешённый symbol hash ${relocation.symbolHash}`);
      const expected=relocation.type==="ABS_TEXT"?"TEXT":"DATA";
      if(provider.symbol.section!==expected)
        throw new Error(`relocation hash ${relocation.symbolHash}: ожидалась секция ${expected}`);
      const instruction=module.program[relocation.offset];
      if(!instruction||relocation.operand<0||relocation.operand>=instruction.args.length)
        throw new Error(`relocation вне TEXT: ${relocation.offset}:${relocation.operand}`);
      const base=expected==="TEXT"?provider.module.textBase:provider.module.dataBase;
      instruction.args[relocation.operand]=provider.symbol.value+base;
    }
    const program=[];
    program.dataWrites=[];
    program.featureFlags=decoded.reduce((flags,module)=>flags|(module.program.featureFlags||0),0);
    program.version=program.featureFlags?3:2;
    for(const module of decoded){
      program.push(...module.program);
      for(const segment of module.program.dataWrites||[])
        program.dataWrites.push({address:segment.address+module.dataBase,data:segment.data});
    }
    const executable=this.assembler.encodeProgram(program);
    // Binary PCDL получает уже разрешённый образ: загрузка остаётся детерминированной,
    // а флаг сохраняется для будущего lazy loader.
    return dynamic?pack("PCDL",{version:2,binary:Array.from(executable)}):executable;
  }
  loadExecutable(bytes){
    const magic=dec.decode(bytes.subarray(0,4));
    if(magic==="PCVM")return bytes;
    if(magic!=="PCDL")throw new Error("неизвестный формат исполняемого файла");
    if(bytes[4]===2){
      const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      const count=view.getUint16(5,true),objects=[];let at=7;
      for(let index=0;index<count;index++){
        if(at+4>bytes.length)throw new Error("повреждённый PCDL v2");
        const size=view.getUint32(at,true);at+=4;
        if(at+size>bytes.length)throw new Error("повреждённый PCDL v2");
        objects.push(bytes.slice(at,at+size));at+=size;
      }
      if(at!==bytes.length)throw new Error("лишние данные после PCDL v2");
      return this.linkBinary(objects.map(object=>this.compiler.read(object)));
    }
    const bundle=unpack("PCDL",bytes);
    if(bundle.version===2&&Array.isArray(bundle.binary))return Uint8Array.from(bundle.binary);
    return this.assembler.assembleBinary(bundle.modules.map(m=>`; dynamic ${m.name}\n${m.source}`).join("\n"));
  }
}
