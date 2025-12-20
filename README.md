# OneBookmark

[English](./README_EN.md) | 中文

跨浏览器书签同步插件，支持将本地书签同步到 GitHub Gist，实现多设备书签统一管理。

## 功能特性

- 一键上传/下载书签到 GitHub Gist
- 多备份管理，支持选择性同步
- 操作锁定机制，防止并发冲突
- 差异预览，查看同步前的变更
- 支持 Chrome / Edge / Firefox
- 中英文国际化支持
- 流畅的动画交互体验

## 安装

### 发行版（推荐）

前往 [Releases](https://github.com/AstraSolis/OneBookmark/releases) 下载最新稳定版压缩包，解压后在浏览器中加载。

### CI 构建版

获取最新开发版本：前往 [Actions](https://github.com/AstraSolis/OneBookmark/actions/workflows/build.yml)，选择最新成功的构建，下载对应浏览器的 Artifact。

### 浏览器商店

[![Chrome Web Store](https://img.shields.io/badge/Chrome-安装-blue?style=for-the-badge)](https://chromewebstore.google.com/detail/onebookmark/nbpcngemklcmfphomlcdpkblookgeeam?hl=zh-CN&utm_source=ext_sidebar)
[![Edge Add-ons](https://img.shields.io/badge/Edge-安装-blue?style=for-the-badge)](https://microsoftedge.microsoft.com/addons/detail/onebookmark/nfgehhnejnoioniplhfgpgaojnafkelj)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox-安装-blue?style=for-the-badge)](https://addons.mozilla.org/zh-CN/firefox/addon/onebookmark/)

## 使用方法

1. 在 [GitHub Settings](https://github.com/settings/tokens/new?scopes=gist&description=OneBookmark) 创建 Personal Access Token（需要 `gist` 权限）
2. 打开插件设置页面，配置备份信息（Token 和 Gist ID）
3. 启用需要的备份（上传/下载）
4. 在 Popup 中点击「上传」或「下载」按钮进行同步

## 项目结构

```
├── entrypoints/           # 扩展入口
│   ├── background.ts      # 后台服务脚本
│   ├── popup/             # Popup UI（快速同步操作）
│   └── options/           # Options UI（完整设置页面）
├── lib/                   # 核心库
│   ├── bookmark/          # 书签解析和处理
│   ├── storage/           # Gist 存储接口
│   ├── sync/              # 同步引擎和操作锁
│   ├── i18n/              # 国际化支持
│   ├── motion/            # 动画组件库
│   └── errors.ts          # 错误类型定义
├── utils/                 # 工具函数
├── types/                 # TypeScript 类型定义
├── public/                # 静态资源（图标等）
└── .github/workflows/     # CI/CD 工作流
```

## 开发

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev           # Chrome
pnpm dev:firefox   # Firefox
```

### 构建

```bash
pnpm build         # Chrome
pnpm build:firefox # Firefox
pnpm zip           # 打包为 zip 文件
```

## 技术栈

- [WXT](https://wxt.dev/) - 跨浏览器扩展框架
- React 19 + TypeScript - UI 框架
- Tailwind CSS v4 - 样式
- i18next - 国际化
- Motion - 动画库

## 隐私政策

详见 [隐私政策](./PRIVACY_POLICY.md)。

## 许可证

本项目采用 [Apache License 2.0](./LICENSE) 许可证。

## 核心功能模块

### 书签同步
- 本地书签解析和导出
- 与 GitHub Gist 的双向同步
- 差异计算和预览

### 备份管理
- 多个 Gist 备份配置
- 独立的上传/下载启用控制
- 备份信息持久化

### 并发控制
- 操作锁定机制防止冲突
- 自动锁定释放
- 手动强制解锁选项

### 用户界面
- Popup：快速同步操作和状态显示
- Options：完整的设置和备份管理
- 实时同步状态反馈
- 书签统计信息