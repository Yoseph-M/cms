import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorBoundary } from '../components/common/ErrorBoundary';

const Boom: React.FC<{ message: string }> = ({ message }) => {
  throw new Error(message);
};

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // React logs caught render errors; keep the test output readable.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  window.sessionStorage.clear();
});

afterEach(() => {
  consoleError.mockRestore();
  window.sessionStorage.clear();
});

describe('ErrorBoundary', () => {
  it('names the crashing component instead of only the message', () => {
    render(
      <ErrorBoundary>
        <Boom message="Kettle exploded" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Kettle exploded')).toBeInTheDocument();
    expect(screen.getByText('Where it happened')).toBeInTheDocument();
    // The component stack is rendered, not just logged: it is the only thing
    // that says *which* component blew up.
    expect(screen.getByText(/at Boom/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy details/i })).toBeInTheDocument();
  });

  it('treats a hooks-count crash as a stale tab and recovers without a reload loop', () => {
    // A reload attempt that just happened: the boundary must not reload again,
    // otherwise a genuinely broken build would loop forever.
    window.sessionStorage.setItem('cms:auto-reloaded-at', String(Date.now()));

    render(
      <ErrorBoundary>
        <Boom message="Rendered more hooks than during the previous render." />
      </ErrorBoundary>,
    );

    expect(
      screen.getByText(/Reload to pick up the current version/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Reloading it now/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reload Application/i })).toBeInTheDocument();
  });

  it('offers an automatic reload when the stale copy has not been retried yet', () => {
    const reload = vi.fn();
    const originalLocation = window.location;
    // jsdom cannot navigate; stub it so the auto-recovery can be observed.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload },
    });

    try {
      render(
        <ErrorBoundary>
          <Boom message="Failed to fetch dynamically imported module: /assets/OwnerPrinters.js" />
        </ErrorBoundary>,
      );

      expect(screen.getByText(/Reloading it now/i)).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
