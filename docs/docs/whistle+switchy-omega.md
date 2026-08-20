# whistle + SwitchyOmega 本地代理调试指南

把线上域名 `https://example.org/` 的请求代理到本地 Next.js dev server( `127.0.0.1:3000`) , 实现在线上域名下调试本地代码.

## 目标与最终效果

- 浏览器访问 `https://example.org/`, 实际渲染的是本地 `npm run dev` 起的页面.
- 域名、cookie、登录态都与线上一致, 方便调试依赖域名/鉴权的功能.
- 本地代码改动即时生效( dev server 热更新) .

## 涉及的角色

| 角色               | 是什么                                  | 本机位置                                                  |
| ------------------ | --------------------------------------- | --------------------------------------------------------- |
| whistle            | 代理服务器, 负责拦截并转发请求          | `/Users/hangtiancheng/Library/pnpm/bin/whistle`( v2.10.8) |
| SwitchyOmega       | Chrome 扩展, 让浏览器把流量交给 whistle | Chrome 扩展商店安装                                       |
| Next.js dev server | 本地应用, 监听 3000 端口                | `npm run dev`( `next dev -H 0.0.0.0`)                     |

---

## 一、安装 whistle

whistle 是一个基于 Node.js 的跨平台抓包/代理工具. 用 pnpm 全局安装:

```bash
pnpm add -g whistle
```

安装后二进制在 `/Users/hangtiancheng/Library/pnpm/bin/whistle`.

常用命令:

```bash
whistle start    # 启动
whistle stop     # 停止
whistle restart  # 重启
whistle status   # 查看状态
```

启动后管理界面在 http://127.0.0.1:8899/, 默认代理端口也是 8899.

---

## 二、安装 SwitchyOmega

SwitchyOmega 是 Chrome 的代理管理扩展, 作用是让浏览器把请求发给 whistle, 而不是直连网络.

1. 打开 Chrome 扩展商店, 搜索 Proxy SwitchyOmega 并安装.
2. 安装后浏览器右上角出现扩展图标.

> 说明: macOS 系统代理是全局的, 改起来影响所有应用且切换麻烦. SwitchyOmega 可以按情景模式一键切换, 调试完切回「直接连接」即可, 不影响日常上网, 所以推荐用它而非系统代理.

---

## 三、配置 whistle

### 3.1 添加转发规则

打开管理页 `http://127.0.0.1:8899/` → 顶部 Rules 标签 → 左侧选中 `Default` 规则组 → 右侧编辑区写入:

```
example.org 127.0.0.1:3000
```

- 规则格式: `匹配模式 目标地址`, 中间用空格分隔.
- 目标地址写 `host:port` 即可, whistle 默认按 HTTP 转发, 无需写 `http://` 前缀.
- 这条规则把发往 `example.org` 的所有请求转到本地 3000 端口.

确保 `Default` 规则组前面的勾选框是勾上的( 表示启用) , 保存.

只代理部分路径、其余走线上的写法:

```
example.org/api/ 127.0.0.1:3000
```

### 3.2 开启 HTTPS 拦截( 代理 https 时必需)

顶部 HTTPS 标签 → 勾选 `Capture TUNNEL CONNECTs`.

不勾这个, whistle 对 https 只做隧道透传, 无法把流量劫持到本地( 原理见最后一节) .

---

## 四、下载并信任根证书( 代理 https 时必需)

whistle 拦截 https 时会用自己的根证书动态签发目标域名的证书. 系统必须信任这张根证书, 浏览器才不会报证书错误.

### 方式 A: 脚本一步到位( 推荐)

仓库里已有 `trust-whistle-cert.sh`:

```bash
./trust-whistle-cert.sh
```

脚本会定位 whistle 根证书 `~/.WhistleAppData/.whistle/certs/root.crt`, 并用 `security add-trusted-cert` 装进系统钥匙串设为「始终信任」. 需要输入 sudo 密码.

> 证书文件由 whistle 首次启动时自动生成. 如果提示找不到, 先 `whistle start` 跑一次再执行脚本.

### 方式 B: 手动

1. whistle 管理页 → HTTPS 标签 → 点 `Download RootCA` 下载 `rootCA.crt`.
2. 命令行信任:

```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain ~/Downloads/rootCA.crt
```

3. 打开「钥匙串访问」确认该证书状态为「始终信任」.

这一步是一次性的, 装完永久生效.

---

## 五、配置 SwitchyOmega

1. 点 SwitchyOmega 扩展图标 → 选项.
2. 左侧 新建情景模式, 名字随意( 如 `whistle`) , 类型选「代理服务器」.
3. 在新情景模式的「代理协议」区域填写:

   | 字段       | 值        |
   | ---------- | --------- |
   | 代理协议   | HTTP      |
   | 代理服务器 | 127.0.0.1 |
   | 代理端口   | 8899      |

   「不代理的地址列表」留空即可. 点左侧 应用选项 保存.

4. 点扩展图标, 在弹出菜单里选中刚建的情景模式( 高亮那项即当前激活) .

> 协议必须选 HTTP, 不要选 HTTPS 或 SOCKS5——浏览器到 whistle 这一跳走的是 HTTP 代理协议, whistle 内部再决定如何处理目标请求.

验证: 访问 `https://example.org/`, 应显示本地 dev server 页面, 且地址栏锁标志正常( 无证书警告) .

---

## 六、本地 dev server 的配套改动

Next.js 16 的 dev server 会校验请求的 `Host` 头, 不在白名单里的域名会被拒绝. 线上域名 `example.org` 需要加进 `next.config.ts` 的 `allowedDevOrigins`:

```ts
const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [...getLocalIPs(), "example.org"],
};
```

然后 `npm run dev` 起服务( 监听 3000 端口) .

---

## 七、一键启动脚本

仓库里的 `dev.sh` 把启动 whistle + 带代理的 Chrome Dev 整合成一步:

```bash
./dev.sh
```

脚本逻辑:

1. 检查 whistle 是否在运行, 没运行就 `whistle start`.
2. 用命令行参数 `--proxy-server="http://127.0.0.1:8899"` 启动 Chrome Dev, 绕开 SwitchyOmega.
3. 用持久化 profile 目录 `~/.chrome-whistle-dev`, 登录态会保留, 不用每次重登.
4. 自动打开 `https://example.org/`.

> 这个脚本用命令行硬编码代理, 适合不想依赖扩展、或扩展状态不稳定时使用. 它和 SwitchyOmega 是两种等价方案, 二选一即可. 注意本地 dev server 仍需自己 `npm run dev`.

---

## 八、背后的基础原理

### 8.1 代理服务器是什么

正常上网: 浏览器 → 目标服务器.
走代理: 浏览器 → 代理服务器( whistle) → 目标服务器.

浏览器把所有请求先交给 whistle, 由 whistle 决定「转发给谁」. whistle 根据 Rules 规则匹配请求, 命中 `example.org 127.0.0.1:3000` 就把请求转给本地, 而不是线上. 这就是「把线上域名指向本地」的本质——改的是请求的转发目标, 不是 DNS, 也不是真的改了线上服务.

SwitchyOmega 的职责仅仅是「告诉浏览器: 你的代理是 127.0.0.1:8899」. 它不参与转发逻辑, 转发全在 whistle.

### 8.2 HTTP 与 HTTPS 代理的区别( 关键)

HTTP 请求: 浏览器发给代理的是明文请求行, 比如 `GET http://example.org/ HTTP/1.1`. whistle 能直接看到目标域名和路径, 于是按规则改写转发目标即可. 简单直接.

HTTPS 请求: 浏览器不会把明文 URL 给代理, 而是先发一个 `CONNECT example.org:443` 指令, 要求代理「建立一条到目标的原始 TCP 隧道」. 一旦隧道建立, 后续全是加密的 TLS 数据, 代理只是字节透传, 看不到域名以外的任何内容( 路径、body 都没有) , 更无法改写.

如果 whistle 对 https 也只做隧道透传, 那 `example.org` 的流量会被原样送到线上真实服务器, 本地代理就失效了.

### 8.3 中间人( MITM) 与证书信任

要把 https 流量劫持到本地, whistle 必须做中间人解密( Man-In-The-Middle) :

1. 浏览器发 `CONNECT example.org:443`.
2. whistle 不建立隧道, 而是冒充 `example.org`, 用它的根证书动态签发一张 `example.org` 的假证书, 跟浏览器完成 TLS 握手.
3. 浏览器以为在和真服务器通话, 把请求明文( 在 TLS 层解密后) 交给 whistle.
4. whistle 看到完整请求, 按规则转发到本地 `127.0.0.1:3000`( 本地是普通 HTTP, TLS 由 whistle 在代理层终结) .

第 2 步里浏览器会校验证书: 如果签发 `example.org` 证书的根 CA 不在系统信任列表, 浏览器就报证书错误、拒绝连接. 所以必须把 whistle 根证书装进系统并设为「始终信任」( 第四节做的事) . 信任之后, whistle 签的假证书就被浏览器认可, 整个 MITM 链路畅通无阻.

这就是为什么:

- 代理 http 不需要装证书( 明文可见, 无需解密) .
- 代理 https 必须装证书 + 开 `Capture TUNNEL CONNECTs`( 否则 whistle 不解密、只透传) .

### 8.4 Host 头与 allowedDevOrigins

请求转到本地后, HTTP 请求头里的 `Host: example.org` 保持不变( whistle 转发时保留原 Host) . Next.js dev server 出于安全( 防 DNS rebinding 攻击) 会校验 Host 是否在 `allowedDevOrigins` 白名单里, 不在就拒绝. 所以需要把 `example.org` 加进白名单( 第六节) .

### 8.5 整条链路串起来

```
浏览器 (https://example.org/)
   │  SwitchyOmega 指定代理 127.0.0.1:8899
whistle (127.0.0.1:8899)
   │  规则命中 example.org → 127.0.0.1:3000
   │  MITM 解密 TLS( 依赖已信任的根证书)
Next.js dev server (127.0.0.1:3000)
   │  校验 Host: example.org( 依赖 allowedDevOrigins)
返回本地页面 → whistle 重新加密 → 浏览器渲染
```

---

## 附: 常见问题

- `ERR_PROXY_CONNECTION_FAILED`: 浏览器连不上代理本身. 检查 whistle 是否在运行( `whistle status`) 、SwitchyOmega 协议/端口是否填对( HTTP / 127.0.0.1 / 8899) 、是否装了多个 Chrome 版本导致扩展不在当前版本里.
- 证书警告 / 连接不安全: 根证书没装或没设为「始终信任」, 重跑 `./trust-whistle-cert.sh`.
- 页面 404 / 被 Next.js 拒绝: `allowedDevOrigins` 没加域名, 或 dev server 没重启.
- https 还是打到线上: `Capture TUNNEL CONNECTs` 没勾, 或规则没加 `enable://intercept`( 未开全局拦截时) .
