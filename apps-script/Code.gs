/**
 * ============================================================
 *  양충모 후보 디지털 소통 플랫폼 - Google Apps Script Backend
 * ============================================================
 *  Google Sheets를 DB로 사용하는 REST API 서버
 *
 *  시트 구조:
 *    messages       - 시민 메시지
 *    supporters     - 서포터즈 목록
 *    rights_members - 권리당원 DB
 *    admins         - 관리자 계정
 *    spam_log       - 스팸/IP 차단 로그
 */

// ─── 설정 ───────────────────────────────────────────────────
const ADMIN_PASSWORD_HASH_SALT = 'namwon2026!@#'; // 변경 권장

// ─── 시트 접근 헬퍼 ─────────────────────────────────────────
function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

// ─── 초기화: 시트 자동 생성 ─────────────────────────────────
function initializeSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheets = {
    'messages': ['id','name','phone','is_rights_member','is_supporter','message','priority','kakao_sent','admin_reply','admin_reply_at','is_deleted','created_at','ip_address','deleted_by','deleted_at','cheers'],
    'supporters': ['id','name','phone','joined_at','message_id'],
    'rights_members': ['id','name','phone','imported_at'],
    'admins': ['id','username','password_hash','role','created_at'],
    'spam_log': ['ip','count','last_attempt','blocked_until']
  };

  for (const [sheetName, headers] of Object.entries(sheets)) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
  }

  // 기본 관리자 계정 생성 (admin / admin2026)
  const adminSheet = ss.getSheetByName('admins');
  if (adminSheet.getLastRow() <= 1) {
    adminSheet.appendRow([
      generateUUID(),
      'admin',
      simpleHash('admin2026'),
      'super_admin',
      new Date().toISOString()
    ]);
  }

  return { success: true, message: '시트 초기화 완료' };
}

// ─── UUID 생성 ──────────────────────────────────────────────
function generateUUID() {
  return Utilities.getUuid();
}

// ─── 간단한 해시 (비밀번호용) ────────────────────────────────
function simpleHash(str) {
  const raw = str + ADMIN_PASSWORD_HASH_SALT;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return digest.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

// ─── 비속어 필터 ────────────────────────────────────────────
const PROFANITY_LIST = [
  '시발','씨발','씨빨','시빨','ㅅㅂ','ㅆㅂ','병신','ㅂㅅ',
  '지랄','ㅈㄹ','개새끼','미친놈','미친년','꺼져','닥쳐',
  '죽어','뒤져','느금마','니엄마','ㄲㅈ','ㄷㅊ'
];

function containsProfanity(text) {
  const normalized = text.replace(/\s/g, '').toLowerCase();
  return PROFANITY_LIST.some(word => normalized.includes(word));
}

// ─── IP 기반 스팸 체크 ──────────────────────────────────────
function checkSpam(ip) {
  const sheet = getSheet('spam_log');
  if (!sheet || sheet.getLastRow() <= 1) return { blocked: false };

  const data = sheet.getDataRange().getValues();
  const now = new Date();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === ip) {
      const blockedUntil = data[i][3] ? new Date(data[i][3]) : null;
      if (blockedUntil && blockedUntil > now) {
        return { blocked: true, until: blockedUntil.toISOString() };
      }
      const count = data[i][1] || 0;
      const lastAttempt = data[i][2] ? new Date(data[i][2]) : null;
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      if (lastAttempt && lastAttempt > hourAgo && count >= 3) {
        const blockUntil = new Date(now.getTime() + 60 * 60 * 1000);
        sheet.getRange(i + 1, 4).setValue(blockUntil.toISOString());
        return { blocked: true, until: blockUntil.toISOString() };
      }

      if (lastAttempt && lastAttempt > hourAgo) {
        sheet.getRange(i + 1, 2).setValue(count + 1);
        sheet.getRange(i + 1, 3).setValue(now.toISOString());
      } else {
        sheet.getRange(i + 1, 2).setValue(1);
        sheet.getRange(i + 1, 3).setValue(now.toISOString());
        sheet.getRange(i + 1, 4).setValue('');
      }
      return { blocked: false };
    }
  }

  sheet.appendRow([ip, 1, now.toISOString(), '']);
  return { blocked: false };
}

