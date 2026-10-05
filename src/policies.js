/**
 * 跨聚合业务不变量。checkEvent 在“追加该事件之前”的状态上判断，
 * 返回中文错误列表；validateStream 逐条归约前缀并检查整个事件流。
 */

import { eventSpec } from "./catalog.js";
import { reduceAll } from "./reducers.js";
import { deriveDamageSnapshots } from "./responsibility.js";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function materialConsentedSet(material) {
  const set = new Set(material?.acceptance?.consented ?? []);
  for (const x of material?.extra_consented ?? []) x.transformations.forEach((t) => set.add(t));
  return set;
}

function currentCaseOwner(maintenanceCase) {
  return maintenanceCase.transfers.length
    ? maintenanceCase.transfers[maintenanceCase.transfers.length - 1].to
    : maintenanceCase.responsible_snapshot?.responsible_party_id;
}

function openIncidentsBlocking(construction) {
  return [...construction.incidents.values()].filter((i) => i.severity === "high" && i.status !== "closed");
}

/** 一个作品一个 contribution_record 聚合，也兼容按作品分散存放。 */
function findMaterial(states, materialId) {
  for (const c of states.contribution_record.values()) {
    const m = c.materials.get(materialId);
    if (m) return m;
  }
  return null;
}
function findParty(states, partyId) {
  for (const c of states.contribution_record.values()) {
    const party = c.parties.get(partyId);
    if (party) return party;
  }
  return null;
}

