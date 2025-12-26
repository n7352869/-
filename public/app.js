const API_BASE = '/api';

let currentTab = 'all';
let currentCategory = 'all';
let currentIdeaId = null;
let ideas = [];

// 设置随机背景色（赤橙黄绿青蓝紫）
function setRandomBackground() {
    const gradients = [
        'linear-gradient(135deg, #E53935 0%, #FF6B6B 100%)', // 赤 - Red
        'linear-gradient(135deg, #FB8C00 0%, #FFD54F 100%)', // 橙 - Orange
        'linear-gradient(135deg, #FDD835 0%, #FFF59D 100%)', // 黄 - Yellow
        'linear-gradient(135deg, #43A047 0%, #A5D6A7 100%)', // 绿 - Green
        'linear-gradient(135deg, #00BCD4 0%, #80DEEA 100%)', // 青 - Cyan
        'linear-gradient(135deg, #1E88E5 0%, #90CAF9 100%)', // 蓝 - Blue
        'linear-gradient(135deg, #8E24AA 0%, #CE93D8 100%)'  // 紫 - Purple
    ];
    const gradient = gradients[Math.floor(Math.random() * gradients.length)];
    document.body.style.background = gradient;
    document.body.style.backgroundAttachment = 'fixed';
    document.body.style.backgroundRepeat = 'no-repeat';
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 仅首页应用随机背景色
    if (location.pathname === '/' || location.pathname.endsWith('/index.html')) {
        setRandomBackground();
        colorizeSiteName();
    }
    initCategories();
    initTabs();
    initTabDropdowns();
    initForm();
    initAuth();
    refreshAuthRole();
    initBanwordsAdmin();
    initUsersAdmin();
    updateAuthUI();
    initPublishLoginHint();
    autofillAuthor();
    loadIdeas();
});

// 分类切换
function initCategories() {
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            loadIdeas();
        });
    });
}

// 标签页切换
function initTabs() {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.dataset.tab;
            loadIdeas();
        });
    });
}

// 顶部标签的下拉菜单分类选择
function initTabDropdowns() {
    document.querySelectorAll('.tab-with-dropdown .tab-dropdown .dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const parentTabBtn = item.closest('.tab-with-dropdown').querySelector('.tab-btn[data-tab]');
            if (!parentTabBtn) return;

            // 切换当前标签页激活态
            document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
            parentTabBtn.classList.add('active');
            currentTab = parentTabBtn.dataset.tab;

            // 设置当前分类
            currentCategory = item.dataset.category;

            // 同步顶部分类导航的激活状态
            document.querySelectorAll('.category-btn').forEach(b => {
                if (b.dataset.category === currentCategory) {
                    b.classList.add('active');
                } else {
                    b.classList.remove('active');
                }
            });

            // 自动收起下拉菜单（即使仍在悬停，也强制隐藏一次）
            const dropdown = item.closest('.tab-with-dropdown')?.querySelector('.tab-dropdown');
            if (dropdown) {
                dropdown.style.display = 'none';
                // 清除内联样式，保证下一次悬停还能正常显示
                setTimeout(() => { dropdown.style.display = ''; }, 200);
            }

            loadIdeas();
        });
    });
}

