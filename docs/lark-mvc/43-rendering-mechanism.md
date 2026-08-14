---
title: 渲染机制
description: Lark Mvc 双渲染引擎源码级解析：字符串模式的 HTML 解析与键控真实 DOM diff，VDOM 模式的三阶段对比与 LIS 最小移动算法
---

# 渲染机制

Lark Mvc 内置**两套渲染引擎**，通过 `FrameworkConfig.vdom` 切换：

- **字符串模式**（默认，`vdom: false`）：模板编译为返回 HTML 字符串的函数，引擎把字符串解析为临时 DOM 树，再与线上 DOM 做键控 diff（`dom.ts`）。
- **VDOM 模式**（`vdom: true`）：模板编译为返回 `VDomNode` 树的函数，引擎用「头尾快速路径 + KeyMap + LIS」三阶段算法对比新旧树（`vdom.ts`）。

两套引擎共享同一个入口——`runDigest`，本文先讲入口，再分别深入两条渲染路径。

## 入口：runDigest 的引擎分流

`updater.digest()` 最终调用 `runDigest`。当数据变更且渲染条件满足时，它调用模板函数，并根据返回值类型分流：

```ts
const template = view.getTemplate();
if (typeof template === "function") {
  const result = template(data, viewId, refData);

  if (typeof result === "string") {
    // ── 字符串渲染路径 ──
    const newDom = domGetNode(result, node);
    const ref = createDomRef();
    domSetChildNodes(node, newDom, ref, frame, keys);
    applyIdUpdates(ref.idUpdates);
    applyDomOps(ref.domOps);
    view.endUpdate(viewId);
  } else {
    // ── VDOM 渲染路径 ──
    const newVDom = result;
    const ref = createVDomRef(viewId);
    const ready = (): void => {
      vdom = newVDom;
      if (ref.changed || !view.rendered.value) {
        view.endUpdate(viewId);
      }
      for (const [el, prop, val] of ref.nodeProps) {
        Reflect.set(el, prop, val);
      }
    };
    vdomSetChildNodes(node, vdom, newVDom, ref, frame, keys, view, ready);
  }
}
```

两条路径的产物都写入同一个 `ref` 追踪器（字符串模式是 `DomRef`，VDOM 模式是 `VDomRef`），diff 过程中只**收集**变更，最后统一**应用**——这是「批量 DOM 操作」的核心。

---

# 第一部分：字符串模式（dom.ts）

## 1. domGetNode：HTML 字符串 → DOM 树

字符串模式的第一步是把渲染函数产出的 HTML 字符串解析为 DOM。Lark 使用一个**离屏虚拟文档**而非 `document` 本身：

```ts
const VDoc = document.implementation.createHTMLDocument("");
const VBase = VDoc.createElement("base");
VBase.href = document.location.href;
VDoc.head.appendChild(VBase);
```

用 `createHTMLDocument` 的好处：解析不触发图片等资源加载、不执行脚本、不影响线上文档的 DOM 结构；`<base>` 的 href 指向当前页面，保证相对路径资源解析正确。

### wrapMeta：上下文敏感标签的包装解析

HTML 解析器对某些标签有上下文要求——孤立的 `<tr>`、`<td>`、`<option>` 直接赋给 `innerHTML` 会被丢弃或错位。`wrapMeta` 为每类标签声明了「包装深度 + 包装 HTML」：

```ts
const wrapMeta: Record<string, [number, string]> = {
  option: [1, "<select multiple>"],
  thead: [1, "<table>"],
  col: [2, "<table><colgroup>"],
  tr: [2, "<table><tbody>"],
  td: [3, "<table><tbody><tr>"],
  area: [1, "<map>"],
  param: [1, "<object>"],
  svg: [1, '<svg xmlns="' + SVG_NS + '">'],
  math: [1, '<math xmlns="' + MATH_NS + '">'],
  _: [0, ""],
};

wrapMeta["optgroup"] = wrapMeta["option"];
wrapMeta["tbody"] =
  wrapMeta["tfoot"] =
  wrapMeta["colgroup"] =
  wrapMeta["caption"] =
    wrapMeta["thead"];
wrapMeta["th"] = wrapMeta["td"];
```

`domGetNode` 的解析流程：

