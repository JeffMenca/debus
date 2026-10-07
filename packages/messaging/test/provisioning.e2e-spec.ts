import { PubSub } from '@google-cloud/pubsub';
import { applyPubSubPlan, provisionPubSub } from '../src/provisioning/apply-pubsub-plan';
import { planInputFromEnv } from '../src/provisioning/plan-input';
import { buildPubSubPlan } from '../src/provisioning/pubsub-plan';

describe('Pub/Sub provisioning against the emulator', () => {
  const projectId = process.env.PUBSUB_PROJECT_ID ?? 'debus-local';
  const pubsub = new PubSub({ projectId });
  const plan = buildPubSubPlan({ env: 'local', projectId });
  const quiet = (): void => undefined;

  afterAll(() => pubsub.close());

  it('is idempotent and leaves every subscription with its filter and push endpoint', async () => {
    await provisionPubSub(planInputFromEnv(process.env), quiet);
    await applyPubSubPlan(pubsub, plan, quiet);

    const [metadata] = await pubsub.subscription('ventas-from-viajes').getMetadata();
    expect(metadata.filter).toBe(
      plan.subscriptions.find((s) => s.name === 'ventas-from-viajes')?.filter,
    );
    expect(metadata.pushConfig?.pushEndpoint).toBe(
      'http://host.docker.internal:4004/events/pubsub',
    );
  });

  it('recreates a subscription whose filter changed', async () => {
    const changed = {
      ...plan,
      subscriptions: plan.subscriptions.map((s) =>
        s.name === 'ventas-from-viajes'
          ? { ...s, filter: 'attributes.type = "ViajeEliminado"' }
          : s,
      ),
    };
    const log = jest.fn();

    await applyPubSubPlan(pubsub, changed, log);
    await applyPubSubPlan(pubsub, plan, quiet);

    expect(log).toHaveBeenCalledWith(
      'subscription ventas-from-viajes recreated because its filter changed',
    );
  });
});