// 发布表单
function initForm() {
    document.getElementById('ideaForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = document.getElementById('ideaTitle').value.trim();
        const content = document.getElementById('ideaContent').value.trim();
        const author = document.getElementById('ideaAuthor').value.trim();
        const category = document.getElementById('ideaCategory').value;
        const imageFile = document.getElementById('ideaImage')?.files?.[0];
        let imageUrl = null;
        
        if (!title || !content) {
            alert('请填写标题和内容');
            return;
        }
        
        try {
            // 如果选择了图片，先上传图片
            if (imageFile) {
                const fd = new FormData();
                fd.append('image', imageFile);
                const uploadResp = await fetch(`${API_BASE}/upload`, {
                    method: 'POST',
                    body: fd
                });
                const uploadData = await uploadResp.json();
                if (!uploadResp.ok) {
                    throw new Error(uploadData.error || '图片上传失败');
                }
                imageUrl = uploadData.url;
            }
            const token = getToken();
            if (!token) { 
                // alert('请先登录后发布'); 
                const loginHint = document.getElementById('loginHint');
                if (loginHint) loginHint.style.display = 'block';
                return; 
            }

            const response = await fetch(`${API_BASE}/ideas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ title, content, author, category, image_url: imageUrl })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                alert('发布成功！');
                document.getElementById('ideaForm').reset();
                loadIdeas();
            } else {
                alert('发布失败：' + data.error);
            }
        } catch (error) {
            alert('发布失败：' + error.message);
        }
    });
}

// 加载想法列表
async function loadIdeas() {
    const container = document.getElementById('ideasContainer');
    const loading = document.getElementById('loading');
    const emptyState = document.getElementById('emptyState');
    
    container.innerHTML = '';
    loading.style.display = 'block';
    emptyState.style.display = 'none';
    
    try {
        let url = `${API_BASE}/ideas`;
        
        // 添加分类参数
        const params = new URLSearchParams();
        if (currentCategory && currentCategory !== 'all') {
            params.append('category', currentCategory);
        }
        
        if (currentTab === 'daily') {
            // 热门排行按热度排序
            params.append('sort', 'hot');
        } else if (currentTab === 'latest') {
            // 最新发布按发布时间排序
            params.append('sort', 'latest');
        } else {
            // 全部想法按发布时间排序
            params.append('sort', 'latest');
        }
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        loading.style.display = 'none';
        
        if (data.length === 0) {
            emptyState.style.display = 'block';
            return;
        }
        
        ideas = data;
        data.forEach((idea, index) => {
            const card = createIdeaCard(idea, index + 1);
            container.appendChild(card);
        });
        
        // 加载点赞状态
    data.forEach((idea, index) => {
        checkLikeStatus(idea.id, index);
        checkFavoriteStatus(idea.id);
    });
    } catch (error) {
        loading.style.display = 'none';
        container.innerHTML = `<div class="error">加载失败：${error.message}</div>`;
    }
}

// 创建想法卡片
function createIdeaCard(idea, rank) {
    const card = document.createElement('div');
    const hotClass = currentTab === 'daily' ? (rank <= 3 ? ' hot-top' : ' hot') : '';
    card.className = 'idea-card' + hotClass;
    card.dataset.id = idea.id;
    
    const hotScore = (idea.likes_count || idea.likes || 0) * 2 + (idea.comments_count || 0);
    const rankBadge = currentTab === 'daily' && rank <= 3 
        ? `<span class="idea-rank">🔥 第${rank}名</span>` 
        : '';
    const categoryBadge = idea.category 
        ? `<span class="idea-category">${escapeHtml(idea.category)}</span>` 
        : '';
    const imageSection = idea.image_url 
        ? `<img class="idea-image clickable" src="${escapeHtml(idea.image_url)}" alt="idea-image">`
        : '';
    
    card.innerHTML = `
        <div class="idea-header">
            <div class="idea-title clickable">${escapeHtml(idea.title)}</div>
            ${rankBadge}
        </div>
        ${categoryBadge}
        ${imageSection}
        <div class="idea-content clickable">${escapeHtml(idea.content)}</div>
        <div class="idea-meta">
            <span>👤 <a class="user-link" href="/user.html?u=${encodeURIComponent(idea.author || '匿名用户')}">${escapeHtml(idea.author || '匿名用户')}</a></span>
            <span>🕒 ${formatTime(idea.created_at)}</span>
        </div>
        <div class="idea-actions">
            <button class="action-btn like-btn" data-id="${idea.id}">
                <span class="like-icon">${currentTab === 'daily' ? '🔥' : '👍'}</span>
                <span class="like-count">${idea.likes_count || idea.likes || 0}</span>
            </button>
            <button class="action-btn comment-btn" data-id="${idea.id}">
                💬 评论 <span class="comment-count">${idea.comments_count || 0}</span>
            </button>
            <button class="action-btn favorite-btn" data-id="${idea.id}">⭐ 收藏</button>
            ${isAdmin() ? `<button class="action-btn admin-edit-btn" data-id="${idea.id}">✏️ 编辑</button>` : ''}
            ${isAdmin() ? `<button class="action-btn admin-delete-btn" data-id="${idea.id}">🗑 删除</button>` : ''}
        </div>
    `;
    
    // 点赞按钮事件
    card.querySelector('.like-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleLike(idea.id); });
    
    // 评论按钮事件
    card.querySelector('.comment-btn').addEventListener('click', (e) => { e.stopPropagation(); openCommentModal(idea.id); });
    
    // 收藏按钮事件
    card.querySelector('.favorite-btn').addEventListener('click', async (e) => { 
        e.stopPropagation(); 
        await toggleFavorite(idea.id); 
    });
    
    if (isAdmin()) {
        const editBtn = card.querySelector('.admin-edit-btn');
        const delBtn = card.querySelector('.admin-delete-btn');
        if (editBtn) editBtn.addEventListener('click', async (e) => { e.stopPropagation(); await adminEditIdea(idea); });
        if (delBtn) delBtn.addEventListener('click', async (e) => { e.stopPropagation(); await adminDeleteIdea(idea.id, card); });
    }

    // 标题/内容/图片点击跳转详情页
    card.querySelectorAll('.clickable').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
            window.location.href = `/idea.html?id=${idea.id}`;
        });
    });
    
    return card;
}

// 切换点赞
async function toggleLike(ideaId) {
    try {
        const response = await fetch(`${API_BASE}/ideas/${ideaId}/like`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const btn = document.querySelector(`.like-btn[data-id="${ideaId}"]`);
            const countSpan = btn.querySelector('.like-count');
            
            countSpan.textContent = data.likes;
            
            if (data.liked) {
                btn.classList.add('liked');
            } else {
                btn.classList.remove('liked');
            }
            
            // 如果是今日热门，重新加载以更新排名
            if (currentTab === 'daily') {
                setTimeout(() => loadIdeas(), 500);
            }
        }
    } catch (error) {
        alert('操作失败：' + error.message);
    }
}

// 检查点赞状态
async function checkLikeStatus(ideaId, index) {
    try {
        const response = await fetch(`${API_BASE}/ideas/${ideaId}/like-status`);
        const data = await response.json();
        
        if (data.liked) {
            const btn = document.querySelector(`.like-btn[data-id="${ideaId}"]`);
            if (btn) {
                btn.classList.add('liked');
            }
        }
    } catch (error) {
        // 忽略错误
    }
}

// 切换收藏（需登录）
async function toggleFavorite(ideaId) {
    const token = getToken();
    if (!token) { alert('请先登录后再收藏'); return; }
    try {
        const res = await fetch(`${API_BASE}/ideas/${ideaId}/favorite`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '操作失败');
        const btn = document.querySelector(`.favorite-btn[data-id="${ideaId}"]`);
        if (!btn) return;
        if (data.favorited) {
            btn.classList.add('favorited');
            btn.textContent = '⭐ 已收藏';
        } else {
            btn.classList.remove('favorited');
            btn.textContent = '⭐ 收藏';
        }
    } catch (err) {
        alert('操作失败：' + err.message);
    }
}

// 检查收藏状态（需登录）
async function checkFavoriteStatus(ideaId) {
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch(`${API_BASE}/ideas/${ideaId}/favorite-status`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        const btn = document.querySelector(`.favorite-btn[data-id="${ideaId}"]`);
        if (data.favorited && btn) {
            const btn = document.querySelector(`.favorite-btn[data-id="${ideaId}"]`);
            btn.classList.add('favorited');
            btn.textContent = '⭐ 已收藏';
        } else if (btn) {
            btn.classList.remove('favorited');
            btn.textContent = '⭐ 收藏';
        }
    } catch (err) {}
}

// 打开评论模态框
async function openCommentModal(ideaId) {
    currentIdeaId = ideaId;
    const modal = document.getElementById('commentModal');
    modal.classList.add('show');
    
    await loadComments(ideaId);
    
    // 重置表单
    document.getElementById('commentForm').reset();
    const name = getUsername();
    const authorInput = document.getElementById('commentAuthor');
    if (name && authorInput) authorInput.value = name;
    document.getElementById('commentForm').onsubmit = async (e) => {
        e.preventDefault();
        await submitComment(ideaId);
    };
}

// 加载评论
async function loadComments(ideaId) {
    const commentList = document.getElementById('commentList');
    commentList.innerHTML = '<div class="loading">加载中...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/ideas/${ideaId}/comments`);
        const comments = await response.json();
        
        if (comments.length === 0) {
            commentList.innerHTML = '<p style="text-align: center; color: #999;">还没有评论，快来第一个评论吧！</p>';
            return;
        }
        
        commentList.innerHTML = comments.map(comment => `
            <div class="comment-item" data-id="${comment.id}">
                <div class="comment-header">
                    <span class="comment-author">${
                        comment.author && comment.author !== '匿名用户'
                          ? `<a class="user-link" href="/user.html?u=${encodeURIComponent(comment.author)}">${escapeHtml(comment.author)}</a>`
                          : escapeHtml(comment.author || '匿名用户')
                    }</span>
                    <span class="comment-time">${formatTime(comment.created_at)}</span>
                </div>
                ${comment.image_url ? `<img class="comment-image" src="${escapeHtml(comment.image_url)}" alt="comment-image">` : ''}
                <div class="comment-content">${escapeHtml(comment.content)}</div>
                ${isAdmin() ? `<div><button class="action-btn comment-delete-btn" data-id="${comment.id}">删除评论</button></div>` : ''}
            </div>
        `).join('');
        if (isAdmin()) {
            commentList.querySelectorAll('.comment-delete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const cid = btn.dataset.id;
                    await adminDeleteComment(cid);
                    await loadComments(ideaId);
                    loadIdeas();
                });
            });
        }
    } catch (error) {
        commentList.innerHTML = `<div class="error">加载失败：${error.message}</div>`;
    }
}

