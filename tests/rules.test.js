import assert from "node:assert/strict";
import test from "node:test";

import {
  applyEvent,
  createLedger,
  currentSteward,
  deriveDamageReport,
  disputeEvidence,
  openCases,
} from "../src/projector.js";
import { validatePayload } from "../src/validator.js";

let seq = 0;
function ev(event_type, aggregate_type, aggregate_id, version, payload) {
  seq += 1;
  return {
    event_id: `test-${String(seq).padStart(4, "0")}`,
    event_type,
    aggregate_type,
    aggregate_id,
    occurred_at: "2026-01-01T00:00:00+08:00",
    version,
    summary: "测试事件",
    payload,
  };
}

const LIN = { name: "林岚", org: "梧桐中学", role: "课程负责人" };
const WANG = { name: "王敏", org: "社区文化中心", role: "场馆负责人" };
const FUNDING = { repair_fund: [{ party: "梧桐中学", share: 0.6 }, { party: "梧桐社区", share: 0.4 }] };

/** 已具备场地许可与责任约定的台账。 */
function baseLedger() {
  const ledger = createLedger();
  assert.deepEqual(
    applyEvent(ledger, ev("SITE_PERMISSION_GRANTED", "site_agreement", "site-1", 1, {
      site_owner: "地铁公司", location: "梧桐站", permitted_use: "公共艺术",
      valid_from: "2025-01-01", valid_until: "2030-01-01",
    })),
    [],
  );
  assert.deepEqual(
    applyEvent(ledger, ev("STEWARDSHIP_TERMS_SET", "site_agreement", "site-1", 2, {
      steward: LIN, funding: FUNDING, inspection_interval_days: 90, effective_from: "2025-01-01",
    })),
    [],
  );
  return ledger;
}

test("R1 意见多少不能自动替代设计判断：定稿必须记录取舍理由", () => {
  const ledger = baseLedger();
  assert.deepEqual(
    applyEvent(ledger, ev("INPUT_COLLECTED", "design_revision", "design-1", 1, {
      channel: "questionnaire", contributor_ref: "public-1", topic: "配色意向", consent_refs: [], support_count: 214,
    })),
    [],
  );

  const noRationale = ev("DESIGN_DECIDED", "design_revision", "design-1", 2, {
    revision_no: 1, considered_inputs: [], decided_by: ["设计组"],
  });
  assert.ok(validatePayload(noRationale).some((e) => e.includes("取舍理由")));

  const silentReject = ev("DESIGN_DECIDED", "design_revision", "design-1", 2, {
    revision_no: 1, considered_inputs: [], decided_by: ["设计组"],
    rationale: { adopted: [{ option: "深色", reason: "耐候" }], rejected: [{ option: "亮色", support_count: 214 }] },
  });
  assert.ok(validatePayload(silentReject).some((e) => e.includes("否决理由")));

  // 写明理由后，即使否决的是多数意见也予受理
  const reasoned = ev("DESIGN_DECIDED", "design_revision", "design-1", 2, {
    revision_no: 1, considered_inputs: [], decided_by: ["设计组"],
    rationale: {
      adopted: [{ option: "深色", reason: "耐候" }],
      rejected: [{ option: "亮色", reason: "通道光环境冲突", support_count: 214 }],
    },
  });
  assert.deepEqual(applyEvent(ledger, reasoned), []);
});

test("R2 未成年人影像与口述记忆分别授权", () => {
  const noGuardian = ev("CONSENT_GRANTED", "contribution_record", "kid-1", 1, {
    participant_ref: "kid-1", scope: "minor_image", is_minor: true, granted_uses: ["介绍页"],
  });
  assert.ok(validatePayload(noGuardian).some((e) => e.includes("监护人")));

  const ledger = baseLedger();
  const interview = (refs) =>
    ev("INPUT_COLLECTED", "design_revision", "design-1", 1, {
      channel: "interview", contributor_ref: "granny-1", topic: "秋收记忆", consent_refs: refs,
    });

  // 没有任何授权，口述记忆不能进场
  assert.ok(applyEvent(ledger, interview([])).some((e) => e.includes("oral_history")));

  // 影像授权不能替代口述授权（分人分用途）
  const imageConsent = ev("CONSENT_GRANTED", "contribution_record", "kid-1", 1, {
    participant_ref: "kid-1", scope: "minor_image", is_minor: true,
    guardian: { name: "小雨父亲", relation: "父亲" }, granted_uses: ["介绍页展示"],
  });
  assert.deepEqual(applyEvent(ledger, imageConsent), []);
  assert.ok(applyEvent(ledger, interview([imageConsent.event_id])).some((e) => e.includes("oral_history")));

  // 取得本人的 oral_history 授权后方可采集
  const oralConsent = ev("CONSENT_GRANTED", "contribution_record", "granny-1", 1, {
    participant_ref: "granny-1", scope: "oral_history", granted_uses: ["创作素材"],
  });
  assert.deepEqual(applyEvent(ledger, oralConsent), []);
  assert.deepEqual(applyEvent(ledger, interview([oralConsent.event_id])), []);
});

