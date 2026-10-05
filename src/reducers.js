/**
 * 聚合归约器：把事件流折叠为各业务对象的当前状态。
 * 纯函数，不做合法性判断；跨聚合不变量在 policies.js 中检查。
 */

function index(events, key) {
  const map = new Map();
  for (const e of events) {
    if (!map.has(e.aggregate_id)) map.set(e.aggregate_id, []);
    map.get(e.aggregate_id).push(e);
  }
  return map;
}

function foldArtwork(events) {
  const s = {
    id: events[0]?.aggregate_id,
    status: "registered",
    version: 0,
    handovers: [],
    warranties: [],
  };
  for (const e of events) {
    const p = e.payload;
    switch (e.event_type) {
      case "ARTWORK_REGISTERED":
        Object.assign(s, {
          title: p.title,
          site_id: p.site_id,
          lead_school_party_id: p.lead_school_party_id,
          initial_custodian_party_id: p.coordinator_party_id,
          custodian_party_id: p.coordinator_party_id,
          curriculum_term_id: p.curriculum_term_id,
          expected_lifetime_years: p.expected_lifetime_years,
          version: 1,
        });
        break;
      case "WORK_ACCEPTED":
        s.status = "in_service";
        s.construction_id = p.construction_id;
        s.accepted_by_party_ids = p.accepted_by_party_ids;
        s.warranty_until = p.warranty_until;
        s.warranty_covered_party_id = p.warranty_covered_party_id;
        s.accepted_at = e.occurred_at;
        s.warranties.push({ accepted_at: e.occurred_at, until: p.warranty_until, covered_party_id: p.warranty_covered_party_id });
        break;
      case "ARTWORK_VERSION_OPENED":
        s.version = p.new_version;
        s.version_reason = p.reason;
        break;
      case "ARTWORK_HANDED_OVER":
        s.custodian_party_id = p.to_party_id;
        s.handovers.push({ at: e.occurred_at, from: p.from_party_id, to: p.to_party_id, reason: p.reason, open_case_ids: p.open_case_ids, fund_agreement_id: p.fund_agreement_id });
        break;
      case "ARTWORK_DECOMMISSION_APPROVED":
        s.status = "decommission_approved";
        s.decommission = { reason: p.reason, decision_party_ids: p.decision_party_ids, material_disposition: p.material_disposition };
        break;
      case "ARTWORK_DECOMMISSIONED":
        s.status = "decommissioned";
        s.decommissioned_at = e.occurred_at;
        s.archived_uris = p.archived_uris;
        break;
      case "ARTWORK_INFO_PUBLISHED":
        s.info = { adopted_memory_input_ids: p.adopted_memory_input_ids, adopted_material_ids: p.adopted_material_ids, excluded_input_ids: p.excluded_input_ids, at: e.occurred_at };
        break;
      default:
    }
  }
  return s;
}

function foldSite(events) {
  const s = { id: events[0]?.aggregate_id, permit: { status: "none" }, inputs: new Map(), summaries: [] };
  for (const e of events) {
    const p = e.payload;
    switch (e.event_type) {
      case "SITE_PERMIT_REQUESTED":
        s.permit = { status: "requested", owner: p.site_owner_party_id, applicant: p.applicant_party_id, footprint: p.footprint, use_period: p.use_period };
        break;
      case "SITE_PERMIT_GRANTED":
        s.permit = { ...s.permit, status: "granted", permit_no: p.permit_no, valid_from: p.valid_from, valid_to: p.valid_to, obligations: p.obligations, require_safety_filing: p.require_safety_filing };
        break;
      case "SITE_PERMIT_CLOSED":
        s.permit = { ...s.permit, status: "closed", close_reason: p.reason };
        break;
      case "INPUT_COLLECTED":
        s.inputs.set(p.input_id, { id: p.input_id, kind: p.kind, summary: p.summary, themes: p.themes ?? [], participant: p.participant_party_id, anon_label: p.anon_label, media_uris: p.media_uris ?? [], content: p.content, at: e.occurred_at, by: p.collected_by_party_id });
        break;
      case "PUBLIC_INPUT_SUMMARY_PUBLISHED":
        s.summaries.push({ period: p.period, comment_count: p.comment_count, themes: p.themes, note: p.note, at: e.occurred_at });
        break;
      default:
    }
  }
  return s;
}

