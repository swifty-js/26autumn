# AI 小万「条件任务」与「定时任务」技术亮点分析

## 一、项目背景与技术栈

ai-xiaowan 是一个基于 Lark + Brix 框架构建的 AI 智能投放助手前端项目。Lark 是阿里内部的 SPA 框架，提供 View 生命周期管理、模板引擎、VOM（View Object Model）嵌套等基础能力；Brix 则是构建在 Lark 之上的配置驱动组件系统，通过 ADC（Application Design Configuration）JSON 配置树描述页面组件结构，将数据逻辑（Handler）与视图逻辑（Comp）彻底分离。

「条件任务」和「定时任务」是任务中心（taskcenter）模块的两大核心功能。条件任务基于业务规则触发（如"当 ROI 低于 2 时自动降低出价"），定时任务基于时间调度触发（如"每天早上 9 点生成投放报告"）。两者共享相似的架构模式，但在触发机制、配置模型和创建流程上各有特色。

---

## 二、整体架构设计

### 2.1 三层视图嵌套结构

任务模块采用「容器 View → Brix SubPage → 功能组件」的三层嵌套：

```
condition.ts / schedule.ts          ← 容器 View（路由/模式切换）
  └─ lark-ports/brix/comps/subPage ← Brix 子应用（ADC 配置驱动）
       ├─ mx_task_count             ← 计数组件
       ├─ mx_condition_search       ← 搜索组件
       ├─ mx_task_table             ← 列表表格组件
       └─ mx_template               ← 模板推荐组件
```

容器 View（condition.ts / schedule.ts）职责极为精简：创建 Brix 实例、管理 list/workspace 两种页面模式、监听子 View 事件。所有业务逻辑下沉到 Brix Handler 层。

### 2.2 Handler/Comp 分离的数据流

Brix 框架的核心设计是单向数据管道：

```
用户事件 → Comp 事件处理器 → this.handleUpdate({action, params})
    → Handler.update() 处理 + Service.fetch 请求
    → 返回 { data: { [code]: value }, ...viewFields }
    → 框架写入 Brix Store + 同步 viewFields 到 Comp updater
    → Comp 自动重渲染
```

Handler 是纯数据对象（非 View），不能调用任何视图方法（alert、gmessage 等），只能通过返回值中的 mx_brix_exception 字段委托框架展示错误。这一约束确保了数据逻辑的可测试性和可移植性。

### 2.3 API 接口体系

任务中心共注册了 20+ 个后端接口，按领域划分为三组：

- conditionTask 系列：create / update / delete / state_update / detail / page / count / status_summary / execute_page / execute_feedback / template_list
- scheduleTask 系列：create / update / delete / state_update / detail / page / count / status_summary / execute_page / execute_feedback / template_list
- channelScheduleTask 系列：batch_create / batch_update / query / batch_save / enabled_check / delete / state_update / binding_query

所有接口统一使用 POST + isJson: true 的调用约定，通过 Service.fetch 数组形式批量请求。

---

## 三、条件任务实现分析

### 3.1 容器 View 的状态机设计

condition.ts 通过 pageMode 字段实现了一个轻量状态机：

```typescript
// 两种模式：list（Brix 列表页）/ workspace（AI 工作台）
this.updater.set({
  pageMode: "list",
  workspaceTaskId: null,
});
```

模板层通过 CSS display 控制切换，而非销毁/重建 DOM：

```html
<div class="{{= pageMode == 'workspace' ? 'none' : ''}}">
  <!-- Brix SubPage 列表 -->
</div>
{{if pageMode == 'workspace'}}
<!-- AI 工作台子 View -->
{{/if}}
```

列表区域使用 class 隐藏而非 if 条件移除，保留了 Brix 实例和 DOM 状态，从工作台返回时无需重新初始化整个 Brix 子应用，避免了重复的接口请求和渲染开销。

### 3.2 条件任务列表 Handler 的写操作模式

mx_condition_task_table.h.ts 中设计了一套优雅的写操作抽象：

```typescript
async function runListAction(handler, { adcConfig, context, otherViewData }, models) {
    try {
        await Service.fetch(models);                    // 执行写操作
        const result = await handler.process({ adcConfig, context }); // 刷新列表
        return { ...result, actionError: "" };
    } catch (error) {
        return buildActionFailResult(otherViewData, ...); // 失败时保留当前列表快照
    }
}
```

