const API_BASE = '/api';

function setRandomBackground(){
  const gradients = [
    'linear-gradient(135deg, #E53935 0%, #FF6B6B 100%)',
    'linear-gradient(135deg, #FB8C00 0%, #FFD54F 100%)',
    'linear-gradient(135deg, #FDD835 0%, #FFF59D 100%)',
    'linear-gradient(135deg, #43A047 0%, #A5D6A7 100%)',
    'linear-gradient(135deg, #00BCD4 0%, #80DEEA 100%)',
    'linear-gradient(135deg, #1E88E5 0%, #90CAF9 100%)',
    'linear-gradient(135deg, #8E24AA 0%, #CE93D8 100%)'
  ];
  const gradient = gradients[Math.floor(Math.random() * gradients.length)];
  document.body.style.background = gradient;
  document.body.style.backgroundAttachment = 'fixed';
  document.body.style.backgroundRepeat = 'no-repeat';
}

// 与主页保持一致的本地存储键名
const TOKEN_KEY = 'auth_token';
const USERNAME_KEY = 'auth_username';
const ROLE_KEY = 'auth_role';
function getToken(){ return localStorage.getItem(TOKEN_KEY); }
function getUsername(){ return localStorage.getItem(USERNAME_KEY); }
function getRole(){ return localStorage.getItem(ROLE_KEY) || 'user'; }
function isAdmin(){ return getRole() === 'admin'; }

async function refreshAuthRole(){
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    if (res.ok && data.user) {
      localStorage.setItem(ROLE_KEY, data.user.role || 'user');
      if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
    }
  } catch {}
}

