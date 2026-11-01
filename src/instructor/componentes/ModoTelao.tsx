// Modo telão na própria janela, para quem usa uma tela só: embute a visão de
// projeção (`projetor.html?sala=...`) por endereço, sem importar código do telão.

import { useEffect, useRef } from 'react';
import { Button, Icone } from '../../shared/components/ui';

interface ModoTelaoProps {
  url: string;
  onSair: () => void;
}

export function ModoTelao({ url, onSair }: ModoTelaoProps) {
  const caixa = useRef<HTMLDivElement>(null);
  const sairRef = useRef(onSair);
  useEffect(() => {
    sairRef.current = onSair;
  }, [onSair]);

  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    caixa.current?.querySelector<HTMLElement>('button')?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !document.fullscreenElement) sairRef.current();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      anterior?.focus();
    };
  }, []);

  function telaCheia() {
    const el = caixa.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen?.().catch(() => {});
  }

  return (
    <div
      ref={caixa}
      role="dialog"
      aria-modal="true"
      aria-label="Modo telão"
      className="group fixed inset-0 z-50 bg-marinho-profundo"
    >
      <iframe src={url} title="Telão da turma" className="h-full w-full border-0" />
      <div className="absolute top-4 right-4 flex gap-2 opacity-30 transition-opacity group-focus-within:opacity-100 hover:opacity-100">
        <Button
          variante="contorno"
          sobreEscuro
          tamanho="p"
          icone={<Icone nome="telao" tamanho={16} />}
          onClick={telaCheia}
        >
          Tela cheia
        </Button>
        <Button variante="amarelo" tamanho="p" icone={<Icone nome="fechar" tamanho={16} />} onClick={onSair}>
          Voltar ao painel
        </Button>
      </div>
    </div>
  );
}
