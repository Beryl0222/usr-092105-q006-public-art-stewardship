/**
 * 公共艺术共创养护领域模型。
 * 四类聚合的公共事件语义保持稳定：site_agreement / design_revision / contribution_record / maintenance_case。
 */

export type AggregateType = "site_agreement" | "design_revision" | "contribution_record" | "maintenance_case";

export type EventType =
  | "SITE_PERMISSION_GRANTED"
  | "STEWARDSHIP_TERMS_SET"
  | "CUSTODY_TRANSFERRED"
  | "DECOMMISSION_DECIDED"
  | "INPUT_COLLECTED"
  | "DESIGN_DECIDED"
  | "MATERIAL_ACCEPTED"
  | "WORK_VERSION_PUBLISHED"
  | "WORK_PROFILE_PUBLISHED"
  | "CONSENT_GRANTED"
  | "CONSENT_REVOKED"
  | "ATTRIBUTION_RECORDED"
  | "DISPUTE_RAISED"
  | "DISPUTE_RESOLVED"
  | "SAFETY_CLEARED"
  | "WORK_ACCEPTED"
  | "INSPECTION_LOGGED"
  | "DAMAGE_REPORTED"
  | "REPAIR_BUDGETED"
  | "REPAIR_ASSIGNED"
  | "REPAIR_ACCEPTED";

/** 责任主体。 */
export interface Party {
  name: string;
  org: string;
  role: string;
  contact?: string;
}

/** 资金约定：维修资金由谁按什么比例分担，各方比例合计为 1。 */
export interface FundingTerms {
  repair_fund: { party: string; share: number }[];
  note?: string;
}

/** 场地许可（site_agreement）。 */
export interface SitePermissionGranted {
  site_owner: string;
  location: string;
  permitted_use: string;
  valid_from: string;
  valid_until: string;
  conditions?: string[];
}

/** 责任与资金约定（site_agreement）；报损单据此自动带出责任人与资金约定。 */
export interface StewardshipTermsSet {
  steward: Party;
  funding: FundingTerms;
  inspection_interval_days: number;
  effective_from: string;
}

/** 移交（site_agreement）；课程结束或负责人调动都不能让未结维修丢失。 */
export interface CustodyTransferred {
  reason: "course_ended" | "staff_reassigned" | "org_handover";
  from_steward: Party;
  to_steward: Party;
  open_case_refs: string[];
  handover_note?: string;
}

/** 正式拆除决定（site_agreement）；拆除后全部未结案件终结。 */
export interface DecommissionDecided {
  decided_by: string[];
  reason: string;
  material_handling: { material_ref: string; handling: string }[];
  archive_refs?: string[];
}

/** 访谈与公众意见（design_revision）；口述记忆须引用 oral_history 授权。 */
export interface InputCollected {
  channel: "interview" | "questionnaire" | "workshop" | "field_comment";
  contributor_ref: string;
  topic: string;
  content_ref?: string;
  consent_refs: string[];
  support_count?: number;
}

/** 设计定稿（design_revision）；意见多少不能自动替代设计判断，必须记录取舍理由。 */
export interface DesignDecided {
  revision_no: number;
  considered_inputs: string[];
  rationale: {
    adopted: { option: string; reason: string }[];
    rejected: { option: string; reason: string; support_count?: number }[];
  };
  decided_by: string[];
}

/** 旧物进场（design_revision）；记录权属与捐赠者同意的改造范围。 */
export interface MaterialAccepted {
  item: string;
  donor_ref: string;
  ownership: "donated" | "loaned" | "purchased";
  agreed_scope: string;
  consent_ref: string;
  condition_note?: string;
}

/** 作品版本（design_revision）；重大改造形成新版本。 */
export interface WorkVersionPublished {
  version_no: number;
  change_type: "major" | "minor";
  based_on_revision: string;
  changes_summary: string;
}

/** 作品介绍页（design_revision）；说明哪些在地记忆和材料获得采用。 */
export interface WorkProfilePublished {
  work_version_ref: string;
  adopted_memories: { input_ref: string; note: string }[];
  adopted_materials: { material_ref: string; note: string }[];
  attribution_display: { contribution_ref: string }[];
}