```ts
export function domGetNode(html: string, refNode: Element): Element {
  const tmp = VDoc.createElement("div");
  const ns = refNode.namespaceURI;
  let tag: string;

  if (ns === SVG_NS) {
    tag = "svg";
  } else if (ns === MATH_NS) {
    tag = "math";
  } else {
    const match = TAG_NAME_REGEXP.exec(html);
    tag = match ? match[1] : "";
  }

  const wrap = wrapMeta[tag] || wrapMeta["_"];
  tmp.innerHTML = wrap[1] + html;

  let j = wrap[0];
  while (j--) {
    const last = tmp.lastChild;
    if (last) tmp.replaceChildren(last);
  }

  return tmp;
}
```

三个要点：

1. **命名空间感知**：若目标节点处于 SVG/MathML 命名空间，直接用对应包装，保证子节点继承正确的命名空间。
2. **首标签探测**：`TAG_NAME_REGEXP`（`/<([a-z][^/\0>\x20\t\r\n\f]+)/i`）从 HTML 开头提取标签名，查表得到包装。
3. **逐层剥离**：`wrap[0]` 是包装层数。以 `<td>` 为例，`innerHTML = "<table><tbody><tr>" + html` 后，循环 3 次 `replaceChildren(last)`，把 `<table>` → `<tbody>` → `<tr>` 逐层剥掉，最终 `tmp` 里只剩解析好的 `<td>` 节点。原生 HTML 解析器免费处理了表格/SVG/MathML 的所有解析规则。

## 2. compareKey：键控 diff 的身份标识

diff 复用节点的前提是「认出」节点。`domGetCompareKey` 为每个元素节点计算比较键：

```ts
export function domGetCompareKey(node: ChildNode): string | undefined {
  if (node.nodeType !== 1) return undefined;
  const el = node as DomElement;

  if (el.compareKeyCached) return el.cachedCompareKey;

  let key = el.autoId ? "" : el.getAttribute("id") || undefined;

  if (!key) {
    const larkView = el.getAttribute(LARK_VIEW);
    if (larkView) {
      key = parseUri(larkView).path || undefined; // v-lark 视图路径
    }
  }

  el.compareKeyCached = 1;
  el.cachedCompareKey = key || "";
  return key;
}
```

优先级：`id` 属性 > `v-lark` 视图路径 > 无键。两个细节：

- **autoId 排除**：框架自动生成的 id（`ensureElementId` 打的标记）不作为 key，因为它是位置性的、不稳定。
- **缓存**：结果缓存在元素自身（`compareKeyCached`），属性 diff 时（`domSetAttributes`）会清除缓存强制重算。

## 3. domSetChildNodes：键控子节点对比

这是字符串模式的核心算法。对同一父节点的新旧子节点列表做匹配：

```ts
export function domSetChildNodes(oldParent, newParent, ref, frame, keys_) {
  let oldNode = oldParent.lastChild;
  let newNode = newParent.firstChild;
  let extra = 0;

  // 第一步：为旧子节点按 key 建桶（Map<key, ChildNode[]>）
  const keyedNodes = new Map<string, ChildNode[]>();
  const newKeyedNodes = new Map<string, number>();

  while (oldNode) {
    extra++; // extra 记录旧节点总数
    const nodeKey = domGetCompareKey(oldNode);
    if (nodeKey) {
      let bucket = keyedNodes.get(nodeKey);
      if (!bucket) {
        bucket = [];
        keyedNodes.set(nodeKey, bucket);
      }
      bucket.push(oldNode);
    }
    oldNode = oldNode.previousSibling;
  }

  // 第二步：统计新列表中每个 key 的需求量
  while (newNode) {
    const nodeKey = domGetCompareKey(newNode);
    if (nodeKey) {
      newKeyedNodes.set(nodeKey, (newKeyedNodes.get(nodeKey) ?? 0) + 1);
    }
    newNode = newNode.nextSibling;
  }

  // 第三步：逐个匹配新节点
  newNode = newParent.firstChild;
  oldNode = oldParent.firstChild;

  while (newNode) {
    extra--;
    const tempNew = newNode;
    newNode = newNode.nextSibling;
    const nodeKey = domGetCompareKey(tempNew);
    let foundNode = nodeKey ? keyedNodes.get(nodeKey) : undefined;

    if (foundNode && (foundNode = foundNode.slice()) && foundNode.length) {
      // 命中 key：从桶中取出匹配的旧节点
      const matched = foundNode.pop() as ChildNode;
      while (matched !== oldNode) {
        if (!oldNode) break;
        const next = oldNode.nextSibling;
        oldParent.appendChild(oldNode); // 把挡路的节点挪到末尾
        oldNode = next;
      }
      oldNode = matched.nextSibling;
      if (nodeKey) {
        const c = newKeyedNodes.get(nodeKey);
        if (c) newKeyedNodes.set(nodeKey, c - 1);
      }
      domSetNode(matched, tempNew, oldParent, ref, frame, keys_);
    } else if (oldNode) {
      const tempOld = oldNode;
      const oldKey = domGetCompareKey(tempOld);
      if (oldKey && keyedNodes.has(oldKey) && newKeyedNodes.get(oldKey)) {
        // 旧节点有 key 且后面还会被需要 → 先插入新节点占位
        extra++;
        ref.hasChanged = 1;
        ref.domOps.push([8, oldParent, tempNew, tempOld]); // insertBefore
      } else {
        // 无 key 对无 key：原地复用
        oldNode = oldNode.nextSibling;
        domSetNode(tempOld, tempNew, oldParent, ref, frame, keys_);
      }
    } else {
      // 旧节点耗尽：追加新节点
      ref.hasChanged = 1;
      ref.domOps.push([1, oldParent, tempNew]); // appendChild
    }
  }

  // 第四步：移除多余的旧节点
  let tempOld = oldParent.lastChild;
  while (extra-- > 0) {
    if (tempOld) {
      domUnmountFrames(frame, tempOld); // 先卸载子 frame
      ref.domOps.push([2, oldParent, tempOld]); // removeChild
      tempOld = tempOld.previousSibling;
      ref.hasChanged = 1;
    }
  }
}
```

