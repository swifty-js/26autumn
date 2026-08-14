---
title: 渲染函数
description: Lark Mvc 模板编译原理详解：从 HTML 模板到渲染函数的完整编译流水线、字符串模式与 VDOM 模式的函数签名、运行时辅助函数与基于 Babel AST 的变量自动检测
---

# 渲染函数

在 Lark Mvc 中，`.html` 模板文件会在构建时被编译为一个 **ES 模块**，其默认导出就是一个「渲染函数」。视图每次 digest 时调用的 `template(data, viewId, refData)` 正是这个函数。本文完整拆解模板到渲染函数的编译流水线。

## 渲染函数的两种形态

根据 `FrameworkConfig.vdom` 与编译选项 `vdom`，模板被编译为两种渲染函数：

### 字符串模式：`(data, viewId, refData) => string`

```ts
// 编译产物（示意）
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
    if (!__lark_ref_alt__) __lark_ref_alt__ = __lark_data__;
    let __lark_out__ = "";
    let name = __lark_data__.name; // ← extractGlobalVars 提取的变量声明
    __lark_out__ += '<div class="card">';
    __lark_out__ += __lark_enc_html__(name);
    __lark_out__ += "</div>";
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

返回 HTML 字符串，交给 `dom.ts` 的字符串 diff 引擎。

### VDOM 模式：`(data, viewId, refData) => VDomNode`

```ts
// 编译产物（示意）
import { vdomCreate as __lark_vdom_create__ } from "@mm/lark-mvc";
import {
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
    __lark_str_safe__,
    __lark_ref_fn__,
  ) => {
    if (!__lark_ref_alt__) __lark_ref_alt__ = __lark_data__;
    let name = __lark_data__.name;
    let __lark_vdom1__, __lark_vdom2__, _p0;
    __lark_vdom1__ = [];
    _p0 = { class: "card" };
    __lark_vdom2__ = [];
    __lark_vdom2__.push(__lark_vdom_create__(0, __lark_str_safe__(name)));
    __lark_vdom1__.push(__lark_vdom_create__("div", _p0, __lark_vdom2__));
    return __lark_vdom_create__(__lark_view_id__, 0, __lark_vdom1__);
  })(
    __lark_data__,
    __lark_view_id__,
    refData,
    __lark_str_safe__,
    __lark_ref_fn__,
  );
}
export default __lark_template__;
```

返回 `VDomNode` 树，交给 `vdom.ts` 的三阶段 diff 引擎。

两种产物的默认导出都是具名函数 `__lark_template__`——这是为了让自动注入的 HMR 片段能按名引用它（见 `hmr-inject.ts`）。

## 编译流水线总览

`compileTemplate(source, options)` 是 Vite / Webpack / Rspack loader 的统一入口，流水线如下：

```
原始 HTML 模板（{{ }} 语法）
   │
   ├─ extractGlobalVars(source)          ← Babel AST 分析，提取数据变量
   │
   ├─ protectComments(source)            ← 保护 HTML 注释不被转换
   │
   ├─ convertArtSyntax(source, debug)    ← {{ }} → <% %> 内部语法
   │
   ├─ processViewEvents(source)          ← @click="fn(params)" 编码
   │
   ├─ processViewBindings(source)        ← *prop / @event → p-lark-* / e-lark-*
   │
   ├─ restoreComments(source, comments)  ← 恢复注释
   │
   └─ vdom ? compileToVDomFunction(...)  ← htmlparser2 解析 + vdomCreate 发射
        : compileToFunction(...)         ← 正则扫描 + 字符串拼接发射
