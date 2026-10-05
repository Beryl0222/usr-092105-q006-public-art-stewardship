import assert from "node:assert/strict";
import test from "node:test";

import { buildScenario, PARTIES, IDS } from "../data/scenario.factory.js";
import { reduceAll } from "../src/reducers.js";
import { validateStream } from "../src/policies.js";
import { rebuildScenario, mini } from "./helpers.js";

const expectBlocked = (events, fragment) => {
  const errors = validateStream(events);
  assert.ok(errors.length > 0, `预期被拦截（${fragment}），但事件流通过：\n${JSON.stringify(events, null, 1)}`);
  if (fragment) assert.ok(errors.some((m) => m.includes(fragment)), `错误中应包含「${fragment}」，实际：\n${errors.join("\n")}`);
  return errors;
};

const artworkReg = (overrides = {}) => [
  "ARTWORK_REGISTERED", "artwork", "aw-1",
  { title: "测试墙", site_id: "site-1", lead_school_party_id: "p-school", coordinator_party_id: "p-stew", curriculum_term_id: "term-1", expected_lifetime_years: 5, ...overrides },
];
const damageOpen = (id = "case-1", at = "2026-05-01T09:00:00+08:00") => [
  "DAMAGE_REPORTED", "maintenance_case", id,
  { case_id: id, artwork_id: "aw-1", symptom: "开裂", reported_by_party_id: "p-community", reported_at: at, source: "resident", responsible_snapshot: { basis: "custody", responsible_party_id: "p-stew" }, fund_snapshot: null },
  at,
];

/* ---------------- 意见不能替代设计判断 ---------------- */

test("取舍的中选方案不在选项内被拒绝", () => {
  const events = mini([
    artworkReg(),
    ["DESIGN_REVISION_PROPOSED", "design_revision", "d1", { artwork_id: "aw-1", revision_no: 1, based_on_input_ids: [], proposal: "方案" }],
    ["DESIGN_TRADEOFF_RECORDED", "design_revision", "d1", { revision_no: 1, issue: "夜间", options: [{ option: "A" }, { option: "B" }], chosen_option: "C", rationale: "理由充分", decided_by_party_id: "p-teacher" }],
  ]);
  expectBlocked(events, "中选方案必须在所列选项之中");
});

test("设计定稿不写取舍理由被拒绝（票数不能替代判断，理由必须留痕）", () => {
  const events = mini([
    artworkReg(),
    ["DESIGN_REVISION_PROPOSED", "design_revision", "d1", { artwork_id: "aw-1", revision_no: 1, based_on_input_ids: [], proposal: "方案" }],
    ["DESIGN_DECIDED", "design_revision", "d1", { revision_no: 1, decision: "定稿", adopted_input_ids: [], rejected_inputs: [], rationale: "  ", decided_by_party_id: "p-teacher" }],
  ]);
  expectBlocked(events, "取舍理由");
});

/* ---------------- 未成年人影像/口述分别授权 ---------------- */

test("未成年人授权缺少监护人同意被拒绝", () => {
  const events = mini([
    ["CONTRIBUTOR_REGISTERED", "contribution_record", "c1", { party_id: "p-kid", kind: "student", display_name: "小学生", is_minor: true }],
    ["PARTICIPANT_AUTHORIZATION_GRANTED", "contribution_record", "c1", { authorization_id: "a1", party_id: "p-kid", subject_kind: "image", scopes: ["exhibition"], media_ids: ["m1"], granted_at: "2026-01-01" }],
  ]);
  expectBlocked(events, "监护人同意");
});

test("撤回影像授权后不得用于发布", () => {
  const events = mini([
    ["CONTRIBUTOR_REGISTERED", "contribution_record", "c1", { party_id: "p1", kind: "resident", display_name: "居民甲" }],
    ["PARTICIPANT_AUTHORIZATION_GRANTED", "contribution_record", "c1", { authorization_id: "a-img", party_id: "p1", subject_kind: "image", scopes: ["exhibition"], media_ids: ["m1"], granted_at: "2026-01-01" }],
    ["AUTHORIZATION_WITHDRAWN", "contribution_record", "c1", { authorization_id: "a-img", party_id: "p1", withdrawn_at: "2026-02-01", remaining_scopes: [] }],
    ["PUBLICATION_RELEASED", "contribution_record", "c1", { publication_id: "pub1", channel: "exhibition", media_ids: ["m1"], used_authorization_ids: ["a-img"], released_by_party_id: "p-school", released_at: "2026-03-01" }],
  ]);
  expectBlocked(events, "已撤回");
});

/* ---------------- 旧物权属与同意范围 ---------------- */

