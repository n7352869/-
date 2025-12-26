const API_BASE = '/api';

function setRandomBackground() {
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

function getQueryParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function formatTime(timeString) {
  const date = new Date(timeString);
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  return date.toLocaleDateString('zh-CN');
}

function getRole(){ return localStorage.getItem('auth_role') || 'user'; }
function isAdmin(){ return getRole() === 'admin'; }

async function loadIdea(id) {
  const titleEl = document.getElementById('detailTitle');
  const categoryEl = document.getElementById('detailCategory');
  const authorEl = document.getElementById('detailAuthor');
  const timeEl = document.getElementById('detailTime');
  const contentEl = document.getElementById('detailContent');
  const imageEl = document.getElementById('detailImage');
  const likeCountEl = document.getElementById('detailLikeCount');
  const likeBtn = document.getElementById('detailLikeBtn');
  const favoriteBtn = document.getElementById('detailFavoriteBtn');
  const editBtn = document.getElementById('detailEditBtn');
  const deleteBtn = document.getElementById('detailDeleteBtn');

  try {
    const resp = await fetch(`${API_BASE}/ideas/${id}`);
    const idea = await resp.json();
    if (!resp.ok) throw new Error(idea.error || '加载失败');

    titleEl.textContent = idea.title;
    categoryEl.textContent = idea.category || '';
    authorEl.textContent = `👤 ${idea.author || '匿名用户'}`;
    timeEl.textContent = `🕒 ${formatTime(idea.created_at)}`;
    contentEl.innerHTML = escapeHtml(idea.content);

    if (idea.image_url) {
      imageEl.src = idea.image_url;
      imageEl.style.display = 'block';
    } else {
      imageEl.style.display = 'none';
    }

    likeCountEl.textContent = idea.likes || idea.likes_count || 0;

    likeBtn.onclick = async () => {
      try {
        const res = await fetch(`${API_BASE}/ideas/${id}/like`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          likeCountEl.textContent = data.likes;
          if (data.liked) likeBtn.classList.add('liked'); else likeBtn.classList.remove('liked');
        }
      } catch (e) { alert('操作失败：' + e.message); }
    };

    // 收藏状态与事件（需要登录）
    const token = localStorage.getItem('auth_token');
    if (token && favoriteBtn) {
      try {
        const s = await fetch(`${API_BASE}/ideas/${id}/favorite-status`, { headers: { 'Authorization': `Bearer ${token}` } });
        const sd = await s.json();
        if (sd.favorited) {
          favoriteBtn.classList.add('favorited');
          favoriteBtn.textContent = '⭐ 已收藏';
        } else {
          favoriteBtn.classList.remove('favorited');
          favoriteBtn.textContent = '⭐ 收藏';
        }
      } catch {}
      favoriteBtn.onclick = async () => {
        try {
          const res = await fetch(`${API_BASE}/ideas/${id}/favorite`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '操作失败');
          if (data.favorited) {
            favoriteBtn.classList.add('favorited');
            favoriteBtn.textContent = '⭐ 已收藏';
          } else {
            favoriteBtn.classList.remove('favorited');
            favoriteBtn.textContent = '⭐ 收藏';
          }
        } catch (e) { alert('请登录后再收藏'); }
      };
    } else if (favoriteBtn) {
      favoriteBtn.onclick = () => alert('请先登录后再收藏');
    }
    
    if (editBtn && deleteBtn) {
      if (!isAdmin()) {
        editBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
      } else {
        editBtn.onclick = async () => {
          const token = localStorage.getItem('auth_token');
          const newTitle = prompt('编辑标题', idea.title);
          if (newTitle === null) return;
          const newContent = prompt('编辑内容', idea.content);
          if (newContent === null) return;
          try {
            const res = await fetch(`${API_BASE}/ideas/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ title: newTitle, content: newContent })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '更新失败');
            await loadIdea(id);
          } catch (e) { alert(e.message); }
        };
        deleteBtn.onclick = async () => {
          const token = localStorage.getItem('auth_token');
          if (!confirm('确定删除该内容？')) return;
          try {
            const res = await fetch(`${API_BASE}/ideas/${id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '删除失败');
            location.href = '/';
          } catch (e) { alert(e.message); }
        };
      }
    }
  } catch (e) {
    document.getElementById('ideaDetail').innerHTML = `<div class="error">加载失败：${escapeHtml(e.message)}</div>`;
  }
}

async function loadComments(id) {
  const listEl = document.getElementById('detailCommentList');
  listEl.innerHTML = '<div class="loading">加载中...</div>';
  try {
    const resp = await fetch(`${API_BASE}/ideas/${id}/comments`);
    const comments = await resp.json();
    if (!Array.isArray(comments) || comments.length === 0) {
      listEl.innerHTML = '<p style="text-align:center;color:#999;">还没有评论，快来第一个评论吧！</p>';
      return;
    }
    listEl.innerHTML = comments.map(c => `
      <div class="comment-item" data-id="${c.id}">
        <div class="comment-header">
          <span class="comment-author">${
            c.author && c.author !== '匿名用户'
              ? `<a class="user-link" href="/user.html?u=${encodeURIComponent(c.author)}">${escapeHtml(c.author)}</a>`
              : escapeHtml(c.author || '匿名用户')
          }</span>
          <span class="comment-time">${formatTime(c.created_at)}</span>
        </div>
        ${c.image_url ? `<img class="comment-image" src="${escapeHtml(c.image_url)}" alt="comment-image">` : ''}
        <div class="comment-content">${escapeHtml(c.content)}</div>
        ${isAdmin() ? `<div><button class="action-btn comment-delete-btn" data-id="${c.id}">删除评论</button></div>` : ''}
      </div>
    `).join('');
    if (isAdmin()) {
      listEl.querySelectorAll('.comment-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const token = localStorage.getItem('auth_token');
          const cid = btn.dataset.id;
          try {
            const res = await fetch(`${API_BASE}/comments/${cid}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '删除失败');
            await loadComments(id);
          } catch (e) { alert(e.message); }
        });
      });
    }
  } catch (e) {
    listEl.innerHTML = `<div class="error">加载失败：${escapeHtml(e.message)}</div>`;
  }
}

async function submitComment(id) {
  const author = document.getElementById('detailCommentAuthor').value.trim();
  const content = document.getElementById('detailCommentContent').value.trim();
  const imageFile = document.getElementById('detailCommentImage')?.files?.[0];
  let imageUrl = null;
  if (!content) { alert('请输入评论内容'); return; }
  try {
    if (imageFile) {
      const fd = new FormData();
      fd.append('image', imageFile);
      const uploadResp = await fetch(`${API_BASE}/upload`, { method: 'POST', body: fd });
      const uploadData = await uploadResp.json();
      if (!uploadResp.ok) throw new Error(uploadData.error || '图片上传失败');
      imageUrl = uploadData.url;
    }
    const token = localStorage.getItem('auth_token');
    if (!token) { alert('请先登录后再评论'); return; }
    const resp = await fetch(`${API_BASE}/ideas/${id}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ author, content, image_url: imageUrl })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '评论失败');
    document.getElementById('detailCommentForm').reset();
    await loadComments(id);
  } catch (e) { alert(e.message); }
}

document.addEventListener('DOMContentLoaded', async () => {
  setRandomBackground();
  const name = localStorage.getItem('auth_username');
  const authorInput = document.getElementById('detailCommentAuthor');
  if (name && authorInput) authorInput.value = name;
  const id = getQueryParam('id');
  if (!id) {
    document.body.innerHTML = '<div class="detail-container"><div class="error">未提供想法 ID</div></div>';
    return;
  }
  await loadIdea(id);
  await loadComments(id);
  document.getElementById('detailCommentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitComment(id);
  });
});
