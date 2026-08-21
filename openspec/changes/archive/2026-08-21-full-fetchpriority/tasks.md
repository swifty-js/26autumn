## 1. 依赖安装

- [x] 1.1 安装 node-html-parser 为 devDependency (pnpm add -D node-html-parser --registry=https://registry.npmjs.org/), 验证 package.json 中出现该依赖且 node_modules 中可正常 import

## 2. 配置接口与默认值

- [x] 2.1 在 vite.config.ts 中定义 PriorityHintsOptions 接口和 ResourceType 类型, 包含 priorities/preconnect/dnsPrefetch/firstImageCount 字段, 验证 TypeScript 编译无报错
- [x] 2.2 定义默认配置常量 DEFAULT_OPTIONS: script=high, stylesheet=high, font=high, modulepreload=low, image 按位置, firstImageCount=1, 验证类型推导正确

## 3. 核心插件重构

- [x] 3.1 将 priorityHintsPlugin 的 transformIndexHtml 从正则替换改为 node-html-parser 的 parse + querySelectorAll 实现, 处理 script[type=module] 和 link[rel=stylesheet] 标注 fetchpriority, 验证构建产物 HTML 中这两类标签携带正确属性
- [x] 3.2 处理 link[rel=modulepreload] 标注 fetchpriority="low", 验证构建产物中 modulepreload 标签属性正确
- [x] 3.3 处理 link[rel=preload][as=font] 标注 fetchpriority="high", 验证当 HTML 中存在 font preload 标签时属性被正确添加
- [x] 3.4 处理 img 标签: 前 firstImageCount 个标注 fetchpriority="high" + loading="eager", 其余标注 fetchpriority="low" + loading="lazy", 验证含 img 的 HTML 片段处理结果正确

## 4. 连接层提示注入

- [x] 4.1 实现 preconnect/dnsPrefetch 配置项, 在 transformIndexHtml 中向 head 注入对应的 link 标签 (preconnect 携带 crossorigin), 验证配置了域名时 HTML head 中出现正确标签, 未配置时无额外标签

## 5. 验证与回归

- [x] 5.1 运行 pnpm build, diff 构建产物 HTML 与重构前版本, 确认 script/stylesheet/modulepreload 三类标签的 fetchpriority 属性与原有正则实现结果一致
- [x] 5.2 运行 pnpm dev 启动开发服务器, 在浏览器中检查页面正常渲染, 控制台无报错, Network 面板中资源请求携带正确优先级
