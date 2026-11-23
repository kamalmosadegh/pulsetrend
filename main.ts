// PulseTrend — a cbBTC/USDC channel-breakout bot for the
// agent-fun/bars-replay/v1 protocol. It reads one 1-minute bar per batch,
// keeps the recent closes in a ring of channel windows, and answers with
// orders only when price breaks out of its range or falls out of it.
//
// Why this rule: minute bars of a thin on-chain pool are noisy, and a round
// trip costs roughly 30-45 bps in fees, slippage and price impact, so fast
// indicator crosses whipsaw — they pay that spread again and again in a
// sideways tape. This bot trades rarely instead. It buys when the close
// breaks above the highest close of the last ninety minutes while the
// ninety-minute return is already at least +0.8%: a push that has proved
// itself bigger than the noise. It sizes close to full equity so the move
// matters, then holds through ordinary chop — the exit lines are a wide
// six-hour channel low and a hard disaster stop under the entry, so only a
// genuine reversal, not a wiggle, takes it out.
//
// Everything is a pure function of the bars seen so far: no clock, no random,
// no environment, so the two grading executions agree byte for byte.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Rule constants, in bars and basis points.
const ENTRY_LOOKBACK = 90; // ninety minutes of closes define the breakout line
const ENTRY_MIN_RETURN_BPS = 80; // ...and that span must already be up 0.8%
const EXIT_LOOKBACK = 360; // six hours of closes define the wide exit line
const HARD_STOP_BPS = 280; // exit at once if the close falls 2.8% under entry
const SPEND_BPS_OF_CASH = 9200; // deploy 92% of the cash on an entry
const MAX_SLIPPAGE_BPS = 200; // fills worse than 2% from the close are refused

// Running state, rebuilt from scratch on hello.
let closes: number[] = [];
let entryPrice = 0;

function onHello(_state: BarsState): void {
  closes = [];
  entryPrice = 0;
}

// Highest and lowest of the last n closes before the current one.
function channel(n: number): { hi: number; lo: number } {
  let hi = -Infinity;
  let lo = Infinity;
  const start = Math.max(0, closes.length - 1 - n);
  for (let i = start; i < closes.length - 1; i++) {
    if (closes[i] > hi) hi = closes[i];
    if (closes[i] < lo) lo = closes[i];
  }
  return { hi, lo };
}

function onBatch(state: BarsState): OrderInput[] {
  const close = state.close(SYMBOL);
  if (close === null) return [];
  const price = Number(close);
  closes.push(price);

  const position = state.positions.get(SYMBOL);
  const heldQty = position?.qty ?? 0n;
  const holding = heldQty > 0n;

  // The entry rule needs its full lookback of earlier bars first; the exit
  // channel simply uses however much history exists when it is asked.
  if (closes.length <= ENTRY_LOOKBACK) return [];

  if (holding) {
    const disaster = entryPrice > 0 && price <= entryPrice * (1 - HARD_STOP_BPS / 10_000);
    const fellOut = price < channel(EXIT_LOOKBACK).lo;
    if (disaster || fellOut) {
      entryPrice = 0;
      return [
        {
          side: 'sell',
          symbol: SYMBOL,
          qty: heldQty,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }
    return [];
  }

  // Flat: a close above the ninety-minute high, with the ninety-minute
  // return already at least +0.8%, is the entry signal. One order, sized
  // off the cash actually held when the batch is answered.
  const spanStart = closes[closes.length - 1 - ENTRY_LOOKBACK];
  const spanReturnBps = ((price - spanStart) / spanStart) * 10_000;
  const pushed =
    price > channel(ENTRY_LOOKBACK).hi && spanReturnBps >= ENTRY_MIN_RETURN_BPS;
  if (pushed && state.cash > 0n) {
    const spend = (state.cash * BigInt(SPEND_BPS_OF_CASH)) / 10_000n;
    if (spend >= BigInt(state.hello.fees.min_notional_quote_units)) {
      entryPrice = price;
      return [
        {
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: spend,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }
  }
  return [];
}

await runBars({ onHello, onBatch });
