import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Trash2, Home } from 'lucide-react';
import { safeStorage } from '../services/safeStorage.js';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCache = () => {
    safeStorage.clear();
    try {
      window.localStorage?.clear();
      window.sessionStorage?.clear();
    } catch {}
    window.location.href = window.location.pathname;
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            backgroundColor: '#030610',
            color: '#F8FAFC',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: '520px',
              width: '100%',
              background: 'rgba(11, 16, 28, 0.88)',
              border: '1px solid rgba(244, 63, 94, 0.35)',
              borderRadius: '20px',
              padding: '36px',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 35px rgba(244, 63, 94, 0.15)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: 'rgba(244, 63, 94, 0.15)',
                color: '#F43F5E',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
              }}
            >
              <AlertCircle size={32} />
            </div>

            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 10px' }}>
              Pickup Encountered an Issue
            </h1>

            <p style={{ color: '#94A3B8', fontSize: '14px', lineHeight: 1.6, margin: '0 0 20px' }}>
              An unexpected error occurred while rendering the page. You can reload the application or reset stored settings to restore normal operation.
            </p>

            {this.state.error && (
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.4)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  fontSize: '12px',
                  color: '#FCA5A5',
                  fontFamily: 'monospace',
                  textAlign: 'left',
                  overflowX: 'auto',
                  marginBottom: '24px',
                  maxHeight: '120px',
                  border: '1px solid rgba(244, 63, 94, 0.2)',
                }}
              >
                <b>{this.state.error.name}:</b> {this.state.error.message}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={this.handleReload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '10px',
                  background: '#06B6D4',
                  color: '#030712',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 0.2s',
                }}
              >
                <RefreshCw size={16} /> Reload Page
              </button>

              <button
                onClick={this.handleResetCache}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#F8FAFC',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={16} /> Reset Storage &amp; Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
