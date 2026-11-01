// Barreira de erro na raiz de cada página (playbook cap. 04, regra 5): um erro
// em qualquer componente mostra uma tela amigável, com o design system do
// CBMEDE, em vez de derrubar a página. O erro vai para o Sentry (quando
// configurado) e, em desenvolvimento, para o console.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Sentry } from '../lib/sentry';
import { Button, Card } from './ui';

interface Props {
  children: ReactNode;
}

interface State {
  temErro: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { temErro: false };
  }

  static getDerivedStateFromError(): State {
    return { temErro: true };
  }

  componentDidCatch(erro: Error, info: ErrorInfo): void {
    Sentry.captureException(erro, { extra: { componentStack: info.componentStack } });
    if (import.meta.env.DEV) console.error('Erro capturado pela barreira de erro:', erro, info.componentStack);
  }

  render() {
    if (!this.state.temErro) return this.props.children;

    return (
      <main className="grid min-h-screen place-items-center bg-fundo-app p-6 font-sora text-texto">
        <div role="alert" className="w-full max-w-md">
          <Card grande rotulo="Erro inesperado" titulo="Algo não saiu como esperado">
            <p className="text-[15px] leading-relaxed text-texto-corpo">
              A página encontrou um erro e precisou parar. O jogo do grupo fica salvo neste computador: recarregue a
              página para continuar de onde parou.
            </p>
            <div className="mt-6">
              <Button variante="verde" tamanho="g" larguraTotal onClick={() => window.location.reload()}>
                Recarregar a página
              </Button>
            </div>
          </Card>
        </div>
      </main>
    );
  }
}
