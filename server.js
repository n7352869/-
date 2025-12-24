const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'very_secret_key_change_me';

// 新增：在云环境/反向代理下正确获取真实用户 IP
app.set('trust proxy', true);

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

// 配置文件上传
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB 限制
  fileFilter: (req, file, cb) => {
    const allow = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allow.includes(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持图片文件'));
  }
});

// 违禁词加载
let BANNED_PATTERNS = null;
function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function loadBannedWords(){
  try {
    const file = path.join(__dirname, 'banned_words.txt');
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      const words = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (words.length) {
        const union = words.map(escapeRegex).join('|');
        BANNED_PATTERNS = new RegExp(union, 'iu');
      } else {
        BANNED_PATTERNS = null;
      }
    } else {
      BANNED_PATTERNS = null;
    }
  } catch {
    BANNED_PATTERNS = null;
  }
}
function containsBanned(text){
  if (!text) return false;
  if (!BANNED_PATTERNS) return false;
  return BANNED_PATTERNS.test(String(text));
}
loadBannedWords();
function readBannedWordsText(){
  try {
    const file = path.join(__dirname, 'banned_words.txt');
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
    return '';
  } catch { return ''; }
}
function writeBannedWordsText(content){
  const file = path.join(__dirname, 'banned_words.txt');
  fs.writeFileSync(file, content || '', 'utf8');
  loadBannedWords();
}

// 初始化数据库
const db = new sqlite3.Database('./ideas.db', (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('数据库连接成功');
    // 创建表
    db.run(`CREATE TABLE IF NOT EXISTS ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT DEFAULT '匿名用户',
      category TEXT DEFAULT '灵光空想',
      image_url TEXT,
      likes INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 添加分类字段（如果表已存在但没有该字段）
    db.all(`PRAGMA table_info(ideas)`, [], (err, rows) => {
      if (!err && rows) {
        const hasCategory = rows.some(row => row.name === 'category');
        if (!hasCategory) {
          db.run(`ALTER TABLE ideas ADD COLUMN category TEXT DEFAULT '灵光空想'`, (alterErr) => {
            if (alterErr) {
              console.log('添加分类字段时出错（可能已存在）:', alterErr.message);
            } else {
              console.log('成功添加分类字段');
              // 更新现有数据
              db.run(`UPDATE ideas SET category = '灵光空想' WHERE category IS NULL`);
            }
          });
        }

        const hasImageUrl = rows.some(row => row.name === 'image_url');
        if (!hasImageUrl) {
          db.run(`ALTER TABLE ideas ADD COLUMN image_url TEXT`, (alterErr) => {
            if (alterErr) {
              console.log('添加图片字段时出错（可能已存在）:', alterErr.message);
            } else {
              console.log('成功添加图片字段');
            }
          });
        }
      }
    });

    db.run(`CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idea_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      author TEXT DEFAULT '匿名用户',
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (idea_id) REFERENCES ideas(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idea_id INTEGER NOT NULL,
      user_ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(idea_id, user_ip),
      FOREIGN KEY (idea_id) REFERENCES ideas(id)
    )`);

    // 用户表
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.all(`PRAGMA table_info(users)`, [], (err, rows) => {
      if (!err && rows) {
        const hasRole = rows.some(row => row.name === 'role');
        const hasBlocked = rows.some(row => row.name === 'blocked');
        if (!hasRole) {
          db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`);
        }
        if (!hasBlocked) {
          db.run(`ALTER TABLE users ADD COLUMN blocked INTEGER DEFAULT 0`);
        }
        db.run(`UPDATE users SET role='admin' WHERE username='东极岛青年'`);
      }
    });

    // 收藏表（按用户）
    db.run(`CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      idea_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(username, idea_id),
      FOREIGN KEY (idea_id) REFERENCES ideas(id),
      FOREIGN KEY (username) REFERENCES users(username)
    )`);
  }
});

