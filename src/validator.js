const required = ["event_id", "event_type", "aggregate_type", "aggregate_id", "occurred_at", "version", "summary"];

/** 返回可以直接展示给接入方的中文错误。 */
export function validateEvent(record) {
  const errors = required.filter((name) => !(name in record)).map((name) => `缺少字段：${name}`);
  if ("version" in record && (!Number.isInteger(record.version) || record.version < 1)) errors.push("version 必须是正整数");
  return errors;
}

/**
 * 事件类型与业务对象的归属关系。
 * site_agreement / design_revision / contribution_record / maintenance_case 四类聚合的公共语义保持不变。
 */
export const EVENT_AGGREGATE = Object.freeze({
  SITE_PERMISSION_GRANTED: "site_agreement",
  STEWARDSHIP_TERMS_SET: "site_agreement",
  CUSTODY_TRANSFERRED: "site_agreement",
  DECOMMISSION_DECIDED: "site_agreement",
  INPUT_COLLECTED: "design_revision",
  DESIGN_DECIDED: "design_revision",
  MATERIAL_ACCEPTED: "design_revision",
  WORK_VERSION_PUBLISHED: "design_revision",
  WORK_PROFILE_PUBLISHED: "design_revision",
  CONSENT_GRANTED: "contribution_record",
  CONSENT_REVOKED: "contribution_record",
  ATTRIBUTION_RECORDED: "contribution_record",
  DISPUTE_RAISED: "contribution_record",
  DISPUTE_RESOLVED: "contribution_record",
  SAFETY_CLEARED: "maintenance_case",
  WORK_ACCEPTED: "maintenance_case",
  INSPECTION_LOGGED: "maintenance_case",
  DAMAGE_REPORTED: "maintenance_case",
  REPAIR_BUDGETED: "maintenance_case",
  REPAIR_ASSIGNED: "maintenance_case",
  REPAIR_ACCEPTED: "maintenance_case",
});

/** 授权范围：未成年人影像与口述记忆分别授权，互不替代。 */
export const CONSENT_SCOPES = Object.freeze(["minor_image", "oral_history", "attribution", "dissemination", "material_donation"]);

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function missing(payload, fields) {
  return fields
    .filter((f) => payload[f] === undefined || payload[f] === null)
    .map((f) => `payload 缺少字段：${f}`);
}

function checkEnum(payload, field, allowed) {
  if (payload[field] === undefined || payload[field] === null) return [];
  return allowed.includes(payload[field]) ? [] : [`${field} 须为：${allowed.join(" / ")}`];
}

function checkParty(party, prefix) {
  if (!isObj(party)) return [`${prefix} 须为对象（name/org/role）`];
  return ["name", "org", "role"].filter((f) => !isStr(party[f])).map((f) => `${prefix}.${f} 须为非空字符串`);
}

function checkFunding(funding, prefix) {
  if (!isObj(funding)) return [`${prefix} 须为对象`];
  const errors = [];
  const fund = funding.repair_fund;
  if (!Array.isArray(fund) || fund.length === 0) {
    errors.push(`${prefix}.repair_fund 需列明维修资金分担方`);
    return errors;
  }
  fund.forEach((row, i) => {
    if (!isObj(row) || !isStr(row.party) || !isNum(row.share)) errors.push(`${prefix}.repair_fund[${i}] 需含 party 与 share`);
  });
  const total = fund.reduce((s, r) => s + (isObj(r) && isNum(r.share) ? r.share : 0), 0);
  if (Math.abs(total - 1) > 1e-6) errors.push(`${prefix}.repair_fund 分担比例合计须为 1`);
  return errors;
}

