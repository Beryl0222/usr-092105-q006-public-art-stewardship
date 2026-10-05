/**
 * 读模型：把归约状态投影为业务页面需要的数据。
 * 所有派生口径集中在此，命令侧与展示侧共用同一份事实。
 */

import { deriveDamageSnapshots } from "./responsibility.js";

/** 报损单草稿：当前责任人与资金约定自动带出，报案人无需也不能手填。 */
export function damageReportDraft(states, artworkId, reportedAt) {
  const artwork = states.artwork.get(artworkId);
  if (!artwork) throw new Error(`作品 ${artworkId} 不存在`);
  const snap = deriveDamageSnapshots(states, artworkId, reportedAt);
  return {
    artwork: { id: artworkId, title: artwork.title, version: artwork.version, status: artwork.status },
    reported_at: reportedAt,
    responsible: snap.responsible_snapshot,
    fund: snap.fund_snapshot,
    warranty:
      snap.responsible_snapshot.basis === "warranty"
        ? { until: snap.responsible_snapshot.warranty_until, covered_by: snap.responsible_snapshot.responsible_party_id, active: true }
        : null,
    custodian: deriveDamageSnapshots(states, artworkId, reportedAt).responsible_snapshot.responsible_party_id,
  };
}

function findMaterial(states, materialId) {
  for (const c of states.contribution_record.values()) {
    const m = c.materials.get(materialId);
    if (m) return { material: m, contribution: c };
  }
  return null;
}

function findInputs(states) {
  const map = new Map();
  states.site_agreement.forEach((s) => s.inputs.forEach((v) => map.set(v.id, v)));
  return map;
}

/** 作品介绍页：说明哪些在地记忆与旧物材料获得采用，未采纳的意见也可见理由。 */
export function artworkIntroPage(states, artworkId) {
  const artwork = states.artwork.get(artworkId);
  if (!artwork?.info) throw new Error("作品介绍页尚未发布");
  const inputs = findInputs(states);

  const memories = artwork.info.adopted_memory_input_ids.map((id) => {
    const input = inputs.get(id);
    return {
      input_id: id,
      kind_label: input?.kind === "interview" ? "口述访谈" : "公众意见",
      summary: input?.summary,
      themes: input?.themes ?? [],
      source: input?.anon_label ?? input?.participant ?? "社区征集",
    };
  });

  const materials = artwork.info.adopted_material_ids.map((mid) => {
    const hit = findMaterial(states, mid);
    const m = hit?.material;
    return {
      material_id: mid,
      object_name: m?.object_name,
      provenance: m?.provenance,
      donor_party_id: m?.donor_party_id,
      transformations_consented: m?.acceptance?.consented ?? [],
      additionally_consented: (m?.extra_consented ?? []).flatMap((x) => x.transformations),
      reconciliation: m?.reconciliation
        ? { within_consent: m.reconciliation.within_consent, resolution: m.reconciliation.resolution }
        : null,
    };
  });

  const rejected = [];
  states.design_revision.forEach((d) => {
    d.revisions.forEach((r) => {
      for (const item of r.decision?.rejected_inputs ?? []) {
        const inputId = typeof item === "string" ? item : item.input_id;
        rejected.push({
          input_id: inputId,
          summary: inputs.get(inputId)?.summary,
          reason: typeof item === "string" ? r.decision.rationale : item.reason,
        });
      }
    });
  });

  // 新版本若未重新定稿署名，则沿用上一版最近一次署名定稿
  const creditVersions = [...states.contribution_record.values()].flatMap((c) => c.credits).filter((k) => k.artwork_id === artworkId && k.artwork_version <= artwork.version);
  const credits = creditVersions.at(-1);

  return {
    artwork_id: artworkId,
    title: artwork.title,
    version: artwork.version,
    adopted_memories: memories,
    adopted_materials: materials,
    not_adopted: rejected,
    credits: credits?.entries ?? [],
    published_at: artwork.info.at,
  };
}

