# API 성능 — 최적화 현황

클라이언트 GET 캐시: `web/src/shared/apiCache.ts`, `apiGetJsonCached`  
POST 성공 시 관련 prefix 캐시 무효화 (`sessionClient.ts`)

## 적용 완료

| 항목 | 내용 |
|------|------|
| **홈 부트스트랩** | `GET /api/me/bootstrap` — summary + dashboard light |
| **골드 흐름 차트** | 제거 (거래·던전 30일 집계 API 삭제) |
| **대표 미니언** | `User.representativeMinionId` + `POST /api/minions/representative` |
| **me/state 분리** | `?scope=inventory\|weapons\|armor\|market\|full` |
| **탑 랭킹** | `GET /api/tower/leaderboard` — UI에서 「랭킹 보기」 시 lazy load |
| **던전 목록** | `GET /api/dungeons/list?lite=1` 120초 캐시 |
| **dashboard** | light만 반환 (`full`/`trends` 제거) |

## `GET /api/me/state` scope

| scope | 반환 |
|-------|------|
| `inventory` | wallet, tutorial, inventory 스택, equipment 용량 |
| `weapons` | weaponInstances |
| `armor` | armorInstances |
| `market` | myListings, market 규칙 |
| `full` | 위 전체 (하위 호환) |

**사용처**

- 인벤토리: inventory + weapons + armor 병렬
- 강화: inventory + weapons
- 거래소 판매: inventory + weapons + market
- 거래소 내 매물: market
- P2P 거래: inventory + weapons + armor

## 캐시 TTL (`API_CACHE_TTL`)

| 키 | TTL |
|----|-----|
| bootstrap | 15s |
| meState* | 12~15s |
| raidsList / dungeonsList | 120s |
| towerLeaderboard | 60s |

## 여전히 무거운 API (참고)

| API | 비고 |
|-----|------|
| `GET /api/minions/panel` | 미니언 탭 진입 시만 |
| `GET /api/me/state?scope=full` | 탭별 scope 사용 권장 |
| dev 첫 컴파일 | prod와 무관 |
