# Deployment Checklist

## Environment

- `NOTION_API_KEY` 설정
- `NOTION_DATABASE_ID` 설정
- `NOTION_CATEGORY_PROPERTY` / `NOTION_DATE_PROPERTY` 확인
- `NOTION_TARGET_CATEGORY` 확인
- `SYNC_TIMEZONE` 확인
- `SYNC_DEDUPE_TTL_SECONDS` 확인
- `DAILY_SNIPPET_API_URL` 설정
- 필요 시 `DAILY_SNIPPET_API_KEY` 설정
- 필요 시 `DAILY_SNIPPET_API_KEY_HEADER` 설정
- 필요 시 `NOTION_WEBHOOK_SECRET` 설정

## Notion

- Notion integration이 대상 데이터베이스에 연결되어 있는지 확인
- 데이터베이스에 날짜 속성과 카테고리 속성이 실제 이름대로 존재하는지 확인
- `daily_snippet` 대상 페이지가 오늘 날짜 기준으로 조회되는지 확인

## External API

- `POST /daily-snippets` 엔드포인트가 서버 간 호출을 허용하는지 확인
- API 토큰 방식이면 `Authorization: Bearer <token>` 또는 해당 스펙의 헤더를 맞췄는지 확인
- CSRF 보호가 API 호출을 막지 않는지 확인
- Swagger 문서 기준 payload가 `{ "content": "..." }` 인지 확인

## Verification

- `npm run typecheck`
- `npm run build`
- `GET /api/health`
- `POST /api/sync`
- 필요 시 `POST /api/notion/webhook`
