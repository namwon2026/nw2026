# 양충모 후보 디지털 소통 플랫폼 - 설정 가이드

## 1단계: Google Sheets 설정

1. [Google Sheets](https://sheets.google.com)에서 새 스프레드시트 생성
2. 스프레드시트 URL에서 ID 복사
   - 예: `https://docs.google.com/spreadsheets/d/여기가_ID/edit`
3. `apps-script/Code.gs` 파일의 `SPREADSHEET_ID`에 ID 입력

## 2단계: Google Apps Script 배포

1. [Google Apps Script](https://script.google.com) 접속
2. "새 프로젝트" 클릭
3. `apps-script/Code.gs` 내용 전체를 복사하여 붙여넣기
4. `SPREADSHEET_ID` 값을 1단계에서 복사한 ID로 변경
5. 상단 메뉴 **실행** > 함수 선택: `initializeSheets` > **실행** 클릭
   - 권한 승인 팝업이 뜨면 허용
   - Google Sheets에 시트 5개가 자동 생성됨
6. 상단 메뉴 **배포** > **새 배포** 클릭
   - 유형: "웹 앱"
   - 실행 사용자: "나"
   - 액세스 권한: **"모든 사용자"**
   - 배포 클릭
7. 배포 URL 복사 (예: `https://script.google.com/macros/s/XXXX/exec`)

## 3단계: 프론트엔드 설정

1. `js/config.js` 파일을 열어 `API_URL`에 배포 URL 입력:
   ```javascript
   API_URL: 'https://script.google.com/macros/s/여기에_배포ID/exec',
   ```

## 4단계: GitHub Pages 배포

1. GitHub에서 새 리포지토리 생성 (예: `namwon-platform`)
2. 로컬에서 Git 초기화 및 푸시:
   ```bash
   cd namwon-platform
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/사용자명/namwon-platform.git
   git push -u origin main
   ```
3. GitHub 리포지토리 > **Settings** > **Pages**
4. Source: "Deploy from a branch" > Branch: `main` > Folder: `/ (root)` > Save
5. 약 1~2분 후 `https://사용자명.github.io/namwon-platform/` 에서 접속 가능

## 5단계: 관리자 접속

- 관리자 URL: `https://사용자명.github.io/namwon-platform/admin.html`
- 초기 계정: `admin` / `admin2026`
- **반드시 첫 로그인 후 비밀번호를 변경하세요**

## 6단계: 권리당원 DB 업로드

1. Google Sheets의 `rights_members` 시트에 직접 입력
2. 열 구조: `id | name | phone | imported_at`
   - id: 아무 고유값
   - name: 성명
   - phone: 전화번호 (010-XXXX-XXXX)
   - imported_at: 등록일시

## 커스텀 도메인 연결 (선택)

1. 도메인 구매 (예: namwon2026.kr)
2. GitHub Pages Settings > Custom domain에 도메인 입력
3. 도메인 DNS에 CNAME 레코드 추가: `사용자명.github.io`
4. "Enforce HTTPS" 체크

---

## 프로젝트 구조

```
namwon-platform/
├── index.html          # 공개 피드 (메인 페이지)
├── write.html          # 시민 메시지 작성
├── admin.html          # 관리자 대시보드
├── css/
│   └── style.css       # 전체 스타일시트
├── js/
│   ├── config.js       # API URL 설정 + 공통 유틸리티
│   ├── feed.js         # 피드 페이지 로직
│   ├── write.js        # 작성 폼 로직 (유효성 검증)
│   └── admin.js        # 관리자 대시보드 로직
├── apps-script/
│   └── Code.gs         # Google Apps Script 백엔드
└── SETUP.md            # 이 문서
```

## 참고 사항

- Google Apps Script 무료 한도: 일 20,000 호출, 6분 실행 시간
- 카카오 알림톡 연동은 별도 카카오 비즈니스 채널 개설 필요
- CORS: Google Apps Script 웹앱은 기본 CORS 허용
