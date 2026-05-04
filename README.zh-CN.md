![](/public/og-image.png)

[English](./README.md) | 简体中文 | [日本語](README.ja-JP.md)

***优雅地阅读实时热门新闻***

> [!NOTE]
> 当前版本为 DEMO，仅支持中文。正式版将提供更好的定制化功能和英文内容支持。
> 当前项目forked from [ourongxing/newsnow](https://github.com/ourongxing/newsnow)

## 功能特性
- 优雅的阅读界面设计，实时获取最新热点新闻
- 支持 GitHub 登录及数据同步
- 默认缓存时长为 30 分钟，登录用户可强制刷新获取最新数据
- 根据内容源更新频率动态调整抓取间隔（最快每 2 分钟），避免频繁抓取导致 IP 被封禁
- 支持 MCP server

```json
{
  "mcpServers": {
    "newsnow": {
      "command": "npx",
      "args": [
        "-y",
        "newsnow-mcp-server"
      ],
      "env": {
        "BASE_URL": "https://newsnow.your.domain"
      }
    }
  }
}
```

你可以将 `BASE_URL` 修改为你的域名。

### 新特性
- 支持单个源单独配置代理
- 更多的内容源支持

## 部署指南

### 基础部署
无需登录和缓存功能时，可直接部署至 Cloudflare Pages 或 Vercel：
1. Fork 本仓库
2. 导入至目标平台

### Cloudflare Pages 配置
- 构建命令：`pnpm run build`
- 输出目录：`dist/output/public`

### GitHub OAuth 配置
1. [创建 GitHub App](https://github.com/settings/applications/new)
2. 无需特殊权限
3. 回调 URL 设置为：`https://your-domain.com/api/oauth/github`（替换 your-domain 为实际域名）
4. 获取 Client ID 和 Client Secret

### 环境变量配置
参考 `example.env.server` 文件，本地运行时重命名为 `.env.server` 并填写配置，docker部署时给容器设置环境变量：

```env
# Github Clien ID
G_CLIENT_ID=
# Github Clien Secret
G_CLIENT_SECRET=
# JWT Secret, 通常就用 Clien Secret
JWT_SECRET=
# 初始化数据库, 首次运行必须设置为 true，之后可以将其关闭
INIT_TABLE=true
# 是否启用缓存
ENABLE_CACHE=true
# ProductHunt API Token
PRODUCTHUNT_API_TOKEN=
# HTTP 代理地址
HTTP_PROXY=
# HTTPS 代理地址
HTTPS_PROXY=
# 代理地址（兜底）
PROXY=
# 自动刷新扫描间隔（分钟），不设置或为0则不启用
CRON_INTERVAL=
# MySQL 配置（可选，用于新闻增量同步）
MYSQL_HOST=
MYSQL_PORT=
MYSQL_USER=""
MYSQL_PASSWORD=""
MYSQL_NEWSOLD_DB=newsold
MYSQL_NEWSNOW_DB=newsnow
```

### 数据库支持
本项目主推 Cloudflare Pages 以及 Docker 部署， Vercel 需要你自行搞定数据库，其他支持的数据库可以查看 https://db0.unjs.io/connectors 。

1. 在 Cloudflare Worker 控制面板创建 D1 数据库
2. 在 `wrangler.toml` 中配置 `database_id` 和 `database_name`
3. 若无 `wrangler.toml` ，可将 `example.wrangler.toml` 重命名并修改配置
4. 重新部署生效

### Docker 部署
对于 Docker 部署，可自行build镜像或引用 Docker Hub 公开的 release 版本 kayparavel/newsnow-kayparavel:latest,只需要项目根目录yml文件，同一目录下执行docker-compose
- **本地 Docker 部署**：参考 `example.docker-compose.local.yml`
- **云 Docker 部署**：可参考 `example.docker-compose.yml`

```
docker compose up
```
同样可以通过yml配置环境变量。

## 开发
> [!Note]
> 需要 Node.js >= 20

```bash
corepack enable
pnpm i
pnpm dev
```

你可能想要添加数据源，请关注 `shared/sources` `server/sources`，项目类型完备，结构简单，请自行探索。

## 路线图
- 扩展 **数据源** 以涵盖多种语言的全球新闻
- 添加 **自动刷新** 以自动拉取和记录新闻内容
- 添加 **NLP 分析** 提供即时便捷的热点通知 与 清晰简洁的每日总结 功能

## 贡献指南
欢迎贡献代码！您可以提交 pull request 或创建 issue 来提出功能请求和报告 bug

## License

[MIT](./LICENSE) © ourongxing, kayparavel

## 赞赏
如果本项目对你有所帮助，可以给小猫买点零食。如果需要定制或者其他帮助，请通过下列方式联系备注。
![](./screenshots/wechat-kayparavel.png)
![](./screenshots/wechatpay-kayparavel.png)
![](./screenshots/alipaypay-kayparavel.jpg)
