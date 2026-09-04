import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'mongodb://localhost:27017/pos_db',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || '',
  jwtAccessExpiresIn: '15m',
  jwtRefreshExpiresIn: '7d',
  /** Frontend origin for CORS in production */
  webAppUrl: (process.env.WEB_APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  /** Extra origins (comma-separated), e.g. external ordering app.
   * Both spellings accepted for compatibility with older configs. */
  extraCorsOrigins: (process.env.CORS_EXTRA_ORIGINS || process.env.EXTRA_CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  businessTimezone: process.env.BUSINESS_TIMEZONE || 'UTC',
};

// Security validations
if (config.nodeEnv === 'production') {
  if (!config.jwtSecret || config.jwtSecret === 'dev_jwt_access_secret_2026' || config.jwtSecret === 'super_secret_jwt_access_key_2026') {
    throw new Error('FATAL: JWT_SECRET must be set to a secure value in production.');
  }
  if (!config.jwtRefreshSecret || config.jwtRefreshSecret === 'dev_jwt_refresh_secret_2026' || config.jwtRefreshSecret === 'super_secret_jwt_refresh_key_2026') {
    throw new Error('FATAL: JWT_REFRESH_SECRET must be set to a secure value in production.');
  }
} else {
  // Fallbacks for development if not provided
  if (!config.jwtSecret) config.jwtSecret = 'dev_jwt_access_secret_2026';
  if (!config.jwtRefreshSecret) config.jwtRefreshSecret = 'dev_jwt_refresh_secret_2026';
}
