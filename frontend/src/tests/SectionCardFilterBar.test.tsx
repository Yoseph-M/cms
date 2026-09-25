import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SectionCard } from '../components/owner/dashboard/SectionCard';

/**
 * Dashboard card header layout.
 *
 * Best sellers has to fit a metric switch (Revenue | Units) AND a depth filter
 * (Top 5/10/20) into a one-third-width card. When the two controls were laid
 * out as independent wrapping items, the depth filter was pushed past the card
 * edge and the card's `overflow-hidden` hid it — the filter looked missing.
 *
 * These assertions pin the shape that fixes it: both controls live inside ONE
 * non-wrapping bar, and that bar is the item that wraps onto its own line.
 * jsdom has no layout engine, so the classNames are the contract here.
 */
describe('SectionCard filter bar', () => {
  const renderCard = (filterClassName?: string) =>
    render(
      <SectionCard
        title="Best sellers"
        description="Share of units sold in range"
        toolbar={<button type="button">Revenue | Units</button>}
        filter={{
          label: 'Top 5',
          options: [
            { value: '5', label: 'Top 5' },
            { value: '10', label: 'Top 10' },
          ],
          value: '5',
          onChange: () => {},
          className: filterClassName,
        }}
      >
        <p>bars</p>
      </SectionCard>,
    );

  it('groups the metric switch and the depth filter into a single bar', () => {
    renderCard();

    const metricSwitch = screen.getByText('Revenue | Units');
    const bar = metricSwitch.parentElement as HTMLElement;

    // The depth filter must live in the SAME bar as the metric switch…
    expect(bar.contains(screen.getByText('Top 5'))).toBe(true);
    // …and that bar must never split, or half of it ends up outside the card.
    expect(bar.className).not.toContain('flex-wrap');
    // The header may row-wrap, so a narrow card moves the whole bar down
    // instead of clipping it.
    expect(bar.parentElement?.className).toContain('flex-wrap');
  });

  it('can render the depth filter as a compact pill next to the switch', () => {
    renderCard('w-auto');
    const trigger = screen.getByText('Top 5').closest('button') as HTMLElement;
    expect(trigger.className).toContain('w-auto');
  });
});
