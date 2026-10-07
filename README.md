# 词卡 · 在线背单词

一个简洁优雅的在线背单词网页应用。零依赖、零构建，打开即用。

## 🌐 在线访问

**https://jiangnan715.github.io/online-word/**

电脑、手机、平板都能直接打开，无需安装、无需注册。发给同学就能用。

> 推送到 `main` 分支后，GitHub Actions 会自动重新部署，约 1 分钟生效。
> 纯静态项目：HTML + CSS + 原生 JavaScript，不使用任何框架和打包工具。

## 功能

- **多词书**：初中、高考、四级、六级、考研、托福、SAT 七套词库，侧边栏随时切换
- **学习**：卡片式记词，支持自定义单词本与批量导入
- **复习**：基于记忆曲线的到期复习队列
- **统计**：每日学习量、掌握进度可视化
- **AI 中心**：
  - AI 查词（优先使用浏览器内置 AI，不可用时自动降级为本地词库查询）
  - AI 听写 / AI 对话 / 词义联想网络 / AI 猜词游戏
  - AI 历史记录管理
- **朗读**：Web Speech API 单词发音
- **进度本地存储**：所有学习记录保存在浏览器 localStorage，无需注册登录
- **深色主题** + 响应式布局，移动端可用

## 快速开始

### 方式一：直接打开

双击 `index.html` 即可在浏览器中使用。

### 方式二：本地服务器（推荐）

```bash
# 有 Node.js
npx serve .

# 或有 Python
python -m http.server 8080
```

然后访问 http://localhost:8080

## 目录结构

```
.
├── index.html          # 入口页面
├── css/
│   └── style.css       # 全部样式
├── js/
│   ├── data.js         # 内置基础词库
│   ├── storage.js      # localStorage 读写与记忆曲线逻辑
│   ├── icons.js        # 统一 SVG 图标
│   ├── app.js          # 路由与各页面渲染
│   ├── enhance.js      # 交互增强
│   ├── ai.js           # AI 查词、听写
│   ├── ai-game.js      # AI 对话 / 联想网络 / 猜词游戏
│   ├── ai-history.js   # AI 历史记录中心
│   ├── sidebar.js      # 侧边栏交互
│   └── data/           # 完整词库（由脚本生成）
└── build-books.mjs     # 词库生成脚本
```

## 重新生成完整词库

`js/data/*.js` 由 `build-books.mjs` 从词表源仓库下载并转换生成：

```bash
node build-books.mjs
```

需要联网。生成后覆盖 `js/data/` 下的文件。

## 数据来源与致谢

完整词库数据来自 [KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary)，
经 `build-books.mjs` 转换为本项目所需的 `js/data/*.js` 格式。请遵循原仓库的授权条款使用。

字体使用 [JetBrains Mono](https://www.jetbrains.com/lp/mono/)（SIL Open Font License 1.1），
通过 Google Fonts CDN 加载。

## License

见仓库根目录 LICENSE 文件（如未添加，请按需补充）。
