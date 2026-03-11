/**
 * 경량 SPA 라우터 — 페이지 전환 시 풀 리로드 없이 콘텐츠만 교체
 * 폰트·CSS·JS 재로딩을 제거하여 체감 속도를 대폭 개선
 */
const Router = (() => {
  const cache = {};          // HTML 캐시
  let isNavigating = false;

  // 페이지별 초기화 함수 등록소
  const pageInit = {};

  function register(page, initFn) {
    pageInit[page] = initFn;
  }

  /** 내부 링크 클릭 가로채기 */
  function init() {
    // 현재 페이지 캐시
    cache[location.pathname] = document.documentElement.innerHTML;

    // 모든 내부 .html 링크 가로채기 (이벤트 위임)
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

    // 뒤로/앞으로 가기
    window.addEventListener('popstate', () => {
      const path = location.pathname;
      if (cache[path]) {
        swapContent(cache[path], path);
      } else {
        location.reload();
      }
    });

    // 유휴 시 다른 페이지 미리 로드
    prefetchLinks();
  }

  /** 다른 페이지 미리 가져오기 */
  function prefetchLinks() {
    const doFetch = () => {
      document.querySelectorAll('a[href$=".html"]').forEach(link => {
        const href = link.getAttribute('href');
        const url = new URL(href, location.href).pathname;
        if (!cache[url]) {
          fetch(href).then(r => r.text()).then(html => { cache[url] = html; });
        }
      });
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(doFetch);
    } else {
      setTimeout(doFetch, 200);
    }
  }

  /** 페이지 전환 실행 */
  async function navigateTo(path, href) {
    isNavigating = true;

    // 1. 페이드 아웃
    const wrapper = document.getElementById('page-wrapper');
    wrapper.classList.add('page-exit');

    // 2. 캐시에 없으면 fetch
    if (!cache[path]) {
      try {
        const html = await fetch(href).then(r => r.text());
        cache[path] = html;
      } catch {
        window.location.href = href;
        return;
      }
    }

    // 3. 애니메이션 완료 대기 (150ms)
    await new Promise(r => setTimeout(r, 150));

    // 4. 콘텐츠 교체
    history.pushState({}, '', path);
    swapContent(cache[path], path);

    isNavigating = false;
  }

  /** DOM 콘텐츠 교체 */
  function swapContent(html, path) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // title 교체
    document.title = doc.title;

    // page-wrapper 콘텐츠 교체
    const newWrapper = doc.getElementById('page-wrapper');
    const curWrapper = document.getElementById('page-wrapper');
    if (newWrapper && curWrapper) {
      curWrapper.innerHTML = newWrapper.innerHTML;
      curWrapper.className = 'page-wrapper page-enter';

      // 애니메이션 후 클래스 제거
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          curWrapper.classList.remove('page-enter');
        });
      });
    }

    // bottom nav active 상태 업데이트
    document.querySelectorAll('.nav-item').forEach(item => {
      const itemHref = item.getAttribute('href');
      item.classList.toggle('active', path.endsWith(itemHref));
    });

    // 스크롤 맨 위로
    window.scrollTo(0, 0);

    // 페이지별 JS 초기화
    const pageName = path.split('/').pop() || 'index.html';
    if (pageInit[pageName]) {
      pageInit[pageName]();
    }

    // 새 페이지의 링크도 프리패치
    prefetchLinks();
  }

  return { init, register };
})();