算法要点：

- **桶式 key 匹配**：同一 key 的多个旧节点存入数组（桶），匹配时 `pop()` 取出，天然支持重复 key。
- **需求量记账**：`newKeyedNodes` 记录每个 key 还需要多少节点。若当前旧节点的 key 在后续仍被需要（`newKeyedNodes.get(oldKey)` 非零），就不原地消费它，而是 `insertBefore` 新节点到它前面。
- **挪位策略**：命中 key 但位置不对时，把中间挡路的节点 `appendChild` 到末尾（它们要么之后被匹配，要么最终被 `extra` 清理）。
- **延迟执行**：所有结构变更只推入 `ref.domOps`，不立即操作 DOM。

## 4. domSetNode：单节点递归 diff

匹配上的新旧节点对交给 `domSetNode` 做内容 diff：

```ts
export function domSetNode(oldNode, newNode, oldParent, ref, frame, keys_) {
  const oldAsEl = oldNode instanceof Element ? oldNode : null;
  const newAsEl = newNode instanceof Element ? newNode : null;

  const equalAsNodes =
    oldAsEl !== null &&
    newAsEl !== null &&
    oldAsEl.isEqualNode &&
    oldAsEl.isEqualNode(newAsEl);

  if (domSpecialDiff(oldNode, newNode) || !equalAsNodes) {
    if (
      oldNode.nodeType === newNode.nodeType &&
      oldNode.nodeName === newNode.nodeName
    ) {
      if (oldAsEl !== null && newAsEl !== null) {
        const oldEl = oldAsEl;
        const newEl = newAsEl;
        const newLarkView = newEl.getAttribute(LARK_VIEW);
        let updateChildren = true;

        // v-lark 子视图保护：同路径则保留现有视图，不 diff 其内部
        if (newLarkView) {
          const oldFrameId = oldEl.getAttribute("id") || "";
          const newViewPath = parseUri(newLarkView).path;
          const oldLarkView = oldEl.getAttribute(LARK_VIEW);
          const oldViewPath = oldLarkView ? parseUri(oldLarkView).path : "";
          if (oldFrameId && newViewPath === oldViewPath) {
            updateChildren = false;
          }
        }

        domSetAttributes(oldEl, newEl, ref, !!newLarkView);
        if (updateChildren) {
          domSetChildNodes(oldEl, newEl, ref, frame, keys_); // 递归
        }
      } else if (oldNode.nodeValue !== newNode.nodeValue) {
        ref.hasChanged = 1;
        oldNode.nodeValue = newNode.nodeValue; // 文本/注释节点
      }
    } else {
      // 节点类型不同（DIV vs H1、元素 vs 注释）→ 整体替换
      ref.hasChanged = 1;
      domUnmountFrames(frame, oldNode);
      ref.domOps.push([4, oldParent, newNode, oldNode]); // replaceChild
    }
  }
}
```

三层快速路径：

1. **isEqualNode 短路**：原生 `isEqualNode` 一次性判断整棵子树是否相同，相同则完全跳过（但表单特殊属性仍需 `domSpecialDiff` 检查）。
2. **类型相同 → 原地 diff**：属性走 `domSetAttributes`，子节点递归 `domSetChildNodes`。
3. **类型不同 → 替换**：推入 `replaceChild` 操作。

