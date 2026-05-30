import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI!;
const MONGODB_DB = process.env.MONGODB_DB_NAME || 'snapiechat';

if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined');

declare global {
  // eslint-disable-next-line no-var
  var _mongooseConn: Promise<typeof mongoose> | undefined;
}

export async function connectDB(): Promise<typeof mongoose> {
  if (global._mongooseConn) return global._mongooseConn;
  const connPromise = mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
  global._mongooseConn = connPromise;
  try {
    return await connPromise;
  } catch (err) {
    global._mongooseConn = undefined;
    throw err;
  }
}