test("R2 授权撤销后不得再用于新材料采集", () => {
  const ledger = baseLedger();
  const consent = ev("CONSENT_GRANTED", "contribution_record", "granny-1", 1, {
    participant_ref: "granny-1", scope: "oral_history", granted_uses: ["创作素材"],
  });
  assert.deepEqual(applyEvent(ledger, consent), []);
  assert.deepEqual(
    applyEvent(ledger, ev("CONSENT_REVOKED", "contribution_record", "granny-1", 2, {
      consent_ref: consent.event_id, published_handling: "已发布内容下版移除",
    })),
    [],
  );
  const interview = ev("INPUT_COLLECTED", "design_revision", "design-1", 1, {
    channel: "interview", contributor_ref: "granny-1", topic: "秋收", consent_refs: [consent.event_id],
  });
  assert.ok(applyEvent(ledger, interview).some((e) => e.includes("撤销")));
});

test("R3 重大改造形成新版本，小幅调整不另立版本", () => {
  const ledger = baseLedger();
  const decided = ev("DESIGN_DECIDED", "design_revision", "design-1", 1, {
    revision_no: 1, considered_inputs: [], decided_by: ["设计组"],
    rationale: { adopted: [{ option: "方案A", reason: "耐候" }], rejected: [] },
  });
  assert.deepEqual(applyEvent(ledger, decided), []);

  const minorFirst = ev("WORK_VERSION_PUBLISHED", "design_revision", "design-1", 2, {
    version_no: 1, change_type: "minor", based_on_revision: decided.event_id, changes_summary: "微调",
  });
  assert.ok(applyEvent(ledger, minorFirst).some((e) => e.includes("不形成新版本")));

  const skip = ev("WORK_VERSION_PUBLISHED", "design_revision", "design-1", 2, {
    version_no: 3, change_type: "major", based_on_revision: decided.event_id, changes_summary: "跳号",
  });
  assert.ok(applyEvent(ledger, skip).some((e) => e.includes("新版本")));

  const v1 = ev("WORK_VERSION_PUBLISHED", "design_revision", "design-1", 2, {
    version_no: 1, change_type: "major", based_on_revision: decided.event_id, changes_summary: "首版",
  });
  assert.deepEqual(applyEvent(ledger, v1), []);
});

test("R4/R8 课程结束移交不得遗漏未结案件，案件存续到维修验收或正式拆除", () => {
  const ledger = baseLedger();
  // 建设期养护档案：安全检查 → 竣工验收 → 在役
  assert.deepEqual(
    applyEvent(ledger, ev("SAFETY_CLEARED", "maintenance_case", "case-build", 1, {
      phase: "pre_acceptance", checklist: [{ item: "锚固", result: "pass" }], inspector: "王工",
    })),
    [],
  );
  assert.deepEqual(
    applyEvent(ledger, ev("WORK_ACCEPTED", "maintenance_case", "case-build", 2, {
      acceptance_party: ["学校", "地铁"], result: "pass", warranty_until: "2027-01-01",
    })),
    [],
  );
  // 报损开案，自动带出当前责任人与资金约定
  const report = ev("DAMAGE_REPORTED", "maintenance_case", "case-r1", 1, {
    description: "裂缝", reported_by: "居民", severity: "medium", ...deriveDamageReport(ledger.state),
  });
  assert.deepEqual(applyEvent(ledger, report), []);

  // 移交遗漏未结案件 → 拒绝
  const sloppy = ev("CUSTODY_TRANSFERRED", "site_agreement", "site-1", 3, {
    reason: "course_ended", from_steward: LIN, to_steward: WANG, open_case_refs: [],
  });
  assert.ok(applyEvent(ledger, sloppy).some((e) => e.includes("遗漏")));

  // 完整移交 → 受理，案件原样保留，责任人更新
  const handover = ev("CUSTODY_TRANSFERRED", "site_agreement", "site-1", 3, {
    reason: "course_ended", from_steward: LIN, to_steward: WANG,
    open_case_refs: ["case-build", "case-r1"],
  });
  assert.deepEqual(applyEvent(ledger, handover), []);
  assert.ok(openCases(ledger.state).includes("case-r1"));
  assert.equal(currentSteward(ledger.state).name, "王敏");

  // 未派单不能验收
  assert.ok(
    applyEvent(ledger, ev("REPAIR_ACCEPTED", "maintenance_case", "case-r1", 2, {
      accepted_by: ["社区"], result: "pass",
    })).some((e) => e.includes("派单")),
  );
  // 派单 → 维修验收 → 案件正常关闭
  assert.deepEqual(
    applyEvent(ledger, ev("REPAIR_ASSIGNED", "maintenance_case", "case-r1", 2, {
      contractor: "修缮公司", scope: "注浆", deadline: "2026-02-01", safety_requirements: ["围挡"],
    })),
    [],
  );
  assert.deepEqual(
    applyEvent(ledger, ev("REPAIR_ACCEPTED", "maintenance_case", "case-r1", 3, {
      accepted_by: ["社区"], result: "pass",
    })),
    [],
  );
  assert.ok(!openCases(ledger.state).includes("case-r1"));

  // 正式拆除关闭其余未结案件；拆除后不能再登记养护事件
  assert.deepEqual(
    applyEvent(ledger, ev("DECOMMISSION_DECIDED", "site_agreement", "site-1", 4, {
      decided_by: ["地铁公司"], reason: "站点改造", material_handling: [],
    })),
    [],
  );
  assert.deepEqual(openCases(ledger.state), []);
  assert.ok(
    applyEvent(ledger, ev("INSPECTION_LOGGED", "maintenance_case", "case-build", 3, {
      inspector: "值班员", condition_grade: "A", findings: [],
    })).some((e) => e.includes("拆除")),
  );
});

