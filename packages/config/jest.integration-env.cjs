// Local .env wins; .env.example supplies defaults so tests run on a fresh clone.
require('dotenv').config({ path: ['.env', '.env.example'], quiet: true });