test("旧物未确权不得验收", () => {
  const events = mini([
    ["CONTRIBUTOR_REGISTERED", "contribution_record", "c1", { party_id: "p-donor", kind: "resident", display_name: "捐赠人" }],
    ["MATERIAL_DONATION_OFFERED", "contribution_record", "c1", { material_id: "mat-1", donor_party_id: "p-donor", object_name: "旧打谷机", provenance: "生产队", condition_photo_uri: "x.jpg" }],
    ["MATERIAL_ACCEPTED", "contribution_record", "c1", { material_id: "mat-1", accepted_by_party_id: "p-school", use_scope: "嵌入墙面", consented_transformations: ["清洁"] }],
  ]);
  expectBlocked(events, "权属核实");
});

test("施工对旧物实施超出同意范围的改造被拦截（须先追加同意）", () => {
  const events = rebuildScenario({
    patch: {
      CONSTRUCTION_LOGGED: (e) => ({ payload: { material_transformations: [{ material_id: IDS.thresher, transformations: ["切割滚筒"] }] } }),
    },
  });
  expectBlocked(events, "超出捐赠者同意范围");
});

/* ---------------- 报损：自动带出责任人与资金 ---------------- */

test("报损单手工填写责任人被拒绝", () => {
  const events = rebuildScenario({
    patch: {
      DAMAGE_REPORTED: () => ({ payload: { responsible_snapshot: { basis: "custody", responsible_party_id: PARTIES.community } } }),
    },
  });
  expectBlocked(events, "自动带出");
});

/* ---------------- 课程结项/调动不能丢案件 ---------------- */

test("作品交接漏列未结案件被拒绝", () => {
  const events = mini([
    artworkReg(),
    damageOpen(),
    ["ARTWORK_HANDED_OVER", "artwork", "aw-1", { from_party_id: "p-school", to_party_id: "p-stew", reason: "课程结项", open_case_ids: [] }],
  ]);
  expectBlocked(events, "交接必须列明全部未结案件");
});

test("责任转移后案件仍为未结状态（调动只换人，不结案）", () => {
  const events = mini([
    artworkReg(),
    damageOpen(),
    ["REPAIR_ASSIGNED", "maintenance_case", "case-1", { case_id: "case-1", assignee_party_id: "p-stew", assignee_role: "保管方", basis: "custody", fund_agreement_id: "fund-1", due_date: "2026-06-01" }, "2026-05-02T09:00:00+08:00"],
    ["CASE_OWNERSHIP_TRANSFERRED", "maintenance_case", "case-1", { case_id: "case-1", from_party_id: "p-stew", to_party_id: "p-stew2", reason: "负责人调动", transferred_at: "2026-05-10T09:00:00+08:00" }, "2026-05-10T09:00:00+08:00"],
  ]);
  assert.deepEqual(validateStream(events), []);
  const c = reduceAll(events).maintenance_case.get("case-1");
  assert.equal(c.is_open, true);
  assert.equal(c.assignee, "p-stew2");
});

/* ---------------- 重大改造形成新版本 ---------------- */

test("未经重大改造评审不得开启新版本", () => {
  const events = mini([
    artworkReg(),
    ["ARTWORK_VERSION_OPENED", "artwork", "aw-1", { new_version: 2, reason: "想改就改", change_request_id: "cr-x" }],
  ]);
  expectBlocked(events, "评审通过的重大改造");
});

test("施工方案版本与作品当前版本不符被拒绝（重大改造须先开新版本）", () => {
  const events = mini([
    artworkReg(),
    ["CONSTRUCTION_PLAN_FILED", "construction_project", "cj-1", { construction_id: "cj-1", artwork_id: "aw-1", contractor_party_id: "p-builder", safety_officer_party_id: "p-safe", method_statement_uri: "m.pdf", risk_assessment: [], for_version: 2 }],
  ]);
  expectBlocked(events, "版本");
});

/* ---------------- 施工安全 ---------------- */

test("场地许可与安全报备未落实不得进场施工", () => {
  const events = mini([
    artworkReg(),
    ["CONSTRUCTION_PLAN_FILED", "construction_project", "cj-1", { construction_id: "cj-1", artwork_id: "aw-1", contractor_party_id: "p-builder", safety_officer_party_id: "p-safe", method_statement_uri: "m.pdf", risk_assessment: [], for_version: 1 }],
    ["SAFETY_FILING_APPROVED", "construction_project", "cj-1", { construction_id: "cj-1", approved_by_party_id: "p-safe", conditions: [], valid_until: "2026-12-31", minor_participation_arrangement: null }],
    ["CONSTRUCTION_LOGGED", "construction_project", "cj-1", { construction_id: "cj-1", log_date: "2026-05-02", activities: ["上墙"], participant_party_ids: [], ppe_confirmed: true }],
  ]);
  expectBlocked(events, "场地许可");
});