// 认证中间件（如需保护接口）
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未提供令牌' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: '令牌无效' });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}
// 注册
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: '用户名长度需在 3-20 之间' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码长度至少 6 位' });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  db.run(`INSERT INTO users (username, password_hash, role, blocked) VALUES (?, ?, ?, ?)`, [username, passwordHash, 'user', 0], function(err) {
    if (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: '用户名已存在' });
      }
      return res.status(500).json({ error: err.message });
    }
    const user = { id: this.lastID, username, role: 'user', blocked: 0 };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user, token });
  });
});

// 登录
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: '用户名或密码错误' });
    const match = bcrypt.compareSync(password, row.password_hash);
    if (!match) return res.status(401).json({ error: '用户名或密码错误' });
    if (row.blocked) return res.status(403).json({ error: '用户已被拉黑' });
    if (row.username === '东极岛青年' && row.role !== 'admin') {
      db.run(`UPDATE users SET role='admin' WHERE username=?`, [row.username]);
      row.role = 'admin';
    }
    const user = { id: row.id, username: row.username, role: row.role || 'user', blocked: row.blocked || 0 };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user, token });
  });
});

// 获取当前用户（并根据数据库最新角色/封禁状态返回新令牌）
app.get('/api/auth/me', authenticateToken, (req, res) => {
  db.get(`SELECT role, blocked FROM users WHERE username = ?`, [req.user.username], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const role = row?.role || 'user';
    const blocked = row?.blocked || 0;
    const user = { id: req.user.id, username: req.user.username, role, blocked };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user, token });
  });
});

// 获取所有想法（按热度排序）
app.get('/api/ideas', (req, res) => {
  const { sort = 'hot', date, category, author } = req.query;
  
  let query = `
    SELECT i.*, 
           COUNT(DISTINCT c.id) as comments_count,
           COUNT(DISTINCT l.id) as likes_count
    FROM ideas i
    LEFT JOIN comments c ON i.id = c.idea_id
    LEFT JOIN likes l ON i.id = l.idea_id
  `;
  
  const conditions = [];
  if (date) {
    conditions.push(`DATE(i.created_at) = DATE('${date}')`);
  }
  if (category && category !== 'all') {
    conditions.push(`i.category = '${category}'`);
  }
  if (author) {
    conditions.push(`i.author = '${author}'`);
  }
  
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }
  
  query += ` GROUP BY i.id`;
  
  if (sort === 'hot') {
    query += ` ORDER BY (likes_count * 2 + comments_count) DESC, i.created_at DESC`;
  } else if (sort === 'latest') {
    query += ` ORDER BY i.created_at DESC`;
  } else {
    query += ` ORDER BY likes_count DESC, i.created_at DESC`;
  }
  
  db.all(query, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// 获取今日热门排行
app.get('/api/ideas/daily-ranking', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const { category } = req.query;
  
  let query = `
    SELECT i.*, 
           COUNT(DISTINCT c.id) as comments_count,
           COUNT(DISTINCT l.id) as likes_count,
           (COUNT(DISTINCT l.id) * 2 + COUNT(DISTINCT c.id)) as hot_score
    FROM ideas i
    LEFT JOIN comments c ON i.id = c.idea_id
    LEFT JOIN likes l ON i.id = l.idea_id
    WHERE DATE(i.created_at) = DATE('${today}')
  `;
  
  if (category && category !== 'all') {
    query += ` AND i.category = '${category}'`;
  }
  
  query += `
    GROUP BY i.id
    ORDER BY hot_score DESC, i.created_at DESC
    LIMIT 50
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// 发布新想法（需登录，拉黑用户禁止）
app.post('/api/ideas', authenticateToken, (req, res) => {
  const { title, content, author, category, image_url } = req.body;
  
  if (!title || !content) {
    return res.status(400).json({ error: '标题和内容不能为空' });
  }
  if (req.user?.blocked) {
    return res.status(403).json({ error: '用户已被拉黑，禁止发布' });
  }
  if (containsBanned(title) || containsBanned(content) || containsBanned(author)) {
    return res.status(400).json({ error: '内容包含违禁词，无法发布' });
  }
  
  // 验证分类
  const validCategories = ['创业点子', '消费需求', '具体项目', '灵光空想', '婚恋许愿'];
  const finalCategory = category && validCategories.includes(category) ? category : '灵光空想';
  
  const query = `INSERT INTO ideas (title, content, author, category, image_url) VALUES (?, ?, ?, ?, ?)`;
  db.run(query, [title, content, author || '匿名用户', finalCategory, image_url || null], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ 
      id: this.lastID, 
      title, 
      content, 
      author: author || '匿名用户',
      category: finalCategory,
      image_url: image_url || null,
      likes: 0,
      comments_count: 0,
      message: '发布成功！' 
    });
  });
});

// 图片上传接口
app.post('/api/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未收到文件' });
    }
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取单个想法的详情
app.get('/api/ideas/:id', (req, res) => {
  const { id } = req.params;
  
  db.get(`SELECT * FROM ideas WHERE id = ?`, [id], (err, idea) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!idea) {
      return res.status(404).json({ error: '想法不存在' });
    }
    
    // 获取点赞数
    db.get(`SELECT COUNT(*) as count FROM likes WHERE idea_id = ?`, [id], (err, likeResult) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      // 获取评论数
      db.get(`SELECT COUNT(*) as count FROM comments WHERE idea_id = ?`, [id], (err, commentResult) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        
        res.json({
          ...idea,
          likes: likeResult.count,
          comments_count: commentResult.count
        });
      });
    });
  });
});

app.put('/api/ideas/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { title, content, category, image_url, author } = req.body;
  db.get(`SELECT * FROM ideas WHERE id = ?`, [id], (err, idea) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!idea) return res.status(404).json({ error: '想法不存在' });
    const newTitle = title ?? idea.title;
    const newContent = content ?? idea.content;
    const newCategory = category ?? idea.category;
    const newImage = image_url === undefined ? idea.image_url : image_url;
    const newAuthor = author ?? idea.author;
    db.run(`UPDATE ideas SET title = ?, content = ?, category = ?, image_url = ?, author = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newTitle, newContent, newCategory, newImage, newAuthor, id],
      function(updateErr) {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        res.json({ id, title: newTitle, content: newContent, category: newCategory, image_url: newImage, author: newAuthor });
      });
  });
});