```

对应源码：

```ts
export async function compileTemplate(source, options = {}) {
  const { debug = false, file, vdom = false } = options;

  const globalVars = options.globalVars ?? (await extractGlobalVars(source));

  // Phase 1: 保护注释
  const { protectedSource, comments } = protectComments(source);

  // Phase 2: {{ }} art 语法 → <% %> 内部语法
  const converted = convertArtSyntax(protectedSource, debug);

  // Phase 3: 处理 @event 属性
  const viewEventProcessed = processViewEvents(converted);

  // Phase 3b: 处理 v-lark 元素上的 *prop 与 @event 绑定
  const viewBindingsProcessed = processViewBindings(viewEventProcessed);

  // 恢复注释
  const finalSource = restoreComments(viewBindingsProcessed, comments);

  // 由 globalVars 构建变量声明
  const varDeclarations = globalVars
    .map((key) => `let ${key}=__lark_data__.${key};`)
    .join("");

  if (vdom) {
    const funcBody = compileToVDomFunction(finalSource, debug, file);
    // ... VDOM 模块包装
  }
  const funcBody = compileToFunction(finalSource, debug, file);
  // ... 字符串模块包装
}
```

下面逐阶段解析。

## Phase 0：变量自动检测（extractGlobalVars）

模板里写的 `{{=name}}`、`{{if user.isAdmin}}` 中的 `name`、`user` 从哪来？Lark 的答案是**零配置**：编译器用 Babel 解析模板中的所有表达式，自动找出「未声明、非内置」的标识符，认定它们来自 `data`。

### 处理流程

```ts
export async function extractGlobalVars(source: string): Promise<string[]> {
  // 1. 走一遍与编译相同的语法转换管线
  const { protectedSource, comments } = protectComments(source);
  const viewEventProcessed = processViewEvents(protectedSource);
  const viewBindingsProcessed = processViewBindings(viewEventProcessed);
  const converted = convertArtSyntax(viewBindingsProcessed, false);
  const template = restoreComments(converted, comments);

  // 2. 把 <% %> 块转成可被 JS 解析的形式：
  //    HTML 文本替换为占位符字符串，表达式包进数组字面量
  template.replace(templateCmdRegExp, (match, operate, content, offset) => {
    // ...HTML 文本 → "\x05N\x05" 占位符
    if (operate && content.trim()) {
      fnParts.push(';"' + key + '";', "[" + content + "]"); // 表达式 → 数组元素
    } else {
      fnParts.push(';"' + key + '";', content || ""); // 语句原样保留
    }
    return match;
  });

  let fn = `(function(){${fnParts.join("")}})`;

  // 3. Babel 解析
  let ast: t.File;
  try {
    ast = babelParse(fn, {
      sourceType: "script",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
    });
  } catch {
    return fallbackExtractVariables(source); // 解析失败 → 正则兜底
  }

  // 4. 两遍 AST 遍历
  // ...
}
```

### 两遍 AST 遍历做作用域分析

**第一遍**收集所有「本地存在」的名字：变量声明（`VariableDeclarator`）、函数声明、函数调用者（视为已存在）、函数参数（含默认值参数与 rest 参数）：

```ts
walkAst(ast, {
  VariableDeclarator(node) {
    if (node.id.type === "Identifier") {
      globalExists[node.id.name] = node.init ? 3 : 2;
    }
  },
  FunctionDeclaration(node) {
    /* 函数名入 globalExists */
  },
  FunctionExpression(node) {
    fnRange.push(node);
  },
  ArrowFunctionExpression(node) {
    fnRange.push(node);
  },
  CallExpression(node) {
    if (node.callee.type === "Identifier") {
      globalExists[node.callee.name] = 1; // 被调用的视为内置/常量
    }
  },
});
```

**第二遍**收集所有 Identifier，排除本地声明、函数参数与内置全局后，剩下的就是「全局变量」——即必须由 `data` 提供的变量：

```ts
walkAst(ast, {
  Identifier(node) {
    const name = node.name;
    if (globalExists[name]) return; // 已声明
    if (functionParams[name]) return; // 函数参数
    globalVars[name] = 1; // 数据变量
  },
  AssignmentExpression(node) {
    /* 赋值目标去重 */
  },
});
```

AST 遍历器还精确跳过了**非独立变量**的位置：非计算成员表达式的 `property`（`obj.prop` 中的 `prop`）、非计算对象字面量的 `key`（`{key: value}` 中的 `key`）——这些不是变量引用，不应被提取。

### 内置全局排除表

`BUILTIN_GLOBALS` 集合排除了 JS 字面量（`undefined`/`true`）、内置对象（`Math`/`JSON`/`Promise`）、内置函数（`parseInt`/`encodeURIComponent`）、浏览器全局（`window`/`document`/`console`）以及模板运行时辅助变量（`__lark_data__`/`__lark_out__` 等），确保只有真正的数据变量被提取。

### 提取结果的去向

提取出的变量名被编译为函数体开头的解构式声明：

```ts
const varDeclarations = globalVars
  .map((key) => `let ${key}=__lark_data__.${key};`)
  .join("");
