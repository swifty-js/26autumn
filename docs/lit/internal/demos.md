---
title: 内部演示
---

这是一个*仅限内部使用*的页面，用于演示将代码嵌入 Markdown 文档的各种方式。

## 语法高亮

仅对代码进行高亮显示，不可交互。使用与 playground 相同的渲染器，因此高亮样式会保持一致。

````
```js
html`<h1>Hello ${name}</h1>`
```
````

```js
html`<h1>Hello ${name}</h1>`;
```

## 单文件示例

来自项目的单个可编辑文件，预览显示在正下方。

参数：

1. 项目目录相对于 `samples/PATH/project.json` 的路径。
2. 要显示的项目中的文件名。

额外的 `project.json` 配置选项：

- `previewHeight`：预览区域的高度，以像素为单位（默认 `120px`）。

```
{% raw %}{% playground-example "v3-docs/templates/define" "my-element.ts" %}{% endraw %}
```

{% playground-example "v3-docs/templates/define" "my-element.ts" %}

## 完整 IDE

完全可编辑的 playground 项目，预览显示在侧边。

参数：

1. （必需）项目目录相对于 `samples/PATH/project.json` 的路径。

```
{% raw %}{% playground-ide "v3-docs/templates/define" %}{% endraw %}
```

{% playground-ide "v3-docs/templates/define" %}

## 包版本

在你的 `project.config` 中使用 `extends` 来继承站点基础配置，该配置将导入解析到 `lit-next`：

```json
{
  "extends": "/samples/v3-base.json"
}
```
