import { existsSync, readFileSync, statSync } from 'node:fs';
import type { ReleaseSettings, SchedulerJob, Step } from './release-plan';
import { ENV_FILE_TOKEN } from './release-plan';
import { describeStep, executeSteps, type RunResult, type StepDeps } from './run-steps';

const settings = {
  projectId: 'debus-x',
  region: 'us-central1',
  projectNumber: '123',
  deploySa: 'deployer@debus-x.iam.gserviceaccount.com',
} as ReleaseSettings;

const job: SchedulerJob = {
  name: 'ventas-outbox-flush',
  schedule: '* * * * *',
  path: '/outbox/flush',
};
const url = 'https://ventas-123.us-central1.run.app';

function deps(results: (argv: string[]) => RunResult = () => ({ code: 0, stdout: '' })) {
  const run = jest.fn((argv: string[]) => Promise.resolve(results(argv)));
  const fetchStatus = jest.fn<Promise<number>, [string, Record<string, string>]>();
  fetchStatus.mockResolvedValue(200);
  const sleep = jest.fn(() => Promise.resolve());
  const log = jest.fn();
  const value: StepDeps = { run, fetchStatus, sleep, log };
  return { ...value, run, fetchStatus, sleep, log };
}

const command = (overrides: Partial<Extract<Step, { kind: 'command' }>> = {}): Step => ({
  kind: 'command',
  label: 'Do it',
  argv: ['gcloud', 'run', 'deploy', 'ventas'],
  ...overrides,
});

const health = (privateService: boolean): Step => ({
  kind: 'health',
  label: 'Check ventas health',
  url,
  path: '/health',
  privateService,
});

describe('describeStep', () => {
  it('shows the variable names of a deploy and never their values', () => {
    const text = describeStep(
      command({ envVarsFile: { JWT_PRIVATE_KEY: 'very-secret', DEBUS_ENV: 'production' } }),
    );
    expect(text).toContain('JWT_PRIVATE_KEY, DEBUS_ENV');
    expect(text).not.toContain('very-secret');
  });

  it('shows the producer of a piped build', () => {
    expect(describeStep(command({ stdinFrom: ['git', 'archive', 'abc'] }))).toContain(
      'git archive abc | gcloud',
    );
  });

  it('describes health checks and schedules', () => {
    expect(describeStep(health(false))).toContain(`GET ${url}/health`);
    expect(describeStep({ kind: 'scheduler', label: 'Schedule it', job, url, settings })).toContain(
      `* * * * * POST ${url}/outbox/flush`,
    );
  });
});

