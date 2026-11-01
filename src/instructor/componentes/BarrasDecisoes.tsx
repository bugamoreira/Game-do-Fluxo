// Decisões reativas × produtivas por grupo (carga do gestor, design.md §9).
// Cor nunca sozinha: cada barra traz os números escritos.

import { TeamAvatar } from '../../shared/components/ui';
import type { ItemRanking } from '../../shared/schemas';
import { porcento, umaCasa } from '../logica/formato';
import { cargaDoGestor } from '../logica/metricas';

export function BarrasDecisoes({ itens }: { itens: ItemRanking[] }) {
  const linhas = itens.map((i) => ({ item: i, carga: cargaDoGestor(i) }));
  const maior = Math.max(1, ...linhas.map((l) => l.carga.reativas + l.carga.produtivas));

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-3 w-6 rounded-pilula bg-amarelo" />
          Reativas: apagar incêndio
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-3 w-6 rounded-pilula bg-marinho" />
          Produtivas: puxar o fluxo
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {linhas.map(({ item, carga }) => {
          const total = carga.reativas + carga.produtivas;
          return (
            <li key={item.grupoId} className="grid grid-cols-[minmax(0,200px)_minmax(0,1fr)_auto] items-center gap-4">
              <TeamAvatar nome={item.nome} cor={item.cor} tamanho="p" comNome className="max-w-44" />
              <div
                className="flex h-4 overflow-hidden rounded-pilula bg-fundo-app"
                role="img"
                aria-label={`${item.nome}: ${carga.reativas} decisões reativas e ${carga.produtivas} produtivas`}
              >
                <span className="h-full bg-amarelo" style={{ width: `${(carga.reativas / maior) * 100}%` }} />
                <span className="h-full bg-marinho" style={{ width: `${(carga.produtivas / maior) * 100}%` }} />
              </div>
              <span className="text-right font-space-mono text-sm whitespace-nowrap text-texto-corpo tabular-nums">
                {total} · {porcento(carga.pctReativas)} reat. · {umaCasa(carga.alertasPorHora)} alertas/h
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