```

这就是为什么模板里可以直接写 `{{=name}}` 而不用 `{{=data.name}}`——`name` 在渲染函数顶部被声明为 `let name = __lark_data__.name;`。

> **兜底策略**：Babel 解析失败（模板语法畸形）时，回退到正则提取 `{{[:=!@] varName}}`、`{{forOf list as}}`、`{{if var}}` 中的首标识符，保证编译永不崩溃。

## Phase 1：protectComments —— 注释保护

HTML 注释里的 `{{ }}` 不应被当作模板语法转换。`protectComments` 先把所有注释替换为占位符，流水线末尾再恢复：

```ts
export function protectComments(source) {
  const comments: string[] = [];
  const protectedSource = source.replace(/<!--[\s\S]*?-->/g, (match) => {
    comments.push(match);
    return `__lark_comment_${comments.length - 1}__`;
  });
  return { protectedSource, comments };
}
```

## Phase 2：convertArtSyntax —— art 语法转换

这一步把用户友好的 `{{ }}` 语法转换为内部的 `<% %>` 语法，是整个编译器中规则最多的环节。

### 输出运算符

| 模板语法    | 内部语法    | 渲染行为                                |
| ----------- | ----------- | --------------------------------------- |
| `{{=expr}}` | `<%=expr%>` | HTML 转义输出（`__lark_enc_html__`）    |
| `{{:expr}}` | `<%:expr%>` | 双向绑定（渲染时与 `=` 相同）           |
| `{{!expr}}` | `<%!expr%>` | 原始输出，不转义（`__lark_str_safe__`） |
| `{{@expr}}` | `<%@expr%>` | 引用令牌（`__lark_ref_fn__`）           |

### 控制流语法

| 模板语法                     | 内部语法                                                            |
| ---------------------------- | ------------------------------------------------------------------- |
| `{{if cond}}`                | `<%if(cond){%>`                                                     |
| `{{else if cond}}`           | `<%}else if(cond){%>`                                               |
| `{{else}}`                   | `<%}else{%>`                                                        |
| `{{/if}}`                    | `<%}%>`                                                             |
| `{{forOf list as item idx}}` | `<%for(let idx=0,_l=list.length;idx<_l;idx++){let item=list[idx]%>` |
| `{{forIn obj as val key}}`   | `<%for(let key in obj){let val=obj[key]%>`                          |
| `{{for(init;test;update)}}`  | `<%for(init;test;update){%>`                                        |
| `{{set a = b}}`              | `<%let a = b;%>`                                                    |

`forOf` 的转换尤其值得注意——它生成带长度缓存的高性能循环，并支持解构与 first/last 辅助变量：

```ts
case "forOf": {
  // {{forOf list as item idx}} →
  // <%for(let idx=0,_l=list.length;idx<_l;idx++){let item=list[idx]%>
  const valueDecl = asExpr.vars ? `let ${asExpr.vars}=${refObj}[${index}]` : "";
  return `${debugPrefix}<%for(let ${index}=0${refExpr},${refObjCount}=${refObj}.length${lastCount};${index}<${refObjCount};${index}++){${firstAndLast}${valueDecl}%>`;
}
```

### 语法校验

转换过程维护一个块栈（`blockStack`），遇到 `{{/if}}` 等闭合标签时弹栈校验：

- 闭合标签与栈顶不匹配 → 抛错 `expected {{/if}} to close block opened at line N`
- 流水线结束时栈非空 → 抛错 `Unclosed block(s): "if" at line N`
- `{{forOf list item}}` 缺少 `as` → 抛错并给出正确用法提示

这些编译期校验让模板语法错误在构建时暴露，而不是运行时白屏。

### debug 行号标记

`debug` 模式下，`addLineMarkers` 在每个 `{{` 前插入 `SPLITTER + 行号`，转换时提取并生成 `<%'lineNo\x11code\x11'%>` 调试标记，最终让运行时错误能定位到原始模板行：

```
render error: Cannot read properties of undefined
	src art:{{=user.name}}
	expr:<%=user.name%>
	at file:views/home.html
```

## Phase 3：processViewEvents —— 事件属性编码

模板中的 `@click="handler({id: 1})"` 会被编码为带视图 id 前缀的格式：

```ts
export function processViewEvents(source: string): string {
  return source.replace(
    /@(\w+)="([^"]+)"/g,
    (fullAttr, eventName, attrValue) => {
      const eventMatch = attrValue.match(/^(\w+)\((.*)\)$/s);
      if (!eventMatch) return fullAttr; // 无括号 → 不是事件处理器

      const handlerName = eventMatch[1];
      const paramsStr = eventMatch[2].trim();

      if (!paramsStr) {
        // handler() → \x1f\x1ehandler()
        return `@${eventName}="${VIEW_ID_PLACEHOLDER}${SPLITTER}${handlerName}()"`;
      }

      // JS 对象字面量 → URL 查询参数
      const urlParams = jsObjectToUrlParams(paramsStr);
      return `@${eventName}="${VIEW_ID_PLACEHOLDER}${SPLITTER}${handlerName}(${urlParams})"`;
    },
  );
}
```

编码规则：

- `\x1f`（U+001F）是视图 id 占位符，渲染时被替换为 `'+__lark_view_id__+'`——事件属性因此携带了「我属于哪个视图」的信息。
- `\x1e`（SPLITTER）分隔视图 id 与处理器名。
- 参数从 JS 对象字面量 `{key: 'value'}` 转换为 URL 查询格式 `key=value`，运行时由 `parseUri` 解析回 `e.params`。

运行时 `EventDelegator` 拿到 `@click` 属性值后解析出 `{ id, name, params }`，定位到对应 frame 的 `events["name<click>"]` 处理函数。

## Phase 3b：processViewBindings —— v-lark 绑定

`v-lark` 子视图元素上的 `*prop` 与 `@event`（无括号形式）被转换为标准属性：

```ts
export function processViewBindings(source: string): string {
  // *count="{{=count}}" → p-lark-count="{{=count}}"
  let result = source.replace(/\s\*(\w+)="([^"]*)"/g, (_, name, value) => {
    return ` p-lark-${name}="${value}"`;
  });

  // @increment="increment" → e-lark-increment="increment"
  result = result.replace(/\s@(\w+)="(\w+)"/g, (_, eventName, handlerName) => {
    return ` e-lark-${eventName}="${handlerName}"`;
  });

  return result;
}
```

- `p-lark-*`：父 → 子属性传递，`mountZone` 读取后作为子视图参数（ref 令牌会被还原为原始 JS 值）。
- `e-lark-*`：子 → 父事件桥接，子视图 `fire(eventName)` 触发父视图对应处理函数。

这一步必须在 `processViewEvents` **之后**运行——后者只处理带括号的 `@event="fn(...)"`，剩下的无括号形式才归这里处理。

## Phase 4a：compileToFunction —— 字符串模式发射

`compileToFunction` 用正则扫描 `<% %>` 块，把整个模板转换为一个字符串拼接函数：

```ts
function compileToFunction(
  source: string,
  debug: boolean,
  file?: string,
): string {
  const matcher = /<%([@=!:])?([\s\S]*?)%>|$/g;
  let index = 0;
  let funcSource = `__lark_out__+='`;

  source.replace(matcher, (match, operate, content, offset) => {
    // 块之间的纯文本：转义反斜杠/单引号，换行 → \n
    funcSource += source
      .substring(index, offset)
      .replace(escapeSlashRegExp, "\\$&")
      .replace(escapeBreakReturnRegExp, "\\n");
    index = offset + match.length;

    if (operate === "@") {
      funcSource += `'+__lark_ref_fn__(__lark_ref_alt__,${content})+'`;
    } else if (operate === "=" || operate === ":") {
      funcSource += `'+__lark_enc_html__(${content})+'`;
    } else if (operate === "!") {
      funcSource += `'+__lark_str_safe__(${content})+'`;
    } else if (content) {
      // 代码块（if/for/else）：闭合字符串 → 插入语句 → 重新打开字符串
      funcSource += `';`;
      if (funcSource.endsWith(`+'';`)) {
        funcSource = funcSource.substring(0, funcSource.length - 4) + ";";
      }
      funcSource += `${content};__lark_out__+='`;
    }
    return match;
  });

  funcSource += `';`;

  // 后处理：清理空拼接
  funcSource = funcSource.replace(/__lark_out__\+='';/g, "");
  funcSource = funcSource.replace(/__lark_out__\+=''\+/g, "__lark_out__+=");

  // \x1f → '+__lark_view_id__+'
  const viewIdRegExp = new RegExp(String.fromCharCode(0x1f), "g");
  funcSource = funcSource.replace(viewIdRegExp, `'+__lark_view_id__+'`);

  const refFallback = "if(!__lark_ref_alt__)__lark_ref_alt__=__lark_data__;";
  const fullSource = `${refFallback}let __lark_out__='';{{__lark_vars__}};${funcSource}return __lark_out__`;

  return `(__lark_data__,__lark_view_id__,__lark_ref_alt__,__lark_enc_html__,__lark_str_safe__,__lark_ref_fn__)=>{${fullSource}}`;
}
```

发射逻辑的核心思想：维护一个「打开的字符串字面量」`__lark_out__+='...'`。遇到输出表达式就闭合字符串、拼接函数调用、再重新打开；遇到代码块就闭合字符串、原样插入 JS 语句、再重新打开。最终产物是一条高效的线性拼接链。

后处理会清理转换产生的空拼接（`__lark_out__+='';` 删除、`__lark_out__=''+` 简化），保证产物紧凑。

### debug 包装

debug 模式下每个表达式前注入 `__lark_dbg_expr__='<%=expr%>'` 赋值，整个函数体包进 try-catch，捕获后拼装带原始表达式、art 源码与文件路径的错误消息再抛出。

## Phase 4b：compileToVDomFunction —— VDOM 模式发射

VDOM 模式不能用字符串扫描——HTML 的嵌套结构必须被真正解析。这一步基于 **htmlparser2**：

### Step 1：提取 `<% %>` 块为占位符

```ts
const exprStore: VDomExprEntry[] = [];
const protectedSource = source.replace(
  /<%([@=!:])?([\s\S]*?)%>/g,
  (_, op, content) => {
    const idx = exprStore.length;
    exprStore.push({ op: op || "", content: (content || "").trim() });
    return `\x00${idx}\x00`; // \x00N\x00 占位符
  },
);
```

### Step 2：htmlparser2 解析

```ts
const doc = parseDocument(protectedSource, {
  recognizeSelfClosing: true,
  lowerCaseTags: false, // 保留标签大小写（SVG 需要）
  lowerCaseAttributeNames: false,
  decodeEntities: false,
});
```

### Step 3-4：递归遍历，发射 vdomCreate 调用

遍历器为每个元素分配子节点数组变量（`__lark_vdomN__`）与 props 变量（`_pN`），深度优先发射：

```ts
function emitText(text, parentVar) {
  const parts = text.split(/\x00(\d+)\x00/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // 纯文本段
      if (trimmed.trim()) {
        lines.push(
          `${parentVar}.push(__lark_vdom_create__(0,'${vdomEscapeStr(trimmed)}'))`,
        );
      }
    } else {
      emitExpr(exprStore[parseInt(parts[i])], parentVar);
    }
  }
}

