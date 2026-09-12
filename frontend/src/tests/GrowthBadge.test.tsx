import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GrowthBadge } from '../components/ui/GrowthBadge';
import { ChartToggle } from '../components/ui/TremorWidgets';

describe('GrowthBadge', () => {
  it('renders an up badge for positive growth', () => {
    const { container } = render(<GrowthBadge value={9.34} />);
    expect(screen.getByText(/^9\.3%$/)).toBeTruthy();
    expect(container.querySelector('.bg-emerald-100')).toBeTruthy();
  });

  it('renders a down badge for negative growth', () => {
    const { container } = render(<GrowthBadge value={-1.94} />);
    expect(screen.getByText(/^1\.9%$/)).toBeTruthy();
    expect(container.querySelector('.bg-red-100')).toBeTruthy();
  });

  it('renders a flat badge for ~zero growth and nothing for null', () => {
    const { container, rerender } = render(<GrowthBadge value={0} />);
    expect(screen.getByText(/^0\.0%$/)).toBeTruthy();
    expect(container.querySelector('.bg-gray-200\\/50')).toBeTruthy();
    rerender(<GrowthBadge value={null} />);
    expect(container.textContent).toBe('');
  });
});

describe('ChartToggle', () => {
  it('does not clip the focus ring on its tab list', () => {
    const { container } = render(
      <ChartToggle
        options={[
          { value: 'qty', label: 'Qty' },
          { value: 'revenue', label: 'Revenue' },
        ]}
        value="qty"
        onChange={vi.fn()}
      />,
    );
    const list = container.querySelector('[role="tablist"]');
    expect(list?.className).toContain('!overflow-visible');
  });
});
