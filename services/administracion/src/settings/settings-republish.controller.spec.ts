import { SettingsRepublishController } from './settings-republish.controller';

describe('SettingsRepublishController', () => {
  it('republishes every settings version with the correlation id of the call', async () => {
    const republish = { republish: jest.fn().mockResolvedValue({ republished: 2 }) };

    const result = await new SettingsRepublishController(republish as never).republish('c-9');

    expect(result).toEqual({ republished: 2 });
    expect(republish.republish).toHaveBeenCalledWith('c-9');
  });
});