function foldDesign(events) {
  const s = { artwork_id: events[0]?.aggregate_id, revisions: new Map(), changeRequests: new Map(), order: [] };
  for (const e of events) {
    const p = e.payload;
    switch (e.event_type) {
      case "DESIGN_REVISION_PROPOSED":
        s.revisions.set(p.revision_no, { no: p.revision_no, proposal: p.proposal, based_on_input_ids: p.based_on_input_ids, tradeoffs: [], decision: null });
        s.order.push(p.revision_no);
        break;
      case "DESIGN_TRADEOFF_RECORDED": {
        const r = s.revisions.get(p.revision_no);
        r?.tradeoffs.push({ issue: p.issue, options: p.options, chosen: p.chosen_option, rationale: p.rationale, by: p.decided_by_party_id });
        break;
      }
      case "DESIGN_DECIDED": {
        const r = s.revisions.get(p.revision_no);
        if (r) r.decision = { decision: p.decision, adopted_input_ids: p.adopted_input_ids, rejected_inputs: p.rejected_inputs, rationale: p.rationale, by: p.decided_by_party_id, at: e.occurred_at };
        break;
      }
      case "DESIGN_CHANGE_REQUESTED":
        s.changeRequests.set(p.change_request_id ?? e.event_id, { id: p.change_request_id ?? e.event_id, scope_class: p.scope_class, description: p.description, by: p.requested_by_party_id, status: "requested", at: e.occurred_at });
        break;
      case "DESIGN_CHANGE_REVIEWED": {
        const cr = s.changeRequests.get(p.change_request_id);
        if (cr) Object.assign(cr, { status: p.approved ? "approved" : "rejected", scope_class: p.scope_class, by: p.reviewed_by_party_id, rationale: p.rationale, reviewed_at: e.occurred_at });
        break;
      }
      default:
    }
  }
  return s;
}

function foldContribution(events) {
  const s = { artwork_id: events[0]?.aggregate_id, parties: new Map(), agreements: new Map(), materials: new Map(), authorizations: new Map(), credits: [], disputes: new Map(), publications: [] };
  for (const e of events) {
    const p = e.payload;
    switch (e.event_type) {
      case "CONTRIBUTOR_REGISTERED":
        s.parties.set(p.party_id, { id: p.party_id, kind: p.kind, display_name: p.display_name, is_minor: !!p.is_minor, guardian_party_id: p.guardian_party_id, contact_ref: p.contact_ref });
        break;
      case "CONTRIBUTION_AGREEMENT_SIGNED":
        s.agreements.set(p.agreement_id, { id: p.agreement_id, party_id: p.party_id, roles: p.roles, reuse_scope: p.reuse_scope, signed_at: p.signed_at, doc_uri: p.doc_uri });
        break;
      case "MATERIAL_DONATION_OFFERED":
        s.materials.set(p.material_id, { id: p.material_id, donor_party_id: p.donor_party_id, object_name: p.object_name, provenance: p.provenance, condition_photo_uri: p.condition_photo_uri, offered_at: e.occurred_at, owner_party_id: null, consented: [], extra_consented: [], reconciliation: null });
        break;
      case "MATERIAL_OWNERSHIP_VERIFIED": {
        const m = s.materials.get(p.material_id);
        if (m) Object.assign(m, { owner_party_id: p.owner_party_id, ownership_basis: p.basis, witness_party_ids: p.witness_party_ids });
        break;
      }
      case "MATERIAL_ACCEPTED": {
        const m = s.materials.get(p.material_id);
        if (m) m.acceptance = { by: p.accepted_by_party_id, use_scope: p.use_scope, consented: p.consented_transformations, at: e.occurred_at };
        break;
      }
      case "MATERIAL_RECONSENTED": {
        const m = s.materials.get(p.material_id);
        if (m) {
          m.extra_consented.push({ transformations: p.additionally_consented_transformations, agreement_id: p.agreement_id, at: p.reconsented_at });
        }
        break;
      }
      case "MATERIAL_USE_RECONCILED": {
        const m = s.materials.get(p.material_id);
        if (m) m.reconciliation = { actual_transformations: p.actual_transformations, within_consent: p.within_consent, resolution: p.resolution, by: p.resolved_by_party_ids, at: e.occurred_at };
        break;
      }
      case "PARTICIPANT_AUTHORIZATION_GRANTED":
        s.authorizations.set(p.authorization_id, { id: p.authorization_id, party_id: p.party_id, subject_kind: p.subject_kind, scopes: p.scopes, media_ids: p.media_ids, granted_at: p.granted_at, valid_until: p.valid_until ?? null, guardian_consent_id: p.guardian_consent_id ?? null, withdrawn: null });
        break;
      case "AUTHORIZATION_WITHDRAWN": {
        const a = s.authorizations.get(p.authorization_id);
        if (a) a.withdrawn = { at: p.withdrawn_at, remaining_scopes: p.remaining_scopes };
        break;
      }
      case "CREDIT_DECIDED":
        s.credits.push({ artwork_id: p.artwork_id, artwork_version: p.version, entries: p.entries, by: p.decided_by_party_id, at: e.occurred_at, supersedes: p.supersedes_event_id ?? null });
        break;
      case "DISPUTE_FILED":
        s.disputes.set(p.dispute_id, { id: p.dispute_id, subject: p.subject, claimant: p.claimant_party_id, claim: p.claim, status: "open", at: e.occurred_at, resolution: null });
        break;
      case "DISPUTE_RESOLVED": {
        const d = s.disputes.get(p.dispute_id);
        if (d) {
          d.status = "resolved";
          d.resolution = { ruling: p.ruling, checked_agreement_ids: p.checked_agreement_ids, checked_authorization_ids: p.checked_authorization_ids, remedy: p.remedy, by: p.resolved_by_party_ids, at: e.occurred_at };
        }
        break;
      }
      case "PUBLICATION_RELEASED":
        s.publications.push({ id: p.publication_id, channel: p.channel, media_ids: p.media_ids, used_authorization_ids: p.used_authorization_ids, by: p.released_by_party_id, at: p.released_at });
        break;
      default:
    }
  }
  return s;
}