function parseDbDate(ts){
  if (!ts) return new Date();
  if (typeof ts === 'string' && ts.includes(' ')) {
    const iso = ts.replace(' ', 'T') + 'Z';
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(ts);
  return isNaN(d.getTime()) ? new Date() : d;
}

function formatTime(ts){
  try { return parseDbDate(ts).toLocaleString('zh-CN'); } catch { return ts; }
}

async function fetchJson(url, opts={}){
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

document.addEventListener('DOMContentLoaded', init);
let currentChatUser = null;

async function init(){
  setRandomBackground();
  await refreshAuthRole();
  const params = new URLSearchParams(location.search);
  const u = params.get('u') || getUsername();
  const self = getUsername();
  const isOwner = !!self && u === self;
  const loggedIn = !!getToken();

  const usernameEl = document.getElementById('profileUsername');
  const subtitleEl = document.getElementById('profileSubtitle');
  const tabsEl = document.getElementById('profileTabs');
  const adminActions = document.getElementById('adminActions');
  const toggleBlockBtn = document.getElementById('toggleBlockBtn');
  if (!u){
    if (subtitleEl) subtitleEl.textContent = '请登录后访问自己的主页';
    return;
  }
  if (usernameEl) usernameEl.textContent = u;
  if (subtitleEl) subtitleEl.textContent = isOwner ? '这是你的个人后台页面' : '仅显示该用户发布内容';
  if (adminActions) {
    if (isAdmin() && u && (!isOwner)) {
      adminActions.style.display = 'block';
      let targetBlocked = false;
      try {
        const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(u)}/status`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        if (res.ok) targetBlocked = !!data.blocked;
      } catch {}
      if (toggleBlockBtn) {
        const updateLabel = () => { toggleBlockBtn.textContent = targetBlocked ? '取消拉黑' : '拉黑用户'; };
        updateLabel();
        toggleBlockBtn.addEventListener('click', async () => {
          try {
            const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(u)}/block`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
              body: JSON.stringify({ blocked: !targetBlocked })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '操作失败');
            targetBlocked = !!data.blocked;
            updateLabel();
          } catch (err) { alert(err.message); }
        });
      }
    } else {
      adminActions.style.display = 'none';
    }
  }

  const messagesSection = document.getElementById('messagesSection');
  const sendBtn = document.getElementById('sendMessageBtn');
  const messageInput = document.getElementById('messageContent');
  const toUserInput = document.getElementById('toUserInput');
  const statusEl = document.getElementById('messageStatus');
  const chatSidebar = document.getElementById('chatSidebar');
  const chatInfo = document.getElementById('chatInfo');
  const chatThread = document.getElementById('chatThread');
  if (messagesSection) {
    if (chatSidebar) {
      chatSidebar.style.display = 'block';
      chatSidebar.style.visibility = isOwner ? 'visible' : 'hidden';
    }
    if (toUserInput) toUserInput.style.display = 'none';
    if (isOwner) {
      if (loggedIn) await loadContacts();
      if (chatInfo) chatInfo.textContent = '请选择联系人开始聊天';
    } else {
      currentChatUser = u;
      if (chatInfo) chatInfo.textContent = `与 ${u} 的私信对话`;
      if (loggedIn) {
        await loadConversation(u);
        if (messageInput && !messageInput.disabled) {
          messageInput.focus();
          try { messageInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
        }
      } else {
        if (chatThread) chatThread.innerHTML = '<div class="muted">请登录后查看对话</div>';
      }
    }
    if (chatThread) {
      chatThread.addEventListener('click', () => {
        if (messageInput && !messageInput.disabled) {
          messageInput.focus();
          try { messageInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
        }
      });
    }
    if (sendBtn) {
      if (!loggedIn) {
        sendBtn.disabled = true;
        if (messageInput) messageInput.disabled = true;
      } else {
        sendBtn.disabled = false;
        sendBtn.addEventListener('click', async () => {
          const content = messageInput?.value?.trim();
          const toUser = isOwner ? (currentChatUser || '') : u;
          if (!toUser) { statusEl.textContent = '请选择联系人'; return; }
          if (!content) { statusEl.textContent = '内容不能为空'; return; }
          try {
            statusEl.textContent = '正在发送...';
            await sendMessage(toUser, content);
            statusEl.textContent = '已发送';
            if (messageInput) messageInput.value = '';
            await loadConversation(toUser);
          } catch (err) {
            statusEl.textContent = `发送失败：${err.message}`;
          }
        });
      }
    }
  }

  // 构建标签
  tabsEl.style.display = 'flex';
  tabsEl.innerHTML = '';
  const tabs = [
    { key:'posts', label:'发布内容' },
    ...(isOwner ? [ { key:'favorites', label:'我的收藏' }, { key:'comments', label:'收到的评论' } ] : []),
    { key:'messages', label:'私信' }
  ];
  tabs.forEach((t,i) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (i===0 ? ' active' : '');
    btn.textContent = t.label;
    btn.dataset.key = t.key;
    btn.addEventListener('click', () => switchTab(t.key));
    tabsEl.appendChild(btn);
  });

  // 初始加载
  await loadPosts(u);
  if (isOwner) {
    await loadFavorites(u);
    await loadComments(u);
    // 初始隐藏评论、收藏与私信区
    document.getElementById('favoritesSection').style.display = 'none';
    document.getElementById('commentsSection').style.display = 'none';
    document.getElementById('messagesSection').style.display = 'none';
    
  } else {
    // 他人页面：初始隐藏评论与私信区（仅在切换到“私信”时显示发信）
    document.getElementById('commentsSection').style.display = 'none';
    document.getElementById('messagesSection').style.display = 'none';
    
  }
}

