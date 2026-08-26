# Ali 工作: Next.js 交互稿还原 (截图识图重建图表)

## 背景

ChartPark 是一个图表协作平台, 前端为 Next.js 16 (App Router, React 19, TypeScript) 项目 mm-node-nextjs, 后端数据全部托管在 insforge BaaS. 核心 AI 能力是「交互稿还原」: 用户上传一张图表截图 (设计稿/线框图), 服务端压缩后经视觉大模型识图, 还原出可渲染的图表数据与配置 (chartType、xField、yFields、data 数组等), 直接生成可编辑图表.

完整链路: 客户端选图/粘贴 -> FormData 上传 -> SSE route handler -> 二进制嗅探 + sharp 压缩 -> base64 data URL -> OpenAI 兼容视觉模型流式识图 -> 图表配置. 下文知识点均结合该项目的真实实现展开.

## Q1: insforge 是什么?

答: insforge 是一个 BaaS (Backend as a Service) 平台, 类似 Supabase 的定位: 前端/Node 服务端不直接连数据库, 而是通过 SDK 与 REST 端点消费后端能力. 它提供四块能力:

| 能力           | 说明                                               | 本项目的使用                                                     |
| -------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Database       | PostgREST 风格的链式查询 API + 管理端 raw SQL 端点 | 全部业务数据 (project/chart_property/chart_user 等 12 张表)      |
| Auth           | 邮箱密码登录 + 自定义 OAuth provider (PKCE)        | BUC 集团统一登录经 insforge OAuth 中转                           |
| Storage        | 公开/私有存储桶                                    | 建了公开桶 chartpark, 但识图链路不落桶 (见 Q9)                   |
| Edge Functions | 部署在 insforge 域名的边缘函数                     | buc-bridge (OAuth 桥接)、chartpark-upload、chartpark-api 等 4 个 |

通过 insforge MCP 实际探查到的后端元数据:

- 数据库 12 张表: chart_property (1470 行)、project (1532 行)、chart_user_project (351 行)、chart_user (147 行)、chart_type (12 行)、white_list/white_list_user 等
- chart_property 表结构: id/ownerid/project_id 为 bigint, 其余大字段 (chart_options、chart_data、properties 等 JSON 内容) 全部为 text 列; RLS 开启但策略全放行; gmt_modified 由数据库触发器 set_gmt_modified() 自动维护; project_id 外键 CASCADE
- Auth 配置了自定义 OAuth provider insforge_buc, allowedRedirectUrls 白名单登记了回调地址 http://localhost:3000/api/auth/buc/callback

## Q2: 项目如何接入 insforge?

答: 数据访问封装在 db/insforge.ts, 三个环境变量: INSFORGE_API_BASE_URL、INSFORGE_ANON_KEY (匿名 JWT, SDK 运行时用)、INSFORGE_API_KEY (管理端 key, 仅 raw SQL 用).

SDK 客户端单例:

```typescript
import { createClient, type InsForgeClient } from "@insforge/sdk";

declare global {
  var insforge: InsForgeClient | undefined;
}

export const insforge = globalThis.insforge ?? createInsforgeClient();

// dev 下挂 globalThis, 防 HMR 热重载重复创建客户端
if (process.env.NODE_ENV !== "production") globalThis.insforge = insforge;
```

这是 Next.js dev 环境的经典模式: 模块级单例在热重载时会随模块重新执行而重建, 挂到 globalThis 上跨模块版本复用.

SDK 返回 `{ data, error }` 信封而非抛错, 项目统一用 unwrap() 解包成抛错语义 (对齐 Prisma):

```typescript
export function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) {
    throw result.error instanceof Error
      ? result.error
      : new Error(
          String(
            (result.error as { message?: string })?.message ?? result.error,
          ),
        );
  }
  return result.data as T;
}
```

日常查询走 PostgREST 风格链式 API:

```typescript
const rows = unwrap(
  await insforge.database
    .from("chart_property")
    .select("*")
    .eq("project_id", projectId)
    .order("gmt_modified", { ascending: false })
    .limit(1),
);
```

## Q3: insforge 不支持多语句事务, 跨表原子写入怎么做?

答: insforge 的管理端 raw SQL 端点 (POST /api/database/advance/rawsql) 只允许单条语句, 禁止 BEGIN/COMMIT 等多语句事务控制. 解法是把跨表写入组装成一条 CTE (WITH 子句) 语句, 单条语句天然原子.

项目中的 createProjectWithMembers 一次性完成「建项目 + 批量加成员 + 批量克隆图表」:

