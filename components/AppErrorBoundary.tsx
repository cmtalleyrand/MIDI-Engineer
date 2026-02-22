import React from 'react';
import {
  canClearOfflineCache,
  clearOfflineCache,
  createErrorDetails,
  ErrorDetails,
  formatDiagnostics,
  hardRefresh,
} from './errorRecovery';

type AppErrorBoundaryState = {
  details?: ErrorDetails;
  copyStatus: 'idle' | 'copied' | 'failed';
  showAdvancedRecovery: boolean;
};

export class AppErrorBoundary extends React.Component<
  React.PropsWithChildren,
  AppErrorBoundaryState
> {
  public state: AppErrorBoundaryState = {
    details: undefined,
    copyStatus: 'idle',
    showAdvancedRecovery: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return {
      details: createErrorDetails(error, 'react-render'),
      copyStatus: 'idle',
    };
  }

  public componentDidCatch(error: Error): void {
    console.error('App runtime error captured by AppErrorBoundary:', error);
  }

  private handleClearOfflineCache = async (): Promise<void> => {
    try {
      await clearOfflineCache();
      hardRefresh();
    } catch (error) {
      console.error('Failed to clear offline cache:', error);
      hardRefresh();
    }
  };

  private handleCopyDiagnostics = async (): Promise<void> => {
    const { details } = this.state;
    if (!details) {
      return;
    }

    try {
      await navigator.clipboard.writeText(formatDiagnostics(details));
      this.setState({ copyStatus: 'copied' });
    } catch (error) {
      console.error('Failed to copy diagnostics:', error);
      this.setState({ copyStatus: 'failed' });
    }
  };

  private revealAdvancedRecovery = (): void => {
    this.setState({ showAdvancedRecovery: true });
  };

  public render(): React.ReactNode {
    const { details, copyStatus, showAdvancedRecovery } = this.state;
    if (!details) {
      return this.props.children;
    }

    return (
      <section style={styles.panel} role="alert" aria-live="assertive">
        <h1 style={styles.heading}>Application error</h1>
        <p style={styles.text}>
          The app hit an unexpected exception and stopped. This does not assume any specific cause.
        </p>
        <p style={styles.text}>
          Use the diagnostics below for debugging. You can reload to retry, and use advanced recovery only
          if you explicitly want to reset browser-managed offline state.
        </p>

        <pre style={styles.diagnostics}>{formatDiagnostics(details)}</pre>

        <div style={styles.buttonRow}>
          <button style={styles.primaryButton} type="button" onClick={hardRefresh}>
            Reload app
          </button>
          <button
            style={styles.secondaryButton}
            type="button"
            onClick={this.handleCopyDiagnostics}
          >
            Copy diagnostics
          </button>
          {canClearOfflineCache() && !showAdvancedRecovery ? (
            <button
              style={styles.tertiaryButton}
              type="button"
              onClick={this.revealAdvancedRecovery}
            >
              Show advanced recovery
            </button>
          ) : null}
          {canClearOfflineCache() && showAdvancedRecovery ? (
            <button
              style={styles.tertiaryButton}
              type="button"
              onClick={this.handleClearOfflineCache}
            >
              Reset offline data
            </button>
          ) : null}
        </div>
        {showAdvancedRecovery ? (
          <p style={styles.status}>
            Advanced recovery clears service workers and browser cache storage for this origin before reloading.
          </p>
        ) : null}
        {copyStatus === 'copied' ? (
          <p style={styles.status}>Diagnostics copied to clipboard.</p>
        ) : null}
        {copyStatus === 'failed' ? (
          <p style={styles.status}>Could not copy automatically. Select and copy the text block manually.</p>
        ) : null}
      </section>
    );
  }
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    fontFamily: 'system-ui, sans-serif',
    maxWidth: '48rem',
    margin: '8vh auto',
    padding: '1.25rem',
    border: '1px solid #fca5a5',
    borderRadius: '0.75rem',
    background: '#fff1f2',
    color: '#111827',
    lineHeight: 1.5,
  },
  heading: {
    margin: '0 0 0.75rem',
    fontSize: '1.5rem',
  },
  text: {
    margin: '0.5rem 0',
  },
  diagnostics: {
    margin: '1rem 0',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    border: '1px solid #fecaca',
    background: '#ffffff',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: '0.9rem',
  },
  buttonRow: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '1rem',
    flexWrap: 'wrap',
  },
  primaryButton: {
    cursor: 'pointer',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.6rem 1rem',
    background: '#dc2626',
    color: '#ffffff',
    fontWeight: 600,
  },
  secondaryButton: {
    cursor: 'pointer',
    border: '1px solid #991b1b',
    borderRadius: '0.5rem',
    padding: '0.6rem 1rem',
    background: '#ffffff',
    color: '#7f1d1d',
    fontWeight: 600,
  },
  tertiaryButton: {
    cursor: 'pointer',
    border: '1px solid #d97706',
    borderRadius: '0.5rem',
    padding: '0.6rem 1rem',
    background: '#fff7ed',
    color: '#9a3412',
    fontWeight: 600,
  },
  status: {
    marginTop: '0.75rem',
    fontSize: '0.9rem',
  },
};
