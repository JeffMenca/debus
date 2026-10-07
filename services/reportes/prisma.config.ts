import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Same lookup as the integration tests: local .env first, then the committed defaults.
config({ path: ['.env', '.env.example'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
