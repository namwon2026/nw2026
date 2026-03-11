/**
 * 시민 메시지 작성 페이지 로직
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

// ─── 초성만 입력 감지 ───────────────────────────────────────
function hasOnlyConsonants(text) {
  return /^[ㄱ-ㅎ]+$/.test(text.replace(/\s/g, ''));
}

function hasOnlyVowels(text) {
  return /^[ㅏ-ㅣ]+$/.test(text.replace(/\s/g, ''));
}

// ─── DOM 요소 ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('message-form');
  const nameInput = document.getElementById('input-name');
  const phoneInput = document.getElementById('input-phone');
  const messageInput = document.getElementById('input-message');
  const charCurrent = document.getElementById('char-current');
  const submitBtn = document.getElementById('submit-btn');

  // ── 이름 실시간 검증 ──────────────────────────────────────
  nameInput.addEventListener('input', () => {
    const val = nameInput.value;
    const errorEl = document.getElementById('error-name');

    // 한글 외 문자 제거
    nameInput.value = val.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');

    if (hasOnlyConsonants(nameInput.value) && nameInput.value.length >= 2) {
      errorEl.textContent = '초성만으로는 이름을 입력할 수 없습니다';
      errorEl.classList.add('show');
      nameInput.classList.add('error');
    } else if (hasOnlyVowels(nameInput.value) && nameInput.value.length >= 2) {
      errorEl.textContent = '모음만으로는 이름을 입력할 수 없습니다';
      errorEl.classList.add('show');
      nameInput.classList.add('error');
    } else {
      errorEl.classList.remove('show');
      nameInput.classList.remove('error');
    }
  });

  // ── 전화번호 자동 하이픈 포맷 ─────────────────────────────
  phoneInput.addEventListener('input', (e) => {
    let val = phoneInput.value.replace(/[^0-9-]/g, '');

    // 010- 접두어 보호
    if (!val.startsWith('010-')) {
      val = '010-';
    }

    // 숫자만 추출 후 포맷
    const digits = val.replace(/-/g, '');
    if (digits.length <= 3) {
      phoneInput.value = '010-';
    } else if (digits.length <= 7) {
      phoneInput.value = digits.slice(0, 3) + '-' + digits.slice(3);
    } else {
      phoneInput.value = digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11);
    }

    const errorEl = document.getElementById('error-phone');
    if (phoneInput.value.length === 13) {
      errorEl.classList.remove('show');
      phoneInput.classList.remove('error');
    }
  });

  // 010- 삭제 방지
  phoneInput.addEventListener('keydown', (e) => {
    const cursorPos = phoneInput.selectionStart;
    if ((e.key === 'Backspace' && cursorPos <= 4) ||
        (e.key === 'Delete' && cursorPos < 4)) {
      e.preventDefault();
    }
  });

  phoneInput.addEventListener('focus', () => {
    if (phoneInput.value.length < 4) phoneInput.value = '010-';
    // 커서를 끝으로
    setTimeout(() => {
      phoneInput.setSelectionRange(phoneInput.value.length, phoneInput.value.length);
    }, 0);
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

    // Honeypot 봇 체크
    if (document.getElementById('hp-email').value) return;

    // 유효성 검증
    let valid = true;

    // 이름 검증
    const name = nameInput.value.trim();
    if (!/^[가-힣]{2,5}$/.test(name)) {
      showError('error-name', nameInput);
      valid = false;
    }

    // 전화번호 검증
    const phone = phoneInput.value;
    if (!/^010-\d{4}-\d{4}$/.test(phone)) {
      showError('error-phone', phoneInput);
      valid = false;
    }

    // 메시지 검증
    const message = messageInput.value.trim();
    if (message.length < 10 || message.length > 500) {
      showError('error-message', messageInput);
      valid = false;
    }

    // 비속어 클라이언트 체크
    if (hasProfanityClient(message)) {
      document.getElementById('error-message').textContent = '부적절한 표현이 포함되어 있습니다. 수정 후 다시 시도해주세요';
      showError('error-message', messageInput);
      valid = false;
    }

    // 동의 검증
    if (!document.getElementById('check-consent').checked) {
      showError('error-consent');
      valid = false;
    }

    if (!valid) return;

    // 제출
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
});

function showError(errorId, inputEl) {
  document.getElementById(errorId).classList.add('show');
  if (inputEl) inputEl.classList.add('error');
}

function copyShareLink() {
  const url = window.location.origin + '/index.html';
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
