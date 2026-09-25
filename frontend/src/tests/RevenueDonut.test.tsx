import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

/**
 * Slice labels on the revenue donuts.
 *
 * The read is the pre-existing one: nivo draws a callout outside the ring for
 * every slice (`arcLinkLabel`, no skip angle) and writes the share inside the
 * slice in a darkened shade of its own colour. The revision that moved the
 * figures onto the circle in white, with the callouts removed, was reverted —
 * so this guards what is on screen now: every slice named outside the ring,
 * every share a whole percentage in the legend, and the empty state when a
 * window has no sales.
 *
 * nivo needs a measured container before it paints, so the legend (plain DOM)
 * carries the assertions.
 */

import { RevenueDonut, type DonutSegment } from '../components/owner/dashboard/RevenueDonut';

const SEGMENTS: DonutSegment[] = [
  { label: 'Food', value: 9600, color: '#F97316' },
  { label: 'Drink', value: 260, color: '#F59E0B' },
  { label: 'Dessert', value: 140, color: '#DC2626' },
];

describe('RevenueDonut shares', () => {
  it('reads each slice as a whole percentage in the legend', () => {
    render(<RevenueDonut segments={SEGMENTS} />);

    // 9600/10000, 260/10000, 140/10000 — rounded, as the chart always read.
    expect(screen.getByText('96%')).toBeInTheDocument();
    expect(screen.getByText('3%')).toBeInTheDocument();
    expect(screen.getByText('1%')).toBeInTheDocument();
  });

  it('lists every slice in the legend so a thin slice is never only a colour', () => {
    render(<RevenueDonut segments={SEGMENTS} />);

    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Drink')).toBeInTheDocument();
    expect(screen.getByText('Dessert')).toBeInTheDocument();
  });

  it('falls back to the empty state when there is nothing to show', () => {
    render(<RevenueDonut segments={[]} />);

    expect(screen.getByText('No sales data for this period.')).toBeInTheDocument();
  });
});