这个模式的技术亮点在于：

1. 写操作与列表刷新原子化：先执行写请求，成功后立即重新拉取列表，保证 UI 与服务端状态一致
2. 失败回退到快照：通过 getListSnapshot 从 otherViewData 中恢复当前列表数据，写操作失败不会导致列表闪烁或数据丢失
3. 跨组件计数联动：写操作成功后调用 fetchTaskCount() 并通过 buildCountStoreData 将新计数写入 Brix Store 的 mx_condition_task_count 键，触发计数组件自动更新

### 3.3 条件任务创建弹窗：ADC 配置驱动的动态表单

conditionDlg.ts 是条件任务创建/编辑的弹窗容器，其最大亮点是完全由 ADC 配置驱动表单渲染：

```typescript
await this.initBrixNew(
  patchChannelRemindTipOnAdc(
    (
      await this.getViewConfig(
        {
          needSkipFilterMapProcess: true,
          componentCode: "m_manage_condition_task_create",
        },
        100000,
      )
    )?.rootItem,
  ) || "m_manage_condition_task_create",
  { data: initData || {} },
);
```

技术要点：

1. 远程 ADC 配置获取：通过 getViewConfig 从配置平台拉取表单结构（componentCode: m_manage_condition_task_create），表单字段的增删改不需要发版
2. ADC 树动态补丁：patchChannelRemindTipOnAdc 函数遍历 ADC 配置树，为「消息渠道」节点注入 description 提示文案，实现了运行时的配置增强
3. Brix v3 版本声明：createBrixIns 时显式指定 { version: 'v3' }，启用最新的 Brix 引擎
4. 编辑模式的数据预填：先通过 fetchTaskDetail 拉取任务详情，再通过 mapTaskDetailToInitData 映射为 Brix 表单初始值

check() 方法中的表单校验同样利用了 Brix 的能力：

```typescript
const subOk = await this.getSubViewValue([`form_comp_${viewId}_formLayout`]);
if (!subOk.ok) return { ok: false, msg: subOk.msg.join(";") };
const formData = brixIns.getValue() || {};
```

通过 getSubViewValue 触发 Brix 子页面内所有表单组件的校验，再从 brixIns.getValue() 一次性获取全部表单数据，无需逐字段收集。

### 3.4 条件任务的数据模型

条件任务的核心数据结构：

```typescript
interface TaskItem {
  taskId: number;
  taskName: string;
  status: number; // 1 开启，0 暂停
  operateTypeDesc: string; // 执行动作描述
  executeTimes: number; // 今日执行次数
  lastRunTime: string;
  conditionMessage: string; // 触发条件文案（自然语言）
  operationList: OperationItem[]; // 动态操作按钮
  showTagList: TagItem[];
}
```

与定时任务不同，条件任务的触发条件是自然语言描述（conditionMessage），如"当计划 ROI 连续 3 天低于目标值时"，这反映了条件任务由 AI Agent 理解用户意图后生成的产品特性。

---

## 四、定时任务实现分析

### 4.1 调度配置解析器

mx_task_table.h.ts 中的 parseScheduleText 是一个设计精巧的配置解析器，将结构化的 CRON 配置映射为可读中文：

```typescript
function parseScheduleText(scheduleConfig: ScheduleConfig): string {
  switch (frequency) {
    case "ONCE":
    case "NO_REPEAT":
      return "不重复";
    case "DAILY":
      return time ? `每天 ${time}` : "每天";
    case "HOURLY":
      return minute !== undefined ? `每小时第 ${minute} 分钟` : "每小时";
    case "WEEKLY":
      return `每周 ${days} ${time}`;
    case "MONTHLY":
      return `每月 ${days} 日 ${time}`;
    case "INTERVAL":
      return `每隔 ${interval} ${intervalUnit}`;
    default:
      return "自定义配置";
  }
}
```

设计亮点：

1. 解析在 Handler 层完成，Comp 和模板只消费最终的 scheduleText 字符串，职责边界清晰
2. weekDays 同时支持数字（1-7）和英文缩写（MON-SUN）两种格式，通过 dayMap 统一映射，兼容后端不同版本的返回格式
3. 每个 case 都有降级策略（缺少 time 时只返回频率描述），不会因字段缺失而崩溃
4. default 分支返回"自定义配置"兜底，确保未来新增频率类型时前端不会报错

