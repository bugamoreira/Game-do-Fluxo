// F1 (início) — Abrir a turma: nome, evento, data e código da sala.

import { useId, useState, type FormEvent } from 'react';
import { Button, Card, DarkCallout, Icone } from '../../shared/components/ui';
import type { AbrirTurmaEntrada } from '../../shared/schemas';

export const CODIGO_PADRAO = 'CBMEDE';

interface AbrirTurmaProps {
  codigoInicial: string;
  enviando: boolean;
  erro: string | null;
  /** Aviso vindo de fora (ex.: a turma guardada neste navegador não existe mais). */
  aviso?: string | null;
  onAbrir: (entrada: AbrirTurmaEntrada) => void;
  /** Acompanhar uma turma já aberta com este código, sem abrir outra. */
  onRetomar: (codigo: string) => void;
}

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function AbrirTurma({ codigoInicial, enviando, erro, aviso, onAbrir, onRetomar }: AbrirTurmaProps) {
  const [nome, setNome] = useState('');
  const [evento, setEvento] = useState('CBMEDE 2026');
  const [data, setData] = useState(hojeIso);
  const [codigo, setCodigo] = useState(codigoInicial);
  const ids = { nome: useId(), evento: useId(), data: useId(), codigo: useId(), erro: useId(), ajuda: useId() };

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    onAbrir({
      codigo: codigo.trim().toUpperCase(),
      nome: nome.trim(),
      evento: evento.trim() || undefined,
      data: data || undefined,
    });
  }

  const campo =
    'min-h-12 w-full rounded-2xl border-2 border-borda bg-cartao px-4 text-base text-texto placeholder:text-texto-suave/70 focus:border-marinho';
  const rotulo = 'text-sm font-semibold text-texto';

  return (
    <div className="grid min-h-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Card grande espaco="g" rotulo="Dados da turma" titulo="Abrir a sala">
        <form className="grid grid-cols-1 gap-5 md:grid-cols-2" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label htmlFor={ids.nome} className={rotulo}>
              Nome da turma
            </label>
            <input
              id={ids.nome}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Curso de Gestão do ED Leaders"
              maxLength={80}
              required
              autoFocus
              aria-describedby={erro ? ids.erro : undefined}
              className={campo}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.evento} className={rotulo}>
              Evento
            </label>
            <input
              id={ids.evento}
              value={evento}
              onChange={(e) => setEvento(e.target.value)}
              maxLength={120}
              className={campo}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.data} className={rotulo}>
              Data
            </label>
            <input id={ids.data} type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label htmlFor={ids.codigo} className={rotulo}>
              Código da sala
            </label>
            <input
              id={ids.codigo}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              maxLength={16}
              autoComplete="off"
              spellCheck={false}
              aria-describedby={ids.ajuda}
              className={`${campo} font-space-mono text-xl tracking-[0.2em] uppercase`}
            />
            <p id={ids.ajuda} className="text-sm text-texto-suave">
              De 3 a 16 letras ou números. É o que os grupos digitam para entrar. Se já houver uma turma em andamento
              com esse código, o painel pergunta antes de substituí-la.
            </p>
          </div>

          {(erro || aviso) && (
            <p
              id={ids.erro}
              role="alert"
              className="rounded-2xl bg-amarelo-suave px-4 py-3 text-sm font-semibold text-marinho-profundo md:col-span-2"
            >
              {erro ?? aviso}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button
              type="submit"
              variante="verde"
              tamanho="g"
              carregando={enviando}
              icone={<Icone nome="sala" tamanho={20} />}
            >
              Abrir turma
            </Button>
            <Button
              variante="fantasma"
              disabled={enviando || codigo.trim().length < 3}
              onClick={() => onRetomar(codigo.trim().toUpperCase())}
            >
              Acompanhar turma já aberta com este código
            </Button>
          </div>
        </form>
      </Card>

      <DarkCallout rotulo="Antes de abrir" titulo="Um código por turma" icone={<Icone nome="info" />}>
        <p>
          A sala abre assim que você confirmar. Os grupos podem entrar em qualquer ordem e aparecem no painel com nome,
          cor e conexão.
        </p>
        <p className="mt-3">
          Nada é apagado: ao abrir uma turma nova com o mesmo código, a anterior fica arquivada com os resultados e o
          relatório.
        </p>
      </DarkCallout>
    </div>
  );
}