**子视图保护**是 Lark 特有的关键逻辑：当新旧节点都是 `v-lark` 且视图路径相同时，`updateChildren = false`——子视图的 DOM 由其自己管理，父视图 diff 绝不深入其内部，只更新属性（`keepId = true` 保留其 frame id）。

## 5. domSpecialDiff：表单元素的状态同步

表单元素的状态（`value`、`checked`、`selected`）存在于 DOM 属性而非 HTML 特性，用户输入会改变前者而不改变后者，`isEqualNode` 对此无感知。`domSpecialDiff` 单独同步这些属性：

```ts
const DomSpecials: Record<string, string[]> = {
  INPUT: ["value", "checked"],
  TEXTAREA: ["value"],
  OPTION: ["selected"],
};

export function domSpecialDiff(oldNode, newNode): number {
  const specials = DomSpecials[oldNode.nodeName];
  if (!specials) return 0;

  let result = 0;
  for (const prop of specials) {
    if (Reflect.get(oldNode, prop) !== Reflect.get(newNode, prop)) {
      result = 1;
      Reflect.set(oldNode, prop, Reflect.get(newNode, prop));
    }
  }
  return result;
}
```

注意解析后的新节点携带的是**模板渲染的值**，把它同步到线上节点，就实现了「数据 → 表单」的单向受控。

## 6. domSetAttributes 与 id 延迟更新

属性 diff 遍历新旧属性集合，删除多余属性、写入变更属性。特殊之处在于 `id` 的处理：

```ts
// 删除时
if (name === "id") {
  if (!keepId) ref.idUpdates.push([oldNode, ""]);
} else {
  oldNode.removeAttribute(name);
}
// 写入时
if (key === "id") {
  ref.idUpdates.push([oldNode, value]);
} else {
  oldNode.setAttribute(key, value);
}
```

id 变更被推迟到 `ref.idUpdates`，由 `applyIdUpdates` 在 diff 全部结束后统一应用。原因：diff 过程中 `frameGetter`（`Frame.get`）依赖元素 id 查找 frame，中途改 id 会让后续兄弟节点的查找失效。

## 7. DomOp：批量变更编码与应用

所有结构变更被编码为四元组 `[opCode, parent, child?, refChild?]`，操作码用位值区分：

```ts
export function applyDomOps(ops: DomOp[]): void {
  for (const op of ops) {
    switch (op[0]) {
      case 1:
        op[1].appendChild(op[2]);
        break; // appendChild
      case 2:
        op[1].removeChild(op[2]);
        break; // removeChild
      case 4:
        op[1].replaceChild(op[2], op[3]);
        break; // replaceChild
      case 8:
        op[1].insertBefore(op[2], op[3]);
        break; // insertBefore
    }
  }
}
```

「先收集、后应用」带来两个好处：diff 阶段读到的 DOM 状态始终一致（不会被中途的变更干扰），且浏览器可以把一批变更合并在一次重排中处理。

---

# 第二部分：VDOM 模式（vdom.ts）

## 1. vdomCreate：构建 VDomNode

编译后的 VDOM 模板调用 `vdomCreate` 构建虚拟节点。它有四种调用形态：

```ts
vdomCreate(0, "文本内容"); // 文本节点
vdomCreate(0, "<b>加粗</b>", 1); // 原始 HTML 节点（children 为真值）
vdomCreate("div", { class: "row" }, [child1, child2]); // 元素节点
vdomCreate("br", null, 1); // 自闭合元素
vdomCreate(viewId, 0, [children]); // 根节点
```

`vdomCreate` 在构建时做了大量预处理，把信息冗余存储到节点上供 diff 使用：

