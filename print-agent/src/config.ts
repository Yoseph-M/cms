import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from the agent root directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

export interface AgentConfig {
  cmsApiUrl: string;
  agentToken: string;
  agentName: string;
  station: string; // Single station assignment
  logLevel: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  reconnectDelayMs: number;
  maxReconnectDelayMs: number;
  version: string;
}

function validateConfig(): AgentConfig {
  const cmsApiUrl = process.env.CMS_API_URL;
  const agentToken = process.env.AGENT_TOKEN;
  const agentName = process.env.AGENT_NAME || 'Unknown Agent';
  const station = process.env.STATION || 'kitchen';
  const logLevel = process.env.LOG_LEVEL || 'info';
  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || '3000', 10);
  const heartbeatIntervalMs = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10);
  const reconnectDelayMs = parseInt(process.env.RECONNECT_DELAY_MS || '5000', 10);
  const maxReconnectDelayMs = parseInt(process.env.MAX_RECONNECT_DELAY_MS || '60000', 10);

  if (!cmsApiUrl) {
    throw new Error('CMS_API_URL is required in .env file');
  }

  if (!agentToken) {
    throw new Error('AGENT_TOKEN is required in .env file. Register this agent in CMS Owner dashboard first.');
  }

  // Get version from package.json
  const packageJson = require('../package.json');
  const version = packageJson.version || '1.0.0';

  return {
    cmsApiUrl,
    agentToken,
    agentName,
    station: station.toLowerCase(),
    logLevel,
    pollIntervalMs,
    heartbeatIntervalMs,
    reconnectDelayMs,
    maxReconnectDelayMs,
    version,
  };
}

export const config = validateConfig();