### 4.2 定时任务创建弹窗：频率联动的状态管理

create-scheduled-task-modal.ts 实现了 6 种调度频率（ONCE / DAILY / WEEKLY / MONTHLY / HOURLY / INTERVAL）的表单联动，其核心是 getDefaultsForFrequency 函数：

```typescript
function getDefaultsForFrequency(frequency: string) {
  const defaults = {
    date: "",
    time: "",
    weekDays: [],
    monthDay: "",
    minute: "",
    interval: "",
  };
  switch (frequency) {
    case "ONCE":
      defaults.date = currentDate();
      defaults.time = currentTime();
      break;
    case "DAILY":
      defaults.time = currentTime();
      break;
    case "WEEKLY":
      defaults.weekDays = [currentWeekDay()];
      defaults.time = currentTime();
      break;
    case "MONTHLY":
      defaults.monthDay = currentMonthDay();
      defaults.time = currentTime();
      break;
    case "HOURLY":
      defaults.minute = 0;
      break;
    case "INTERVAL":
      defaults.interval = 12;
      break;
  }
  return defaults;
}
```

当用户切换频率类型时，changeFrequency 事件处理器先清理所有频率相关字段，再填充新频率的默认值：

```typescript
"changeFrequency<change>"() {
    const { formData } = this.updater.get();
    const defaults = getDefaultsForFrequency(formData.frequency);
    this.updater.set({
        formData: { ...formData, ...defaults },
    });
    this.updater.digest();
}
```

这避免了频率切换后残留旧字段值的问题（如从"每周"切到"每天"后 weekDays 仍有值）。

### 4.3 时区感知的时间处理

create-scheduled-task-modal.ts 中的时间函数全部基于 UTC+8 手动偏移：

```typescript
function currentTime() {
  const d = new Date(Date.now() + 8 * 3600000);
  return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
```

这种实现确保了无论用户浏览器处于什么时区，默认时间始终为北京时间，与后端调度系统的时区约定（Asia/Shanghai）保持一致。normalizeTime 函数还处理了 HH:mm:ss 与 HH:mm 之间的格式转换（mx-time 组件返回秒级精度，API 要求分钟级精度）。

### 4.4 创建/编辑双模式复用

同一个弹窗 View 通过 mode 字段区分创建和编辑：

```typescript
const isEdit = mode === "edit";
const apiName = isEdit
  ? "ai_taskcenter_scheduleTask_update_post"
  : "ai_taskcenter_scheduleTask_create_post";
```

编辑模式下，Comp 先通过 Handler 的 fetchDetail action 拉取任务详情：

```typescript
case "fetchDetail": {
    const [model] = await Service.fetch([
        { name: "ai_taskcenter_scheduleTask_detail_post", ... }
    ]);
    (res as any)._editDetail = detail || null;
    break;
}
```

详情数据通过 _editDetail 字段挂载到 Handler 返回值中，Comp 从 updater 读取后传入 mxModal。这种通过 Handler 中转详情请求的模式，保持了"Comp 不直接调接口"的 Brix 规范。

### 4.5 多渠道通知配置

定时任务支持三种通知渠道（钉钉 / 微信 / 站内信），通过 checkbox 多选：

```typescript
channelList: [
    { value: "DingDing", text: "钉钉" },
    { value: "WeChat", text: "微信", tip: "受微信侧限制，需1天内与微信clawbot对话过..." },
    { value: "site", text: "站内信" },
],
```

渠道数据经过正向映射（前端 → 接口）和反向映射（接口 → 前端）的双向转换：

```typescript
// 创建时：前端 → 接口
const CHANNEL_MAP = { dingding: "DingDing", wechat: "WeChat", site: "site" };
// 编辑回填时：接口 → 前端
const CHANNEL_REVERSE_MAP = {
  DingDing: "DingDing",
  WeChat: "WeChat",
  site: "site",
};
```

提交时还通过 Set 去重，防止用户多次操作产生重复渠道。

---

## 五、AI 工作台：任务执行日志系统

