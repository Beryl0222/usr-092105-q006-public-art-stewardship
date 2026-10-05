import { validateEvent, validatePayload } from "./validator.js";

/** 未结案件状态：建设期、在役期、维修中的案件都算未结。 */
const OPEN_STATUSES = new Set(["building", "in_service", "open"]);

/** 深比较两个 JSON 值（键序无关）。 */
export function sameJson(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => k === kb[i] && sameJson(a[k], b[k]));
}

/** 空白台账：事件流折叠出的系统状态。 */
export function createLedger() {
  return {
    events: [],
    byId: new Map(),
    state: {
      permission: null, // 场地许可
      terms: null, // 当前责任与资金约定
      custody: [], // 移交历史
      decommission: null, // 正式拆除决定
      inputs: new Map(), // event_id -> 访谈与公众意见
      revisions: new Map(), // event_id -> 设计定稿
      materials: new Map(), // event_id -> 旧物进场记录
      versions: [], // 作品版本（含 event_id）
      profile: null, // 作品介绍页（含 event_id）
      consents: new Map(), // event_id -> { ...授权, active }
      attributions: new Map(), // event_id -> 署名记录
      disputes: new Map(), // event_id -> { raised, resolution }
      cases: new Map(), // aggregate_id -> 养护案件
      aggregateVersions: new Map(), // "type:id" -> 已受理版本号
    },
  };
}

/**
 * 受理一条事件。返回中文错误数组，空数组表示成功。
 * 来源系统重试时沿用原 event_id：内容一致的重复事件幂等跳过，内容不一致视为冲突。
 */
export function applyEvent(ledger, event) {
  const errors = [...validateEvent(event), ...validatePayload(event)];
  if (errors.length > 0) return errors;
  const seen = ledger.byId.get(event.event_id);
  if (seen) return sameJson(seen, event) ? [] : [`事件标识冲突：${event.event_id} 已存在且内容不一致`];
  errors.push(...checkInvariants(ledger, event));
  if (errors.length > 0) return errors;
  fold(ledger, event);
  return [];
}

/** 依次受理事件流，返回 [{ event_id, errors }]，空数组表示全部受理。 */
export function applyAll(ledger, events) {
  const failures = [];
  for (const event of events) {
    const errors = applyEvent(ledger, event);
    if (errors.length > 0) failures.push({ event_id: event.event_id, errors });
  }
  return failures;
}

function mustBeOpenRepair(state, event, errors) {
  const c = state.cases.get(event.aggregate_id);
  if (!c || c.kind !== "repair" || c.status !== "open") {
    errors.push(`维修案件 ${event.aggregate_id} 不存在或已结案`);
    return null;
  }
  return c;
}

