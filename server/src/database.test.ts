import { afterEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectMongoDB } from '../models/mongo';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('MongoDB startup', () => {
  it('requires an explicit URI instead of using a mock database', async () => {
    vi.stubEnv('MONGO_URI', '');
    vi.stubEnv('MONGODB_URI', '');
    const connect = vi.spyOn(mongoose, 'connect');
    await expect(connectMongoDB()).rejects.toThrow('Configure MONGO_URI or MONGODB_URI');
    expect(connect).not.toHaveBeenCalled();
  });
  it.each(['MONGO_URI', 'MONGODB_URI'])('supports %s and fails clearly when connection fails', async (key) => {
    vi.stubEnv('MONGO_URI', '');
    vi.stubEnv('MONGODB_URI', '');
    vi.stubEnv(key, 'mongodb://127.0.0.1:27017/desk_test');
    const connect = vi.spyOn(mongoose, 'connect').mockRejectedValue(new Error('Connection refused'));
    await expect(connectMongoDB()).rejects.toThrow('Unable to connect to MongoDB');
    expect(connect).toHaveBeenCalledWith('mongodb://127.0.0.1:27017/desk_test', { serverSelectionTimeoutMS: 10000 });
  });
  it('rejects standalone MongoDB before attempting transactional operations', async () => {
    vi.stubEnv('MONGO_URI', 'mongodb://127.0.0.1:27017/desk_test');
    vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
    vi.spyOn(mongoose, 'disconnect').mockResolvedValue(undefined);
    const previousDb = mongoose.connection.db;
    Reflect.set(mongoose.connection, 'db', { command: vi.fn().mockResolvedValue({ ok: 1 }) });
    try {
      await expect(connectMongoDB()).rejects.toThrow('replica set or sharded cluster');
      expect(mongoose.disconnect).toHaveBeenCalled();
    } finally {
      Reflect.set(mongoose.connection, 'db', previousDb);
    }
  });
});
