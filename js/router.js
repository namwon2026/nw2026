/**
 * 경량 SPA 라우터 v2 — 즉시 전환
 * 캐시된 페이지는 0ms 전환, 미캐시 페이지도 fetch와 동시 전환
 */
const Router = (() => {
  const cache = {};
  let isNavigating = false;
  const pageInit = {};

  function register(page, initFn) {
    pageInit[page] = initFn;
  }

  function init() {
    // 현재 페이지 즉시 캐시
    cache[location.pathname] = document.documentElement.innerHTML;

    // 클릭 가로채기 (이벤트 위임)
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:')) return;
      if (!href.endsWith('.html')) return;

      e.preventDefault();
      if (isNavigating) return;

      const target = new URL(href, location.href).pathname;
      if (target === location.pathname) return;
      navigateTo(target, href);
    });

    // hover/touchstart 시 프리패치
    const prefetchLink = (e) => {
      const link = e.target.closest('a[href$=".html"]');
      if (!link) return;
      const href = link.getAttribute('href');
      const url = new URL(href, location.href).pathname;
      if (!cache[url]) {
        fetch(href).then(r => r.text()).then(html => { cache[url] = html; }).catch(() => {});
      }
    };
    document.addEventListener('pointerenter', prefetchLink, true);
    document.addEventListener('touchstart', prefetchLink, { passive: true });

    // 뒤로/앞으로 가기
    window.addEventListener('popstate', () => {
      if (cache[location.pathname]) {
        swapContent(cache[location.pathname], location.pathname);
      } else {
        location.reload();
      }
    });

    // 즉시 프리패치 (대기 없이)
    prefetchAll();
  }

  function prefetchAll() {
    document.querySelectorAll('a[href$=".html"]').forEach(link => {
      const href = link.getAttribute('href');
      const url = new URL(href, location.href).pathname;
      if (!cache[url]) {
        fetch(href).then(r => r.text()).then(html => { cache[url] = html; });
      }
    });
  }

  async function navigateTo(path, href) {
    isNavigating = true;

    // 캐시 있으면 즉시 전환 (애니메이션 없음)
    if (cache[path]) {
      history.pushState({}, '', path);
      swapContent(cache[path], path);
      isNavigating = false;
      return;
    }

    // 캐시 없으면 fetch하면서 로딩 표시
    const wrapper = document.getElementById('page-wrapper');
    wrapper.style.opacity = '0.5';
    wrapper.style.transition = 'opacity 0.1s';

    try {
      const html = await fetch(href).then(r => r.text());
      cache[path] = html;
      history.pushState({}, '', path);
      swapContent(cache[path], path);
    } catch {
      window.location.href = href;
    }

    isNavigating = false;
  }

  function swapContent(html, path) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    document.title = doc.title;

    // body class 동기화 (list-page, write-page 등 배경색 전환)
    document.body.className = doc.body.className;

    const newWrapper = doc.getElementById('page-wrapper');
    const curWrapper = document.getElementById('page-wrapper');
    if (newWrapper && curWrapper) {
      curWrapper.innerHTML = newWrapper.innerHTML;
      curWrapper.style.opacity = '';
      curWrapper.style.transition = '';
    }

    // bottom nav active 업데이트
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', path.endsWith(item.getAttribute('href')));
    });

    window.scrollTo(0, 0);

    // 페이지별 JS 초기화
    const pageName = path.split('/').pop() || 'index.html';
    if (pageInit[pageName]) pageInit[pageName]();

    prefetchAll();
  }

  return { init, register };
})();
