# Mountivers

个人核心 Monorepo 仓库，用于统一管理所有项目，包括基建代码、前端应用、后端服务等。

## 快速开始

### 环境要求

- Node.js: `22.19.0`
- pnpm: `11.1.3`

请确保你的开发环境满足以上版本要求，否则可能导致依赖安装或构建失败。

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

这将并行启动所有子项目的开发服务器。

## 目录结构

```
mountivers/
├── apps/          # 前端应用项目（Web、移动端等）
├── services/      # 后端服务项目（API、微服务等）
├── packages/      # 共享库和工具包（UI 组件、工具函数、类型定义等）
└── ...
```

- **apps**: 存放独立的前端应用程序，如 React/Vue 项目、Next.js 应用等
- **services**: 存放后端服务，如 Node.js API 服务、微服务等
- **packages**: 存放可复用的共享代码，供 apps 和 services 使用

## 技术栈

### 根项目技术栈

根项目提供统一的基础设施和规范化能力：

- **TypeScript**: 类型安全的 JavaScript 超集
- **ESLint**: 代码质量检查和规范
- **Prettier**: 代码格式化工具
- **Husky**: Git hooks 管理
- **lint-staged**: 对暂存文件执行 lint 和格式化

### 推荐子项目技术栈选型

根据不同项目类型，推荐以下技术栈：

**前端应用 (apps)**

- React + Vite + TypeScript
- Vue 3 + Vite + TypeScript
- Next.js (React 全栈框架)
- Nuxt.js (Vue 全栈框架)

**后端服务 (services)**

- Node.js + Express/NestJS + TypeScript
- Fastify + TypeScript
- Koa + TypeScript

**共享库 (packages)**

- TypeScript 库（工具函数、类型定义）
- React/Vue 组件库
- ESLint/Prettier 配置包

> 注意：子项目可以根据实际需求选择不同的技术栈，根项目仅提供基础设施支持。

## 开发规范

本项目使用以下工具链保证代码质量和一致性：

- **ESLint**: 自动检查代码质量问题和不规范的写法
- **Prettier**: 自动格式化代码，保持统一的代码风格
- **Husky + lint-staged**: 在 git commit 前自动对暂存文件执行 lint 检查和格式化

提交代码时，lint-staged 会自动运行 ESLint 和 Prettier，确保代码符合规范。如果检查失败，commit 将被阻止，需要先修复问题后再提交。

## 常用命令

### 根项目命令

```bash
# 启动所有子项目的开发服务器
pnpm dev

# 构建所有子项目
pnpm build

# 检查所有子项目的代码质量
pnpm lint

# 自动修复代码质量问题
pnpm lint:fix

# 格式化所有代码
pnpm format

# 检查代码格式是否符合规范
pnpm format:check

# 类型检查所有子项目
pnpm type-check
```

### 子项目命令约定

为了保持 monorepo 的一致性，建议所有子项目在 `package.json` 的 `scripts` 中提供以下标准命令：

- **dev**: 启动开发服务器（热更新模式）
- **build**: 构建生产版本
- **type-check**: TypeScript 类型检查（如果使用 TypeScript）

这些命令应该遵循上述的预期行为，以便通过根项目的统一命令进行管理。
