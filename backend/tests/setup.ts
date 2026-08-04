/**
 * Per-test-file setup that runs after Jest's test environment is created.
 * Sets NODE_ENV=test and JWT secrets so the app can boot without a .env file.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret';
process.env.LOG_LEVEL = 'silent'; // Keep test output clean
