/**
 * 공개 피드 페이지 로직
 */

let currentPage = 1;
let totalMessages = 0;
const cheeredSet = new Set(JSON.parse(localStorage.getItem('cheered') || '[]'));

document.addEventListener('DOMContentLoaded', () => {
  loadFeed(1);
});

async function loadFeed(page) {
  currentPage = page;
  const feedList = document.getElementById('feed-list');
  const pagination = document.getElementById('pagination');

  try {
    const data = await API.get('feed', {
      page: page,
      limit: CONFIG.FEED_PAGE_SIZE
    });

    // 통계 업데이트
    if (data.stats) {
      animateCount(document.getElementById('stat-total'), data.stats.totalMessages);
      animateCount(document.getElementById('stat-today'), data.stats.todayMessages);
      animateCount(document.getElementById('stat-supporters'), data.stats.totalSupporters);
      animateCount(document.getElementById('stat-new-supporters'), data.stats.todaySupporters);
    }

    totalMessages = data.total || 0;

    if (!data.messages || data.messages.length === 0) {
      feedList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#128172;</div>
          <p>아직 메시지가 없습니다</p>
          <p style="font-size:0.85rem;">첫 번째 메시지를 남겨주세요!</p>
        </div>
      `;
      pagination.classList.add('hidden');
      return;
    }

    feedList.innerHTML = data.messages.map(msg => renderMessageCard(msg)).join('');
    renderPagination(data.total, page);

  } catch (err) {
    feedList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#9888;&#65039;</div>
        <p>메시지를 불러오지 못했습니다</p>
        <p style="font-size:0.8rem; color:var(--gray-400);">잠시 후 다시 시도해주세요</p>
      </div>
    `;
  }
}

function renderMessageCard(msg) {
  const messageText = msg.message.length > 100
    ? `${escapeHtml(msg.message.substring(0, 100))}<span class="more-btn" onclick="this.parentElement.textContent='${escapeHtml(msg.message).replace(/'/g, "\\'").replace(/\n/g, ' ')}'">&hellip; 더보기</span>`
    : escapeHtml(msg.message);

  const badges = [];
  if (msg.is_supporter) badges.push('<span class="badge badge-supporter">&#129309; 서포터즈</span>');
  if (msg.has_reply) badges.push('<span class="badge badge-reply">&#128172; 후보 답장</span>');

  const cheered = cheeredSet.has(msg.id);
  const cheersCount = msg.cheers || 0;

  return `
    <div class="message-card ${msg.has_reply ? 'has-reply' : ''}">
      <div class="card-header">
        <span class="card-name">${escapeHtml(msg.name)}</span>
        ${badges.join('')}
        <span class="card-date">${formatDate(msg.created_at)}</span>
      </div>
      <div class="card-body">${messageText.replace(/\n/g, '<br>')}</div>
      <div class="card-footer">
        <button class="cheer-btn ${cheered ? 'cheered' : ''}" onclick="handleCheer(this, '${msg.id}')" ${cheered ? 'disabled' : ''}>
          &#10084;&#65039; 응원 <span class="cheer-count">${cheersCount > 0 ? cheersCount : ''}</span>
        </button>
      </div>
    </div>
  `;
}

async function handleCheer(btn, messageId) {
  if (cheeredSet.has(messageId)) return;

  try {
    const res = await API.post('cheer', { messageId });
    if (res.success) {
      cheeredSet.add(messageId);
      localStorage.setItem('cheered', JSON.stringify([...cheeredSet]));
      btn.classList.add('cheered');
      btn.disabled = true;
      const countEl = btn.querySelector('.cheer-count');
      countEl.textContent = res.cheers;
    }
  } catch (err) {
    // 실패 시 무시
  }
}

function renderPagination(total, current) {
  const pagination = document.getElementById('pagination');
  const totalPages = Math.ceil(total / CONFIG.FEED_PAGE_SIZE);

  if (totalPages <= 1) {
    pagination.classList.add('hidden');
    return;
  }

  pagination.classList.remove('hidden');
  let html = '';

  if (current > 1) {
    html += `<button class="page-btn" onclick="loadFeed(${current - 1})">&#8592;</button>`;
  }

  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, current + 2);

  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="loadFeed(${i})">${i}</button>`;
  }

  if (current < totalPages) {
    html += `<button class="page-btn" onclick="loadFeed(${current + 1})">&#8594;</button>`;
  }

  pagination.innerHTML = html;
}
