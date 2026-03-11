/**
 * 관리자 대시보드 로직
 */

let adminToken = sessionStorage.getItem('admin_token') || '';
let adminUser = sessionStorage.getItem('admin_user') || '';
let currentAdminPage = 1;
let replyTargetId = '';
let deleteTargetId = '';
let deleteStep = 0;

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
  tbody.innerHTML = '<tr><td colspan="9" class="loading"><div class="spinner"></div></td></tr>';

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

    // KPI 업데이트
    if (res.stats) {
      updateKPI(res.stats);
    }

    // 테이블 렌더링
    if (!res.messages || res.messages.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">검색 결과가 없습니다</td></tr>';
    } else {
      tbody.innerHTML = res.messages.map(renderAdminRow).join('');
    }

    // 페이지네이션
    renderAdminPagination(res.total, currentAdminPage);

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">데이터를 불러오지 못했습니다</td></tr>';
  }
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

  const kakaoIcon = msg.kakao_sent ? '&#10004;' : (msg.admin_reply ? '&#10004;' : '&#9711;');
  const kakaoColor = msg.kakao_sent ? 'var(--success)' : 'var(--gray-400)';

  return `
    <tr>
      <td>
        <select class="priority-select" onchange="changePriority('${msg.id}', this.value)">
          <option value="immediate" ${msg.priority === 'immediate' ? 'selected' : ''}>&#128308; 즉시</option>
          <option value="medium" ${msg.priority === 'medium' ? 'selected' : ''}>&#128993; 중간</option>
          <option value="low" ${msg.priority === 'low' ? 'selected' : ''}>&#128994; 낮음</option>
          <option value="unclassified" ${msg.priority === 'unclassified' ? 'selected' : ''}>&#9898; 미분류</option>
          <option value="spam" ${msg.priority === 'spam' ? 'selected' : ''}>&#9940; 스팸</option>
        </select>
      </td>
      <td><strong>${escapeHtml(msg.name)}</strong></td>
      <td style="white-space:nowrap; font-size:0.75rem;">${escapeHtml(msg.phone)}</td>
      <td class="msg-preview" title="${escapeHtml(msg.message)}">${preview}</td>
      <td>${msg.is_rights_member ? '<span style="color:var(--success)">&#10004;</span>' : '-'}</td>
      <td>${msg.is_supporter ? '<span style="color:var(--accent)">&#10004;</span>' : '-'}</td>
      <td style="white-space:nowrap; font-size:0.72rem;">${formatDate(msg.created_at)}</td>
      <td style="color:${kakaoColor}">${kakaoIcon}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn btn-reply" onclick="openReplyModal('${msg.id}', '${escapeHtml(msg.name)}', '${escapeHtml(msg.admin_reply || '')}')">&#128172;</button>
          <button class="action-btn btn-delete" onclick="openDeleteModal('${msg.id}')">&#128465;</button>
        </div>
      </td>
    </tr>
  `;
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
