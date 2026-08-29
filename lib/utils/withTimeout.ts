/**
 * Races a promise against a timer, rejecting if the promise hasn't settled
 * in time.
 *
 * dhive's own retry/timeout logic (`retryingFetch` in @hiveio/dhive) works
 * by passing a `timeout` option into `fetch()` — a node-fetch extension
 * that native browser `fetch()` silently ignores. In the browser (where
 * HiveClient always runs, routed through /api/hive-rpc), a stalled
 * connection — a backgrounded tab, a laptop sleep/wake cycle, a proxy that
 * drops an idle connection without ever erroring — can leave that fetch
 * promise pending forever, since dhive's own retry code lives in a `catch`
 * that's never reached. Callers awaiting a HiveClient call with no
 * application-level timeout of their own hang right along with it — and if
 * that await sits behind an in-flight lock (a `isFetching` ref, an
 * in-memory promise cache), the lock never releases either, so every
 * future attempt silently no-ops instead of retrying. Wrap any
 * HiveClient call that guards such a lock with this so a stall always
 * eventually rejects instead of wedging the lock permanently.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = 'Timed out'): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
