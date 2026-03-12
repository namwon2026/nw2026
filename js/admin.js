/**
 * 관리자 대시보드 로직
 */

let adminToken = sessionStorage.getItem('admin_token') || '';
let adminUser = sessionStorage.getItem('admin_user') || '';
let currentAdminPage = 1;
let replyTargetId = '';
let deleteTargetId = '';
let deleteStep = 0;
let cachedMessages = [];

// ─── 페이지 캐시 (인접 페이지 프리패치용) ─────────────────────
const ADMIN_CACHE_KEY = 'admin_cache_';
const ADMIN_CACHE_TTL = 300000; // 5분

function getAdminCachedPage(page, filterKey) {
  try {
    const raw = sessionStorage.getItem(ADMIN_CACHE_KEY + filterKey + '_' + page);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > ADMIN_CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

function setAdminCachedPage(page, filterKey, data) {
  try {
    sessionStorage.setItem(ADMIN_CACHE_KEY + filterKey + '_' + page, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded */ }
}

function getFilterKey() {
  return [
    document.getElementById('filter-priority').value,
    document.getElementById('filter-sort').value,
    document.getElementById('filter-supporter').value,
    document.getElementById('filter-rights').value,
    document.getElementById('filter-search').value.trim()
  ].join('|');
}

function clearAdminCache() {
  const keys = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key.startsWith(ADMIN_CACHE_KEY)) keys.push(key);
  }
  keys.forEach(k => sessionStorage.removeItem(k));
}

// ─── 초기화 ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (adminToken) {
    verifyAndShow();
  }

  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // 필터 변경 시 자동 검색
  ['filter-priority', 'filter-sort', 'filter-supporter', 'filter-rights'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => loadAdminMessages());
  });

  document.getElementById('filter-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadAdminMessages();
  });

  // 답장 글자수
  document.getElementById('reply-text').addEventListener('input', function() {
    document.getElementById('reply-char').textContent = this.value.length;
  });
});

// ─── 토큰 검증 후 대시보드 표시 ─────────────────────────────
async function verifyAndShow() {
  try {
    const res = await API.post('verify_token', { token: adminToken });
    if (res.success) {
      showDashboard();
    } else {
      sessionStorage.removeItem('admin_token');
      adminToken = '';
    }
  } catch (err) {
    // 검증 실패 → 로그인 화면 유지
  }
}

// ─── 로그인 ─────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-id').value.trim();
  const password = document.getElementById('login-pw').value;
  const errorEl = document.getElementById('login-error');

  if (!username || !password) {
    errorEl.textContent = '아이디와 비밀번호를 입력해주세요.';
    errorEl.style.display = 'block';
    return;
  }

  try {
    const res = await API.post('login', { username, password });

    if (res.success) {
      adminToken = res.token;
      adminUser = res.username;
      sessionStorage.setItem('admin_token', adminToken);
      sessionStorage.setItem('admin_user', adminUser);
      errorEl.style.display = 'none';
      showDashboard();
    } else {
      errorEl.textContent = res.error || '로그인에 실패했습니다.';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.textContent = '서버 연결에 실패했습니다.';
    errorEl.style.display = 'block';
  }
}

// ─── 로그아웃 ───────────────────────────────────────────────
function adminLogout() {
  adminToken = '';
  adminUser = '';
  sessionStorage.removeItem('admin_token');
  sessionStorage.removeItem('admin_user');
  document.getElementById('login-section').classList.remove('hidden');
  document.getElementById('dashboard-section').classList.add('hidden');
}

// ─── 대시보드 표시 ──────────────────────────────────────────
function showDashboard() {
  document.getElementById('login-section').classList.add('hidden');
  document.getElementById('dashboard-section').classList.remove('hidden');
  document.getElementById('admin-username').textContent = adminUser;
  loadAdminMessages();
}

