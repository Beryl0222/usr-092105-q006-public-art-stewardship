import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const catalogPath = fileURLToPath(new URL("../contracts/event-catalog.json", import.meta.url));

/** 事件目录：事件类型 → 所属聚合与 payload 必填项。 */
export const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

export function eventSpec(eventType) {
  return catalog.events[eventType];
}

export function aggregateLabel(aggregateType) {
  return catalog.aggregates[aggregateType];
}