/** 领域不变量：不满足规则的事件被拒绝，不进入台账。 */
function checkInvariants(ledger, event) {
  const { state } = ledger;
  const errors = [];
  const p = event.payload;

  const key = `${event.aggregate_type}:${event.aggregate_id}`;
  const seenVersion = state.aggregateVersions.get(key) ?? 0;
  if (event.version !== seenVersion + 1)
    errors.push(`${key} 的版本号应从 ${seenVersion + 1} 递增，收到 ${event.version}`);

  // 正式拆除后，养护案件全部终结，不能再登记养护事件
  if (state.decommission && event.aggregate_type === "maintenance_case") {
    errors.push("作品已正式拆除，养护案件已终结，不能再登记养护事件");
    return errors;
  }

  switch (event.event_type) {
    case "CUSTODY_TRANSFERRED": {
      // 课程结束或负责人调动都不能让未结维修丢失：移交清单须与未结案件完全一致
      if (!state.terms) errors.push("尚无责任与资金约定，不能办理移交");
      const open = openCases(state).sort();
      const refs = [...p.open_case_refs].sort();
      const missed = open.filter((id) => !refs.includes(id));
      const unknown = refs.filter((id) => !open.includes(id));
      if (missed.length > 0)
        errors.push(`移交必须列出全部未结案件，遗漏：${missed.join("、")}（课程结束或负责人调动也不能让未结维修丢失）`);
      if (unknown.length > 0) errors.push(`移交清单包含不存在或已结的案件：${unknown.join("、")}`);
      break;
    }
    case "INPUT_COLLECTED": {
      for (const ref of p.consent_refs) {
        const consent = state.consents.get(ref);
        if (!consent) errors.push(`授权记录不存在：${ref}`);
        else if (!consent.active) errors.push(`授权已撤销：${ref}`);
      }
      // 口述记忆与未成年人影像分别授权：访谈必须引用提供者本人的 oral_history 授权
      if (p.channel === "interview") {
        const ok = p.consent_refs.some((ref) => {
          const c = state.consents.get(ref);
          return c && c.active && c.scope === "oral_history" && c.participant_ref === p.contributor_ref;
        });
        if (!ok) errors.push("口述记忆须先取得提供者的 oral_history 授权（与未成年人影像分别授权）");
      }
      break;
    }
    case "DESIGN_DECIDED": {
      for (const ref of p.considered_inputs)
        if (!state.inputs.has(ref)) errors.push(`设计依据的输入记录不存在：${ref}`);
      break;
    }
    case "MATERIAL_ACCEPTED": {
      const consent = state.consents.get(p.consent_ref);
      if (!consent || !consent.active || consent.scope !== "material_donation" || consent.participant_ref !== p.donor_ref)
        errors.push("旧物进场须先取得捐赠者的 material_donation 授权，明确权属与同意改造范围");
      break;
    }
    case "WORK_VERSION_PUBLISHED": {
      // 重大改造形成新版本；小幅调整不另立版本
      const current = state.versions.length > 0 ? state.versions[state.versions.length - 1].version_no : 0;
      if (p.change_type === "major" && p.version_no !== current + 1)
        errors.push(`重大改造须形成新版本：version_no 应为 ${current + 1}，收到 ${p.version_no}`);
      if (p.change_type === "minor" && (current === 0 || p.version_no !== current))
        errors.push(`小幅调整不形成新版本：version_no 应保持 ${current}`);
      if (!state.revisions.has(p.based_on_revision))
        errors.push(`版本须关联设计定稿：${p.based_on_revision} 不存在`);
      break;
    }
    case "WORK_PROFILE_PUBLISHED": {
      // 介绍页须说明哪些在地记忆和材料获得采用，且引用必须真实存在
      if (!state.versions.some((v) => v.event_id === p.work_version_ref))
        errors.push(`作品版本不存在：${p.work_version_ref}`);
      for (const m of p.adopted_memories)
        if (!state.inputs.has(m.input_ref)) errors.push(`介绍页引用的在地记忆不存在：${m.input_ref}`);
      for (const m of p.adopted_materials)
        if (!state.materials.has(m.material_ref)) errors.push(`介绍页引用的材料不存在：${m.material_ref}`);
      for (const a of p.attribution_display)
        if (!state.attributions.has(a.contribution_ref)) errors.push(`介绍页引用的署名记录不存在：${a.contribution_ref}`);
      break;
    }
    case "CONSENT_REVOKED": {
      const consent = state.consents.get(p.consent_ref);
      if (!consent) errors.push(`授权记录不存在：${p.consent_ref}`);
      else if (!consent.active) errors.push(`授权已撤销，不能重复撤销：${p.consent_ref}`);
      break;
    }
    case "ATTRIBUTION_RECORDED": {
      const consent = state.consents.get(p.consent_ref);
      if (!consent || !consent.active || consent.scope !== "attribution" || consent.participant_ref !== p.participant_ref)
        errors.push("署名须对应提供者本人有效的 attribution 授权，争议时以原授权为准");
      break;
    }
    case "DISPUTE_RAISED": {
      if (!ledger.byId.has(p.target_ref)) errors.push(`争议对象不存在：${p.target_ref}`);
      break;
    }
    case "DISPUTE_RESOLVED": {
      // 任何署名或传播争议都可核对原授权：结案必须引用真实存在的原始记录
      const dispute = state.disputes.get(p.dispute_ref);
      if (!dispute) errors.push(`争议不存在：${p.dispute_ref}`);
      else if (dispute.resolution) errors.push(`争议已结案：${p.dispute_ref}`);
      for (const ref of p.verified_against)
        if (!ledger.byId.has(ref)) errors.push(`结案核对的原始记录不存在：${ref}`);
      break;
    }
    case "SAFETY_CLEARED": {
      const c = state.cases.get(event.aggregate_id);
      if (c && (c.kind !== "stewardship" || c.status !== "building"))
        errors.push(`案件 ${event.aggregate_id} 不在建设期，不能登记施工安全检查`);
      break;
    }
    case "WORK_ACCEPTED": {
      const c = state.cases.get(event.aggregate_id);
      if (!c || c.kind !== "stewardship" || c.status !== "building") errors.push("竣工验收须对应建设期的养护档案");
      else if (!c.safety.some((s) => s.phase === "pre_acceptance"))
        errors.push("竣工验收前须完成竣工前安全检查（pre_acceptance）");
      break;
    }
    case "INSPECTION_LOGGED": {
      const c = state.cases.get(event.aggregate_id);
      if (!c || c.kind !== "stewardship" || c.status !== "in_service")
        errors.push("巡检须登记在在役的养护档案上");
      break;
    }
    case "DAMAGE_REPORTED": {
      // 报损单自动带出当前责任人与资金约定：带出的内容须与登记时的约定一致
      if (state.cases.has(event.aggregate_id)) errors.push(`案件编号已存在：${event.aggregate_id}`);
      if (!state.terms) errors.push("尚无责任与资金约定，报损单无法带出责任人");
      else {
        if (!sameJson(p.responsible_steward, state.terms.steward))
          errors.push("报损单带出的责任人与当前约定不一致，须重新带出");
        if (!sameJson(p.funding_terms, state.terms.funding))
          errors.push("报损单带出的资金约定与当前约定不一致，须重新带出");
      }
      break;
    }
    case "REPAIR_BUDGETED": {
      const c = mustBeOpenRepair(state, event, errors);
      if (c && state.terms) {
        const agreed = new Map(state.terms.funding.repair_fund.map((r) => [r.party, r.share]));
        for (const row of p.funding_split) {
          if (agreed.get(row.party) !== row.share)
            errors.push(`预算分摊与资金约定不一致：${row.party} 约定 ${agreed.get(row.party) ?? "无"}，预算 ${row.share}`);
        }
        if (agreed.size !== p.funding_split.length) errors.push("预算分摊方须与资金约定完全一致");
      }
      break;
    }
    case "REPAIR_ASSIGNED":
      mustBeOpenRepair(state, event, errors);
      break;
    case "REPAIR_ACCEPTED": {
      // 维修验收是维修案件唯一的正常结案方式
      const c = mustBeOpenRepair(state, event, errors);
      if (c && !c.assignment) errors.push("维修验收前须先派单（REPAIR_ASSIGNED）");
      break;
    }
    default:
      break;
  }
  return errors;
}

