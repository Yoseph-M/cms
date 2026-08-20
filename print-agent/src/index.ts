import { config } from './config';
import { logger } from './logger';
import { CMSApiClient } from './api-client';
import { processPendingJobs } from './job-processor';
import { discoverWindowsPrinters } from './printer-discovery';

/**
 * CMS Windows Print Agent
 * 
 * This agent runs on Windows POS computers and handles kitchen ticket printing
 * through the Windows print spooler, preserving ESC/POS commands for thermal printers.
 */
class PrintAgent {
  private apiClient: CMSApiClient;
  private pollTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private reconnectAttempts = 0;
  private currentReconnectDelay = config.reconnectDelayMs;

  constructor() {
    this.apiClient = new CMSApiClient();
  }

  /**
   * Start the print agent
   */
  async start(): Promise<void> {
    logger.info({ 
      name: config.agentName,
      station: config.station,
      apiUrl: config.cmsApiUrl,
      version: config.version
    }, 'Starting CMS Print Agent');

    // Discover printers
    const printers = discoverWindowsPrinters();
    logger.info({ 
      count: printers.length, 
      printers: printers.map(p => p.name) 
    }, 'Windows printers discovered');

    if (printers.length === 0) {
      logger.warn('No printers found on this Windows computer. Install printer drivers first.');
    }

    // Test backend connection
    const connected = await this.testBackendConnection();
    if (!connected) {
      logger.error('Failed to connect to CMS backend. Retrying...');
      await this.scheduleReconnect();
      return;
    }

    // Reset reconnect counter and delay on successful connection
    this.reconnectAttempts = 0;
    this.currentReconnectDelay = config.reconnectDelayMs;

    // Send initial heartbeat
    await this.sendHeartbeat();

    // Start polling for print jobs
    this.startPolling();

    // Start periodic heartbeat
    this.startHeartbeat();

    logger.info('Print agent is now running');
  }

  /**
   * Test backend connectivity
   */
  private async testBackendConnection(): Promise<boolean> {
    try {
      return await this.apiClient.testConnection();
    } catch (err) {
      return false;
    }
  }

  /**
   * Send heartbeat to backend
   */
  private async sendHeartbeat(): Promise<void> {
    try {
      await this.apiClient.sendHeartbeat(config.version);
    } catch (err: any) {
      logger.error({ err: err.message }, 'Heartbeat failed');
    }
  }

  /**
   * Schedule reconnection attempt with exponential backoff
   * NO MAXIMUM ATTEMPTS - POS systems must keep trying indefinitely
   */
  private async scheduleReconnect(): Promise<void> {
    if (this.isShuttingDown) return;

    this.reconnectAttempts++;

    // Exponential backoff with maximum delay cap
    this.currentReconnectDelay = Math.min(
      config.reconnectDelayMs * Math.pow(2, Math.min(this.reconnectAttempts - 1, 6)),
      config.maxReconnectDelayMs
    );

    logger.info({ 
      attempt: this.reconnectAttempts, 
      delayMs: this.currentReconnectDelay 
    }, 'Scheduling reconnection attempt (unlimited retries)');

    setTimeout(() => {
      this.start();
    }, this.currentReconnectDelay);
  }

  /**
   * Start polling for pending print jobs
   */
  private startPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    logger.info({ intervalMs: config.pollIntervalMs }, 'Starting job polling');

    this.pollTimer = setInterval(async () => {
      if (this.isShuttingDown) return;

      try {
        await processPendingJobs(this.apiClient);
      } catch (err: any) {
        logger.error({ err: err.message }, 'Error during job polling cycle');
        
        // If backend is unreachable, attempt reconnection
        if (err.code === 'ECONNREFUSED' || err.response?.status === 401) {
          logger.warn('Backend connection lost. Attempting to reconnect...');
          this.stopPolling();
          this.stopHeartbeat();
          await this.scheduleReconnect();
        }
      }
    }, config.pollIntervalMs);
  }

  /**
   * Start periodic heartbeat
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    logger.info({ intervalMs: config.heartbeatIntervalMs }, 'Starting heartbeat');

    this.heartbeatTimer = setInterval(async () => {
      if (this.isShuttingDown) return;
      await this.sendHeartbeat();
    }, config.heartbeatIntervalMs);
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      logger.info('Stopped job polling');
    }
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      logger.info('Stopped heartbeat');
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    logger.info('Shutting down print agent...');
    
    this.stopPolling();
    this.stopHeartbeat();
    
    logger.info('Print agent stopped');
    process.exit(0);
  }
}

// Main execution
const agent = new PrintAgent();

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT signal');
  agent.shutdown();
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal');
  agent.shutdown();
});

// Handle unhandled errors
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception');
  process.exit(1);
});

// Start the agent
agent.start().catch((err) => {
  logger.error({ err }, 'Failed to start print agent');
  process.exit(1);
});
