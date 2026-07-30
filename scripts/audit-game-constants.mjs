/* Lists numeric literals in gameplay source as a review queue. It is not a
 * brittle ban on arithmetic: entries are candidates for the central balance
 * registry, while bitmasks, pixel geometry and algorithm internals remain
 * explicitly reviewable. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const roots=["src/game","src/scenes","src/gen","src/ui"];
const candidates=[];
function walk(relative){
  const full=path.join(root,relative);
  for(const entry of fs.readdirSync(full,{withFileTypes:true})){
    const next=path.join(relative,entry.name);
    if(entry.isDirectory())walk(next);
    else if(entry.isFile()&&entry.name.endsWith(".js")&&!entry.name.includes(".generated.")){
      fs.readFileSync(path.join(root,next),"utf8").split(/\r?\n/).forEach((line,index)=>{
        if(/\b(?:\d{2,}|\d+\.\d+)\b/.test(line)&&!line.trimStart().startsWith("//"))candidates.push({file:next.replaceAll("\\","/"),line:index+1,source:line.trim().slice(0,180)});
      });
    }
  }
}
roots.forEach(walk);
console.log(JSON.stringify({generatedAt:new Date().toISOString(),count:candidates.length,candidates},null,2));