// ─── 권리당원 대조 ──────────────────────────────────────────
function checkRightsMember(name, phone) {
  const sheet = getSheet('rights_members');
  if (!sheet || sheet.getLastRow() <= 1) return false;

  const data = sheet.getDataRange().getValues();
  const cleanPhone = phone.replace(/-/g, '');

  for (let i = 1; i < data.length; i++) {
    const memberPhone = String(data[i][2]).replace(/-/g, '');
    if (data[i][1] === name && memberPhone === cleanPhone) {
      return true;
    }
  }
  return false;
}

// ─── 중복 메시지 확인 ───────────────────────────────────────
function checkDuplicate(name, phone) {
  const sheet = getSheet('messages');
  if (!sheet || sheet.getLastRow() <= 1) return false;

  const data = sheet.getDataRange().getValues();
  const cleanPhone = phone.replace(/-/g, '');

  for (let i = 1; i < data.length; i++) {
    const msgPhone = String(data[i][2]).replace(/-/g, '');
    if (data[i][1] === name && msgPhone === cleanPhone && data[i][10] !== true) {
      return true;
    }
  }
  return false;
}

// ─── 서포터즈 중복 확인 및 등록 ─────────────────────────────
function registerSupporter(name, phone, messageId) {
  const sheet = getSheet('supporters');
  if (!sheet) return false;

  const cleanPhone = phone.replace(/-/g, '');

  if (sheet.getLastRow() > 1) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const supPhone = String(data[i][2]).replace(/-/g, '');
      if (data[i][1] === name && supPhone === cleanPhone) {
        return false; // 이미 등록
      }
    }
  }

  sheet.appendRow([
    generateUUID(),
    name,
    phone,
    new Date().toISOString(),
    messageId
  ]);
  return true;
}

// ─── 메시지 저장 ────────────────────────────────────────────
function saveMessage(params) {
  const sheet = getSheet('messages');
  const id = generateUUID();
  const now = new Date().toISOString();

  const isRightsMember = params.is_rights_member ? checkRightsMember(params.name, params.phone) : false;

  sheet.appendRow([
    id,                           // id
    params.name,                  // name
    params.phone,                 // phone
    isRightsMember,               // is_rights_member
    params.is_supporter || false, // is_supporter
    params.message,               // message
    'unclassified',               // priority
    false,                        // kakao_sent
    '',                           // admin_reply
    '',                           // admin_reply_at
    false,                        // is_deleted
    now,                          // created_at
    params.ip || '',              // ip_address
    '',                           // deleted_by
    '',                           // deleted_at
    0                             // cheers
  ]);

  if (params.is_supporter) {
    registerSupporter(params.name, params.phone, id);
  }

  return {
    success: true,
    id: id,
    is_rights_member: isRightsMember,
    message: '메시지가 성공적으로 등록되었습니다.'
  };
}

// ─── 공개 피드 데이터 조회 ──────────────────────────────────
function getPublicFeed(page, limit) {
  const sheet = getSheet('messages');
  if (!sheet || sheet.getLastRow() <= 1) {
    return { messages: [], total: 0, stats: getStats() };
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const messages = [];

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (row[10] === true || row[10] === 'TRUE') continue; // is_deleted
    if (row[6] === 'spam') continue; // spam

    const name = String(row[1]);
    const maskedName = name.length >= 2
      ? name[0] + '*'.repeat(name.length - 1)
      : name;

    messages.push({
      id: row[0],
      name: maskedName,
      message: row[5],
      is_supporter: row[4] === true || row[4] === 'TRUE',
      is_rights_member: row[3] === true || row[3] === 'TRUE',
      has_reply: row[8] !== '' && row[8] !== null && row[8] !== undefined,
      created_at: row[11],
      cheers: row[15] || 0
    });
  }

  const start = (page - 1) * limit;
  const paged = messages.slice(start, start + limit);

  return {
    messages: paged,
    total: messages.length,
    page: page,
    stats: getStats()
  };
}