async function adminEditIdea(idea) {
    const token = getToken();
    if (!token) return alert('需要登录');
    const title = prompt('编辑标题', idea.title);
    if (title === null) return;
    const content = prompt('编辑内容', idea.content);
    if (content === null) return;
    try {
        const res = await fetch(`${API_BASE}/ideas/${idea.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ title, content })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '更新失败');
        loadIdeas();
    } catch (err) {
        alert(err.message);
    }
}

async function adminDeleteIdea(ideaId, cardEl) {
    const token = getToken();
    if (!token) return alert('需要登录');
    if (!confirm('确定删除该内容？')) return;
    try {
        const res = await fetch(`${API_BASE}/ideas/${ideaId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '删除失败');
        if (cardEl && cardEl.parentNode) cardEl.parentNode.removeChild(cardEl);
    } catch (err) {
        alert(err.message);
    }
}

async function adminDeleteComment(commentId) {
    const token = getToken();
    if (!token) return alert('需要登录');
    try {
        const res = await fetch(`${API_BASE}/comments/${commentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '删除失败');
    } catch (err) {
        alert(err.message);
    }
}

// 提交评论
async function submitComment(ideaId) {
    const content = document.getElementById('commentContent').value.trim();
    const author = document.getElementById('commentAuthor').value.trim();
    const imageFile = document.getElementById('commentImage')?.files?.[0];
    let imageUrl = null;
    
    if (!content) {
        alert('请输入评论内容');
        return;
    }
    
    try {
        // 上传评论图片（如有）
        if (imageFile) {
            const fd = new FormData();
            fd.append('image', imageFile);
            const uploadResp = await fetch(`${API_BASE}/upload`, {
                method: 'POST',
                body: fd
            });
            const uploadData = await uploadResp.json();
            if (!uploadResp.ok) {
                throw new Error(uploadData.error || '图片上传失败');
            }
            imageUrl = uploadData.url;
        }
        const response = await fetch(`${API_BASE}/ideas/${ideaId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken() || ''}`
            },
            body: JSON.stringify({ content, author, image_url: imageUrl })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('commentForm').reset();
            await loadComments(ideaId);
            loadIdeas(); // 刷新列表以更新评论数
        } else {
            alert('评论失败：' + data.error);
        }
    } catch (error) {
        alert('评论失败：' + error.message);
    }
}

// 关闭模态框
document.querySelector('.close').addEventListener('click', () => {
    document.getElementById('commentModal').classList.remove('show');
});

document.getElementById('commentModal').addEventListener('click', (e) => {
    if (e.target.id === 'commentModal') {
        document.getElementById('commentModal').classList.remove('show');
    }
});

// 工具函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timeString) {
    const date = new Date(timeString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) {
        return '刚刚';
    } else if (diff < 3600000) {
        return `${Math.floor(diff / 60000)}分钟前`;
    } else if (diff < 86400000) {
        return `${Math.floor(diff / 3600000)}小时前`;
    } else if (diff < 604800000) {
        return `${Math.floor(diff / 86400000)}天前`;
    } else {
        return date.toLocaleDateString('zh-CN');
    }
}

// ===== 认证相关 =====
const TOKEN_KEY = 'auth_token';
const USERNAME_KEY = 'auth_username';
const ROLE_KEY = 'auth_role';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(token) { localStorage.setItem(TOKEN_KEY, token); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }
function setUsername(name) { localStorage.setItem(USERNAME_KEY, name); }
function getUsername() { return localStorage.getItem(USERNAME_KEY); }
function clearUsername() { localStorage.removeItem(USERNAME_KEY); }
function setRole(role) { localStorage.setItem(ROLE_KEY, role || 'user'); }
function getRole() { return localStorage.getItem(ROLE_KEY) || 'user'; }
function isAdmin() { return getRole() === 'admin'; }

async function refreshAuthRole(){
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch(`${API_BASE}/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (res.ok && data.user) {
            setRole(data.user.role || 'user');
            if (data.token) setToken(data.token);
            updateAuthUI();
        }
    } catch {}
}

function initBanwordsAdmin(){
    const openBtn = document.getElementById('openBanwordsBtn');
    const modal = document.getElementById('banwordsModal');
    const closeBtn = document.getElementById('banwordsClose');
    const textarea = document.getElementById('banwordsTextarea');
    const saveBtn = document.getElementById('saveBanwordsBtn');
    const statusEl = document.getElementById('banwordsStatus');
    function open(){ if (modal) modal.classList.add('show'); }
    function close(){ if (modal) modal.classList.remove('show'); }
    if (openBtn) openBtn.addEventListener('click', async () => {
        if (!isAdmin()) { alert('需要管理员权限'); return; }
        open();
        if (statusEl) statusEl.textContent = '加载中...';
        try {
            const token = getToken();
            if (!token) throw new Error('请重新登录');
            const res = await fetch(`${API_BASE}/admin/banwords`, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '加载失败');
            if (textarea) textarea.value = data.content || '';
            if (statusEl) statusEl.textContent = '';
        } catch (err) {
            if (statusEl) statusEl.textContent = '加载失败：' + err.message;
            else alert('加载失败：' + err.message);
        }
    });
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (modal) modal.addEventListener('click', (e) => { if (e.target.id === 'banwordsModal') close(); });
    if (saveBtn) saveBtn.addEventListener('click', async () => {
        try {
            statusEl.textContent = '保存中...';
            const res = await fetch(`${API_BASE}/admin/banwords`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ content: textarea.value || '' })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '保存失败');
            statusEl.textContent = `已保存（${data.count} 条）`;
            setTimeout(() => { close(); }, 500);
        } catch (err) {
            statusEl.textContent = '保存失败：' + err.message;
        }
    });
}

