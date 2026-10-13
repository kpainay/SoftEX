import { describe, expect, it } from 'vitest';
import { ephemeralStorageProblem } from '../src/persistence.js';

const paths = { dataDir: '/app/server/data', dbPath: '/app/server/data/softex.db', uploadsOnS3: false, usingPostgres: false };
const railway = { RAILWAY_ENVIRONMENT: 'production', RAILWAY_PROJECT_ID: 'p1' };

describe('refusing to start where data would be erased on the next deploy', () => {
  it('starts normally off Railway', () => {
    expect(ephemeralStorageProblem({}, paths)).toBeNull();
  });

  it('refuses on Railway with SQLite and no volume, and says how to fix it', () => {
    const problem = ephemeralStorageProblem(railway, paths);
    expect(problem).toMatch(/no volume is attached/);
    expect(problem).toMatch(/mount path \/app\/server\/data/);
    expect(problem).toMatch(/RAILWAY_RUN_UID=0/);
  });

  it('refuses when the volume is mounted somewhere else', () => {
    expect(ephemeralStorageProblem({ ...railway, RAILWAY_VOLUME_MOUNT_PATH: '/data' }, paths)).toMatch(/mounted at \/data, not at \/app\/server\/data/);
  });

  it('starts when the volume holds the data directory (or a parent of it)', () => {
    expect(ephemeralStorageProblem({ ...railway, RAILWAY_VOLUME_MOUNT_PATH: '/app/server/data' }, paths)).toBeNull();
    expect(ephemeralStorageProblem({ ...railway, RAILWAY_VOLUME_MOUNT_PATH: '/app/server/data/' }, paths)).toBeNull();
    expect(ephemeralStorageProblem({ ...railway, RAILWAY_VOLUME_MOUNT_PATH: '/app' }, paths)).toBeNull();
    // A sibling whose name only starts the same way is not a parent.
    expect(ephemeralStorageProblem({ ...railway, RAILWAY_VOLUME_MOUNT_PATH: '/app/server/dat' }, paths)).not.toBeNull();
  });

  it('starts without a volume when PostgreSQL and S3 hold everything', () => {
    expect(ephemeralStorageProblem(railway, { ...paths, usingPostgres: true, uploadsOnS3: true })).toBeNull();
    // PostgreSQL alone still loses uploaded files.
    expect(ephemeralStorageProblem(railway, { ...paths, usingPostgres: true })).toMatch(/uploaded files/);
  });

  it('can be overridden for a throwaway demo', () => {
    expect(ephemeralStorageProblem({ ...railway, SOFTEX_ALLOW_EPHEMERAL_STORAGE: 'true' }, paths)).toBeNull();
  });
});