### 5.1 并行数据加载

ai_condition_workspace.ts / ai_schedule_workspace.ts 的 render 方法使用 Promise.all 并行加载概览数据和日志列表：

```typescript
async render() {
    this.updater.digest({ loading: true });
    await Promise.all([
        this.loadSummary(),
        this.loadLogList(),
    ]);
    this.updater.digest({ loading: false });
}
```

两个接口（status_summary 和 execute_page）互不依赖，并行请求减少了页面加载时间。loading 状态在两个请求都完成后才关闭，避免了局部闪烁。

### 5.2 执行日志的乐观更新投票

日志列表支持用户对每条 AI 执行结果进行点赞/点踩反馈。投票处理采用了乐观更新策略：

```typescript
'vote<click>'(e) {
    this.fetch([{ name: '..._execute_feedback_post', params: { taskId, executeId, feedback } }],
    (err, m) => {
        if (err) { /* 错误提示 */ return; }
        // 成功后局部更新列表项，不重新拉取整个列表
        const nextList = [...(logList || [])];
        nextList[index] = { ...nextList[index], voteType: Number(voteType) };
        this.updater.digest({ logList: nextList });
    });
}
```

技术要点：

1. 通过 index 精确定位列表项，只更新被操作的那一条数据
2. 使用展开运算符创建新数组和新对象，确保 Lark updater 的变更检测能正确触发重渲染
3. 投票状态（voteType: 0/1/2）在模板中通过三态 if-else 渲染不同的按钮样式（未投票/已赞/已踩）

### 5.3 日期范围筛选与时间格式化

工作台默认展示最近 14 天的日志：

```typescript
const end = new Date();
const start = new Date();
start.setDate(start.getDate() - 14);
```

parseExecuteTime 函数将 ISO 格式的执行时间解析为友好的展示格式：

```typescript
function parseExecuteTime(executeTime?: string) {
  const [datePart, timePart = ""] = executeTime.split(" ");
  // "2026-08-13" → "8月13日"
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const [, month, day] = datePart.split("-");
    date = `${Number(month)}月${Number(day)}日`;
  }
  // "14:30" → "14:30:00"
  const time = timePart.length === 5 ? `${timePart}:00` : timePart || "--";
  return { time, date };
}
```

该函数作为 updater 数据传入模板，在模板中直接调用：`{{= parseExecuteTime(item.executeTime).time}}`，这是 Lark 模板引擎支持函数引用的特性。

### 5.4 状态标签的动态样式映射

mapStatusTagClass 函数根据后端返回的 statusShowTag 动态映射 CSS 类名：

```typescript
function mapStatusTagClass(statusShowTag?) {
  const color = String(statusShowTag.color || "").toLowerCase();
  const code = String(statusShowTag.code || "").toLowerCase();
  if (color === "green" || code === "success" || code === "start")
    return "@scoped.style:status-success";
  if (color === "red" || code === "fail" || code === "pause")
    return "@scoped.style:status-fail";
  return "@scoped.style:status-pending";
}
```

同时支持 color 和 code 两种判断维度，兼容后端不同版本的标签格式。返回值使用 Lark 的 `@scoped.style:className` 语法，确保 LESS 模块化编译后的类名正确引用。

---

## 六、跨组件通信机制

### 6.1 Brix Store 共享数据

同一 Brix SubPage 内的组件通过 Store 键值对通信。例如，搜索组件将条件写入 Store：

```
mx_condition_search → Store["mx_condition_search"] = { searchValue: "xxx" }
```

列表组件在 process 中读取：

```typescript
const searchData = context?.getValue?.("mx_condition_search");
if (searchData?.searchValue) {
  params.taskNameLike = String(searchData.searchValue).trim();
}
```

计数组件将数据写入 Store 后，列表组件也能感知：

```typescript
const data = context?.getValue?.("mx_task_count") || {};
```

### 6.2 Lark.dispatch 事件冒泡

跨 Vframe 层级的通信使用 Lark.dispatch 自定义事件：

```typescript
// 子组件（mx_task_table Comp）向上派发事件
(Lark as any).dispatch(document.getElementById(this.id), "openAiWorkspace", {
    data: { taskId },
});

// 容器 View（condition.ts）监听事件
'openAiWorkspace<openAiWorkspace>'(e) {
    const taskId = e.originalEvent?.data?.taskId;
    this.updater.digest({ pageMode: 'workspace', workspaceTaskId: taskId });
}
```

