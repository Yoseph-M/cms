import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../store/socketStore', () => ({ useSocketStore: vi.fn() }));
vi.mock('../store/toastStore', () => ({ useToastStore: vi.fn() }));
vi.mock('react-i18next', () => {
  // Resolve keys against the real English catalogue so assertions keep reading
  // the UI text users see, not translation keys.
  const en = require('../locales/en/common.json');
  const lookup = (key: string): string =>
    key
      .split('.')
      .reduce<any>((node, part) => (node == null ? undefined : node[part]), en);
  const t = (key: string, options?: any) => {
    const value = typeof lookup(key) === 'string' ? lookup(key) : options?.defaultValue || key;
    if (typeof value === 'string' && options && typeof options === 'object') {
      return value.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(options[name] ?? ''));
    }
    return value;
  };
  return {
    useTranslation: () => ({ t }),
    initReactI18next: { type: '3rdParty', init: () => {} },
    withTranslation: () => (Component: any) => Component,
  };
});

import { OwnerPrinters } from '../pages/owner/OwnerPrinters';
import { axiosClient } from '../api/axiosClient';
import { useSocketStore } from '../store/socketStore';
import { useToastStore } from '../store/toastStore';

const printer = (overrides: Record<string, unknown>) => ({
  macAddress: null,
  vendorId: null,
  productId: null,
  ip: null,
  port: null,
  ...overrides,
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <OwnerPrinters />
      </MemoryRouter>
    </QueryClientProvider>,
  );

let addToast: ReturnType<typeof vi.fn>;

/** Web Bluetooth only exists in a secure context, and only in real Chrome. */
const stubBluetooth = (bluetooth: Record<string, unknown>) => {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: bluetooth });
};

const openScanPanel = async () => {
  renderPage();
  await screen.findByText('Ticket printer');
  fireEvent.click(screen.getByRole('button', { name: /Add Printer/i }));
  await screen.findByText('Transport Type');
};

/**
 * Transport Type is the house filter dropdown, not a native <select> — the
 * test choice is a keypress to open the menu and a click on the option.
 */
const transportTrigger = () => screen.getByRole('button', { name: 'Transport Type' });

const chooseTransport = async (label: string) => {
  fireEvent.keyDown(transportTrigger(), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: label }));
};

beforeEach(() => {
  vi.clearAllMocks();
  delete (navigator as any).bluetooth;
  (useSocketStore as any).mockReturnValue({ socket: null, isConnected: false });
  addToast = vi.fn();
  (useToastStore as any).mockReturnValue({ addToast });
  (axiosClient.get as any).mockResolvedValue({
    data: [
      printer({ id: 'p1', station: 'kitchen', transport: 'NETWORK', ip: '192.168.1.50', port: 9100 }),
      printer({ id: 'p2', station: 'printer-2', transport: 'USB', vendorId: '04b8', productId: '0e15' }),
    ],
  });
  (axiosClient.post as any).mockResolvedValue({ data: [] });
});