function foldConstruction(events) {
  const s = { id: events[0]?.aggregate_id, logs: [], incidents: new Map(), approval: null, submitted: null };
  for (const e of events) {
    const p = e.payload;
    switch (e.event_type) {
      case "CONSTRUCTION_PLAN_FILED":
        Object.assign(s, { artwork_id: p.artwork_id, contractor: p.contractor_party_id, safety_officer: p.safety_officer_party_id, method_statement_uri: p.method_statement_uri, risk: p.risk_assessment, for_version: p.for_version });
        break;
      case "SAFETY_FILING_APPROVED":
        s.approval = { by: p.approved_by_party_id, conditions: p.conditions, valid_until: p.valid_until, minor_arrangement: p.minor_participation_arrangement, at: e.occurred_at };
        break;
      case "CONSTRUCTION_LOGGED":
        s.logs.push({ date: p.log_date, activities: p.activities, participants: p.participant_party_ids, ppe: p.ppe_confirmed, material_transformations: p.material_transformations ?? [], at: e.occurred_at });
        break;
      case "SAFETY_INCIDENT_REPORTED":
        s.incidents.set(p.incident_id, { id: p.incident_id, severity: p.severity, description: p.description, status: p.status, at: p.reported_at });
        break;
      case "WORK_SUBMITTED":
        s.submitted = { at: p.submitted_at, as_built_uri: p.as_built_uri, warranty_terms: p.warranty_terms };
        break;
      default:
    }
  }
  return s;
}

function foldFund(events) {
  const s = { id: events[0]?.aggregate_id, draws: [] };
  for (const e of events) {
    const p = e.payload;
    if (e.event_type === "MAINTENANCE_FUND_AGREED") {
      Object.assign(s, { artwork_id: p.artwork_id, shares: p.shares, per_case_cap: p.per_case_cap, effective_from: p.effective_from, doc: p.agreement_doc_uri });
    } else if (e.event_type === "MAINTENANCE_FUND_DRAWN") {
      s.draws.push({ case_id: p.case_id, amount: p.amount, purpose: p.purpose, by: p.approved_by_party_ids, at: p.drawn_at });
    }
  }
  return s;
}