test("R5 报损单带出的责任人与资金约定须与当前约定一致", () => {
  const ledger = baseLedger();
  assert.deepEqual(
    applyEvent(ledger, ev("CUSTODY_TRANSFERRED", "site_agreement", "site-1", 3, {
      reason: "staff_reassigned", from_steward: LIN, to_steward: WANG, open_case_refs: [],
    })),
    [],
  );

  // 移交后仍带出旧责任人 → 拒绝
  const stale = ev("DAMAGE_REPORTED", "maintenance_case", "case-r1", 1, {
    description: "裂缝", reported_by: "居民", severity: "medium",
    responsible_steward: LIN, funding_terms: FUNDING,
  });
  assert.ok(applyEvent(ledger, stale).some((e) => e.includes("责任人")));

  // 用 deriveDamageReport 自动带出 → 受理，且是新责任人
  const fresh = ev("DAMAGE_REPORTED", "maintenance_case", "case-r1", 1, {
    description: "裂缝", reported_by: "居民", severity: "medium", ...deriveDamageReport(ledger.state),
  });
  assert.deepEqual(applyEvent(ledger, fresh), []);
  assert.equal(fresh.payload.responsible_steward.name, "王敏");
});

test("R6 作品介绍页必须说明采用的在地记忆与材料，且引用真实存在", () => {
  const emptyProfile = ev("WORK_PROFILE_PUBLISHED", "design_revision", "design-1", 1, {
    work_version_ref: "x", adopted_memories: [], adopted_materials: [], attribution_display: [],
  });
  const errors = validatePayload(emptyProfile);
  assert.ok(errors.some((e) => e.includes("在地记忆")));
  assert.ok(errors.some((e) => e.includes("材料")));

  const ledger = baseLedger();
  const decided = ev("DESIGN_DECIDED", "design_revision", "design-1", 1, {
    revision_no: 1, considered_inputs: [], decided_by: ["设计组"],
    rationale: { adopted: [{ option: "方案A", reason: "耐候" }], rejected: [] },
  });
  assert.deepEqual(applyEvent(ledger, decided), []);
  const v1 = ev("WORK_VERSION_PUBLISHED", "design_revision", "design-1", 2, {
    version_no: 1, change_type: "major", based_on_revision: decided.event_id, changes_summary: "首版",
  });
  assert.deepEqual(applyEvent(ledger, v1), []);

  const bogus = ev("WORK_PROFILE_PUBLISHED", "design_revision", "design-1", 3, {
    work_version_ref: v1.event_id,
    adopted_memories: [{ input_ref: "missing-input", note: "不存在的记忆" }],
    adopted_materials: [{ material_ref: "missing-material", note: "不存在的材料" }],
    attribution_display: [],
  });
  const invariantErrors = applyEvent(ledger, bogus);
  assert.ok(invariantErrors.some((e) => e.includes("在地记忆不存在")));
  assert.ok(invariantErrors.some((e) => e.includes("材料不存在")));
});

