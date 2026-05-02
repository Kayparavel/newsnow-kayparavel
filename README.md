![](/public/og-image.png)

English | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

**_Elegant reading of real-time and hottest news_**

> [!NOTE]
> This is a demo version currently supporting Chinese only. A full-featured version with better customization and English content support will be released later.
> This project is forked from [ourongxing/newsnow](https://github.com/ourongxing/newsnow)

## Features

- Clean and elegant UI design for optimal reading experience
- Real-time updates on trending news
- GitHub OAuth login with data synchronization
- 30-minute default cache duration (logged-in users can force refresh)
- Adaptive scraping interval (minimum 2 minutes) based on source update frequency to optimize resource usage and prevent IP bans
- support MCP server

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
You can change the `BASE_URL` to your own domain.

### New Features
- Support proxy configuration per individual source
- More content source support

## Deployment

### Basic Deployment

For deployments without login and caching:

1. Fork this repository
2. Import to platforms like Cloudflare Page or Vercel

### Cloudflare Page Configuration

- Build command: `pnpm run build`
- Output directory: `dist/output/public`

### GitHub OAuth Setup

1. [Create a GitHub App](https://github.com/settings/applications/new)
2. No special permissions required
3. Set callback URL to: `https://your-domain.com/api/oauth/github` (replace `your-domain` with your actual domain)
4. Obtain Client ID and Client Secret

### Environment Variables

Refer to `example.env.server`. For local development, rename it to `.env.server` and configure, set environment variables for containers when deploying with Docker:

```env
# Github Client ID
G_CLIENT_ID=
# Github Client Secret
G_CLIENT_SECRET=
# JWT Secret, usually the same as Client Secret
JWT_SECRET=
# Initialize database, must be set to true on first run, can be turned off afterward
INIT_TABLE=true
# Whether to enable cache
ENABLE_CACHE=true
# ProductHunt API Token
PRODUCTHUNT_API_TOKEN=
# Whether to enable environment variable proxy configuration
NODE_USE_ENV_PROXY=
# HTTP proxy address
HTTP_PROXY=
# HTTPS proxy address
HTTPS_PROXY=
# Proxy address (fallback)
PROXY=
```

### Database Support

Supported database connectors: https://db0.unjs.io/connectors
This project recommends Cloudflare Pages and Docker deployment, Vercel requires you to handle the database yourself.

1. Create D1 database in Cloudflare Worker dashboard
2. Configure database_id and database_name in wrangler.toml
3. If wrangler.toml doesn't exist, rename example.wrangler.toml and modify configurations
4. Changes will take effect on next deployment

### Docker Deployment

For Docker deployment, you can build the image yourself or reference the public release version on Docker Hub kayparavel/newsnow-kayparavel:latest. Only need the yml file in project root directory, run docker-compose in the same directory:
- **Local Docker Deployment**: Refer to `example.docker-compose.local.yml`
- **Cloud Docker Deployment**: Refer to `example.docker-compose.yml`

```sh
docker compose up
```

You can also set Environment Variables through yml configuration.

## Development

> [!Note]
> Requires Node.js >= 20

```sh
corepack enable
pnpm i
pnpm dev
```

Refer to `shared/sources` and `server/sources` directories. The project provides complete type definitions and a clean architecture.

## Roadmap

- Expand **data sources** to cover global news in multiple languages
- Add **auto-refresh** to automatically fetch and record news content
- Add **NLP analysis** to provide instant and convenient hotspot notifications and clear and concise daily summary functions

## Contributing

Contributions are welcome! Feel free to submit pull requests or create issues for feature requests and bug reports.

## License

[MIT](./LICENSE) © ourongxing, kayparavel

## Sponsor

If this project helps you, you can buy me a cup of milk tea. If you need customization or other help, please contact us through the following methods with notes.

![](./screenshots/wechat-kayparavel.png)
![](./screenshots/wechatpay-kayparavel.png)
![](./screenshots/alipaypay-kayparavel.jpg)