function emitExpr(expr, parentVar) {
  if (expr.op === "=" || expr.op === ":") {
    lines.push(
      `${parentVar}.push(__lark_vdom_create__(0,__lark_str_safe__(${expr.content})))`,
    );
  } else if (expr.op === "!") {
    lines.push(
      `${parentVar}.push(__lark_vdom_create__(0,__lark_str_safe__(${expr.content}),1))`,
    ); // 1 → 原始 HTML
  } else if (expr.op === "@") {
    lines.push(
      `${parentVar}.push(__lark_vdom_create__(0,__lark_ref_fn__(__lark_ref_alt__,${expr.content})))`,
    );
  } else if (expr.content) {
    lines.push(expr.content); // 代码块原样发射（if/for 控制 push 流）
  }
}

function emitElement(node, parentVar) {
  const childVar = allocVar();
  const props = vdomBuildPropsFromAttribs(node.attribs, exprStore);
  lines.push(`let ${propsKey}=${props}`);
  lines.push(`${childVar}=[]`);
  for (const child of children) emitNode(child, childVar);

  const isVoid = VOID_ELEMENTS.has(tagName) && children.length === 0;
  const childrenArg = isVoid ? "1" : childVar; // void 元素 → 自闭合标记
  lines.push(
    `${parentVar}.push(__lark_vdom_create__('${tagName}',${propsKey},${childrenArg}))`,
  );
}
```

控制流块（`{{if}}`/`{{forOf}}`）被**原样发射**到 push 语句之间——JS 的 if/for 天然控制了哪些 `push` 执行，无需特殊处理。

### 属性值中的表达式

属性值可能混合静态文本与表达式（`class="row-{{=idx}}"`）。`vdomResolveAttrValue` 把 `\x00N\x00` 占位符还原为拼接表达式：

```ts
// class="row-{{=idx}}" → 'row-'+__lark_str_safe__(idx)
```

若属性值中含**代码块**占位符（语句不能参与拼接），则路由到 IIFE 解析器，生成 `(()=>{let _s='';...;return _s;})()` 形式的立即执行函数。

### Step 5：根节点

```ts
lines.push(`return __lark_vdom_create__(__lark_view_id__,0,${rootVar})`);
```

根节点以 `viewId` 为 tag、`0` 为 props、子节点数组为 children——`vdomCreate` 对非零 tag 走元素分支，根节点因此携带整个子树。

## 运行时辅助函数（runtime.ts）

编译产物不内联辅助函数实现，而是从 `@mm/lark-mvc/runtime` 导入——每个 `.html` 模块节省约 400 字节的重复代码。

### strSafe：空安全字符串化

```ts
export function strSafe(v: unknown): string {
  return String(v == null ? "" : v);
}
```

`null`/`undefined` 渲染为空字符串而非 `"null"`/`"undefined"`。用于 `{{!raw}}` 输出与 VDOM 文本节点。

### encHtml：HTML 转义

```ts
const HTML_ENT_MAP = {
  "&": "amp",
  "<": "lt",
  ">": "gt",
  '"': "#34",
  "'": "#39",
  "`": "#96",
};

