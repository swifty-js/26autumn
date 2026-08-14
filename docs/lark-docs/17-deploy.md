---
title: 部署
sidebar_position: 16
description: 生产构建与各种静态托管平台的部署指南
---

# 部署

Lark Docs 的构建产物只包含 HTML、CSS、JavaScript 和静态资源文件，无需服务端运行时，可以部署到任何静态文件托管服务。

::: warning 它是 SPA，不是 SSG
Lark Docs **没有预渲染/SSG 能力** —— 产物里只有**一个** `index.html`，每个文档页面都是运行时由 JS 动态 `import()` 加载并插入 DOM 的。因此：

- **必须配置 SPA fallback**（所有未命中文件的路径回退到 `index.html`），否则直接访问子路由会 404
- 搜索引擎看到的初始 HTML 不含文档正文（对 SEO 不利）
- 也没有内置的 sitemap / RSS 生成，也没有 CLI（`package.json` 无 `bin`）；构建完全由你自己的 Vite/Webpack/Rspack 配置驱动
  :::

## 生产构建

### 构建命令

```bash
npm run build
# 或
vite build
```

### 构建产物

下例输出到 `dist-docs/`，这由你自己的 `vite.config.ts` 中 `build.outDir` 决定（lark-docs 不提供也不读取 `outDir` 配置）：

```
dist-docs/
├── index.html                 # 唯一的 HTML（所有路由的 fallback）
├── assets/
│   ├── index-[hash].js       # 主 bundle（框架 + 主题 + 路由）
│   ├── index-[hash].css      # 样式（Tailwind + 主题）
│   ├── [page-a]-[hash].js    # 页面 A 编译产物
│   ├── [page-b]-[hash].js    # 页面 B 编译产物
│   └── ...                   # 每个 .md 文件一个 chunk
├── favicon.svg               # 来自 public/
├── images/                   # 来自 public/
├── sw.js                     # Service Worker（仅当你自行配置了 vite-plugin-pwa）
└── manifest.webmanifest      # PWA 清单（同上）
```

### 本地预览

```bash
npm run preview
# 或
vite preview
```

在 `http://localhost:4173` 预览生产构建。

## 关键要求：SPA Fallback

由于 Lark Docs 使用 **history 模式路由**，所有未匹配到实际文件的路径都必须返回 `index.html`。这是部署的核心要求。

例如，用户直接访问 `/docs/guide/introduction` 时：

- 服务器上不存在 `docs/guide/introduction` 文件
- 服务器必须返回 `index.html`
- 客户端 JavaScript 接管路由，加载对应页面内容

## Base URL 配置

部署前确保两个 base 配置一致：

### 应用路由前缀

```ts
// lark-docs.config.ts
defineConfig({
  baseUrl: "/docs/", // 路由前缀
});
```

### 静态资源前缀

```ts
// vite.config.ts
export default defineConfig({
  base: "/docs/", // 资源 URL 前缀
});
```

::: warning
如果站点部署在子路径下（如 `https://example.com/docs/`），两个配置都必须设置为 `/docs/`。如果部署在根路径，两者都设为 `/`。
:::

## 静态托管

### Nginx

```nginx
server {
    listen 80;
    server_name docs.example.com;
    root /var/www/docs;
    index index.html;

    # SPA fallback
    location /docs/ {
        try_files $uri $uri/ /docs/index.html;
    }

    # 静态资源缓存（带 hash 的文件可长期缓存）
    location /docs/assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # HTML 不缓存（确保更新及时生效）
    location ~ \.html$ {
        expires -1;
        add_header Cache-Control "no-cache";
    }
}
```

### Apache

```apache
# .htaccess
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /docs/
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /docs/index.html [L]
</IfModule>
```

### Caddy

```caddyfile
docs.example.com {
    root * /var/www/docs
    try_files {path} /docs/index.html
    file_server

    @assets path /docs/assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
}
```

## 平台托管

### GitHub Pages

```yaml
# .github/workflows/deploy.yml
name: Deploy Docs
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist-docs
      - uses: actions/deploy-pages@v4
```

配置 `baseUrl` 和 `base` 为仓库路径：

```ts
// lark-docs.config.ts
defineConfig({ baseUrl: "/repo-name/" });

// vite.config.ts
export default defineConfig({ base: "/repo-name/" });
```

### Netlify

```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = "dist-docs"

[[redirects]]
  from = "/docs/*"
  to = "/docs/index.html"
  status = 200
```

