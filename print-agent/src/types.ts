export interface PrintJob {
  id: string;
  orderId: string | null;
  station: string;
  transport: 'TCP' | 'WINDOWS';
  status: 'QUEUED' | 'PRINTING' | 'PRINTED' | 'FAILED' | 'CANCELLED';
  attempts: number;
  maxAttempts: number;
  printerName: string | null;
  printerIp: string | null;
  printerPort: number | null;
  payloadBase64: string;
  lastError: string | null;
  claimedById: string | null;
  printedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WindowsPrinter {
  name: string;
  description?: string;
  status?: string;
  isDefault?: boolean;
  deviceId?: string;
}

export interface PrintJobResult {
  success: boolean;
  error?: string;
}