describe('printer setup', () => {
  it('leads with the ticket printer and never asks for a station', async () => {
    renderPage();

    // The first printer in the registry owns the kitchen tickets.
    expect(await screen.findByText('Ticket printer')).toBeInTheDocument();
    expect(screen.getByText('Printer 2')).toBeInTheDocument();
    expect(screen.getByText('Kitchen tickets are sent here.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add Printer/i }));

    expect(await screen.findByText('Transport Type')).toBeInTheDocument();
    expect(screen.queryByText(/^Station/)).not.toBeInTheDocument();
    expect(document.getElementById('pr-station')).toBeNull();
  });

  it('saves a new printer without a station so the server assigns the routing key', async () => {
    const requestDevice = vi.fn().mockResolvedValue({
      vendorId: 0x04b8,
      productId: 0x0e15,
      productName: 'TM-T20',
    });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'usb', { configurable: true, value: { requestDevice } });

    renderPage();
    await screen.findByText('Ticket printer');

    fireEvent.click(screen.getByRole('button', { name: /Add Printer/i }));
    await screen.findByText('Transport Type');

    await chooseTransport('USB');
    fireEvent.click(screen.getByRole('button', { name: /Scan for USB printers/i }));
    await waitFor(() => expect(requestDevice).toHaveBeenCalled());

    // The slide-over's own submit button, not the page header one.
    const sheet = within(screen.getByRole('dialog'));
    fireEvent.click(sheet.getByRole('button', { name: /^Add Printer$/ }));

    await waitFor(() => expect(axiosClient.post).toHaveBeenCalled());
    const [url, body] = (axiosClient.post as any).mock.calls[0];
    expect(url).toBe('/settings/printers');
    expect(body.stations).toHaveLength(3);
    // Order is what decides the ticket printer, so nothing sends a station.
    expect(body.stations.every((s: Record<string, unknown>) => !('station' in s))).toBe(true);
    expect(body.stations[2]).toMatchObject({ transport: 'USB', vendorId: '04b8', productId: '0e15' });
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Printer added' }));
  });

  it('offers only the transports a browser can actually discover', async () => {
    renderPage();
    await screen.findByText('Ticket printer');

    fireEvent.click(screen.getByRole('button', { name: /Add Printer/i }));
    await screen.findByText('Transport Type');

    // Bluetooth/USB are genuinely discoverable through the browser.
    expect(screen.getByRole('button', { name: /Scan for Bluetooth printers/i })).toBeInTheDocument();

    // Network (Wi-Fi/LAN) was removed: a browser cannot scan a LAN, and the
    // address form only invited typos. New stations are BT or USB only.
    fireEvent.keyDown(transportTrigger(), { key: 'Enter' });
    const options = await screen.findAllByRole('menuitem');
    expect(options.map((o) => o.textContent?.trim())).toEqual(['Bluetooth', 'USB']);

    fireEvent.click(screen.getByRole('menuitem', { name: 'USB' }));
    expect(screen.getByRole('button', { name: /Scan for USB printers/i })).toBeInTheDocument();
    expect(screen.queryByText(/Discovered Printers/i)).not.toBeInTheDocument();
    expect(document.getElementById('pr-ip')).toBeNull();
  });

  it('stores the opaque Web Bluetooth device id exactly as the browser returned it', async () => {
    const requestDevice = vi.fn().mockResolvedValue({ id: 'aB3+/xYzQ0AbCdEfGhIj', name: 'XP-58' });
    stubBluetooth({ requestDevice });
    await openScanPanel();

    fireEvent.click(screen.getByRole('button', { name: /Scan for Bluetooth printers/i }));
    await waitFor(() => expect(requestDevice).toHaveBeenCalled());

    // The id is case sensitive: uppercasing it broke the lookup at print time.
    const sheet = within(screen.getByRole('dialog'));
    expect(await sheet.findByText('aB3+/xYzQ0AbCdEfGhIj')).toBeInTheDocument();
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bluetooth printer found' }));
  });

  it('tells the operator when the browser has Web Bluetooth blocked', async () => {
    const blocked = Object.assign(new Error('Web Bluetooth API globally disabled.'), {
      name: 'NotFoundError',
    });
    stubBluetooth({ requestDevice: vi.fn().mockRejectedValue(blocked) });
    await openScanPanel();

    fireEvent.click(screen.getByRole('button', { name: /Scan for Bluetooth printers/i }));

    // Chrome only logs this to the dev console, so it used to look like a dead button.
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Bluetooth is blocked in this browser' }),
      ),
    );
  });

  it('stays quiet when the operator dismisses the chooser', async () => {
    const cancelled = Object.assign(new Error('User cancelled the requestDevice() chooser.'), {
      name: 'NotFoundError',
    });
    const requestDevice = vi.fn().mockRejectedValue(cancelled);
    stubBluetooth({ requestDevice });
    await openScanPanel();

    fireEvent.click(screen.getByRole('button', { name: /Scan for Bluetooth printers/i }));
    await waitFor(() => expect(requestDevice).toHaveBeenCalled());

    expect(addToast).not.toHaveBeenCalled();
  });

  it('explains that a browser without the API has no permission to grant', async () => {
    // Embedded/in-app browsers hide navigator.bluetooth entirely, so the
    // operator must be told the fix is another browser, not a permission.
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    delete (navigator as any).bluetooth;
    await openScanPanel();

    fireEvent.click(screen.getByRole('button', { name: /Scan for Bluetooth printers/i }));

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Bluetooth scanning unavailable',
          message: expect.stringContaining('cannot ask for permission'),
        }),
      ),
    );
  });

  it('explains a missing Bluetooth adapter before opening the chooser', async () => {
    const requestDevice = vi.fn();
    stubBluetooth({ requestDevice, getAvailability: vi.fn().mockResolvedValue(false) });
    await openScanPanel();

    fireEvent.click(screen.getByRole('button', { name: /Scan for Bluetooth printers/i }));

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Bluetooth not available' }),
      ),
    );
    expect(requestDevice).not.toHaveBeenCalled();
  });
});
