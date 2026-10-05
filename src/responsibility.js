/**
 * 报损立案时的责任与资金派生。
 * 规则集中在此：报损单不允许手工填写责任人口径，由系统按发生时点的
 * 保修状态、交接链与生效中的资金约定自动带出（形成快照，冻结在事件中）。
 */

function artworkAt(artwork, at) {
  const t = Date.parse(at);
  let custodian = artwork.initial_custodian_party_id ?? artwork.custodian_party_id;
  for (const h of artwork.handovers ?? []) {
    if (Date.parse(h.at) <= t) custodian = h.to;
  }
  let activeWarranty = null;
  const accepted = (artwork.warranties ?? []).filter((w) => Date.parse(w.accepted_at) <= t);
  const latest = accepted[accepted.length - 1];
  if (latest && Date.parse(latest.until) >= t) activeWarranty = latest;
  return { custodian_party_id: custodian, warranty: activeWarranty };
}

export function deriveResponsible(artwork, reportedAt) {
  const view = artworkAt(artwork, reportedAt);
  if (view.warranty) {
    return { basis: "warranty", responsible_party_id: view.warranty.covered_party_id, warranty_until: view.warranty.until };
  }
  return { basis: "custody", responsible_party_id: view.custodian_party_id };
}

/** 找到指定作品在某一时点生效的最新一份维修资金约定。 */
export function fundAt(states, artworkId, at) {
  const t = Date.parse(at);
  let hit = null;
  for (const f of states.fund_agreement.values()) {
    if (f.artwork_id !== artworkId) continue;
    if (f.effective_from && Date.parse(f.effective_from) > t) continue;
    if (!hit || Date.parse(f.effective_from) > Date.parse(hit.effective_from)) hit = f;
  }
  return hit;
}

export function deriveFundSnapshot(states, artworkId, reportedAt) {
  const f = fundAt(states, artworkId, reportedAt);
  if (!f) return null;
  return { fund_id: f.id, shares: f.shares, per_case_cap: f.per_case_cap };
}

/** 报损单自动带出内容：当前责任人 + 资金约定。 */
export function deriveDamageSnapshots(states, artworkId, reportedAt) {
  const artwork = states.artwork.get(artworkId);
  if (!artwork) return null;
  return {
    responsible_snapshot: deriveResponsible(artwork, reportedAt),
    fund_snapshot: deriveFundSnapshot(states, artworkId, reportedAt),
  };
}
