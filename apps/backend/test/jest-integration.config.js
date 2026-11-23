/** Integration tests: `*.int-spec.ts`, run against real Postgres/Redis/ElasticMQ (docker-compose). */
/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.int-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@flash-sale-demo/shared-types$': '<rootDir>/../../../packages/shared-types/src',
  },
  globalSetup: '<rootDir>/support/global-setup.ts',
  setupFiles: ['<rootDir>/support/test-env.ts'],
  testTimeout: 30_000,
};