function initUsersAdmin(){
    const openBtn = document.getElementById('openUsersAdminBtn');
    const modal = document.getElementById('usersAdminModal');
    const closeBtn = document.getElementById('usersAdminClose');
    const countEl = document.getElementById('usersAdminCount');
    const listEl = document.getElementById('usersAdminList');
    const statusEl = document.getElementById('usersAdminStatus');
    function open(){ if (modal) modal.classList.add('show'); }
    function close(){ if (modal) modal.classList.remove('show'); }
    async function load(){
        if (!isAdmin()) { statusEl.textContent = '需要管理员权限'; return; }
        statusEl.textContent = '加载中...';
        listEl.innerHTML = '';
        try {
            const token = getToken();
            const cRes = await fetch(`${API_BASE}/admin/users/count`, { headers: { 'Authorization': `Bearer ${token}` } });
            const cData = await cRes.json();
            if (!cRes.ok) throw new Error(cData.error || '获取用户数失败');
            countEl.textContent = `注册用户数：${cData.count}`;
            const uRes = await fetch(`${API_BASE}/admin/users?limit=200`, { headers: { 'Authorization': `Bearer ${token}` } });
            const users = await uRes.json();
            if (!uRes.ok) throw new Error(users.error || '获取用户列表失败');
            if (!Array.isArray(users) || users.length === 0) {
                listEl.innerHTML = '<div class="muted">暂无用户</div>';
            } else {
                listEl.innerHTML = users.map(u => `
                    <div class="comment-item">
                        <div class="comment-header">
                            <span class="comment-author"><a class="user-link" href="/user.html?u=${encodeURIComponent(u.username)}">${u.username}</a></span>
                            <span class="comment-time">${u.created_at ? new Date(u.created_at).toLocaleString('zh-CN') : ''}</span>
                        </div>
                        <div class="comment-content">角色：${u.role || 'user'}；状态：${u.blocked ? '已拉黑' : '正常'}</div>
                    </div>
                `).join('');
            }
            statusEl.textContent = '';
        } catch (err) {
            statusEl.textContent = '加载失败：' + err.message;
        }
    }
    if (openBtn) openBtn.addEventListener('click', async () => { open(); await load(); });
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (modal) modal.addEventListener('click', (e) => { if (e.target.id === 'usersAdminModal') close(); });
}
function initPublishLoginHint(){
    const form = document.getElementById('ideaForm');
    const loginHint = document.getElementById('loginHint');
    const closeHintBtn = document.getElementById('closeLoginHint');
    const goToLoginBtn = document.getElementById('goToLoginBtn');
    const openAuthBtn = document.getElementById('openAuthBtn');
    
    if (!form || !loginHint) return;
    if (form.dataset.loginHintInstalled === '1') return;
    form.dataset.loginHintInstalled = '1';

    const inputs = ['ideaTitle','ideaContent','ideaAuthor','ideaCategory'];
    const fileLabel = document.querySelector('label[for="ideaImage"]');
    const submitBtn = document.querySelector('#ideaForm button[type="submit"]');

    function showHint(e){
        if (!getToken()) {
            e && e.preventDefault();
            e && e.stopPropagation(); // Stop propagation to avoid immediate close
            loginHint.style.display = 'block';
        }
    }

    function hideHint(){
        if (loginHint.style.display !== 'none') {
            loginHint.style.display = 'none';
        }
    }

    // Bind show hint to inputs
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('focus', showHint);
            el.addEventListener('click', showHint);
        }
    });
    if (fileLabel) fileLabel.addEventListener('click', showHint);
    if (submitBtn) submitBtn.addEventListener('click', showHint);

    // Close hint actions
    if (closeHintBtn) closeHintBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideHint();
    });

    if (goToLoginBtn) goToLoginBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideHint();
        const openAuthBtn = document.getElementById('openAuthBtn');
        if (openAuthBtn) openAuthBtn.click();
    });

    if (openAuthBtn) {
        // Wrap original click if needed, or just add listener
        openAuthBtn.addEventListener('click', () => {
            hideHint();
        });
    }

    // Click outside to close
    document.addEventListener('click', (e) => {
        if (loginHint.style.display === 'none') return;
        
        // If click is inside loginHint, do nothing
        if (loginHint.contains(e.target)) return;
        
        // If click is inside form (which triggers it), do nothing? 
        // User said: "click other place ... prompt disappears"
        // But if I click the form again, it should probably stay or re-trigger.
        // If I click outside the form AND outside the hint, it should close.
        
        // Let's see: user said "click other place or click top right login button -> prompt disappears"
        // So if I click background, it disappears.
        // If I click form input, showHint is called.
        
        // If I click somewhere else that is NOT the form and NOT the hint.
        if (!form.contains(e.target) && !loginHint.contains(e.target)) {
            hideHint();
        }
    });
}

