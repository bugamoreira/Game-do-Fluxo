// Código de acesso da turma (4 dígitos): os grupos digitam na J1 junto com o nome.
// Vem de painel_turma (visão do facilitador); some se a sessão não tiver acesso ao painel.

import { Card, Icone } from '../../shared/components/ui';

export function CodigoAcesso({ codigo, compacto = false }: { codigo: string | undefined; compacto?: boolean }) {
  return (
    <Card rotulo="Para os grupos entrarem" titulo="Código de acesso" espaco={compacto ? 'm' : undefined}>
      {codigo ? (
        <p
          aria-label={`Código de acesso ${codigo.split('').join(' ')}`}
          className={
            compacto
              ? 'font-space-mono text-4xl font-bold tracking-[0.3em] text-texto'
              : 'font-space-mono text-6xl font-bold tracking-[0.3em] text-texto'
          }
        >
          {codigo}
        </p>
      ) : (
        <p className="flex items-start gap-2 text-sm">
          <Icone nome="info" tamanho={16} className="mt-0.5 shrink-0" />
          O código aparece assim que o painel carregar os dados da turma.
        </p>
      )}
      <p className="mt-2 text-sm text-texto-suave">
        O telão aberto por esta janela também mostra o código. Grupo que volta no mesmo computador não precisa dele.
      </p>
    </Card>
  );
}
