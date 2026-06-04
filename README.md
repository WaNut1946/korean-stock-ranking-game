# 한국 주식 모의투자 랭킹 게임

가상 현금 1억 원으로 한국 주식을 사고팔고, 총자산 기준 TOP 10 랭킹을 보는 React + Express + MySQL 프로젝트입니다.

## 실행

```bash
npm install
copy .env.example .env
npm run dev
```

프론트엔드: `http://localhost:5173`  
백엔드 API: `http://localhost:4000`

## MySQL 설정

MySQL을 사용할 경우 `server/schema.sql`을 먼저 실행한 뒤 `.env`의 DB 정보를 맞춰 주세요.

```bash
mysql -u root -p < server/schema.sql
```

MySQL이 아직 준비되지 않았거나 `.env`에 `DATA_STORE=memory`를 설정하면 서버가 메모리 저장소로 동작합니다. 메모리 모드는 서버 재시작 시 데이터가 초기화됩니다.

## 거래 시간

기본 규칙은 한국 시간 기준 평일 `09:00 ~ 15:30`에만 매수/매도가 가능하고, 그 외 시간에는 조회만 가능합니다.

개발 중 거래 테스트가 필요하면 `.env`에 아래 값을 추가할 수 있습니다.

```env
ALLOW_AFTER_HOURS_TRADING=true
```

## 구현된 API

- `POST /auth/register`
- `POST /auth/login`
- `GET /stocks`
- `POST /trade/buy`
- `POST /trade/sell`
- `GET /portfolio`
- `GET /ranking`
- `GET /trades`

현재 지원 종목 목록은 Mock 데이터를 사용하고, 가격은 `stock_prices` 테이블에 저장된 값을 사용합니다. 서버는 15분마다 Mock 가격을 소폭 변동시켜 DB에 반영합니다.

가격 공급자는 `.env`의 `PRICE_PROVIDER`로 선택합니다. 현재는 `mock`만 지원합니다.

```env
PRICE_PROVIDER=mock
```

실제 한국 주가 API를 붙일 때는 `server/src/priceProviders` 아래에 새 provider를 추가하고, `getSupportedStocks`, `getLatestPrices`를 구현한 뒤 `PRICE_PROVIDER`로 선택하면 됩니다.