// ─── 메시지 목록 로드 ───────────────────────────────────────
async function loadAdminMessages(page) {
  currentAdminPage = page || 1;
  const filterKey = getFilterKey();

  const filters = {
    priority: document.getElementById('filter-priority').value,
    sort: document.getElementById('filter-sort').value,
    search: document.getElementById('filter-search').value.trim(),
    page: currentAdminPage,
    limit: CONFIG.ADMIN_PAGE_SIZE
  };

  const supFilter = document.getElementById('filter-supporter').value;
  if (supFilter === 'yes') filters.is_supporter = true;

  const rightsFilter = document.getElementById('filter-rights').value;
  if (rightsFilter === 'yes') filters.is_rights_member = true;

  const tbody = document.getElementById('admin-tbody');

  // 캐시된 데이터 즉시 표시
  const cached = getAdminCachedPage(currentAdminPage, filterKey);
  if (cached) {
    renderAdminData(cached, tbody);
    prefetchAdminPages(currentAdminPage, cached.total, filterKey, filters);
  } else {
    tbody.innerHTML = '<tr><td colspan="9" class="loading"><div class="spinner"></div></td></tr>';
  }

  // API에서 최신 데이터 가져오기
  try {
    const res = await API.post('admin_messages', {
      token: adminToken,
      filters: filters
    });

    if (!res.success) {
      if (res.error === '인증이 필요합니다.') {
        adminLogout();
        showToast('세션이 만료되었습니다. 다시 로그인해주세요.', 'error');
      }
      return;
    }

    setAdminCachedPage(currentAdminPage, filterKey, res);
    renderAdminData(res, tbody);

    // 인접 페이지 프리패치
    prefetchAdminPages(currentAdminPage, res.total, filterKey, filters);

  } catch (err) {
    if (!cached) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">데이터를 불러오지 못했습니다</td></tr>';
    }
  }
}

function renderAdminData(res, tbody) {
  // KPI 업데이트
  if (res.stats) {
    updateKPI(res.stats);
  }

  // 테이블 렌더링
  cachedMessages = res.messages || [];
  if (cachedMessages.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">검색 결과가 없습니다</td></tr>';
  } else {
    tbody.innerHTML = cachedMessages.map(renderAdminRow).join('');
  }

  // 페이지네이션
  renderAdminPagination(res.total, currentAdminPage);
}

function prefetchAdminPages(current, total, filterKey, baseFilters) {
  const totalPages = Math.ceil(total / CONFIG.ADMIN_PAGE_SIZE);
  const pagesToPrefetch = [current - 1, current + 1].filter(p => p >= 1 && p <= totalPages);

  pagesToPrefetch.forEach(page => {
    if (!getAdminCachedPage(page, filterKey)) {
      const filters = { ...baseFilters, page: page };
      API.post('admin_messages', { token: adminToken, filters })
        .then(res => { if (res.success) setAdminCachedPage(page, filterKey, res); })
        .catch(() => {});
    }
  });
}

// ─── KPI 업데이트 ───────────────────────────────────────────
function updateKPI(stats) {
  document.getElementById('kpi-total').textContent = (stats.totalMessages || 0).toLocaleString();
  document.getElementById('kpi-today').textContent = stats.todayMessages || 0;
  document.getElementById('kpi-supporters').textContent = (stats.totalSupporters || 0).toLocaleString();
  document.getElementById('kpi-new-sup').textContent = stats.todaySupporters || 0;
  document.getElementById('kpi-rights').textContent = stats.rightsCount || 0;
  document.getElementById('kpi-no-reply').textContent = stats.noReply || 0;
  document.getElementById('kpi-immediate').textContent = stats.immediateCount || 0;

  // 미니 차트
  if (stats.last7Days) {
    renderMiniChart(stats.last7Days);
  }
}

// ─── 미니 바 차트 ───────────────────────────────────────────
function renderMiniChart(days) {
  const container = document.getElementById('mini-chart');
  const max = Math.max(...days.map(d => d.count), 1);

  container.innerHTML = days.map(d => {
    const height = Math.max(2, (d.count / max) * 45);
    const label = d.date.slice(5); // MM-DD
    return `
      <div class="bar-item">
        <div class="bar-value">${d.count}</div>
        <div class="bar-fill" style="height:${height}px"></div>
        <div class="bar-label">${label}</div>
      </div>
    `;
  }).join('');
}

