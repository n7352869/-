# 💡 我有一个想法

一个可以发布需求信息、点赞评论、根据热度生成每日排行的网站。

## 功能特点

- ✨ **发布想法**：用户可以发布自己的需求和想法
- 👍 **点赞功能**：为喜欢的想法点赞
- 💬 **评论功能**：对想法进行评论和讨论
- 🔥 **每日排行**：根据热度（点赞数×2 + 评论数）生成每日热门排行
- 📱 **响应式设计**：支持手机和电脑访问
- 📲 **Android APP**：已提供 Android 原生应用版本

## 技术栈

- **前端**：HTML + CSS + JavaScript（原生）
- **后端**：Node.js + Express
- **数据库**：SQLite
- **Android APP**：Java + WebView

## 本地部署

### 方式一：一键部署（推荐）

**Windows 用户：**
1. 双击运行 `一键部署.bat` 文件
2. 脚本会自动安装依赖并启动服务器
3. 打开浏览器访问：http://localhost:3000

**Mac/Linux 用户：**
```bash
npm install && npm start
```

### 方式二：手动部署

#### 1. 前置要求

- 已安装 Node.js（版本 14 或更高）
- 下载地址：https://nodejs.org/

#### 2. 安装依赖

**Windows 用户：**
- 双击运行 `安装依赖.bat`，或
- 在命令行中运行：`npm install`

**Mac/Linux 用户：**
```bash
npm install
```

#### 3. 启动服务器

**Windows 用户：**
- 双击运行 `启动服务器.bat`，或
- 在命令行中运行：`npm start`

**Mac/Linux 用户：**
```bash
npm start
```

#### 4. 访问网站

服务器启动后，打开浏览器访问：**http://localhost:3000**

### 停止服务器

在运行服务器的命令行窗口中按 `Ctrl + C` 即可停止服务器。

## 项目结构

```
我有一个想法/
├── server.js              # 后端服务器
├── package.json           # 项目配置
├── ideas.db               # SQLite数据库（自动生成）
├── 一键部署.bat           # 一键部署脚本（Windows）
├── 安装依赖.bat           # 安装依赖脚本（Windows）
├── 启动服务器.bat         # 启动服务器脚本（Windows）
├── public/                # 前端文件
│   ├── index.html         # 主页面
│   ├── styles.css         # 样式文件
│   └── app.js             # 前端逻辑
└── README.md              # 项目说明
```

## API 接口

### 获取想法列表
- `GET /api/ideas` - 获取所有想法（支持 `sort` 参数：hot/latest，`category` 参数筛选）
- `GET /api/ideas/daily-ranking` - 获取今日热门排行（支持 `category` 参数）

### 发布想法
- `POST /api/ideas` - 发布新想法
  ```json
  {
    "title": "想法标题",
    "content": "想法内容",
    "author": "作者名（可选）",
    "category": "创业点子|消费需求|具体项目|灵光空想|婚恋许愿"
  }
  ```

### 点赞
- `POST /api/ideas/:id/like` - 点赞/取消点赞
- `GET /api/ideas/:id/like-status` - 检查点赞状态

### 评论
- `GET /api/ideas/:id/comments` - 获取评论列表
- `POST /api/ideas/:id/comments` - 添加评论
  ```json
  {
    "content": "评论内容",
    "author": "评论者名（可选）"
  }
  ```

## 热度计算规则

热度分数 = 点赞数 × 2 + 评论数

每日排行按照热度分数从高到低排序，相同热度按时间排序。

## 许可证

MIT License


