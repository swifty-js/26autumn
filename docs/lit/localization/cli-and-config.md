---
title: 本地化 CLI 和配置
eleventyNavigation:
  key: CLI and config
  parent: Localization
  order: 4
versionLinks:
  v2: localization/cli-and-config/
---

## CLI

```sh
lit-localize command [--flags]
```

### 命令

<br>

| 命令      | 描述                                                                                     |
| --------- | ---------------------------------------------------------------------------------------- |
| `extract` | 从所有输入文件中提取 `msg` 调用，并创建或更新 XLIFF（`.xlf`）文件。                      |
| `build`   | 使用已配置的[模式](/docs/v3/localization/overview/#output-modes)将翻译整合回你的应用中。 |

### 标志

<br>

| 标志       | 描述                                                              |
| ---------- | ----------------------------------------------------------------- |
| `--help`   | 显示用法帮助信息。                                                |
| `--config` | JSON [配置文件](#config-file)的路径。默认为 `./lit-localize.json` |

## 配置文件

### 通用设置

<div class="alert alert-info">

所有文件路径均相对于配置文件的位置。

</div>

<dl class="params">
  <dt class="paramName">sourceLocale</dt>
  <dd class="paramDetails">
    <code class="paramType">string</code>
    <p><em>必填</em></p>
    <p>源代码中模板所使用的语言区域代码。</p>
  </dd>

  <dt class="paramName">targetLocales</dt>
  <dd class="paramDetails">
    <code class="paramType">string[]</code>
    <p><em>必填（可以为空）</em></p>
    <p>模板将被本地化到的语言区域代码。</p>
  </dd>

  <dt class="paramName">inputFiles</dt>
  <dd class="paramDetails">
    <code class="paramType">string[]</code>
    <p><em>除非指定了 <code>tsConfig</code>，否则必填</em></p>
    <p>文件名或
    <a href="https://github.com/mrmlnc/fast-glob#pattern-syntax" target="_blank" rel="noopener">
    glob</a> 模式的数组，用于匹配要从中提取消息的 JavaScript 或 TypeScript 文件。</p>
    <p>如果同时指定了 <code>tsConfig</code> 和 <code>inputFiles</code>，则
    <code>inputFiles</code> 优先。</p>
  </dd>

  <dt class="paramName">tsConfig</dt>
  <dd class="paramDetails">
    <code class="paramType">string</code>
    <p><em>除非指定了 <code>inputFiles</code>，否则必填</em></p>
    <p><code>tsconfig.json</code> 或 <code>jsconfig.json</code> 文件的路径，
    该文件描述了将从中提取消息的 JavaScript 或 TypeScript 文件，
    以及在转换模式下构建时将使用的编译器选项。</p>
    <p>如果同时指定了 <code>tsConfig</code> 和 <code>inputFiles</code>，则
    <code>inputFiles</code> 优先。</p>
  </dd>

  <dt class="paramName">output.mode</dt>
  <dd class="paramDetails">
    <code class="paramType">"transform" | "runtime"</code>
    <p><em>必填</em></p>
    <p>应生成何种类型的输出。参阅
    <a href="/docs/localization/overview/#output-modes">模式</a>。</p>
  </dd>

  <dt class="paramName">output.localeCodesModule</dt>
  <dd class="paramDetails">
    <code class="paramType">string</code>
    <p><em>可选</em></p>
    <p>生成的 JavaScript 或 TypeScript 模块的文件路径，该模块使用配置文件中的语言区域代码导出
       <code>sourceLocale</code>、<code>targetLocales</code> 和
       <code>allLocales</code>。
      用于保持配置文件和客户端配置的同步。</p>
    <p>此路径应以 <code>".js"</code> 或
       <code>".ts"</code> 结尾。如果以 <code>".js"</code> 结尾，
       则会输出为 JavaScript 模块。如果以 <code>".ts"</code> 结尾，
       则会输出为 TypeScript 模块。</p>
  </dd>

  <dt class="paramName">interchange.format</dt>
  <dd class="paramDetails">
    <code class="paramType">"xliff" | "xlb"</code>
    <p><em>必填</em></p>
    <p>你的本地化流程所使用的数据格式。选项：
      <ul>
        <li><code>"xliff"</code>：
          <a href="https://docs.oasis-open.org/xliff/v1.2/os/xliff-core.html"
            target="_blank" rel="noopener">XLIFF 1.2</a> XML 格式</li>
        <li><code>"xlb"</code>：Google 内部 XML 格式</li>
      </ul>
    </p>
  </dd>
</dl>

### 运行时模式设置

<dl class="params">
  <dt class="paramName">output.outputDir</dt>
  <dd class="paramDetails">
    <code class="paramType">string</code>
    <p><em>必填</em></p>
    <p>生成模块的输出目录。会为每个
       <code>targetLocale</code> 生成一个
       <code>&lt;locale&gt;.[js|ts]</code> 文件。每个文件是一个模块，
       按消息 ID 为键导出该语言区域的翻译。</p>
  </dd>

  <dt class="paramName">output.language</dt>
  <dd class="paramDetails">
    <code class="paramType">"js" | "ts"</code>
    <p><em>默认为 <code>"js"</code>，如果指定了
    <code>tsConfig</code> 则默认为 <code>"ts"</code>。</em></p>
    <p>生成模块所使用的语言。</p>
  </dd>

</dl>

### 转换模式设置

<dl class="params">
  <dt class="paramName">output.outputDir</dt>
  <dd class="paramDetails">
    <code class="paramType">string</code>
    <p><em>除非指定了 <code>tsConfig</code>（此时默认为该文件的
    <code>outDir</code>），否则必填。如果两者都指定了，则此字段优先。</em></p>
    <p>生成模块的输出目录。在此目录中会为每个语言区域创建一个子目录，
    每个子目录包含该项目在该语言区域下的完整构建。</p>
  </dd>

</dl>

### XLIFF 模式设置

<dl class="params">
  <dt class="paramName">interchange.xliffDir</dt>
  <dd class="paramDetails">
    <code class="paramType">string</code>
    <p><em>使用 <code>"mode": "xliff"</code> 时必填</em></p>
    <p>磁盘上用于读取/写入 <code>.xlf</code> XML 文件的目录。对于每个目标
    语言区域，将使用路径 <code>&lt;xliffDir>/&lt;locale>.xlf</code>。</p>
  </dd>

  <dt class="paramName">interchange.placeholderStyle</dt>
  <dd class="paramDetails">
    <code class="paramType">"x" | "ph"</code>
    <p><em>默认为 <code>"x"</code></em></p>
    <p>如何表示包含 HTML 标记和动态表达式的占位符。
    不同的本地化工具和服务对占位符语法的支持程度各不相同。</p>
  </dd>
</dl>

### XLB 模式设置

<dl class="params">
  <dt class="paramName">interchange.outputFile</dt>
  <dd class="paramDetails">
    <code class="paramType">string</code>
    <p><em>使用 <code>"mode": "xlb"</code> 时必填</em></p>
    <p>将创建的 XLB XML 文件的输出路径，该文件包含从源代码中提取的所有消息。
       例如 <code>"data/localization/en.xlb"</code>。</p>
  </dd>

  <dt class="paramName">interchange.translationsGlob</dt>
  <dd class="paramDetails">
    <code class="paramType">string</code>
    <p><em>使用 <code>"mode": "xlb"</code> 时必填</em></p>
    <p>用于从磁盘读取包含已翻译消息的 XLB XML 文件的
       <a href="https://github.com/mrmlnc/fast-glob#pattern-syntax"
          target="_blank" rel="noopener">Glob</a> 模式。例如
       <code>"data/localization/*.xlb"</code>。</p>
  </dd>
</dl>