// ─── 통계 조회 ──────────────────────────────────────────────
function getStats() {
  const msgSheet = getSheet('messages');
  const supSheet = getSheet('supporters');

  const today = new Date();
  const todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  let totalMessages = 0;
  let todayMessages = 0;
  let totalSupporters = 0;
  let todaySupporters = 0;

  if (msgSheet && msgSheet.getLastRow() > 1) {
    const msgData = msgSheet.getDataRange().getValues();
    for (let i = 1; i < msgData.length; i++) {
      if (msgData[i][10] === true || msgData[i][10] === 'TRUE') continue;
      if (msgData[i][6] === 'spam') continue;
      totalMessages++;
      const createdAt = String(msgData[i][11]);
      if (createdAt.startsWith(todayStr)) {
        todayMessages++;
      }
    }
  }

  if (supSheet && supSheet.getLastRow() > 1) {
    const supData = supSheet.getDataRange().getValues();
    totalSupporters = supData.length - 1;
    for (let i = 1; i < supData.length; i++) {
      const joinedAt = String(supData[i][3]);
      if (joinedAt.startsWith(todayStr)) {
        todaySupporters++;
      }
    }
  }

  return {
    totalMessages,
    todayMessages,
    totalSupporters,
    todaySupporters
  };
}

// ─── 응원하기 ───────────────────────────────────────────────
function addCheer(messageId) {
  const sheet = getSheet('messages');
  if (!sheet || sheet.getLastRow() <= 1) return { success: false };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === messageId) {
      const current = data[i][15] || 0;
      sheet.getRange(i + 1, 16).setValue(current + 1);
      return { success: true, cheers: current + 1 };
    }
  }
  return { success: false };
}

// ─── 관리자 로그인 ──────────────────────────────────────────
function adminLogin(username, password) {
  const sheet = getSheet('admins');
  if (!sheet || sheet.getLastRow() <= 1) {
    return { success: false, error: '관리자 계정이 없습니다.' };
  }

  const hash = simpleHash(password);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === username && data[i][2] === hash) {
      const token = generateUUID() + '-' + Date.now();
      // 실제 환경에서는 PropertiesService를 사용하여 토큰 관리
      PropertiesService.getScriptProperties().setProperty('token_' + token, JSON.stringify({
        adminId: data[i][0],
        username: data[i][1],
        role: data[i][3],
        expires: Date.now() + 30 * 60 * 1000 // 30분
      }));
      return {
        success: true,
        token: token,
        role: data[i][3],
        username: data[i][1]
      };
    }
  }
  return { success: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' };
}

// ─── 토큰 검증 ──────────────────────────────────────────────
function verifyToken(token) {
  if (!token) return null;

  const stored = PropertiesService.getScriptProperties().getProperty('token_' + token);
  if (!stored) return null;

  const data = JSON.parse(stored);
  if (Date.now() > data.expires) {
    PropertiesService.getScriptProperties().deleteProperty('token_' + token);
    return null;
  }

  // 세션 연장
  data.expires = Date.now() + 30 * 60 * 1000;
  PropertiesService.getScriptProperties().setProperty('token_' + token, JSON.stringify(data));
  return data;
}

