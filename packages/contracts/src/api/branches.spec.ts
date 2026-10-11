import {
  GUATEMALA_DEPARTMENTS,
  branchCodeSchema,
  branchSchema,
  branchWithAdminsSchema,
  createBranchRequestSchema,
  isInsideGuatemala,
  updateBranchRequestSchema,
} from './branches';

const fields = {
  code: 'xel',
  name: 'Quetzaltenango',
  department: 'Quetzaltenango',
  municipality: 'Quetzaltenango',
  address: '4a calle 12-30 zona 1',
  phone: '7761-2233',
  latitude: 14.8347,
  longitude: -91.5181,
};

describe('branch fields', () => {
  it('lists the 22 departments', () => {
    expect(GUATEMALA_DEPARTMENTS).toHaveLength(22);
    expect(GUATEMALA_DEPARTMENTS).toContain('Petén');
  });

  it('uppercases the code and accepts 3 to 5 letters', () => {
    expect(branchCodeSchema.parse(' xel ')).toBe('XEL');
    expect(branchCodeSchema.safeParse('XE').success).toBe(false);
    expect(branchCodeSchema.safeParse('XELAJU').success).toBe(false);
    expect(branchCodeSchema.safeParse('X3L').success).toBe(false);
  });

  it('only accepts points inside Guatemala', () => {
    expect(isInsideGuatemala(14.6349, -90.5069)).toBe(true);
    expect(isInsideGuatemala(19.4326, -99.1332)).toBe(false);
    const outside = { ...fields, latitude: 19.43, longitude: -99.13 };
    expect(
      createBranchRequestSchema.safeParse({
        ...outside,
        admin: { fullName: 'Ana', email: 'a@b.com' },
      }).success,
    ).toBe(false);
  });

  it('requires the first administrator when creating', () => {
    expect(createBranchRequestSchema.safeParse(fields).success).toBe(false);
    const parsed = createBranchRequestSchema.parse({
      ...fields,
      admin: { fullName: 'Luis Ramírez', email: ' Luis@Correo.com ' },
    });
    expect(parsed).toMatchObject({
      code: 'XEL',
      phone: '77612233',
      admin: { email: 'luis@correo.com' },
    });
  });

  it('accepts partial updates but not empty ones', () => {
    expect(updateBranchRequestSchema.parse({ phone: '7761 0000' })).toEqual({ phone: '77610000' });
    expect(updateBranchRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('branch views', () => {
  const view = {
    id: '9b2c7a10-1111-4c4c-8888-123456789abc',
    ...fields,
    code: 'XEL',
    phone: '77612233',
    active: true,
    version: 1,
  };
  const admins = [
    {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      fullName: 'Luis',
      email: 'luis@correo.com',
      status: 'ACTIVE',
    },
  ];

  it('keeps the administrators out of the view every session may read', () => {
    expect(branchSchema.parse({ ...view, admins })).not.toHaveProperty('admins');
  });

  it('adds the administrators for system admins and requires them there', () => {
    expect(branchWithAdminsSchema.parse({ ...view, admins }).admins).toHaveLength(1);
    expect(branchWithAdminsSchema.safeParse(view).success).toBe(false);
  });
});
