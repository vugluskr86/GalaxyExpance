import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={devicePixelRatio:1};
const { ComputerTerminal } = await import('../src/game/terminal.js');

class FakeTarget {
  constructor(){ this.handlers={}; this.width=420; this.height=420; }
  addEventListener(type, fn){ this.handlers[type]=fn; }
  getBoundingClientRect(){ return {left:0,top:0,width:420,height:420}; }
  getContext(){ return null; }
  closest(){ return null; }
  dispatchKey(key, code=key){
    let prevented=false, stopped=false;
    this.handlers.keydown({key,code,keyCode:0,which:0,ctrlKey:false,
      preventDefault(){prevented=true;}, stopPropagation(){stopped=true;}});
    return {prevented,stopped};
  }
}

test('PCOS keyboard uses stable BIOS-style key codes even when DOM keyCode is zero',()=>{
  const canvas=new FakeTarget();
  const terminal=new ComputerTerminal(canvas);
  terminal.setMode('graphics');
  for(const [key, expected] of [['Escape',27],['Tab',9],['Enter',13],['ArrowLeft',37],['ArrowUp',38],['ArrowRight',39],['ArrowDown',40],['d',100],['D',68]]){
    const event=canvas.dispatchKey(key);
    assert.equal(terminal.readKey().keyCode, expected, key);
    assert.equal(event.prevented,true);
    assert.equal(event.stopped,true);
  }
});
