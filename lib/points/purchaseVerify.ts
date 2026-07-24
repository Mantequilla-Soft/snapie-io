import HiveClient from '@/lib/hive/hiveclient';
import { POINTS_RECEIVING_ACCOUNT } from '@/lib/points/purchaseConfig';

interface HiveTransaction {
  operations: [string, Record<string, unknown>][];
}

// Same spread used by hiveVerify's action verification — rides out block
// propagation right after a broadcast (a just-broadcast tx may not be
// queryable on our node for a few seconds).
const RETRY_DELAYS_MS = [0, 2000, 4000];
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function getTransaction(txid: string): Promise<HiveTransaction | null> {
  try {
    const res = await HiveClient.database.call('get_transaction', [txid]);
    return res && Array.isArray(res.operations) ? (res as HiveTransaction) : null;
  } catch {
    return null; // not found (yet) or a transient node error — caller retries
  }
}

/** Parses a Hive amount string like "5.000 HBD" into { amount: 5, currency:
 *  'HBD' }. Returns null if it doesn't parse (malformed/unexpected shape). */
function parseAmount(raw: unknown): { amount: number; currency: string } | null {
  if (typeof raw !== 'string') return null;
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s+([A-Z]+)$/);
  if (!match) return null;
  return { amount: parseFloat(match[1]), currency: match[2] };
}

/** Confirms a `transfer` operation with the given txid provably happened
 *  on-chain, was sent by `expectedFrom`, landed on the points-receiving
 *  account, and was paid in HBD. A transaction can bundle multiple
 *  operations (e.g. a batched broadcast), so this searches all of them
 *  rather than assuming the transfer is operation zero. Returns the
 *  ON-CHAIN amount — never trust a client-supplied amount for points math.
 *  Returns null if no matching transfer is found after retries. */
export async function verifyTransfer(
  txid: string,
  expectedFrom: string,
): Promise<{ hbdAmount: number } | null> {
  if (!txid || typeof txid !== 'string') return null;

  for (const wait of RETRY_DELAYS_MS) {
    if (wait) await delay(wait);

    const tx = await getTransaction(txid);
    if (!tx) continue; // not propagated yet — retry

    for (const [opName, opBody] of tx.operations) {
      if (opName !== 'transfer') continue;
      const from = opBody.from;
      const to = opBody.to;
      if (typeof from !== 'string' || typeof to !== 'string') continue;
      if (!eq(from, expectedFrom) || !eq(to, POINTS_RECEIVING_ACCOUNT)) continue;

      const parsed = parseAmount(opBody.amount);
      if (!parsed || parsed.currency !== 'HBD') continue;

      return { hbdAmount: parsed.amount };
    }
    // Transaction found but no matching transfer op in it — no point
    // retrying further attempts against the same immutable transaction.
    return null;
  }
  return null;
}
