import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack workaround: postcss 8.5.x requires nanoid/non-secure via CJS,
  // but Turbopack's subpath export resolver fails to locate it. Alias it directly.
  turbopack: {
    resolveAlias: {
      'nanoid/non-secure': 'nanoid/non-secure/index.cjs',
    },
  },
};

export default nextConfig;
