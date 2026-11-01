// J1: nome do grupo. O código da sala vem da URL (?sala=), padrão CBMEDE.

import { useId, useState, type FormEvent } from 'react';
import { Button, Card, Icone } from '../../shared/components/ui';
import { Moldura } from './Moldura';

interface TelaNomeProps {
  sala: string;
  nomeInicial?: string;
  entrando: boolean;
  erro: string | null;
  onEntrar: (nome: string) => void;
}

const MIN = 2;
const MAX = 30;

export function TelaNome({ sala, nomeInicial = '', entrando, erro, onEntrar }: TelaNomeProps) {
  const idCampo = useId();
  const idAjuda = useId();
  const idErro = useId();
  const [nome, setNome] = useState(nomeInicial);
  const [tocado, setTocado] = useState(false);
  const limpo = nome.trim().replace(/\s+/g, ' ');
  const invalido = limpo.length < MIN || limpo.length > MAX;
  const erroCampo = tocado && invalido ? `O nome do grupo precisa ter de ${MIN} a ${MAX} caracteres.` : null;
  const mensagem = erroCampo ?? erro;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTocado(true);
    if (!invalido) onEntrar(limpo);
  }

  return (
    <Moldura rotulo={`Sala ${sala}`} largura="p" centralizar>
      <Card grande espaco="g" rotulo="Entrar no jogo" titulo="Qual é o nome do seu grupo?">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor={idCampo} className="text-sm font-bold text-texto">
              Nome do grupo
            </label>
            <input
              id={idCampo}
              value={nome}
              onChange={e => setNome(e.target.value)}
              onBlur={() => setTocado(true)}
              maxLength={MAX + 10}
              autoComplete="off"
              autoFocus
              placeholder="Ex.: Os Fluxistas"
              aria-invalid={mensagem ? true : undefined}
              aria-describedby={mensagem ? `${idAjuda} ${idErro}` : idAjuda}
              className="min-h-12 rounded-2xl border-2 border-borda bg-cartao px-4 text-lg text-texto placeholder:text-texto-suave/70 focus:border-marinho"
            />
            <p id={idAjuda} className="text-sm text-texto-suave">
              Use o mesmo nome se precisar voltar: o grupo continua de onde parou.
            </p>
            {mensagem && (
              <p id={idErro} role="alert" className="flex items-start gap-2 rounded-2xl bg-amarelo-suave px-4 py-3 text-sm font-semibold text-texto">
                <Icone nome="alerta" tamanho={16} className="mt-0.5 shrink-0" />
                {mensagem}
              </p>
            )}
          </div>
          <Button type="submit" variante="verde" tamanho="g" larguraTotal carregando={entrando}>
            Entrar na sala
          </Button>
        </form>
      </Card>
      <p className="text-center text-sm text-texto-corpo">
        Sem conexão ou só quer praticar?{' '}
        <a href="?modo=solo" className="font-bold text-marinho underline underline-offset-4">
          Treinar sozinho
        </a>
      </p>
    </Moldura>
  );
}