function foldInspection(events) {
  const s = { artwork_id: events[0]?.aggregate_id, plan: null, inspections: [] };
  for (const e of events) {
    const p = e.payload;
    if (e.event_type === "INSPECTION_PLAN_SET") {
      s.plan = { cadence_months: p.cadence_months, owner_party_id: p.owner_party_id };
    } else if (e.event_type === "INSPECTION_COMPLETED") {
      s.inspections.push({ id: p.inspection_id, at: p.inspected_at, inspector: p.inspector_party_id, findings: p.findings, severity: p.severity, photos: p.photo_uris, linked_case: null });
    }
  }
  return s;
}

const OPEN = new Set(["open", "assigned", "quote_approved", "repair_done", "demolition_proposed", "demolition_approved"]);

function foldCase(events) {
  const s = { id: events[0]?.aggregate_id, artwork_id: null, status: "open", transfers: [], quote: null, responsible_snapshot: null, fund_snapshot: null, demolition: null, closed_reason: null };
  for (const e of events) {
    const p = e.payload;
    switch (e.event_type) {
      case "DAMAGE_REPORTED":
        Object.assign(s, { artwork_id: p.artwork_id, symptom: p.symptom, reporter: p.reported_by_party_id, opened_at: p.reported_at, source: p.source, inspection_id: p.inspection_id, responsible_snapshot: p.responsible_snapshot ?? null, fund_snapshot: p.fund_snapshot ?? null });
        break;
      case "REPAIR_ASSIGNED":
        s.status = "assigned";
        s.assignee = p.assignee_party_id;
        s.assignee_role = p.assignee_role;
        s.basis = p.basis;
        s.fund_id = p.fund_agreement_id;
        s.due_date = p.due_date;
        break;
      case "REPAIR_QUOTE_APPROVED":
        s.status = "quote_approved";
        s.quote = { amount: p.amount, shares: p.fund_share_snapshot, by: p.approved_by_party_ids };
        break;
      case "REPAIR_COMPLETED":
        s.status = "repair_done";
        s.completion = { at: p.completed_at, work_done: p.work_done, cost: p.cost, warranty_extension_months: p.warranty_extension_months };
        break;
      case "REPAIR_ACCEPTED":
        s.status = "closed";
        s.closed_reason = "repair_accepted";
        s.acceptance = { by: p.accepted_by_party_id, at: p.accepted_at, result: p.result };
        break;
      case "CASE_OWNERSHIP_TRANSFERRED":
        s.transfers.push({ from: p.from_party_id, to: p.to_party_id, reason: p.reason, at: p.transferred_at });
        s.assignee = p.to_party_id;
        break;
      case "DEMOLITION_PROPOSED":
        s.status = "demolition_proposed";
        s.demolition = { reason: p.reason, proposed_by: p.proposed_by_party_id, proposed_at: p.proposed_at };
        break;
      case "DEMOLITION_APPROVED":
        s.status = "demolition_approved";
        s.demolition = { ...s.demolition, approved_by: p.decision_party_ids, approved_at: p.approved_at, notices: p.notice_uris };
        break;
      case "DEMOLITION_COMPLETED":
        s.status = "closed";
        s.closed_reason = "demolished";
        s.demolition = { ...s.demolition, completed_at: p.completed_at, material_disposition: p.material_disposition, archived_uris: p.archived_uris };
        break;
      default:
    }
  }
  s.is_open = OPEN.has(s.status);
  return s;
}

const folders = {
  artwork: foldArtwork,
  site_agreement: foldSite,
  design_revision: foldDesign,
  contribution_record: foldContribution,
  construction_project: foldConstruction,
  fund_agreement: foldFund,
  inspection_record: foldInspection,
  maintenance_case: foldCase,
};

/** 把完整事件流归约为按聚合类型组织的状态表。 */
export function reduceAll(events) {
  const grouped = {};
  const states = {};
  for (const type of Object.keys(folders)) {
    grouped[type] = index(events.filter((e) => e.aggregate_type === type), type);
    states[type] = new Map();
    for (const [id, list] of grouped[type]) states[type].set(id, folders[type](list));
  }
  return states;
}

export function openCases(states) {
  return [...states.maintenance_case.values()].filter((c) => c.is_open);
}
