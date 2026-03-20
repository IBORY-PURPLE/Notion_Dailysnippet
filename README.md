# notion-to-daily-snippet

Notion의 오늘 날짜 `daily_snippet` 페이지를 읽고 Markdown으로 변환한 뒤 외부 Daily Snippet API로 전송하는 Next.js 프로젝트입니다.

## Features

- 오늘 날짜의 Notion 데이터베이스 페이지를 조회합니다.
- `daily_snippet` 카테고리에 해당하는 페이지만 대상으로 삼습니다.
- 페이지 본문을 Markdown으로 변환합니다.
- Swagger 스펙에 맞춰 `{ "content": "..." }` payload로 외부 API에 POST 합니다.
- 동기화 결과를 `synced`, `failed`, `skipped`로 나눠 반환합니다.
- 중복 webhook / 중복 sync 요청을 메모리 기반 idempotency로 방지합니다.

## API Routes

- `POST /api/sync`
  - 수동 동기화 실행
- `POST /api/notion/webhook`
  - Notion webhook 진입점
  - `x-webhook-secret` 검증 지원
  - 미지원 이벤트는 `202`로 무시
- `GET /api/health`
  - 환경변수 및 Notion 연결 상태 확인
- `GET /api/notion/today-snippet`
  - 오늘 대상 페이지를 Markdown으로 미리보기
- `GET /api/notion/test`
  - 개발 환경 전용 Notion 연결 테스트

## Environment Variables

`.env.local` 예시:

```env
# Notion
NOTION_API_KEY=
NOTION_DATABASE_ID=
NOTION_CATEGORY_PROPERTY=category
NOTION_DATE_PROPERTY=date
NOTION_TARGET_CATEGORY=daily_snippet
SYNC_TIMEZONE=Asia/Seoul
SYNC_DEDUPE_TTL_SECONDS=600

# Optional webhook protection
NOTION_WEBHOOK_SECRET=

# Daily snippet API
DAILY_SNIPPET_API_URL=https://api.1000.school/daily-snippets
DAILY_SNIPPET_API_KEY=
DAILY_SNIPPET_API_KEY_HEADER=Authorization
```

`Authorization: Bearer <token>` 형태가 필요하면 `DAILY_SNIPPET_API_KEY` 값에 `Bearer `까지 포함해서 넣으세요.

예시:

```env
DAILY_SNIPPET_API_KEY=Bearer your-token
DAILY_SNIPPET_API_KEY_HEADER=Authorization
```

## Outgoing Payload

외부 Daily Snippet API로 보내는 바디:

```json
{
  "content": "# Markdown content..."
}
```

## Local Run

```bash
npm install
npm run dev
```

PowerShell에서 수동 동기화:

```powershell
(Invoke-WebRequest -Method POST -Uri http://localhost:3000/api/sync).Content
```

상태 확인:

```powershell
(Invoke-WebRequest -Method GET -Uri http://localhost:3000/api/health).Content
```

## Verification

배포 전 최소 검증:

```bash
npm run typecheck
npm run build
```

## Troubleshooting

- `403 CSRF validation failed`
  - 외부 API가 브라우저 세션 요청으로 처리되고 있을 가능성이 큽니다.
  - 토큰 기반 호출이 필요하면 `DAILY_SNIPPET_API_KEY` / `DAILY_SNIPPET_API_KEY_HEADER`를 확인하세요.
- `422 Validation Error`
  - 외부 API가 기대하는 body 스키마와 실제 payload가 다른지 확인하세요.
- `No page matched today's daily_snippet condition`
  - 오늘 날짜와 카테고리 값이 Notion DB에서 정확히 맞는지 확인하세요.
