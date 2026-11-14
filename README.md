# dsh-lab

给 DSH 的一间「实验室控制室」：把笔记本（Linux 实验机）上的东西摆到工作台边上，看得见、点得动。

写这个插件的起因很具体：有一条 `ssh -f` 开的隧道在 3888 端口上跑了几个小时，
谁都想不起来它是什么、也不敢乱杀。孤儿进程的问题不在于难修，而在于**看不见**。

## 它做什么

装好以后，输入框上方会出现一条细状态栏：

```
● 实验室  1 隧道  1 孤儿  13 远端服务      [实验室面板]
```

点开面板，四块内容：

| 区块 | 内容 | 能做什么 |
| --- | --- | --- |
| 我的隧道 | 本机端口 → 远端 host:port、PID、存活时长、状态点 | 打开、停止 |
| 孤儿监听 | 本机 ssh 进程开着但插件不认识的端口 | 一键杀掉 |
| 笔记本上的服务 | 远端 `ss -lntp` 的端口 + 进程名 | 一键开隧道 |
| 手动开隧道 | 本地端口 → 远端端口 | 开、全部停止 |

孤儿那一行标红，就是为了让「我忘了还开着一个」这件事在出事之前被看见。

## 它是怎么做到不乱留进程的

- 每个隧道都是插件的**直接子进程**：`spawn(ssh, ['-N', '-L', ...])`，**不带 `-f`**。
  `ssh -f` 会 fork 到后台并丢掉句柄，那正是当初那条孤儿隧道的成因。
- 子进程句柄存在进程内的 manager 里（挂在 `globalThis` 上，热更新也不会忘），
  `stop` 随时可用。
- 插件卸载或 DSH 退出时，`ctx.effect` 的清理函数会 `stopAll()`——隧道跟 UI 同生共死。
- 启动后等 900ms 再探一次端口：起不来就把 ssh 的 stderr 原文显示出来，而不是留一条假装在跑的记录。

## 安装

```bash
# 1) 把包链接进 profile
cmd //c "mklink /D C:\Users\<you>\.dsh\profiles\desktop\node_modules\dsh-lab D:\path\to\dsh-lab"

# 2) profile/package.json
#    dependencies 里加  "dsh-lab": "link:D:/path/to/dsh-lab"
#    dsh.profile.bundles 里加  "dsh-lab"

# 3) 重启 DSH
```

## 配置

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `host` | `lab` | `~/.ssh/config` 里的 Host 别名 |
| `suggestedRemotePorts` | `[3000, 5173, 8000, 8888]` | 面板里作为建议项列出的远端端口 |

环境变量 `DSH_LAB_HOST` 会覆盖 `host`，方便临时指到另一台机器。

## 安全

所有路由挂在 `/lab` 前缀下，并且只认 loopback：

- socket 必须是 `127.0.0.1` / `::1`
- `Host` 与 `Origin`（若有）必须是 loopback 主机名
- POST body 上限 16 KB

因为这些路由能 spawn 进程，不能开给局域网。

## 开发

```bash
# 构建两半（host → lib/index.js，browser → lib/client.js）
node scripts/build.mjs

# 真机自检：扫本机监听、扫远端服务、解析 fixture、探端口
node scripts/selfcheck.mjs
```

这台机器上没有全局 node，可以用 DSH 自带的 Electron 当 node：

```bash
ELECTRON_RUN_AS_NODE=1 "/d/DeepSeek Harness/DeepSeek Harness.exe" scripts/build.mjs
```

## 两半不是同一种模块格式

这一条踩错了不会报错，只是「装了没反应」，所以写清楚：

| 半 | 格式 | 加载方 |
| --- | --- | --- |
| host（`lib/index.js`） | 普通 ESM | cordis 用 `import()` 加载 |
| client（`lib/client.js`） | **CommonJS，外面裹一层 `window.__ModuleLoader__.load({ id, factory })`** | web 壳给 factory 传一个 `require`，能解析 `react` / `react-dom` / `react/jsx-runtime` |

所以 `scripts/build.mjs` 里 client 用 `--format=cjs` 配 banner/footer 包壳，而不是 `--format=esm`。

## 路由

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/lab/state` | 全量状态（`?remote=1` 强制刷新远端扫描） |
| POST | `/lab/tunnel` | `{localPort, remotePort, remoteHost?}` 开隧道 |
| POST | `/lab/stop` | `{id}` 停一条 |
| POST | `/lab/kill` | `{pid}` 杀任意进程（用于孤儿） |
| POST | `/lab/stop-all` | 全停 |

远端扫描有 15 秒缓存；UI 每 5 秒轮询一次。
