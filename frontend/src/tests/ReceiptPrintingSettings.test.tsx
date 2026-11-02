import React from 'react';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../store/toastStore', () => ({ useToastStore: vi.fn() }));
vi.mock('react-i18next', () => {
  const en = require('../locales/en/common.json');
  const lookup = (key: string): any =>
    key.split('.').reduce<any>((node, part) => (node == null ? undefined : node[part]), en);
  const t = (key: string, options?: any) => {
    const pluralKey =
      options?.count === undefined
        ? key
        : `${key}_${options.count === 1 ? 'one' : 'other'}`;
    const found = lookup(pluralKey);
    const value = typeof found === 'string' ? found : lookup(key);
    if (typeof value !== 'string') return options?.defaultValue || key;
    if (options && typeof options === 'object') {
      return value.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options[name] ?? ''));
    }
    return value;
  };
  return {
    useTranslation: () => ({ t }),
    initReactI18next: { type: '3rdParty', init: () => {} },
    withTranslation: () => (Component: any) => Component,
  };
});

import { ReceiptPrintingSection } from '../components/settings/ReceiptPrintingSection';
import { axiosClient } from '../api/axiosClient';
import { useToastStore } from '../store/toastStore';
import { DEFAULT_RECEIPT_SETTINGS } from '../utils/receiptSettings';

let addToast: ReturnType<typeof vi.fn>;

const savedSettings = (overrides: Record<string, unknown> = {}) => ({
  ...DEFAULT_RECEIPT_SETTINGS,
  ...overrides,
});

const mockSaved = (settings: Record<string, unknown>) => {
  (axiosClient.get as any).mockResolvedValue({
    data: {
      key: 'receiptSettings',
      value: JSON.stringify(settings),
      updatedAt: new Date().toISOString(),
    },
  });
};

const renderSection = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ReceiptPrintingSection />
    </QueryClientProvider>,
  );

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  addToast = vi.fn();
  (useToastStore as any).mockImplementation((selector: any) => selector({ addToast }));
  (axiosClient.patch as any).mockResolvedValue({ data: { key: 'receiptSettings', value: '{}', updatedAt: '' } });
});

describe('Receipts & Printing settings', () => {
  it('shows the saved layout in the fields and in the live preview', async () => {
    mockSaved(
      savedSettings({
        bottomMessage: 'See you soon',
        businessName: 'Mahalna Electronics',
        paperSize: '58mm',
        copies: 2,
        taxDisplay: 'hide',
      }),
    );

    renderSection();

    const bottomMessage = await screen.findByDisplayValue('See you soon');
    // Read-only until Edit is pressed, matching the card in the design.
    expect(bottomMessage).toBeDisabled();
    expect(screen.getByTestId('receipt-paper-size')).toHaveValue('58mm');
    expect(screen.getByTestId('receipt-copies')).toHaveValue('2');

    const preview = screen.getByTestId('receipt-preview');
    expect(within(preview).getByText('Mahalna Electronics')).toBeInTheDocument();
    expect(within(preview).getByText('2 copies will print')).toBeInTheDocument();
    // Hidden tax means no subtotal/tax rows, only the total.
    expect(within(preview).queryByText('Subtotal')).not.toBeInTheDocument();
    expect(within(preview).getByText('Total')).toBeInTheDocument();
  });

  it('saves the edited layout and keeps the preview in step while typing', async () => {
    mockSaved(savedSettings());

    renderSection();
    await screen.findByDisplayValue('Thank you for shopping with us!');
    // The card is read-only until the saved values have arrived.
    const editButton = screen.getByRole('button', { name: 'Edit' });
    await waitFor(() => expect(editButton).toBeEnabled());
    fireEvent.click(editButton);

    const bottomMessage = screen.getByTestId('receipt-bottom-message');
    expect(bottomMessage).not.toBeDisabled();
    fireEvent.change(bottomMessage, { target: { value: 'Come back tomorrow!' } });

    // The preview is the point of the card: it must update before saving.
    expect(within(screen.getByTestId('receipt-preview')).getByText('Come back tomorrow!')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('receipt-copies'), { target: { value: '3' } });
    expect(within(screen.getByTestId('receipt-preview')).getByText('3 copies will print')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => expect(axiosClient.patch).toHaveBeenCalledTimes(1));
    const [url, body] = (axiosClient.patch as any).mock.calls[0];
    expect(url).toBe('/settings/system/receiptSettings');
    const persisted = JSON.parse(body.value);
    expect(persisted.bottomMessage).toBe('Come back tomorrow!');
    expect(persisted.copies).toBe(3);
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Receipt settings saved' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument());
  });

  it('lays out the ten show-on-receipt toggles in two columns', async () => {
    mockSaved(savedSettings());

    renderSection();
    await screen.findByDisplayValue('Thank you for shopping with us!');

    expect(screen.getAllByRole('switch')).toHaveLength(10);
    for (const label of [
      'Show Email',
      'Show Business Name',
      'Show Business Phone',
      'Show Business Address',
      'Show Cashier Name',
      'Show Receipt Number',
      'Show Date and Time',
      'Show Payment Method',
      'Show Amount Paid',
      'Show Change',
    ]) {
      expect(screen.getByRole('switch', { name: label })).toBeInTheDocument();
    }
  });

  it('reflects every toggle and business field in the preview as it changes', async () => {
    mockSaved(savedSettings({ businessName: 'Mahalna Electronics' }));

    renderSection();
    await screen.findByDisplayValue('Mahalna Electronics');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const preview = screen.getByTestId('receipt-preview');
    expect(within(preview).getByText('Receipt #')).toBeInTheDocument();
    expect(within(preview).getByText('Cashier')).toBeInTheDocument();
    expect(within(preview).getByText('Payment Method')).toBeInTheDocument();
    expect(within(preview).getByText('Amount Paid')).toBeInTheDocument();
    expect(within(preview).getByText('Change')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Show Cashier Name' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Show Change' }));

    expect(within(preview).queryByText('Cashier')).not.toBeInTheDocument();
    expect(within(preview).queryByText('Change')).not.toBeInTheDocument();
    expect(within(preview).getByText('Payment Method')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('receipt-business-phone'), {
      target: { value: '+251 90 123 4567' },
    });
    expect(within(preview).getByText('+251 90 123 4567')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => expect(axiosClient.patch).toHaveBeenCalledTimes(1));
    const [, body] = (axiosClient.patch as any).mock.calls[0];
    const persisted = JSON.parse(body.value);
    expect(persisted.showCashierName).toBe(false);
    expect(persisted.showChange).toBe(false);
    expect(persisted.showPaymentMethod).toBe(true);
    expect(persisted.businessPhone).toBe('+251 90 123 4567');
  });

  it('toggles what appears on the receipt and reverts on Cancel', async () => {
    mockSaved(savedSettings({ businessName: 'Mahalna Electronics', showBusinessName: true }));

    renderSection();
    await screen.findByDisplayValue('Mahalna Electronics');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const toggle = screen.getByRole('switch', { name: 'Show Business Name' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);

    const preview = screen.getByTestId('receipt-preview');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(within(preview).queryByText('Mahalna Electronics')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('switch', { name: 'Show Business Name' })).toHaveAttribute('aria-checked', 'true');
    expect(within(preview).getByText('Mahalna Electronics')).toBeInTheDocument();
    expect(axiosClient.patch).not.toHaveBeenCalled();
  });
});
