# Merxatus 베타 배포 가이드

## 1. 환경 변수 (Vercel)

`.env.example`을 참고해 아래를 설정합니다.

| 변수 | 필수 | 설명 |
|------|------|------|
| `DATABASE_URL` | ✅ | Supabase `:6543?pgbouncer=true&connection_limit=1` |
| `SESSION_SECRET` | ✅ | 32자+ 랜덤 (ADMIN_TOKEN과 **다르게**) |
| `ADMIN_TOKEN` | ✅ | `/admin`·수동 봇 틱 |
| `CRON_SECRET` | ✅ | Vercel Cron → `/api/bots/tick` Bearer 인증 |
| `GOOGLE_CLIENT_ID` / `SECRET` | ✅ | OAuth |
| `GOOGLE_REDIRECT_URI` | ✅ | `https://도메인/api/auth/google/callback` |
| `BOT_COUNT` | 권장 | NPC 봇 수 (기본 5) |

**prod에서 설정 금지:** `MERXATUS_ALLOW_DEV_TOOLS=1`

## 2. DB 마이그레이션

```bash
cd web
npx prisma migrate deploy
```

초기 데이터:

```bash
npm run apply:merxatus-csv   # JSON 갱신
# 이후 /admin 에서 Apply 또는 POST /api/dev/seed (로컬만)
```

## 3. Vercel Cron

`vercel.json`에 5분마다 `/api/bots/tick` 호출이 설정되어 있습니다.  
Vercel 대시보드에서 `CRON_SECRET`을 설정하면 `Authorization: Bearer …` 헤더가 자동 전달됩니다.

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
