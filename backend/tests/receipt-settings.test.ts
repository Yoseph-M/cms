import {
  buildEscPosKitchenTicket,
  buildEscPosTestSlip,
  humanizePrintReason,
  printFailureSentence,
} from '../src/services/printer.service';
import {
  DEFAULT_RECEIPT_SETTINGS,
  normalizeReceiptSettings,
  type ReceiptSettings,
} from '../src/services/receipt-settings.service';

const order = {
  clientOrderId: '123e4567-e89b-12d3-a456-426614174000',
  tableNumber: '12',
  waiterName: 'David Waiter',
  createdAt: new Date('2026-09-05T08:45:00.000Z'),
  items: [
    { name: 'Wagyu Gourmet Burger', quantity: 2, notes: 'No onions' },
    { name: 'Artisanal Iced Matcha', quantity: 1 },
  ],
};

const settings = (overrides: Partial<ReceiptSettings> = {}): ReceiptSettings => ({
  ...DEFAULT_RECEIPT_SETTINGS,
  ...DEFAULT_RECEIPT_SETTINGS.kitchenTicket,
  ...overrides,
  kitchenTicket: {
    ...DEFAULT_RECEIPT_SETTINGS.kitchenTicket,
    ...overrides.kitchenTicket,
  },
});

const text = (buffer: Buffer) => buffer.toString('ascii');

describe('receipt layout settings', () => {
  it('prints the configured kitchen header without customer receipt details', () => {
    const buffer = buildEscPosKitchenTicket(
      order,
      settings({
        businessName: 'Mahalna Electronics',
        businessPhone: '+251 90 123 4567',
        businessAddress: 'Bole Road, Addis Ababa',
        businessEmail: 'hello@mahalna.test',
        bottomMessage: 'Thank you for shopping with us!',
        secondaryBottomMessage: 'Visit us again!',
      }),
    );
    const ticket = text(buffer);

    expect(ticket).toContain('Mahalna Electronics');
    expect(ticket).not.toContain('+251 90 123 4567');
    expect(ticket).not.toContain('Bole Road, Addis Ababa');
    expect(ticket).not.toContain('hello@mahalna.test');
    expect(ticket).not.toContain('Thank you for shopping with us!');
    // The header must not swallow the operational part of the ticket.
    expect(ticket).toContain('KITCHEN TICKET');
    expect(ticket).toContain('Table: #12');
    expect(ticket).toContain('No onions');
  });

  it('honours the kitchen ticket visibility toggles', () => {
    const hidden = buildEscPosKitchenTicket(
      order,
      settings({
        businessName: 'Hidden Cafe',
        businessPhone: '0900000000',
        businessEmail: 'hidden@example.test',
        businessAddress: 'Hidden Street',
        showBusinessName: false,
        showBusinessPhone: false,
        showEmail: false,
        showBusinessAddress: false,
      }),
    );
    const ticket = text(hidden);
    expect(ticket).not.toContain('Hidden Cafe');
    expect(ticket).not.toContain('hidden@example.test');
    expect(ticket).not.toContain('Hidden Street');
    expect(ticket).not.toContain('0900000000');
  });

  it('honours the cashier, date and receipt-number toggles on the ticket', () => {
    const full = text(buildEscPosKitchenTicket(order, settings()));
    expect(full).toContain('Waiter: David Waiter');
    expect(full).toContain('Time:');
    expect(full).toContain('Order Ref: 123e4567');

    const trimmed = text(
      buildEscPosKitchenTicket(
        order,
        settings({
          showCashierName: false,
          showDateTime: false,
          showReceiptNumber: false,
        }),
      ),
    );
    expect(trimmed).not.toContain('Waiter:');
    expect(trimmed).not.toContain('Time:');
    expect(trimmed).not.toContain('Order Ref:');
    // The operational core of a kitchen ticket always prints.
    expect(trimmed).toContain('Table: #12');
  });

  it('uses the paper width for the divider and item column', () => {
    const narrow = text(buildEscPosKitchenTicket(order, settings({ paperSize: '58mm' })));
    const wide = text(buildEscPosKitchenTicket(order, settings({ paperSize: '80mm' })));

    expect(narrow).toContain(`${'-'.repeat(32)}\n`);
    expect(wide).toContain(`${'-'.repeat(48)}\n`);
    expect(narrow).not.toContain(`${'-'.repeat(48)}\n`);
  });

  it('uses kitchen ticket business settings on the Test Print slip', () => {
    const slip = text(
      buildEscPosTestSlip(
        'USB',
        settings({ businessName: 'Mahalna Electronics', paperSize: '58mm' }),
      ),
    );

    expect(slip).toContain('Mahalna Electronics');
    expect(slip).toContain('TEST PRINT');
    expect(slip).toContain('USB printing is working.');
    expect(slip).not.toContain('Thank you!');
  });

  it('clamps and defaults anything an older setting record may be missing', () => {
    expect(normalizeReceiptSettings({ copies: 9 }).copies).toBe(3);
    expect(normalizeReceiptSettings({ copies: 0 }).copies).toBe(1);
    expect(normalizeReceiptSettings({ copies: 'lots' }).copies).toBe(1);
    expect(normalizeReceiptSettings({ paperSize: 'A4' }).paperSize).toBe('80mm');
    expect(normalizeReceiptSettings({ taxDisplay: 'mystery' }).taxDisplay).toBe('show');
    expect(normalizeReceiptSettings({}).bottomMessage).toBe(
      DEFAULT_RECEIPT_SETTINGS.bottomMessage,
    );
    // Toggles added after a record was saved default to visible.
    expect(normalizeReceiptSettings({ showChange: 'no' }).showChange).toBe(true);
    expect(normalizeReceiptSettings({ showCashierName: false }).showCashierName).toBe(false);
  });
});

describe('plain-English printer failures', () => {
  it('names the cause instead of repeating Chromium wording', () => {
    expect(
      humanizePrintReason(
        "Failed to execute 'claimInterface' on 'USBService': Unable to claim interface.",
      ),
    ).toBe('another window or program is using the printer');
    expect(humanizePrintReason('connect ECONNREFUSED 192.168.1.5:9100')).toBe(
      'the printer is not reachable',
    );
    expect(humanizePrintReason('The printer stopped responding.')).toBe(
      'the printer stopped responding',
    );
    expect(humanizePrintReason('something exploded at 0x5f3a')).toBe(
      'the printer did not answer',
    );
  });

  it('keeps the specific hardware cause when the agent reports one', () => {
    expect(humanizePrintReason('Printer is switched off')).toBe('the printer is switched off');
    expect(humanizePrintReason('Error: paper jam in tray 1')).toBe(
      'there is a paper jam in the printer',
    );
    expect(humanizePrintReason('Cover open')).toBe("the printer's cover is open");
    expect(humanizePrintReason('No printer name configured for this station')).toBe(
      'no printer is set up for this terminal',
    );
  });

  it('does not degrade a sentence it already produced', () => {
    expect(humanizePrintReason('The printer is switched off.')).toBe(
      'the printer is switched off',
    );
    expect(humanizePrintReason('The printer is not reachable.')).toBe(
      'the printer is not reachable',
    );
  });

  it('returns a complete sentence for socket payloads', () => {
    expect(printFailureSentence('socket hang up')).toBe('The printer is not reachable.');
  });
});