/** 把已受理的事件折叠进状态。 */
function fold(ledger, event) {
  const { state } = ledger;
  const key = `${event.aggregate_type}:${event.aggregate_id}`;
  state.aggregateVersions.set(key, event.version);
  ledger.events.push(event);
  ledger.byId.set(event.event_id, event);
  const p = event.payload;

  switch (event.event_type) {
    case "SITE_PERMISSION_GRANTED":
      state.permission = p;
      break;
    case "STEWARDSHIP_TERMS_SET":
      state.terms = p;
      break;
    case "CUSTODY_TRANSFERRED":
      // 移交只更换责任人，资金约定沿用，未结案件原样保留
      state.custody.push({ ...p, occurred_at: event.occurred_at });
      state.terms = { ...state.terms, steward: p.to_steward };
      break;
    case "DECOMMISSION_DECIDED":
      // 正式拆除：全部未结案件终结
      state.decommission = p;
      for (const c of state.cases.values()) if (OPEN_STATUSES.has(c.status)) c.status = "decommissioned";
      break;
    case "INPUT_COLLECTED":
      state.inputs.set(event.event_id, p);
      break;
    case "DESIGN_DECIDED":
      state.revisions.set(event.event_id, p);
      break;
    case "MATERIAL_ACCEPTED":
      state.materials.set(event.event_id, p);
      break;
    case "WORK_VERSION_PUBLISHED":
      state.versions.push({ event_id: event.event_id, ...p });
      break;
    case "WORK_PROFILE_PUBLISHED":
      state.profile = { event_id: event.event_id, ...p };
      break;
    case "CONSENT_GRANTED":
      state.consents.set(event.event_id, { ...p, active: true });
      break;
    case "CONSENT_REVOKED": {
      const consent = state.consents.get(p.consent_ref);
      consent.active = false;
      consent.revocation = p;
      break;
    }
    case "ATTRIBUTION_RECORDED":
      state.attributions.set(event.event_id, p);
      break;
    case "DISPUTE_RAISED":
      state.disputes.set(event.event_id, { raised: p, resolution: null });
      break;
    case "DISPUTE_RESOLVED":
      state.disputes.get(p.dispute_ref).resolution = p;
      break;
    case "SAFETY_CLEARED": {
      const c = state.cases.get(event.aggregate_id) ?? { kind: "stewardship", status: "building", safety: [], inspections: [] };
      c.safety.push(p);
      state.cases.set(event.aggregate_id, c);
      break;
    }
    case "WORK_ACCEPTED": {
      const c = state.cases.get(event.aggregate_id);
      c.status = "in_service";
      c.acceptance = p;
      break;
    }
    case "INSPECTION_LOGGED":
      state.cases.get(event.aggregate_id).inspections.push(p);
      break;
    case "DAMAGE_REPORTED":
      state.cases.set(event.aggregate_id, {
        kind: "repair",
        status: "open",
        damage: p,
        budget: null,
        assignment: null,
        repair_acceptance: null,
      });
      break;
    case "REPAIR_BUDGETED":
      state.cases.get(event.aggregate_id).budget = p;
      break;
    case "REPAIR_ASSIGNED":
      state.cases.get(event.aggregate_id).assignment = p;
      break;
    case "REPAIR_ACCEPTED": {
      const c = state.cases.get(event.aggregate_id);
      c.status = "repair_accepted";
      c.repair_acceptance = p;
      break;
    }
    default:
      break;
  }
}

