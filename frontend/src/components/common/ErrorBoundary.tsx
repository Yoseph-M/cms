import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, ChevronDown, Copy, Check } from 'lucide-react';
import { Button } from '../ui/Button';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  /** True while we're reloading automatically after a stale-build error. */
  autoReloading: boolean;
  copied: boolean;
}

/**
 * Errors that mean the tab is holding an out-of-date copy of the code rather
 * than hitting a genuine bug:
 *
 *  - a dev hot-reload swapped a component's implementation under a live tree
 *    (React keeps the mounted hook state and compares it with the new code);
 *  - a deploy replaced the JS chunks this tab still points at.
 *
 * Both are cured by loading the app again, so we do it for the operator instead
 * of stranding them on the reload screen.
 */
const STALE_BUILD_SIGNATURES = [
  'rendered more hooks than during the previous render',
  'rendered fewer hooks than expected',
  'failed to fetch dynamically imported module',
  'importing a module script failed',
  'chunkloaderror',
  'loading chunk',
];

/** Reloading is only safe if it can't become a loop. */
const RELOAD_GUARD_KEY = 'cms:auto-reloaded-at';
const RELOAD_GUARD_WINDOW_MS = 15_000;

const isStaleBuildError = (error: Error | null): boolean => {
  const message = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return STALE_BUILD_SIGNATURES.some((signature) => message.includes(signature));
};

/** True when a reload attempt happened so recently that trying again would loop. */
const reloadedRecently = (): boolean => {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
    return Number.isFinite(last) && Date.now() - last < RELOAD_GUARD_WINDOW_MS;
  } catch {
    // Storage can be unavailable (private mode); without it we never auto-reload.
    return true;
  }
};

const rememberReload = () => {
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
};

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    componentStack: null,
    autoReloading: false,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Keep this first: it is the only copy of the component stack on the screen
    // for a crash that we can't recover from.
    console.error('Uncaught error:', error);
    console.error('Component stack:', errorInfo.componentStack);

    const stale = isStaleBuildError(error);
    const canRecover = stale && !reloadedRecently();

    this.setState({
      componentStack: errorInfo.componentStack ?? null,
      autoReloading: canRecover,
    });

    if (canRecover) {
      rememberReload();
      // Let the "bringing back the latest version" copy paint before the tab
      // goes away, so the reload reads as intentional rather than as a crash.
      window.setTimeout(() => window.location.reload(), 600);
    }
  }

  private handleReload = () => {
    rememberReload();
    window.location.reload();
  };

  private handleCopy = async () => {
    const { error, componentStack } = this.state;
    const details = [
      `Message: ${error?.message ?? 'Unknown render error'}`,
      `Name: ${error?.name ?? 'Error'}`,
      '',
      'Component stack:',
      componentStack?.trim() || '(not captured)',
      '',
      'Stack:',
      error?.stack || '(not captured)',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(details);
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      /* clipboard unavailable — the details are visible on screen anyway */
    }
  };

  public render() {
    const { hasError, error, componentStack, autoReloading, copied } = this.state;

    if (!hasError) return this.props.children;

    const stale = isStaleBuildError(error);

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="relative max-w-lg w-full bg-card border border-border rounded-2xl p-8 shadow-xl overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-destructive/60 to-transparent" />
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-destructive/20">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-display font-semibold text-foreground mb-2 text-center">
            {autoReloading ? 'Bringing back the latest version' : 'Something went wrong'}
          </h1>
          <p className="text-sm text-muted-foreground mb-6 text-center">
            {autoReloading
              ? 'This tab was holding an out-of-date copy of the app. Reloading it now…'
              : stale
                ? 'The app is out of date in this tab. Reload to pick up the current version.'
                : 'A critical error occurred in the application. Reload the page to continue.'}
          </p>

          <div className="bg-secondary/50 border border-border rounded-lg p-3 mb-4 overflow-auto max-h-32 text-left">
            <code className="text-xs text-destructive font-mono whitespace-pre-wrap break-words">
              {error?.message || 'Unknown render error'}
            </code>
          </div>

          {/* The component stack is what actually names the culprit, so it is
              captured and kept on screen instead of only in the console. */}
          <details className="group mb-6 rounded-lg border border-border bg-secondary/30">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
              <span>Where it happened</span>
              <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
            </summary>
            <pre className="max-h-56 overflow-auto border-t border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground font-mono whitespace-pre-wrap break-words">
              {componentStack?.trim() || 'No component stack was captured for this error.'}
            </pre>
          </details>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={this.handleReload} className="flex-1" leftIcon={<RefreshCcw className="w-4 h-4" />}>
              {autoReloading ? 'Reload now' : 'Reload Application'}
            </Button>
            <Button
              variant="outline"
              onClick={() => void this.handleCopy()}
              className="flex-1"
              leftIcon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            >
              {copied ? 'Copied' : 'Copy details'}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
