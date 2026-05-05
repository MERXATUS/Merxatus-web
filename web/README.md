## 개요
이 폴더(`web/`)는 **Next.js(App Router) + Prisma + SQLite**로 만든 웹 게임 프로토타입입니다.

- **작업장 수령(정산 버튼)**: 60초 틱 × 미니언 수만큼 확률 테이블 굴려 인벤 지급
- **고정가 즉시구매**: 판매 수수료 10% (트랜잭션 처리)
- **경매 입찰**: 최고입찰 금액 잠금 + 종료 60초 이내 최고입찰 갱신 시 +5분 연장

## 실행(로컬)

처음 한 번 DB 마이그레이션/클라이언트 생성:

```bash
npx prisma migrate dev
npx prisma generate
```

개발 서버 실행:

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 열면 됩니다.

## 개발용 시드(테스트 데이터)
DB에 테스트 유저/아이템/작업장/매물을 넣는 엔드포인트가 있습니다.

```bash
curl -X POST http://localhost:3000/api/dev/seed
```

응답에 `userId`, `workshopId`, `listingId`들이 나오며, 아래 API 테스트에 사용합니다.

## API(최소 뼈대)
- `POST /api/workshops/collect` body: `{ "workshopId": "...", "userId": "..." }`
- `POST /api/market/buy` body: `{ "listingId": "...", "buyerId": "..." }`
- `POST /api/market/bid` body: `{ "listingId": "...", "bidderId": "...", "amount": 123 }`

## 참고
- DB 연결은 `.env`의 `DATABASE_URL="file:./dev.db"`를 사용합니다.
- 이후 배포 전에는 SQLite → Postgres로 교체하는 걸 권장합니다.