模板层通过 mx-openAiWorkspace 属性声明事件监听：

```html
<div
  mx-openAiWorkspace="openAiWorkspace()"
  mx-backToConditionList="backToConditionList()"
></div>
```

这种事件冒泡机制使得深层嵌套的 Brix 组件能够与顶层容器 View 通信，而无需逐层传递回调函数。

### 6.3 写操作后的计数组件单点刷新

条件任务列表 Comp 中实现了一种精确的跨组件刷新机制：

```typescript
refreshTaskCount() {
    const brixIns = this.getBrixIns();
    const countAdcId = adcConfig?.properties?.countAdcId;
    if (!countAdcId || !brixIns?.handleUpdate) return;
    brixIns.handleUpdate({ params: {}, id: countAdcId });
}
```

通过 ADC 配置中的 countAdcId 属性定位计数节点的 ADC ID，然后调用 brixIns.handleUpdate 只触发该节点的 Handler update，而非整页刷新。这避免了列表写操作后模板推荐列表等无关组件的重复请求。

---

## 七、错误处理分层体系

### 7.1 Handler 层：mx_brix_exception

Brix Handler 不能直接调用视图方法，错误通过返回值传递：

```typescript
return {
  ...rest,
  mx_brix_exception: { type: "error", msg: actionError },
  data: storeData,
};
```

框架接收到 mx_brix_exception 后自动触发全局错误提示。type 字段支持 "error"（全局 toast）和 "gmessage"（带 gmessageType 的局部提示）两种模式。

### 7.2 写操作的错误隔离

定时任务列表 Handler 的 delete 操作展示了精细的错误隔离：

```typescript
case "delete": {
    try {
        const [model] = await Service.fetch(models);
        const ok = model.get("info.ok", true);
        if (!ok) {
            // 业务级失败：保留列表，返回 gmessage 类型错误
            exception = { msg, type: "gmessage", gmessageType: "error" };
            break;
        }
    } catch (err) {
        // 网络级失败：同样保留列表，返回错误
        exception = { msg: err.message, type: "gmessage", gmessageType: "error" };
        break;
    }
    // 只有真正成功才刷新列表和计数
    res = await this.process({ adcConfig, context });
}
```

删除失败时不会触发列表刷新（避免用户看到列表闪烁），只有确认成功后才重新拉取数据。

### 7.3 接口响应的 ok/msg 约定

所有写操作接口遵循统一的响应格式：

```typescript
const ok = model.get("info.ok", true); // 默认 true，兼容旧接口
const msg = model.get("info.msg", ""); // 错误描述
```

默认值 true 的设定确保了旧版接口（没有 info.ok 字段）不会误判为失败。

---

## 八、模板层的设计模式

### 8.1 mx-stickytable 分行操作

表格使用 mx-stickytable 组件，操作按钮通过独立的 tr 行渲染：

```html
<tr mx-stickytable-operation="line">
  <td colspan="5">
    <mx-btn content="编辑" mx-click="handleAction({ code: 'edit', ... })" />
    <mx-btn
      content="AI工作台"
      mx-click="handleAction({ code: 'aiWorkspace', ... })"
    />
    <mx-popconfirm
      content="确认删除吗？"
      mx-popconfirm="handleDelete({taskId: ...})"
    >
      <mx-btn content="删除" />
    </mx-popconfirm>
  </td>
</tr>
```

mx-stickytable-operation="line" 使得操作行在 hover 时才显示，减少了视觉噪音。删除操作包裹在 mx-popconfirm 中，提供二次确认。

### 8.2 状态筛选器嵌入表头

状态筛选下拉框直接嵌入表头第一列：

```html
<th width="300">
  <div class="task-table-filter" mx-change="handleStatusFilter()">
    <mx-dropdown
      selected="{{=statusFilterSelected}}"
      list="{{@statusFilterList}}"
    />
    <mx-stickytable.th-text>任务名称</mx-stickytable.th-text>
  </div>
</th>
```

这种设计将筛选与表头合一，节省了独立的筛选栏空间，同时通过 mx-change 事件冒泡实现筛选联动。