/** 授权范围：未成年人影像与口述记忆分别授权，互不替代。 */
export type ConsentScope = "minor_image" | "oral_history" | "attribution" | "dissemination" | "material_donation";

/** 参与者授权（contribution_record）。 */
export interface ConsentGranted {
  participant_ref: string;
  scope: ConsentScope;
  is_minor?: boolean;
  guardian?: { name: string; relation: string };
  granted_uses: string[];
  revocable?: boolean;
  expires_at?: string | null;
}

/** 授权撤销（contribution_record）。 */
export interface ConsentRevoked {
  consent_ref: string;
  published_handling: string;
}

/** 贡献署名（contribution_record）；须对应有效的 attribution 授权。 */
export interface AttributionRecorded {
  participant_ref: string;
  contribution_type: "design" | "interview" | "material" | "construction" | "funding" | "stewardship";
  display_form: "real_name" | "pseudonym" | "collective" | "none";
  consent_ref: string;
  work_version_ref?: string;
}

/** 署名或传播争议（contribution_record）。 */
export interface DisputeRaised {
  target_kind: "attribution" | "dissemination" | "material_scope";
  target_ref: string;
  raised_by: string;
  claim: string;
}

/** 争议结案（contribution_record）；结案必须核对原授权或原约定。 */
export interface DisputeResolved {
  dispute_ref: string;
  verified_against: string[];
  outcome: "upheld" | "correct_attribution" | "stop_dissemination" | "restore_scope" | "supplementary_consent";
  resolution_note: string;
}

/** 施工安全检查（maintenance_case，建设期养护档案）。 */
export interface SafetyCleared {
  phase: "pre_construction" | "during_construction" | "pre_acceptance";
  checklist: { item: string; result: "pass" | "fail" }[];
  inspector: string;
  hazards_found?: string[];
  measures?: string[];
}

/** 竣工验收（maintenance_case）。 */
export interface WorkAccepted {
  acceptance_party: string[];
  result: "pass" | "conditional_pass" | "fail";
  defects?: string[];
  warranty_until: string;
  archive_refs?: string[];
}

/** 例行巡检（maintenance_case，在役养护档案）。 */
export interface InspectionLogged {
  inspector: string;
  condition_grade: "A" | "B" | "C" | "D";
  findings: string[];
  next_due?: string;
}

/** 报损单（maintenance_case，开立维修案件）；自动带出当前责任人与资金约定。 */
export interface DamageReported {
  description: string;
  reported_by: string;
  severity: "low" | "medium" | "high" | "urgent";
  photos?: string[];
  responsible_steward: Party;
  funding_terms: FundingTerms;
}

/** 维修预算（maintenance_case）；分摊须与资金约定一致。 */
export interface RepairBudgeted {
  items: { name: string; amount: number }[];
  total: number;
  funding_split: { party: string; share: number; amount: number }[];
  approved_by: string[];
}

/** 维修派单（maintenance_case）。 */
export interface RepairAssigned {
  contractor: string;
  scope: string;
  deadline: string;
  safety_requirements: string[];
}

/** 维修验收（maintenance_case）；验收通过或正式拆除前，案件不因课程结束而关闭。 */
export interface RepairAccepted {
  accepted_by: string[];
  result: "pass" | "fail";
  follow_up?: string;
}

/** 各事件类型携带的业务内容。 */
export type EventPayload =
  | SitePermissionGranted
  | StewardshipTermsSet
  | CustodyTransferred
  | DecommissionDecided
  | InputCollected
  | DesignDecided
  | MaterialAccepted
  | WorkVersionPublished
  | WorkProfilePublished
  | ConsentGranted
  | ConsentRevoked
  | AttributionRecorded
  | DisputeRaised
  | DisputeResolved
  | SafetyCleared
  | WorkAccepted
  | InspectionLogged
  | DamageReported
  | RepairBudgeted
  | RepairAssigned
  | RepairAccepted;

/** 领域事件信封。 */
export interface DomainEvent {
  event_id: string;
  event_type: EventType;
  aggregate_type: AggregateType;
  aggregate_id: string;
  occurred_at: string;
  version: number;
  summary: string;
  payload?: EventPayload;
}
