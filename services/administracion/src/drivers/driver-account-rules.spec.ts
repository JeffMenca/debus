import { exampleDriver } from '@debus/contracts';
import { driverAccountChange } from './driver-account-rules';

const user = (over = {}) => ({
  id: exampleDriver.driverId,
  role: 'DRIVER' as const,
  driverVersion: 1,
  ...over,
});

describe('driverAccountChange', () => {
  it('creates the account the first time', () => {
    expect(driverAccountChange(null, exampleDriver)).toBe('create');
  });
  it('applies only newer versions', () => {
    expect(driverAccountChange(user(), { ...exampleDriver, version: 2 })).toBe('update');
    expect(driverAccountChange(user({ driverVersion: 3 }), { ...exampleDriver, version: 2 })).toBe(
      'ignore',
    );
    expect(driverAccountChange(user({ driverVersion: 2 }), { ...exampleDriver, version: 2 })).toBe(
      'ignore',
    );
  });
  it('treats an account without a version as older than any snapshot', () => {
    expect(driverAccountChange(user({ driverVersion: null }), exampleDriver)).toBe('update');
  });
  it('never touches an account that is not a driver with that id', () => {
    expect(driverAccountChange(user({ role: 'CLIENT' }), { ...exampleDriver, version: 2 })).toBe(
      'ignore',
    );
  });
});
