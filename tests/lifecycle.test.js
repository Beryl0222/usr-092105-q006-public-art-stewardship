import assert from "node:assert/strict";
import test from "node:test";

import { buildScenario, PARTIES, IDS } from "../data/scenario.factory.js";
import { reduceAll } from "../src/reducers.js";
import { validateStream } from "../src/policies.js";
import { damageReportDraft, artworkIntroPage, authorizationCheck, openCasesBoard, materialTrail, designTradeoffReport } from "../src/projections.js";

const events = buildScenario();
const states = reduceAll(events);

test("完整生命周期事件流零违规", () => {
  assert.deepEqual(validateStream(events), []);
});

test("作品从立项到拆除经历 v1→v2，最终终结并归档", () => {
  const a = states.artwork.get(IDS.artwork);
  assert.equal(a.status, "decommissioned");
  assert.equal(a.version, 2);
  assert.ok(a.archived_uris.includes("archive/daolang-interviews.zip"));
});

test("只有评审通过的重大改造才产生了新版本", () => {
  const a = states.artwork.get(IDS.artwork);
  assert.equal(a.version_reason, "增设低照度洗墙灯");
});

test("报损单自动带出：保修期内指向施工方，过保后指向当前保管方", () => {
  const inWarranty = damageReportDraft(states, IDS.artwork, "2026-09-12T09:00:00+08:00");
  assert.equal(inWarranty.responsible.responsible_party_id, PARTIES.builder);
  assert.equal(inWarranty.responsible.basis, "warranty");
  assert.equal(inWarranty.fund.fund_id, IDS.fund);
  assert.equal(inWarranty.fund.shares[PARTIES.stewardship], 0.3);

  const outOfWarranty = damageReportDraft(states, IDS.artwork, "2027-09-22T09:00:00+08:00");
  assert.equal(outOfWarranty.responsible.basis, "custody");
  assert.equal(outOfWarranty.responsible.responsible_party_id, PARTIES.stewardship);

  const afterTransfer = damageReportDraft(states, IDS.artwork, "2027-10-10T09:00:00+08:00");
  assert.equal(afterTransfer.responsible.responsible_party_id, PARTIES.stewardship2);
  assert.equal(afterTransfer.fund.fund_id, IDS.fund);
});

test("案件只有维修验收或拆除两种关闭方式，最终无悬案", () => {
  const closed = [...states.maintenance_case.values()];
  assert.equal(closed.length, 3);
  for (const c of closed) {
    assert.equal(c.is_open, false);
    assert.ok(["repair_accepted", "demolished"].includes(c.closed_reason));
  }
});

test("课程结项时无未结案件；负责人调动时未结案件随作品交接且最终被二组关闭", () => {
  const tile = states.maintenance_case.get(IDS.caseTile);
  assert.deepEqual(tile.transfers.map((t) => [t.from, t.to]), [[PARTIES.stewardship, PARTIES.stewardship2]]);
  assert.equal(tile.closed_reason, "repair_accepted");
  assert.equal(tile.acceptance.by, PARTIES.community);
});

test("未结案件看板在 2027-10 仍能看到调动中的案件（不因课程/调动消失）", () => {
  const snapshot = reduceAll(events.filter((e) => e.occurred_at <= "2027-10-10T00:00:00+08:00"));
  const board = openCasesBoard(snapshot, "2027-10-10T12:00:00+08:00");
  assert.equal(board.length, 1);
  assert.equal(board[0].case_id, IDS.caseTile);
  assert.equal(board[0].current_owner_party_id, PARTIES.stewardship2);
  assert.equal(board[0].curriculum_term_id, "term-2025-spring");
});

test("作品介绍页说明采用的在地记忆与旧物材料，并公开未采纳意见及理由", () => {
  const page = artworkIntroPage(states, IDS.artwork);
  assert.deepEqual(page.adopted_memories.map((m) => m.input_id), ["input-chen-thresher", "input-wang-sunning", "input-mi-ricewave"]);
  assert.equal(page.adopted_materials[0].object_name, "老式脚踏打谷机");
  const neon = page.not_adopted.find((x) => x.input_id === "input-pub-neon");
  assert.ok(neon.reason.includes("眩光"));
  assert.ok(page.credits.some((c) => c.label.includes("陈伯")));
});

test("旧物链路可核对：同意范围、越界事实与和解处置全部留痕", () => {
  const trail = materialTrail(states, IDS.thresher);
  assert.deepEqual(trail.acceptance.consented_transformations, ["清洁除油", "结构加固", "拆解为浮雕构件", "表面保留原木色与锈蚀痕迹"]);
  assert.equal(trail.ownership.owner_party_id, PARTIES.chen);
  assert.equal(trail.reconciliation.within_consent, false);
  assert.ok(trail.reconciliation.resolution.includes("恢复原木色"));
});

test("影像与口述分别授权；未成年人两条授权各带监护人同意", () => {
  const check = authorizationCheck(states, { partyId: PARTIES.mi });
  const kinds = check.authorizations.map((a) => a.subject_kind).sort();
  assert.deepEqual(kinds, ["image", "oral_history"]);
  for (const a of check.authorizations) {
    assert.equal(a.is_minor, true);
    assert.ok(a.guardian_consent_id);
  }
});

test("署名/传播/旧物争议的裁定都回指原协议或原授权", () => {
  const disputes = [...states.contribution_record.values()].flatMap((c) => [...c.disputes.values()]);
  for (const d of disputes) {
    assert.equal(d.status, "resolved");
    assert.ok(d.resolution.checked_agreement_ids.length + d.resolution.checked_authorization_ids.length > 0);
  }
  const creditDispute = disputes.find((d) => d.subject === "credit");
  assert.ok(creditDispute.resolution.checked_agreement_ids.includes("agr-chen-donation"));
});

test("设计取舍报告：发光字支持61票最高仍不中选，理由可追溯", () => {
  const report = designTradeoffReport(states, IDS.design, 1);
  const t = report.tradeoffs[0];
  const neon = t.options.find((o) => o.option === "A-led-characters");
  assert.equal(neon.support_count, 61);
  assert.equal(t.chosen_option, "B-matte-relief");
  assert.ok(t.rationale.includes("眩光"));
});

test("资金拨付累计未超每次上限，份额随交接更新", () => {
  const fund = states.fund_agreement.get(IDS.fund);
  const byCase = {};
  for (const d of fund.draws) byCase[d.case_id] = (byCase[d.case_id] ?? 0) + d.amount;
  assert.deepEqual(byCase, { [IDS.caseCrack]: 8600, [IDS.caseTile]: 1200 });
  assert.ok(Math.max(...Object.values(byCase)) <= fund.per_case_cap);
});

test("拆除路径完整：提议→作品批准→案件批准→实施→作品终结，构件入村史馆", () => {
  const demo = states.maintenance_case.get(IDS.caseDemo);
  assert.equal(demo.closed_reason, "demolished");
  assert.equal(demo.demolition.material_disposition[IDS.thresher], "残余构件移交荷花里村史馆陈列");
});