// ─── 관리자: 전체 메시지 조회 ───────────────────────────────
function getAdminMessages(token, filters) {
  const admin = verifyToken(token);
  if (!admin) return { success: false, error: '인증이 필요합니다.' };

  const sheet = getSheet('messages');
  if (!sheet || sheet.getLastRow() <= 1) {
    return { success: true, messages: [], total: 0, stats: getAdminStats() };
  }

  const data = sheet.getDataRange().getValues();
  let messages = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const msg = {
      id: row[0],
      name: row[1],
      phone: row[2],
      is_rights_member: row[3] === true || row[3] === 'TRUE',
      is_supporter: row[4] === true || row[4] === 'TRUE',
      message: row[5],
      priority: row[6] || 'unclassified',
      kakao_sent: row[7] === true || row[7] === 'TRUE',
      admin_reply: row[8] || '',
      admin_reply_at: row[9] || '',
      is_deleted: row[10] === true || row[10] === 'TRUE',
      created_at: row[11],
      cheers: row[15] || 0
    };

    // 필터링
    if (filters) {
      if (filters.hide_deleted !== false && msg.is_deleted) continue;
      if (filters.priority && filters.priority !== 'all' && msg.priority !== filters.priority) continue;
      if (filters.is_supporter === true && !msg.is_supporter) continue;
      if (filters.is_rights_member === true && !msg.is_rights_member) continue;
      if (filters.kakao_sent === false && msg.kakao_sent) continue;
      if (filters.kakao_sent === true && !msg.kakao_sent) continue;
      if (filters.search) {
        const s = filters.search.toLowerCase();
        const match = msg.name.toLowerCase().includes(s) ||
                      msg.phone.includes(s) ||
                      msg.message.toLowerCase().includes(s);
        if (!match) continue;
      }
    } else {
      if (msg.is_deleted) continue;
    }

    messages.push(msg);
  }

  // 정렬
  const sort = (filters && filters.sort) || 'newest';
  if (sort === 'newest') {
    messages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (sort === 'priority') {
    const order = { 'immediate': 0, 'medium': 1, 'low': 2, 'unclassified': 3, 'spam': 4 };
    messages.sort((a, b) => (order[a.priority] || 3) - (order[b.priority] || 3));
  } else if (sort === 'no_reply') {
    messages.sort((a, b) => {
      if (!a.admin_reply && b.admin_reply) return -1;
      if (a.admin_reply && !b.admin_reply) return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  const page = (filters && filters.page) || 1;
  const limit = (filters && filters.limit) || 20;
  const start = (page - 1) * limit;
  const paged = messages.slice(start, start + limit);

  return {
    success: true,
    messages: paged,
    total: messages.length,
    page: page,
    stats: getAdminStats()
  };
}

// ─── 관리자 통계 ────────────────────────────────────────────
function getAdminStats() {
  const stats = getStats();
  const sheet = getSheet('messages');

  let rightsCount = 0;
  let noReply = 0;
  let immediateCount = 0;
  const dailyCounts = {};

  if (sheet && sheet.getLastRow() > 1) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][10] === true || data[i][10] === 'TRUE') continue;
      if (data[i][6] === 'spam') continue;

      if (data[i][3] === true || data[i][3] === 'TRUE') rightsCount++;
      if (!data[i][8] && data[i][7] !== true) noReply++;
      if (data[i][6] === 'immediate') immediateCount++;

      const dateStr = String(data[i][11]).substring(0, 10);
      dailyCounts[dateStr] = (dailyCounts[dateStr] || 0) + 1;
    }
  }

  // 최근 7일 데이터
  const last7Days = [];
  for (let d = 6; d >= 0; d--) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    const key = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    last7Days.push({ date: key, count: dailyCounts[key] || 0 });
  }

  return {
    ...stats,
    rightsCount,
    noReply,
    immediateCount,
    last7Days
  };
}

// ─── 관리자: 등급 변경 ──────────────────────────────────────
function updatePriority(token, messageId, priority) {
  const admin = verifyToken(token);
  if (!admin) return { success: false, error: '인증이 필요합니다.' };

  const sheet = getSheet('messages');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === messageId) {
      sheet.getRange(i + 1, 7).setValue(priority);
      return { success: true };
    }
  }
  return { success: false, error: '메시지를 찾을 수 없습니다.' };
}

// ─── 관리자: 메시지 삭제 (소프트) ───────────────────────────
function deleteMessage(token, messageId) {
  const admin = verifyToken(token);
  if (!admin) return { success: false, error: '인증이 필요합니다.' };

  const sheet = getSheet('messages');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === messageId) {
      sheet.getRange(i + 1, 11).setValue(true);          // is_deleted
      sheet.getRange(i + 1, 14).setValue(admin.username); // deleted_by
      sheet.getRange(i + 1, 15).setValue(new Date().toISOString()); // deleted_at
      return { success: true };
    }
  }
  return { success: false, error: '메시지를 찾을 수 없습니다.' };
}

