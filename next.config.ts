import type { NextConfig } from "next";
import { assertDeploymentEnvironment } from "./lib/deployment-environment.mjs";

assertDeploymentEnvironment(process.env);

const nextConfig: NextConfig = {
  // Keep production verification isolated from a running `next dev` cache.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