### Vercel

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist-docs",
  "rewrites": [{ "source": "/docs/(.*)", "destination": "/docs/index.html" }]
}
```

### Cloudflare Pages

```
构建命令：npm run build
输出目录：dist-docs
```

在 `_redirects` 文件中添加：

```
/docs/*  /docs/index.html  200
```

## CDN 部署

### 缓存策略

| 文件类型                 | 缓存时间          | 说明                               |
| ------------------------ | ----------------- | ---------------------------------- |
| `assets/*-[hash].js/css` | 1 年（immutable） | 文件名含 hash，内容变化时 URL 变化 |
| `index.html`             | 不缓存            | 入口文件必须每次获取最新版本       |
| `sw.js`                  | 不缓存            | Service Worker 更新检测            |
| 图片/字体                | 30 天             | 按需调整                           |
| `manifest.webmanifest`   | 1 天              | PWA 清单                           |

### 阿里云 OSS + CDN

```bash
# 上传构建产物
ossutil cp -r dist-docs/ oss://my-bucket/docs/ --update

# 设置缓存规则
# assets/ 目录：Cache-Control: public, max-age=31536000, immutable
# index.html：Cache-Control: no-cache
```

CDN 回源配置：

- 404 页面设置为 `/docs/index.html`（SPA fallback）
- 或使用 CDN 的自定义错误页面功能

### AWS S3 + CloudFront

```bash
# 上传到 S3
aws s3 sync dist-docs/ s3://my-bucket/docs/ \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html" \
  --exclude "sw.js"

aws s3 cp dist-docs/index.html s3://my-bucket/docs/index.html \
  --cache-control "no-cache"
```

CloudFront 配置：

- 默认根对象：`index.html`
- 自定义错误响应：404 → `/docs/index.html`（HTTP 200）

## CI/CD

### GitHub Actions

```yaml
name: Build and Deploy
on:
  push:
    branches: [main]
    paths:
      - "docs/**"
      - "lark-docs.config.ts"

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci --silent
      - run: npm run build
      - name: Deploy to server
        run: |
          rsync -avz --delete dist-docs/ user@server:/var/www/docs/
```

### GitLab CI

```yaml
pages:
  stage: deploy
  script:
    - npm ci
    - npm run build
    - mv dist-docs public
  artifacts:
    paths:
      - public
  only:
    - main
```

### Jenkins

```groovy
pipeline {
  agent any
  stages {
    stage('Build') {
      steps {
        sh 'npm ci'
        sh 'npm run build'
      }
    }
    stage('Deploy') {
      steps {
        sh 'aws s3 sync dist-docs/ s3://my-bucket/docs/ --delete'
        sh 'aws cloudfront create-invalidation --distribution-id XXX --paths "/docs/*"'
      }
    }
  }
}
```

## PWA 部署

### Service Worker

`vite-plugin-pwa` 虽然是 `@mm/lark-docs` 的 dependency（会被自动安装），但 **lark-docs 不会自动启用它** —— 你必须自己在 `vite.config.ts` 里显式注册 `VitePWA({...})`（见[资源处理](./09-asset-handling#vite-配置中的资源处理)）。配置后构建产物才会包含 `sw.js`：

- 预缓存所有静态资源（JS、CSS、HTML、图片、字体）
- 使用 Workbox 的 stale-while-revalidate 策略
- 自动更新（`registerType: "autoUpdate"`）

### 注意事项

- `sw.js` 必须部署在站点根路径或配置 `scope`
- Service Worker 更新需要用户刷新页面（或配置自动更新）
- 开发环境建议禁用 Service Worker（避免缓存干扰）

## 环境变量

### 构建时注入

```bash
# .env.production
VITE_BASE_URL=/docs/
VITE_ANALYTICS_ID=UA-XXXXX
```

```ts
// vite.config.ts
export default defineConfig({
  base: process.env.VITE_BASE_URL || "/",
});
```

### 多环境构建

```bash
# 开发
vite --mode development

# 预发布
vite build --mode staging

# 生产
vite build --mode production
```

## 常见问题

### 直接访问子路由 404

**原因**：服务器未配置 SPA fallback。

**解决**：确保所有未匹配路径返回 `index.html`（见上方各平台配置）。

### 静态资源加载失败

**原因**：`base` 配置与实际部署路径不一致。

**解决**：检查 `vite.config.ts` 中的 `base` 和 `lark-docs.config.ts` 中的 `baseUrl` 是否匹配部署路径。

### Service Worker 缓存旧版本

**原因**：`sw.js` 被 CDN 或浏览器缓存。

**解决**：

- 确保 `sw.js` 的响应头为 `Cache-Control: no-cache`
- CDN 不缓存 `sw.js`
- 用户强制刷新（Ctrl+Shift+R）

### 构建内存不足

对于大型文档站点（数百个页面），Shiki 高亮可能消耗较多内存：

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### 部署后搜索不工作

**原因**：搜索索引依赖动态 `import()` 加载页面模块，如果资源路径错误会加载失败。

**解决**：确保 `base` 配置正确，打开浏览器 DevTools 检查 Network 面板是否有 404 请求。
