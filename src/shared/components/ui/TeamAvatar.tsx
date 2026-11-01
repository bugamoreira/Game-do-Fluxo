import { cx, textoSobre } from './cx';

export interface TeamAvatarProps {
  nome: string;
  cor: string;
  tamanho?: 'p' | 'm' | 'g';
  /** Mostra ponto de conexão (verde da marca = conectado, contorno = sem conexão). */
  conectado?: boolean;
  /** Mostra o nome ao lado. */
  comNome?: boolean;
  tema?: 'claro' | 'escuro';
  className?: string;
}

const TAMANHOS = {
  p: 'size-8 text-xs',
  m: 'size-10 text-sm',
  g: 'size-14 text-lg',
} as const;

export function iniciais(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter(p => p.length > 2 || /^\d+$/.test(p));
  const base = partes.length > 0 ? partes : nome.trim().split(/\s+/);
  const letras = base.length >= 2 ? `${base[0]![0]}${base[1]![0]}` : (base[0] ?? '?').slice(0, 2);
  return letras.toUpperCase();
}

export function TeamAvatar({
  nome,
  cor,
  tamanho = 'm',
  conectado,
  comNome = false,
  tema = 'claro',
  className,
}: TeamAvatarProps) {
  const estado = conectado === undefined ? '' : conectado ? ', conectado' : ', sem conexão';
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-2.5', className)}>
      <span
        role="img"
        aria-label={`Grupo ${nome}${estado}`}
        className={cx(
          'relative grid shrink-0 place-items-center rounded-full font-sora font-bold ring-2',
          tema === 'escuro' ? 'ring-white/20' : 'ring-white',
          TAMANHOS[tamanho],
        )}
        style={{ background: cor, color: textoSobre(cor) }}
      >
        <span aria-hidden="true">{iniciais(nome)}</span>
        {conectado !== undefined && (
          <span
            aria-hidden="true"
            className={cx(
              'absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2',
              tema === 'escuro' ? 'border-marinho-profundo' : 'border-white',
              conectado ? 'bg-verde' : 'bg-white ring-2 ring-inset ring-texto-suave',
            )}
          />
        )}
      </span>
      {comNome && (
        <span
          aria-hidden="true"
          className={cx('truncate font-semibold', tema === 'escuro' ? 'text-white' : 'text-texto')}
        >
          {nome}
        </span>
      )}
    </span>
  );
}
