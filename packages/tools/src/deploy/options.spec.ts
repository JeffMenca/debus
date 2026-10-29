import { parseReleaseArgs, releaseSettings } from './options';

const secrets = {
  smtpUser: '',
  smtpPassword: '',
  jwtPrivateKey: '',
  jwtPublicKey: '',
  bootstrapAdminEmail: '',
};

describe('parseReleaseArgs', () => {
  it('defaults to a dry run of every phase for the affected units', () => {
    expect(parseReleaseArgs(['plan'])).toEqual({
      command: 'plan',
      units: [],
      phases: ['build', 'provision', 'deploy'],
      apply: false,
      allowUnmerged: false,
    });
  });

  it('reads units and phases', () => {
    const options = parseReleaseArgs(['release', '--units', 'ventas, web', '--phase', 'deploy']);
    expect(options.units).toEqual(['ventas', 'web']);
    expect(options.phases).toEqual(['deploy']);
    expect(options.apply).toBe(false);
  });

  it('needs the production confirmation to apply', () => {
    expect(() => parseReleaseArgs(['release', '--apply'])).toThrow('--confirm production');
    expect(() => parseReleaseArgs(['release', '--apply', '--confirm', 'yes'])).toThrow(
      '--confirm production',
    );
    expect(parseReleaseArgs(['release', '--apply', '--confirm', 'production']).apply).toBe(true);
  });

  it('never applies a plan', () => {
    expect(() => parseReleaseArgs(['plan', '--apply', '--confirm', 'production'])).toThrow(
      'plan never changes anything',
    );
  });

  it('allows a release from a commit that is not on main only when asked', () => {
    expect(parseReleaseArgs(['release', '--allow-unmerged']).allowUnmerged).toBe(true);
  });

  it('rejects unknown commands, units, phases and flags', () => {
    expect(() => parseReleaseArgs([])).toThrow('Usage');
    expect(() => parseReleaseArgs(['ship'])).toThrow('Usage');
    expect(() => parseReleaseArgs(['plan', '--units', 'billing'])).toThrow('Unknown unit');
    expect(() => parseReleaseArgs(['plan', '--phase', 'later'])).toThrow('Unknown phase');
    expect(() => parseReleaseArgs(['plan', '--force'])).toThrow('Unknown argument');
    expect(() => parseReleaseArgs(['plan', '--units'])).toThrow('needs a value');
  });
});

describe('releaseSettings', () => {
  const discovered = { projectId: 'debus-x', projectNumber: '123', mediaBucket: 'media' };

  it('uses what the bootstrap creates when nothing is set', () => {
    expect(releaseSettings({}, discovered, secrets)).toEqual({
      projectId: 'debus-x',
      projectNumber: '123',
      region: 'us-central1',
      artifactRepo: 'debus',
      cloudSqlPrefix: 'debus-x:us-central1:debus-pg',
      deploySa: 'github-deployer@debus-x.iam.gserviceaccount.com',
      mediaBucket: 'media',
      appSecrets: secrets,
    });
  });

  it('lets the GCP variables override the defaults', () => {
    const settings = releaseSettings(
      {
        GCP_PROJECT_ID: 'other',
        GCP_REGION: 'europe-west1',
        GCP_ARTIFACT_REPO: 'repo',
        GCP_CLOUDSQL_PREFIX: 'other:europe-west1:pg',
        GCP_DEPLOY_SA: 'sa@other.iam.gserviceaccount.com',
        GCP_PROJECT_NUMBER: '9',
        MEDIA_BUCKET: 'bucket',
      },
      discovered,
      secrets,
    );
    expect(settings).toMatchObject({
      projectId: 'other',
      projectNumber: '9',
      region: 'europe-west1',
      artifactRepo: 'repo',
      cloudSqlPrefix: 'other:europe-west1:pg',
      deploySa: 'sa@other.iam.gserviceaccount.com',
      mediaBucket: 'bucket',
    });
  });
});
