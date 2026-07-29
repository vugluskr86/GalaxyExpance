import test from "node:test";
import assert from "node:assert/strict";
import { SystemScene } from "../src/scenes/system.js";

test("a solid selected planet always exposes a landing approach", () => {
  const ship = {
    mode:"newton", sameTarget:() => false,
    fsdTo(ref, h){ this.flight = { ref, h }; }
  };
  const scene = {
    S:{ bhOnly:false }, sel:{ kind:"planet", i:0, j:0 }, playerShip:ship,
    obj:() => ({ type:"terran" }),
    mgr:{ onChange(){} },
    canLand:SystemScene.prototype.canLand,
    canApproachForLanding:SystemScene.prototype.canApproachForLanding,
    landingApproachAlt:() => 3
  };
  const action = SystemScene.prototype.primary.call(scene);
  assert.match(action.label, /Посадка/);
  action.run();
  assert.deepEqual(ship.flight, { ref:scene.sel, h:3 });
});

test("gas giants do not expose a landing approach", () => {
  const scene = { sel:{ kind:"planet", i:0, j:0 }, obj:() => ({ type:"gas" }) };
  assert.equal(SystemScene.prototype.canApproachForLanding.call(scene), false);
});
