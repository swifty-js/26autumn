---
title: 安全
description: Lark Mvc 框架的安全机制详解，涵盖 XSS 防护、模板自动转义、ref token 系统安全性、事件处理编码安全、CSP 兼容性及用户生成内容的安全处理模式。
---

# 安全

Lark Mvc 框架在设计上将安全性作为核心原则之一。框架通过模板编译器的自动转义机制、运行时编码函数、以及内部数据结构的隔离设计，为开发者提供了多层次的安全保障。本章将深入分析框架的安全架构，帮助开发者理解并正确应用这些安全机制。

## 一、XSS 防护：模板自动转义

### 1.1 `{{=expr}}` 自动转义机制

Lark Mvc 模板引擎中，`{{=expr}}` 和 `{{:expr}}` 语法会对输出内容进行 HTML 实体转义，这是防止 XSS（跨站脚本攻击）的第一道防线。

编译器在 `compile-template.ts` 中将 `{{=expr}}` 转换为对 `__lark_enc_html__` 函数的调用：

```typescript
// 编译器内部逻辑（compile-template.ts）
// <%=expr%> 或 <%:expr%> → __lark_enc_html__(expr)
if (operate === "=" || operate === ":") {
  funcSource += `'+__lark_enc_html__(${content})+'`;
}
```

编译后的模板模块会从 `@mm/lark-mvc/runtime` 导入 `encHtml` 函数：

```javascript
// 编译输出示例
import {
  encHtml as __lark_enc_html__,
  strSafe as __lark_str_safe__,
  refFn as __lark_ref_fn__,
} from "@mm/lark-mvc/runtime";

function __lark_template__(data, viewId, refData) {
  let __lark_data__ = data || {},
    __lark_view_id__ = viewId || "";
  return ((
    __lark_data__,
    __lark_view_id__,
    __lark_ref_alt__,
    __lark_enc_html__,
    __lark_str_safe__,
    __lark_ref_fn__,
  ) => {
    let __lark_out__ = "";
    __lark_out__ += "<div>" + __lark_enc_html__(username) + "</div>";
    return __lark_out__;
  })(
    __lark_data__,
    __lark_view_id__,
    refData,
    __lark_enc_html__,
    __lark_str_safe__,
    __lark_ref_fn__,
  );
}
export default __lark_template__;
```

### 1.2 `encodeHTML` 实体转义实现

`encodeHTML` 函数（在 `common.ts` 中定义，通过 `runtime.ts` 导出为 `encHtml`）对以下 6 种危险字符进行实体编码：

```typescript
// common.ts
const HTML_ENT_MAP: Record<string, string> = {
  "&": "amp", // & → &amp;
  "<": "lt", // < → &lt;
  ">": "gt", // > → &gt;
  '"': "#34", // " → &#34;
  "'": "#39", // ' → &#39;
  "`": "#96", // ` → &#96;
};