```ts
export function vdomCreate(tag, props?, children?, specials?): VDomNode {
  if (!tag) {
    return {
      tag: children ? SPLITTER : V_TEXT_NODE, // SPLITTER = 原始 HTML 节点
      html: String(props ?? ""),
    };
  }

  // ...
  let attrs = `<${tag}`;

  // 1. 处理子节点：序列化 innerHTML、合并相邻文本、收集 reused key、传播 views
  if (children && children !== 1) {
    for (const c of children as VDomNode[]) {
      if (c.attrs !== undefined) {
        innerHTML += c.attrs + (c.selfClose ? "/>" : `>${c.html}</${c.tag}>`);
      } else {
        if (c.tag === V_TEXT_NODE) innerHTML += encodeHTML(c.html);
        else innerHTML += c.html;
      }
      // 相邻文本节点合并
      if (c.tag === V_TEXT_NODE && prevChild && prevChild.tag === V_TEXT_NODE) {
        prevChild.html += c.html;
      } else {
        if (!newChildren) newChildren = [];
        newChildren.push(c);
        prevChild = c;
      }
      // 收集/向上传播 reused key 与子视图引用
      if (c.compareKey) {
        /* reused[key]++ */
      }
      if (c.reused) {
        /* 累加到父级 reused */
      }
      if (c.views) {
        viewList.push(...c.views);
      }
    }
  }

  // 2. 处理 props：布尔/null 过滤、compareKey 提取、v-lark 检测、属性序列化
  for (const prop in propsObj) {
    let value = propsObj[prop];
    if (value === false || value == null) {
      /* 删除 */ continue;
    } else if (value === true) {
      propsObj[prop] = value = specialsObj[prop] ? value : "";
    }

    if ((prop === "#" || prop === "id") && !compareKey) {
      compareKey = value as string;
      if (prop !== "id") {
        delete propsObj[prop];
        continue;
      } // # 是纯 key，不渲染
    }

    if (prop === LARK_VIEW && value) {
      const parsed = parseUri(value as string);
      isLarkView = parsed.path;
      viewList.push([isLarkView, propsObj["lark-owner"], value, parsed.params]);
      if (!compareKey) compareKey = tag + SPLITTER + isLarkView;
    }

    if (prop === "value" && tag === "textarea") {
      innerHTML = String(value); // textarea 的 value 写成 innerHTML
      delete propsObj[prop];
      continue;
    }

    attrs += ` ${prop}="${value && encodeHTML(value)}"`;
  }

  return {
    tag,
    html: innerHTML,
    attrs,
    attrsMap: propsObj,
    attrsSpecials: specialsObj,
    hasSpecials,
    children: newChildren,
    compareKey,
    reused,
    reusedTotal,
    views: viewList,
    selfClose: unary,
    isLarkView,
  };
}
```

每个 VDomNode 同时持有：

- `attrs`：序列化的开始标签字符串（用于快速相等判断）
- `html`：序列化的 innerHTML（用于快速相等判断与首屏直出）
- `attrsMap`：结构化属性表（用于精确 diff）
- `compareKey`：来自 `#` 或 `id`，diff 的身份标识
- `views`：子视图引用列表（供 mountZone 使用）

这种「双表示」设计让 diff 可以先用字符串比较 O(1) 短路，只在不等时才走结构化 diff。

## 2. isSameVDomNode：节点匹配谓词

```ts
function isSameVDomNode(a: VDomNode, b: VDomNode): boolean {
  return (
    (a.compareKey && b.compareKey === a.compareKey) || // key 相同
    (!a.compareKey && !b.compareKey && a.tag === b.tag) || // 都无 key 且标签相同
    a.tag === SPLITTER || // 原始 HTML 节点
    b.tag === SPLITTER
  );
}
```

## 3. vdomSetChildNodes：三阶段 diff

这是 VDOM 模式的核心。入口有两个快速路径：

```ts
export function vdomSetChildNodes(realNode, lastVDom, newVDom, ref, frame, keys, view, ready) {
  // 首屏快速路径：无旧树，直接 innerHTML 直出
  if (!lastVDom) {
    ref.changed = 1;
    realNode.innerHTML = newVDom.html;
    callFunction(ready, []);
    return;
  }

  // 完全相等快速路径：序列化 HTML 相同则整体跳过
  if (lastVDom.html === newVDom.html) {
    callFunction(ready, []);
    return;
  }
  // ...
```

**首屏直出**是 VDOM 模式的重要优化：第一次渲染没有旧树可 diff，直接用 `vdomCreate` 阶段序列化好的 `html` 一次性 `innerHTML`，跳过了逐节点 `createElement`。

### 快照旧 DOM 引用

任何变更之前，先把旧子节点引用全部快照到数组——后续 `insertBefore`/`removeChild` 会改变 NodeList 的位置，快照保证始终知道哪些 DOM 节点属于旧树：

```ts
const oldDomNodes: ChildNode[] = new Array(oldLen);
for (let i = 0; i < oldLen; i++) {
  oldDomNodes[i] = nodes[i] as ChildNode;
}
const usedOldDomNodes = new Set<ChildNode>(); // 记录被复用的旧节点
```

### 阶段一：头部快速路径

从前往后匹配相同节点，命中的只做原地更新，不产生 DOM 移动：

