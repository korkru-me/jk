import { assertDeploymentEnvironment } from '@/lib/deployment-environment.mjs'

export function register() {
  assertDeploymentEnvironment(process.env)
}
