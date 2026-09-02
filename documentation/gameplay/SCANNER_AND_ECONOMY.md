# Scanner and deterministic economy

This document describes the implemented exploration and market rules. It is
the source of truth for gameplay code in `src/game/intel.js`,
`src/game/economy.js`, `src/game/stations.js` and their scenes.

## Determinism contract

The generated universe is reproducible from the cluster and system seeds.

- A body signal is derived from the system seed and its stable reference.
- Settlement specialisation, population, technology, security, stations and
  surface characteristics are generated from the planet seed.
- Base market shelves and shipyard catalogues are derived from the cluster
  seed plus stable location or station IDs.
- `Math.random()` must not be used for generated gameplay state, prices,
  scanner results, production, contracts or catalogues.
- Save data contains only mutable deltas: market stock, research progress and
  records, player transactions, reputation and installed item instances.

When changing any of these systems, add a same-seed regression test. A save
must restore the same generated baseline and then reapply its recorded delta.

## Scanner loop

The scanner is the native PCOS program compiled from `examples/c/scanner.c`
and launched as `/usr/bin/scanner.bin` through an equipped, booted ship
computer. It is not a JavaScript replacement UI.

Before it can start, its computer, scanner and antenna must have DHCP/manual
IP addresses, be selected in the computer's scanner client configuration, and
have a route through the fitted switch. The launch action names the missing
address, endpoint or route. This network check is mandatory; it is not an
optional diagnostic.

Configure this in **Ship → Network**: wire the nodes to a switch, run DHCP,
then select the scanner and antenna addresses in the **Scanner route** section.

1. Select a body in the scanner.
2. Read the spectrum and tune frequency, bearing, beam width and
   polarisation. **Lock signal** fills those controls from the visible signal
   for an accessible assisted path.
3. Press **Scan signal** to receive a deterministic data packet. The panel
   shows signal match, packet count and total progress.
4. Each successful packet writes a persistent research record and immediately
   unlocks a data tier on the system screen. Repeated packets complete the
   survey. Probes use the same record and can raise its tier.

Signal strength, equipment range, communications range and the complete IP
route are real requirements. A disabled action must state the concrete failed
requirement.

## Native scanner media

`npm.cmd run build:scanner-media` first compiles `scanner.c` through the PCVM
C compiler, assembler and linker, then produces the separate
`system/unix/build/scanner.pcfd` disk. The disk contains:

- `/usr/bin/scanner.bin` — executable native PCVM program;
- `/usr/src/pcos-scanner/scanner.c` — authoritative C source;
- `/usr/src/pcos-scanner/build/scanner.asm` — compiler output;
- `/usr/include/pcos.h` — public C syscall ABI;
- `/usr/share/doc/pcos-scanner/*` — build and gameplay documentation.

`npm.cmd run check:scanner` validates that the native build/media is current
and executes the PCVM scanner and network smoke tests.

## Civilisation economy

Every non-gas settlement is a civilisation and has a trade dock plus a basic
shipyard. The shipyard catalogue is seeded by station ID and level: frontier
worlds offer starter hulls and parts, while advanced worlds offer higher-class
equipment. Installation creates a fresh `Item` instance with `makeItem()`;
catalogue entries themselves are never shared items.

Market supply and demand are calculated per good:

- agriculture uses vegetation and liquid for food, water and luxury goods;
- mining and resource goods use mineral richness;
- industrial, science and military output scales with technology and relevant
  resources;
- population consumes essentials; specialisations additionally buy inputs
  they need locally.

The market shows both stock and demand. Buying removes stock; selling raises
it, so planets both sell their output and buy goods they lack. Complete-day
ticks apply the same production and consumption functions and only persist
the difference from the seed-derived base shelf.

## Verification

Run the focused checks after changes:

```powershell
npm.cmd test -- test/intel.test.js test/economy.test.js test/balance-config.test.js
npm.cmd run check:scanner
npx.cmd vite build
```

See also [GAME_MECHANICS.md](GAME_MECHANICS.md),
[SCAN_DESIGN.md](../design/SCAN_DESIGN.md) and
[ECONOMY_ROADMAP.md](../plans/ECONOMY_ROADMAP.md).
