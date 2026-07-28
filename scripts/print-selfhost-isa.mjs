import { ISA_TABLE } from "../src/game/cpu.js";
import { PROTECTED_OPCODES } from "../src/game/protected-mode.js";

const fnv1a=value=>{
  let hash=0x811c9dc5;
  for(const byte of new TextEncoder().encode(value)){
    hash^=byte;
    hash=Math.imul(hash,0x01000193);
  }
  return hash|0;
};

const protectedRows=Object.entries(PROTECTED_OPCODES).map(([name,row])=>({
  name,opcode:row.opcode,argc:row.argc
}));
for(const {name,opcode,argc} of [...ISA_TABLE,...protectedRows]){
  console.log(`.dword ${fnv1a(name)}`);
  console.log(`.byte ${opcode}, ${argc} ; ${name}`);
}
