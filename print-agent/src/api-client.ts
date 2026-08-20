import axios, { AxiosInstance } from 'axios';
import { config } from './config';
import { logger } from './logger';
import { PrintJob } from './types';

/**
 * API client for communicating with the CMS backend
 */
export class CMSApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.cmsApiUrl,
      headers: {
        'X-Agent-Token': config.agentToken,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 401) {
          logger.error('Agent authentication failed - check AGENT_TOKEN in .env');
        } else if (error.code === 'ECONNREFUSED') {
          logger.error({ url: config.cmsApiUrl }, 'Cannot connect to CMS backend');
        }
        throw error;
      }
    );
  }

  /**
   * Fetch pending print jobs for this agent's assigned station
   * Station is determined server-side based on agent authentication
   */
  async getPendingJobs(): Promise<PrintJob[]> {
    try {
      // No station parameter - backend determines from agent's assignment
      const response = await this.client.get('/print-jobs/pending');
      return response.data;
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed to fetch pending jobs');
      throw err;
    }
  }

  /**
   * Claim a print job (optimistic locking)
   */
  async claimJob(jobId: string): Promise<PrintJob | null> {
    try {
      const response = await this.client.post(`/print-jobs/${jobId}/claim`);
      logger.info({ jobId }, 'Successfully claimed print job');
      return response.data;
    } catch (err: any) {
      if (err.response?.status === 409) {
        logger.debug({ jobId }, 'Job already claimed by another agent');
        return null;
      }
      logger.error({ jobId, err: err.message }, 'Failed to claim job');
      throw err;
    }
  }

  /**
   * Acknowledge job completion (success or failure)
   */
  async ackJob(jobId: string, status: 'PRINTED' | 'FAILED', error?: string): Promise<void> {
    try {
      await this.client.post(`/print-jobs/${jobId}/ack`, {
        status,
        error: error || null,
      });
      logger.info({ jobId, status }, 'Acknowledged print job status');
    } catch (err: any) {
      logger.error({ jobId, err: err.message }, 'Failed to acknowledge job');
      throw err;
    }
  }

  /**
   * Test backend connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      logger.info({ status: response.data.status }, 'Backend connection test successful');
      return true;
    } catch (err) {
      logger.error('Backend connection test failed');
      return false;
    }
  }

  /**
   * Send heartbeat to backend with version information
   */
  async sendHeartbeat(version: string): Promise<boolean> {
    try {
      await this.client.post('/print-agents/heartbeat', {
        version,
        printerStatus: 'online', // Could be enhanced to check actual printer status
      });
      logger.debug('Heartbeat sent successfully');
      return true;
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed to send heartbeat');
      return false;
    }
  }
}
