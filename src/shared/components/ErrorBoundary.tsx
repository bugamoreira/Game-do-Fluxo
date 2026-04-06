import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    console.error('[FLAME ErrorBoundary]', err, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#060a13', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 440 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>&#x26A0;&#xFE0F;</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#FF3B3B', marginBottom: 8 }}>Algo deu errado</div>
          <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
            O jogo encontrou um erro inesperado. Seus dados estão salvos — basta recarregar.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'linear-gradient(135deg,#FF3B3B,#dc2626)',
              padding: '14px 32px', fontSize: 16, fontWeight: 800, borderRadius: 10,
              boxShadow: '0 4px 24px rgba(255,59,59,.3)', cursor: 'pointer',
              border: 'none', color: '#fff',
            }}
          >
            Recarregar
          </button>
          <div style={{ color: '#475569', fontSize: 11, marginTop: 16 }}>
            {this.state.error?.message || 'Erro desconhecido'}
          </div>
        </div>
      </div>
    );
  }
}
