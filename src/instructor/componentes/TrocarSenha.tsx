// Troca de senha do facilitador logado (Supabase Auth). A senha nova é digitada
// duas vezes; a regra (12 a 72 caracteres) é conferida no service com Zod.

import { useId, useState, type FormEvent } from 'react';
import { Button, Modal } from '../../shared/components/ui';
import { mensagemDeErro } from '../logica/erros';
import type { ServicosFacilitador } from '../servicos';

const CAMPO =
  'min-h-12 w-full rounded-2xl border-2 border-borda bg-cartao px-4 text-base text-texto placeholder:text-texto-suave/70 focus:border-marinho';

interface TrocarSenhaProps {
  aberto: boolean;
  servicos: ServicosFacilitador;
  onFechar: () => void;
  onTrocada: () => void;
}

export function TrocarSenha({ aberto, servicos, onFechar, onTrocada }: TrocarSenhaProps) {
  const idNova = useId();
  const idConfirma = useId();
  const idErro = useId();
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function fechar() {
    setNova('');
    setConfirma('');
    setErro(null);
    onFechar();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (nova !== confirma) {
      setErro('As duas senhas não são iguais.');
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      await servicos.trocarSenha(nova);
      setNova('');
      setConfirma('');
      onTrocada();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      onFechar={fechar}
      titulo="Trocar senha"
      descricao="Use ao menos 12 caracteres. A senha nova vale para o próximo login."
      largura="p"
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idNova} className="text-sm font-semibold text-texto">
            Senha nova
          </label>
          <input
            id={idNova}
            type="password"
            value={nova}
            onChange={(ev) => setNova(ev.target.value)}
            autoComplete="new-password"
            required
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? idErro : undefined}
            className={CAMPO}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idConfirma} className="text-sm font-semibold text-texto">
            Repita a senha nova
          </label>
          <input
            id={idConfirma}
            type="password"
            value={confirma}
            onChange={(ev) => setConfirma(ev.target.value)}
            autoComplete="new-password"
            required
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? idErro : undefined}
            className={CAMPO}
          />
        </div>
        {erro && (
          <p id={idErro} role="alert" className="rounded-2xl bg-amarelo-suave px-4 py-3 text-sm font-semibold text-marinho-profundo">
            {erro}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variante="contorno" onClick={fechar}>
            Cancelar
          </Button>
          <Button type="submit" variante="verde" carregando={enviando}>
            Salvar senha nova
          </Button>
        </div>
      </form>
    </Modal>
  );
}
