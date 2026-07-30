/**
 * Immutable faction policy table.
 *
 * A settlement stores only `factionId` and `government`; all law, tariff and
 * access decisions resolve through this table. This keeps generated worlds
 * compact and lets a future global event modify a faction policy in one place.
 */
export const FACTIONS=Object.freeze({
  concord:{id:"concord",government:"republic",legality:"strict",tariff:.08,contrabandControl:.82,piracy:"hostile",arms:"licensed"},
  guild:{id:"guild",government:"corporate",legality:"regulated",tariff:.12,contrabandControl:.58,piracy:"hostile",arms:"licensed"},
  crown:{id:"crown",government:"monarchy",legality:"strict",tariff:.1,contrabandControl:.74,piracy:"hostile",arms:"restricted"},
  frontier:{id:"frontier",government:"freeport",legality:"permissive",tariff:.04,contrabandControl:.2,piracy:"neutral",arms:"open"},
  corsairs:{id:"corsairs",government:"pirate",legality:"none",tariff:.02,contrabandControl:.03,piracy:"allied",arms:"open"}
});

export const factionById=id=>FACTIONS[id]||FACTIONS.frontier;

/** Select a politically plausible authority from a deterministic planet RNG. */
export function authorityFor(rng,specialization){
  const pool={
    agri:["concord","guild","frontier"], mining:["guild","frontier","corsairs"],
    industrial:["guild","crown","concord"], science:["concord","guild","frontier"],
    military:["crown","concord","corsairs"]
  }[specialization]||["frontier"];
  const factionId=pool[Math.floor(rng()*pool.length)];
  const faction=factionById(factionId);
  return {factionId,government:faction.government,blackMarket:faction.government==="pirate"||faction.government==="freeport"||rng()<.18};
}