```sql
WITH p AS (
  INSERT INTO "project" (name, description, ...) VALUES ($1, $2, ...) RETURNING id
), m AS (
  INSERT INTO chart_user_project (project_id, user_id)
  SELECT p.id, x FROM p, unnest($n::bigint[]) x
), c AS (
  INSERT INTO chart_property (project_id, ownerid, chart_options, ...)
  SELECT p.id, (x->>'ownerid')::bigint, x->>'chart_options', ...
  FROM p, jsonb_array_elements($m::jsonb) x
)
SELECT id FROM p
```

要点:

- 成员 id 数组用 PostgreSQL 数组字面量 `{1,2,3}` 传参后 unnest 展开; 图表行数组用 jsonb_array_elements 展开, 每列用 `x->>'col'` 取值并按目标列类型 `::bigint`/`::int` 显式转换
- 列白名单 (PROJECT_COLUMNS) 过滤可写列, 防注入
- 克隆项目前先查 `${name}_copy` 是否重名, 提前拦截, 避免在 CTE 内撞唯一索引直接抛 500

另一个工程细节: 表里 id 是 bigint, JSON 传输后到 JS 是 number, 项目在 repository 边界统一做 number <-> bigint 归一化 (toBigInt/toBigIntOrNull); 写入前用 toJsonSafe 把 bigint 转回 number, 因为 JSON.stringify 不支持 bigint.

## Q4: BUC 集团统一登录如何经 insforge OAuth 接入?

答: insforge 支持自定义 OAuth provider, 项目在 dashboard 配置了 insforge_buc, 登录流程是标准 OAuth 授权码 + PKCE:

1. 服务端生成 PKCE: verifier 为 32 字节随机数的 base64url, challenge 为 verifier 的 SHA-256 后 base64url; verifier 存 HttpOnly cookie, challenge 随授权请求上送
2. 调 `GET /api/auth/oauth/custom/insforge_buc?redirect_uri=...&code_challenge=...` 取 BUC 授权页地址, 302 跳转
3. 用户登录后回跳 `/api/auth/buc/callback?code=...`, 服务端带 cookie 里的 verifier 调 `POST /api/auth/oauth/exchange` 换取用户信息 (email/name/avatar)
4. 按 email 优先、openid 兜底关联本地 chart_user, 缺字段补齐

两个约束:

