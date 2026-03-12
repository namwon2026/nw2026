/**
 * 공개 피드 페이지 로직
 * - sessionStorage 캐시로 재방문 시 즉시 표시
 * - 백그라운드에서 최신 데이터 갱신
 */

let currentPage = 1;
let totalMessages = 0;
const cheeredSet = new Set(JSON.parse(localStorage.getItem('cheered') || '[]'));
const CACHE_KEY = 'feed_cache_';
const CACHE_TTL = 300000; // 5분 캐시

function initFeed() {
  if (!document.getElementById('feed-list')) return; // 다른 페이지에서는 실행하지 않음
  currentPage = 1;
  loadFeed(1);
}

// 라우터 등록 + 초기 로드
if (typeof Router !== 'undefined') Router.register('list.html', initFeed);
document.addEventListener('DOMContentLoaded', initFeed);

async function loadFeed(page) {
  currentPage = page;
  const feedList = document.getElementById('feed-list');
  const pagination = document.getElementById('pagination');

  // 캐시된 데이터 즉시 표시
  const cached = getCachedFeed(page);
  if (cached) {
    renderFeedData(cached, feedList, pagination);
    // 캐시 히트 시 인접 페이지도 프리패치
    prefetchAdjacentPages(page, cached.total || 0);
  } else {
    // 캐시 미스 시 로딩 표시
    feedList.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>메시지를 불러오는 중...</p>
      </div>
    `;
  }

  // API에서 최신 데이터 가져오기
  try {
    const data = await API.get('feed', {
      page: page,
      limit: CONFIG.FEED_PAGE_SIZE
    });

    setCachedFeed(page, data);
    renderFeedData(data, feedList, pagination);

    // 인접 페이지 프리패치 (현재 페이지 ±1)
    prefetchAdjacentPages(page, data.total);

  } catch (err) {
    if (!cached) {
      feedList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#9888;&#65039;</div>
          <p>메시지를 불러오지 못했습니다</p>
          <p style="font-size:0.8rem; color:var(--gray-400);">잠시 후 다시 시도해주세요</p>
        </div>
      `;
    }
  }
}

function renderFeedData(data, feedList, pagination) {
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
  renderPagination(data.total, currentPage);
}

function getCachedFeed(page) {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY + page);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

function setCachedFeed(page, data) {
  try {
    sessionStorage.setItem(CACHE_KEY + page, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded */ }
}

function renderMessageCard(msg) {
  const fullEscaped = escapeHtml(msg.message);
  const previewEscaped = escapeHtml(msg.message.substring(0, 100));
  const messageText = msg.message.length > 100
    ? `${previewEscaped}<span class="more-btn" data-full="${fullEscaped.replace(/"/g, '&quot;')}" onclick="expandMessage(this)">&hellip; 더보기</span>`
    : fullEscaped;

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
        <button class="cheer-btn ${cheered ? 'cheered' : ''}" data-id="${escapeHtml(msg.id)}" onclick="handleCheer(this, this.dataset.id)" ${cheered ? 'disabled' : ''}>
          &#10084;&#65039; 응원 <span class="cheer-count">${cheersCount > 0 ? cheersCount : 0}</span>
        </button>
      </div>
    </div>
  `;
}

function expandMessage(btn) {
  const full = btn.dataset.full;
  btn.parentElement.innerHTML = full.replace(/\n/g, '<br>');
}

async function handleCheer(btn, messageId) {
  if (cheeredSet.has(messageId)) {
    showToast('이미 응원한 글입니다.', 'info');
    return;
  }

  // 즉시 UI 반영 (더블클릭 방지)
  btn.disabled = true;
  btn.classList.add('cheered');

  try {
    const res = await API.post('cheer', { messageId });
    if (res.success) {
      cheeredSet.add(messageId);
      localStorage.setItem('cheered', JSON.stringify([...cheeredSet]));
      const countEl = btn.querySelector('.cheer-count');
      const newCount = res.cheers || 1;
      countEl.textContent = newCount;
      countEl.style.fontWeight = '700';
      showToast('응원했습니다!', 'success');
    } else {
      // 실패 시 롤백
      btn.disabled = false;
      btn.classList.remove('cheered');
    }
  } catch (err) {
    btn.disabled = false;
    btn.classList.remove('cheered');
  }
}

function prefetchAdjacentPages(current, total) {
  const totalPages = Math.ceil(total / CONFIG.FEED_PAGE_SIZE);
  const pagesToPrefetch = [current - 1, current + 1].filter(p => p >= 1 && p <= totalPages);

  pagesToPrefetch.forEach(page => {
    if (!getCachedFeed(page)) {
      API.get('feed', { page: page, limit: CONFIG.FEED_PAGE_SIZE })
        .then(data => setCachedFeed(page, data))
        .catch(() => {});
    }
  });
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
