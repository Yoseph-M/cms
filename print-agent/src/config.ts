import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from the agent root directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

export interface AgentConfig {
  cmsApiUrl: string;
  agentToken: string;
  agentName: string;
  stations: string[];
  logLevel: string;
  pollIntervalMs: number;
  maxReconnectAttempts: number;
  reconnectDelayMs: number;
}

function validateConfig(): AgentConfig {
  const cmsApiUrl = process.env.CMS_API_URL;
  const agentToken = process.env.AGENT_TOKEN;
  const agentName = process.env.AGENT_NAME || 'Unknown Agent';
  const stations = process.env.STATIONS?.split(',').map(s => s.trim().toLowerCase()) || ['kitchen'];
  const logLevel = process.env.LOG_LEVEL || 'info';
  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || '3000', 10);
  const maxReconnectAttempts = parseInt(process.env.MAX_RECONNECT_ATTEMPTS || '10', 10);
  const reconnectDelayMs = parseInt(process.env.RECONNECT_DELAY_MS || '5000', 10);

  if (!cmsApiUrl) {
    throw new Error('CMS_API_URL is required in .env file');
  }

  if (!agentToken) {
    throw new Error('AGENT_TOKEN is required in .env file. Register this agent in CMS Owner dashboard first.');
  }

  return {
    cmsApiUrl,
    agentToken,
    agentName,
    stations,
    logLevel,
    pollIntervalMs,
    maxReconnectAttempts,
    reconnectDelayMs,
  };
}

export const config = validateConfig();