### 8.3 mx-status 行内状态切换

任务状态使用 mx-status 组件实现行内切换：

```html
<mx-status list="{{@statusList}}" selected="{{:item.status{refresh:true}}}" />
```

双向绑定 `{{:item.status{refresh:true}}}` 使得状态变更自动同步到 updater 并触发重渲染，change 事件冒泡到父容器后由 handleStatusChange 处理器调用 Handler 完成服务端状态更新。

---

## 九、技术亮点总结

### 9.1 架构层面

1. Handler/Comp 彻底分离：数据逻辑（Handler）不依赖任何视图 API，可独立测试；视图逻辑（Comp）不直接调接口，只通过 handleUpdate 桥接。这一约束在 20+ 个组件文件中得到了一致遵守。

2. ADC 配置驱动：条件任务的创建表单完全由远程 ADC 配置描述，表单字段的增删改不需要前端发版。getViewConfig + patchChannelRemindTipOnAdc 的组合实现了"远程配置 + 本地增强"的灵活模式。

3. Brix Store 解耦组件通信：搜索、列表、计数三个组件通过 Store 键值对松耦合通信，任一组件的写操作都能被其他组件感知，而无需建立显式的引用关系。

### 9.2 工程实践层面

4. 写操作的一致性保障：runListAction 将"写请求 + 列表刷新 + 错误回退"封装为原子操作，失败时通过 getListSnapshot 恢复快照，成功时通过 fetchTaskCount 联动更新计数，保证了多组件间的状态一致。

5. 频率联动的状态清理：getDefaultsForFrequency 在切换调度类型时统一清理残留字段并填充新默认值，避免了表单脏数据提交到后端。

6. 时区一致性：所有时间默认值基于 UTC+8 手动计算，与后端调度系统的时区约定对齐，不依赖用户浏览器的本地时区设置。

### 9.3 用户体验层面

7. 列表/工作台无损切换：容器 View 通过 CSS display 隐藏（而非销毁）列表区域，从 AI 工作台返回时列表状态完整保留，无需重新加载。

8. 乐观更新投票：日志反馈只更新被操作的单条记录，不重新拉取整个列表，交互响应即时。

9. CRON 配置的人类可读化：parseScheduleText 将 6 种调度频率的结构化配置转换为自然语言（"每周一,周三 09:00"），降低了用户理解成本。

10. 渐进式错误提示：错误分为业务级（info.ok=false）和网络级（catch）两层，分别使用不同的提示类型（gmessage vs error），删除失败时不触发列表刷新避免视觉闪烁。

---

## 十、文件索引

| 文件路径                                                     | 职责                                         |
| ------------------------------------------------------------ | -------------------------------------------- |
| views/pages/agent/little-home/task/condition.ts              | 条件任务容器 View，管理 list/workspace 模式  |
| views/pages/agent/little-home/task/schedule.ts               | 定时任务容器 View，管理 list/workspace 模式  |
| views/pages/agent/little-home/task/ai_condition_workspace.ts | 条件任务 AI 工作台（概览+日志）              |
| views/pages/agent/little-home/task/ai_schedule_workspace.ts  | 定时任务 AI 工作台（概览+日志）              |
| views/pages/agent/little-home/task/conditionDlg.ts           | 条件任务创建/编辑弹窗（ADC 驱动）            |
| views/pages/brix/create-scheduled-task-modal.ts              | 定时任务创建/编辑弹窗（频率联动表单）        |
| views/pages/brix/mx_condition_task_table.h.ts                | 条件任务列表 Handler                         |
| views/pages/brix/mx_condition_task_table.ts                  | 条件任务列表 Comp                            |
| views/pages/brix/mx_task_table.h.ts                          | 定时任务列表 Handler（含 parseScheduleText） |
| views/pages/brix/mx_task_table.ts                            | 定时任务列表 Comp                            |
| views/pages/brix/mx_condition_task_count.h.ts                | 条件任务计数 Handler                         |
| views/pages/brix/mx_task_count.h.ts                          | 定时任务计数 Handler                         |
| views/pages/brix/mx_condition_template.h.ts                  | 条件任务模板列表 Handler                     |
| services/models.js                                           | API 接口注册（20+ taskcenter 接口）          |
