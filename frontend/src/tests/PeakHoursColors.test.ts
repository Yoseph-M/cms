import { describe, it, expect } from 'vitest';
import { heatColor } from '../components/ui/PeakHoursHeatmap';

/**
 * Peak-hours heatmap colour ramp.
 *
 * The stock sequential "blues" scheme painted the LOWEST value lightest, so an
 * hour with no orders at all came out near-white while a busy hour went almost
 * black — the signal inverted, and the palette clashed with the brand warm
 * accents. Zero orders is now the same flat tile the empty grid is drawn from,
 * and every hour with sales is a deeper orange the busier it gets.
 */

/** Parse `hsl(H S% L%)` into its three numbers. */
const parse = (color: string) => {
  const m = color.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!m) throw new Error(`Not an hsl() colour: ${color}`);
  return { hue: Number(m[1]), saturation: Number(m[2]), lightness: Number(m[3]) };
};

describe('heatColor', () => {
  it('renders an empty hour as the flat grid tile, not an orange fill', () => {
    expect(heatColor(0)).toBe('hsl(var(--secondary))');
  });

  it('runs an orange ramp that deepens as the count climbs', () => {
    const quiet = parse(heatColor(0.1));
    const mid = parse(heatColor(0.5));
    const busy = parse(heatColor(1));

    // Lightest → deepest: a busier hour is a stronger orange, never a lighter one.
    expect(quiet.lightness).toBeGreaterThan(mid.lightness);
    expect(mid.lightness).toBeGreaterThan(busy.lightness);

    // Deeper also means more saturated, and the hue stays recognisably orange.
    expect(quiet.saturation).toBeLessThan(mid.saturation);
    expect(mid.saturation).toBeLessThanOrEqual(busy.saturation);

    for (const step of [quiet, mid, busy]) {
      expect(step.hue).toBe(24);
      expect(step.saturation).toBeGreaterThan(80);
      expect(step.lightness).toBeGreaterThanOrEqual(30);
    }
  });

  it('is monotonic across the whole ramp and safe outside 0–1', () => {
    const lightness = [0.05, 0.25, 0.5, 0.75, 1].map((t) => parse(heatColor(t)).lightness);
    for (let i = 1; i < lightness.length; i += 1) {
      expect(lightness[i - 1]).toBeGreaterThan(lightness[i]);
    }
    // Clamped: a stray ratio can never escape the palette.
    expect(heatColor(4)).toBe(heatColor(1));
    expect(heatColor(-1)).toBe(heatColor(0));
  });
});
