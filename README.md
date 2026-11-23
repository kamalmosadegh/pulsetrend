# PulseTrend — cbBTC/USDC Breakout Trading Bot

![TypeScript](https://img.shields.io/badge/typescript-Node%2022-blue)
![License](https://img.shields.io/badge/license-MIT-green)

A deterministic, long-only trading bot for Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute bars. It speaks the `agent-fun/bars-replay/v1` line protocol — one JSON batch per minute bar in, one reply with orders out — through a vendored protocol shim, and trades paper capital against real on-chain pool prices with a 4 bps fee, 2 bps slippage and constant-product price impact charged on every fill.

## What it is

Minute bars of a thin on-chain pool are noisy, and a round trip costs roughly 30–45 bps in fees, slippage and impact, so fast indicator crosses whipsaw — they pay that spread again and again in a sideways tape. PulseTrend trades rarely instead: it waits for a move that has already proved itself bigger than the noise, sizes close to full equity so the move matters, and then holds through ordinary chop, leaving only on a genuine reversal.

## Strategy

- **Entry** — the close breaks above the highest close of the last 90 minutes *and* the 90-minute return is already at least +0.8%. One buy, 92% of the cash held.
- **Exit** — the close falls under the lowest close of the last 6 hours (the trend has genuinely given back its gains), or a hard disaster stop 2.8% under the entry price is hit first.
- **Risk shape** — at most one open position, no shorts, no leverage, cash never below zero, and every order refuses a fill worse than 2% from the latest close (`max_slippage_bps`).

Everything is a pure function of the bars seen so far — no wall clock, no randomness, no environment reads — so two executions on the same data produce byte-identical orders.

## Results

Backtested with the replay harness on a frozen 24-hour window of cbBTC/USDC 1-minute bars (1,440 bars recorded from the Orca Whirlpool pool on Solana), starting from 1,000 USDC of paper capital:

- **Net PnL +3.39 USDC** after every fee, slippage and price impact
- **Still positive at 2× fees:** +1.91 USDC
- **3 filled orders**, 53% market exposure
- **Maximum drawdown 2.45%** — far inside a 25% risk budget

An earlier EMA-cross design was tested first and rejected: it churned 42 trades in the same window and lost money to fees. The breakout rule makes fewer, larger decisions.

## How to run

The bot runs under the bars-replay harness as:

```bash
node main.ts
```

It reads `hello`, one `batch` per minute bar and `done` on stdin, and writes exactly one `reply` per batch on stdout. Node 22 or later, standard library only — nothing to install.

## Layout

- `main.ts` — the strategy
- `vendor/makefun-bars.ts` — the bars-replay protocol shim (vendored)

## License

MIT — see `LICENSE`.

## Author

Kamal Mosadegh — freelance developer (Pine Script & TradingView indicators, trading bots, Python tools, Android apps). Contact by email only: kamalmosadegh6977@gmail.com