app.delete('/api/ideas/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  db.get(`SELECT * FROM ideas WHERE id = ?`, [id], (err, idea) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!idea) return res.status(404).json({ error: '想法不存在' });
    db.run(`DELETE FROM comments WHERE idea_id = ?`, [id], (err1) => {
      if (err1) return res.status(500).json({ error: err1.message });
      db.run(`DELETE FROM likes WHERE idea_id = ?`, [id], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        db.run(`DELETE FROM favorites WHERE idea_id = ?`, [id], (err3) => {
          if (err3) return res.status(500).json({ error: err3.message });
          db.run(`DELETE FROM ideas WHERE id = ?`, [id], (err4) => {
            if (err4) return res.status(500).json({ error: err4.message });
            res.json({ deleted: true });
          });
        });
      });
    });
  });
});
// 点赞
app.post('/api/ideas/:id/like', (req, res) => {
  const { id } = req.params;
  const userIp = req.ip || req.connection.remoteAddress;
  
  // 检查是否已点赞
  db.get(`SELECT * FROM likes WHERE idea_id = ? AND user_ip = ?`, [id, userIp], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (row) {
      // 取消点赞
      db.run(`DELETE FROM likes WHERE idea_id = ? AND user_ip = ?`, [id, userIp], (err) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        db.get(`SELECT COUNT(*) as count FROM likes WHERE idea_id = ?`, [id], (err, result) => {
          res.json({ liked: false, likes: result.count });
        });
      });
    } else {
      // 添加点赞
      db.run(`INSERT INTO likes (idea_id, user_ip) VALUES (?, ?)`, [id, userIp], (err) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        db.get(`SELECT COUNT(*) as count FROM likes WHERE idea_id = ?`, [id], (err, result) => {
          res.json({ liked: true, likes: result.count });
        });
      });
    }
  });
});

