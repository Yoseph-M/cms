import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../store/toastStore', () => ({ useToastStore: vi.fn() }));
vi.mock('../utils/download', () => ({
  downloadBlob: vi.fn(),
  timestampedFilename: (prefix: string, extension: string) => `${prefix}-stamped.${extension}`,
  datedFilename: (prefix: string, extension: string) => `${prefix}-stamped.${extension}`,
}));

import { OwnerBackup, MAX_UPLOAD_BYTES } from '../pages/owner/OwnerBackup';
import { axiosClient } from '../api/axiosClient';
import { useToastStore } from '../store/toastStore';
import { downloadBlob } from '../utils/download';

const DATASETS = {
  datasets: [
    { key: 'orders', label: 'Sales Orders', description: 'Every order with its total.', rows: 128 },
    { key: 'audit', label: 'Audit Logs', description: 'Staff activity and login history.', rows: 68 },
  ],
};

const SNAPSHOT = {
  format: 'mern-pos-backup',
  version: 1,
  generatedAt: '2026-09-17T10:00:00.000Z',
  counts: { orders: 128, users: 5 },
  data: { orders: [], users: [] },
};

const renderPage = () => {
  const result = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <OwnerBackup />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, fileInput: result.container.querySelector('input[type="file"]') as HTMLInputElement };
};

let addToast: ReturnType<typeof vi.fn>;

/** URLs the page asked the API for, in order. */
const requestedUrls = (): string[] =>
  ((axiosClient.get as any).mock.calls as Array<[string]>).map(([url]) => String(url));

beforeEach(() => {
  vi.clearAllMocks();
  addToast = vi.fn();
  (useToastStore as any).mockReturnValue({ addToast });
  (axiosClient.get as any).mockImplementation((url: string) => {
    if (url === '/backup/datasets') return Promise.resolve({ data: DATASETS });
    if (url === '/backup/snapshot') {
      return Promise.resolve({ data: new Blob([JSON.stringify(SNAPSHOT)], { type: 'application/json' }) });
    }
    return Promise.resolve({ data: new Blob(['id,name\r\n'], { type: 'text/csv' }) });
  });
  (axiosClient.post as any).mockResolvedValue({ data: { inserted: 12, skipped: 121, failed: 0 } });
});

describe('backup & restore tab', () => {
  it('lists the exportable datasets with their row counts', async () => {
    renderPage();

    expect(await screen.findByText('Create System Backup')).toBeInTheDocument();
    expect(screen.getByText('Restore System')).toBeInTheDocument();
    expect(screen.getByText('CSV Data Exports')).toBeInTheDocument();

    expect(await screen.findByText('Sales Orders')).toBeInTheDocument();
    expect(screen.getByText('128 records')).toBeInTheDocument();
    expect(screen.getByText('68 records')).toBeInTheDocument();
  });

  it('downloads a JSON snapshot', async () => {
    renderPage();
    await screen.findByText('Sales Orders');

    fireEvent.click(screen.getByRole('button', { name: /Generate & Download JSON Backup/i }));

    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    expect(requestedUrls()).toContain('/backup/snapshot');
    expect((downloadBlob as any).mock.calls[0][1]).toBe('pos-backup-stamped.json');
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Backup downloaded' }));
  });

  it('exports one dataset as CSV', async () => {
    renderPage();
    await screen.findByText('Sales Orders');

    const buttons = screen.getAllByRole('button', { name: 'Export CSV' });
    fireEvent.click(buttons[0]);

    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    expect(requestedUrls()).toContain('/backup/datasets/orders/csv');
    expect((downloadBlob as any).mock.calls[0][1]).toBe('pos-orders-stamped.csv');
  });

  it('confirms the snapshot contents before restoring anything', async () => {
    const { fileInput } = renderPage();
    await screen.findByText('Sales Orders');

    const file = new File([JSON.stringify(SNAPSHOT)], 'pos-backup.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Nothing is uploaded until the operator confirms.
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('133 records across 2 collections');
    expect(axiosClient.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Restore data' }));

    await waitFor(() => expect(axiosClient.post).toHaveBeenCalled());
    const [url, body] = (axiosClient.post as any).mock.calls[0];
    expect(url).toBe('/backup/restore');
    expect(body).toMatchObject({ format: 'mern-pos-backup' });
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Restore complete', message: expect.stringContaining('12 records added') }),
      ),
    );
  });

  it('refuses a file that is not a POS backup', async () => {
    const { fileInput } = renderPage();
    await screen.findByText('Sales Orders');

    const file = new File(['{ not json'], 'notes.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Not a backup file' })),
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(axiosClient.post).not.toHaveBeenCalled();
  });

  it('refuses a backup larger than the upload limit instead of failing midway', async () => {
    const { fileInput } = renderPage();
    await screen.findByText('Sales Orders');

    const file = new File([JSON.stringify(SNAPSHOT)], 'huge.json', { type: 'application/json' });
    Object.defineProperty(file, 'size', { value: MAX_UPLOAD_BYTES + 1 });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'File too large' })));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