function checkEvent(states, e) {
  const p = e.payload ?? {};
  const errors = [];
  const reject = (m) => {
    errors.push(`${e.event_id} ${m}`);
    return errors;
  };

  switch (e.event_type) {
    /* ---- 旧物：先确权，再验收；改造方式不得超出同意范围 ---- */
    case "MATERIAL_ACCEPTED": {
      const m = states.contribution_record.get(e.aggregate_id)?.materials.get(p.material_id);
      if (!m) return reject(`旧物 ${p.material_id} 尚未登记捐赠意向`);
      if (!m.owner_party_id) return reject(`旧物 ${p.material_id} 尚未完成权属核实，不得验收`);
      if (!Array.isArray(p.consented_transformations) || p.consented_transformations.length === 0) {
        return reject(`旧物 ${p.material_id} 验收时必须列明捐赠者同意的改造方式清单`);
      }
      break;
    }
    case "MATERIAL_RECONSENTED": {
      const m = states.contribution_record.get(e.aggregate_id)?.materials.get(p.material_id);
      if (!m?.acceptance) return reject(`旧物 ${p.material_id} 尚未验收，无从追加同意`);
      if (m.owner_party_id !== p.owner_party_id) return reject("追加同意必须由权属核实记录中的权属人作出");
      if (!states.contribution_record.get(e.aggregate_id)?.agreements.has(p.agreement_id)) {
        return reject(`追加同意协议 ${p.agreement_id} 不存在`);
      }
      break;
    }

    /* ---- 未成年人：影像与口述分别授权，监护人同意不可省 ---- */
    case "PARTICIPANT_AUTHORIZATION_GRANTED": {
      const c = states.contribution_record.get(e.aggregate_id);
      const party = c?.parties.get(p.party_id);
      if (!party) return reject(`授权人 ${p.party_id} 尚未登记`);
      if (!["image", "oral_history"].includes(p.subject_kind)) return reject("subject_kind 必须是 image 或 oral_history（影像与口述分别授权）");
      if (!Array.isArray(p.scopes) || p.scopes.length === 0) return reject("授权必须列明使用范围 scopes");
      if (party.is_minor && !p.guardian_consent_id) return reject(`未成年人 ${p.display_name ?? p.party_id} 的${p.subject_kind === "image" ? "影像" : "口述"}授权缺少监护人同意`);
      break;
    }

    /* ---- 署名：每条署名都要能回指已签署约定 ---- */
    case "CREDIT_DECIDED": {
      const c = states.contribution_record.get(e.aggregate_id);
      for (const entry of p.entries ?? []) {
        const ag = c?.agreements.get(entry.agreement_id);
        if (!ag) return reject(`署名 ${entry.label ?? entry.party_id} 缺少已签署约定 ${entry.agreement_id}`);
        if (ag.party_id !== entry.party_id) return reject(`署名 ${entry.label ?? entry.party_id} 引用的约定不属于本人`);
      }
      break;
    }

    /* ---- 传播：所用影像/口述必须各有有效授权 ---- */
    case "PUBLICATION_RELEASED": {
      const c = states.contribution_record.get(e.aggregate_id);
      const at = Date.parse(p.released_at);
      const covered = new Set();
      const kinds = new Set();
      for (const aid of p.used_authorization_ids ?? []) {
        const a = c?.authorizations.get(aid);
        if (!a) return reject(`发布引用的授权 ${aid} 不存在`);
        if (a.withdrawn) return reject(`授权 ${aid} 已撤回，不得用于发布`);
        if (a.valid_until && Date.parse(a.valid_until) < at) return reject(`授权 ${aid} 已过有效期`);
        if (!a.scopes.includes(p.channel)) return reject(`授权 ${aid} 的使用范围不含渠道 ${p.channel}`);
        a.media_ids.forEach((m) => covered.add(m));
        kinds.add(a.subject_kind);
      }
      for (const mid of p.media_ids ?? []) {
        if (!covered.has(mid)) return reject(`发布素材 ${mid} 没有对应有效授权`);
      }
      if (!p.media_ids?.length) return reject("发布必须登记素材清单");
      break;
    }

    /* ---- 争议：裁定前必须核对原授权/原约定 ---- */
    case "DISPUTE_RESOLVED": {
      const c = states.contribution_record.get(e.aggregate_id);
      const d = c?.disputes.get(p.dispute_id);
      if (!d) return reject(`争议 ${p.dispute_id} 未立案`);
      const refs = [...(p.checked_agreement_ids ?? []), ...(p.checked_authorization_ids ?? [])];
      if (refs.length === 0) return reject("争议裁定必须核对原授权或原约定记录，不得凭口头说法处理");
      for (const aid of p.checked_agreement_ids ?? []) {
        if (!c.agreements.has(aid)) return reject(`核对的约定 ${aid} 不存在`);
      }
      for (const aid of p.checked_authorization_ids ?? []) {
        if (!c.authorizations.has(aid)) return reject(`核对的授权 ${aid} 不存在`);
      }
      if (d.subject === "credit" && (p.checked_agreement_ids ?? []).length === 0) return reject("署名争议必须核对原签署约定");
      if (d.subject === "publication" && (p.checked_authorization_ids ?? []).length === 0) return reject("传播争议必须核对原授权");
      break;
    }

    /* ---- 重大改造形成新版本，先评审后施工 ---- */
    case "ARTWORK_VERSION_OPENED": {
      const a = states.artwork.get(e.aggregate_id);
      if (!a) return reject("作品尚未登记");
      if (p.new_version !== a.version + 1) return reject(`新版本号必须为 ${a.version + 1}`);
      const approvedMajor = [...states.design_revision.values()].some((d) =>
        [...d.changeRequests.values()].some((cr) => cr.id === p.change_request_id && cr.status === "approved" && cr.scope_class === "major"),
      );
      if (!approvedMajor) return reject("只有评审通过的重大改造才能开启作品新版本；小修小补不得另立版本");
      break;
    }
    case "DESIGN_CHANGE_REVIEWED": {
      const cr = states.design_revision.get(e.aggregate_id)?.changeRequests.get(p.change_request_id);
      if (!cr) return reject(`改造请求 ${p.change_request_id} 不存在`);
      if (cr.status !== "requested") return reject("改造请求已评审，不得重复裁定");
      if (!p.rationale?.trim()) return reject("评审必须记录理由");
      break;
    }

    /* ---- 施工：安全报备获批且在有效期内，旧物改造不越界，未成年人专项安排 ---- */
    case "CONSTRUCTION_PLAN_FILED": {
      const a = states.artwork.get(p.artwork_id);
      if (!a) return reject(`作品 ${p.artwork_id} 尚未登记`);
      if (p.for_version !== a.version) return reject(`施工方案对应版本 v${p.for_version} 与作品当前版本 v${a.version} 不符（重大改造须先开启新版本）`);
      break;
    }
    case "CONSTRUCTION_LOGGED": {
      const cj = states.construction_project.get(e.aggregate_id);
      if (!cj?.approval) return reject("安全报备未获批，不得进场施工");
      if (Date.parse(cj.approval.valid_until) < Date.parse(p.log_date)) return reject("施工日期超出安全报备有效期");
      const site = states.site_agreement.get(states.artwork.get(cj.artwork_id)?.site_id);
      if (site?.permit?.status !== "granted") return reject("场地许可未获批，不得施工");
      if (Date.parse(site.permit.valid_to) < Date.parse(p.log_date)) return reject("施工日期超出场地许可有效期");
      const checkParty = (pid) => findParty(states, pid);
      for (const t of p.material_transformations ?? []) {
        const m = findMaterial(states, t.material_id);
        if (!m) return reject(`施工使用了未登记旧物 ${t.material_id}`);
        const allowed = materialConsentedSet(m);
        const beyond = t.transformations.filter((x) => !allowed.has(x));
        if (beyond.length) return reject(`旧物 ${m.object_name}（${t.material_id}）的改造超出捐赠者同意范围：${beyond.join("、")}；须先取得追加同意`);
      }
      if ((p.participant_party_ids ?? []).some((pid) => checkParty(pid)?.is_minor) && !cj.approval.minor_arrangement) {
        return reject("有未成年人进场，但安全报备缺少未成年人参与专项安排");
      }
      break;
    }
    case "WORK_SUBMITTED": {
      const cj = states.construction_project.get(e.aggregate_id);
      if (!cj?.approval) return reject("未完成安全报备不得报验");
      const blocking = openIncidentsBlocking(cj);
      if (blocking.length) return reject(`高风险安全事件 ${blocking.map((i) => i.id).join("、")} 未关闭，不得报验`);
      break;
    }
    case "WORK_ACCEPTED": {
      const a = states.artwork.get(e.aggregate_id);
      if (a?.status === "decommissioned") return reject("作品已拆除，不得再验收");
      const cj = states.construction_project.get(p.construction_id);
      if (!cj?.submitted) return reject("施工方尚未报验，不得组织竣工验收");
      if (openIncidentsBlocking(cj).length) return reject("存在未关闭的高风险安全事件，不得通过竣工验收");
      if (!p.warranty_until || !p.warranty_covered_party_id) return reject("验收必须明确保修期限与保修责任方");
      break;
    }

    /* ---- 介绍页：采用的记忆与材料必须真实存在且材料已验收 ---- */
    case "ARTWORK_INFO_PUBLISHED": {
      for (const mid of p.adopted_material_ids ?? []) {
        const found = [...states.contribution_record.values()].some((c) => {
          const m = c.materials.get(mid);
          return m?.acceptance;
        });
        if (!found) return reject(`介绍页采用的材料 ${mid} 不存在或未验收，不得对外宣称采用`);
      }
      const inputIds = new Set();
      states.site_agreement.forEach((s) => s.inputs.forEach((_, id) => inputIds.add(id)));
      for (const id of [...(p.adopted_memory_input_ids ?? []), ...(p.excluded_input_ids ?? [])]) {
        if (!inputIds.has(id)) return reject(`介绍页引用的意见/访谈 ${id} 不存在`);
      }
      break;
    }

    /* ---- 交接：未结维修必须随作品移交，一个都不能丢 ---- */
    case "ARTWORK_HANDED_OVER": {
      const a = states.artwork.get(e.aggregate_id);
      const actualOpen = [...states.maintenance_case.values()].filter((c) => c.artwork_id === e.aggregate_id && c.is_open).map((c) => c.id).sort();
      const listed = [...(p.open_case_ids ?? [])].sort();
      if (!same(actualOpen, listed)) return reject(`交接必须列明全部未结案件：应有 ${actualOpen.join("、") || "（无）"}，实列 ${listed.join("、") || "（无）"}`);
      if (p.fund_agreement_id && !states.fund_agreement.has(p.fund_agreement_id)) return reject(`交接引用的资金约定 ${p.fund_agreement_id} 不存在`);
      break;
    }
    case "CASE_OWNERSHIP_TRANSFERRED": {
      const c = states.maintenance_case.get(p.case_id);
      if (!c) return reject(`案件 ${p.case_id} 不存在`);
      if (!c.is_open) return reject("已关闭案件不得转移；课程结束或调动只应转移未结案件");
      break;
    }

    /* ---- 报损：责任与资金由系统自动带出，禁止手填口径 ---- */
    case "DAMAGE_REPORTED": {
      const a = states.artwork.get(p.artwork_id);
      if (!a) return reject(`作品 ${p.artwork_id} 尚未登记`);
      if (a.status === "decommissioned") return reject("作品已正式拆除，不再受理报损");
      const derived = deriveDamageSnapshots(states, p.artwork_id, p.reported_at);
      if (!same(p.responsible_snapshot ?? null, derived.responsible_snapshot)) {
        return reject("报损单责任人必须由系统按保修状态/保管链自动带出，不得手工填写");
      }
      if (derived.fund_snapshot && !same(p.fund_snapshot ?? null, derived.fund_snapshot)) {
        return reject("报损单资金约定必须与生效中的维修资金约定一致");
      }
      break;
    }
    case "REPAIR_ASSIGNED": {
      const c = states.maintenance_case.get(p.case_id);
      if (!c?.is_open) return reject(`案件 ${p.case_id} 未立案或已关闭，不得派修`);
      if (c.assignee && c.status !== "open" && c.transfers.length === 0) return reject("案件已派修，重复派修须先走责任转移");
      const expected = currentCaseOwner(c);
      if (p.assignee_party_id !== expected) return reject(`承修方必须为当前责任方 ${expected}（责任已变更时请先记录案件转移）`);
      if (c.fund_snapshot?.fund_id && p.fund_agreement_id !== c.fund_snapshot.fund_id) return reject("派修引用的资金约定与报损快照不一致");
      break;
    }
    case "REPAIR_QUOTE_APPROVED": {
      const c = states.maintenance_case.get(p.case_id);
      if (!["assigned"].includes(c?.status)) return reject("只有已派修案件可以确认报价");
      const cap = c.fund_snapshot?.per_case_cap;
      if (cap != null && p.amount > cap) return reject(`报价 ${p.amount} 超过每次维修资金上限 ${cap}`);
      break;
    }
    case "REPAIR_COMPLETED": {
      const c = states.maintenance_case.get(p.case_id);
      if (!["assigned", "quote_approved"].includes(c?.status)) return reject("未派修的案件不得填报完工");
      break;
    }
    case "REPAIR_ACCEPTED": {
      const c = states.maintenance_case.get(p.case_id);
      if (c?.status !== "repair_done") return reject("只有完工待验的案件可以验收通过");
      break;
    }

    /* ---- 资金拨付：不得超过每次上限 ---- */
    case "MAINTENANCE_FUND_DRAWN": {
      const f = states.fund_agreement.get(e.aggregate_id);
      if (!f?.shares) return reject("资金约定尚未生效");
      const c = states.maintenance_case.get(p.case_id);
      if (!c?.is_open) return reject("只能为未结维修案件拨付资金");
      const used = f.draws.filter((d) => d.case_id === p.case_id).reduce((s, d) => s + d.amount, 0);
      if (used + p.amount > (f.per_case_cap ?? Infinity)) return reject(`案件 ${p.case_id} 累计拨付将超过每次上限`);
      break;
    }

    /* ---- 拆除：正式批准链，未结维修先处理 ---- */
    case "DEMOLITION_PROPOSED": {
      const c = states.maintenance_case.get(p.case_id);
      if (!c?.is_open) return reject("只能在未结案件上提出拆除");
      break;
    }
    case "ARTWORK_DECOMMISSION_APPROVED": {
      const blocking = [...states.maintenance_case.values()].filter(
        (c) => c.artwork_id === e.aggregate_id && c.is_open && c.status !== "demolition_proposed",
      );
      if (blocking.length) return reject(`仍有未结维修案件 ${blocking.map((c) => c.id).join("、")}，不得批准拆除`);
      break;
    }
    case "DEMOLITION_APPROVED": {
      const c = states.maintenance_case.get(p.case_id);
      if (c?.status !== "demolition_proposed") return reject("拆除未立案或状态不允许批准");
      const a = states.artwork.get(c.artwork_id);
      if (a?.status !== "decommission_approved") return reject("须先有作品正式拆除批准，案件方可批准拆除");
      break;
    }
    case "DEMOLITION_COMPLETED": {
      const c = states.maintenance_case.get(p.case_id);
      if (c?.status !== "demolition_approved") return reject("拆除未获正式批准，不得实施");
      break;
    }
    case "ARTWORK_DECOMMISSIONED": {
      const a = states.artwork.get(e.aggregate_id);
      if (a?.status !== "decommission_approved") return reject("拆除未获批，不得记录拆除完成");
      const demoCase = states.maintenance_case.get(p.demolition_case_id);
      if (demoCase?.status !== "closed" || demoCase.closed_reason !== "demolished") return reject("须先完成拆除案件（记录构件去向与档案）方可终结作品");
      break;
    }

    /* ---- 设计定稿：所依据的意见必须真实存在；票数不约束选择 ---- */
    case "DESIGN_DECIDED": {
      const d = states.design_revision.get(e.aggregate_id);
      const r = d?.revisions.get(p.revision_no);
      if (!r) return reject(`修订稿 ${p.revision_no} 不存在`);
      if (r.decision) return reject("该修订稿已定稿，不得重复决定");
      const inputIds = new Set();
      states.site_agreement.forEach((s) => s.inputs.forEach((v, id) => inputIds.add(id)));
      for (const id of [...(p.adopted_input_ids ?? []), ...(p.rejected_inputs ?? [])]) {
        const inputId = typeof id === "string" ? id : id.input_id;
        if (!inputIds.has(inputId)) return reject(`设计定稿引用的意见 ${inputId} 不存在`);
      }
      if (!p.rationale?.trim()) return reject("设计定稿必须记录取舍理由；意见汇总不能替代设计判断");
      break;
    }
    case "DESIGN_TRADEOFF_RECORDED": {
      const r = states.design_revision.get(e.aggregate_id)?.revisions.get(p.revision_no);
      if (!r) return reject(`修订稿 ${p.revision_no} 不存在`);
      const optionKeys = (p.options ?? []).map((o) => o.option);
      if (!optionKeys.includes(p.chosen_option)) return reject("中选方案必须在所列选项之中");
      if (!p.rationale?.trim()) return reject("取舍必须记录理由（支持人数高的方案不自动中选）");
      break;
    }

    default:
  }
  return errors;
}

/** 顺序级约定：事件唯一、聚合版本连续、聚合内时间不倒流。 */
export function validateStream(events) {
  const errors = [];
  const seenEvent = new Set();
  const versions = new Map();
  const lastTime = new Map();

  const statesAt = (i) => reduceAll(events.slice(0, i));

  events.forEach((e, i) => {
    if (seenEvent.has(e.event_id)) errors.push(`${e.event_id} 事件标识重复；重试必须幂等而不是新发`);
    seenEvent.add(e.event_id);

    const spec = eventSpec(e.event_type);
    if (!spec) {
      errors.push(`${e.event_id} 未知事件类型 ${e.event_type}`);
      return;
    }
    const key = `${e.aggregate_type}/${e.aggregate_id}`;
    const next = (versions.get(key) ?? 0) + 1;
    if (e.version !== next) errors.push(`${e.event_id} 版本号应为 ${next}（${key}）`);
    versions.set(key, next);

    const prevTime = lastTime.get(key);
    if (prevTime && Date.parse(e.occurred_at) < Date.parse(prevTime)) errors.push(`${e.event_id} 同一聚合内发生时间倒流`);
    lastTime.set(key, e.occurred_at);

    errors.push(...checkEvent(statesAt(i), e));
  });
  return errors;
}
