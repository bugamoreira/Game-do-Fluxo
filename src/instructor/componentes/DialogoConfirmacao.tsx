import { useId, useState } from 'react';
import { Button, Modal } from '../../shared/components/ui';
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
