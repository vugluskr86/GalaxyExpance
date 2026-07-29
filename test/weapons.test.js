import test from "node:test";
import assert from "node:assert/strict";
import { bySlot, makeItem } from "../src/game/items.js";
import { Propulsion } from "../src/game/propulsion.js";
import { WeaponProjectile } from "../src/game/weapons.js";

test("all requested weapon families are installable ship modules",()=>{
  const kinds=new Set(bySlot("weapon").map(item=>item.stats.weaponType));
  assert.deepEqual(kinds,new Set(["laser","energy","kinetic","missile","torpedo","emp","nuclear","mine"]));
  const prop=new Propulsion();
  const weapon=makeItem("wpn_missile");
  assert.equal(prop.install(weapon),null);
  const shot=prop.fireWeapon();
  assert.equal(shot.weaponType,"missile");
  assert.equal(weapon.ammoLeft,11);
  assert.equal(prop.fireWeapon(),null);
  prop.tickWeapons(shot.cooldown);
  assert.equal(prop.fireWeapon().weaponType,"missile");
});

test("guided projectile turns toward its target and remains drawable",()=>{
  const system={};
  const source={nose:0,globPos:()=>[0,0],globVel:()=>[0,0]};
  const target={destroyed:false,globPos:()=>[0,100]};
  const shot=new WeaponProjectile(source,{guided:true,speed:100,range:300,color:"#fff"},target,system);
  shot.update(.1,system);
  assert.ok(shot.vy>0);
  assert.ok(shot.life>0);
});
