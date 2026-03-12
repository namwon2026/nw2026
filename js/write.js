/**
 * 시민 메시지 작성 페이지 로직
 * 스마트폰 최적화 버전
 */

// ─── 비속어 클라이언트 필터 (서버에서도 이중 검증) ──────────
const CLIENT_PROFANITY = [
  '시발','씨발','씨빨','시빨','병신','지랄','개새끼',
  '미친놈','미친년','꺼져','닥쳐','죽어','뒤져','느금마','니엄마'
];

function hasProfanityClient(text) {
  const normalized = text.replace(/\s/g, '').toLowerCase();
  return CLIENT_PROFANITY.some(w => normalized.includes(w));
}

// ─── 이름 유효성 검증 (완성형 한글만 허용) ──────────────────
function isValidName(name) {
  return /^[가-힣]{2,5}$/.test(name);
}

// ─── DOM 요소 ───────────────────────────────────────────────
function initWrite() {
  const form = document.getElementById('message-form');
  if (!form) return; // 다른 페이지에서는 실행하지 않음
  const nameInput = document.getElementById('input-name');
  const phoneInput = document.getElementById('input-phone');
  const messageInput = document.getElementById('input-message');
  const charCurrent = document.getElementById('char-current');
  const submitBtn = document.getElementById('submit-btn');

  // IME 조합 상태 추적 (한글 입력 중인지)
  let isComposing = false;

  nameInput.addEventListener('compositionstart', () => { isComposing = true; });
  nameInput.addEventListener('compositionend', () => {
    isComposing = false;
    // 조합 완료 후 한글 외 문자 제거
    nameInput.value = nameInput.value.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');
  });

  // ── 이름: input에서는 글자수만 체크, 검증은 blur에서 ────────
  nameInput.addEventListener('input', () => {
    if (isComposing) return; // IME 조합 중에는 간섭하지 않음
    // 한글 외 문자 제거 (조합 완료된 상태에서만)
    nameInput.value = nameInput.value.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');
  });

  // ── 이름: blur(포커스 벗어날 때)에서 검증 ──────────────────
  nameInput.addEventListener('blur', () => {
    const val = nameInput.value.trim();
    const errorEl = document.getElementById('error-name');

    if (val.length === 0) {
      // 아직 입력 안 한 상태 → 에러 숨김
      errorEl.classList.remove('show');
      nameInput.classList.remove('error');
      return;
    }

    if (!isValidName(val)) {
      if (/^[ㄱ-ㅎ]+$/.test(val)) {
        errorEl.textContent = '초성만으로는 이름을 입력할 수 없습니다';
      } else if (/^[ㅏ-ㅣ]+$/.test(val)) {
        errorEl.textContent = '모음만으로는 이름을 입력할 수 없습니다';
      } else {
        errorEl.textContent = '이름을 정확히 입력해주세요 (2~5자 한글)';
      }
      errorEl.classList.add('show');
      nameInput.classList.add('error');
    } else {
      errorEl.classList.remove('show');
      nameInput.classList.remove('error');
    }
  });

  // ── 전화번호: 모바일 최적화 ────────────────────────────────
  // 모바일에서 숫자 키패드가 뜨도록 inputmode 설정
  phoneInput.setAttribute('inputmode', 'numeric');

  phoneInput.addEventListener('input', () => {
    let raw = phoneInput.value.replace(/[^0-9]/g, '');

    // 010 접두어 보장
    if (!raw.startsWith('010')) {
      raw = '010' + raw.replace(/^0*1?0?/, '');
    }

    // 최대 11자리
    raw = raw.slice(0, 11);

    // 하이픈 포맷 적용
    let formatted;
    if (raw.length <= 3) {
      formatted = raw;
    } else if (raw.length <= 7) {
      formatted = raw.slice(0, 3) + '-' + raw.slice(3);
    } else {
      formatted = raw.slice(0, 3) + '-' + raw.slice(3, 7) + '-' + raw.slice(7);
    }

    phoneInput.value = formatted;

    // 13자리 완성 시 에러 해제
    const errorEl = document.getElementById('error-phone');
    if (formatted.length === 13) {
      errorEl.classList.remove('show');
      phoneInput.classList.remove('error');
    }
  });

  // 전화번호 포커스 시 초기값 설정 (비어있을 때만)
  phoneInput.addEventListener('focus', () => {
    if (!phoneInput.value || phoneInput.value.length < 3) {
      phoneInput.value = '010';
    }
  });

  // 전화번호 blur 시 검증
  phoneInput.addEventListener('blur', () => {
    const val = phoneInput.value;
    const errorEl = document.getElementById('error-phone');

    if (val.length <= 3 || val === '010') {
      // 아직 입력 안 한 상태
      phoneInput.value = '';
      errorEl.classList.remove('show');
      phoneInput.classList.remove('error');
      return;
    }

    if (!/^010-\d{4}-\d{4}$/.test(val)) {
      errorEl.classList.add('show');
      phoneInput.classList.add('error');
    } else {
      errorEl.classList.remove('show');
      phoneInput.classList.remove('error');
    }
  });

  // ── 메시지 글자수 카운터 ──────────────────────────────────
  messageInput.addEventListener('input', () => {
    const len = messageInput.value.length;
    charCurrent.textContent = len;

    const countEl = charCurrent.parentElement;
    countEl.classList.remove('warn', 'over');
    if (len > 500) countEl.classList.add('over');
    else if (len > 400) countEl.classList.add('warn');

    const errorEl = document.getElementById('error-message');
    if (len >= 10) {
      errorEl.classList.remove('show');
      messageInput.classList.remove('error');
    }
  });

  // ── 폼 제출 ───────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot 봇 체크 (브라우저 자동완성 오탐 방지)
    const hpField = document.getElementById('hp-email');
    if (hpField.value) {
      hpField.value = '';  // 자동완성으로 채워진 경우 초기화 후 재시도 허용
      showToast('잠시 후 다시 시도해주세요.', 'error');
      return;
    }

    // 유효성 검증
    let valid = true;
    let firstErrorEl = null;

    // 이름 검증
    const name = nameInput.value.trim();
    if (!isValidName(name)) {
      showError('error-name', nameInput);
      if (!firstErrorEl) firstErrorEl = nameInput;
      valid = false;
    }

    // 전화번호 검증
    const phone = phoneInput.value;
    if (!/^010-\d{4}-\d{4}$/.test(phone)) {
      showError('error-phone', phoneInput);
      if (!firstErrorEl) firstErrorEl = phoneInput;
      valid = false;
    }

    // 메시지 검증
    const message = messageInput.value.trim();
    if (message.length < 10 || message.length > 500) {
      showError('error-message', messageInput);
      if (!firstErrorEl) firstErrorEl = messageInput;
      valid = false;
    }

    // 비속어 클라이언트 체크
    if (valid && hasProfanityClient(message)) {
      document.getElementById('error-message').textContent = '부적절한 표현이 포함되어 있습니다. 수정 후 다시 시도해주세요';
      showError('error-message', messageInput);
      if (!firstErrorEl) firstErrorEl = messageInput;
      valid = false;
    }

    // 동의 검증
    const consentCheck = document.getElementById('check-consent');
    if (!consentCheck.checked) {
      showError('error-consent', consentCheck);
      if (!firstErrorEl) firstErrorEl = consentCheck;
      valid = false;
    }

    if (!valid) {
      // 모바일: 스크롤만 하고 focus는 하지 않음 (키보드 강제 팝업 방지)
      if (firstErrorEl) {
        firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      showToast('입력 내용을 확인해주세요.', 'error');
      return;
    }

    // 중복 제출 방지
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    submitBtn.textContent = '전송 중...';

    try {
      const res = await API.post('submit', {
        name: name,
        phone: phone,
        message: message,
        is_rights_member: document.getElementById('check-rights').checked,
        is_supporter: document.getElementById('check-supporter').checked
      });

      if (res.success) {
        // 성공 화면 표시
        document.getElementById('form-section').classList.add('hidden');
        document.getElementById('success-section').classList.remove('hidden');
        // 성공 화면 상단으로 스크롤
        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (res.is_rights_member) {
          const rightsEl = document.getElementById('rights-result');
          rightsEl.textContent = '권리당원 확인이 완료되었습니다!';
          rightsEl.classList.remove('hidden');
        }
      } else {
        showToast(res.error || '메시지 전송에 실패했습니다.', 'error');
      }
    } catch (err) {
      showToast('서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '메시지 보내기';
    }
  });
}

// 라우터 등록 + 초기 로드
if (typeof Router !== 'undefined') Router.register('write.html', initWrite);
document.addEventListener('DOMContentLoaded', initWrite);

function showError(errorId, inputEl) {
  const errorEl = document.getElementById(errorId);
  errorEl.classList.add('show');
  if (inputEl) {
    inputEl.classList.add('error');
  }
}

function copyShareLink() {
  const url = window.location.origin + '/';
  navigator.clipboard.writeText(url).then(() => {
    showToast('링크가 복사되었습니다!', 'success');
  }).catch(() => {
    // Fallback
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast('링크가 복사되었습니다!', 'success');
  });
}
