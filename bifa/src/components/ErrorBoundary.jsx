import React from 'react';

// React error boundaries must be class components — there is still no hooks
// equivalent of getDerivedStateFromError/componentDidCatch. Used at the app
// root (catch-all) and again wrapped tightly around the R3F <Canvas> (so a
// WebGL failure on some unusual browser loses only the decorative emblem,
// not the entire hero).
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('BIC UI error boundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