```ts
while (headIdx <= tailIdx && newHead <= newTail) {
  const oc = oldChildren![headIdx];
  const nc = newChildren![newHead];
  if (!isSameVDomNode(nc, oc)) break;
  if (nc.tag === SPLITTER || oc.tag === SPLITTER) break;

  vdomSetNode(
    oldDomNodes[headIdx],
    realNode,
    oc,
    nc,
    ref,
    frame,
    keys,
    view,
    ready,
  );
  usedOldDomNodes.add(oldDomNodes[headIdx]);
  headIdx++;
  newHead++;
}
```

### 阶段二：尾部快速路径

从后往前匹配，逻辑对称：

```ts
while (headIdx <= tailIdx && newHead <= newTail) {
  const oc = oldChildren![tailIdx];
  const nc = newChildren![newTail];
  if (!isSameVDomNode(nc, oc)) break;
  if (nc.tag === SPLITTER || oc.tag === SPLITTER) break;

  vdomSetNode(
    oldDomNodes[tailIdx],
    realNode,
    oc,
    nc,
    ref,
    frame,
    keys,
    view,
    ready,
  );
  usedOldDomNodes.add(oldDomNodes[tailIdx]);
  tailIdx--;
  newTail--;
}

// 全部匹配完成 → 提前退出
if (headIdx > tailIdx && newHead > newTail) {
  if (ref.asyncCount === 0) callFunction(ready, []);
  return;
}
```

头尾快速路径覆盖了绝大多数实际更新场景（头部插入、尾部追加、中间少量变化），此时算法是 O(变化量) 而非 O(总量)。

### 阶段三：KeyMap + LIS 协调

剩余未匹配的区间进入完整协调。先为剩余旧节点建 key 索引：

```ts
const keyMap: Record<
  string,
  Array<{ domNode: ChildNode; vdomNode: VDomNode }>
> = {};
for (let i = headIdx; i <= tailIdx; i++) {
  const c = oldChildren![i];
  if (c?.compareKey) {
    if (!keyMap[c.compareKey]) keyMap[c.compareKey] = [];
    keyMap[c.compareKey].push({ domNode: oldDomNodes[i], vdomNode: c });
  }
}
```

然后为每个剩余新节点计算它在旧列表中的位置，得到 `sequence` 数组（无匹配为 -1）：

```ts
const sequence: number[] = new Array(newRemaining);
for (let i = 0; i < newRemaining; i++) {
  const nc = newChildren![newHead + i];
  const entries = nc.compareKey ? keyMap[nc.compareKey] : undefined;
  if (entries && entries.length > 0) {
    const entry = entries.shift()!; // 重复 key 依次消费
    if (entries.length === 0) delete keyMap[cKey!];
    const oldIdx = oldChildren!.indexOf(entry.vdomNode, headIdx);
    sequence[i] = oldIdx >= 0 ? oldIdx : -1;
    usedOldDomNodes.add(entry.domNode);
  } else {
    sequence[i] = -1;
  }
}
```

两个短路分支处理退化情况：新列表耗尽（删除所有剩余旧节点）、旧列表耗尽（插入所有剩余新节点）。

### LIS：最小化 DOM 移动

核心洞察：`sequence` 的**最长递增子序列**对应的节点，其相对顺序在新旧列表中一致，**无需移动**。其余节点才需要 `insertBefore`。N 个节点最多只需 N - L 次移动（L 为 LIS 长度）。

```ts
function computeLIS(sequence: number[]): number[] {
  const len = sequence.length;
  if (len === 0) return [];

  const result: number[] = [];
  const tails: number[] = []; // tails[i] = 长度 i+1 的 LIS 的最小尾元素下标
  const predecessors: number[] = new Array(len);
  let lisLength = 0;

  for (let i = 0; i < len; i++) {
    const value = sequence[i];
    if (value < 0) continue; // 跳过未匹配项

    // 二分查找：最左侧尾值 >= 当前值的位置
    let lo = 0,
      hi = lisLength;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sequence[tails[mid]] < value) lo = mid + 1;
      else hi = mid;
    }

    tails[lo] = i;
    predecessors[i] = lo > 0 ? tails[lo - 1] : -1;
    if (lo === lisLength) lisLength++;
  }

  // 回溯重建 LIS 下标
  let cursor = tails[lisLength - 1];
  for (let i = lisLength - 1; i >= 0; i--) {
    result[i] = cursor;
    cursor = predecessors[cursor];
  }
  return result;
}
```

