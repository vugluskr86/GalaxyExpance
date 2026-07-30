/**
 * Stable identifiers for procedural objects.
 *
 * The displayed name of a star can change with localisation or catalogue
 * rules; these ids deliberately use only generator seeds and ordinal indexes.
 * They are safe to use as keys in saves, markets and future quest state.
 */
const part=value=>(Number(value) >>> 0).toString(36);

export const systemId=(galaxySeed, systemSeed)=>`sys-${part(galaxySeed)}-${part(systemSeed)}`;
export const planetId=(system, index)=>`${system}/planet-${index}`;
export const moonId=(system, planetIndex, moonIndex)=>`${system}/planet-${planetIndex}/moon-${moonIndex}`;
export const stationId=(system, index)=>`${system}/station-${index}`;
