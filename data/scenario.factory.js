/**
 * 《稻浪墙》完整生命周期剧情事件流（地铁 B 口通道公共艺术墙）。
 * 纯数据构造器：版本号按聚合自增，可被测试与 data 快照生成共用。
 */

const CORRELATION = "flow-daolang-full-life";

class Stream {
  constructor() {
    this.events = [];
    this.versions = new Map();
    this.seq = 0;
  }

  add(type, aggregateType, aggregateId, at, summary, payload, actor, extra = {}) {
    const key = `${aggregateType}/${aggregateId}`;
    const version = (this.versions.get(key) ?? 0) + 1;
    this.versions.set(key, version);
    this.seq += 1;
    this.events.push({
      event_id: `evt-${String(this.seq).padStart(5, "0")}`,
      event_type: type,
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
      occurred_at: at,
      version,
      summary,
      actor: actor ? { party_id: actor } : undefined,
      payload,
      correlation_id: CORRELATION,
      ...extra,
    });
    return this;
  }
}

export const PARTIES = {
  school: "party-school",
  metro: "party-metro",
  community: "party-community",
  stewardship: "party-stewardship",
  stewardship2: "party-stewardship-team2",
  li: "party-teacher-li",
  zhou: "party-teacher-zhou",
  builder: "party-builder-hengyan",
  safety: "party-officer-zhao",
  chen: "party-resident-chen",
  wang: "party-resident-wang",
  mi: "party-student-mi",
  guardianMi: "party-guardian-mi",
};

export const IDS = {
  artwork: "artwork-daolang",
  site: "site-metro-line7-b-exit-wall",
  design: "design-daolang",
  contribution: "contribution-daolang",
  constructionV1: "construction-daolang-v1",
  constructionV2: "construction-daolang-v2",
  fund: "fund-daolang-001",
  inspection: "inspection-daolang",
  caseCrack: "case-2026-crack",
  caseTile: "case-2027-tile-loose",
  caseDemo: "case-2031-decommission",
  thresher: "material-old-thresher-01",
};

