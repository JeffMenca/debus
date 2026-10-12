import { canonicalPath, isInternalPath, isUnderPrefix } from './canonical-path';

describe('canonicalPath', () => {
  it('collapses repeated slashes and lowercases', () => {
    expect(canonicalPath('//API/Flota///Buses')).toBe('/api/flota/buses');
  });

  it('drops the query string and a trailing slash', () => {
    expect(canonicalPath('/api/flota/buses/?a=b')).toBe('/api/flota/buses');
    expect(canonicalPath('/?a=b')).toBe('/');
  });
});

describe('isUnderPrefix', () => {
  it('accepts the prefix itself and its sub-paths', () => {
    expect(isUnderPrefix('/api', '/api')).toBe(true);
    expect(isUnderPrefix('/api/flota', '/api')).toBe(true);
  });

  it('rejects siblings that only share the leading characters', () => {
    expect(isUnderPrefix('/apis', '/api')).toBe(false);
    expect(isUnderPrefix('/', '/api')).toBe(false);
  });
});

describe('isInternalPath', () => {
  it('flags the Pub/Sub, scheduler and service-to-service paths, and nothing else', () => {
    expect(isInternalPath('/events/pubsub')).toBe(true);
    expect(isInternalPath('/outbox/flush')).toBe(true);
    expect(isInternalPath('/internal/availability')).toBe(true);
    expect(isInternalPath('/buses')).toBe(false);
    expect(isInternalPath('/internals')).toBe(false);
  });
});
