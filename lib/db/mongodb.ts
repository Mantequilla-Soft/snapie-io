import mongoose from 'mongoose';

const MONGODB_DB = process.env.MONGODB_DB_NAME || 'snapiechat';

declare global {
  // eslint-disable-next-line no-var
  var _mongooseConn: Promise<typeof mongoose> | undefined;
}

// Checked lazily, inside connectDB, rather than at module-import time — a
// module that transitively imports this file (e.g. a discovery module that
// only sometimes touches Mongo) shouldn't crash on import just because this
// file was pulled in; it should only fail if it actually tries to connect.
export async function connectDB(): Promise<typeof mongoose> {
  if (global._mongooseConn) return global._mongooseConn;
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined');
  const connPromise = mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
  global._mongooseConn = connPromise;
  try {
    return await connPromise;
  } catch (err) {
    global._mongooseConn = undefined;
    throw err;
  }
}
