import type { NextConfig } from "next";
import { assertDeploymentEnvironment } from "./lib/deployment-environment.mjs";

assertDeploymentEnvironment(process.env);

const nextConfig: NextConfig = {
  // Keep production verification isolated from a running `next dev` cache.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // A drawing scene is capped and validated at 2 MiB. Sending it to the
  // prepare action lets the server validate and store scene.json itself before
  // it issues the browser a token for the derived preview.
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