describe('executeSteps', () => {
  it('only prints the steps in a dry run', async () => {
    const d = deps();
    await executeSteps([command(), health(false)], d, { apply: false });
    expect(d.log).toHaveBeenCalledTimes(2);
    expect(d.run).not.toHaveBeenCalled();
    expect(d.fetchStatus).not.toHaveBeenCalled();
  });

  it('runs a command with its environment and its producer', async () => {
    const d = deps();
    await executeSteps([command({ env: { A: '1' }, stdinFrom: ['git', 'archive', 'abc'] })], d, {
      apply: true,
    });
    expect(d.run).toHaveBeenCalledWith(['gcloud', 'run', 'deploy', 'ventas'], {
      env: { A: '1' },
      stdinFrom: ['git', 'archive', 'abc'],
    });
  });

  it('stops at the first command that fails and names it', async () => {
    const d = deps(() => ({ code: 3, stdout: '' }));
    await expect(executeSteps([command(), health(false)], d, { apply: true })).rejects.toThrow(
      'Do it failed (exit 3)',
    );
    expect(d.run).toHaveBeenCalledTimes(1);
  });

  it('hands the variables to the command in a private file and removes it afterwards', async () => {
    let file = '';
    let content = '';
    let mode = 0;
    const d = deps((argv) => {
      file = argv[argv.indexOf('--env-vars-file') + 1] ?? '';
      content = readFileSync(file, 'utf8');
      mode = statSync(file).mode & 0o777;
      return { code: 0, stdout: '' };
    });
    await executeSteps(
      [
        command({
          argv: ['gcloud', 'run', 'deploy', 'ventas', '--env-vars-file', ENV_FILE_TOKEN],
          envVarsFile: { KEY: 'line\\nbreak|with,separators' },
        }),
      ],
      d,
      { apply: true },
    );
    expect(JSON.parse(content)).toEqual({ KEY: 'line\\nbreak|with,separators' });
    expect(mode).toBe(0o600);
    expect(existsSync(file)).toBe(false);
  });

  it('removes the variables file even when the command fails', async () => {
    let file = '';
    const d = deps((argv) => {
      file = argv[argv.indexOf('--env-vars-file') + 1] ?? '';
      return { code: 1, stdout: '' };
    });
    await expect(
      executeSteps(
        [
          command({
            argv: ['gcloud', '--env-vars-file', ENV_FILE_TOKEN],
            envVarsFile: { KEY: 'value' },
          }),
        ],
        d,
        { apply: true },
      ),
    ).rejects.toThrow('failed');
    expect(existsSync(file)).toBe(false);
  });

  it('creates a scheduler job that does not exist and updates the one that does', async () => {
    const missing = deps((argv) => ({ code: argv[3] === 'describe' ? 1 : 0, stdout: '' }));
    const step: Step = { kind: 'scheduler', label: 'Schedule', job, url, settings };
    await executeSteps([step], missing, { apply: true });
    expect(missing.run.mock.calls[1]?.[0].slice(0, 5)).toEqual([
      'gcloud',
      'scheduler',
      'jobs',
      'create',
      'http',
    ]);

    const present = deps();
    await executeSteps([step], present, { apply: true });
    expect(present.run.mock.calls[1]?.[0][3]).toBe('update');
  });

  it('checks a public service without a token', async () => {
    const d = deps();
    await executeSteps([health(false)], d, { apply: true });
    expect(d.fetchStatus).toHaveBeenCalledWith(`${url}/health`, {});
    expect(d.run).not.toHaveBeenCalled();
  });

  it('checks a private service with the identity token of the account running the release', async () => {
    const d = deps(() => ({ code: 0, stdout: 'token\n' }));
    await executeSteps([health(true)], d, { apply: true });
    expect(d.run).toHaveBeenCalledWith(['gcloud', 'auth', 'print-identity-token'], {
      capture: true,
    });
    expect(d.fetchStatus).toHaveBeenCalledWith(`${url}/health`, {
      'X-Serverless-Authorization': 'Bearer token',
    });
  });

  it('retries the health check while the new revision starts', async () => {
    const d = deps();
    d.fetchStatus.mockResolvedValueOnce(503).mockRejectedValueOnce(new Error('reset'));
    await executeSteps([health(false)], d, { apply: true });
    expect(d.fetchStatus).toHaveBeenCalledTimes(3);
    expect(d.sleep).toHaveBeenCalledTimes(2);
  });

  it('fails when the service never answers', async () => {
    const d = deps();
    d.fetchStatus.mockResolvedValue(500);
    await expect(executeSteps([health(false)], d, { apply: true })).rejects.toThrow(
      'Check ventas health failed (HTTP 500)',
    );
    expect(d.fetchStatus).toHaveBeenCalledTimes(5);
  });

  it('reports a service that cannot be reached at all', async () => {
    const d = deps();
    d.fetchStatus.mockRejectedValue(new Error('down'));
    await expect(executeSteps([health(false)], d, { apply: true })).rejects.toThrow('no response');
  });

  it('fails when the identity token cannot be minted', async () => {
    const d = deps(() => ({ code: 1, stdout: '' }));
    await expect(executeSteps([health(true)], d, { apply: true })).rejects.toThrow(
      'Identity token',
    );
  });
});