export function buildScenario() {
  const s = new Stream();
  const A = IDS.artwork;
  const P = PARTIES;

  /* ================= 1. 立项与场地许可 ================= */
  s.add("ARTWORK_REGISTERED", "artwork", A, "2025-03-03T09:00:00+08:00",
    "青禾学校在地课程项目《稻浪墙》立项，落地地铁7号线B口通道墙",
    { title: "稻浪墙", site_id: IDS.site, lead_school_party_id: P.school, coordinator_party_id: P.li, curriculum_term_id: "term-2025-spring", expected_lifetime_years: 6 },
    P.li);

  s.add("SITE_PERMIT_REQUESTED", "site_agreement", IDS.site, "2025-03-05T10:00:00+08:00",
    "学校向地铁站点管理部申请通道墙面使用许可",
    { site_id: IDS.site, site_owner_party_id: P.metro, applicant_party_id: P.school, footprint: "B口通道北侧墙面 12m×2.6m", use_period: "2025-04-01/2030-03-14" },
    P.li);
  s.add("SITE_PERMIT_GRANTED", "site_agreement", IDS.site, "2025-03-12T15:00:00+08:00",
    "场地许可获批：保通行、不破防水、半年一巡检，进场前须完成施工安全报备",
    { site_id: IDS.site, permit_no: "metro7-b-2025-017", valid_from: "2025-03-15", valid_to: "2030-03-14", obligations: ["保持通道净宽不小于1.8米", "不得破坏墙面防水层", "建成后每半年巡检一次"], require_safety_filing: true },
    P.metro);

  /* ================= 2. 访谈与公众意见 ================= */
  s.add("INPUT_COLLECTED", "site_agreement", IDS.site, "2025-03-16T09:30:00+08:00",
    "陈伯口述：村头打谷机是全队抢收时的中心，机声一响孩子都围过来",
    { input_id: "input-chen-thresher", kind: "interview", collected_by_party_id: P.zhou, participant_party_id: P.chen, themes: ["农耕记忆", "打谷机", "集体劳动"], media_uris: ["media-chen-audio-01"], content: "打谷机滚筒转起来，稻粒飞出来像金雨……", summary: "陈伯回忆打谷机与集体抢收" },
    P.zhou);
  s.add("INPUT_COLLECTED", "site_agreement", IDS.site, "2025-03-18T14:00:00+08:00",
    "王阿姨口述：晒谷场一片金黄，孩子们在谷堆间追跑",
    { input_id: "input-wang-sunning", kind: "interview", collected_by_party_id: P.zhou, participant_party_id: P.wang, themes: ["晒谷场", "丰收", "童年"], media_uris: ["media-wang-audio-01"], content: "放学路过晒谷场，金黄金黄的。", summary: "王阿姨回忆晒谷场童年" },
    P.zhou);
  s.add("INPUT_COLLECTED", "site_agreement", IDS.site, "2025-03-20T11:00:00+08:00",
    "学生小米访谈：每天放学经过这面墙，想看到风吹稻浪的样子",
    { input_id: "input-mi-ricewave", kind: "interview", collected_by_party_id: P.li, participant_party_id: P.mi, themes: ["放学路", "稻浪"], media_uris: ["media-mi-audio-01", "media-mi-photo-01"], content: "我想要墙像真的稻浪一样。", summary: "小米描述想象中的稻浪墙" },
    P.li);
  s.add("INPUT_COLLECTED", "site_agreement", IDS.site, "2025-03-24T18:00:00+08:00",
    "公众意见（联署86人中61人提及）：希望做发光网红字，方便夜间打卡",
    { input_id: "input-pub-neon", kind: "public_comment", collected_by_party_id: P.community, anon_label: "市民意见箱汇总", themes: ["夜间发光字", "打卡"], source_channel: "站点意见箱", summary: "多数公众留言希望做发光字" },
    P.community);
  s.add("INPUT_COLLECTED", "site_agreement", IDS.site, "2025-03-25T18:00:00+08:00",
    "公众意见：通道早晚人流密集，装饰物不能凸出墙面、不能有眩光",
    { input_id: "input-pub-passage", kind: "public_comment", collected_by_party_id: P.community, anon_label: "早晚通勤乘客", themes: ["通道净宽", "眩光", "通行安全"], source_channel: "居民议事会", summary: "通勤乘客关注通行与眩光安全" },
    P.community);
  s.add("PUBLIC_INPUT_SUMMARY_PUBLISHED", "site_agreement", IDS.site, "2025-03-30T17:00:00+08:00",
    "意见汇总发布：86条意见，发光字呼声最高；汇总仅为调查记录，不作为表决结论",
    { period: "2025-03-15/2025-03-29", comment_count: 86, themes: [["夜间发光字", 61], ["农耕记忆", 34], ["通行与眩光安全", 22], ["稻浪意象", 18]], note: "意见多少不自动决定方案，取舍由设计方结合场地安全与耐久性判断，并记录理由" },
    P.zhou);

  /* ================= 3. 设计修订与取舍 ================= */
  s.add("DESIGN_REVISION_PROPOSED", "design_revision", IDS.design, "2025-04-02T10:00:00+08:00",
    "设计第一稿：以稻浪浮雕为主体，嵌入旧打谷机构件",
    { artwork_id: A, revision_no: 1, based_on_input_ids: ["input-chen-thresher", "input-wang-sunning", "input-mi-ricewave", "input-pub-neon", "input-pub-passage"], proposal: "哑光陶粒浮雕稻浪+旧打谷机金属构件嵌入，不凸出墙面超过3cm" },
    P.zhou);
  s.add("DESIGN_TRADEOFF_RECORDED", "design_revision", IDS.design, "2025-04-05T10:00:00+08:00",
    "夜间效果取舍：发光字支持人数最多，但因眩光与行车视线安全未中选",
    { revision_no: 1, issue: "夜间视觉效果", options: [
      { option: "A-led-characters", support_count: 61, note: "发光网红字，夜间打卡效果强" },
      { option: "B-matte-relief", support_count: 18, note: "哑光陶粒稻浪，借站点照明反光柔和" },
      { option: "C-mirror-metal", support_count: 7, note: "镜面金属，眩光风险高" },
    ], chosen_option: "B-matte-relief", rationale: "通道紧邻行车区段，发光字与镜面材料将造成眩光；哑光浮雕在站点照明下可读且耐久。支持人数高不构成中选理由。", decided_by_party_id: P.zhou },
    P.zhou);
  s.add("DESIGN_DECIDED", "design_revision", IDS.design, "2025-04-08T16:00:00+08:00",
    "设计定稿：采纳稻浪与打谷机记忆、通行安全意见；不采纳发光字并书面说明理由",
    { revision_no: 1, decision: "定稿", adopted_input_ids: ["input-chen-thresher", "input-wang-sunning", "input-mi-ricewave", "input-pub-passage"], rejected_inputs: [{ input_id: "input-pub-neon", reason: "发光字在通道内形成眩光，且需外接电源，不满足场地安全义务" }], rationale: "公共艺术意见征集是设计输入而非方案表决；最终判断以场地安全义务、在地记忆代表性和耐久可维护性为准。", decided_by_party_id: P.zhou },
    P.zhou);

  /* ================= 4. 参与者、旧物权属与授权 ================= */
  const register = (id, kind, name, extra = {}) => s.add("CONTRIBUTOR_REGISTERED", "contribution_record", IDS.contribution, `2025-04-10T09:00:00+08:00`, `登记参与者：${name}`, { party_id: id, kind, display_name: name, ...extra });
  register(P.school, "school", "青禾学校");
  register(P.metro, "site_owner", "地铁集团站点管理部");
  register(P.community, "community_org", "荷花里社区居委会");
  register(P.stewardship, "stewardship_org", "街道公共空间养护站");
  register(P.li, "teacher", "李老师（课程负责教师）");
  register(P.zhou, "teacher", "周老师（设计指导）");
  register(P.builder, "contractor", "恒岩施工队");
  register(P.safety, "safety_officer", "赵师傅（专职安全员）");
  register(P.chen, "resident_donor", "陈伯（旧打谷机捐赠人）");
  register(P.wang, "resident", "王阿姨");
  register(P.mi, "student", "小米（在校学生，未成年）", { is_minor: true, guardian_party_id: P.guardianMi });
  register(P.guardianMi, "guardian", "小米家长（监护人）");

  s.add("CONTRIBUTION_AGREEMENT_SIGNED", "contribution_record", IDS.contribution, "2025-04-12T10:00:00+08:00",
    "陈伯签署捐赠与口述协议：捐赠旧打谷机，约定可署名并保留构件来源说明",
    { agreement_id: "agr-chen-donation", party_id: P.chen, roles: ["material_donor", "oral_narrator"], reuse_scope: "口述用于作品介绍、展览与档案；旧物按列明的改造方式使用", signed_at: "2025-04-12", doc_uri: "docs/agreements/agr-chen-donation.pdf" }, P.chen);
  s.add("CONTRIBUTION_AGREEMENT_SIGNED", "contribution_record", IDS.contribution, "2025-04-12T10:10:00+08:00",
    "王阿姨签署口述访谈协议",
    { agreement_id: "agr-wang-interview", party_id: P.wang, roles: ["oral_narrator"], reuse_scope: "口述用于作品介绍、展览与档案", signed_at: "2025-04-12", doc_uri: "docs/agreements/agr-wang.pdf" }, P.wang);
  s.add("CONTRIBUTION_AGREEMENT_SIGNED", "contribution_record", IDS.contribution, "2025-04-12T10:20:00+08:00",
    "学生参与协议（监护人签署）",
    { agreement_id: "agr-mi-participation", party_id: P.mi, roles: ["student_creator", "oral_narrator"], reuse_scope: "作品署名、介绍与展览", signed_at: "2025-04-12", doc_uri: "docs/agreements/agr-mi-guardian.pdf" }, P.guardianMi);
  s.add("CONTRIBUTION_AGREEMENT_SIGNED", "contribution_record", IDS.contribution, "2025-04-12T11:00:00+08:00",
    "施工队签署施工合同，载明保修义务",
    { agreement_id: "agr-builder-construction", party_id: P.builder, roles: ["constructor"], reuse_scope: "按图施工，竣工验收后两年保修", signed_at: "2025-04-12", doc_uri: "docs/agreements/agr-builder.pdf" }, P.builder);
  s.add("CONTRIBUTION_AGREEMENT_SIGNED", "contribution_record", IDS.contribution, "2025-04-12T11:20:00+08:00",
    "周老师签署设计指导协议",
    { agreement_id: "agr-zhou-design", party_id: P.zhou, roles: ["design_lead"], reuse_scope: "承担设计定稿取舍责任并按此署名", signed_at: "2025-04-12", doc_uri: "docs/agreements/agr-zhou.pdf" }, P.zhou);
  s.add("CONTRIBUTION_AGREEMENT_SIGNED", "contribution_record", IDS.contribution, "2025-04-12T11:30:00+08:00",
    "学校签署课程共创组织协议",
    { agreement_id: "agr-school-community", party_id: P.school, roles: ["curriculum_organizer", "co-creator"], reuse_scope: "课程共创成果的组织与署名", signed_at: "2025-04-12", doc_uri: "docs/agreements/agr-school.pdf" }, P.school);

  s.add("MATERIAL_DONATION_OFFERED", "contribution_record", IDS.contribution, "2025-04-13T09:00:00+08:00",
    "陈伯捐出家中旧打谷机，附现状照片",
    { material_id: IDS.thresher, donor_party_id: P.chen, object_name: "老式脚踏打谷机", provenance: "原荷花里生产队1982年分配使用，陈伯家保管至今", condition_photo_uri: "media/thresher-before.jpg" }, P.chen);
  s.add("MATERIAL_OWNERSHIP_VERIFIED", "contribution_record", IDS.contribution, "2025-04-15T09:00:00+08:00",
    "居委会核实旧打谷机权属：村集体分配登记与两位老邻居见证，权属归陈伯",
    { material_id: IDS.thresher, owner_party_id: P.chen, basis: "1982年生产队分配登记底册+长期占有事实", witness_party_ids: [P.wang, P.community] }, P.community);
  s.add("MATERIAL_ACCEPTED", "contribution_record", IDS.contribution, "2025-04-18T10:00:00+08:00",
    "旧打谷机验收入场，逐项列明捐赠人同意的改造方式；未列明者不得实施",
    { material_id: IDS.thresher, accepted_by_party_id: P.school, use_scope: "构件拆解后嵌入稻浪墙浮雕，作品介绍中标注来源", consented_transformations: ["清洁除油", "结构加固", "拆解为浮雕构件", "表面保留原木色与锈蚀痕迹"] },
    P.school);

  /* 影像与口述分别授权；未成年人两条授权各有监护人同意 */
  s.add("PARTICIPANT_AUTHORIZATION_GRANTED", "contribution_record", IDS.contribution, "2025-04-20T09:00:00+08:00",
    "陈伯授权口述录音用于介绍页、展览与新闻报道",
    { authorization_id: "auth-chen-oral", party_id: P.chen, subject_kind: "oral_history", scopes: ["intro_page", "exhibition", "press"], media_ids: ["media-chen-audio-01"], granted_at: "2025-04-20" }, P.chen);
  s.add("PARTICIPANT_AUTHORIZATION_GRANTED", "contribution_record", IDS.contribution, "2025-04-20T09:10:00+08:00",
    "小米影像授权（监护人单独同意）",
    { authorization_id: "auth-mi-image", party_id: P.mi, subject_kind: "image", scopes: ["intro_page", "exhibition"], media_ids: ["media-mi-photo-01"], granted_at: "2025-04-20", guardian_consent_id: "guardian-consent-mi-image-01" }, P.guardianMi);
  s.add("PARTICIPANT_AUTHORIZATION_GRANTED", "contribution_record", IDS.contribution, "2025-04-20T09:20:00+08:00",
    "小米口述授权（监护人另行单独同意，与影像授权互不替代）",
    { authorization_id: "auth-mi-oral", party_id: P.mi, subject_kind: "oral_history", scopes: ["intro_page", "exhibition"], media_ids: ["media-mi-audio-01"], granted_at: "2025-04-20", guardian_consent_id: "guardian-consent-mi-oral-01" }, P.guardianMi);
  s.add("PARTICIPANT_AUTHORIZATION_GRANTED", "contribution_record", IDS.contribution, "2025-04-20T09:30:00+08:00",
    "王阿姨授权口述录音使用",
    { authorization_id: "auth-wang-oral", party_id: P.wang, subject_kind: "oral_history", scopes: ["intro_page", "exhibition", "press"], media_ids: ["media-wang-audio-01"], granted_at: "2025-04-20" }, P.wang);

  s.add("CREDIT_DECIDED", "contribution_record", IDS.contribution, "2025-04-22T15:00:00+08:00",
    "署名初稿：每条署名均回指本人签署的协议",
    { artwork_id: A, version: 1, entries: [
      { party_id: P.chen, label: "旧物捐赠/口述：陈伯", agreement_id: "agr-chen-donation" },
      { party_id: P.wang, label: "口述：王阿姨", agreement_id: "agr-wang-interview" },
      { party_id: P.mi, label: "学生共创：小米等12名学生", agreement_id: "agr-mi-participation" },
      { party_id: P.zhou, label: "设计指导：周老师", agreement_id: "agr-zhou-design" },
      { party_id: P.builder, label: "施工：恒岩施工队", agreement_id: "agr-builder-construction" },
      { party_id: P.school, label: "课程组织：青禾学校", agreement_id: "agr-school-community" },
    ], decided_by_party_id: P.li }, P.li);

  /* ================= 5. 施工安全与建设 ================= */
  s.add("CONSTRUCTION_PLAN_FILED", "construction_project", IDS.constructionV1, "2025-04-23T10:00:00+08:00",
    "施工方案与安全措施报备，对应作品 v1",
    { construction_id: IDS.constructionV1, artwork_id: A, contractor_party_id: P.builder, safety_officer_party_id: P.safety, method_statement_uri: "docs/construction/v1-method.pdf", risk_assessment: ["高处作业系挂安全带", "切割作业设围挡", "夜间不施工"], for_version: 1 }, P.builder);
  s.add("SAFETY_FILING_APPROVED", "construction_project", IDS.constructionV1, "2025-04-24T14:00:00+08:00",
    "安全报备获批：学生仅参与非机械、非高处工序",
    { construction_id: IDS.constructionV1, approved_by_party_id: P.safety, conditions: ["切割区域围挡", "施工时段避让早晚高峰"], valid_until: "2025-08-31", minor_participation_arrangement: "未成年学生仅参与涂刷与拼贴，不接触切割机械与高处作业，全程教师陪同" }, P.safety);
  s.add("MAINTENANCE_FUND_AGREED", "fund_agreement", IDS.fund, "2025-04-26T10:00:00+08:00",
    "维修资金约定：地铁、学校、社区按比例分担，每次上限2万元",
    { fund_id: IDS.fund, artwork_id: A, shares: { [P.metro]: 0.5, [P.school]: 0.3, [P.community]: 0.2 }, per_case_cap: 20000, effective_from: "2025-04-26", agreement_doc_uri: "docs/fund/fund-agreement-v1.pdf" }, P.community);

  s.add("CONSTRUCTION_LOGGED", "construction_project", IDS.constructionV1, "2025-05-06T17:00:00+08:00",
    "施工日志：打谷机按同意范围清洁、加固并拆解为浮雕构件；学生小米参加拼贴工序",
    { construction_id: IDS.constructionV1, log_date: "2025-05-06", activities: ["打谷机清洁除油", "结构加固", "拆解为浮雕构件", "学生拼贴工作坊"], participant_party_ids: [P.builder, P.safety, P.mi], ppe_confirmed: true, material_transformations: [{ material_id: IDS.thresher, transformations: ["清洁除油", "结构加固", "拆解为浮雕构件"] }] }, P.safety);
  s.add("CONSTRUCTION_LOGGED", "construction_project", IDS.constructionV1, "2025-05-20T17:00:00+08:00",
    "施工日志：浮雕上墙，预埋件做防水处理",
    { construction_id: IDS.constructionV1, log_date: "2025-05-20", activities: ["浮雕上墙", "预埋件防水"], participant_party_ids: [P.builder, P.safety], ppe_confirmed: true }, P.safety);

  /* 旧物用途争议：实际做法超出原同意范围 → 核对与处置（不追认切割） */
  s.add("DISPUTE_FILED", "contribution_record", IDS.contribution, "2025-06-15T10:00:00+08:00",
    "陈伯现场发现打谷机滚筒被整体切割、机身被喷成蓝色，提出异议",
    { dispute_id: "dispute-2025-thresher-use", subject: "material_use", claimant_party_id: P.chen, claim: "只同意清洁、加固和拆解为浮雕构件并保留原色，未同意切割滚筒和整机改色" }, P.chen);
  s.add("MATERIAL_USE_RECONCILED", "contribution_record", IDS.contribution, "2025-06-20T15:00:00+08:00",
    "核对实际改造与原同意清单：两项越界；处置为恢复原色、更换铭牌、书面致歉，不追认切割",
    { material_id: IDS.thresher, actual_transformations: ["清洁除油", "结构加固", "拆解为浮雕构件", "切割滚筒", "整机喷涂蓝色"], within_consent: false, resolution: "外露机身恢复原木色处理，切割滚筒部位改用复刻构件，增加来源铭牌，施工队书面致歉；捐赠人不追认切割行为", resolved_by_party_ids: [P.school, P.community, P.chen] }, P.community);
  s.add("DISPUTE_RESOLVED", "contribution_record", IDS.contribution, "2025-06-20T16:00:00+08:00",
    "依据原捐赠协议与验收同意清单裁定：施工方越界，按和解方案执行",
    { dispute_id: "dispute-2025-thresher-use", ruling: "超出同意范围的改造构成违约", checked_agreement_ids: ["agr-chen-donation"], checked_authorization_ids: [], remedy: "恢复原色+复刻构件+来源铭牌+书面致歉", resolved_by_party_ids: [P.school, P.community] }, P.community);

  /* ================= 6. 验收、介绍页与发布 ================= */
  s.add("WORK_SUBMITTED", "construction_project", IDS.constructionV1, "2025-08-25T10:00:00+08:00",
    "施工方报验，承诺两年保修",
    { construction_id: IDS.constructionV1, submitted_at: "2025-08-25", as_built_uri: "docs/construction/v1-asbuilt.pdf", warranty_terms: "竣工验收之日起两年内非人为损坏由恒岩施工队免费维修" }, P.builder);
  s.add("WORK_ACCEPTED", "artwork", A, "2025-08-28T10:00:00+08:00",
    "学校、地铁与社区联合竣工验收通过，两年保修期起算",
    { construction_id: IDS.constructionV1, accepted_by_party_ids: [P.school, P.metro, P.community], warranty_until: "2027-08-31", warranty_covered_party_id: P.builder }, P.metro);
  s.add("INSPECTION_PLAN_SET", "inspection_record", IDS.inspection, "2025-08-28T11:00:00+08:00",
    "设定每半年巡检，责任人为学校（李老师）",
    { artwork_id: A, cadence_months: 6, owner_party_id: P.li }, P.school);
  s.add("ARTWORK_INFO_PUBLISHED", "artwork", A, "2025-08-30T10:00:00+08:00",
    "作品介绍页发布：列明采用的在地记忆、旧物材料与未采纳意见",
    { adopted_memory_input_ids: ["input-chen-thresher", "input-wang-sunning", "input-mi-ricewave"], adopted_material_ids: [IDS.thresher], excluded_input_ids: ["input-pub-neon"] }, P.school);
  s.add("PUBLICATION_RELEASED", "contribution_record", IDS.contribution, "2025-08-31T09:00:00+08:00",
    "落成展发布：所用影像与口述逐条登记授权",
    { publication_id: "pub-launch-exhibition", channel: "exhibition", media_ids: ["media-mi-photo-01", "media-chen-audio-01", "media-mi-audio-01", "media-wang-audio-01"], used_authorization_ids: ["auth-mi-image", "auth-chen-oral", "auth-mi-oral", "auth-wang-oral"], released_by_party_id: P.school, released_at: "2025-08-31" }, P.school);

  /* ================= 7. 课程结项与责任交接 ================= */
  s.add("MAINTENANCE_FUND_AGREED", "fund_agreement", IDS.fund, "2026-07-15T10:00:00+08:00",
    "课程结项前更新资金约定：养护站承接学校份额，约定随作品持续有效",
    { fund_id: IDS.fund, artwork_id: A, shares: { [P.metro]: 0.5, [P.stewardship]: 0.3, [P.community]: 0.2 }, per_case_cap: 20000, effective_from: "2026-07-15", agreement_doc_uri: "docs/fund/fund-agreement-v2.pdf" }, P.community);
  s.add("ARTWORK_HANDED_OVER", "artwork", A, "2026-07-16T10:00:00+08:00",
    "课程结项：作品保管责任由学校移交街道养护站；当时无未结案件，资金约定一并移交",
    { from_party_id: P.school, to_party_id: P.stewardship, reason: "2025春季在地课程结项，作品转为长期公共设施养护", open_case_ids: [], fund_agreement_id: IDS.fund }, P.school);
  s.add("INSPECTION_PLAN_SET", "inspection_record", IDS.inspection, "2026-07-16T11:00:00+08:00",
    "巡检责任人随交接变更为养护站",
    { artwork_id: A, cadence_months: 6, owner_party_id: P.stewardship }, P.stewardship);

  /* ================= 8. 落成一年：开裂报损（保修期内 → 施工方） ================= */
  s.add("INSPECTION_COMPLETED", "inspection_record", IDS.inspection, "2026-09-10T10:00:00+08:00",
    "巡检发现顶部接缝开裂约2米，建议立即报损",
    { inspection_id: "insp-2026-09", artwork_id: A, inspected_at: "2026-09-10", inspector_party_id: P.stewardship, findings: "顶部接缝纵向开裂约2米，有碎片脱落风险", severity: "high", photo_uris: ["media/crack-2026-09.jpg"] }, P.stewardship);
  s.add("DAMAGE_REPORTED", "maintenance_case", IDS.caseCrack, "2026-09-12T09:00:00+08:00",
    "居委会替社区报修墙面开裂；系统按保修状态自动带出责任人为施工方、资金为现行约定",
    { case_id: IDS.caseCrack, artwork_id: A, symptom: "顶部接缝纵向开裂约2米", reported_by_party_id: P.community, reported_at: "2026-09-12T09:00:00+08:00", source: "inspection", inspection_id: "insp-2026-09", photo_uris: ["media/crack-2026-09.jpg"],
      responsible_snapshot: { basis: "warranty", responsible_party_id: P.builder, warranty_until: "2027-08-31" },
      fund_snapshot: { fund_id: IDS.fund, shares: { [P.metro]: 0.5, [P.stewardship]: 0.3, [P.community]: 0.2 }, per_case_cap: 20000 } },
    P.community);
  s.add("REPAIR_ASSIGNED", "maintenance_case", IDS.caseCrack, "2026-09-16T10:00:00+08:00",
    "派修施工队履行保修责任（社区找学校、学校找施工方的扯皮由保修记录直接终结）",
    { case_id: IDS.caseCrack, assignee_party_id: P.builder, assignee_role: "施工单位（保修责任）", basis: "warranty", fund_agreement_id: IDS.fund, due_date: "2026-10-15" }, P.stewardship);
  s.add("REPAIR_QUOTE_APPROVED", "maintenance_case", IDS.caseCrack, "2026-09-20T10:00:00+08:00",
    "保修范围外的防水重做部分按资金约定分担，报价未超每次上限",
    { case_id: IDS.caseCrack, amount: 8600, fund_share_snapshot: { [P.metro]: 0.5, [P.stewardship]: 0.3, [P.community]: 0.2 }, approved_by_party_ids: [P.metro, P.stewardship, P.community] }, P.stewardship);
  s.add("MAINTENANCE_FUND_DRAWN", "fund_agreement", IDS.fund, "2026-09-21T10:00:00+08:00",
    "按约定份额拨付维修资金8600元",
    { fund_id: IDS.fund, case_id: IDS.caseCrack, amount: 8600, purpose: "接缝防水重做与浮雕复位", approved_by_party_ids: [P.metro, P.stewardship, P.community], drawn_at: "2026-09-21" }, P.stewardship);
  s.add("REPAIR_COMPLETED", "maintenance_case", IDS.caseCrack, "2026-10-08T16:00:00+08:00",
    "维修完工：清除松动层、重做防水、浮雕复位，保修期延长6个月",
    { case_id: IDS.caseCrack, completed_at: "2026-10-08T16:00:00+08:00", work_done: ["清除松动层", "接缝防水重做", "浮雕复位加固"], cost: 8600, warranty_extension_months: 6 }, P.builder);
  s.add("REPAIR_ACCEPTED", "maintenance_case", IDS.caseCrack, "2026-10-10T10:00:00+08:00",
    "维修验收通过，案件关闭（课程早已结项不影响案件存续与关闭）",
    { case_id: IDS.caseCrack, accepted_by_party_id: P.stewardship, accepted_at: "2026-10-10T10:00:00+08:00", result: "接缝平整、防水闭水试验合格、观感与原作一致" }, P.stewardship);

  /* 署名争议：核对原协议后补署 */
  s.add("DISPUTE_FILED", "contribution_record", IDS.contribution, "2026-11-02T09:00:00+08:00",
    "陈伯发现现场铭牌只写了学校与施工队，没有捐赠人与口述者，要求核对",
    { dispute_id: "dispute-2026-credit", subject: "credit", claimant_party_id: P.chen, claim: "按原协议应署名旧物捐赠/口述" }, P.chen);
  s.add("DISPUTE_RESOLVED", "contribution_record", IDS.contribution, "2026-11-08T15:00:00+08:00",
    "核对原签署协议后裁定补署，养护站两周内更换铭牌",
    { dispute_id: "dispute-2026-credit", ruling: "原协议明确署名权，初稿署名漏登", checked_agreement_ids: ["agr-chen-donation", "agr-wang-interview", "agr-mi-participation"], checked_authorization_ids: [], remedy: "更换铭牌补署捐赠人与口述者，介绍页同步更新", resolved_by_party_ids: [P.stewardship, P.community] }, P.stewardship);
  s.add("CREDIT_DECIDED", "contribution_record", IDS.contribution, "2026-11-08T16:00:00+08:00",
    "署名修订定稿，取代落成时的初稿",
    { artwork_id: A, version: 1, entries: [
      { party_id: P.chen, label: "旧物捐赠/口述：陈伯", agreement_id: "agr-chen-donation" },
      { party_id: P.wang, label: "口述：王阿姨", agreement_id: "agr-wang-interview" },
      { party_id: P.mi, label: "学生共创：小米等12名学生", agreement_id: "agr-mi-participation" },
      { party_id: P.zhou, label: "设计指导：周老师", agreement_id: "agr-zhou-design" },
      { party_id: P.builder, label: "施工/保修：恒岩施工队", agreement_id: "agr-builder-construction" },
      { party_id: P.school, label: "课程组织：青禾学校", agreement_id: "agr-school-community" },
    ], decided_by_party_id: P.stewardship, supersedes_event_id: undefined }, P.stewardship);

  /* ================= 9. 保修过期后：负责人调动，案件不丢 ================= */
  s.add("INSPECTION_COMPLETED", "inspection_record", IDS.inspection, "2027-09-20T10:00:00+08:00",
    "巡检发现边角瓷砖松动（保修已于2027-08-31到期）",
    { inspection_id: "insp-2027-09", artwork_id: A, inspected_at: "2027-09-20", inspector_party_id: P.stewardship, findings: "左下角饰面砖松动3块", severity: "low", photo_uris: ["media/tile-2027-09.jpg"] }, P.stewardship);
  s.add("DAMAGE_REPORTED", "maintenance_case", IDS.caseTile, "2027-09-22T09:00:00+08:00",
    "过保后报损：系统自动判定责任人为当前保管方养护站，资金仍按约定分担",
    { case_id: IDS.caseTile, artwork_id: A, symptom: "左下角饰面砖松动3块", reported_by_party_id: P.community, reported_at: "2027-09-22T09:00:00+08:00", source: "inspection", inspection_id: "insp-2027-09",
      responsible_snapshot: { basis: "custody", responsible_party_id: P.stewardship },
      fund_snapshot: { fund_id: IDS.fund, shares: { [P.metro]: 0.5, [P.stewardship]: 0.3, [P.community]: 0.2 }, per_case_cap: 20000 } },
    P.community);
  s.add("REPAIR_ASSIGNED", "maintenance_case", IDS.caseTile, "2027-09-25T10:00:00+08:00",
    "养护站承修（过保后保管责任）",
    { case_id: IDS.caseTile, assignee_party_id: P.stewardship, assignee_role: "保管方养护单位", basis: "custody", fund_agreement_id: IDS.fund, due_date: "2027-10-25" }, P.stewardship);
  s.add("CASE_OWNERSHIP_TRANSFERRED", "maintenance_case", IDS.caseTile, "2027-10-06T10:00:00+08:00",
    "养护站一组负责人调动，未结案件移交二组；只换责任人，不关闭案件",
    { case_id: IDS.caseTile, from_party_id: P.stewardship, to_party_id: P.stewardship2, reason: "养护站一组负责人工作调动", transferred_at: "2027-10-06T10:00:00+08:00" }, P.stewardship);
  s.add("ARTWORK_HANDED_OVER", "artwork", A, "2027-10-06T10:05:00+08:00",
    "作品保管责任同步移交养护站二组，交接单列明全部未结案件，资金分担主体不变",
    { from_party_id: P.stewardship, to_party_id: P.stewardship2, reason: "养护站一组负责人工作调动", open_case_ids: [IDS.caseTile], fund_agreement_id: IDS.fund }, P.stewardship);
  s.add("INSPECTION_PLAN_SET", "inspection_record", IDS.inspection, "2027-10-06T10:10:00+08:00",
    "巡检责任人随调动变更为二组",
    { artwork_id: A, cadence_months: 6, owner_party_id: P.stewardship2 }, P.stewardship2);
  s.add("REPAIR_QUOTE_APPROVED", "maintenance_case", IDS.caseTile, "2027-10-08T10:00:00+08:00",
    "二组接手后确认报价1200元",
    { case_id: IDS.caseTile, amount: 1200, fund_share_snapshot: { [P.metro]: 0.5, [P.stewardship]: 0.3, [P.community]: 0.2 }, approved_by_party_ids: [P.metro, P.stewardship2, P.community] }, P.stewardship2);
  s.add("MAINTENANCE_FUND_DRAWN", "fund_agreement", IDS.fund, "2027-10-09T10:00:00+08:00",
    "拨付1200元",
    { fund_id: IDS.fund, case_id: IDS.caseTile, amount: 1200, purpose: "松动饰面砖重新固定", approved_by_party_ids: [P.stewardship2], drawn_at: "2027-10-09" }, P.stewardship2);
  s.add("REPAIR_COMPLETED", "maintenance_case", IDS.caseTile, "2027-10-20T15:00:00+08:00",
    "二组完成维修",
    { case_id: IDS.caseTile, completed_at: "2027-10-20T15:00:00+08:00", work_done: ["松动饰面砖清除重贴", "勾缝处理"], cost: 1200, warranty_extension_months: 0 }, P.stewardship2);
  s.add("REPAIR_ACCEPTED", "maintenance_case", IDS.caseTile, "2027-10-22T10:00:00+08:00",
    "维修验收通过，案件关闭",
    { case_id: IDS.caseTile, accepted_by_party_id: P.community, accepted_at: "2027-10-22T10:00:00+08:00", result: "饰面砖牢固，勾缝平整" }, P.community);

  /* ================= 10. 重大改造 → 作品 v2 ================= */
  s.add("DESIGN_CHANGE_REQUESTED", "design_revision", IDS.design, "2028-03-01T10:00:00+08:00",
    "社区提议增设低照度洗墙灯呼应夜间稻浪（重大改造）",
    { change_request_id: "cr-2028-lighting", artwork_id: A, scope_class: "major", description: "顶部增设低照度防眩洗墙灯，不改动浮雕主体", requested_by_party_id: P.community }, P.community);
  s.add("DESIGN_CHANGE_REVIEWED", "design_revision", IDS.design, "2028-03-10T10:00:00+08:00",
    "评审通过：低眩光、不改变浮雕主体、电源走检修井；重大改造须形成新版本",
    { change_request_id: "cr-2028-lighting", scope_class: "major", approved: true, reviewed_by_party_id: P.zhou, rationale: "照明指标满足通道无眩光要求，浮雕本体不改动；属重大改造，开启作品 v2 后施工" }, P.zhou);
  s.add("ARTWORK_VERSION_OPENED", "artwork", A, "2028-03-12T10:00:00+08:00",
    "重大改造开启作品 v2《稻浪墙·夜光》",
    { new_version: 2, reason: "增设低照度洗墙灯", change_request_id: "cr-2028-lighting" }, P.stewardship);
  s.add("CONSTRUCTION_PLAN_FILED", "construction_project", IDS.constructionV2, "2028-04-02T10:00:00+08:00",
    "v2 施工方案报备，版本号与作品当前版本一致",
    { construction_id: IDS.constructionV2, artwork_id: A, contractor_party_id: P.builder, safety_officer_party_id: P.safety, method_statement_uri: "docs/construction/v2-method.pdf", risk_assessment: ["临电使用检修井电源", "高处作业平台车"], for_version: 2 }, P.builder);
  s.add("SAFETY_FILING_APPROVED", "construction_project", IDS.constructionV2, "2028-04-05T14:00:00+08:00",
    "v2 安全报备获批",
    { construction_id: IDS.constructionV2, approved_by_party_id: P.safety, conditions: ["平台作业区围挡", "停运电梯口导流"], valid_until: "2028-06-30", minor_participation_arrangement: null }, P.safety);
  s.add("CONSTRUCTION_LOGGED", "construction_project", IDS.constructionV2, "2028-04-20T22:00:00+08:00",
    "v2 施工：夜间停运窗口安装洗墙灯",
    { construction_id: IDS.constructionV2, log_date: "2028-04-20", activities: ["洗墙灯安装", "线缆穿检修井"], participant_party_ids: [P.builder, P.safety], ppe_confirmed: true }, P.safety);
  s.add("WORK_SUBMITTED", "construction_project", IDS.constructionV2, "2028-05-20T10:00:00+08:00",
    "v2 报验",
    { construction_id: IDS.constructionV2, submitted_at: "2028-05-20", as_built_uri: "docs/construction/v2-asbuilt.pdf", warranty_terms: "两年保修，含灯具" }, P.builder);
  s.add("WORK_ACCEPTED", "artwork", A, "2028-05-25T10:00:00+08:00",
    "v2 竣工验收通过，新一轮两年保修起算",
    { construction_id: IDS.constructionV2, accepted_by_party_ids: [P.stewardship, P.metro, P.community], warranty_until: "2030-05-25", warranty_covered_party_id: P.builder }, P.metro);

  /* ================= 11. 许可到期与正式拆除 ================= */
  s.add("SITE_PERMIT_CLOSED", "site_agreement", IDS.site, "2030-03-14T10:00:00+08:00",
    "场地许可到期未续（站点通道改造规划）",
    { site_id: IDS.site, reason: "许可期满，站点纳入无障碍改造规划" }, P.metro);
  s.add("INSPECTION_COMPLETED", "inspection_record", IDS.inspection, "2031-01-08T10:00:00+08:00",
    "巡检发现墙体基层整体失效、多处空鼓",
    { inspection_id: "insp-2031-01", artwork_id: A, inspected_at: "2031-01-08", inspector_party_id: P.stewardship2, findings: "墙体基层整体失效，浮雕多处空鼓，已无维修价值", severity: "high", photo_uris: ["media/inspect-2031-01.jpg"] }, P.stewardship2);
  s.add("DAMAGE_REPORTED", "maintenance_case", IDS.caseDemo, "2031-01-10T09:00:00+08:00",
    "报损：过保且场地许可到期，拟走拆除路径；系统仍自动带出责任人为保管方",
    { case_id: IDS.caseDemo, artwork_id: A, symptom: "墙体基层整体失效、多处空鼓", reported_by_party_id: P.stewardship2, reported_at: "2031-01-10T09:00:00+08:00", source: "inspection", inspection_id: "insp-2031-01",
      responsible_snapshot: { basis: "custody", responsible_party_id: P.stewardship2 },
      fund_snapshot: { fund_id: IDS.fund, shares: { [P.metro]: 0.5, [P.stewardship]: 0.3, [P.community]: 0.2 }, per_case_cap: 20000 } },
    P.stewardship2);
  s.add("DEMOLITION_PROPOSED", "maintenance_case", IDS.caseDemo, "2031-01-15T10:00:00+08:00",
    "养护站提议拆除：无维修价值且许可到期",
    { case_id: IDS.caseDemo, artwork_id: A, reason: "墙体基层整体失效无维修价值；场地许可到期，通道改造在即", proposed_by_party_id: P.stewardship2, proposed_at: "2031-01-15T10:00:00+08:00" }, P.stewardship2);
  s.add("ARTWORK_DECOMMISSION_APPROVED", "artwork", A, "2031-01-18T10:00:00+08:00",
    "地铁、养护站、社区共同批准正式拆除，明确打谷机残余构件去向",
    { reason: "无维修价值+许可到期", decision_party_ids: [P.metro, P.stewardship, P.community], material_disposition: "打谷机残余构件移交村史馆，其余构件安全清运" }, P.metro);
  s.add("DEMOLITION_APPROVED", "maintenance_case", IDS.caseDemo, "2031-01-22T10:00:00+08:00",
    "拆除方案获批并公示",
    { case_id: IDS.caseDemo, decision_party_ids: [P.metro, P.stewardship, P.community], approved_at: "2031-01-22T10:00:00+08:00", notice_uris: ["docs/demolition/notice-2031.pdf"] }, P.metro);
  s.add("DEMOLITION_COMPLETED", "maintenance_case", IDS.caseDemo, "2031-02-10T16:00:00+08:00",
    "拆除完成：打谷机残余构件入村史馆，全过程影像与口述档案归档",
    { case_id: IDS.caseDemo, completed_at: "2031-02-10T16:00:00+08:00", material_disposition: { [IDS.thresher]: "残余构件移交荷花里村史馆陈列", other: "不可用构件安全清运" }, archived_uris: ["archive/daolang-asbuilt.zip", "archive/daolang-interviews.zip"] }, P.stewardship2);
  s.add("ARTWORK_DECOMMISSIONED", "artwork", A, "2031-02-11T10:00:00+08:00",
    "作品生命周期终结，档案留存",
    { demolition_case_id: IDS.caseDemo, archived_uris: ["archive/daolang-asbuilt.zip", "archive/daolang-interviews.zip", "archive/daolang-credits.pdf"] }, P.stewardship);

  return s.events;
}
