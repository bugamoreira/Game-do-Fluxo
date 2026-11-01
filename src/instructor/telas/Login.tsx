// F0 — Login do facilitador (Supabase Auth, e-mail e senha). Nenhuma credencial no código.

import { useId, useState, type FormEvent } from 'react';
import { Button, Card, Icone } from '../../shared/components/ui';
import type { SessaoFacilitador } from '../../shared/schemas';
import { mensagemDeErro } from '../logica/erros';
import type { ServicosFacilitador } from '../servicos';

interface LoginProps {
  servicos: ServicosFacilitador;
  onEntrar: (sessao: SessaoFacilitador) => void;
}

export function Login({ servicos, onEntrar }: LoginProps) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const idEmail = useId();
  const idSenha = useId();
  const idErro = useId();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      onEntrar(await servicos.login(email, senha));
    } catch (falha) {
      setErro(mensagemDeErro(falha));
      setEnviando(false);
    }
  }

  const campo =
    'min-h-12 w-full rounded-2xl border-2 border-borda bg-cartao px-4 text-base text-texto placeholder:text-texto-suave/70 focus:border-marinho';

  return (
    <div className="grid h-screen min-h-0 grid-cols-1 overflow-auto bg-fundo-app font-sora lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="relative isolate hidden flex-col justify-between overflow-hidden bg-degrade-cbmede p-12 text-white lg:flex">
        <span
          aria-hidden="true"
          className="absolute -top-24 -right-24 -z-10 size-96 rounded-full bg-amarelo/15 blur-3xl"
        />
        <div>
          <p className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-amarelo">
            — Acesso do facilitador
          </p>
          <h1 className="mt-4 text-titulo-g font-bold">
            Simulador do <span className="text-amarelo">Plantão</span>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-white/85">
            Abra a turma, acompanhe os grupos ao vivo e conduza o debrief do Plantão Travado ao Plantão Lean.
          </p>
        </div>
        <ul className="flex max-w-md flex-col gap-3 text-[15px] text-white/85">
          {[
            'Os grupos entram pelo código da sala, em qualquer ordem.',
            'O relógio é o da sala: pausar e retomar valem para todos.',
            'No fim, o relatório da turma fica num link para compartilhar.',
          ].map((t) => (
            <li key={t} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-amarelo"
              >
                <Icone nome="check" tamanho={14} strokeWidth={3} />
              </span>
              {t}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4">
          <img src="/img/brand/abramede.png" alt="ABRAMEDE" className="h-14 rounded-xl" />
          <p className="text-sm text-white/70">CBMEDE 2026 · Rio de Janeiro · Realização ED Leaders</p>
        </div>
      </section>

      <main className="flex flex-col items-center justify-center gap-4 p-6">
        <a
          href="/"
          className="inline-flex w-full max-w-md items-center gap-2 text-sm font-bold text-marinho underline-offset-4 hover:underline"
        >
          <Icone nome="setaEsquerda" tamanho={16} />
          Voltar às orientações
        </a>
        <Card grande espaco="g" className="w-full max-w-md">
          <p className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-texto-suave">
            Painel do facilitador
          </p>
          <h2 className="mt-1 text-titulo-s font-bold text-texto">Entrar</h2>
          <p className="mt-2 text-[15px] leading-relaxed">
            Use o e-mail e a senha cadastrados para a equipe de facilitação.
          </p>

          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={idEmail} className="text-sm font-semibold text-texto">
                E-mail
              </label>
              <input
                id={idEmail}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                aria-invalid={erro ? true : undefined}
                aria-describedby={erro ? idErro : undefined}
                className={campo}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={idSenha} className="text-sm font-semibold text-texto">
                Senha
              </label>
              <input
                id={idSenha}
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
                required
                aria-invalid={erro ? true : undefined}
                aria-describedby={erro ? idErro : undefined}
                className={campo}
              />
            </div>
            {erro && (
              <p
                id={idErro}
                role="alert"
                className="rounded-2xl bg-amarelo-suave px-4 py-3 text-sm font-semibold text-marinho-profundo"
              >
                {erro}
              </p>
            )}
            <Button type="submit" variante="verde" tamanho="g" larguraTotal carregando={enviando} className="mt-2">
              Entrar no painel
            </Button>
          </form>

          {servicos.modo === 'demo' && (
            <p className="mt-5 rounded-2xl bg-fundo-app px-4 py-3 text-sm">
              <strong className="text-texto">Modo demonstração.</strong> Sem servidor: qualquer e-mail válido e senha
              com 6 ou mais caracteres.
            </p>
          )}
        </Card>
      </main>
    </div>
  );
}
