# Merxatus 베타 배포 가이드

## 1. 환경 변수 (Vercel)

`.env.example`을 참고해 아래를 설정합니다.

| 변수 | 필수 | 설명 |
|------|------|------|
| `DATABASE_URL` | ✅ | Supabase Transaction pooler `:6543?pgbouncer=true` (앱이 `connection_limit`·`pool_timeout` 자동 보정, 또는 `connection_limit=8&pool_timeout=30` 명시) |
| `PRISMA_CONNECTION_LIMIT` | 선택 | 풀 상한 오버라이드 (기본 8) |
| `DIRECT_URL` | ✅ (마이그레이션) | Supabase **Direct** `:5432` — `migrate deploy` 전용 |
| `SESSION_SECRET` | ✅ | 32자+ 랜덤 (ADMIN_TOKEN과 **다르게**) |
| `ADMIN_TOKEN` | ✅ | `/admin`·수동 봇 틱 |
| `CRON_SECRET` | ✅ | Vercel Cron → `/api/bots/tick` Bearer 인증 |
| `GOOGLE_CLIENT_ID` / `SECRET` | ✅ | OAuth |
| `GOOGLE_REDIRECT_URI` | ✅ | `https://도메인/api/auth/google/callback` |
| `BOT_COUNT` | 권장 | NPC 봇 수 (기본 5) |

**prod에서 설정 금지:** `MERXATUS_ALLOW_DEV_TOOLS=1`

## 2. DB 마이그레이션

Supabase **Transaction pooler(6543)** 로는 `migrate deploy` / `db push`가 실패합니다.  
`.env`에 **Direct connection(5432)** `DIRECT_URL`을 추가한 뒤:

```bash
cd web
npm run db:migrate
# 또는: npx prisma migrate deploy
```

`DIRECT_URL` 설정이 어렵다면 Supabase **SQL Editor**에서  
`prisma/migrations/20260531130100_raid_tower_leaderboard/migration.sql` 내용을 실행해도 됩니다.

초기 데이터:

```bash
npm run apply:merxatus-csv   # JSON 갱신
# 이후 /admin 에서 Apply 또는 POST /api/dev/seed (로컬만)
```

## 3. Vercel Cron

`vercel.json`에 **하루 1회**(UTC 0시) `/api/bots/tick` 호출이 설정되어 있습니다.  
Vercel **Hobby**는 5분 간격 cron을 지원하지 않습니다. 더 자주 돌리려면 `/admin`에서 수동 틱 또는 [cron-job.org](https://cron-job.org) 등 외부 cron + `CRON_SECRET`을 사용하세요.

## 4. Google OAuth

Google Cloud Console → OAuth 동의 화면:

- 앱 이름, 지원 이메일
- **개인정보처리방침 URL:** `https://도메인/privacy`
- **서비스 약관 URL:** `https://도메인/terms`
- 승인된 리디렉션 URI에 prod callback 추가

## 5. 베타 보안 체크 (적용됨)

- [x] `/api/dev/*` prod 차단
- [x] API 세션 필수 (prod에서 body userId 무시)
- [x] `/api/auth/login` prod 403
- [x] SESSION_SECRET / ADMIN_TOKEN 분리
- [x] 이용약관·개인정보 페이지 (`/terms`, `/privacy`)

## 6. 로컬 개발

```bash
cd web
npm run dev
```

닉네임 로그인·dev API는 **로컬(`NODE_ENV=development`)에서만** 동작합니다.
