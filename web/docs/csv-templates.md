## CSV 템플릿(고정 규격)

이 문서의 CSV 3종을 “유일한 기준 데이터”로 두고, CSV → (변환) → `/api/admin/apply`로 DB 동기화하는 방식을 추천합니다.

파일 위치 (`web/data/csv-templates/`):
- `items.csv` · `workshop_drops.csv` · `recipes.csv` · `Merxatus-Price.csv` (황실)
- **미니언**: `minion_tickets.csv` · `minion_jobs.csv`

---

## 1) `items.csv` (아이템 마스터)

헤더(필수):
- `id`: 예) `item_stone` (고유, 변경 금지 권장)
- `name`: 예) `돌`
- `category`: 예) `재료` / `음식` / `무기` 등 (문자열)
- `tradable`: `true` 또는 `false`
- `grade`: 1~8 (숫자). 비워두면 코드 기본값으로 보정 가능하지만, CSV에서는 채우는 걸 권장

---

## 2) `workshop_drops.csv` (작업장 드랍 테이블)

헤더(필수):
- `workshopId`: 예) `workshop_mine` (관리용 ID)
- `workshopName`: 예) `광산` (DB의 `WorkshopType.name` 기준 키)
- `itemId`: 예) `item_stone`
- `weight`: 0 이상 정수 (가중치)
- `minQty`: 1 이상 정수
- `maxQty`: 1 이상 정수
- `minTier`: 1~5 정수 (해당 티어부터 드랍)

규칙:
- 같은 `workshopName` + `minTier` 안에서 `weight`는 “비율”입니다(합이 100일 필요는 없음).

---

## 3) `recipes.csv` (가공/제작)

헤더(필수):
- `workshopName`: 예) `대장간` / `제련소`
- `recipeName`: 레시피 이름(같은 작업장 내에서 고유 권장)
- `minTier`: 1~5 정수
- `craftTimeSeconds`: 1~86400 정수
- `inputs`: 문자열(파이프 `|`로 여러 입력)  
  - 형식: `itemId:qty|itemId:qty|...`
  - 예: `item_stone:1|item_wood:1`
- `outputs`: 문자열(선택)  
  - 형식(확정 출력): `itemId:min-max|itemId:min-max|...`
  - 형식(가중치 출력): `itemId:min-max@weight|itemId:min-max@weight|...`
  - 예(확정): `item_sword:1-1`
  - 예(가중치): `item_a:1-1@80|item_b:1-1@20`
  - (가공/제작 결과물)

---

## 엑셀/CSV 저장 팁

- 인코딩은 UTF-8 권장
- `inputs`, `outputs`는 콤마가 들어갈 수 있으니 엑셀에서 저장하면 자동으로 따옴표가 붙습니다(정상)
- 줄 맨 앞 `#` 은 주석(검증 스크립트에서 무시)

---

## 4) 미니언 CSV (고용권 · 직업)

런타임은 `minion_tickets.csv`와 `minion_jobs.csv`만 읽습니다. 고용 시 후보 직업을 롤하고, 플레이어가 1명을 선택해 Lv1 미니언을 생성합니다.

### 작업 순서

1. `web/data/csv-templates/` 아래 2개 파일 편집
2. 검증: `cd web` 후 `npm run validate:minion-csv`
3. 고용권 아이템은 **`items.csv` / `items.json`에도 동일 `id` 등록**
4. DB 반영: `POST /api/admin/apply` 또는 `POST /api/dev/seed`

### `minion_tickets.csv` — 고용권

| 컬럼 | 설명 |
|------|------|
| `ItemID` | `items.csv`의 `id`와 동일 (예: `item_minion_ticket`) |
| `Name` | 표시 이름 |
| `Pick` | 고용 시 제시할 후보 직업 수 (기본 3) |

인벤에서 사용 시 **수집(GATHER) / 던전(DUNGEON)** 카테고리를 선택한 뒤, 후보 중 직업 1명을 확정합니다.

### `minion_jobs.csv` — 직업 풀

| 컬럼 | 설명 |
|------|------|
| `JobId` | Prisma `MinionJobType` (예: `MINER`, `WARRIOR`) |
| `LabelKo` | UI 표시명 |
| `Category` | `GATHER` \| `DUNGEON` |
| `Enabled` | `true` \| `false` — 후보 롤에 포함 여부 |
| `WorkshopName` | (수집) 특화 작업장 이름. 비우면 미사용 |
| `Notes` | 메모 (게임 로직 무시) |

---

## 납품소/2차 소모처(골드 보상) 관련

이 프로젝트에서는 **납품소(2차 소모처) 시스템을 제거**했습니다.
- `recipes.csv`에 `kind`, `rewardGold` 컬럼은 사용하지 않습니다.
- DB에는 과거 호환을 위해 `rewardGold` 컬럼이 남아있을 수 있지만, 적용 시 항상 0으로 고정됩니다.

