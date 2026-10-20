import { Prisma } from '../generated/prisma/client';
import { toBranch, toBranchPayload, toBranchWithAdmins, toPublicLocation } from './branch-mappers';

const row = {
  id: '9b2c7a10-1111-4c4c-8888-123456789abc',
  code: 'XEL',
  name: 'Quetzaltenango',
  department: 'Quetzaltenango',
  municipality: 'Quetzaltenango',
  address: '4a calle 12-30 zona 1',
  phone: '77612233',
  latitude: new Prisma.Decimal('14.834700'),
  longitude: new Prisma.Decimal('-91.518100'),
  active: true,
  version: 2,
  createdById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('branch mappers', () => {
  it('turns decimals into numbers and leaves the admins out', () => {
    expect(toBranch({ ...row, users: [{ email: 'luis@correo.com' }] } as never)).toEqual({
      id: row.id,
      code: 'XEL',
      name: 'Quetzaltenango',
      department: 'Quetzaltenango',
      municipality: 'Quetzaltenango',
      address: '4a calle 12-30 zona 1',
      phone: '77612233',
      latitude: 14.8347,
      longitude: -91.5181,
      active: true,
      version: 2,
    });
  });

  it('lists the admins for the view of a system admin', () => {
    const admin = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      fullName: 'Luis',
      email: 'luis@correo.com',
      status: 'PENDING',
    };
    expect(toBranchWithAdmins({ ...row, users: [admin] } as never)).toEqual({
      id: row.id,
      code: 'XEL',
      name: 'Quetzaltenango',
      department: 'Quetzaltenango',
      municipality: 'Quetzaltenango',
      address: '4a calle 12-30 zona 1',
      phone: '77612233',
      latitude: 14.8347,
      longitude: -91.5181,
      active: true,
      version: 2,
      admins: [admin],
    });
  });

  it('builds the event payload with the version', () => {
    expect(toBranchPayload(row as never)).toMatchObject({
      branchId: row.id,
      version: 2,
      latitude: 14.8347,
      active: true,
    });
  });
});

describe('toPublicLocation', () => {
  it('keeps only the name, the town and the coordinates of the branch', () => {
    const location = toPublicLocation({ ...row, users: [{ email: 'luis@correo.com' }] } as never);

    expect(location).toEqual({
      id: row.id,
      name: 'Quetzaltenango',
      municipality: 'Quetzaltenango',
      department: 'Quetzaltenango',
      latitude: 14.8347,
      longitude: -91.5181,
    });
    expect(Object.keys(location)).not.toEqual(
      expect.arrayContaining(['phone', 'address', 'code', 'admins']),
    );
  });
});
