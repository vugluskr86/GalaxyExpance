/** Персистентное состояние игрока (живёт поверх стека сцен). */
export const player = {
  fuel: 100,
  lastGal: null,
  lastPos: null,
  jumpCost(galSeed, x, y){
    if (this.lastGal !== galSeed || !this.lastPos) return 20;
    return Math.max(4, Math.round(Math.hypot(x - this.lastPos[0], y - this.lastPos[1])/25));
  },
  doJump(galSeed, x, y){
    this.fuel = Math.max(0, this.fuel - this.jumpCost(galSeed, x, y));
    this.lastGal = galSeed;
    this.lastPos = [x, y];
  },
  refuel(){ this.fuel = 100; }
};
