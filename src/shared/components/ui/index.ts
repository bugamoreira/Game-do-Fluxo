// Design system CBMEDE 2026 — componentes base (docs/design.md §4, docs/contratos.md §5).
export { Button, type ButtonProps, type VarianteBotao, type TamanhoBotao } from './Button';
export { Card, Rotulo, type CardProps } from './Card';
export { SectorTile, SETORES, LIMIAR_QUASE_CHEIO, type SectorTileProps } from './SectorTile';
export { PatientChip, GRAVIDADE, type PatientChipProps } from './PatientChip';
export { StatTile, type StatTileProps } from './StatTile';
export { DarkCallout, type DarkCalloutProps } from './DarkCallout';
export { Timeline, type TimelineProps } from './Timeline';
export { RankingTable, COLUNAS_PADRAO, type RankingTableProps } from './RankingTable';
export { ClockBar, INICIO_PLANTAO, FIM_PLANTAO, type ClockBarProps } from './ClockBar';
export { ConnectionBanner, type ConnectionBannerProps } from './ConnectionBanner';
export { TeamAvatar, iniciais, type TeamAvatarProps } from './TeamAvatar';
export { Modal, type ModalProps } from './Modal';
export { Toast, ToastArea, type ToastProps, type TipoToast } from './Toast';
export { Sidebar, type SidebarProps, type ItemSidebar } from './Sidebar';
export { Icone, type NomeIcone } from './Icone';
export { cx, horaDoPlantao, duracaoCurta, textoSobre } from './cx';
export type { ItemRanking, Metricas, Conexao, SetorUi, Tema, Rodada } from './types';
