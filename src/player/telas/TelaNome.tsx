// J1: nome do grupo e código de acesso (4 dígitos, mostrado no telão).
// O código da sala vem da URL (?sala=), padrão CBMEDE.

import { useId, useState, type FormEvent } from 'react';
import { Button, Card, Icone } from '../../shared/components/ui';
import { Moldura } from './Moldura';

interface TelaNomeProps {
  sala: string;
  nomeInicial?: string;
  /**
   * Nome do grupo da sessão deste computador nesta turma: com ele, o código de
   * acesso é dispensável (o grupo volta pelo token salvo).
   */
  nomeComSessao?: string | null;
  entrando: boolean;
  erro: string | null;
  onEntrar: (nome: string, codigoAcesso: string | null) => void;
}

const MIN = 2;
const MAX = 30;

export function TelaNome({ sala, nomeInicial = '', nomeComSessao = null, entrando, erro, onEntrar }: TelaNomeProps) {
  const idCampo = useId();
  const idAjuda = useId();
  const idCodigo = useId();
  const idAjudaCodigo = useId();
  const idErro = useId();
  const [nome, setNome] = useState(nomeInicial);
  const [codigo, setCodigo] = useState('');
  const [tocado, setTocado] = useState(false);
  const limpo = nome.trim().replace(/\s+/g, ' ');
  const invalido = limpo.length < MIN || limpo.length > MAX;
  const voltaPelaSessao = nomeComSessao !== null && limpo.toLowerCase() === nomeComSessao.trim().replace(/\s+/g, ' ').toLowerCase();
  const codigoInvalido = !/^[0-9]{4}$/.test(codigo) && !(voltaPelaSessao && codigo === '');
  const erroCampo = !tocado
    ? null
    : invalido
      ? `O nome do grupo precisa ter de ${MIN} a ${MAX} caracteres.`
      : codigoInvalido
        ? 'Digite o código de acesso de 4 dígitos que aparece no telão.'
        : null;
  const mensagem = erroCampo ?? erro;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTocado(true);
    if (!invalido && !codigoInvalido) onEntrar(limpo, codigo === '' ? null : codigo);
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
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={idCodigo} className="text-sm font-bold text-texto">
              Código de acesso
            </label>
            <input
              id={idCodigo}
              value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              autoComplete="off"
              placeholder="0000"
              aria-invalid={tocado && codigoInvalido ? true : undefined}
              aria-describedby={mensagem ? `${idAjudaCodigo} ${idErro}` : idAjudaCodigo}
              className="min-h-12 w-40 rounded-2xl border-2 border-borda bg-cartao px-4 text-center font-mono text-2xl tracking-[0.4em] text-texto placeholder:text-texto-suave/50 focus:border-marinho"
            />
            <p id={idAjudaCodigo} className="text-sm text-texto-suave">
              O código aparece no telão da sala. {voltaPelaSessao ? 'Este computador já é deste grupo: o código é opcional.' : ''}
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
