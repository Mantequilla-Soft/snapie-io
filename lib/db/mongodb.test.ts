import { describe, expect, it } from 'vitest';
import { mongoConnectOptions } from '@/lib/db/mongodb';

describe('mongoConnectOptions', () => {
  it('uses the named database and leaves the IP family to the driver', () => {
    expect(mongoConnectOptions({ MONGODB_DB_NAME: 'snapiechat' })).toEqual({ dbName: 'snapiechat' });
  });

  it('forces IPv4 when the compose preview asks for it', () => {
    expect(mongoConnectOptions({ MONGODB_IP_FAMILY: '4' })).toMatchObject({ dbName: 'snapiechat', family: 4 });
  });
});