// 获取评论
app.get('/api/ideas/:id/comments', (req, res) => {
  const { id } = req.params;
  
  db.all(`SELECT * FROM comments WHERE idea_id = ? ORDER BY created_at DESC`, [id], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// 添加评论（需登录，拉黑用户禁止）
app.post('/api/ideas/:id/comments', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { content, author, image_url } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: '评论内容不能为空' });
  }
  if (req.user?.blocked) {
    return res.status(403).json({ error: '用户已被拉黑，禁止评论' });
  }
  if (containsBanned(content) || containsBanned(author)) {
    return res.status(400).json({ error: '评论包含违禁词，无法发布' });
  }
  
  const finalAuthor = author || req.user?.username || '匿名用户';
  db.run(`INSERT INTO comments (idea_id, content, author, image_url) VALUES (?, ?, ?, ?)`, 
    [id, content, finalAuthor, image_url || null], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    // 更新想法的评论数
    db.run(`UPDATE ideas SET comments_count = comments_count + 1 WHERE id = ?`, [id]);
    
    res.json({ 
      id: this.lastID, 
      idea_id: id,
      content, 
      author: author || '匿名用户',
      image_url: image_url || null,
      message: '评论成功！' 
    });
  });
});

app.delete('/api/comments/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  db.get(`SELECT * FROM comments WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '评论不存在' });
    db.run(`DELETE FROM comments WHERE id = ?`, [id], (delErr) => {
      if (delErr) return res.status(500).json({ error: delErr.message });
      db.run(`UPDATE ideas SET comments_count = CASE WHEN comments_count > 0 THEN comments_count - 1 ELSE 0 END WHERE id = ?`, [row.idea_id]);
      res.json({ deleted: true });
    });
  });
});
// 检查用户是否已点赞
app.get('/api/ideas/:id/like-status', (req, res) => {
  const { id } = req.params;
  const userIp = req.ip || req.connection.remoteAddress;
  
  db.get(`SELECT * FROM likes WHERE idea_id = ? AND user_ip = ?`, [id, userIp], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ liked: !!row });
  });
});

// 收藏（需登录）- 切换收藏状态
app.post('/api/ideas/:id/favorite', authenticateToken, (req, res) => {
  const { id } = req.params;
  const username = req.user.username;
  db.get(`SELECT * FROM favorites WHERE idea_id = ? AND username = ?`, [id, username], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) {
      db.run(`DELETE FROM favorites WHERE idea_id = ? AND username = ?`, [id, username], (delErr) => {
        if (delErr) return res.status(500).json({ error: delErr.message });
        res.json({ favorited: false });
      });
    } else {
      db.run(`INSERT INTO favorites (idea_id, username) VALUES (?, ?)`, [id, username], (insErr) => {
        if (insErr) return res.status(500).json({ error: insErr.message });
        res.json({ favorited: true });
      });
    }
  });
});

// 收藏状态（需登录）
app.get('/api/ideas/:id/favorite-status', authenticateToken, (req, res) => {
  const { id } = req.params;
  const username = req.user.username;
  db.get(`SELECT * FROM favorites WHERE idea_id = ? AND username = ?`, [id, username], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ favorited: !!row });
  });
});