test("高风险安全事件未关闭不得报验/验收", () => {
  const events = mini([
    artworkReg(),
    ["CONSTRUCTION_PLAN_FILED", "construction_project", "cj-1", { construction_id: "cj-1", artwork_id: "aw-1", contractor_party_id: "p-builder", safety_officer_party_id: "p-safe", method_statement_uri: "m.pdf", risk_assessment: [], for_version: 1 }],
    ["SAFETY_FILING_APPROVED", "construction_project", "cj-1", { construction_id: "cj-1", approved_by_party_id: "p-safe", conditions: [], valid_until: "2026-12-31", minor_participation_arrangement: null }],
    ["WORK_SUBMITTED", "construction_project", "cj-1", { construction_id: "cj-1", submitted_at: "2026-05-20", as_built_uri: "a.pdf", warranty_terms: "两年" }],
    ["SAFETY_INCIDENT_REPORTED", "construction_project", "cj-1", { construction_id: "cj-1", incident_id: "inc-1", severity: "high", description: "坠物", reported_at: "2026-05-21", status: "open" }],
    ["WORK_ACCEPTED", "artwork", "aw-1", { construction_id: "cj-1", accepted_by_party_ids: ["p-school"], warranty_until: "2028-05-21", warranty_covered_party_id: "p-builder" }],
  ]);
  expectBlocked(events, "高风险安全事件");
});

/* ---------------- 验收与关闭 ---------------- */

test("未完工不得验收通过", () => {
  const events = mini([
    artworkReg(),
    damageOpen(),
    ["REPAIR_ACCEPTED", "maintenance_case", "case-1", { case_id: "case-1", accepted_by_party_id: "p-stew", accepted_at: "2026-05-05", result: "合格" }],
  ]);
  expectBlocked(events, "完工待验");
});

test("有未结维修时不得批准拆除", () => {
  const events = mini([
    artworkReg(),
    damageOpen(),
    ["ARTWORK_DECOMMISSION_APPROVED", "artwork", "aw-1", { reason: "许可到期", decision_party_ids: ["p-metro"], material_disposition: {} }],
  ]);
  expectBlocked(events, "未结维修案件");
});

/* ---------------- 资金 ---------------- */

test("维修拨付超过每次上限被拒绝", () => {
  const events = mini([
    artworkReg(),
    damageOpen(),
    ["MAINTENANCE_FUND_AGREED", "fund_agreement", "fund-1", { fund_id: "fund-1", artwork_id: "aw-1", shares: { "p-metro": 1 }, per_case_cap: 20000, effective_from: "2026-01-01", agreement_doc_uri: "f.pdf" }],
    ["MAINTENANCE_FUND_DRAWN", "fund_agreement", "fund-1", { fund_id: "fund-1", case_id: "case-1", amount: 21000, purpose: "大修", approved_by_party_ids: ["p-metro"], drawn_at: "2026-05-02" }],
  ]);
  expectBlocked(events, "上限");
});

/* ---------------- 署名与争议核对 ---------------- */

test("署名引用他人或不存在的协议被拒绝", () => {
  const events = mini([
    ["CONTRIBUTOR_REGISTERED", "contribution_record", "c1", { party_id: "p1", kind: "resident", display_name: "甲" }],
    ["CONTRIBUTION_AGREEMENT_SIGNED", "contribution_record", "c1", { agreement_id: "ag1", party_id: "p1", roles: ["donor"], reuse_scope: "x", signed_at: "2026-01-01", doc_uri: "a.pdf" }],
    artworkReg(),
    ["CREDIT_DECIDED", "contribution_record", "c1", { artwork_id: "aw-1", version: 1, entries: [{ party_id: "p2", label: "乙", agreement_id: "ag1" }], decided_by_party_id: "p-school" }],
  ]);
  expectBlocked(events, "约定不属于本人");
});

test("传播争议裁定不核对原授权被拒绝", () => {
  const events = rebuildScenario({
    patch: {
      DISPUTE_RESOLVED: () => ({ payload: { checked_agreement_ids: [], checked_authorization_ids: [] } }),
    },
  });
  expectBlocked(events, "必须核对");
});

test("发布素材缺少对应授权被拒绝", () => {
  const events = rebuildScenario({
    patch: {
      PUBLICATION_RELEASED: (e) => ({
        payload: { used_authorization_ids: e.payload.used_authorization_ids.filter((id) => id !== "auth-mi-image") },
      }),
    },
  });
  expectBlocked(events, "没有对应有效授权");
});

/* ---------------- 介绍页真实性 ---------------- */

test("介绍页不得宣称采用未验收的材料", () => {
  const events = mini([
    artworkReg(),
    ["ARTWORK_INFO_PUBLISHED", "artwork", "aw-1", { adopted_memory_input_ids: [], adopted_material_ids: ["mat-ghost"], excluded_input_ids: [] }],
  ]);
  expectBlocked(events, "不存在或未验收");
});

/* ---------------- 事件流级约定 ---------------- */

test("事件标识重复与版本跳号被拒绝", () => {
  const events = buildScenario().slice(0, 3).map((e) => ({ ...e, event_id: "evt-dup-00001" }));
  const errors = validateStream(events);
  assert.ok(errors.some((m) => m.includes("事件标识重复")));

  const jump = mini([artworkReg()]);
  jump[0].version = 9;
  assert.ok(validateStream(jump).some((m) => m.includes("版本号应为")));
});
