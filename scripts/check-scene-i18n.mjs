/**
 * Guards scene localisation.
 *
 * A scene may use `t("ui.key")` or compose a dynamic value that is passed to
 * `tr()`.  In the latter case every Russian literal fragment must be registered
 * in `legacy` in both locale catalogs.  This makes untranslated additions show
 * up in CI instead of quietly appearing in the English UI.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const scenesDir = path.join(root, "src", "scenes");
const ru = JSON.parse(await readFile(path.join(root, "src", "i18n", "ru.json"), "utf8"));
const en = JSON.parse(await readFile(path.join(root, "src", "i18n", "en.json"), "utf8"));
const cyrillic = /[А-Яа-яЁё]/;

function keySet(object, prefix=""){
  return Object.entries(object).flatMap(([key,value]) => value && typeof value === "object"
    ? keySet(value, `${prefix}${key}.`)
    : [`${prefix}${key}`]);
}

const ruKeys=new Set(keySet(ru));
const enKeys=new Set(keySet(en));
const catalogDiff=[
  ...[...ruKeys].filter(key=>!enKeys.has(key)).map(key=>`en.json is missing ${key}`),
  ...[...enKeys].filter(key=>!ruKeys.has(key)).map(key=>`ru.json is missing ${key}`)
];
if(catalogDiff.length){
  console.error("Locale catalog keys differ:");
  for(const message of catalogDiff) console.error(message);
  process.exitCode=1;
}

async function files(dir){
  const entries = await readdir(dir, { withFileTypes:true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(path.join(dir, entry.name))
    : entry.name.endsWith(".js") ? [path.join(dir, entry.name)] : []))).flat();
}

/** Return literal portions of JavaScript strings, skipping line/block comments. */
function literals(source){
  const out=[];
  let i=0, line=1;
  const advance=ch=>{ if(ch==="\n") line++; i++; };
  while(i<source.length){
    if(source.startsWith("//",i)){ while(i<source.length && source[i]!=="\n") advance(source[i]); continue; }
    if(source.startsWith("/*",i)){ advance("/"); advance("*"); while(i<source.length && !source.startsWith("*/",i)) advance(source[i]); advance("*"); advance("/"); continue; }
    const quote=source[i];
    if(quote!=="'" && quote!=="\"" && quote!=="`"){ advance(quote); continue; }
    const start=line; let value=""; advance(quote);
    while(i<source.length){
      const ch=source[i];
      if(ch==="\\"){ value+=ch; advance(ch); if(i<source.length){value+=source[i];advance(source[i]);} continue; }
      if(ch===quote){ advance(ch); break; }
      value+=ch; advance(ch);
    }
    if(cyrillic.test(value)) out.push({line:start,value});
  }
  return out;
}

const ruLegacy=Object.keys(ru.legacy || {});
const missing=[];
for(const file of await files(scenesDir)){
  const source=await readFile(file,"utf8");
  for(const literal of literals(source)){
    const text=literal.value.replace(/\\["'`]/g,"$").trim();
    const tokens=[...text.matchAll(/[А-Яа-яЁё]+/g)].map(match=>match[0]);
    const untranslated=tokens.filter(token=>!ruLegacy.some(candidate=>candidate.toLowerCase().includes(token.toLowerCase()) && en.legacy?.[candidate] !== undefined));
    if(untranslated.length) missing.push({file,line:literal.line,text,untranslated:[...new Set(untranslated)]});
  }
}

if(missing.length){
  console.error("Unregistered localised scene literals:");
  for(const item of missing) console.error(`${path.relative(root,item.file)}:${item.line}: ${JSON.stringify(item.text)} → ${item.untranslated.join(", ")}`);
  process.exitCode=1;
} else if(!catalogDiff.length) {
  console.log("Scene i18n: every Russian UI literal is registered in ru.json and en.json.");
}