test("R7 署名与传播争议可核对原授权", () => {
  const ledger = baseLedger();

  // 无授权不能署名
  const noConsent = ev("ATTRIBUTION_RECORDED", "contribution_record", "p-2", 1, {
    participant_ref: "p-2", contribution_type: "design", display_form: "real_name", consent_ref: "missing",
  });
  assert.ok(applyEvent(ledger, noConsent).some((e) => e.includes("授权")));

  const consent = ev("CONSENT_GRANTED", "contribution_record", "p-1", 1, {
    participant_ref: "p-1", scope: "attribution", granted_uses: ["介绍页署名"],
  });
  assert.deepEqual(applyEvent(ledger, consent), []);
  const attr = ev("ATTRIBUTION_RECORDED", "contribution_record", "p-1", 2, {
    participant_ref: "p-1", contribution_type: "design", display_form: "real_name", consent_ref: consent.event_id,
  });
  assert.deepEqual(applyEvent(ledger, attr), []);
  const dispute = ev("DISPUTE_RAISED", "contribution_record", "p-1", 3, {
    target_kind: "attribution", target_ref: attr.event_id, raised_by: "p-1", claim: "署名被遗漏",
  });
  assert.deepEqual(applyEvent(ledger, dispute), []);

  // 结案必须核对原授权
  const noEvidence = ev("DISPUTE_RESOLVED", "contribution_record", "p-1", 4, {
    dispute_ref: dispute.event_id, verified_against: [], outcome: "correct_attribution", resolution_note: "补署名",
  });
  assert.ok(validatePayload(noEvidence).some((e) => e.includes("原授权")));

  const resolved = ev("DISPUTE_RESOLVED", "contribution_record", "p-1", 4, {
    dispute_ref: dispute.event_id, verified_against: [consent.event_id],
    outcome: "correct_attribution", resolution_note: "核对原授权后补充署名",
  });
  assert.deepEqual(applyEvent(ledger, resolved), []);
  const evidence = disputeEvidence(ledger, dispute.event_id);
  assert.equal(evidence.evidence[0].event_id, consent.event_id);
});

test("旧物进场须先明确权属与捐赠者同意范围", () => {
  const ledger = baseLedger();
  const material = ev("MATERIAL_ACCEPTED", "design_revision", "design-1", 1, {
    item: "旧打谷机", donor_ref: "donor-1", ownership: "donated",
    agreed_scope: "整体展示，不切割", consent_ref: "missing-consent",
  });
  assert.ok(applyEvent(ledger, material).some((e) => e.includes("material_donation")));
});

test("维修预算须按资金约定分摊", () => {
  const ledger = baseLedger();
  const report = ev("DAMAGE_REPORTED", "maintenance_case", "case-r1", 1, {
    description: "裂缝", reported_by: "居民", severity: "medium", ...deriveDamageReport(ledger.state),
  });
  assert.deepEqual(applyEvent(ledger, report), []);

  const unfair = ev("REPAIR_BUDGETED", "maintenance_case", "case-r1", 2, {
    items: [{ name: "注浆", amount: 10000 }], total: 10000,
    funding_split: [{ party: "梧桐中学", share: 1, amount: 10000 }],
    approved_by: ["总务处"],
  });
  assert.ok(applyEvent(ledger, unfair).some((e) => e.includes("资金约定")));

  const fair = ev("REPAIR_BUDGETED", "maintenance_case", "case-r1", 2, {
    items: [{ name: "注浆", amount: 10000 }], total: 10000,
    funding_split: [
      { party: "梧桐中学", share: 0.6, amount: 6000 },
      { party: "梧桐社区", share: 0.4, amount: 4000 },
    ],
    approved_by: ["总务处"],
  });
  assert.deepEqual(applyEvent(ledger, fair), []);
});

test("来源系统重试沿用原事件标识时幂等受理，内容不一致视为冲突", () => {
  const ledger = baseLedger();
  const report = ev("DAMAGE_REPORTED", "maintenance_case", "case-r1", 1, {
    description: "裂缝", reported_by: "居民", severity: "medium", ...deriveDamageReport(ledger.state),
  });
  assert.deepEqual(applyEvent(ledger, report), []);
  assert.deepEqual(applyEvent(ledger, report), []);
  assert.equal(ledger.events.filter((e) => e.event_id === report.event_id).length, 1);

  const tampered = { ...report, summary: "被篡改的摘要" };
  assert.ok(applyEvent(ledger, tampered).some((e) => e.includes("冲突")));
});

test("版本号必须按聚合从 1 开始递增", () => {
  const ledger = baseLedger();
  const bad = ev("SITE_PERMISSION_GRANTED", "site_agreement", "site-1", 5, {
    site_owner: "地铁公司", location: "梧桐站", permitted_use: "公共艺术",
    valid_from: "2025-01-01", valid_until: "2030-01-01",
  });
  assert.ok(applyEvent(ledger, bad).some((e) => e.includes("版本号")));
});
