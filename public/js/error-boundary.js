// ============================================================
// Error Boundary — componente compartilhado entre as 3 telas
// Fallback elegante em vez de tela branca quando JS quebra
// ============================================================
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError:false, error:null }; }
  static getDerivedStateFromError(error) { return { hasError:true, error }; }
  componentDidCatch(err, info) { console.error('[FLAME ErrorBoundary]', err, info?.componentStack); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#060a13', padding:20 }},
        React.createElement('div', { style:{ textAlign:'center', maxWidth:440 }},
          React.createElement('div', { style:{ fontSize:48, marginBottom:12 }}, '\u26A0\uFE0F'),
          React.createElement('div', { style:{ fontSize:22, fontWeight:900, color:'#FF3B3B', marginBottom:8 }}, 'Algo deu errado'),
          React.createElement('div', { style:{ color:'#94a3b8', fontSize:14, marginBottom:24, lineHeight:1.6 }},
            'O jogo encontrou um erro inesperado. Seus dados est\u00E3o salvos \u2014 basta recarregar.'),
          React.createElement('button', {
            onClick: () => window.location.reload(),
            className: 'btn',
            style:{ background:'linear-gradient(135deg,#FF3B3B,#dc2626)', padding:'14px 32px', fontSize:16, fontWeight:800, borderRadius:10, boxShadow:'0 4px 24px rgba(255,59,59,.3)', cursor:'pointer', border:'none', color:'#fff' }
          }, 'Recarregar'),
          React.createElement('div', { style:{ color:'#475569', fontSize:11, marginTop:16 }},
            this.state.error?.message || 'Erro desconhecido')
        )
      )
    );
  }
}
