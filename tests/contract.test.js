import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateEvent } from "../src/validator.js";
import { buildScenario, PARTIES, IDS } from "../data/scenario.factory.js";

test("中文样例符合领域约定", async () => {
  const sample = JSON.parse(await readFile(new URL("../data/sample.json", import.meta.url), "utf8"));
  assert.deepEqual(validateEvent(sample), []);
});

test("事件目录中的每个事件类型都与聚合配对，且必填项可被校验", () => {
  for (const e of buildScenario()) {
    const errors = validateEvent(e);
    assert.deepEqual(errors, [], `${e.event_id} ${errors.join("；")}`);
  }
});

test("事件与聚合错配被拒绝：INPUT_COLLECTED 只能写在 site_agreement", () => {
  const [first] = buildScenario();
  const bad = { ...first, event_type: "INPUT_COLLECTED", aggregate_type: "artwork" };
  assert.ok(validateEvent(bad).some((m) => m.includes("只能属于聚合")));
});

test("载荷缺少目录规定的必填项被拒绝", () => {
  const bad = {
    event_id: "evt-bad-00001",
    event_type: "DAMAGE_REPORTED",
    aggregate_type: "maintenance_case",
    aggregate_id: "c1",
    occurred_at: "2026-09-12T09:00:00+08:00",
    version: 1,
    summary: "缺少报损必填项",
    payload: { case_id: "c1" },
  };
  assert.ok(validateEvent(bad).some((m) => m.includes("payload 缺少字段")));
});

test("四个公共聚合的公共事件语义保持不变", () => {
  const events = buildScenario();
  const pairs = {
    INPUT_COLLECTED: "site_agreement",
    DESIGN_DECIDED: "design_revision",
    MATERIAL_ACCEPTED: "contribution_record",
    REPAIR_ASSIGNED: "maintenance_case",
  };
  for (const [type, aggregate] of Object.entries(pairs)) {
    assert.ok(events.some((e) => e.event_type === type && e.aggregate_type === aggregate), `${type} 仍应属于 ${aggregate}`);
  }
  assert.ok(PARTIES.builder && IDS.caseCrack);
});
