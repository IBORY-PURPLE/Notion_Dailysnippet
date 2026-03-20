# `plan.md` 초안: 2일 실행 계획

## Summary
현재 프로젝트는 Notion의 오늘 날짜 `daily_snippet` 페이지를 읽어 Markdown으로 변환한 뒤 외부 `daily_snippet` API로 전송하는 기본 흐름이 구현되어 있다. 이번 계획은 이를 2일 안에 운영 가능한 수준으로 끌어올리는 데 초점을 둔다: 공통 서비스 정리, 응답 표준화, webhook 보강, 중복 방지, 상태 확인 API, 문서 정비까지 포함한다.

## Day 1
- [O] 동기화 흐름을 `조회 -> 변환 -> 전송 -> 결과 기록` 단계로 나누는 공통 서비스 레이어를 만든다.
- [O] `POST /api/sync` 응답을 표준화한다.
  - `syncedCount`, `failedCount`, `skippedCount`, `results[]`
  - 페이지별 성공/실패 사유 포함
  - 일부 실패가 있어도 전체 요청은 요약 결과를 반환
- [O] 내부 타입을 정리한다.
  - `SyncResult`
  - `SyncFailureReason`
  - `DailySnippetPayload` 검증 타입가드
  - `WebhookRequestMeta`
- [O] Notion 조회 조건을 환경변수 중심으로 정리한다.
  - 대상 카테고리값
  - 날짜 필드명
  - 카테고리 필드명
  - 타임존
- [O] 외부 API 전송 전 payload 검증을 추가한다.
  - 필수값 누락 차단
  - 빈 markdown 차단
  - 날짜 문자열 형식 고정
- [O] 구조화 로그를 추가한다.
  - 요청 시작/종료
  - 조회 건수
  - 페이지별 성공/실패
  - 외부 API 상태코드

## Day 2
- [O] `POST /api/notion/webhook`를 운영용으로 보강한다.
  - secret 검증 유지
  - 지원하지 않는 이벤트는 무시 또는 `202` 처리
  - 중복 이벤트 방지 기준 적용
- [O] 중복 전송 방지 로직을 추가한다.
  - 기본 키는 `notionPageId + date`
  - 외부 저장소 없이도 확장 가능한 구조로 작성
  - 동일 요청 재진입 시 `skipped` 결과로 집계
- [O] `GET /api/health`를 추가한다.
  - env 누락 여부
  - Notion 연결 가능 여부
  - 외부 API URL 설정 여부
- [O] 테스트용 `/api/notion/test`는 개발 전용으로 제한하거나 프로덕션에서 비활성화한다.
- [O] README를 UTF-8 기준으로 재작성한다.
  - 프로젝트 개요
  - env 예시
  - 실행 방법
  - webhook 연동 방법
  - 장애 대응 체크
- [O] 별도 배포 체크리스트 문서를 추가한다.
  - 서버 환경변수
  - Notion integration 권한
  - webhook secret
  - 외부 API 인증 헤더 규칙
- [O] `npm run typecheck`, `npm run build` 기준의 검증 절차를 문서화한다.

## Public APIs / Interfaces
- `POST /api/sync`
  - 요약 통계와 페이지별 결과를 함께 반환
- `POST /api/notion/webhook`
  - 유효하지 않은 secret은 `401`
  - 미지원 이벤트는 무시 또는 `202`
  - 중복 이벤트는 재전송 대신 `skipped`
- `GET /api/health`
  - 운영 점검용 최소 상태 정보 반환
- 내부 공통 인터페이스
  - sync 결과 타입
  - payload 검증 타입
  - webhook 메타 타입

## Test Plan
- 오늘 날짜 조건에 맞는 페이지가 0건일 때 정상 응답
- `daily_snippet` 카테고리와 오늘 날짜가 모두 일치하는 페이지만 전송
- relation/select/rich_text 카테고리 속성 모두 정상 처리
- Markdown 변환 실패 시 해당 페이지만 실패 집계
- 외부 API 4xx/5xx 응답 시 실패 사유와 상태코드 기록
- webhook secret 불일치 시 `401`
- 동일 페이지의 중복 webhook 호출 시 `skipped` 처리
- env 누락 시 health/sync에서 원인 확인 가능
- 테스트용 진단 API가 프로덕션에서 노출되지 않음
- `typecheck`, `build` 기준으로 배포 전 검증 가능

## Assumptions
- 사용자가 원한 “하루별 계획”은 `2일` 일정으로 해석했다.
- 1차 목표는 기능 확장보다 안정화와 운영 준비다.
- 대상 문서는 계속 오늘 날짜 + `daily_snippet` 카테고리 조건만 사용한다.
- 외부 `daily_snippet` API 스펙은 현재의 단일 POST 구조를 유지한다.
- 별도 DB나 Redis는 이번 일정에 도입하지 않는다.
