import { ensureTopic } from './ensure-topic';

const createTopic = jest.fn();
const close = jest.fn();
jest.mock('@google-cloud/pubsub', () => ({
  PubSub: jest.fn(() => ({ createTopic, close })),
}));

beforeEach(() => {
  createTopic.mockReset().mockResolvedValue(undefined);
  close.mockReset().mockResolvedValue(undefined);
});

describe('ensureTopic', () => {
  it('creates the topic of a service', async () => {
    await expect(ensureTopic('reportes')).resolves.toBeUndefined();

    expect(createTopic).toHaveBeenCalledWith('reportes-events');
    expect(close).toHaveBeenCalled();
  });

  it('ignores that the topic already exists', async () => {
    createTopic.mockRejectedValueOnce(Object.assign(new Error('exists'), { code: 6 }));

    await expect(ensureTopic('reportes')).resolves.toBeUndefined();

    expect(close).toHaveBeenCalled();
  });

  it('rethrows any other error', async () => {
    createTopic.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 7 }));

    await expect(ensureTopic('reportes')).rejects.toThrow('denied');
    expect(close).toHaveBeenCalled();
  });
});