这是经典的 **patience sorting** 算法：`tails` 数组维护各长度 LIS 的最小尾值，二分查找保证 O(n log n)；`predecessors` 记录前驱用于回溯。例如 `sequence = [2, -1, 0, 3]` 返回 `[0, 3]`（对应值 `[2, 3]`）。

### 反向插入

有了 LIS，从后往前遍历剩余新节点。`nextNode` 始终是当前节点的正确插入锚点（它后面应该紧邻的 DOM 节点）——反向遍历让每个处理过的节点自然成为下一个的锚点：

```ts
const lis = computeLIS(sequence);
let lisCursor = lis.length - 1;
let nextNode: ChildNode | null = tailIdx + 1 < oldLen ? oldDomNodes[tailIdx + 1] : null;

for (let j = newRemaining - 1; j >= 0; j--) {
  const nc = newChildren![newHead + j];

  if (lisCursor >= 0 && lis[lisCursor] === j) {
    // LIS 位置：相对顺序已正确，只原地更新，不移动
    const oldIdx = sequence[j];
    vdomSetNode(oldDomNodes[oldIdx], realNode, oldChildren![oldIdx], nc, ...);
    nextNode = oldDomNodes[oldIdx];
    lisCursor--;
  } else if (sequence[j] >= 0) {
    // 匹配但不在 LIS：移动到正确位置
    const oldIdx = sequence[j];
    ref.changed = 1;
    realNode.insertBefore(oldDomNodes[oldIdx], nextNode);
    vdomSetNode(oldDomNodes[oldIdx], realNode, oldChildren![oldIdx], nc, ...);
    nextNode = oldDomNodes[oldIdx];
  } else {
    // 无匹配：创建新节点并插入
    ref.changed = 1;
    const newNode = vdomCreateNode(nc, realNode, ref);
    realNode.insertBefore(newNode, nextNode);
    nextNode = newNode;
  }
}

// 清理未被复用的旧节点（用快照引用，而非活动 NodeList）
for (let i = 0; i < oldLen; i++) {
  const domNode = oldDomNodes[i];
  if (domNode && !usedOldDomNodes.has(domNode) && domNode.parentNode === realNode) {
    domUnmountFrames(frame, domNode);
    ref.changed = 1;
    realNode.removeChild(domNode);
  }
}

// ready 回调延迟到调度队列执行
if (ref.asyncCount === 0) {
  callFunction(ready, []);
}
```

最后，`ready` 回调（触发 `endUpdate`、应用 `nodeProps`、挂载子视图）通过 `callFunction` 延迟到时间分片调度队列——DOM 变更同步完成，但后处理让位给浏览器的事件处理与绘制，避免大更新阻塞交互。

## 4. vdomSetNode：单节点更新

```ts
function vdomSetNode(
  realNode,
  oldParent,
  lastVDom,
  newVDom,
  ref,
  frame,
  keys,
  rootView,
  ready,
) {
  // 文本节点：内容不同则更新 nodeValue
  if (lastTag === V_TEXT_NODE || newTag === V_TEXT_NODE) {
    if (lastTag === newTag) {
      if (lastVDom.html !== newVDom.html) {
        ref.changed = 1;
        realNode.nodeValue = newVDom.html;
      }
    } else {
      // 文本 ↔ 原始 HTML 类型不匹配 → 替换
      oldParent.replaceChild(vdomCreateNode(newVDom, oldParent, ref), realNode);
    }
    return;
  }

  if (lastTag === newTag) {
    // 原始 HTML 节点：内容变化则整体替换
    if (newTag === SPLITTER) {
      if (lastVDom.html !== newVDom.html) {
        oldParent.replaceChild(
          vdomCreateNode(newVDom, oldParent, ref),
          realNode,
        );
      }
      return;
    }

    // 快速路径：attrs + html 字符串都相等 → 子树完全没变
    if (lastVDom.attrs === newVDom.attrs && lastVDom.html === newVDom.html) {
      if (newVDom.hasSpecials) vdomSyncFormState(realNode, newVDom);
      return;
    }

    // 属性 diff
    if (lastVDom.attrs !== newVDom.attrs || newVDom.hasSpecials) {
      attrChanged = vdomSetAttributes(realNode, newVDom, ref, lastVDom);
    }

    // 子视图保护：同路径则不深入
    let updateChildren = true;
    if (newVDom.isLarkView) {
      const oldFrameId = realNode.getAttribute("id") || "";
      if (oldFrameId && newVDom.isLarkView === (lastVDom.isLarkView || "")) {
        updateChildren = false;
      }
    }

    vdomSyncFormState(realNode, newVDom); // 表单状态同步

    if (updateChildren && !newVDom.selfClose) {
      vdomSetChildNodes(
        realNode,
        lastVDom,
        newVDom,
        ref,
        frame,
        keys,
        rootView,
        ready,
      );
    }
  } else {
    // 标签不同 → 整体替换
    oldParent.replaceChild(vdomCreateNode(newVDom, oldParent, ref), realNode);
  }
}
```

