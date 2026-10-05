import { eventSpec } from "./catalog.js";

const required = ["event_id", "event_type", "aggregate_type", "aggregate_id", "occurred_at", "version", "summary"];

/**
 * 校验事件信封是否符合公共约定。
 * 返回可以直接展示给接入方的中文错误列表；空数组表示通过。
 */
export function validateEvent(record) {
  const errors = required
    .filter((name) => !(name in record))
    .map((name) => `缺少字段：${name}`);

  if ("version" in record && (!Number.isInteger(record.version) || record.version < 1)) {
    errors.push("version 必须是正整数");
  }
  if ("occurred_at" in record && Number.isNaN(Date.parse(record.occurred_at))) {
    errors.push("occurred_at 必须是合法的 date-time");
  }
  if ("summary" in record && typeof record.summary === "string" && record.summary.trim().length < 2) {
    errors.push("summary 至少 2 个字符");
  }

  const spec = record.event_type ? eventSpec(record.event_type) : undefined;
  if (record.event_type && !spec) {
    errors.push(`未知事件类型：${record.event_type}`);
  }
  if (spec && record.aggregate_type && spec.aggregate !== record.aggregate_type) {
    errors.push(`事件 ${record.event_type} 只能属于聚合 ${spec.aggregate}，收到 ${record.aggregate_type}`);
  }
  if (spec) {
    const payload = record.payload ?? {};
    for (const field of spec.payload_required ?? []) {
      if (!(field in payload)) errors.push(`事件 ${record.event_type} 的 payload 缺少字段：${field}`);
    }
  }
  return errors;
}

/** 批量校验并在首个错误处抛出带事件标识的异常，便于装载事件流时定位。 */
export function assertValidEvent(record) {
  const errors = validateEvent(record);
  if (errors.length > 0) {
    throw new Error(`${record.event_id ?? "?"} ${errors.join("；")}`);
  }
}