/** 授权核对：署名或传播争议发生时，逐条回查原约定与原授权。 */
export function authorizationCheck(states, { partyId, mediaId, publicationId } = {}) {
  const result = { party: null, agreements: [], authorizations: [], publications: [] };
  for (const c of states.contribution_record.values()) {
    if (partyId) {
      result.party ??= c.parties.get(partyId) ?? null;
      c.agreements.forEach((a) => { if (a.party_id === partyId) result.agreements.push(a); });
    }
    c.authorizations.forEach((a) => {
      if (partyId && a.party_id !== partyId) return;
      if (mediaId && !a.media_ids.includes(mediaId)) return;
      const party = c.parties.get(a.party_id);
      result.authorizations.push({
        authorization_id: a.id,
        party_id: a.party_id,
        party_display: party?.display_name,
        is_minor: !!party?.is_minor,
        guardian_consent_id: a.guardian_consent_id,
        subject_kind: a.subject_kind,
        scopes: a.scopes,
        media_ids: a.media_ids,
        granted_at: a.granted_at,
        valid_until: a.valid_until,
        withdrawn_at: a.withdrawn?.at ?? null,
        effective: !a.withdrawn && (!a.valid_until || Date.parse(a.valid_until) > Date.now()),
      });
    });
    c.publications.forEach((pub) => {
      if (publicationId && pub.id !== publicationId) return;
      if (partyId && !pub.used_authorization_ids.some((aid) => c.authorizations.get(aid)?.party_id === partyId)) return;
      result.publications.push(pub);
    });
  }
  return result;
}

/**
 * 未结案件看板：跨课程、跨负责人调动。
 * 案件只认“维修验收 / 正式拆除”两种关闭方式，因此课程结项或换人后依然在册。
 */
export function openCasesBoard(states, now = new Date().toISOString()) {
  const board = [];
  states.maintenance_case.forEach((c) => {
    if (!c.is_open) return;
    const artwork = states.artwork.get(c.artwork_id);
    const currentOwner = c.transfers.length ? c.transfers[c.transfers.length - 1].to : c.responsible_snapshot?.responsible_party_id;
    board.push({
      case_id: c.id,
      artwork_id: c.artwork_id,
      title: artwork?.title,
      artwork_version: artwork?.version,
      curriculum_term_id: artwork?.curriculum_term_id,
      status: c.status,
      symptom: c.symptom,
      current_owner_party_id: currentOwner,
      ownership_basis: c.basis ?? c.responsible_snapshot?.basis,
      transfers: c.transfers,
      fund_snapshot: c.fund_snapshot,
      opened_at: c.opened_at,
      days_open: Math.floor((Date.parse(now) - Date.parse(c.opened_at)) / 86_400_000),
      due_date: c.due_date ?? null,
      overdue: c.due_date ? Date.parse(c.due_date) < Date.parse(now) : false,
    });
  });
  return board.sort((a, b) => Date.parse(a.opened_at) - Date.parse(b.opened_at));
}

/** 旧物全链路：捐赠意向 → 权属核实 → 验收同意范围 → 追加同意 → 实际使用 → 核对处置。 */
export function materialTrail(states, materialId) {
  const hit = findMaterial(states, materialId);
  if (!hit) throw new Error(`旧物 ${materialId} 不存在`);
  const m = hit.material;
  return {
    material_id: m.id,
    object_name: m.object_name,
    provenance: m.provenance,
    donor_party_id: m.donor_party_id,
    ownership: m.owner_party_id
      ? { owner_party_id: m.owner_party_id, basis: m.ownership_basis, witnesses: m.witness_party_ids }
      : null,
    acceptance: m.acceptance
      ? { use_scope: m.acceptance.use_scope, consented_transformations: m.acceptance.consented, at: m.acceptance.at }
      : null,
    reconsents: m.extra_consented,
    reconciliation: m.reconciliation,
  };
}

/** 设计取舍说明：列出各选项意见支持度、中选项与理由——支持度不决定中选。 */
export function designTradeoffReport(states, designId, revisionNo) {
  const d = states.design_revision.get(designId);
  const r = d?.revisions.get(revisionNo);
  if (!r) throw new Error(`修订稿 ${revisionNo} 不存在`);
  return {
    revision_no: r.no,
    proposal: r.proposal,
    based_on_input_ids: r.based_on_input_ids,
    tradeoffs: r.tradeoffs.map((t) => ({
      issue: t.issue,
      options: t.options.map((o) => ({ option: o.option, support_count: o.support_count ?? 0, note: o.note })),
      chosen_option: t.chosen,
      rationale: t.rationale,
      decided_by: t.by,
    })),
    decision: r.decision
      ? { result: r.decision.decision, rationale: r.decision.rationale, adopted: r.decision.adopted_input_ids, rejected: r.decision.rejected_inputs, by: r.decision.by }
      : null,
  };
}