const HTML_ENT_REGEXP = /[&<>"'`]/g;

export function encodeHTML(v: unknown): string {
  return String(v == null ? "" : v).replace(
    HTML_ENT_REGEXP,
    (m: string) => "&" + HTML_ENT_MAP[m] + ";",
  );
}
```

转义覆盖的字符及其安全意义：

| 字符    | 转义结果 | 防护场景                          |
| ------- | -------- | --------------------------------- |
| `&`     | `&amp;`  | 防止实体注入                      |
| `<`     | `&lt;`   | 防止标签注入                      |
| `>`     | `&gt;`   | 防止标签闭合注入                  |
| `"`     | `&#34;`  | 防止双引号属性逃逸                |
| `'`     | `&#39;`  | 防止单引号属性逃逸                |
| `` ` `` | `&#96;`  | 防止模板字符串注入（IE 特有向量） |

### 1.3 安全使用示例

```html
<!-- 模板文件 user-card.html -->
<div class="user-card">
  <!-- 安全：自动转义，用户输入中的 <script> 等标签会被编码 -->
  <span class="name">{{=user.name}}</span>
  <p class="bio">{{=user.bio}}</p>

  <!-- 安全：属性值中的引号也会被转义 -->
  <a href="/user?id={{=user.id}}" title="{{=user.name}}">查看主页</a>
</div>
```

当 `user.name` 为 `<script>alert('xss')</script>` 时，输出为：

```html
<span class="name">&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;</span>
```

## 二、`{{!expr}}` 原始输出的危险与防范

### 2.1 原始输出语法

`{{!expr}}` 语法使用 `strSafe` 函数，仅进行空值安全转换（`null`/`undefined` → `""`），**不进行任何 HTML 转义**：

```typescript
// common.ts
export function strSafe(v: unknown): string {
  return String(v == null ? "" : v);
}
```

编译器中的处理：

```typescript
// compile-template.ts
} else if (operate === "!") {
  funcSource += `'+__lark_str_safe__(${content})+'`;
}
```

### 2.2 使用风险

```html
<!-- 危险！如果 comment.html 包含用户输入，将导致 XSS -->
<div class="comment">{{!comment.html}}</div>

<!-- 危险！用户可控的 URL 可能包含 javascript: 协议 -->
<a href="{{!userUrl}}">链接</a>
```

### 2.3 安全使用规范

`{{!expr}}` 仅应用于以下场景：

```html
<!-- 场景 1：渲染框架内部生成的可信 HTML 片段 -->
<div>{{!trustedInternalHtml}}</div>

<!-- 场景 2：渲染经过服务端净化（sanitize）的富文本 -->
<article>{{!sanitizedArticle}}</article>

<!-- 场景 3：输出纯数字或枚举值（不含特殊字符） -->
<span>{{!item.count}}</span>
```

**最佳实践**：对用户生成内容（UGC），必须在服务端或客户端使用 HTML 净化库（如 DOMPurify）处理后再使用 `{{!}}` 输出：

```typescript
import DOMPurify from "dompurify";

const view = defineView((ctx) => {
  ctx.updater.set({
    // 净化后再设置到数据中
    safeHtml: DOMPurify.sanitize(rawUserInput),
  });
  return { template };
});
```

## 三、Ref Token 系统安全性

### 3.1 SPLITTER 前缀机制

框架使用 Unicode 控制字符 U+001E（Record Separator）作为内部命名空间分隔符：

```typescript
// common.ts
export const SPLITTER = String.fromCharCode(0x1e);
```

选择此字符的安全考量：

- **不可见性**：U+001E 是不可打印的控制字符，用户无法通过键盘输入
- **唯一性**：在正常用户数据中永远不会出现
- **HTML 安全性**：在 HTML 属性值中是安全的

### 3.2 refFn 引用令牌

`{{@expr}}` 语法用于将 JavaScript 对象（如函数、复杂对象）通过 DOM 属性传递。其工作原理是将对象存储在 `refData` 中，返回一个 SPLITTER 前缀的令牌字符串：

```typescript
// common.ts
export function refFn(
  ref: Record<string, unknown>,
  value: unknown,
  key: string,
): string {
  const counter = ref[SPLITTER] as number;
  for (let i = counter; --i;) {
    key = SPLITTER + i;
    if (ref[key] === value) return key;
  }
  key = SPLITTER + (ref[SPLITTER] as number)++;
  ref[key] = value;
  return key;
}
```

### 3.3 令牌验证

`isRefToken` 函数严格验证令牌格式——必须是 SPLITTER 后跟纯数字：

```typescript
// common.ts
export function isRefToken(s: string): boolean {
  if (s.length < 2 || s[0] !== SPLITTER) return false;
  for (let i = 1; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < "0".charCodeAt(0) || c > "9".charCodeAt(0)) return false;
  }
  return true;
}
```

**安全意义**：由于 SPLITTER 字符无法由用户输入构造，攻击者无法伪造 ref token 来访问或篡改 refData 中存储的对象引用。这确保了事件处理中对象传递的安全性。

## 四、事件处理编码安全

### 4.1 事件属性编码

Lark 的事件系统通过 DOM 属性存储事件处理信息。事件方法使用 SPLITTER 作为 frame ID 和处理函数名之间的分隔符：

```typescript
// common.ts
export const EVENT_METHOD_REGEXP = new RegExp(
  `(?:([\\w-]+)${SPLITTER})?([^(]+)\\(([\\s\\S]*?)?\\)`,
);
```

### 4.2 URI 编码安全

事件参数中的 URL 值使用 `encodeURIExtra` 进行严格编码：

```typescript
// common.ts
const URI_ENT_MAP: Record<string, string> = {
  "!": "%21",
  "'": "%27",
  "(": "%28",
  ")": "%29",
  "*": "%2A",
};

export function encodeURIExtra(v: unknown): string {
  return encodeURIComponent(strSafe(v)).replace(
    URI_ENT_REGEXP,
    (m: string) => URI_ENT_MAP[m],
  );
}
```

此函数在标准 `encodeURIComponent` 基础上额外编码了 `! ' ( ) *` 五个字符，确保更严格的 URI 合规性，防止通过特殊字符进行参数注入。

### 4.3 引号编码

`encodeQuote` 用于在 HTML 属性值中安全嵌入字符串：

```typescript
// common.ts
const QUOTE_ENT_REGEXP = /['"\\]/g;

export function encodeQuote(v: unknown): string {
  return strSafe(v).replace(QUOTE_ENT_REGEXP, "\\$&");
}
```

这防止了通过引号字符逃逸 HTML 属性边界的攻击。

## 五、CSP（内容安全策略）兼容性

### 5.1 无内联脚本

Lark Mvc 的模板编译输出为 ES 模块，不包含内联 `<script>` 标签或 `eval()` 调用。编译后的模板是纯函数模块：

```javascript
// 编译输出是标准 ES 模块，兼容严格 CSP
import { encHtml as __lark_enc_html__ } from "@mm/lark-mvc/runtime";
function __lark_template__(data, viewId, refData) {
  /* ... */
}
export default __lark_template__;
```

### 5.2 事件委托机制

框架使用事件委托而非内联事件处理器（如 `onclick="..."`），完全兼容 `script-src` 不包含 `'unsafe-inline'` 的 CSP 策略：

```html
<!-- Lark 不使用内联事件 -->
<!-- 错误示范（Lark 不会生成此类代码）：-->
<!-- <button onclick="handleClick()">点击</button> -->

<!-- Lark 的事件绑定方式：通过事件委托 -->
<button @click="submitForm(name)">提交</button>
```

### 5.3 CSP 配置建议

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.example.com;
```

Lark Mvc 在默认 CSP 配置下即可正常运行，无需 `'unsafe-eval'` 或 `'unsafe-inline'`（script-src）。

## 六、用户生成内容（UGC）安全模式

### 6.1 默认安全原则

```html
<!-- 推荐：始终使用 {{=}} 输出用户内容 -->
<div class="comment">
  <span class="author">{{=comment.author}}</span>
  <p class="content">{{=comment.content}}</p>
</div>
```

### 6.2 富文本处理流程

```typescript
import DOMPurify from "dompurify";
import template from "./rich-content.html";

const view = defineView((ctx) => {
  // 从服务端获取的富文本，在渲染前进行净化
  const rawHtml = ctx.updater.get("articleHtml");
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ["p", "b", "i", "a", "ul", "ol", "li", "br", "img"],
    ALLOWED_ATTR: ["href", "src", "alt", "class"],
  });

  ctx.updater.set({ safeContent: cleanHtml });

  return {
    template,
    events: {},
  };
});
```

```html
<!-- rich-content.html -->
<article class="rich-text">
  <!-- 经过 DOMPurify 净化后安全输出 -->
  {{!safeContent}}