// 我的收藏（需登录且仅本人可查看）
app.get('/api/users/:username/favorites', authenticateToken, (req, res) => {
  const { username } = req.params;
  if (req.user.username !== username) {
    return res.status(403).json({ error: '无权限查看他人收藏' });
  }
  const q = `
    SELECT i.*
    FROM favorites f
    JOIN ideas i ON i.id = f.idea_id
    WHERE f.username = ?
    ORDER BY f.created_at DESC
  `;
  db.all(q, [username], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
// 获取指定用户收到的评论（针对该用户发布的所有想法）
app.get('/api/users/:username/comments-received', (req, res) => {
  const { username } = req.params;
  const query = `
    SELECT c.*, i.id as idea_id, i.title as idea_title
    FROM comments c
    JOIN ideas i ON c.idea_id = i.id
    WHERE i.author = ?
    ORDER BY c.created_at DESC
  `;
  db.all(query, [username], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// 私信消息表与接口
// 初始化消息表
db.run(`CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_username TEXT NOT NULL,
  to_username TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// 发送私信（需要登录）
app.post('/api/messages', authenticateToken, (req, res) => {
  if (req.user.blocked) return res.status(403).json({ error: '用户已被拉黑' });
  const { to_username, content } = req.body;
  const from_username = req.user.username;
  if (!to_username || !content) {
    return res.status(400).json({ error: '收件人与内容不能为空' });
  }
  const q = `INSERT INTO messages (from_username, to_username, content) VALUES (?, ?, ?)`;
  db.run(q, [from_username, to_username, content], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, from_username, to_username, content });
  });
});

// 收件箱（需要登录）
app.get('/api/messages/inbox', authenticateToken, (req, res) => {
  const username = req.user.username;
  const q = `SELECT * FROM messages WHERE to_username = ? ORDER BY created_at DESC`;
  db.all(q, [username], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/admin/banwords', authenticateToken, requireAdmin, (req, res) => {
  const text = readBannedWordsText();
  res.json({ content: text });
});
app.put('/api/admin/banwords', authenticateToken, requireAdmin, (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: '内容需为文本' });
  if (content.length > 200000) return res.status(400).json({ error: '内容过长' });
  writeBannedWordsText(content);
  const lines = content.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  res.json({ ok: true, count: lines.length });
});

// 发件箱（需要登录）
app.get('/api/messages/outbox', authenticateToken, (req, res) => {
  const username = req.user.username;
  const q = `SELECT * FROM messages WHERE from_username = ? ORDER BY created_at DESC`;
  db.all(q, [username], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/admin/users/:username/block', authenticateToken, requireAdmin, (req, res) => {
  const { username } = req.params;
  const { blocked } = req.body;
  const value = blocked ? 1 : 0;
  db.run(`UPDATE users SET blocked = ? WHERE username = ?`, [value, username], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ username, blocked: !!value });
  });
});

app.get('/api/admin/users/:username/status', authenticateToken, requireAdmin, (req, res) => {
  const { username } = req.params;
  db.get(`SELECT username, role, blocked FROM users WHERE username = ?`, [username], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '用户不存在' });
    res.json({ username: row.username, role: row.role || 'user', blocked: !!row.blocked });
  });
});

// 管理员：用户列表与统计
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const limit = Math.max(1, Math.min(parseInt(req.query.limit || '100', 10) || 100, 500));
  const offset = Math.max(0, parseInt(req.query.offset || '0', 10) || 0);
  const q = `SELECT id, username, role, blocked, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  db.all(q, [limit, offset], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({ id: r.id, username: r.username, role: r.role || 'user', blocked: !!r.blocked, created_at: r.created_at })));
  });
});
app.get('/api/admin/users/count', authenticateToken, requireAdmin, (req, res) => {
  db.get(`SELECT COUNT(*) as count FROM users`, [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ count: row.count });
  });
});

// 末尾（在所有 /api 路由之后、app.listen 之前）
// ... existing code ...

// 新增：未匹配到的 /api 路径统一返回 JSON 404，避免默认 HTML 响应导致 "Unexpected token '<'"
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API 路径不存在' });
});

// 新增：统一错误处理（API 返回 JSON，非 API 返回简单文本）
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  if (req.path && req.path.startsWith('/api')) {
    res.status(500).json({ error: '服务器错误', message: err.message });
  } else {
    res.status(500).send('Server Error');
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});

    // 为 comments 表添加缺失的 image_url 字段
    db.all(`PRAGMA table_info(comments)`, [], (err, rows) => {
      if (!err && rows) {
        const hasCommentImage = rows.some(row => row.name === 'image_url');
        if (!hasCommentImage) {
          db.run(`ALTER TABLE comments ADD COLUMN image_url TEXT`, (alterErr) => {
            if (alterErr) {
              console.log('为评论添加图片字段时出错（可能已存在）:', alterErr.message);
            } else {
              console.log('成功为评论添加图片字段');
            }
          });
        }
      }
    });

