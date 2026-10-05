import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyAll,
  createLedger,
  currentSteward,
  deriveDamageReport,
  disputeEvidence,
  openCases,
  workProfileView,
} from "../src/projector.js";

const scenario = JSON.parse(await readFile(new URL("../data/subway-wall-scenario.json", import.meta.url), "utf8"));

function buildLedger() {
  const ledger = createLedger();
  const failures = applyAll(ledger, scenario.events);
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
  return ledger;
}

test("地铁艺术墙全生命周期事件流被完整受理", () => {
  const ledger = buildLedger();
  assert.equal(ledger.events.length, scenario.events.length);
});

test("课程结束移交后未结维修案件不丢失，责任人随之更新", () => {
  const ledger = buildLedger();
  const open = openCases(ledger.state);
  assert.ok(open.includes("case-wutong-wall-001-build"), "在役养护档案仍在");
  assert.ok(open.includes("case-wutong-wall-001-repair-01"), "维修案件未因课程结束消失");
  assert.equal(currentSteward(ledger.state).name, "王敏");
  assert.equal(ledger.state.custody.length, 1);
});

test("报损单自动带出当前责任人与资金约定", () => {
  const ledger = buildLedger();
  const derived = deriveDamageReport(ledger.state);
  const report = ledger.byId.get("evt-wt-021").payload;
  // 报损发生在课程结束移交之后，带出的必须是新责任人而非学校课程负责人
  assert.equal(report.responsible_steward.org, "梧桐社区文化中心");
  assert.deepEqual(report.responsible_steward, derived.responsible_steward);
  assert.deepEqual(report.funding_terms, derived.funding_terms);
});

test("作品介绍页说明哪些在地记忆和材料获得采用", () => {
  const ledger = buildLedger();
  const profile = workProfileView(ledger);
  assert.equal(profile.version.version_no, 1);
  assert.equal(profile.adopted_memories[0].input.topic, "秋收与打谷机的社区记忆");
  assert.equal(profile.adopted_materials[0].material.item, "旧打谷机（1978年木铁结构）");
  assert.equal(profile.attribution_display.length, 2);
});

test("捐赠者质疑可核对原授权与原约定", () => {
  const ledger = buildLedger();
  const evidence = disputeEvidence(ledger, "evt-wt-022");
  assert.equal(evidence.resolution.outcome, "restore_scope");
  const refs = evidence.evidence.map((e) => e.event_id);
  assert.ok(refs.includes("evt-wt-009"), "核对了旧物进场约定");
  assert.ok(refs.includes("evt-wt-005"), "核对了捐赠授权");
});

test("重大改造形成新版本", () => {
  const ledger = buildLedger();
  assert.deepEqual(
    ledger.state.versions.map((v) => v.version_no),
    [1, 2],
  );
  assert.equal(ledger.state.versions[1].change_type, "major");
});

test("维修预算按资金约定分摊", () => {
  const ledger = buildLedger();
  const budget = ledger.state.cases.get("case-wutong-wall-001-repair-01").budget;
  assert.equal(budget.total, 18000);
  assert.deepEqual(
    budget.funding_split.map((r) => [r.party, r.amount]),
    [
      ["梧桐中学", 10800],
      ["梧桐社区居委会", 7200],
    ],
  );
});
