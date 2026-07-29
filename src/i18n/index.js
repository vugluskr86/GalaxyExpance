import ru from "./ru.json" with { type:"json" };
import en from "./en.json" with { type:"json" };

const catalogs={ru,en};
const STORE_KEY="pixel-cosmos.locale";
let locale=globalThis.localStorage?.getItem(STORE_KEY)||"ru";
if(!catalogs[locale])locale="ru";

const at=(object,key)=>key.split(".").reduce((value,part)=>value?.[part],object);
export const getLocale=()=>locale;
export function t(key,vars={}){
  let text=at(catalogs[locale],key)??at(ru,key)??key;
  for(const [name,value] of Object.entries(vars))text=text.replaceAll(`{${name}}`,String(value));
  return text;
}
/** Translates already assembled UI labels. Longest source fragments are
 * replaced first, so dynamic strings such as "местное время 12:00" work too. */
export function tr(value){
  if(locale==="ru"||typeof value!=="string")return value;
  const source=ru.legacy||{},target=en.legacy||{};
  return Object.entries(source).sort((a,b)=>b[1].length-a[1].length).reduce((text,[key,russian])=>
    text.replaceAll(russian,target[key]??russian),value);
}
export function setLocale(next){
  if(!catalogs[next]||next===locale)return;
  locale=next;globalThis.localStorage?.setItem(STORE_KEY,locale);
  globalThis.dispatchEvent?.(new CustomEvent("pixel-cosmos:locale",{detail:locale}));
}
export function applyDocument(root=document){
  root.documentElement.lang=locale;
  root.querySelectorAll("[data-i18n]").forEach(el=>el.textContent=t(el.dataset.i18n));
  root.querySelectorAll("[data-i18n-placeholder]").forEach(el=>el.placeholder=t(el.dataset.i18nPlaceholder));
}
