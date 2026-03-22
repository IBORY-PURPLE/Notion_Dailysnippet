# notion-to-daily-snippet

Notion 데이터베이스의 `daily_snippet` 페이지를 감지해 Markdown으로 변환한 뒤 외부 Daily Snippet API로 전달하는 Next.js 프로젝트입니다.

현재 운영 기준 동작은 "오늘 날짜 조회" 중심이 아니라, Notion 자동화 또는 webhook 요청을 통해 특정 페이지가 다음 조건을 만족할 때 동기화하는 방식입니다.

- `완료` 체크박스가 `true`
- `category` 속성에 `daily_snippet` 포함
- `진행날짜` 속성값 존재

위 트리거를 통해 사용자가 api통신을 제어할 수 있다.

서버는 페이지 본문을 Markdown으로 변환해 snippet 서버로 `{ "content": "..." }` 형태로 전송합니다. 전송 후 snippet 서버 응답의 `date`가 해당 Notion 페이지의 `진행날짜`와 같을 때만 `synced`로 처리합니다.

## Deployment

- Production URL: [https://notion-dailysnippet.vercel.app](https://notion-dailysnippet.vercel.app)
- Webhook endpoint: [https://notion-dailysnippet.vercel.app/api/notion/webhook](https://notion-dailysnippet.vercel.app/api/notion/webhook)

## Tech Stack

- Framework: Next.js 15
- Language: TypeScript
- Runtime: Node.js on Vercel Functions
- UI: React 19
- Notion SDK: `@notionhq/client`
- Markdown conversion: `notion-to-md`
- Deployment: Vercel

## Overview

전체 흐름은 아래와 같습니다.

1. Notion DB 자동화옵션이 Vercel의 `POST /api/notion/webhook`로 요청을 보냅니다.
2. 서버가 webhook payload에서 `pageId`를 읽습니다.
3. Notion API로 해당 페이지를 다시 조회합니다.
4. 페이지가 동기화 조건을 만족하면 Markdown으로 변환합니다.
5. 외부 Daily Snippet API로 `content`를 POST 합니다.
6. 응답 `date`와 페이지 `진행날짜`가 같으면 성공 처리합니다.

## Folder Structure

```text
.
|-- src
|   |-- app
|   |   |-- api
|   |   |   |-- health
|   |   |   |   `-- route.ts
|   |   |   |-- notion
|   |   |   |   |-- test
|   |   |   |   |   `-- route.ts
|   |   |   |   |-- today-snippet
|   |   |   |   |   `-- route.ts
|   |   |   |   `-- webhook
|   |   |   |       `-- route.ts
|   |   |   `-- sync
|   |   |       `-- route.ts
|   |   |-- globals.css
|   |   |-- layout.tsx
|   |   `-- page.tsx
|   `-- lib
|       |-- config.ts
|       |-- dailySnippet.ts
|       |-- idempotency.ts
|       |-- logger.ts
|       |-- notion.ts
|       |-- notionToMarkdown.ts
|       |-- sync.ts
|       `-- types.ts
|-- DEPLOYMENT_CHECKLIST.md
|-- plan.md
|-- package.json
`-- README.md
```

## API Routes

### `POST /api/notion/webhook`

Notion 자동화 또는 외부 webhook 진입점입니다.

- 지원 이벤트를 수신합니다.
- payload에서 `pageId`를 읽을 수 있으면 해당 페이지만 동기화합니다.
- `pageId`가 없으면 대상 페이지 전체 재조회 방식으로 fallback 합니다.
- `NOTION_WEBHOOK_SECRET`가 설정된 경우 `x-webhook-secret` 헤더를 검증합니다.
- 중복 요청은 메모리 기반 idempotency로 무시합니다.

### `POST /api/sync`

수동 동기화 엔드포인트입니다.

- 대상 Notion 데이터베이스를 조회합니다.
- `완료=true`, `category=daily_snippet`, `진행날짜 존재` 조건에 맞는 페이지들을 동기화합니다.

### `GET /api/health`

배포 상태와 주요 환경변수 설정 상태를 확인합니다.

- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`
- `DAILY_SNIPPET_API_URL`

필수 환경변수가 있으면 Notion DB 연결 상태도 함께 검사합니다.

### `GET /api/notion/today-snippet`

현재 sync 조건에 맞는 페이지를 Markdown으로 미리 확인하는 용도의 조회 엔드포인트입니다.

주의:
이 라우트 이름은 예전 이름이 유지된 것이고, 내부 조건은 더 이상 "오늘 날짜" 전용이 아닙니다. 현재는 완료된 `daily_snippet` 페이지 목록을 기준으로 동작합니다.

### `GET /api/notion/test`

개발 환경 전용 Notion 연결 테스트입니다.

- production에서는 `404 Not found`
- development에서는 Notion DB query 결과를 그대로 확인 가능

## Core Modules

### [`src/lib/config.ts`](./src/lib/config.ts)

환경변수 로딩과 기본값 관리.

### [`src/lib/notion.ts`](./src/lib/notion.ts)

Notion DB 조회, 페이지 조회, 속성 파싱.

- `category`
- `진행날짜`
- `완료`

### [`src/lib/notionToMarkdown.ts`](./src/lib/notionToMarkdown.ts)

Notion 블록을 Markdown으로 변환.

### [`src/lib/dailySnippet.ts`](./src/lib/dailySnippet.ts)

외부 Daily Snippet API 호출과 응답 검증.

- 요청 body는 `content`만 전송
- 응답 body의 `date`를 읽어 후속 검증에 사용

### [`src/lib/sync.ts`](./src/lib/sync.ts)

실제 동기화 오케스트레이션.

- 대상 페이지 판정
- Markdown 변환
- 외부 API 전송
- 응답 `date` 검증
- 결과 요약 생성

## Environment Variables

`.env.local` 예시:

```env
# Notion
NOTION_API_KEY=
NOTION_DATABASE_ID=
NOTION_CATEGORY_PROPERTY=category
NOTION_DATE_PROPERTY=진행날짜
NOTION_COMPLETED_PROPERTY=완료
NOTION_TARGET_CATEGORY=daily_snippet

# Optional webhook protection
NOTION_WEBHOOK_SECRET=

# Runtime
SYNC_TIMEZONE=Asia/Seoul
SYNC_DEDUPE_TTL_SECONDS=600

# Daily snippet API
DAILY_SNIPPET_API_URL=https://api.1000.school/daily-snippets
DAILY_SNIPPET_API_KEY=
DAILY_SNIPPET_API_KEY_HEADER=Authorization
```

`DAILY_SNIPPET_API_KEY`가 필요한 경우 값 자체에 `Bearer ` 접두사를 포함해 사용할 수 있습니다.

예시:

```env
DAILY_SNIPPET_API_KEY=Bearer your-token
DAILY_SNIPPET_API_KEY_HEADER=Authorization
```

## Notion Setup

Notion integration 또는 자동화 설정 시 아래를 맞춰 주세요.

- 대상 데이터베이스를 integration이 읽을 수 있어야 합니다.
- 페이지 속성 이름이 기본값과 다르면 env에서 맞춰야 합니다.
- 자동화 조건은 보통 아래 조합을 권장합니다.
- `완료`가 체크됨
- `category`에 `daily_snippet` 포함
- 필요하면 `진행날짜` 비어있지 않음 조건 추가

Webhook URL 예시:

```text
https://your-vercel-domain.vercel.app/api/notion/webhook
```

보안을 켜고 싶다면:

- Vercel에 `NOTION_WEBHOOK_SECRET` 설정
- Notion 자동화의 사용자 지정 헤더에 `x-webhook-secret` 추가

## Outgoing Payload

Daily Snippet API로 보내는 요청 body:

```json
{
  "content": "# Markdown content..."
}
```

응답 예시는 서버 구현에 따라 다를 수 있지만, 현재 프로젝트는 응답 body의 `date` 필드를 읽어 Notion 페이지의 `진행날짜`와 비교합니다.

```

## Sync Result Status

각 페이지는 아래 상태 중 하나로 집계됩니다.

- `synced`: snippet 서버 반영 완료
- `failed`: Markdown 변환 또는 외부 API 호출 실패
- `skipped`: 조건 불일치, 중복 요청, 응답 `date` 불일치 등으로 반영 안 함

## Troubleshooting

### `401 Unauthorized webhook`

- Vercel에 `NOTION_WEBHOOK_SECRET`가 설정되어 있는데 Notion 자동화 헤더가 없거나 값이 다를 때 발생합니다.

### `Webhook page did not match the completed daily_snippet condition`

- `완료`가 체크되지 않았거나
- `category`가 `daily_snippet`과 다르거나
- `진행날짜`가 비어 있을 수 있습니다.

### `Snippet API response date mismatch`

- snippet 서버가 반환한 `date`와 Notion 페이지의 `진행날짜`가 다릅니다.
- 이 경우 요청은 갔지만 최종 반영 성공으로 처리하지 않습니다.

### `403 CSRF validation failed`

- 외부 API가 브라우저 요청처럼 처리하고 있을 가능성이 있습니다.
- 인증 헤더가 필요하면 `DAILY_SNIPPET_API_KEY`와 `DAILY_SNIPPET_API_KEY_HEADER`를 확인해 주세요.

### `No completed daily_snippet page matched the sync condition`

- 현재 데이터베이스에 sync 조건을 만족하는 페이지가 없습니다.