function switchTab(key){
  document.querySelectorAll('#profileTabs .tab-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = Array.from(document.querySelectorAll('#profileTabs .tab-btn')).find(b => b.dataset.key === key);
  if (activeBtn) activeBtn.classList.add('active');
  // 显示隐藏区块
  document.querySelector('main').querySelectorAll('.section').forEach(sec => sec.style.display = 'none');
  if (key === 'posts') document.getElementById('postsSection').style.display = 'block';
  if (key === 'favorites') document.getElementById('favoritesSection').style.display = 'block';
  if (key === 'comments') document.getElementById('commentsSection').style.display = 'block';
  if (key === 'messages') {
    document.getElementById('messagesSection').style.display = 'block';
    const input = document.getElementById('messageContent');
    if (input && !input.disabled) {
      input.focus();
      try { input.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
    }
  }
}

async function loadPosts(username){
  const listEl = document.getElementById('postsList');
  const emptyEl = document.getElementById('postsEmpty');
  listEl.innerHTML = '';
  emptyEl.style.display = 'none';
  try {
    const data = await fetchJson(`${API_BASE}/ideas?sort=latest&author=${encodeURIComponent(username)}`);
    if (!data.length) { emptyEl.style.display = 'block'; return; }
    data.forEach(idea => {
      const card = document.createElement('div');
      card.className = 'idea-card';
      card.innerHTML = `
        <div class="idea-header">
          <div class="idea-title clickable">${escapeHtml(idea.title)}</div>
        </div>
        <span class="idea-category">${escapeHtml(idea.category || '')}</span>
        ${idea.image_url ? `<img class="idea-image clickable" src="${escapeHtml(idea.image_url)}">` : ''}
        <div class="idea-content">${escapeHtml(idea.content)}</div>
        <div class="idea-meta"><span>🕒 ${formatTime(idea.created_at)}</span></div>
      `;
      card.querySelectorAll('.clickable').forEach(el => el.addEventListener('click', () => {
        location.href = `/idea.html?id=${idea.id}`;
      }));
      listEl.appendChild(card);
    });
  } catch (err) {
    listEl.innerHTML = `<div class="error">加载失败：${escapeHtml(err.message)}</div>`;
  }
}

async function loadFavorites(username){
  const listEl = document.getElementById('favoritesList');
  const emptyEl = document.getElementById('favoritesEmpty');
  listEl.innerHTML = '';
  emptyEl.style.display = 'none';
  const token = getToken();
  if (!token) { emptyEl.style.display = 'block'; return; }
  try {
    const data = await fetchJson(`${API_BASE}/users/${encodeURIComponent(username)}/favorites`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!data.length) { emptyEl.style.display = 'block'; return; }
    data.forEach(idea => {
      const card = document.createElement('div');
      card.className = 'idea-card';
      card.innerHTML = `
        <div class="idea-header">
          <div class="idea-title clickable">${escapeHtml(idea.title)}</div>
        </div>
        <span class="idea-category">${escapeHtml(idea.category || '')}</span>
        ${idea.image_url ? `<img class="idea-image clickable" src="${escapeHtml(idea.image_url)}">` : ''}
        <div class="idea-content">${escapeHtml(idea.content)}</div>
        <div class="idea-meta"><span>🕒 ${formatTime(idea.created_at)}</span></div>
      `;
      card.querySelectorAll('.clickable').forEach(el => el.addEventListener('click', () => {
        location.href = `/idea.html?id=${idea.id}`;
      }));
      listEl.appendChild(card);
    });
  } catch (err) {
    listEl.innerHTML = `<div class="error">加载失败：${escapeHtml(err.message)}</div>`;
  }
}
async function loadComments(username){
  const listEl = document.getElementById('commentsList');
  const emptyEl = document.getElementById('commentsEmpty');
  listEl.innerHTML = '';
  emptyEl.style.display = 'none';
  try {
    const data = await fetchJson(`${API_BASE}/users/${encodeURIComponent(username)}/comments-received`);
    if (!data.length) { emptyEl.style.display = 'block'; return; }
    data.forEach(c => {
      const item = document.createElement('div');
      item.className = 'comment-item';
      item.innerHTML = `
        <div class="comment-header"><span class="comment-author">${
          c.author && c.author !== '匿名用户'
            ? `<a class="user-link" href="/user.html?u=${encodeURIComponent(c.author)}">${escapeHtml(c.author)}</a>`
            : escapeHtml(c.author || '匿名用户')
        }</span><span class="comment-time">${formatTime(c.created_at)}</span></div>
        <div class="comment-content">${escapeHtml(c.content)}</div>
        ${c.image_url ? `<img class="comment-image" src="${escapeHtml(c.image_url)}">` : ''}
        <div class="muted">发表于：<a href="/idea.html?id=${c.idea_id}">${escapeHtml(c.idea_title)}</a></div>
      `;
      listEl.appendChild(item);
    });
  } catch (err) {
    listEl.innerHTML = `<div class="error">加载失败：${escapeHtml(err.message)}</div>`;
  }
}

async function loadInbox(){
  const listEl = document.getElementById('inboxList');
  const emptyEl = document.getElementById('inboxEmpty');
  listEl.innerHTML = '';
  emptyEl.style.display = 'none';
  try {
    const data = await fetchJson(`${API_BASE}/messages/inbox`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
    if (!data.length) { emptyEl.style.display = 'block'; return; }
    data.forEach(m => {
      const item = document.createElement('div');
      item.className = 'message-item';
      item.innerHTML = `
        <div><strong>来自：</strong>${escapeHtml(m.from_username)}</div>
        <div class="muted">${formatTime(m.created_at)}</div>
        <div>${escapeHtml(m.content)}</div>
      `;
      listEl.appendChild(item);
    });
  } catch (err) {
    listEl.innerHTML = `<div class="error">加载失败：${escapeHtml(err.message)}</div>`;
  }
}

async function loadOutbox(){
  const listEl = document.getElementById('outboxList');
  const emptyEl = document.getElementById('outboxEmpty');
  listEl.innerHTML = '';
  emptyEl.style.display = 'none';
  try {
    const data = await fetchJson(`${API_BASE}/messages/outbox`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
    if (!data.length) { emptyEl.style.display = 'block'; return; }
    data.forEach(m => {
      const item = document.createElement('div');
      item.className = 'message-item';
      item.innerHTML = `
        <div><strong>发给：</strong>${escapeHtml(m.to_username)}</div>
        <div class="muted">${formatTime(m.created_at)}</div>
        <div>${escapeHtml(m.content)}</div>
      `;
      listEl.appendChild(item);
    });
  } catch (err) {
    listEl.innerHTML = `<div class="error">加载失败：${escapeHtml(err.message)}</div>`;
  }
}

async function loadContacts(){
  const contactsEl = document.getElementById('chatContacts');
  const emptyEl = document.getElementById('chatContactsEmpty');
  if (!contactsEl) return;
  contactsEl.innerHTML = '';
  emptyEl.style.display = 'none';
  try {
    const [inbox, outbox] = await Promise.all([
      fetchJson(`${API_BASE}/messages/inbox`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
      fetchJson(`${API_BASE}/messages/outbox`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
    ]);
    const set = new Set();
    inbox.forEach(m => set.add(m.from_username));
    outbox.forEach(m => set.add(m.to_username));
    const contacts = Array.from(set);
    if (!contacts.length) { emptyEl.style.display = 'block'; return; }
    contacts.forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'tab-btn';
      btn.textContent = name;
      btn.addEventListener('click', async () => {
        currentChatUser = name;
        const chatInfo = document.getElementById('chatInfo');
        if (chatInfo) chatInfo.textContent = `与 ${name} 的私信对话`;
        await loadConversation(name);
      });
      contactsEl.appendChild(btn);
    });
  } catch (err) {
    contactsEl.innerHTML = `<div class="error">加载失败：${escapeHtml(err.message)}</div>`;
  }
}

async function loadConversation(withUser){
  const threadEl = document.getElementById('chatThread');
  if (!threadEl) return;
  threadEl.innerHTML = '';
  try {
    const [inbox, outbox] = await Promise.all([
      fetchJson(`${API_BASE}/messages/inbox`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
      fetchJson(`${API_BASE}/messages/outbox`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
    ]);
    const self = getUsername();
    const merged = [];
    inbox.forEach(m => { if (m.from_username === withUser) merged.push(m); });
    outbox.forEach(m => { if (m.to_username === withUser) merged.push(m); });
    merged.sort((a,b) => parseDbDate(a.created_at) - parseDbDate(b.created_at));
    if (!merged.length) {
      threadEl.innerHTML = '<div class="muted">暂无对话</div>';
      return;
    }
    merged.forEach(m => {
      const isSelf = m.from_username === self;
      const bubble = document.createElement('div');
      bubble.className = 'bubble ' + (isSelf ? 'self' : 'other');
      bubble.innerHTML = `
        <div>${escapeHtml(m.content)}</div>
        <div class="meta">${escapeHtml(isSelf ? '我' : m.from_username)} · ${formatTime(m.created_at)}</div>
      `;
      threadEl.appendChild(bubble);
    });
  } catch (err) {
    threadEl.innerHTML = `<div class="error">加载失败：${escapeHtml(err.message)}</div>`;
  }
}

async function sendMessage(toUser, content){
  const res = await fetch(`${API_BASE}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify({ to_username: toUser, content })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '发送失败');
  return data;
}

function escapeHtml(text){
  if (text === undefined || text === null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