</article>
```

### 6.3 避免危险的动态属性

```html
<!-- 危险：不要将用户输入直接用于 href -->
<a href="{{!userInput}}">链接</a>

<!-- 安全：使用 {{=}} 转义，或在 JS 中验证 URL -->
<a href="{{=safeUrl}}">链接</a>
```

## 七、路由中的 URL 净化

### 7.1 URL 解析安全

框架的路由系统使用严格的正则表达式解析 URL 参数：

```typescript
// common.ts
export const URL_PARAM_REGEXP = /([^=&?/#]+)=?([^&#?]*)/g;
export const URL_TRIM_HASH_REGEXP = /(?:^.*\/\/[^/]+|#.*$)/gi;
export const URL_QUERY_HASH_REGEXP = /[#?].*$/;
```

### 7.2 路由导航安全

使用 `Router.to()` 进行导航时，参数会经过编码处理：

```typescript
// 安全：参数自动编码
Router.to("/search", { q: userInput });
// 生成: #!/search?q=%3Cscript%3E...（特殊字符被编码）
```

### 7.3 路由守卫验证

```typescript
// 使用 beforeEach 守卫验证路由参数
Router.beforeEach((to, from) => {
  const id = to.get("id");
  // 验证参数格式，拒绝非法输入
  if (id && !/^\d+$/.test(id)) {
    return false; // 阻止导航
  }
  return true;
});
```

## 八、安全最佳实践总结

| 场景         | 推荐做法                 | 避免做法            |
| ------------ | ------------------------ | ------------------- |
| 输出用户文本 | `{{=userInput}}`         | `{{!userInput}}`    |
| 输出富文本   | 先净化再 `{{!safeHtml}}` | 直接 `{{!rawHtml}}` |
| 动态 URL     | JS 中验证协议后使用      | 直接拼接用户输入    |
| 事件参数     | 框架自动编码             | 手动拼接 HTML       |
| 对象传递     | `{{@obj}}` ref token     | 序列化到属性中      |
| 路由参数     | `Router.to()` 自动编码   | 手动拼接 URL 字符串 |

### 安全检查清单

1. **模板输出**：所有用户可控数据使用 `{{=}}` 输出
2. **原始输出**：`{{!}}` 仅用于可信内容或经过净化的 HTML
3. **URL 处理**：验证协议（仅允许 `http:`/`https:`/相对路径）
4. **CSP 部署**：生产环境启用严格 CSP 头
5. **依赖审计**：定期审计第三方依赖的安全性
6. **服务端配合**：敏感操作配合 CSRF Token 验证