// ─── 관리자: 답장 저장 ──────────────────────────────────────
function saveReply(token, messageId, replyText) {
  const admin = verifyToken(token);
  if (!admin) return { success: false, error: '인증이 필요합니다.' };

  const sheet = getSheet('messages');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === messageId) {
      sheet.getRange(i + 1, 9).setValue(replyText);                 // admin_reply
      sheet.getRange(i + 1, 10).setValue(new Date().toISOString()); // admin_reply_at
      sheet.getRange(i + 1, 8).setValue(true);                      // kakao_sent
      return { success: true };
    }
  }
  return { success: false, error: '메시지를 찾을 수 없습니다.' };
}

// ─── 관리자: 엑셀 데이터 내보내기 ───────────────────────────
function exportMessages(token) {
  const admin = verifyToken(token);
  if (!admin) return { success: false, error: '인증이 필요합니다.' };

  const sheet = getSheet('messages');
  if (!sheet || sheet.getLastRow() <= 1) return { success: true, data: [] };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const obj = {};
    headers.forEach((h, j) => obj[h] = data[i][j]);
    rows.push(obj);
  }

  return { success: true, data: rows };
}

// ─── HTTP 요청 핸들러 ───────────────────────────────────────
function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const params = e.parameter || {};
  const action = params.action || '';

  // POST body 파싱
  let body = {};
  if (e.postData) {
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      body = {};
    }
  }

  let result;

  try {
    switch (action) {
      // ── 공개 API ────────────────────────────
      case 'init':
        result = initializeSheets();
        break;

      case 'feed':
        const page = parseInt(params.page) || 1;
        const limit = parseInt(params.limit) || 12;
        result = getPublicFeed(page, limit);
        break;

      case 'stats':
        result = getStats();
        break;

      case 'submit':
        // 이름 유효성 검증
        if (!/^[가-힣]{2,5}$/.test(body.name)) {
          result = { success: false, error: '이름을 정확히 입력해주세요 (2~5자 한글)' };
          break;
        }
        // 전화번호 유효성
        if (!/^010-\d{4}-\d{4}$/.test(body.phone)) {
          result = { success: false, error: '휴대폰 번호 형식이 올바르지 않습니다' };
          break;
        }
        // 메시지 길이
        if (!body.message || body.message.length < 10 || body.message.length > 500) {
          result = { success: false, error: '메시지는 10자 이상 500자 이하로 입력해주세요' };
          break;
        }
        // 비속어 필터
        if (containsProfanity(body.message)) {
          result = { success: false, error: '부적절한 표현이 포함되어 있습니다. 수정 후 다시 시도해주세요' };
          break;
        }
        // 중복 확인
        if (checkDuplicate(body.name, body.phone)) {
          result = { success: false, error: '이미 메시지를 남기셨습니다' };
          break;
        }
        result = saveMessage(body);
        break;

      case 'cheer':
        result = addCheer(body.messageId || params.messageId);
        break;

      // ── 관리자 API ──────────────────────────
      case 'login':
        result = adminLogin(body.username, body.password);
        break;

      case 'admin_messages':
        result = getAdminMessages(
          body.token || params.token,
          body.filters || {}
        );
        break;

      case 'admin_stats':
        const adminData = verifyToken(body.token || params.token);
        if (!adminData) {
          result = { success: false, error: '인증이 필요합니다.' };
        } else {
          result = { success: true, stats: getAdminStats() };
        }
        break;

      case 'update_priority':
        result = updatePriority(body.token, body.messageId, body.priority);
        break;

      case 'delete_message':
        result = deleteMessage(body.token, body.messageId);
        break;

      case 'save_reply':
        result = saveReply(body.token, body.messageId, body.reply);
        break;

      case 'export':
        result = exportMessages(body.token || params.token);
        break;

      case 'verify_token':
        const vData = verifyToken(body.token || params.token);
        result = vData ? { success: true, admin: vData } : { success: false };
        break;

      default:
        result = { success: false, error: '알 수 없는 요청입니다.' };
    }
  } catch (err) {
    result = { success: false, error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
