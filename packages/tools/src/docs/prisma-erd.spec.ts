import { erdFromPrisma } from './prisma-erd';

const SCHEMA = `
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum Status {
  ACTIVE
  INACTIVE
}

// A comment that is not a field.
model Branch {
  id        String   @id @db.Uuid
  code      String   @unique
  name      String
  active    Boolean
  buses     Bus[]

  @@map("branches")
}

model Bus {
  id        String   @id @default(uuid()) @db.Uuid
  branchId  String   @map("branch_id") @db.Uuid
  branch    Branch   @relation(fields: [branchId], references: [id])
  plate     String   @unique
  mileageKm Int      @map("mileage_km")
  status    Status   @default(ACTIVE)
  boughtOn  DateTime @map("bought_on") @db.Date
  seenAt    DateTime @map("seen_at") @db.Timestamptz(3)
  price     Decimal  @db.Decimal(10, 2)
  extra     Json?
  note      String?

  @@map("buses")
}
`;

describe('erdFromPrisma', () => {
  const erd = erdFromPrisma(SCHEMA);

  it('is a Mermaid entity-relationship diagram', () => {
    expect(erd.startsWith('erDiagram')).toBe(true);
  });

  it('names each entity with the real table of @@map', () => {
    expect(erd).toContain('  branches {');
    expect(erd).toContain('  buses {');
    expect(erd).not.toContain('Branch {');
    expect(erd).not.toContain('Bus {');
  });

  it('writes the column name of @map and its type, marking primary and unique keys', () => {
    expect(erd).toContain('    uuid id PK');
    expect(erd).toContain('    text code UK');
    expect(erd).toContain('    int mileage_km');
    expect(erd).toContain('    date bought_on');
    expect(erd).toContain('    timestamptz seen_at');
    expect(erd).toContain('    decimal price');
    expect(erd).toContain('    jsonb extra');
    expect(erd).toContain('    boolean active');
    expect(erd).toContain('    Status status');
  });

  it('marks a foreign key and the unique one together', () => {
    expect(erd).toContain('    uuid branch_id FK');
    expect(erd).toContain('    text plate UK');
  });

  it('leaves out the fields that are only the other side of a relation', () => {
    expect(erd).not.toMatch(/\bBus\[\]|\bbuses \w+\n/);
    expect(erd).not.toContain('Branch branch');
  });

  it('draws one-to-many from the referenced table to the one that holds the key', () => {
    expect(erd).toContain('  branches ||--o{ buses : "branch_id"');
  });

  it('ignores the generator, the datasource, the enums and the comments', () => {
    expect(erd).not.toContain('prisma-client');
    expect(erd).not.toContain('postgresql');
    expect(erd).not.toContain('ACTIVE');
    expect(erd).not.toContain('A comment');
  });

  it('uses |o on the parent side when the key can be null', () => {
    const optional = erdFromPrisma(`
model A {
  id String @id
  bs B[]
  @@map("as_")
}
model B {
  id String @id
  aId String? @map("a_id")
  a A? @relation(fields: [aId], references: [id])
  @@map("bs")
}`);
    expect(optional).toContain('  as_ |o--o{ bs : "a_id"');
  });

  it('draws one-to-one when the key is unique', () => {
    const one = erdFromPrisma(`
model A {
  id String @id
  b B?
  @@map("as_")
}
model B {
  id String @id
  aId String @unique @map("a_id")
  a A @relation(fields: [aId], references: [id])
  @@map("bs")
}`);
    expect(one).toContain('  as_ ||--o| bs : "a_id"');
  });

  it('labels two relations between the same tables by their own keys', () => {
    const two = erdFromPrisma(`
model Place {
  id String @id
  from Route[] @relation("From")
  to Route[] @relation("To")
  @@map("places")
}
model Route {
  id String @id
  fromId String @map("from_id")
  origin Place @relation("From", fields: [fromId], references: [id])
  toId String @map("to_id")
  destination Place @relation("To", fields: [toId], references: [id])
  @@map("routes")
}`);
    expect(two).toContain('  places ||--o{ routes : "from_id"');
    expect(two).toContain('  places ||--o{ routes : "to_id"');
  });

  it('falls back to the model name when there is no @@map', () => {
    expect(erdFromPrisma('model Thing {\n  id String @id\n}')).toContain('  Thing {');
  });

  it('marks the columns of a composite key as primary and says a composite unique is only unique together', () => {
    const composite = erdFromPrisma(`
model Link {
  a String
  b String
  c String
  d String
  @@id([a, b])
  @@unique([b, c])
  @@unique([c, d])
  @@map("links")
}`);
    expect(composite).toContain('    text a PK');
    expect(composite).toContain('    text b PK "único junto con c"');
    expect(composite).toContain('    text c "único junto con b, d"');
    expect(composite).toContain('    text d "único junto con c"');
    expect(composite).not.toMatch(/ UK/);
  });

  it('draws one-to-one when the key that points to the parent is also the primary key', () => {
    const shared = erdFromPrisma(`
model Trip {
  id String @id
  departure Departure?
  @@map("trips")
}
model Departure {
  tripId String @id @map("trip_id")
  trip Trip @relation(fields: [tripId], references: [id])
  @@map("departures")
}`);
    expect(shared).toContain('  trips ||--o| departures : "trip_id"');
    expect(shared).toContain('    text trip_id PK, FK');
  });

  it('reads several files put together, such as a folder of schemas', () => {
    const joined = erdFromPrisma(
      `${SCHEMA}\nmodel ProcessedEvent {\n  eventId String @id @map("event_id")\n  @@map("processed_events")\n}`,
    );
    expect(joined).toContain('  processed_events {');
    expect(joined).toContain('  branches {');
  });

  it('is the same text for the same schema', () => {
    expect(erdFromPrisma(SCHEMA)).toBe(erd);
  });
});
