import mongoose from 'mongoose';

declare global {
  // eslint-disable-next-line no-var
  var _mongooseConn: Promise<typeof mongoose> | undefined;
}

/** Compose sets `MONGODB_IP_FAMILY=4` so Node does not dial an unreachable IPv6 address for `mongo`. */
export function mongoConnectOptions(
  env: Record<string, string | undefined> = process.env,
): mongoose.ConnectOptions {
  const family = env.MONGODB_IP_FAMILY === '4' || env.MONGODB_IP_FAMILY === '6' ? Number(env.MONGODB_IP_FAMILY) : undefined;
  return {
    dbName: env.MONGODB_DB_NAME || 'snapiechat',
    ...(family ? { family } : {}),
  };
}

// Checked lazily, inside connectDB, rather than at module-import time — a
// module that transitively imports this file (e.g. a discovery module that
// only sometimes touches Mongo) shouldn't crash on import just because this
// file was pulled in; it should only fail if it actually tries to connect.
export async function connectDB(): Promise<typeof mongoose> {
  if (global._mongooseConn) return global._mongooseConn;
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined');
  const connPromise = mongoose.connect(MONGODB_URI, mongoConnectOptions());
  global._mongooseConn = connPromise;
  try {
    return await connPromise;
  } catch (err) {
    global._mongooseConn = undefined;
    throw err;
  }
}
