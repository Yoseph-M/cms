import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'mongodb://localhost:27017/pos_db',
  jwtSecret: process.env.JWT_SECRET || 'dev_jwt_access_secret_2026',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_jwt_refresh_secret_2026',
  jwtAccessExpiresIn: '15m',
  jwtRefreshExpiresIn: '7d',
};
