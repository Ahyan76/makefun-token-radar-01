# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Ahyan76/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Ahyan76/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar for make.fun's "Build the best token launch radar" bounty ($1,325 in USDC): a comparables model ranks 120 pre-token protocols — the snapshot's 40-protocol watchlist plus 80 early finds below the $50M floor — by implied token value, with a concrete farm plan for each, in a sortable, filterable dashboard that runs with no network.

The model (radar-2) values each protocol from the snapshot's own figures: its TVL times the median market-cap / TVL of live-token protocols in the same category (3+ comparables, else the global median), adjusted for 7-day growth, age since first listed, and chain count. Protocols whose token already trades are kept apart in a Live view and never enter the ranked board.

## Run it

```sh
node main.ts --input snapshot.json --output out
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=a8qwtge8&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
