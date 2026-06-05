# 운영 체크리스트

이 문서는 `anttradersim.com` 운영 서버에서 자주 쓰는 점검/배포/복구 명령어 모음입니다.

## 서버 접속

```bash
ssh root@49.50.138.106
cd /var/www/stock-game
```

## 배포

```bash
cd /var/www/stock-game
git pull
npm run build:prod
pm2 restart stock-ranking-api --update-env
systemctl reload nginx
```

배포 후 확인:

```bash
curl https://anttradersim.com/health
pm2 status
```

## 서버 상태 점검

```bash
curl https://anttradersim.com/health
pm2 status
systemctl status nginx --no-pager
systemctl status mysql --no-pager
ss -ltnp
```

정상 기대값:

- `https://anttradersim.com/health`가 `{"ok":true,...}`를 반환
- PM2 `stock-ranking-api` 상태가 `online`
- Nginx 상태가 `active (running)`
- MySQL 상태가 `active (running)`
- API 포트 `4000`은 `127.0.0.1:4000`으로만 열림
- MySQL은 `127.0.0.1:3306`으로만 열림

## 로그 확인

API 로그:

```bash
pm2 logs stock-ranking-api --lines 120 --nostream
```

Nginx 로그:

```bash
tail -n 120 /var/log/nginx/error.log
tail -n 120 /var/log/nginx/access.log
```

가격 갱신 상태:

```bash
curl https://anttradersim.com/health
pm2 logs stock-ranking-api --lines 300 --nostream | grep "Stock prices refreshed"
pm2 logs stock-ranking-api --lines 300 --nostream | grep "KIS price fetch failed"
```

## 서비스 재시작

API만 재시작:

```bash
pm2 restart stock-ranking-api --update-env
```

Nginx 설정 반영:

```bash
nginx -t
systemctl reload nginx
```

서버 재부팅 후 확인:

```bash
pm2 status
curl https://anttradersim.com/health
systemctl status nginx --no-pager
systemctl status mysql --no-pager
```

## 데이터베이스 점검

테이블 확인:

```bash
mysql -u stock_game_user -p stock_game -e "SHOW TABLES;"
```

유저/거래/보유 종목 수 확인:

```bash
sudo mysql -e "USE stock_game; SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS trades FROM trades; SELECT COUNT(*) AS holdings FROM holdings;"
```

최근 가입 유저 확인:

```bash
sudo mysql -e "USE stock_game; SELECT id, email, nickname, created_at FROM users ORDER BY id DESC LIMIT 10;"
```

## 백업

수동 백업 실행:

```bash
/usr/local/bin/backup-stock-game-db.sh
ls -lh /var/backups/stock-game
```

크론 등록 확인:

```bash
crontab -l
```

기대 등록값:

```cron
0 4 * * * /usr/local/bin/backup-stock-game-db.sh
```

## 복구 테스트

복구 테스트 DB 생성:

```bash
sudo mysql -e "DROP DATABASE IF EXISTS stock_game_restore_test; CREATE DATABASE stock_game_restore_test DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;"
```

백업 파일 복원:

```bash
sudo mysql stock_game_restore_test < /var/backups/stock-game/백업파일명.sql
```

복원 확인:

```bash
sudo mysql -e "USE stock_game_restore_test; SHOW TABLES;"
```

테스트 DB 삭제:

```bash
sudo mysql -e "DROP DATABASE IF EXISTS stock_game_restore_test;"
```

## 보안 점검

환경변수 파일 권한:

```bash
ls -l /var/www/stock-game/.env
```

기대값:

```text
-rw------- root root ...
```

MySQL 외부 노출 확인:

```bash
sudo mysql -e "SHOW VARIABLES LIKE 'bind_address';"
ss -ltnp | grep 3306
```

기대값:

- `bind_address`가 `127.0.0.1`
- `3306`이 `127.0.0.1:3306`으로만 열림

API 포트 외부 노출 확인:

```bash
ss -ltnp | grep 4000
```

기대값:

- `127.0.0.1:4000`

Naver Cloud ACG 확인:

- `80` 공개
- `443` 공개
- `22`는 내 접속 IP만 허용
- `4000`, `3306`은 외부 공개하지 않음

## 핵심 기능 점검

브라우저에서 확인:

- `https://anttradersim.com`
- 회원가입
- 로그인
- 로그인 직후 공지 표시
- 공지 오늘 하루 보지 않기
- 비밀번호 변경
- 회원탈퇴
- 포트폴리오 조회
- 종목 검색
- 차트 표시
- 거래내역 필터
- 보유 종목 정렬
- 랭킹 기준 전환
- 어드민 콘솔
- 어드민 공지 작성/수정/숨기기/삭제
- 어드민 유저 상세 보기

거래 기능은 평일 `09:00 ~ 15:30`에만 실제 매수/매도가 가능합니다.

## 장애 시 빠른 확인 순서

1. 사이트 접속 확인

```bash
curl -I https://anttradersim.com
curl https://anttradersim.com/health
```

2. API 상태 확인

```bash
pm2 status
pm2 logs stock-ranking-api --lines 120 --nostream
```

3. Nginx 상태 확인

```bash
nginx -t
systemctl status nginx --no-pager
tail -n 120 /var/log/nginx/error.log
```

4. MySQL 상태 확인

```bash
systemctl status mysql --no-pager
sudo mysql -e "USE stock_game; SHOW TABLES;"
```

5. 최근 배포 되돌림이 필요할 때

```bash
cd /var/www/stock-game
git log --oneline -5
```

되돌릴 커밋을 확인한 뒤에는 신중하게 별도 판단 후 진행합니다.

## 자주 쓰는 한 줄 명령어

전체 상태 빠른 확인:

```bash
curl https://anttradersim.com/health && pm2 status && systemctl is-active nginx && systemctl is-active mysql
```

최근 API 로그:

```bash
pm2 logs stock-ranking-api --lines 80 --nostream
```

배포:

```bash
cd /var/www/stock-game && git pull && npm run build:prod && pm2 restart stock-ranking-api --update-env && systemctl reload nginx
```