`attrs + html` 双字符串短路避免了 O(children) 的递归 diff 与属性遍历，是 VDOM 模式最常用的快速路径。唯一的例外是带 `hasSpecials`（DOM 属性绑定）的表单元素——用户输入可能独立于模板输出改变 `value`/`checked`，仍需 `vdomSyncFormState` 同步。

## 5. vdomCreateNode：VDomNode → 真实 DOM

```ts
export function vdomCreateNode(
  vnode: VDomNode,
  owner: Element,
  ref: VDomRef,
): ChildNode {
  const tag = vnode.tag;
  if (tag === V_TEXT_NODE) {
    return document.createTextNode(vnode.html);
  }

  if (tag === SPLITTER) {
    // 原始 HTML：用 <template> 解析，命名空间无关，
    // 与字符串模式的 innerHTML 语义一致
    const template = document.createElement("template");
    template.innerHTML = vnode.html;
    return template.content.firstChild || document.createTextNode("");
  }

  const sTag = typeof tag === "string" ? tag : tag.toString();
  const ns = VDOM_NS_MAP[sTag] || owner.namespaceURI; // svg/math 命名空间映射
  const el = document.createElementNS(ns, sTag);
  vdomSetAttributes(el, vnode, ref);
  el.innerHTML = vnode.html;
  return el;
}
```

三个要点：

- 原始 HTML 节点用 `<template>` 解析而非 `createElementNS(ns, SPLITTER)`——SPLITTER（U+001E）不是合法 XML QName，会抛 `InvalidCharacterError`。
- 命名空间通过 `VDOM_NS_MAP` 查表，svg/math 元素自动使用正确命名空间。
- 子节点不逐个创建，而是直接 `innerHTML = vnode.html`——序列化在 `vdomCreate` 阶段已完成，这里一次写入。

## 6. vdomSetAttributes 与 nodeProps 延迟应用

属性 diff 区分「特殊属性」（表单状态，作为 DOM property）与普通属性（作为 attribute）：

```ts
if (sKey) {
  // 特殊属性：与 DOM 实时值比较，检测用户交互产生的变化
  if (Reflect.get(realNode, sKey) !== value) {
    changed = 1;
    if (ref)
      ref.nodeProps.push([realNode, sKey, value]); // 延迟应用
    else Reflect.set(realNode, sKey, value);
  }
} else {
  const oldMap = lastVDom?.attrsMap;
  if (!oldMap || oldMap[key] !== value) {
    changed = 1;
    realNode.setAttribute(key, String(value ?? ""));
  }
}
```

特殊属性的写入被收集到 `ref.nodeProps`，在 `ready` 回调中统一应用——这确保表单状态在整个 diff 完成、子视图挂载之前写入，避免中间状态被用户看到。

---

# 两套引擎对比

| 维度      | 字符串模式                      | VDOM 模式                    |
| --------- | ------------------------------- | ---------------------------- |
| 模板产物  | HTML 字符串                     | VDomNode 树                  |
| 解析方式  | `createHTMLDocument` + wrapMeta | 无需解析（构建时已序列化）   |
| 首屏渲染  | 逐节点 diff 建立                | `innerHTML` 一次性直出       |
| diff 算法 | 键控桶匹配 + 挪位               | 头尾快速路径 + KeyMap + LIS  |
| 移动次数  | 取决于匹配顺序                  | 最优（N - L）                |
| 短路判断  | `isEqualNode`                   | `attrs + html` 字符串相等    |
| 特殊标签  | wrapMeta 包装解析               | `VDOM_NS_MAP` 命名空间映射   |
| 表单同步  | `domSpecialDiff`                | `vdomSyncFormState`          |
| 变更应用  | `applyDomOps`（四元组批量）     | 直接操作 + `nodeProps` 延迟  |
| 适用场景  | 通用、模板驱动                  | 频繁排序/插入/删除的动态列表 |

两套引擎都遵循相同的原则：**子视图边界不可侵入**（`v-lark` 保护）、**表单状态单独同步**、**变更收集后批量应用**、**frame 卸载先于 DOM 移除**。选择哪套引擎由应用特征决定——静态内容为主用字符串模式，高交互动态列表用 VDOM 模式。
