import path from 'node:path';
import type { NextConfig } from 'next';

// The container image builds with NEXT_OUTPUT=standalone; local `next start` needs the default output.
const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
