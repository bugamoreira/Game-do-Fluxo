import { useId, useState } from 'react';
import { Button, Modal, TeamAvatar, cx } from '../../shared/components/ui';
import { textoConfere, type Confirmacao } from '../logica/confirmacoes';

interface DialogoConfirmacaoProps {
  confirmacao: Confirmacao | null;
  carregando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/** Diálogo de confirmação. Ação destrutiva nunca usa o botão verde. */
export function DialogoConfirmacao({
  confirmacao,
  carregando = false,
  onConfirmar,
  onCancelar,
}: DialogoConfirmacaoProps) {
  return (
    <Modal
      aberto={confirmacao !== null}
      onFechar={carregando ? () => {} : onCancelar}
      titulo={confirmacao?.titulo ?? ''}
      descricao={confirmacao?.descricao}
      bloquearFundo
    >
      {confirmacao && (
        // Remonta a cada confirmação: o campo digitado começa vazio.
        <CorpoConfirmacao
          key={confirmacao.titulo}
          confirmacao={confirmacao}
          carregando={carregando}
          onConfirmar={onConfirmar}
          onCancelar={onCancelar}
        />
      )}
    </Modal>
  );
}

function CorpoConfirmacao({
  confirmacao,
  carregando,
  onConfirmar,
  onCancelar,
}: {
  confirmacao: Confirmacao;
  carregando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const [digitado, setDigitado] = useState('');
  const idCampo = useId();
  const liberado = !confirmacao.digitar || textoConfere(digitado, confirmacao.digitar);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (liberado && !carregando) onConfirmar();
      }}
    >
      {confirmacao.grupos && confirmacao.grupos.length > 0 && (
        <ul aria-label="Grupos na sala" className="mb-2 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {confirmacao.grupos.map((g) => (
            <li
              key={g.id}
              className={cx(
                'flex items-center gap-3 rounded-2xl px-3 py-2',
                g.semSinal ? 'bg-amarelo-suave font-bold text-marinho-profundo' : 'bg-fundo-app',
              )}
            >
              <TeamAvatar nome={g.nome} cor={g.cor} conectado={!g.semSinal} />
              <span className="min-w-0 flex-1 truncate text-sm">{g.nome}</span>
              <span className={cx('text-xs', g.semSinal ? 'text-negativo-texto' : 'text-texto-suave')}>
                {g.semSinal ? 'Sem sinal' : 'Conectado'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {confirmacao.digitar && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idCampo} className="text-sm font-semibold text-texto">
            Código da sala
          </label>
          <input
            id={idCampo}
            data-autofoco
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="min-h-12 rounded-2xl border-2 border-borda bg-cartao px-4 font-space-mono text-lg tracking-[0.2em] text-texto uppercase focus:border-marinho"
          />
        </div>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button
          variante="fantasma"
          onClick={onCancelar}
          disabled={carregando}
          data-autofoco={confirmacao.digitar ? undefined : true}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          variante={confirmacao.destrutiva ? 'marinho' : 'verde'}
          disabled={!liberado}
          carregando={carregando}
        >
          {confirmacao.rotuloConfirmar}
        </Button>
      </div>
    </form>
  );
}
