# 公共艺术共创养护

把公共艺术从一次性教学成果变成可持续管理的完整系统：从场地许可、共创、施工、验收，到巡检、维修、最终拆除，每一步都留下可核对的事实记录。课程结束或负责人调动不会让未结维修丢失；任何署名或传播争议都能核对原授权。

## 生命周期与事件目录

四类业务对象（聚合）承载全部公共事件，语义保持稳定：

| 聚合 | 职责 |
| --- | --- |
| `site_agreement` | 场地许可、责任与资金约定、移交、正式拆除 |
| `design_revision` | 访谈与公众意见、设计定稿与取舍、旧物权属、作品版本、作品介绍页 |
| `contribution_record` | 参与者授权、贡献署名、争议核对 |
| `maintenance_case` | 施工安全、竣工验收、巡检、报损、预算、派单、维修验收 |

| 生命周期阶段 | 事件类型 | 聚合 |
| --- | --- | --- |
| 场地许可 | `SITE_PERMISSION_GRANTED` | site_agreement |
| 责任与资金约定 | `STEWARDSHIP_TERMS_SET` | site_agreement |
| 课程结束 / 负责人调动移交 | `CUSTODY_TRANSFERRED` | site_agreement |
| 最终拆除 | `DECOMMISSION_DECIDED` | site_agreement |
| 访谈与公众意见 | `INPUT_COLLECTED` | design_revision |
| 设计修订及取舍理由 | `DESIGN_DECIDED` | design_revision |
| 旧物权属与改造范围 | `MATERIAL_ACCEPTED` | design_revision |
| 作品版本（重大改造） | `WORK_VERSION_PUBLISHED` | design_revision |
| 作品介绍页 | `WORK_PROFILE_PUBLISHED` | design_revision |
| 参与者授权 / 撤销 | `CONSENT_GRANTED` / `CONSENT_REVOKED` | contribution_record |
| 贡献署名 | `ATTRIBUTION_RECORDED` | contribution_record |
| 署名或传播争议 | `DISPUTE_RAISED` / `DISPUTE_RESOLVED` | contribution_record |
| 施工安全 | `SAFETY_CLEARED` | maintenance_case |
| 竣工验收 | `WORK_ACCEPTED` | maintenance_case |
| 巡检 | `INSPECTION_LOGGED` | maintenance_case |
| 报损 | `DAMAGE_REPORTED` | maintenance_case |
| 预算 | `REPAIR_BUDGETED` | maintenance_case |
| 维修派单 | `REPAIR_ASSIGNED` | maintenance_case |
| 维修验收 | `REPAIR_ACCEPTED` | maintenance_case |

## 信封约定

事件由 `event_id` 唯一标识，`aggregate_id` 指向业务对象，`version` 按聚合从 1 开始递增，`occurred_at` 保留真实发生时间。来源系统重试时必须沿用原事件标识：内容一致的重复事件幂等跳过，内容不一致视为冲突。

## 领域规则

- **R1 意见多少不能自动替代设计判断**：`DESIGN_DECIDED` 必须记录取舍理由（采纳与否决），被否决方案即使意见数最多也须说明为何不采纳。
- **R2 未成年人影像与口述记忆分别授权**：授权按 `minor_image` / `oral_history` / `attribution` / `dissemination` / `material_donation` 分范围登记，互不替代；未成年人授权须监护人签署；访谈须引用提供者本人的 `oral_history` 授权。
- **R3 作品重大改造形成新版本**：`WORK_VERSION_PUBLISHED` 的 `major` 变更使版本号递增，`minor` 调整不另立版本；版本须关联设计定稿。
- **R4 未结维修不因课程结束或负责人调动丢失**：`CUSTODY_TRANSFERRED` 必须列出全部未结案件，遗漏即拒绝；移交只更换责任人，案件原样保留。
- **R5 报损单自动带出当前责任人与资金约定**：`DAMAGE_REPORTED` 的 `responsible_steward` 与 `funding_terms` 须与登记时的约定一致，可用 `deriveDamageReport` 生成。
- **R6 作品介绍页说明采用了哪些在地记忆与材料**：`WORK_PROFILE_PUBLISHED` 的引用必须真实存在。
- **R7 署名或传播争议可核对原授权**：署名须对应有效授权；`DISPUTE_RESOLVED` 结案必须引用原授权或原约定，可用 `disputeEvidence` 核对。
- **R8 案件存续到维修验收或正式拆除**：维修案件只能经 `REPAIR_ACCEPTED` 结案，或由 `DECOMMISSION_DECIDED` 终结；拆除后不能再登记养护事件。

## 派生查询

- `openCases(state)`：当前未结案件（建设期、在役、维修中）。
- `currentSteward(state)`：当前日常责任人。
- `deriveDamageReport(state)`：报损单自动带出的责任人与资金约定。
- `workProfileView(ledger)`：作品介绍页视图（采用的在地记忆、材料与署名）。
- `disputeEvidence(ledger, disputeId)`：争议及其结案所核对的原授权或原约定。

## 领域资料

- `contracts/domain.schema.json`：事件信封、事件类型与各 payload 结构。
- `data/sample.json`：一条可用于本地联调的中文样例。
- `data/subway-wall-scenario.json`：地铁艺术墙全生命周期事件流（许可→共创→验收→移交→开裂报修→争议→预算派单）。
- `src/validator.js`：信封与 payload 结构校验。
- `src/projector.js`：事件流折叠与领域规则执行。
- `src/domain.ts`：领域类型定义。
- `tests/`：契约、场景回放与领域规则测试。

## 本地检查

运行 `node --test`。
