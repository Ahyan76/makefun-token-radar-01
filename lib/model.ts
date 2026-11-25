// The token radar's model (radar-2): a comparables valuation, not a fixed multiple.
//
// Every protocol's implied value is built only from the snapshot's own figures:
//
//   catMultiple  = median (mcap_usd / tvl_usd) of the live-token protocols in the
//                  same category, when that category has at least 3 comparables;
//                  otherwise the global median across all live-token protocols.
//                  (Live = DefiLlama records a token with a market cap.)
//   growthFactor = 1 + 0.6 * clamp(change_7d, -50, 100) / 100
//   maturity     = 0.7 + 0.3 * min(age_days, 730) / 730   (age unknown: 365 days)
//   chainFactor  = 1 + 0.03 * min(chains - 1, 4)
//   implied      = max(1, round(tvl_usd * catMultiple * growthFactor * maturity * chainFactor))
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) plus the
// largest pre-token protocols below the floor that pass the watchlist's own smell test: no token
// recorded, not a bridge / liquid-staking / restaking / CEX product, no version marker in the
// name, no wrapped/staked/staking word, no exchange prefix. Protocols whose token already
// trades are kept apart in a Live view and never enter the ranked board. No protocol name is
// ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  min_comps: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max: number;
}

export const MODEL: ModelConstants = {
  min_comps: 3,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 730,
  unknown_age_days: 365,
  chain_step: 0.03,
  chain_max: 4,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 80;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 16;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    cat_multiple: number;
    cat_comps: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  cat_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted list, or null when it is empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The comparables table: for every category, the median mcap/TVL of its live-token protocols,
 * plus the global median. A category keeps its own multiple only with enough comparables.
 */
export interface Comps {
  byCategory: Map<string, { multiple: number; comps: number }>;
  globalMultiple: number;
}

export function buildComps(snapshot: Snapshot, model: ModelConstants): Comps {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const global = median(live.map((p) => (p.mcap_usd as number) / p.tvl_usd)) ?? 0.25;
  const perCat = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? '';
    const arr = perCat.get(key) ?? [];
    arr.push((p.mcap_usd as number) / p.tvl_usd);
    perCat.set(key, arr);
  }
  const byCategory = new Map<string, { multiple: number; comps: number }>();
  for (const [cat, ratios] of perCat) {
    if (ratios.length >= model.min_comps) {
      const m = median(ratios);
      if (m !== null && m > 0) byCategory.set(cat, { multiple: m, comps: ratios.length });
    }
  }
  return { byCategory, globalMultiple: global };
}

/** The multiple one category gets: its own median when it has enough comparables, else the global one. */
export function categoryMultiple(category: string | null, comps: Comps): { multiple: number; comps: number } {
  const hit = category === null ? undefined : comps.byCategory.get(category);
  return hit ?? { multiple: comps.globalMultiple, comps: 0 };
}

/** The multipliers and the implied value one protocol gets under `model` and `comps`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  comps: Comps,
): { implied: number; catMultiple: number; catComps: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple: catMultiple, comps: catComps } = categoryMultiple(protocol.category, comps);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = 1 + model.chain_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_max);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * catMultiple * growthMult * maturityMult * chainMult));
  return { implied, catMultiple, catComps, growthPct, growthMult, maturityMult, chainMult, age };
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole wrapped / staked / staking word in the name: a product of a token that trades. */
const WRAPPED = /\b(wrapped|staked|staking)\b/i;
/** A name that begins with an exchange's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** Categories the watchlist rule keeps off the list: bridges and staking products of tokens that trade. */
const WRAPPER_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol is one the board may rank: pre-token and not a wrapper product, by the watchlist's own smell test. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !WRAPPER_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = buildComps(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the watchlist floor, by TVL, capped. Never
  // a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, comps);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      cat_multiple: round4(s.v.catMultiple),
      cat_comps: s.v.catComps,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      chain_multiplier: round4(s.v.chainMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} USDC to ${name} on ${chain}.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) return `Add $${capital} liquidity to ${name}'s main pool on ${chain}.`;
  if (c.includes('bridge')) return `Bridge $${capital} USDC to ${chain} via ${name}; use it in-app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain asset via ${name}; keep receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} USDC margin on ${name}; open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain}; hold shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset via ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield asset on ${chain}; hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain}; keep policy.`;
  return `Deposit $${capital} USDC into ${name} on ${chain}.`;
}

/**
 * A protocol's farm plan: three steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * Steps stay short on purpose: the dashboard's data.js must fit the dossier's text cap whole.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 250 ? '~$8' : capital >= 100 ? '~$4' : '~$3';
  return [
    {
      text: `Fresh wallet, farming funds only, seed offline.`,
      cost: '<$3 gas',
      time: '5 min',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} + ${gas} gas`,
      time: '15 min',
    },
    {
      text: `Hold ${hold}d, act weekly, claim via official links only.`,
      cost: '~$2 gas/wk',
      time: '10 min/wk',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. Steps ride along: the page shows exactly what the board files. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    cat_multiple: row.model.cat_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = buildComps(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: Math.round(comps.globalMultiple * 1e4) / 1e4,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/**
 * A compact data.js: the dashboard's whole dataset as one script, no fetch and no network.
 * Rows ride as arrays in a fixed order so the file stays small enough for the dossier's text cap:
 * [rank, slug, name, category, chains, tvl_usd, change_7d, age_days, implied_value_usd, cat_multiple,
 *  growth_multiplier, maturity_multiplier, chain_multiplier, [step, step, step], watchlist_flag].
 * Live rows ride as [slug, name, category, tvl_usd, mcap_usd, change_7d].
 * The steps are the board's own strings, so the page shows exactly what board.json files.
 */
export function dataScript(radar: RadarData, board: BoardRow[], watchlist: string[]): string {
  const steps = new Map(board.map((r) => [r.slug, r.farm_steps]));
  const wl = new Set(watchlist);
  const rows = radar.rows.map((r) => [
    r.rank,
    r.slug,
    r.name,
    r.category,
    r.chains,
    r.tvl_usd,
    r.change_7d,
    r.age_days,
    r.implied_value_usd,
    r.cat_multiple,
    r.growth_multiplier,
    r.maturity_multiplier,
    r.chain_multiplier,
    steps.get(r.slug) ?? [],
    wl.has(r.slug) ? 1 : 0,
  ]);
  const live = radar.live.map((l) => [l.slug, l.name, l.category, l.tvl_usd, l.mcap_usd, l.change_7d]);
  const doc = {
    as_of: radar.as_of,
    floor: radar.floor_usd,
    model: radar.model_version,
    global: radar.global_multiple,
    watch: radar.watchlist_size,
    board: radar.board_size,
    early: radar.early_size,
    live_n: radar.live_size,
    rows,
    live,
  };
  return `window.RADAR=${JSON.stringify(doc)};\n`;
}
