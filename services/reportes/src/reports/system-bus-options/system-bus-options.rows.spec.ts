import { toBusOptionRow } from './system-bus-options.rows';

describe('toBusOptionRow', () => {
  it('maps a raw bus to the option the filter shows', () => {
    expect(
      toBusOptionRow({
        id: '1f0e2d3c-4b5a-4968-8776-655443322110',
        plate: 'C482BTX',
        brand: 'Volvo',
        model: 'B8R',
        branch_name: 'Quetzaltenango',
      }),
    ).toEqual({
      id: '1f0e2d3c-4b5a-4968-8776-655443322110',
      plate: 'C482BTX',
      brand: 'Volvo',
      model: 'B8R',
      branchName: 'Quetzaltenango',
    });
  });
});