/** 当前未结案件（建设期、在役、维修中）。课程结束或负责人调动不影响案件存续。 */
export function openCases(state) {
  return [...state.cases.entries()].filter(([, c]) => OPEN_STATUSES.has(c.status)).map(([id]) => id);
}

/** 当前日常责任人。 */
export function currentSteward(state) {
  return state.terms ? state.terms.steward : null;
}

/** 报损单自动带出的当前责任人与资金约定。 */
export function deriveDamageReport(state) {
  if (!state.terms) return null;
  return {
    responsible_steward: structuredClone(state.terms.steward),
    funding_terms: structuredClone(state.terms.funding),
  };
}

/** 争议核对：返回争议主张、结案方式，以及结案所依据的原授权或原约定记录。 */
export function disputeEvidence(ledger, disputeEventId) {
  const dispute = ledger.state.disputes.get(disputeEventId);
  if (!dispute) return null;
  return {
    raised: dispute.raised,
    resolution: dispute.resolution,
    evidence: (dispute.resolution?.verified_against ?? []).map((ref) => ledger.byId.get(ref)),
  };
}

/** 作品介绍页视图：哪些在地记忆和材料获得采用、署名如何展示。 */
export function workProfileView(ledger) {
  const { state } = ledger;
  if (!state.profile) return null;
  return {
    version: state.versions.find((v) => v.event_id === state.profile.work_version_ref) ?? null,
    adopted_memories: state.profile.adopted_memories.map((m) => ({ ...m, input: state.inputs.get(m.input_ref) ?? null })),
    adopted_materials: state.profile.adopted_materials.map((m) => ({ ...m, material: state.materials.get(m.material_ref) ?? null })),
    attribution_display: state.profile.attribution_display.map((a) => ({
      ...a,
      attribution: state.attributions.get(a.contribution_ref) ?? null,
    })),
  };
}
