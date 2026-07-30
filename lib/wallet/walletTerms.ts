export type WalletTermKey = 'liquidHive' | 'hivePower' | 'hbd' | 'convert' | 'swap' | 'delegate';

interface WalletTerm {
  title: string;
  body: string;
}

/**
 *  Copy for the wallet's "what is this?" info icons — scoped to the terms
 *  that are genuinely ambiguous (HIVE vs HP, HBD, Convert vs Swap, Delegate),
 *  not every label on the page. "Send" doesn't need an explainer; "what's
 *  the difference between Convert and Swap" does.
 */
export const WALLET_TERMS: Record<WalletTermKey, WalletTerm> = {
  liquidHive: {
    title: 'Liquid HIVE',
    body: "The HIVE sitting freely in your wallet — you can send it, trade it, or power it up any time. It's separate from Hive Power, which is staked and not instantly spendable.",
  },
  hivePower: {
    title: 'Hive Power (HP)',
    body: "HIVE you've staked into the network. It gives you more voting weight and more daily bandwidth for actions like posting and commenting, but it isn't instantly spendable — powering back down to liquid HIVE happens gradually, over about 13 weeks.",
  },
  hbd: {
    title: 'HBD',
    body: "Hive Backed Dollar — a stablecoin native to the Hive blockchain, designed to track roughly $1 USD. It's a separate balance from HIVE, and behaves like a stable currency rather than a volatile one.",
  },
  convert: {
    title: 'Convert',
    body: "Burns your HBD and mints HIVE at the blockchain's own exchange rate — a 3.5-day rolling median price. It takes about 3.5 days to complete. Slower than a Swap, but the rate is smoothed rather than whatever the market happens to be doing right now.",
  },
  swap: {
    title: 'Swap',
    body: 'An instant trade between HIVE and HBD at the current market rate, filled immediately or not at all. Faster than Convert, but the price is whatever the market is offering right now rather than a smoothed multi-day average.',
  },
  delegate: {
    title: 'Delegate',
    body: "Lends your Hive Power's voting weight to another account without transferring ownership — your HIVE balance doesn't change. You can undelegate any time; the power returns to you after a short cooldown.",
  },
};
