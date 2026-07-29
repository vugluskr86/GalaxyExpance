import test from "node:test";
import assert from "node:assert/strict";
import { getLocale, setLocale, t, tr } from "../src/i18n/index.js";

test("i18n switches between Russian and English catalogs and translates dynamic fragments",()=>{
  setLocale("en");
  assert.equal(getLocale(),"en");
  assert.equal(t("ui.landing"),"Land");
  assert.equal(tr("местное время 12:00 · топливо 100"),"local time 12:00 · fuel 100");
  setLocale("ru");
  assert.equal(t("ui.landing"),"Посадка");
});