function updateAuthUI() {
    const openAuthBtn = document.getElementById('openAuthBtn');
    const userInfo = document.getElementById('userInfo');
    const usernameLabel = document.getElementById('usernameLabel');
    const openBanwordsBtn = document.getElementById('openBanwordsBtn');
    const openUsersAdminBtn = document.getElementById('openUsersAdminBtn');
    const token = getToken();
    if (token) {
        if (openAuthBtn) openAuthBtn.style.display = 'none';
        if (userInfo) userInfo.style.display = 'inline-block';
        if (usernameLabel) usernameLabel.textContent = getUsername() || '';
        if (openBanwordsBtn) openBanwordsBtn.style.display = isAdmin() ? 'inline-block' : 'none';
        if (openUsersAdminBtn) openUsersAdminBtn.style.display = isAdmin() ? 'inline-block' : 'none';
    } else {
        if (openAuthBtn) openAuthBtn.style.display = 'inline-block';
        if (userInfo) userInfo.style.display = 'none';
        if (usernameLabel) usernameLabel.textContent = '';
        if (openBanwordsBtn) openBanwordsBtn.style.display = 'none';
        if (openUsersAdminBtn) openUsersAdminBtn.style.display = 'none';
    }
}

function autofillAuthor() {
    const name = getUsername();
    const authorInput = document.getElementById('ideaAuthor');
    if (name && authorInput) authorInput.value = name;
}

