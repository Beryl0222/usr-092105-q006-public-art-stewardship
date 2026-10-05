/** 测试辅助：在剧情事件流上改写并重建版本号；构造独立迷你事件流。 */

import { buildScenario } from "../data/scenario.factory.js";

/**
 * 按条件重建事件流：drop 可删事件，patch 可按事件类型合并修改 payload。
 * 修改后聚合版本号连续重排，避免测试数据改写造成版本噪音。
 */
export function rebuildScenario({ drop = () => false, patch = {} } = {}) {
  const seq = new Map();
  return buildScenario()
    .filter((e) => !drop(e))
    .map((e) => {
      const patcher = patch[e.event_type];
      if (!patcher) return e;
      const p = patcher(e);
      return p === e ? e : { ...e, ...p, payload: { ...e.payload, ...(p.payload ?? {}) } };
    })
    .map((e) => {
      const key = `${e.aggregate_type}/${e.aggregate_id}`;
      const v = (seq.get(key) ?? 0) + 1;
      seq.set(key, v);
      return { ...e, version: v };
    });
}

/**
 * 构造独立迷你事件流。
 * 元组：[事件类型, 聚合类型, 聚合ID, payload, occurred_at?]
 */
export function mini(tuples, { start = "2026-01-01T09:00:00+08:00" } = {}) {
  const seq = new Map();
  let n = 0;
  return tuples.map(([type, aggregateType, aggregateId, payload, at]) => {
    const key = `${aggregateType}/${aggregateId}`;
    const v = (seq.get(key) ?? 0) + 1;
    seq.set(key, v);
    n += 1;
    return {
      event_id: `mini-${String(n).padStart(4, "0")}`,
      event_type: type,
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
      occurred_at: at ?? start,
      version: v,
      summary: `迷你流事件 ${n}`,
      payload: payload ?? {},
    };
  });
}
