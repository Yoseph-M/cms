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
  private isShuttingDown = false;
  private reconnectAttempts = 0;

  constructor() {
    this.apiClient = new CMSApiClient();
  }

  /**
   * Start the print agent
   */
  async start(): Promise<void> {
    logger.info({ 
      name: config.agentName,
      stations: config.stations,
      apiUrl: config.cmsApiUrl 
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

    // Reset reconnect counter on successful connection
    this.reconnectAttempts = 0;

    // Start polling for print jobs
    this.startPolling();

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
   * Schedule reconnection attempt with exponential backoff
   */
  private async scheduleReconnect(): Promise<void> {
    if (this.isShuttingDown) return;

    this.reconnectAttempts++;

    if (this.reconnectAttempts > config.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached. Agent shutting down.');
      process.exit(1);
    }

    const delay = Math.min(
      config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1),
      60000 // Max 60 seconds
    );

    logger.info({ 
      attempt: this.reconnectAttempts, 
      maxAttempts: config.maxReconnectAttempts,
      delayMs: delay 
    }, 'Scheduling reconnection attempt');

    setTimeout(() => {
      this.start();
    }, delay);
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
        await processPendingJobs(this.apiClient, config.stations);
      } catch (err: any) {
        logger.error({ err: err.message }, 'Error during job polling cycle');
        
        // If backend is unreachable, attempt reconnection
        if (err.code === 'ECONNREFUSED' || err.response?.status === 401) {
          logger.warn('Backend connection lost. Attempting to reconnect...');
          this.stopPolling();
          await this.scheduleReconnect();
        }
      }
    }, config.pollIntervalMs);
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
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    logger.info('Shutting down print agent...');
    
    this.stopPolling();
    
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