- 回调路径必须登记在 insforge 的 allowedRedirectUrls 白名单, 是项目硬性约束, 改名需同步调管理端 `PUT /api/auth/config`
- redirect 参数只允许同站相对路径 (必须以单个 / 开头, 拒绝 // 开头), 防开放重定向

项目本身没有用 next-auth, 会话是手写的 HMAC 签名 session token (见 Q5).

## Q5: Next.js 16 的 proxy 门禁与 server action 鉴权是什么关系?

答: proxy.ts 是 Next.js 16 的路由级请求门禁约定 (原 middleware), 在请求进入路由前执行. 本项目用它做无状态会话校验: 只验 HMAC 签名 + TTL, 不查库, 所以可以很轻.

```typescript
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next(); // dev 放行
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) {
    return Response.json(
      { ok: false, message: "用户未登录, 不能执行此操作" },
      { status: 401 },
    );
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/agent/:path*" };
```

关键点: server action 虽然以 POST 形式发到当前页面 URL (携带 Next-Action header, 走 Next.js 自己的 RPC 通道), 请求会经过 proxy, 但本项目 matcher 仅匹配 /api/agent/*, 匹配不到页面 URL 上的 action 请求, 所以每个 action 内部必须自行兜底鉴权:

```typescript
"use server";

export async function createProjectAction(
  input: unknown,
): Promise<Result<{ projectId: number }>> {
  const user = await getSessionUser(); // 兜底鉴权, 不能依赖 proxy
  if (!user) return { ok: false, message: "用户未登录, 不能执行此操作" };
  const parsed = ProjectAddSchema.safeParse(input); // zod 校验
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message };
  const res = await createProject(user.id, {
    ...parsed.data,
    type: parsed.data.type ?? "chartx",
  });
  if (res.ok) revalidatePath("/projects"); // 成功后失效路由缓存
  return res;
}
```

同理, route handler 也不能只依赖 proxy (matcher 可能没覆盖、或未来调整), 识图接口内部同样再调一次 getSessionUser 防直连.

## Q6: 项目的 server action 规范与分层架构?

答: 依赖方向自上而下, 禁止反向:

```
proxy.ts (路由级门禁)
app/ (路由层: RSC page / route handler)
actions/ (Server Actions, 客户端业务入口)
services/ (业务编排与业务规则, 唯一允许承载业务逻辑的层)
db/repositories/ (纯数据访问) + auth/ (会话认证)
db/insforge.ts (insforge 客户端单例, 只允许 db/ 内部导入)
```

action 层的职责边界固定为四步: getSessionUser 兜底鉴权 -> zod 校验 (schema 集中在 lib/schemas/) -> 调 service -> 成功后 revalidatePath. 不写业务规则, 不直连 repository.

全仓库唯一结果信封是 lib/result.ts 的 `Result<T>`: service 返回 Result, action 透传, route handler 序列化为 JSON. repository 是纯数据访问: 只收原始参数 (userId: bigint 而非会话对象), 返回行数据或 null, 不包信封、不写校验、不拼文案.

一个例外: 交互稿还原需要流式推送进度, server action 不适合长连接流式响应, 所以走 route handler + SSE (见 Q10).

## Q7: 服务端为什么要做图片二进制探测, 而不是信任扩展名或 MIME?

答: 三层来源都不可信:

- 扩展名: 用户可任意修改, .png 后缀的文件可以是可执行文件
- 客户端 MIME (File.type): 浏览器通常也按扩展名推断, 同样可伪造; 粘贴板截图场景下 type 甚至可能为空
- 表单 Content-Type: 由客户端构造, 服务端无法信任

安全与正确性都要求服务端按文件内容的 magic bytes (文件头魔数) 判定真实类型: 安全上防止把非图片内容混入图片处理管道; 正确性上 sharp 等解码器按实际格式解码, 声明类型与实际不符时行为未定义.

项目 lib/image-compress.ts 的 sniffMediaType 实现, 支持 png/jpeg/gif/webp 四种:

```typescript
export function sniffMediaType(buf: Buffer): ImageMediaType | null {
  // PNG: 89 50 4E 47 (长度 >= 8)
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return "image/png";
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "image/jpeg";
  // GIF: 47 49 46 ("GIF")
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46)
    return "image/gif";
  // WebP: RIFF????WEBP, 看 0-3 与 8-11 两段
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return "image/webp";
  return null;
}
```

| 格式 | 魔数        | 说明                                                  |
| ---- | ----------- | ----------------------------------------------------- |
| PNG  | 89 50 4E 47 | 固定的 8 字节签名, 前 4 字节足以区分                  |
| JPEG | FF D8 FF    | SOI 标记开头                                          |
| GIF  | 47 49 46    | ASCII "GIF" (后跟 87a/89a 版本)                       |
| WebP | RIFF + WEBP | RIFF 容器, 4-7 字节是文件大小所以要跳过, 看 8-11 字节 |

嗅探返回 null 直接拒绝: 「不是支持的图片格式 (png/jpeg/gif/webp)」. 扩展名在整个链路中完全不参与判断.

## Q8: 图片压缩阶梯是怎么设计的?

答: 压缩目标由下游决定: base64 送视觉模型的体积上限 5MB. base64 编码膨胀 4/3, 反推原图直通线为 3.75MB (5MB * 3/4). compressUpload 的完整流程:

1. 防御: 0 字节拒绝; 原始上传上限 20MB (压缩前, 防恶意大文件打爆内存)
2. magic bytes 嗅探 (见 Q7), 不支持则拒绝
3. 小于等于 3.75MB: 原样直通, 不调 sharp, 省一次编解码
4. 超限走 sharp 压缩阶梯:
   - 先限尺寸: 宽或高超过 2000px 时等比缩放到 2000px 以内
   - PNG/GIF 优先保留格式: `png({ compressionLevel: 8, palette: true })`, palette 量化对截图类图片压缩率高
   - 仍超限转 JPEG, 走质量阶梯 80 -> 60 -> 40 -> 20
   - 仍超限则尺寸减半重试, 最多 3 轮
   - GIF/WebP 需要压缩时重编码, 动图取首帧
5. 3 轮后仍超 3.75MB 抛业务文案; sharp 运行期失败 (损坏文件/不支持的变体) 时, 因原图已超直通线、base64 必超模型上限, 直接提示换更小的图

```typescript
for (let attempt = 0; attempt < 3; attempt++) {
  if (preservePng) {
    const png = await sharp(buf)
      .resize(width, height, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 8, palette: true })
      .toBuffer();
    if (png.length <= MAX_IMAGE_BYTES_PASSTHROUGH)
      return toResult(png, "image/png");
  }
  for (const quality of [80, 60, 40, 20]) {
    const jpeg = await sharp(buf)
      .resize(width, height, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    if (jpeg.length <= MAX_IMAGE_BYTES_PASSTHROUGH)
      return toResult(jpeg, "image/jpeg");
  }
  width = Math.max(1, Math.round(width / 2));
  height = Math.max(1, Math.round(height / 2));
}
```

两个 sharp 使用细节:

- sharp 的编解码走 libuv 线程池, await 即异步, 不阻塞 Node 事件循环, 所以可以放心在请求处理中串行多次压缩
- 每轮操作都新建 sharp(buf) 实例: sharp 实例在 toBuffer() 后复用不会重新应用格式转换, 循环里复用会拿到错误格式的输出

## Q9: base64 处理与送模型的完整链路?

答: 压缩产物直接转 base64 (`buf.toString("base64")`, 不带 data: 前缀), 连同 mediaType 返回; route handler 拼成 data URL 送视觉模型:

```typescript
const dataUrl = `data:${opts.mime};base64,${opts.imageBase64}`;
// OpenAI 兼容协议的 image_url content part
messages: [
  {
    role: "user",
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
  },
];
```

选 base64 内联而非上传存储桶再传 URL 的取舍: 识图是一次性短链路, 图片不需要持久化与二次访问; base64 内联省掉「上传桶 -> 生成可被模型服务访问的 URL -> 权限配置」整条链路 (insforge 的 chartpark 桶与 chartpark-upload 边缘函数是其他链路在用, 识图不落桶). 代价是体积膨胀 4/3, 所以才有 Q8 里 3.75MB 直通线的反推.

route handler 侧还有几处防御性处理:

- formData 解析兜底: 客户端异常或代理截断时 `req.formData()` 可能抛错, try/catch 降级成空表单再走「请提供截图」分支, 而不是 500
- 兼容网关错误识别: 部分 OpenAI 兼容网关把上游错误包成 HTTP 200 的 content delta (finish_reason 为 error_finish), 不当场识别会被当成模型输出拿去解析 JSON, 最终报出与根因无关的「未返回 data 数组」; 项目在流结束后先按 finish_reason 检查并透传上游错误信息

## Q10: 为什么识图用 SSE route handler 而不是 server action? 客户端如何消费?

答: server action 是一问一答的 RPC 语义, 不适合长连接流式推送. 识图耗时链路长 (压缩 -> 模型流式输出 -> 解析), 需要实时反馈进度, 所以用 route handler 输出 SSE, 事件类型: status (进度)、thinking (模型思考)、content (输出片段)、result (最终图表配置)、error.

服务端用 ReadableStream 手工组 SSE:

```typescript
function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const stream = new ReadableStream({
  async start(controller) {
    const send = (event: string, data: unknown) => {
      if (closed) return;
      controller.enqueue(encoder.encode(sseEvent(event, data)));
    };
    // ... compressUpload -> visionIntentNativeStream -> runWithIntent
  },
});
return new Response(stream, {
  headers: {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  },
});
```

客户端 (zustand store) 用 fetch + ReadableStream reader 手动解析 SSE: 按 `\n\n` 切事件块, 逐行解析 `event:` 与 `data:` 前缀. 不用 EventSource 的原因: EventSource 只支持 GET, 而这里要 POST FormData 上传图片.

客户端状态放在 zustand store 而非组件 state: 任务执行与结果独立于 React 组件生命周期, 用户离开 /agent 路由再返回时, 进行中的任务与结果不丢失. File 对象不可序列化, 引用留在模块级变量, store 里只存 FileReader.readAsDataURL 生成的预览 data URL.

## Q11: 视觉模型的 prompt 与输出解析有哪些工程约束?

答: prompt 要求模型只返回单个 JSON 对象 (无 markdown 围栏), 给出明确 schema (chartType/areaEnabled/title/xField/yFields/yLineTypes/data 等), 并针对识图常见失败模式加了严格约束:

- 数据必须忠实读图: x 轴刻度、y 轴量程、曲线形状、峰值位置都要对齐截图, 禁止编造无关样例数据
- data 数组必须覆盖每个可见 x 轴刻度, 连续曲线采样 7-31 个点, 峰谷允许 ±10% 容差
- 实线虚线必须拆成两个系列: 出现虚线 (预测/对比辅助线) 时 yFields 至少两个, yLineTypes 为 ["solid", "dashed"] 且顺序对齐, 每行数据必须同时含两个字段, 防止模型只保留「主线」丢掉虚线系列

解析侧 parseJsonLoose 容忍模型输出的围栏与杂散文本; yLineTypes 做归一化 (含 dash 字样归为 dashed) 与补齐 (长度不足时按 solid/dashed 交替填充); 无 data 数组直接报错. 最终 intent + data 交给 runWithIntent 组装成可渲染的图表 artifact, 经 SSE result 事件下发.

## Q12: 识图最终产出的图表配置是什么体系?

答: 识图还原出来的不是 ECharts 配置, 而是 chartpark 自研引擎 (Chartx) 的配置. mm-node-nextjs 的 services/chart-agent/build-config.ts 把视觉模型返回的 intent (chartType/xField/yFields/yLineTypes) 组装成 chartpark 可运行的 options + data, 结构与平台约定严格对齐:

```javascript
// chartpark 配置的三段式契约: data + variables + options
var data = [
  { trendDate: "2024-07-25", value: 0.1, valueDash: 0.2 },
  // ...
];

var variables = {}; // 仅承载运行时动态生成的点位, 默认空对象

var options = {
  coord: { type: "rect", xAxis: { field: "trendDate" } },
  graphs: [
    {
      type: "line",
      field: "value",
      area: { enabled: false },
      node: { enabled: false },
    },
    {
      type: "line",
      field: "valueDash",
      line: { lineType: "dashed", lineDash: [4, 4] },
    },
  ],
  legend: {},
  tips: {},
};
```

buildOptions 按 chartType 分支生成: line/bar/scat 用 `coord.type=rect`, pie/radar 用 `coord.type=polar`, 与 Q11 拆出来的实线/虚线多系列一一对应 (每个 yField 一个 graph, lineType 分别取 solid/dashed). 这份 options 存进 chart_property 表的 chart_options 列 (text), 由 chartpark 运行时渲染.

## Q13: 如果未来数据由接口动态返回, 平台应该如何演进?

答: 当前识图/生成链路产出的是「静态 data」——视觉模型把截图里的像素读成具体数值, 一并固化进 artifact, `variables` 是空对象. 这在演示还原能力时够用, 但真实业务里图表数据来自接口, 会随筛选、时间、权限变化. 要支持动态数据, 核心思路是把「配置与字段语义」和「具体数值」解耦: 配置固化, 数据改为运行时绑定. 平台其实已经预留了演进空间, chart_property 表里本就有 data_type、jsonp_url 这类远程数据字段, chart-view 运行时也有 variables (chartVars)、dimCompletion 补行、resetData 局部刷新的机制. 演进可以沿下面几条线展开.

第一, 产物从「写死 data」改为「数据源绑定」. 识图与生成的目标产物应只固化配置骨架 (coord/graphs/fieldsConfig 与字段语义), 不再烘焙具体数值. chart_property 需要引入 dataSource 抽象, 至少区分两种模式:

| 模式   | data 来源                       | 适用                               |
| ------ | ------------------------------- | ---------------------------------- |
| static | 写死的行数组 (现状)             | 演示、截图还原预览、无接口的临时图 |
| api    | 绑定接口 + 字段映射, 运行时拉取 | 生产业务图表                       |

api 模式要存: 接口地址、请求方式、轮询/刷新策略, 以及「接口返回字段 -> chartpark field」的映射关系.

第二, 增加字段映射层 (adapter). 接口返回的结构往往不是 chartpark 期望的扁平行数据 (可能是嵌套对象、按系列组织、字段名不一致), 需要一个 mapper 把 response 规整成行数组, 且字段名对齐 `coord.xAxis.field` 与 `graphs[].field`. 这正是 chart-view 技能里「脚本侧把接口结果映射为 chartData」的流程, 只是要从手写脚本沉淀为平台可配置的能力.

第三, 让 variables 成为动态注入点. chartpark 三段契约里的 variables 本就是为运行时动态设计的: 把接口数据、动态显示名 (fieldsConfig 的 name)、格式化、阈值等提取到 variables, options 内用 `variables.xxx` 引用, 运行时由 chartVars 覆盖赋值. 演进后识图产物应从「variables = {}」变成「variables = 接口动态点位」, 这与 generate-chartpark-config 技能里「仅当用户说要动态才提取到 variables」的规则一脉相承.

第四, 识图能力本身要转向. 静态场景视觉模型「读像素值」还原 data; 动态场景数值无意义 (截图里的数是假的), 模型应改为「读结构」: 识别图表类型、轴字段语义、系列样式 (实线/虚线/面积)、轴量程范围, 产出配置骨架与字段 schema, 真实数值交给接口. prompt 要从「还原 data 数值」转向「还原字段 schema + 样式 + 数据契约」.

第五, 校验从「闭环于静态 data」转向「闭环于接口 schema」. 现在 validateArtifact 校验 graphs[].field 是否存在于静态 data 的行 key; 动态场景没有静态 data 可查, 需要接口先声明 schema (字段名/类型), 校验改为对照接口 schema 做字段闭环与 coord-graph 匹配.

第六, 数据获取、补全与局部刷新. 接口数据走 fetch + 缓存 (SWR 思路), 筛选切换只更新 chartData/chartVars 并触发组件内 resetData/reset, 不销毁重建实例; 时序接口缺点位时用 chart-view 的 dimCompletion 按 xAxis.field 补行, 多系列缺失字段按行补齐, 保证引擎取值不出现空洞.

第七, 参考 a2ui 的「组装 prompt + ReAct 工具调用 + 校验回喂」循环, 让 LLM 自己拉接口数据辅助生成 (详见同目录的 a2ui.md 阶段 6-8). a2ui v0.9 是 prompt-first 设计: server 收到请求后把 JSON Schema 直接嵌入 system prompt 让 LLM 仿写, 不依赖 structured output, 生成后做校验, 失败把 VALIDATION_FAILED 错误回喂 LLM 重试. 这套循环可以平移到动态数据的图表生成:

- Server 组装 prompt: 把 chartpark 配置 schema (coord/graphs/tips/legend 的全量字段表与 data/variables/options 三段契约) 嵌入 system prompt, 相当于把 generate-chartpark-config 技能的字段权威表搬进 prompt, 约束 LLM 不得编造字段
- ReAct 循环先查数据再生成配置: LLM 根据用户的还原请求, 第一轮先 tool_use 调用相关数据接口, 拿到接口返回的 JSON 响应; 这样 LLM 同时了解了响应数据的真实 schema (字段名、类型、嵌套结构) 和一组具体数值, 第二轮再生成 chartpark 配置 JSON. graphs[].field / coord.xAxis.field 直接映射接口真实字段, 天然满足第五点的字段闭环; 具体数值还能帮 LLM 判断字段语义 (x 轴是不是日期、y 轴是不是数值、有几个系列), 避免凭空猜字段
- 校验与回喂重试: server 提取配置 JSON 后对照 chartpark schema 校验 (字段是否存在于接口 schema、coord-graph 是否匹配、字段拼写是否在全量字段表中), 失败时把校验错误回喂 LLM 重试, 纠正其猜错的字段名与不符合源码拼写的写法

这一步把第五点的「接口 schema 声明」从「要求人工预先声明」变成「LLM 经工具调用主动探得」: schema 来自接口真实响应, 既准又免维护.

一句话概括: 演进的本质是把「一次性还原成静态图」升级为「还原出可接数的图表骨架」, 用 dataSource 绑定 + 字段映射 + variables 注入 + schema 校验 + a2ui 式 ReAct 自主拉数, 让识图/生成的产物直接对接生产接口数据.

## 小结

| 知识点        | 关键结论                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| insforge      | BaaS: PostgREST 风格 DB API + 管理端 raw SQL + Auth (自定义 OAuth PKCE) + Storage + Edge Functions             |
| 无事务原子写  | 单条 CTE 语句组装跨表写入, unnest/jsonb_array_elements 展开批量参数                                            |
| server action | 经过 proxy 但 matcher (仅 /api/agent/*) 拦不到, 内部必须兜底鉴权; 流式场景改用 route handler + SSE             |
| 图片类型判定  | 不信任扩展名与 MIME, 服务端按 magic bytes 嗅探 (PNG/JPEG/GIF/WebP)                                             |
| 压缩阶梯      | 5MB base64 上限反推 3.75MB 直通线; 限宽 2000px, PNG palette 优先, JPEG 质量 80/60/40/20, 尺寸减半重试 3 轮     |
| base64 送模型 | data URL 内联进 image_url content part, 省去存储桶与 URL 授权链路                                              |
| 识图产物      | 产出 chartpark 自研引擎配置 (coord + graphs[] + tips), 三段式 data/variables/options, 存入 chart_options 列    |
| 动态数据演进  | 配置与数值解耦: dataSource 绑定 + 字段映射 + variables 注入; 参考 a2ui ReAct, LLM 先查接口拿 schema 再生成配置 |
