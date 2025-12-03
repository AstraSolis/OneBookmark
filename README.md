# OneBookmark

跨浏览器书签同步插件，支持将本地书签同步到 GitHub Gist，实现多设备书签统一管理。

## 功能特性

- 🔄 手动上传/下载书签
- 📦 GitHub Gist 云端存储
- 🌐 支持 Chrome / Edge / Firefox

## 安装

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev           # Chrome
pnpm dev:firefox   # Firefox

# 构建
pnpm build         # Chrome
pnpm build:firefox # Firefox
```

## 使用方法

1. 在 [GitHub Settings](https://github.com/settings/tokens/new?scopes=gist&description=OneBookmark) 创建 Personal Access Token（需要 `gist` 权限）
2. 打开插件设置页面，输入 Token
3. 点击「上传」将本地书签同步到云端，或点击「下载」从云端恢复书签

## 技术栈

- [WXT](https://wxt.dev/) - 跨浏览器扩展框架
- React 19 + TypeScript
- Tailwind CSS v4