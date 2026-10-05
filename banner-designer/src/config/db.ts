import mongoose from 'mongoose';

/**
 * Serverless-safe Mongoose connection. Next.js (dev HMR and serverless runtimes)
 * re-evaluates modules frequently; without caching this opens a new connection on
 * every invocation and exhausts the pool. We cache the connection (and the
 * in-flight promise) on the global object so it is reused across hot reloads and
 * lambda invocations.
 *
 * Command buffering is left at Mongoose's default (enabled) so callers that
 * fire-and-forget `connectDB()` and immediately issue queries still work.
 */

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var _mongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = global._mongooseCache ?? { conn: null, promise: null };
global._mongooseCache = cache;

const connectDB = async (): Promise<typeof mongoose> => {
  if (!process.env.MONGO_URI) {
    throw new Error('Error: MONGO_URI env not loaded.');
  }

  if (cache.conn) {
    return cache.conn;
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(process.env.MONGO_URI);
  }

  try {
    cache.conn = await cache.promise;
  } catch (error) {
    cache.promise = null;
    throw error;
  }

  return cache.conn;
};

export default connectDB;