export function encodeHTML(v: unknown): string {
  return String(v == null ? "" : v).replace(
    HTML_ENT_REGEXP,
    (m) => "&" + HTML_ENT_MAP[m] + ";",
  );
}
```

转义 `& < > " ' \`` 六个字符，覆盖 HTML 文本与双引号属性两种上下文，防止 XSS。所有 `{{=escaped}}` 输出都经过它。

### refFn：引用令牌

```ts
export function refFn(ref, value, key) {
  const counter = ref[SPLITTER] as number;
  for (let i = counter; --i;) {
    key = SPLITTER + i;
    if (ref[key] === value) return key; // 同值复用令牌
  }
  key = SPLITTER + (ref[SPLITTER] as number)++;
  ref[key] = value;
  return key;
}
```

`{{@expr}}` 把活的 JS 值（对象/函数）存入 `refData`，返回 `SPLITTER + 序号` 令牌写入 DOM 属性。同一值复用同一令牌，保证 diff 稳定性。事件触发或子视图挂载时令牌被还原为原始值。

### 辅助函数与运算符的对应

| 运算符            | 字符串模式                      | VDOM 模式                                     |
| ----------------- | ------------------------------- | --------------------------------------------- |
| `{{=}}` / `{{:}}` | `__lark_enc_html__(expr)`       | `__lark_str_safe__(expr)`（文本节点无需转义） |
| `{{!}}`           | `__lark_str_safe__(expr)`       | `__lark_str_safe__(expr)` + 原始 HTML 标记    |
| `{{@}}`           | `__lark_ref_fn__(refAlt, expr)` | `__lark_ref_fn__(refAlt, expr)`               |

