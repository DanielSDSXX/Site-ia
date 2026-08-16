/**
 * Formato dos dados do DataJud como chegam ao cliente.
 *
 * Espelha `DatajudProcessView` do servidor, com Date já serializada em string.
 * Fica num arquivo próprio para que o painel e a ficha compartilhem o mesmo
 * contrato em vez de cada um redeclarar o seu.
 */

export type SituationCode = 'ATIVO' | 'SUSPENSO' | 'ARQUIVADO' | 'BAIXADO' | 'INDEFINIDO';

export interface MovementDto {
  code: number | null;
  name: string;
  occurredAt: string | null;
  complements: string[];
  judgingBody: string | null;
}

export interface PartyDto {
  name: string;
  role: string;
  side: 'OURS' | 'OPPOSING' | 'NEUTRAL';
  lawyerName: string | null;
}

export interface DatajudProcessDto {
  id: string;
  caseNumber: string;
  caseNumberDigits: string | null;
  court: string;
  index: string;
  degree: string | null;
  procedureClass: string | null;
  subjects: string[];
  judgingBody: string | null;
  filedAt: string | null;
  lastUpdateAt: string | null;
  system: string | null;
  format: string | null;
  secrecy: { level: number; isSecret: boolean; label: string };
  situation: {
    code: SituationCode;
    label: string;
    basis: { name: string; occurredAt: string | null; code: number | null } | null;
    inferred: true;
  };
  movements: MovementDto[];
  sourceName: string;
  local: { id: string; number: string; status: string; parties: PartyDto[] } | null;
}

export interface ConsultResponse {
  enabled: boolean;
  configurationHint: string | null;
  index: string;
  total: number;
  processes: DatajudProcessDto[];
  error: string | null;
  courts: { value: string; label: string }[];
}

export interface StatusResponse {
  status: { enabled: boolean; reason: string | null; index: string };
  courts: { value: string; label: string }[];
}