function initAuth() {
    const authModal = document.getElementById('authModal');
    const authClose = document.getElementById('authClose');
    const openAuthBtn = document.getElementById('openAuthBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    const registerUsername = document.getElementById('registerUsername');
    const registerPassword = document.getElementById('registerPassword');

    function openAuth() { if (authModal) authModal.classList.add('show'); }
    function closeAuth() { if (authModal) authModal.classList.remove('show'); }

    if (openAuthBtn) openAuthBtn.addEventListener('click', openAuth);
    if (authClose) authClose.addEventListener('click', closeAuth);
    if (authModal) authModal.addEventListener('click', (e) => {
        if (e.target.id === 'authModal') closeAuth();
    });

    if (logoutBtn) logoutBtn.addEventListener('click', () => {
        clearToken();
        clearUsername();
        setRole('user');
        updateAuthUI();
    });

    if (loginForm) loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = loginUsername?.value?.trim();
        const password = loginPassword?.value;
        if (!username || !password) return alert('请输入用户名和密码');
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '登录失败');
            setToken(data.token);
            setUsername(data.user.username);
            setRole(data.user.role || 'user');
            updateAuthUI();
            autofillAuthor();
            closeAuth();
        } catch (err) {
            alert(err.message);
        }
    });

    if (registerForm) registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = registerUsername?.value?.trim();
        const password = registerPassword?.value;
        if (!username || !password) return alert('请输入用户名和密码');
        try {
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '注册失败');
            // 注册成功后自动登录
            const loginRes = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const loginData = await loginRes.json();
            if (!loginRes.ok) throw new Error(loginData.error || '登录失败');
            setToken(loginData.token);
            setUsername(loginData.user.username);
            setRole(loginData.user.role || 'user');
            updateAuthUI();
            autofillAuthor();
            closeAuth();
        } catch (err) {
            alert(err.message);
        }
    });
}

// 网站名每个字随机不同颜色（首页）
function colorizeSiteName() {
    const h1 = document.querySelector('header h1');
    if (!h1) return;
    const target = '我有一个创意';
    const text = h1.textContent || '';
    const idx = text.indexOf(target);
    if (idx === -1) return;

    const prefix = text.slice(0, idx);
    const suffix = text.slice(idx + target.length);
    const palette = ['#E53935','#FB8C00','#FDD835','#43A047','#00BCD4','#1E88E5','#8E24AA'];
    // 打乱颜色顺序，确保相邻字符尽量不重复
    const shuffled = palette.slice().sort(() => Math.random() - 0.5);
    const chars = Array.from(target);
    const colored = chars.map((ch, i) => `<span style="color:${shuffled[i % shuffled.length]}">${escapeHtml(ch)}</span>`).join('');
    h1.innerHTML = `${escapeHtml(prefix)}${colored}${escapeHtml(suffix)}`;
}
