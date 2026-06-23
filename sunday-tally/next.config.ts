import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Turbopack workaround: postcss 8.5.x requires nanoid/non-secure via CJS,
  // but Turbopack's subpath export resolver fails to locate it. Alias it directly.
  turbopack: {
    // Explicitly set the root so it doesn't try to use the parent directory's .git
    root: path.join(process.cwd()),
    resolveAlias: {
      'nanoid/non-secure': 'nanoid/non-secure/index.cjs',
    },
  },
};

export default nextConfig;
