/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  globalSetup: '<rootDir>/tests/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/globalTeardown.ts',
  setupFilesAfterSetup: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  // Ensure each test file gets a fresh module registry
  // so prisma re-connects to the in-memory DB
  verbose: true,
};
