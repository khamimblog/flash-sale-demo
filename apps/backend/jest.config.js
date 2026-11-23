/** Unit tests: colocated `*.spec.ts` files, no external dependencies. */
/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@flash-sale-demo/shared-types$': '<rootDir>/../../../packages/shared-types/src',
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.module.ts', '!main.*.ts', '!**/migrations/**'],
  coverageDirectory: '../coverage',
};
