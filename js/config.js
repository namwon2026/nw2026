/**
 * 설정 파일 - Google Apps Script 배포 URL을 여기에 입력하세요
 */
const CONFIG = {
  // Google Apps Script 웹앱 배포 URL
  API_URL: 'https://script.google.com/macros/s/AKfycbx237Dt_1UnoKrJMb-nVzETrpcdmR3mpmB8cxdgmYFOZCC1Ppbp-TYlhKepjNph1KOihg/exec',

  // 페이지당 메시지 수
  FEED_PAGE_SIZE: 12,
  ADMIN_PAGE_SIZE: 20,

  // 후보 정보
  CANDIDATE_NAME: '양충모',
  ELECTION_TITLE: '2026 남원시장 선거',
  SLOGAN: '더 나은 남원을 함께 만들겠습니다',
};

/**
 * API 호출 유틸리티
 */
const API = {
  async get(action, params = {}) {
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString());
    return res.json();
  },

  async post(action, body = {}) {
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set('action', action);

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
    });
    return res.json();
  }
};

/**
 * Toast 알림
 */
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * 날짜 포맷
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;

  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}월 ${day}일`;
}

/**
 * 숫자 카운터 애니메이션
 */
function animateCount(el, target, duration = 1000) {
  const start = parseInt(el.textContent) || 0;
  if (start === target) return;

  const increment = (target - start) / (duration / 16);
  let current = start;

  const timer = setInterval(() => {
    current += increment;
    if ((increment > 0 && current >= target) || (increment < 0 && current <= target)) {
      el.textContent = target.toLocaleString();
      clearInterval(timer);
    } else {
      el.textContent = Math.round(current).toLocaleString();
    }
  }, 16);
}

/**
 * HTML 이스케이프
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
