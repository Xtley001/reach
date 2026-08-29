import { Component } from 'react';
import Icon from './ui/Icon';

export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(error, info) {
    // E-47/E-55: send to Sentry if initialized (see main.jsx) so a crash on
    // a volunteer's phone mid-call leaves a record instead of vanishing.
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(error, { extra: info });
    } else {
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary caught:', error, info);
    }
  }
  render() {
    if (this.state.error) return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24, textAlign: 'center' }}>
        <div style={{ color: 'var(--amber)', marginBottom: 16 }}>
          <Icon name="alert" size={36} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Something went wrong</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4, maxWidth: 360 }}>
          Your data's fine — nothing you've entered has been lost. Tap below to reload.
        </div>
        {import.meta.env.DEV && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20, maxWidth: 360, fontFamily: 'var(--font-mono)' }}>
            {this.state.error?.message}
          </div>
        )}
        <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
    return this.props.children;
  }
}
