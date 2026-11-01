// Tudo o que aparece por cima do plantão: erro do motor, efeito cascata,
// confirmação de leito inadequado, flash de óbito e os efeitos sonoros.

import { useEffect, useState } from 'react';
import { Button, Modal, Toast, ToastArea } from '../../shared/components/ui';
import { musica } from '../lib/musicaAdapter';
import { storeJogo, useJogo } from '../jogo/useJogo';

interface AvisoCascata {
  id: number;
  texto: string;
  duracaoMs: number;
}

const DURACAO_AVISO_MS = 4500;
const DURACAO_FLASH_MS = 900;
const MAX_CASCATAS = 2;

export function AvisosDoJogo() {
  const aviso = useJogo(s => s.aviso);
  const confirmacao = useJogo(s => s.confirmacao);
  const limparAviso = useJogo(s => s.limparAviso);
  const confirmar = useJogo(s => s.confirmarLeitoInadequado);
  const cancelar = useJogo(s => s.cancelarConfirmacao);
  const [cascatas, setCascatas] = useState<AvisoCascata[]>([]);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    let proximo = 1;
    return storeJogo.getState().assinarOcorrencias(({ ocorrencias, emLote }) => {
      if (emLote) return; // recuperação após reconexão: nada de rajada de sons
      const sons = new Set(ocorrencias.flatMap(o => (o.som ? [o.som] : [])));
      sons.forEach(s => musica.efeito(s));
      if (ocorrencias.some(o => o.flashObito)) setFlash(f => f + 1);
      const novas = ocorrencias.flatMap(o => (o.cascata ? [{ id: proximo++, ...o.cascata }] : []));
      if (novas.length > 0) setCascatas(atual => [...atual, ...novas].slice(-MAX_CASCATAS));
    });
  }, []);

  useEffect(() => {
    if (flash === 0) return;
    const id = window.setTimeout(() => setFlash(0), DURACAO_FLASH_MS);
    return () => window.clearTimeout(id);
  }, [flash]);

  return (
    <>
      {flash > 0 && (
        <div
          key={flash}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-30 bg-grav-vermelho/25 motion-safe:animate-[fadeIn_.2s_ease-out_reverse]"
        />
      )}

      <ToastArea>
        {cascatas.map(c => (
          <Toast
            key={c.id}
            tipo="atencao"
            titulo="Efeito cascata"
            duracaoMs={c.duracaoMs}
            onFechar={() => setCascatas(atual => atual.filter(x => x.id !== c.id))}
          >
            {c.texto}
          </Toast>
        ))}
        {aviso && (
          <Toast key={aviso.id} tipo="atencao" titulo="Não deu para fazer isso" duracaoMs={DURACAO_AVISO_MS} onFechar={limparAviso}>
            {aviso.texto}
          </Toast>
        )}
      </ToastArea>

      <Modal
        aberto={confirmacao !== null}
        onFechar={cancelar}
        titulo="Internar em leito inadequado?"
        descricao={confirmacao?.texto}
        acoes={
          <>
            <Button variante="contorno" tamanho="p" onClick={cancelar} data-autofoco>
              Esperar vaga na UTI
            </Button>
            <Button variante="amarelo" tamanho="p" onClick={confirmar}>
              Internar na enfermaria
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed">
          Libera a maca do DE agora, mas o paciente fica fora do perfil da enfermaria: cerca de 1 em cada 4 deteriora em 4 horas.
        </p>
      </Modal>
    </>
  );
}
