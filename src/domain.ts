/** 领域事件信封。 */
export interface DomainEvent {
  event_id: string;
  event_type: string;
  aggregate_type: AggregateType;
  aggregate_id: string;
  occurred_at: string;
  /** 该聚合上的对象版本，从 1 开始连续递增。 */
  version: number;
  summary: string;
  actor?: { party_id: string; role?: string; [k: string]: unknown };
  payload?: Record<string, unknown>;
  correlation_id?: string;
  causation_id?: string;
}

/**
 * 公共事件语义稳定的四个原有聚合，外加全生命周期扩展聚合。
 */
export type AggregateType =
  | "artwork"
  | "site_agreement"
  | "design_revision"
  | "contribution_record"
  | "construction_project"
  | "fund_agreement"
  | "inspection_record"
  | "maintenance_case";

/** 影像与口述记忆分别授权，不得混用。 */
export type AuthorizationSubjectKind = "image" | "oral_history";

/** 责任依据：保修、保管交接、场地方、资金约定。 */
export type ResponsibilityBasis = "warranty" | "handover" | "site_owner" | "fund" | "custody";

/** 报损单由系统自动带出的快照。 */
export interface ResponsibleSnapshot {
  basis: ResponsibilityBasis;
  responsible_party_id: string;
  warranty_until?: string;
}

export interface FundSnapshot {
  fund_id: string;
  shares: Record<string, number>;
  per_case_cap: number | null;
}

/** 维修案件只有两种合法关闭方式：维修验收通过，或正式拆除完成。 */
export type MaintenanceCaseStatus =
  | "open"
  | "assigned"
  | "quote_approved"
  | "repair_done"
  | "demolition_proposed"
  | "demolition_approved"
  | "closed";
