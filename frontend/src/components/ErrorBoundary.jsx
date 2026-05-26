import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Something went wrong</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24, maxWidth: 360, fontFamily: 'var(--font-mono)' }}>
          {this.state.error?.message}
        </div>
        <button className="btn btn-outline" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
    return this.props.children;
  }
}
