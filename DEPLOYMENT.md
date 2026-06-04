# 배포 준비 문서

이 문서는 Ubuntu VPS 한 대에 React 정적 파일, Express API, MySQL을 올리는 기준입니다.

## 1. 서버 기본 준비

```bash
sudo apt update
sudo apt install -y curl git nginx mysql-server
```

Node.js LTS 설치:

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

PM2 설치:

```bash
sudo npm install -g pm2
```

## 2. 프로젝트 배치

예시 경로:

```bash
sudo mkdir -p /var/www/stock-game
sudo chown -R $USER:$USER /var/www/stock-game
cd /var/www/stock-game
```

GitHub를 쓰게 되면:

```bash
git clone <your-repository-url> .
npm ci
```

GitHub 없이 파일을 올린 경우에도 프로젝트 루트에서:

```bash
npm ci
```

## 3. 운영 환경변수

```bash
cp .env.production.example .env
nano .env
```

꼭 바꿀 값:

```env
NODE_ENV=production
CLIENT_ORIGIN=https://your-domain.com
VITE_API_URL=https://your-domain.com
JWT_SECRET=긴_랜덤_문자열
DB_USER=stock_game_user
DB_PASSWORD=강한_DB_비밀번호
DATA_STORE=mysql
PRICE_PROVIDER=mock
```

운영 환경에서는 `JWT_SECRET`이 비어 있거나 `DATA_STORE=memory`이면 서버가 시작되지 않게 해두었습니다. 실제 배포 서버에서는 반드시 MySQL을 연결합니다.

## 4. MySQL 설정

MySQL 접속:

```bash
sudo mysql
```

DB와 유저 생성:

```sql
CREATE DATABASE IF NOT EXISTS stock_game
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'stock_game_user'@'localhost'
  IDENTIFIED BY '강한_DB_비밀번호';

GRANT ALL PRIVILEGES ON stock_game.* TO 'stock_game_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

스키마 생성:

```bash
sudo mysql < server/schema.sql
```

## 5. 프론트 빌드

```bash
npm run build:prod
```

결과물은 `dist/`에 생성됩니다.

## 6. API 서버 실행

PM2로 실행:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

상태 확인:

```bash
pm2 status
pm2 logs stock-ranking-api
curl http://127.0.0.1:4000/health
```

## 7. Nginx 설정

Nginx 설정 파일 복사:

```bash
sudo cp deploy/nginx.stock-game.conf /etc/nginx/sites-available/stock-game
sudo nano /etc/nginx/sites-available/stock-game
```

`your-domain.com`을 실제 도메인으로 바꿉니다.

활성화:

```bash
sudo ln -s /etc/nginx/sites-available/stock-game /etc/nginx/sites-enabled/stock-game
sudo nginx -t
sudo systemctl reload nginx
```

## 8. HTTPS

도메인 DNS가 서버 IP를 바라보게 한 뒤:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

## 9. 배포 후 확인

```bash
curl https://your-domain.com/health
```

브라우저에서 확인:

```text
https://your-domain.com
```

체크리스트:

- 회원가입 가능
- 로그인 가능
- 종목 목록 표시
- 차트 표시
- 매수/매도 가능
- 거래 내역 표시
- 랭킹 표시
- PM2 재시작 후에도 서버 복구

## 10. 다음 단계

배포가 끝난 뒤 실제 주가 API를 붙일 때는 `server/src/priceProviders`에 새 provider를 추가하고 `.env`의 `PRICE_PROVIDER`를 변경합니다.

한국투자증권 KIS Developers를 사용할 때는 `.env`에 아래 값을 추가합니다.

```env
PRICE_PROVIDER=kis
KIS_BASE_URL=https://openapi.koreainvestment.com:9443
KIS_APP_KEY=한국투자증권_APP_KEY
KIS_APP_SECRET=한국투자증권_APP_SECRET
```

키를 바꾼 뒤에는 서버에서 아래 순서로 반영합니다.

```bash
pm2 restart stock-ranking-api --update-env
curl https://anttradersim.com/health
```