注意 VDOM 模式**不导入 encHtml**：字符串模式的转义是为了 HTML 文本安全，而 VDOM 文本最终走 `document.createTextNode`，浏览器不会二次解析，转义反而会把 `&lt;` 原样显示。

## 模块包装与 HMR

两种模式的最终产物都包一层统一签名的模块函数：

```ts
function __lark_template__(data, viewId, refData) {
  let __lark_data__ = data || {},
      __lark_view_id__ = viewId || '';
  return (内部箭头函数)(__lark_data__, __lark_view_id__, refData, 辅助函数...);
}
export default __lark_template__;
```

这层包装做了三件事：

1. **参数归一化**：`data || {}` 防御空数据，`viewId || ''` 防御空 id。
2. **辅助函数注入**：内部箭头函数的 6 个（字符串）/ 5 个（VDOM）参数由包装层从 runtime 导入传入，内部无需 import。
3. **具名导出**：`__lark_template__` 具名让 HMR 注入片段能写 `globalThis.__lark_hmr__.hotSwapByTemplate(__lark_template__, newTemplate)`。

## 编译产物体积优化

编译器在多个层面控制产物体积：

- **辅助函数外置**：从 runtime 导入而非内联，每模板省 ~400 字节。
- **空拼接清理**：后处理删除 `__lark_out__+='';` 等无效语句。
- **props 变量复用**：VDOM 模式的 props 提升为 `_pN` 局部变量，避免深层嵌套表达式。
- **变量声明最小化**：只有 AST 确认的数据变量才被声明，本地变量（`{{set}}`、循环变量）不重复声明。

## 小结

| 阶段                  | 职责            | 关键技术                                 |
| --------------------- | --------------- | ---------------------------------------- |
| extractGlobalVars     | 找出数据变量    | Babel AST + 作用域分析                   |
| protectComments       | 隔离注释        | 占位符替换                               |
| convertArtSyntax      | 语法转换 + 校验 | 块栈、行号标记                           |
| processViewEvents     | 事件编码        | `\x1f` viewId + `\x1e` 分隔 + URL 参数化 |
| processViewBindings   | v-lark 绑定     | `p-lark-*` / `e-lark-*`                  |
| compileToFunction     | 字符串函数发射  | 正则扫描 + 字符串链拼接                  |
| compileToVDomFunction | VDOM 函数发射   | htmlparser2 + 递归发射                   |

理解这条流水线后，模板中的任何语法现象都能溯源：转义规则来自 `encHtml`，事件参数来自 URL 编码，变量来源来自 AST 提取，行号报错来自 debug 标记。