// ─── 테이블 행 렌더링 ───────────────────────────────────────
function renderAdminRow(msg) {
  const priorityLabels = {
    'immediate': ['즉시응답', 'priority-immediate'],
    'medium': ['중간', 'priority-medium'],
    'low': ['낮음', 'priority-low'],
    'unclassified': ['미분류', 'priority-unclassified'],
    'spam': ['스팸', 'priority-spam']
  };

  const [pLabel, pClass] = priorityLabels[msg.priority] || ['미분류', 'priority-unclassified'];

  const preview = msg.message.length > 40
    ? escapeHtml(msg.message.substring(0, 40)) + '...'
    : escapeHtml(msg.message);

  const replyPreview = msg.admin_reply
    ? `<div class="reply-preview">&#128172; ${escapeHtml(msg.admin_reply.length > 30 ? msg.admin_reply.substring(0, 30) + '...' : msg.admin_reply)}</div>`
    : '';

  const hasReply = msg.kakao_sent || msg.admin_reply;
  const replyIcon = hasReply ? 'O' : 'X';
  const replyColor = hasReply ? 'var(--success)' : 'var(--danger)';

  return `
    <tr>
      <td>
        <select class="priority-select" data-id="${escapeHtml(msg.id)}" onchange="changePriority(this.dataset.id, this.value)">
          <option value="immediate" ${msg.priority === 'immediate' ? 'selected' : ''}>&#128308; 즉시</option>
          <option value="medium" ${msg.priority === 'medium' ? 'selected' : ''}>&#128993; 중간</option>
          <option value="low" ${msg.priority === 'low' ? 'selected' : ''}>&#128994; 낮음</option>
          <option value="unclassified" ${msg.priority === 'unclassified' ? 'selected' : ''}>&#9898; 미분류</option>
          <option value="spam" ${msg.priority === 'spam' ? 'selected' : ''}>&#9940; 스팸</option>
        </select>
      </td>
      <td><strong>${escapeHtml(msg.name)}</strong></td>
      <td style="white-space:nowrap; font-size:0.75rem;">${escapeHtml(msg.phone)}</td>
      <td class="msg-preview" data-id="${escapeHtml(msg.id)}" onclick="openDetailModal(this.dataset.id)" style="cursor:pointer;" title="클릭하여 상세보기">${preview}${replyPreview}</td>
      <td style="text-align:center;font-weight:700;color:${msg.is_rights_member ? 'var(--success)' : 'var(--gray-300)'}">${msg.is_rights_member ? 'O' : 'X'}</td>
      <td style="text-align:center;font-weight:700;color:${msg.is_supporter ? 'var(--accent)' : 'var(--gray-300)'}">${msg.is_supporter ? 'O' : 'X'}</td>
      <td style="white-space:nowrap; font-size:0.72rem;">${formatDate(msg.created_at)}</td>
      <td style="color:${replyColor};${hasReply ? '' : 'cursor:pointer;font-weight:700;'}" ${hasReply ? '' : `data-id="${escapeHtml(msg.id)}" data-name="${escapeHtml(msg.name)}" data-reply="" onclick="openReplyModal(this.dataset.id, this.dataset.name, this.dataset.reply)"`}>${replyIcon}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn btn-reply" title="답변" data-id="${escapeHtml(msg.id)}" data-name="${escapeHtml(msg.name)}" data-reply="${escapeHtml(msg.admin_reply || '')}" onclick="openReplyModal(this.dataset.id, this.dataset.name, this.dataset.reply)">&#128172;</button>
          <button class="action-btn btn-delete" title="삭제" data-id="${escapeHtml(msg.id)}" onclick="openDeleteModal(this.dataset.id)">&#128465;</button>
        </div>
      </td>
    </tr>
  `;
}

// ─── 메시지 상세 모달 ─────────────────────────────────────────
function openDetailModal(messageId) {
  const msg = cachedMessages.find(m => m.id === messageId);
  if (!msg) return;

  const priorityLabels = {
    'immediate': '🔴 즉시응답',
    'medium': '🟡 중간',
    'low': '🟢 낮음',
    'unclassified': '⚪ 미분류',
    'spam': '⛔ 스팸'
  };

  document.getElementById('detail-name').textContent = msg.name;
  document.getElementById('detail-phone').textContent = msg.phone;
  document.getElementById('detail-date').textContent = msg.created_at ? new Date(msg.created_at).toLocaleString('ko-KR') : '';
  document.getElementById('detail-priority').textContent = priorityLabels[msg.priority] || '미분류';
  document.getElementById('detail-message').textContent = msg.message;

  // 배지 표시
  const rightsBadge = document.getElementById('detail-rights');
  const supBadge = document.getElementById('detail-supporter');
  rightsBadge.classList.toggle('hidden', !msg.is_rights_member);
  supBadge.classList.toggle('hidden', !msg.is_supporter);

  // 답장 표시
  const replySection = document.getElementById('detail-reply-section');
  if (msg.admin_reply) {
    replySection.style.display = 'block';
    document.getElementById('detail-reply').textContent = msg.admin_reply;
  } else {
    replySection.style.display = 'none';
  }

  // 답장 버튼에 ID 저장
  document.getElementById('detail-reply-btn').dataset.id = messageId;
  document.getElementById('detail-reply-btn').dataset.name = msg.name;
  document.getElementById('detail-reply-btn').dataset.reply = msg.admin_reply || '';

  document.getElementById('detail-modal').classList.add('show');
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.remove('show');
}