const CHECKERS = {
  SITE_PERMISSION_GRANTED: (p) => missing(p, ["site_owner", "location", "permitted_use", "valid_from", "valid_until"]),

  STEWARDSHIP_TERMS_SET: (p) => {
    const errors = missing(p, ["steward", "funding", "inspection_interval_days", "effective_from"]);
    if (p.steward !== undefined) errors.push(...checkParty(p.steward, "steward"));
    if (p.funding !== undefined) errors.push(...checkFunding(p.funding, "funding"));
    if (p.inspection_interval_days !== undefined && (!Number.isInteger(p.inspection_interval_days) || p.inspection_interval_days < 1))
      errors.push("inspection_interval_days 须为正整数");
    return errors;
  },

  CUSTODY_TRANSFERRED: (p) => {
    const errors = missing(p, ["reason", "from_steward", "to_steward", "open_case_refs"]);
    errors.push(...checkEnum(p, "reason", ["course_ended", "staff_reassigned", "org_handover"]));
    if (p.from_steward !== undefined) errors.push(...checkParty(p.from_steward, "from_steward"));
    if (p.to_steward !== undefined) errors.push(...checkParty(p.to_steward, "to_steward"));
    if (p.open_case_refs !== undefined && !Array.isArray(p.open_case_refs))
      errors.push("open_case_refs 须列出移交时的全部未结案件（数组）");
    return errors;
  },

  DECOMMISSION_DECIDED: (p) => {
    const errors = missing(p, ["decided_by", "reason", "material_handling"]);
    if (p.decided_by !== undefined && (!Array.isArray(p.decided_by) || p.decided_by.length === 0))
      errors.push("decided_by 需记录拆除决定主体");
    if (p.material_handling !== undefined && !Array.isArray(p.material_handling))
      errors.push("material_handling 需说明旧物去向（无则空数组）");
    return errors;
  },

  INPUT_COLLECTED: (p) => {
    const errors = missing(p, ["channel", "contributor_ref", "topic", "consent_refs"]);
    errors.push(...checkEnum(p, "channel", ["interview", "questionnaire", "workshop", "field_comment"]));
    if (p.consent_refs !== undefined && !Array.isArray(p.consent_refs))
      errors.push("consent_refs 须为数组（无授权材料时为空数组）");
    return errors;
  },

  DESIGN_DECIDED: (p) => {
    const errors = missing(p, ["revision_no", "considered_inputs", "rationale", "decided_by"]);
    if (p.revision_no !== undefined && (!Number.isInteger(p.revision_no) || p.revision_no < 1))
      errors.push("revision_no 须为正整数");
    if (p.considered_inputs !== undefined && !Array.isArray(p.considered_inputs))
      errors.push("considered_inputs 须列出本稿考虑的访谈与公众意见");
    if (p.decided_by !== undefined && (!Array.isArray(p.decided_by) || p.decided_by.length === 0))
      errors.push("decided_by 需记录作出设计判断的责任主体");
    if (p.rationale === undefined) {
      errors.push("设计定稿必须记录取舍理由 rationale：意见数量不能自动替代设计判断");
    } else if (isObj(p.rationale)) {
      const { adopted, rejected } = p.rationale;
      if (!Array.isArray(adopted) || adopted.length === 0) errors.push("rationale.adopted 需说明采纳方案及理由");
      else adopted.forEach((o, i) => {
        if (!isObj(o) || !isStr(o.reason)) errors.push(`rationale.adopted[${i}] 缺少采纳理由 reason`);
      });
      if (!Array.isArray(rejected)) errors.push("rationale.rejected 需列出未采纳方案及理由（无则空数组）");
      else rejected.forEach((o, i) => {
        if (!isObj(o) || !isStr(o.reason))
          errors.push(`rationale.rejected[${i}] 缺少否决理由 reason：即使该方案意见数最多，也须说明为何不采纳`);
      });
    } else errors.push("rationale 须为对象（adopted/rejected）");
    return errors;
  },

  MATERIAL_ACCEPTED: (p) => [
    ...missing(p, ["item", "donor_ref", "ownership", "agreed_scope", "consent_ref"]),
    ...checkEnum(p, "ownership", ["donated", "loaned", "purchased"]),
  ],

  WORK_VERSION_PUBLISHED: (p) => {
    const errors = missing(p, ["version_no", "change_type", "based_on_revision", "changes_summary"]);
    if (p.version_no !== undefined && (!Number.isInteger(p.version_no) || p.version_no < 1))
      errors.push("version_no 须为正整数");
    errors.push(...checkEnum(p, "change_type", ["major", "minor"]));
    return errors;
  },

  WORK_PROFILE_PUBLISHED: (p) => {
    const errors = missing(p, ["work_version_ref", "adopted_memories", "adopted_materials", "attribution_display"]);
    if (Array.isArray(p.adopted_memories)) {
      if (p.adopted_memories.length === 0) errors.push("作品介绍页须说明采用了哪些在地记忆 adopted_memories");
      p.adopted_memories.forEach((m, i) => {
        if (!isObj(m) || !isStr(m.input_ref)) errors.push(`adopted_memories[${i}] 缺少 input_ref`);
      });
    } else if (p.adopted_memories !== undefined) errors.push("adopted_memories 须为数组");
    if (Array.isArray(p.adopted_materials)) {
      if (p.adopted_materials.length === 0) errors.push("作品介绍页须说明采用了哪些材料 adopted_materials");
      p.adopted_materials.forEach((m, i) => {
        if (!isObj(m) || !isStr(m.material_ref)) errors.push(`adopted_materials[${i}] 缺少 material_ref`);
      });
    } else if (p.adopted_materials !== undefined) errors.push("adopted_materials 须为数组");
    if (p.attribution_display !== undefined && !Array.isArray(p.attribution_display))
      errors.push("attribution_display 须为数组");
    return errors;
  },

  CONSENT_GRANTED: (p) => {
    const errors = missing(p, ["participant_ref", "scope", "granted_uses"]);
    errors.push(...checkEnum(p, "scope", [...CONSENT_SCOPES]));
    if (p.scope === "minor_image" && p.is_minor !== true) errors.push("未成年人影像授权（minor_image）须标明 is_minor");
    if (p.is_minor === true && !isObj(p.guardian)) errors.push("未成年人授权须由监护人签署 guardian");
    if (isObj(p.guardian) && (!isStr(p.guardian.name) || !isStr(p.guardian.relation)))
      errors.push("guardian 需含 name 与 relation");
    if (p.granted_uses !== undefined && (!Array.isArray(p.granted_uses) || p.granted_uses.length === 0))
      errors.push("granted_uses 需列明授权用途");
    return errors;
  },

  CONSENT_REVOKED: (p) => missing(p, ["consent_ref", "published_handling"]),

  ATTRIBUTION_RECORDED: (p) => [
    ...missing(p, ["participant_ref", "contribution_type", "display_form", "consent_ref"]),
    ...checkEnum(p, "contribution_type", ["design", "interview", "material", "construction", "funding", "stewardship"]),
    ...checkEnum(p, "display_form", ["real_name", "pseudonym", "collective", "none"]),
  ],

  DISPUTE_RAISED: (p) => [
    ...missing(p, ["target_kind", "target_ref", "raised_by", "claim"]),
    ...checkEnum(p, "target_kind", ["attribution", "dissemination", "material_scope"]),
  ],

  DISPUTE_RESOLVED: (p) => {
    const errors = missing(p, ["dispute_ref", "verified_against", "outcome", "resolution_note"]);
    errors.push(...checkEnum(p, "outcome", ["upheld", "correct_attribution", "stop_dissemination", "restore_scope", "supplementary_consent"]));
    if (p.verified_against !== undefined && (!Array.isArray(p.verified_against) || p.verified_against.length === 0))
      errors.push("争议结案须核对原授权或原约定 verified_against");
    return errors;
  },

  SAFETY_CLEARED: (p) => {
    const errors = missing(p, ["phase", "checklist", "inspector"]);
    errors.push(...checkEnum(p, "phase", ["pre_construction", "during_construction", "pre_acceptance"]));
    if (p.checklist !== undefined) {
      if (!Array.isArray(p.checklist) || p.checklist.length === 0) errors.push("checklist 需列明施工安全检查项");
      else p.checklist.forEach((c, i) => {
        if (!isObj(c) || !isStr(c.item) || !["pass", "fail"].includes(c.result))
          errors.push(`checklist[${i}] 需含 item 与 result（pass/fail）`);
      });
    }
    return errors;
  },

  WORK_ACCEPTED: (p) => {
    const errors = missing(p, ["acceptance_party", "result", "warranty_until"]);
    if (p.acceptance_party !== undefined && (!Array.isArray(p.acceptance_party) || p.acceptance_party.length === 0))
      errors.push("acceptance_party 需列明验收方");
    errors.push(...checkEnum(p, "result", ["pass", "conditional_pass", "fail"]));
    return errors;
  },

  INSPECTION_LOGGED: (p) => [
    ...missing(p, ["inspector", "condition_grade", "findings"]),
    ...checkEnum(p, "condition_grade", ["A", "B", "C", "D"]),
  ],

  DAMAGE_REPORTED: (p) => {
    const errors = missing(p, ["description", "reported_by", "severity"]);
    errors.push(...checkEnum(p, "severity", ["low", "medium", "high", "urgent"]));
    if (p.responsible_steward === undefined || p.responsible_steward === null)
      errors.push("报损单须自动带出当前责任人 responsible_steward");
    else errors.push(...checkParty(p.responsible_steward, "responsible_steward"));
    if (p.funding_terms === undefined || p.funding_terms === null)
      errors.push("报损单须自动带出资金约定 funding_terms");
    else errors.push(...checkFunding(p.funding_terms, "funding_terms"));
    return errors;
  },

  REPAIR_BUDGETED: (p) => {
    const errors = missing(p, ["items", "total", "funding_split", "approved_by"]);
    if (p.items !== undefined && (!Array.isArray(p.items) || p.items.length === 0)) errors.push("items 需列明预算科目");
    if (p.total !== undefined && (!isNum(p.total) || p.total <= 0)) errors.push("total 须为正数");
    if (p.funding_split !== undefined) {
      if (!Array.isArray(p.funding_split) || p.funding_split.length === 0) errors.push("funding_split 需按资金约定分摊");
      else {
        const sum = p.funding_split.reduce((s, r) => s + (isObj(r) && isNum(r.amount) ? r.amount : 0), 0);
        if (isNum(p.total) && Math.abs(sum - p.total) > 1e-6) errors.push("funding_split 金额合计须等于 total");
      }
    }
    if (p.approved_by !== undefined && (!Array.isArray(p.approved_by) || p.approved_by.length === 0))
      errors.push("approved_by 需列明预算确认方");
    return errors;
  },

  REPAIR_ASSIGNED: (p) => {
    const errors = missing(p, ["contractor", "scope", "deadline", "safety_requirements"]);
    if (p.safety_requirements !== undefined && (!Array.isArray(p.safety_requirements) || p.safety_requirements.length === 0))
      errors.push("维修派单须写明施工安全要求 safety_requirements");
    return errors;
  },

  REPAIR_ACCEPTED: (p) => {
    const errors = missing(p, ["accepted_by", "result"]);
    if (p.accepted_by !== undefined && (!Array.isArray(p.accepted_by) || p.accepted_by.length === 0))
      errors.push("accepted_by 需列明验收方");
    errors.push(...checkEnum(p, "result", ["pass", "fail"]));
    return errors;
  },
};

/**
 * 校验事件归属与 payload 结构。返回中文错误数组，空数组表示通过。
 * 与 validateEvent（信封校验）配合使用。
 */
export function validatePayload(event) {
  const expected = EVENT_AGGREGATE[event.event_type];
  if (!expected) return [`未知事件类型：${event.event_type}`];
  const errors = [];
  if (event.aggregate_type !== expected)
    errors.push(`事件 ${event.event_type} 应记录在 ${expected}，而非 ${event.aggregate_type}`);
  if (!isObj(event.payload)) {
    errors.push(`事件 ${event.event_type} 缺少 payload`);
    return errors;
  }
  return errors.concat(CHECKERS[event.event_type](event.payload));
}
