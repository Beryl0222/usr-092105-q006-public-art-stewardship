# 公共艺术共创养护

把公共艺术从“一次性教学成果”变成**可持续管理系统**：贯通场地许可、访谈与公众意见、设计修订与取舍、旧物权属、参与者授权、施工安全、贡献署名、竣工验收、巡检、预算、维修与最终拆除；课程结项或负责人调动都不能让未结维修丢失。

设计依据见 [`docs/系统设计.md`](docs/系统设计.md)。

## 核心约定

- **事件溯源**：每个决定、每份同意、每次交接都是不可删除的领域事件。事件由 `event_id` 唯一标识，`aggregate_id` 指向业务对象，`version` 在同一聚合上从 1 连续递增，`occurred_at` 保留真实发生时间；来源系统重试沿用原事件标识。
- **公共语义稳定**：保留 `site_agreement`、`design_revision`、`contribution_record`、`maintenance_case` 四个公共聚合及 `INPUT_COLLECTED`、`DESIGN_DECIDED`、`MATERIAL_ACCEPTED`、`REPAIR_ASSIGNED` 等事件语义；另增 artwork、施工、资金、巡检聚合覆盖全生命周期。
- **意见不等于表决**：意见汇总只作调查记录；设计中选必须记录取舍理由，支持人数高不自动中选。
- **影像/口述分别授权**：未成年人两类授权各需监护人同意；撤回一类不影响另一类。
- **旧物改造以同意清单为界**：先确权后验收，超范围施工被拦截，须追加同意；事后可核对实际用途。
- **重大改造形成新版本**：评审通过后作品版本 +1，再按新版本施工。
- **报损单自动带出责任与资金**：保修期内→施工方，过保→当前保管方；资金按生效约定分担，不允许手填口径。
- **案件两种关闭方式**：维修验收通过，或正式拆除完成；交接必须列明全部未结案件。

## 目录

- `contracts/event-catalog.json`：事件—聚合配对与各事件 payload 必填项（事实清单）。
- `contracts/domain.schema.json`：公共事件信封。
- `src/validator.js`：信封与目录校验（中文错误）。
- `src/reducers.js`：事件流 → 各聚合当前状态。
- `src/policies.js`：跨聚合业务不变量（追加事件前校验）。
- `src/responsibility.js`：责任人与资金的时间感知派生。
- `src/projections.js`：报损单草稿、作品介绍页、授权核对、未结案件看板、旧物链路、取舍报告。
- `data/scenario.factory.js` / `scenario-daolang.json`：地铁艺术墙《稻浪墙》六年完整剧情（90 个事件）。
- `tests/`：契约、完整生命周期与策略反例测试。

## 本地检查

```bash
npm test          # node --test，40 项测试
```
