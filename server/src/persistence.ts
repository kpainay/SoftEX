import { relative, resolve, isAbsolute } from 'node:path';

/**
 * On Railway a service's disk is replaced on every deploy unless a volume is
 * mounted. With the built-in SQLite database, starting without one means the
 * new version comes up with an empty database and every workspace appears to
 * be gone. Returns why it is unsafe to start, or null when it is fine.
 *
 * Railway sets RAILWAY_ENVIRONMENT (and friends) on every service, and
 * RAILWAY_VOLUME_MOUNT_PATH when a volume is attached.
 */
export function ephemeralStorageProblem(
  env: NodeJS.ProcessEnv,
  paths: { dataDir: string; dbPath: string; uploadDir: string; uploadsOnS3: boolean; usingPostgres: boolean },
): string | null {
  const onRailway = Boolean(env.RAILWAY_ENVIRONMENT || env.RAILWAY_ENVIRONMENT_NAME || env.RAILWAY_PROJECT_ID || env.RAILWAY_SERVICE_ID);
  if (!onRailway || env.SOFTEX_ALLOW_EPHEMERAL_STORAGE === 'true') return null;

  const mount = env.RAILWAY_VOLUME_MOUNT_PATH;
  const onVolume = (path: string) => {
    if (!mount) return false;
    const rel = relative(resolve(mount), resolve(path));
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  };

  const lost: string[] = [];
  if (!paths.usingPostgres && !onVolume(paths.dbPath)) lost.push(`the database (${paths.dbPath})`);
  if (!paths.uploadsOnS3 && !onVolume(paths.uploadDir)) lost.push(`uploaded files (${paths.uploadDir})`);
  if (!lost.length) return null;

  return [
    `Refusing to start: on Railway, ${lost.join(' and ')} would be erased on the next deploy, because ${
      mount ? `the volume is mounted at ${mount}, not at ${paths.dataDir}` : 'no volume is attached to this service'
    }.`,
    `Fix: attach a volume to this service with the mount path ${paths.dataDir}, and set RAILWAY_RUN_UID=0 (see docs/DEPLOY_RAILWAY.md, step 2).`,
    'Or use PostgreSQL (SOFTEX_DATABASE_URL) and S3 storage (SOFTEX_S3_BUCKET), which need no volume.',
    'To start anyway with throwaway data (a demo), set SOFTEX_ALLOW_EPHEMERAL_STORAGE=true.',
  ].join('\n');
}
