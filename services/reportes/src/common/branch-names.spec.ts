import { BranchNames } from './branch-names';

describe('BranchNames', () => {
  const setup = (row: { name: string } | null) => {
    const findUnique = jest.fn().mockResolvedValue(row);
    return { findUnique, names: new BranchNames({ branchCopy: { findUnique } } as never) };
  };

  it('answers the name of a known branch', async () => {
    const { names, findUnique } = setup({ name: 'Quetzaltenango' });

    await expect(names.nameOf('b1')).resolves.toBe('Quetzaltenango');
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'b1' }, select: { name: true } });
  });

  it('answers null for a branch it never heard of', async () => {
    const { names } = setup(null);

    await expect(names.nameOf('missing')).resolves.toBeNull();
  });
});