function closeDetailAndReply() {
  const btn = document.getElementById('detail-reply-btn');
  const id = btn.dataset.id;
  const name = btn.dataset.name;
  const reply = btn.dataset.reply;
  closeDetailModal();
  openReplyModal(id, name, reply);
}

// ─── 등급 변경 ──────────────────────────────────────────────
async function changePriority(messageId, priority) {
  try {
    const res = await API.post('update_priority', {
      token: adminToken,
      messageId,
      priority
    });
    if (res.success) {
      clearAdminCache();
      showToast('등급이 변경되었습니다.', 'success');
    } else {
      showToast(res.error || '등급 변경 실패', 'error');
    }
  } catch (err) {
    showToast('서버 오류', 'error');
  }
}

// ─── 답장 모달 ──────────────────────────────────────────────
function openReplyModal(messageId, name, existingReply) {
  replyTargetId = messageId;
  document.getElementById('reply-target-name').textContent = name;
  document.getElementById('reply-text').value = existingReply || '';
  document.getElementById('reply-char').textContent = (existingReply || '').length;
  document.getElementById('reply-modal').classList.add('show');
}

function closeReplyModal() {
  document.getElementById('reply-modal').classList.remove('show');
  replyTargetId = '';
}

async function sendReply() {
  const replyText = document.getElementById('reply-text').value.trim();
  if (!replyText) {
    showToast('답장 내용을 입력해주세요.', 'error');
    return;
  }

  try {
    const res = await API.post('save_reply', {
      token: adminToken,
      messageId: replyTargetId,
      reply: replyText
    });

    if (res.success) {
      clearAdminCache();
      showToast('답장이 발송되었습니다.', 'success');
      closeReplyModal();
      loadAdminMessages(currentAdminPage);
    } else {
      showToast(res.error || '발송 실패', 'error');
    }
  } catch (err) {
    showToast('서버 오류', 'error');
  }
}

// ─── 삭제 모달 (2단계 확인) ─────────────────────────────────
function openDeleteModal(messageId) {
  deleteTargetId = messageId;
  deleteStep = 1;
  document.getElementById('delete-confirm-text').textContent = '정말 삭제하시겠습니까?';
  document.getElementById('delete-confirm-btn').textContent = '삭제';
  document.getElementById('delete-modal').classList.add('show');
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.remove('show');
  deleteTargetId = '';
  deleteStep = 0;
}

async function confirmDelete() {
  if (deleteStep === 1) {
    // 2차 확인
    deleteStep = 2;
    document.getElementById('delete-confirm-text').textContent =
      '삭제된 메시지는 복구할 수 없습니다. 삭제하시겠습니까?';
    document.getElementById('delete-confirm-btn').textContent = '최종 삭제';
    return;
  }

  try {
    const res = await API.post('delete_message', {
      token: adminToken,
      messageId: deleteTargetId
    });

    if (res.success) {
      clearAdminCache();
      showToast('메시지가 삭제되었습니다.', 'success');
      closeDeleteModal();
      loadAdminMessages(currentAdminPage);
    } else {
      showToast(res.error || '삭제 실패', 'error');
    }
  } catch (err) {
    showToast('서버 오류', 'error');
  }
}

// ─── 페이지네이션 ───────────────────────────────────────────
function renderAdminPagination(total, current) {
  const pagination = document.getElementById('admin-pagination');
  const totalPages = Math.ceil(total / CONFIG.ADMIN_PAGE_SIZE);

  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  let html = '';

  if (current > 1) {
    html += `<button class="page-btn" onclick="loadAdminMessages(${current - 1})">&#8592;</button>`;
  }

  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, current + 2);

  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="loadAdminMessages(${i})">${i}</button>`;
  }

  if (current < totalPages) {
    html += `<button class="page-btn" onclick="loadAdminMessages(${current + 1})">&#8594;</button>`;
  }

  pagination.innerHTML = html;
}

// ─── CSV 내보내기 ───────────────────────────────────────────
async function exportCSV() {
  try {
    const res = await API.post('export', { token: adminToken });

    if (!res.success) {
      showToast(res.error || '내보내기 실패', 'error');
      return;
    }

    if (!res.data || res.data.length === 0) {
      showToast('내보낼 데이터가 없습니다.', 'error');
      return;
    }

    // CSV 생성 (BOM 포함 - 엑셀 한글 호환)
    const headers = Object.keys(res.data[0]);
    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...res.data.map(row =>
        headers.map(h => {
          let val = String(row[h] || '');
          val = val.replace(/"/g, '""');
          return `"${val}"`;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `messages_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('CSV 파일이 다운로드되었습니다.', 'success');
  } catch (err) {
    showToast('내보내기 오류', 'error');
  }
}
