import { GOODS, buyGoods, marketQuote, reputationFor, resolveBlackMarketRisk, sellGoods } from "../game/economy.js";
import { acceptContract, completeContract, contractsAt, generateContracts } from "../game/contracts.js";
import { t } from "../i18n/index.js";
import { fmtNumber } from "../game/units.js";

/**
 * Landing-only market screen.
 *
 * The scene owns no economic state. It receives a system and the landed body,
 * derives the same generated settlement profile as the rest of the game and
 * delegates every mutation to economy.js. That separation is important: UI
 * refreshes and canvas frames cannot accidentally execute a trade twice.
 */
export class TradeScene {
  constructor(systemScene,selRef,initialMarketKind="public"){
    this.sys=systemScene;this.selRef={...selRef};this.crumb=t("ui.tradeCenter");
    this.body=systemScene.obj(selRef);this.settlement=this.body?.settlement||null;
    this.locationId=this.settlement?.id||this.body?.id||"unknown-market";
    this.context={settlement:this.settlement,body:this.body};this.marketKind=initialMarketKind==="black"?"black":"public";this.message="";
  }
  get propulsion(){return this.sys.playerShip?.prop||null;}
  marketContext(){return {...this.context,marketKind:this.marketKind};}
  quote(goodId){return marketQuote(this.sys.world,this.locationId,goodId,this.marketContext());}
  trade(kind,goodId,quantity){
    const prop=this.propulsion;if(!prop||!this.sys.world)return;
    const result=kind==="buy"
      ? buyGoods(this.sys.world,this.locationId,this.marketContext(),prop,goodId,quantity)
      : sellGoods(this.sys.world,this.locationId,this.marketContext(),prop,goodId,quantity);
    if(result.ok){
      const verb=kind==="buy"?t("ui.bought"):t("ui.sold");
      const risk=resolveBlackMarketRisk(this.sys.world,this.marketContext(),prop,goodId,result.quantity);
      this.message=risk.caught?t("ui.contrabandCaught",{seized:risk.seized,fine:risk.fine}):t("ui.tradeResult",{verb,quantity:result.quantity,total:result.total});
      /* Persist now rather than waiting for an unrelated navigation action.
         The saved market delta and journal entry form one durable trade. */
      this.sys.world.capture(this.sys);this.sys.world.persist();
    }else this.message=t(`ui.tradeError.${result.reason}`);
    this.mgr?.onChange?.();
  }
  contracts(){
    /* Offer generation is idempotent: this may run on every panel refresh
       without duplicating work. Active contracts from other places remain in
       the saved journal, while this screen shows those relevant to the dock. */
    generateContracts(this.sys.world,this.locationId,this.context);
    return contractsAt(this.sys.world,this.locationId);
  }
  contractAction(contract){
    const result=contract.state==="offered"?acceptContract(this.sys.world,contract.id)
      : completeContract(this.sys.world,contract.id,this.locationId,this.context,this.propulsion);
    this.message=result.ok?t("ui.contractUpdated"):t(`ui.contractError.${result.reason}`);
    if(result.ok){this.sys.world.capture(this.sys);this.sys.world.persist();}
    this.mgr?.onChange?.();
  }
  update(dt){this.sys.update(dt);}
  draw(time){
    /* Keep the planet/system visually present instead of replacing the game
       with a disconnected HTML page. The translucent terminal layer makes it
       clear that the player is docked at a settlement. */
    this.sys.draw(time);
    const {sctx,SCR}=this.ctx;
    sctx.fillStyle="rgba(4,8,18,.82)";sctx.fillRect(18,84,SCR-36,252);
    sctx.strokeStyle="#5b78a6";sctx.strokeRect(18.5,84.5,SCR-37,251);
    sctx.fillStyle="#d9e7ff";sctx.font="13px 'Courier New', monospace";
    sctx.fillText(t("ui.tradeCenter"),32,110);
    sctx.fillStyle="#7ee08a";sctx.font="10px 'Courier New', monospace";
    sctx.fillText(`${this.settlement?.specialization||t("ui.noMarket")} · ${this.marketKind}`,32,128);
    const prop=this.propulsion;
    sctx.fillStyle="#c3cbee";
    sctx.fillText(t("ui.cargoMass",{mass:fmtNumber(prop?.cargoMass,1,"0"),capacity:prop?.cargoCap||0}),32,320);
  }
  drawLabels(){}
  status(){
    const prop=this.propulsion;
    return {title:t("ui.tradeCenter"),info:t("ui.tradeStatus",{specialization:this.settlement?.specialization||"—",mass:fmtNumber(prop?.cargoMass,1,"0"),capacity:prop?.cargoCap||0})};
  }
  selectedInfo(){return {name:this.body?.id||"—",detail:this.message||t("ui.tradeHint")};}
  primary(){return {label:t("ui.backToSurface"),run:()=>this.mgr.pop()};}
  panelSpec(){
    const prop=this.propulsion;if(!prop||!this.settlement)return [];
    const rows=GOODS.filter(good=>this.marketKind==="public"||good.legality!=="legal").map(good=>{
      const quote=this.quote(good.id),owned=prop.cargo.count(good.itemId);
      const delta=Math.round((quote.buyPrice/quote.averagePrice-1)*100);
      return {tag:good.category.slice(0,3).toUpperCase(),label:good.dynamic?good.name:t(`ui.goods.${good.id}`),
        note:t("ui.tradePrice",{price:quote.buyPrice,average:quote.averagePrice,delta:`${delta>=0?"+":""}${delta}%`})+" · "+t("ui.tradeSellPrice",{price:quote.sellPrice}),
        sub:t("ui.tradeStock",{stock:quote.stock,demand:quote.demand,owned,mass:good.mass}),
        actions:[
          {label:t("ui.buyOne"),run:()=>this.trade("buy",good.id,1)},
          {label:t("ui.buyFive"),run:()=>this.trade("buy",good.id,5)},
          {label:t("ui.sellOne"),run:()=>this.trade("sell",good.id,1)},
          {label:t("ui.sellAll"),run:()=>this.trade("sell",good.id,owned)}
        ]};
    });
    const rep=reputationFor(this.sys.world,this.context);
    const contractRows=this.contracts().filter(contract=>this.marketKind==="black"?contract.visibility==="black-market":contract.visibility!=="black-market").map(contract=>{
      const cargo=contract.cargo[0],detail=cargo?t("ui.contractCargo",{good:t(`ui.goods.${cargo.goodId}`),amount:cargo.amount}):t("ui.contractNoCargo");
      return {tag:contract.type.slice(0,3).toUpperCase(),label:t(`ui.contractTypes.${contract.title||contract.type}`),
        note:t("ui.contractMeta",{reward:contract.reward,deadline:contract.deadline,risk:Math.round(contract.risk*100),state:t(`ui.contractState.${contract.state}`)}),sub:detail,
        actions:[{label:contract.state==="offered"?t("ui.acceptContract"):t("ui.completeContract"),run:()=>this.contractAction(contract)}]};
    });
    return [
      {kind:"sect",label:t("ui.tradeCenter")},
      {kind:"buttons",items:[{label:t("ui.publicMarket"),sel:this.marketKind==="public",run:()=>{this.marketKind="public";}},...(this.settlement.blackMarket?[{label:t("ui.blackMarket"),sel:this.marketKind==="black",run:()=>{this.marketKind="black";}}]:[])]},
      {kind:"readout",label:t("ui.authority"),value:t("ui.authorityValue",{faction:t(`ui.factions.${this.settlement.factionId}`),government:t(`ui.governments.${this.settlement.government}`),security:Math.round(this.settlement.security*100)})},
      {kind:"readout",label:t("ui.credits"),value:t("ui.creditsValue",{credits:this.sys.world.data.economy?.credits||0,day:this.sys.world.data.economy?.day||0})},
      {kind:"readout",label:t("ui.reputation"),value:t("ui.reputationValue",{planet:rep.settlement,faction:rep.faction,merchant:rep.careers.merchant,protector:rep.careers.protector,pirate:rep.careers.pirate,researcher:rep.careers.researcher})},
      {kind:"readout",label:t("ui.cargo"),value:t("ui.cargoMass",{mass:fmtNumber(prop.cargoMass,1),capacity:prop.cargoCap})},
      {kind:"sect",label:t("ui.contracts")},
      {kind:"rows",items:contractRows,empty:t("ui.noContracts")},
      {kind:"sect",label:t("ui.market")},
      {kind:"rows",items:rows,empty:t("ui.noMarket")}
    ];
  }
}
