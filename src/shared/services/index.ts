// Únicos módulos que falam com o Supabase (docs/contratos.md §2).
export * from './erros';
export { turmaService, normalizarCodigo } from './turmaService';
export { grupoService } from './grupoService';
export { syncService, type ResumoPlacar } from './syncService';
export { facilitadorService } from './facilitadorService';
export { relatorioService } from './relatorioService';
export { copiaLocal, sessaoLocal, escolherEstadoParaRestaurar } from './armazenamentoLocal';
