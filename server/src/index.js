import 'dotenv/config';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import { signToken, requireAuth } from './auth.js';
import { createPool } from './db.js';
import { getKoreanMarketStatus, getKoreanPriceRefreshStatus } from './marketTime.js';
import { createPriceProvider } from './priceProviders/index.js';
import { createMemoryStore } from './stores/memoryStore.js';
import { createMysqlStore } from './stores/mysqlStore.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const host = process.env.API_HOST || '127.0.0.1';
const isProduction = process.env.NODE_ENV === 'production';
const allowAfterHoursTrading = process.env.ALLOW_AFTER_HOURS_TRADING === 'true';
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';
const priceRefreshIntervalMinutes = 15;
const serverStartedAt = new Date();
const maxLoginFailures = 5;
const loginLockMinutes = 2;
const loginFailures = new Map();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nicknamePattern = /^[\p{L}\p{N} ]{2,12}$/u;
const adminEmails = new Set(
  String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

function validateRuntimeConfig() {
  if (!isProduction) return;

  if (!process.env.JWT_SECRET || jwtSecret === 'dev-secret-change-me') {
    throw new Error('JWT_SECRET must be set to a strong value in production.');
  }

  if (process.env.DATA_STORE === 'memory') {
    throw new Error('DATA_STORE=memory is not allowed in production.');
  }
}

validateRuntimeConfig();
app.set('trust proxy', isProduction ? 1 : false);

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  }),
);
app.use(express.json());

async function buildStore() {
  if (process.env.DATA_STORE === 'memory') {
    console.log('Using in-memory data store.');
    return createMemoryStore();
  }

  try {
    const pool = createPool();
    await pool.query('SELECT 1');
    console.log('Connected to MySQL.');
    return createMysqlStore(pool);
  } catch (error) {
    if (isProduction) {
      throw new Error(`MySQL is required in production: ${error.message}`);
    }

    console.warn(`MySQL unavailable, falling back to memory store: ${error.message}`);
    return createMemoryStore();
  }
}

const store = await buildStore();
const priceProvider = createPriceProvider();
console.log(`Using ${priceProvider.name} price provider.`);
const supportedStocks = await priceProvider.getSupportedStocks();
await store.ensureStockPrices(supportedStocks);

const priceRefreshStatus = {
  provider: priceProvider.name,
  intervalMinutes: priceRefreshIntervalMinutes,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: null,
  lastSkippedAt: null,
  skipReason: null,
  successfulCount: 0,
  failedCount: 0,
  failedStocks: [],
};
const priceRefreshLogs = [];

function addPriceRefreshLog(entry) {
  priceRefreshLogs.unshift({
    id: `${Date.now()}-${priceRefreshLogs.length}`,
    provider: priceProvider.name,
    createdAt: new Date().toISOString(),
    ...entry,
  });
  priceRefreshLogs.splice(20);
}

async function refreshPrices() {
  let currentStocks = [];
  const refreshWindow = getKoreanPriceRefreshStatus();

  if (!refreshWindow.canRefresh) {
    priceRefreshStatus.lastSkippedAt = new Date().toISOString();
    priceRefreshStatus.skipReason = refreshWindow.label;
    console.log(`Stock price refresh skipped: ${refreshWindow.label} (${refreshWindow.windowLabel})`);
    addPriceRefreshLog({
      status: 'skipped',
      successfulCount: 0,
      failedCount: 0,
      failedStocks: [],
      message: `${refreshWindow.label}: ${refreshWindow.windowLabel}`,
    });
    return;
  }

  try {
    currentStocks = await store.getStocks();
    const latestPrices = await priceProvider.getLatestPrices(currentStocks);
    await store.refreshStockPrices(latestPrices);
    const userIds = await store.getAllUserIds();
    await Promise.all(userIds.map((userId) => recordAssetSnapshot(userId)));
    const stats = priceProvider.getLastStats?.() || {};
    priceRefreshStatus.lastSuccessAt = new Date().toISOString();
    priceRefreshStatus.successfulCount = Number(stats.successfulCount || latestPrices.length);
    priceRefreshStatus.failedCount = Number(stats.failedCount || 0);
    priceRefreshStatus.failedStocks = stats.failedStocks || [];
    priceRefreshStatus.lastSkippedAt = null;
    priceRefreshStatus.skipReason = null;
    priceRefreshStatus.lastError = priceRefreshStatus.failedCount
      ? `${priceRefreshStatus.failedCount}개 종목은 이전 가격을 유지했습니다.`
      : null;
    console.log(
      `Stock prices refreshed by ${priceProvider.name} provider. ` +
        `success=${priceRefreshStatus.successfulCount}, failed=${priceRefreshStatus.failedCount}`,
    );
    addPriceRefreshLog({
      status: priceRefreshStatus.failedCount ? 'partial' : 'success',
      successfulCount: priceRefreshStatus.successfulCount,
      failedCount: priceRefreshStatus.failedCount,
      failedStocks: priceRefreshStatus.failedStocks,
      message: priceRefreshStatus.lastError || '가격 갱신이 정상 완료되었습니다.',
    });
  } catch (error) {
    priceRefreshStatus.lastFailureAt = new Date().toISOString();
    priceRefreshStatus.lastError = error.message;
    console.error(`Failed to refresh stock prices: ${error.message}`);
    addPriceRefreshLog({
      status: 'failed',
      successfulCount: 0,
      failedCount: currentStocks?.length || 0,
      failedStocks: [],
      message: error.message,
    });
  }
}

setInterval(refreshPrices, priceRefreshIntervalMinutes * 60 * 1000);
setTimeout(refreshPrices, 1000);

function getMarketStatusForClient() {
  const status = getKoreanMarketStatus();

  return {
    ...status,
    canTrade: allowAfterHoursTrading || status.isOpen,
    label: allowAfterHoursTrading ? '개발 거래 가능' : status.label,
  };
}

function getPriceRefreshStatusForClient(priceUpdatedAt = null) {
  const refreshWindow = getKoreanPriceRefreshStatus();

  return {
    ...priceRefreshStatus,
    priceUpdatedAt,
    canRefreshNow: refreshWindow.canRefresh,
    refreshWindowLabel: refreshWindow.windowLabel,
    refreshWindowStatusLabel: refreshWindow.label,
  };
}

function isAdminUser(user) {
  return adminEmails.has(String(user?.email || '').toLowerCase());
}

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    cashBalance: Number(user.cash_balance),
    createdAt: user.created_at,
  };
}

function getLoginLock(email) {
  const record = loginFailures.get(email);

  if (!record?.lockedUntil) return null;

  if (record.lockedUntil <= Date.now()) {
    loginFailures.delete(email);
    return null;
  }

  const remainingSeconds = Math.ceil((record.lockedUntil - Date.now()) / 1000);
  return {
    remainingSeconds,
    remainingMinutes: Math.ceil(remainingSeconds / 60),
  };
}

function recordLoginFailure(email) {
  const current = loginFailures.get(email) || { count: 0, lockedUntil: null };
  const nextCount = current.count + 1;
  const nextRecord = {
    count: nextCount,
    lockedUntil: nextCount >= maxLoginFailures ? Date.now() + loginLockMinutes * 60 * 1000 : null,
  };

  loginFailures.set(email, nextRecord);
  return nextRecord;
}

function clearLoginFailures(email) {
  loginFailures.delete(email);
}

function requireTradingOpen(req, res, next) {
  const status = getKoreanMarketStatus();

  if (!allowAfterHoursTrading && !status.isOpen) {
    return res.status(403).json({
      message: '현재는 거래 시간이 아닙니다. 평일 09:00 ~ 15:30에만 거래할 수 있습니다.',
      marketStatus: status,
    });
  }

  return next();
}

function getOptionalUserId(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return null;

  try {
    return jwt.verify(token, jwtSecret).sub;
  } catch {
    return null;
  }
}

async function requireActiveUser(req, res, next) {
  try {
    const user = await store.findUserById(req.user.sub);

    if (!user) {
      return res.status(401).json({ message: '계정 정보를 찾을 수 없습니다. 다시 로그인해 주세요.' });
    }

    req.activeUser = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAdmin(req, res, next) {
  if (adminEmails.size === 0) {
    return res.status(403).json({ message: '관리자 이메일이 설정되어 있지 않습니다.' });
  }

  if (!isAdminUser(req.activeUser)) {
    return res.status(403).json({ message: '관리자만 접근할 수 있습니다.' });
  }

  return next();
}

async function parseTradeBody(req, res) {
  const stockCode = String(req.body.stockCode || '').trim();
  const quantity = Number(req.body.quantity);
  const stock = await store.findStockByCode(stockCode);

  if (!stock) {
    res.status(404).json({ message: '지원하지 않는 종목입니다.' });
    return null;
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    res.status(400).json({ message: '수량은 1 이상의 정수여야 합니다.' });
    return null;
  }

  return { stock, quantity };
}

async function enrichPortfolio(portfolio) {
  if (!portfolio?.user) {
    const error = new Error('AUTH_USER_NOT_FOUND');
    error.status = 401;
    error.publicMessage = '계정 정보를 찾을 수 없습니다. 다시 로그인해 주세요.';
    throw error;
  }

  const stocks = await store.getStocks();
  const priceMap = new Map(stocks.map((stock) => [stock.code, stock.price]));

  const holdings = portfolio.holdings.map((holding) => {
    const currentPrice = priceMap.get(holding.stock_code) || 0;
    const quantity = Number(holding.quantity);
    const avgPrice = Number(holding.avg_price);
    const valuation = currentPrice * quantity;
    const profitLoss = valuation - avgPrice * quantity;

    return {
      id: holding.id,
      stockCode: holding.stock_code,
      stockName: holding.stock_name,
      quantity,
      avgPrice,
      currentPrice,
      valuation,
      profitLoss,
      profitLossRate: avgPrice ? (profitLoss / (avgPrice * quantity)) * 100 : 0,
    };
  });

  const cashBalance = Number(portfolio.user.cash_balance);
  const stockValue = holdings.reduce((sum, holding) => sum + holding.valuation, 0);
  const totalAsset = cashBalance + stockValue;
  const priceUpdatedAt = stocks.reduce((latest, stock) => {
    const fetchedAt = stock.fetchedAt ? new Date(stock.fetchedAt) : null;
    return fetchedAt && (!latest || fetchedAt > latest) ? fetchedAt : latest;
  }, null);

  const result = {
    user: toPublicUser(portfolio.user),
    summary: {
      cashBalance,
      stockValue,
      totalAsset,
      returnRate: ((totalAsset - 100000000) / 100000000) * 100,
    },
    holdings,
    marketStatus: getMarketStatusForClient(),
    priceUpdatedAt,
    isAdmin: isAdminUser(portfolio.user),
  };

  return {
    ...result,
    priceRefresh: getPriceRefreshStatusForClient(result.priceUpdatedAt),
  };
}

async function recordAssetSnapshot(userId, portfolio = null) {
  const enriched = await enrichPortfolio(portfolio || (await store.getPortfolio(userId)));
  await store.recordAssetHistory({
    userId,
    cashBalance: enriched.summary.cashBalance,
    stockValue: enriched.summary.stockValue,
    totalAsset: enriched.summary.totalAsset,
    returnRate: enriched.summary.returnRate,
  });
  return enriched;
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    marketStatus: getMarketStatusForClient(),
    priceRefresh: getPriceRefreshStatusForClient(),
  });
});

app.post('/auth/register', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const nickname = String(req.body.nickname || '').trim();
    const password = String(req.body.password || '');

    if (!email || email.length > 255 || !emailPattern.test(email)) {
      return res.status(400).json({ message: '올바른 이메일 주소를 입력해 주세요.' });
    }

    if (!nickname) {
      return res.status(400).json({ message: '닉네임을 입력해 주세요.' });
    }

    if (!nicknamePattern.test(nickname)) {
      return res.status(400).json({
        message: '닉네임은 한글, 영문, 숫자, 띄어쓰기만 사용해 2~12자로 입력해 주세요.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: '비밀번호는 8자 이상으로 입력해 주세요.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await store.createUser({ email, passwordHash, nickname });
    await recordAssetSnapshot(user.id);

    return res.status(201).json({
      token: signToken(user),
      user: toPublicUser(user),
    });
  } catch (error) {
    if (['EMAIL_EXISTS', 'NICKNAME_EXISTS', 'USER_EXISTS'].includes(error.message)) {
      return res.status(409).json({ message: '이미 사용 중인 이메일 또는 닉네임입니다.' });
    }
    return next(error);
  }
});

app.post('/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const lock = getLoginLock(email);

    if (lock) {
      return res.status(429).json({
        message: `로그인 시도가 일시적으로 제한되었습니다. 약 ${lock.remainingMinutes}분 후 다시 시도해 주세요.`,
        remainingSeconds: lock.remainingSeconds,
      });
    }

    const user = await store.findUserByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      const failure = recordLoginFailure(email);
      const remainingAttempts = Math.max(maxLoginFailures - failure.count, 0);

      if (failure.lockedUntil) {
        return res.status(429).json({
          message: `비밀번호를 ${maxLoginFailures}회 틀려 2분 동안 로그인이 제한됩니다.`,
          remainingSeconds: loginLockMinutes * 60,
        });
      }

      return res.status(401).json({
        message: `이메일 또는 비밀번호가 올바르지 않습니다. 남은 시도 ${remainingAttempts}회`,
      });
    }

    clearLoginFailures(email);

    return res.json({
      token: signToken(user),
      user: toPublicUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

app.delete('/auth/me', requireAuth, requireActiveUser, async (req, res, next) => {
  try {
    const password = String(req.body.password || '');

    if (!password) {
      return res.status(400).json({ message: '비밀번호를 입력해 주세요.' });
    }

    if (!(await bcrypt.compare(password, req.activeUser.password_hash))) {
      return res.status(401).json({ message: '비밀번호가 올바르지 않습니다.' });
    }

    await store.deleteUser(req.activeUser.id);
    return res.json({ message: '회원탈퇴가 완료되었습니다.' });
  } catch (error) {
    return next(error);
  }
});

app.patch('/auth/password', requireAuth, requireActiveUser, async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');

    if (!currentPassword || newPassword.length < 8) {
      return res.status(400).json({ message: '현재 비밀번호와 8자 이상의 새 비밀번호를 입력해 주세요.' });
    }

    if (!(await bcrypt.compare(currentPassword, req.activeUser.password_hash))) {
      return res.status(401).json({ message: '현재 비밀번호가 올바르지 않습니다.' });
    }

    if (await bcrypt.compare(newPassword, req.activeUser.password_hash)) {
      return res.status(400).json({ message: '새 비밀번호는 현재 비밀번호와 달라야 합니다.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await store.updateUserPassword(req.activeUser.id, passwordHash);
    return res.json({ message: '비밀번호가 변경되었습니다.' });
  } catch (error) {
    return next(error);
  }
});

app.get('/stocks', async (req, res, next) => {
  try {
    const keyword = String(req.query.q || '').trim().toLowerCase();
    const allStocks = await store.getStocks();
    const stocks = keyword
      ? allStocks.filter(
          (stock) =>
            stock.code.includes(keyword) ||
            stock.name.toLowerCase().includes(keyword) ||
            stock.sector.toLowerCase().includes(keyword),
        )
      : allStocks;

    res.json({
      stocks,
      marketStatus: getMarketStatusForClient(),
      priceRefresh: getPriceRefreshStatusForClient(
        allStocks.reduce((latest, stock) => {
          const fetchedAt = stock.fetchedAt ? new Date(stock.fetchedAt) : null;
          return fetchedAt && (!latest || fetchedAt > latest) ? fetchedAt : latest;
        }, null),
      ),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/stocks/:code/history', async (req, res, next) => {
  try {
    const code = String(req.params.code || '').trim();
    const period = String(req.query.period || '1M').trim();
    const stock = await store.findStockByCode(code);

    if (!stock) {
      return res.status(404).json({ message: '지원하지 않는 종목입니다.' });
    }

    const history = await store.getStockPriceHistory(code, period);
    return res.json({ stock, period, history });
  } catch (error) {
    return next(error);
  }
});

app.get('/portfolio', requireAuth, requireActiveUser, async (req, res, next) => {
  try {
    const portfolio = await store.getPortfolio(req.user.sub);
    return res.json(await enrichPortfolio(portfolio));
  } catch (error) {
    return next(error);
  }
});

app.post('/trade/buy', requireAuth, requireActiveUser, requireTradingOpen, async (req, res, next) => {
  try {
    const parsed = await parseTradeBody(req, res);
    if (!parsed) return;

    const portfolio = await store.buyStock({
      userId: req.user.sub,
      stock: parsed.stock,
      quantity: parsed.quantity,
    });

    return res.json(await recordAssetSnapshot(req.user.sub, portfolio));
  } catch (error) {
    if (error.message === 'INSUFFICIENT_CASH') {
      return res.status(400).json({ message: '현금이 부족합니다.' });
    }
    return next(error);
  }
});

app.post('/trade/sell', requireAuth, requireActiveUser, requireTradingOpen, async (req, res, next) => {
  try {
    const parsed = await parseTradeBody(req, res);
    if (!parsed) return;

    const portfolio = await store.sellStock({
      userId: req.user.sub,
      stock: parsed.stock,
      quantity: parsed.quantity,
    });

    return res.json(await recordAssetSnapshot(req.user.sub, portfolio));
  } catch (error) {
    if (error.message === 'INSUFFICIENT_STOCK') {
      return res.status(400).json({ message: '보유 수량이 부족합니다.' });
    }
    return next(error);
  }
});

app.get('/ranking', async (req, res, next) => {
  try {
    const sort = req.query.sort === 'return' ? 'return' : 'asset';
    const meUserId = getOptionalUserId(req);
    const stocks = await store.getStocks();
    const priceMap = new Map(stocks.map((stock) => [stock.code, stock.price]));
    const allRanking = await store.getRanking(priceMap);
    const sortedRanking = [...allRanking].sort((a, b) => {
      if (sort === 'return') {
        return b.returnRate - a.returnRate || b.totalAsset - a.totalAsset;
      }
      return b.totalAsset - a.totalAsset || b.returnRate - a.returnRate;
    });
    const ranked = sortedRanking.map((item, index) => ({
      rank: index + 1,
      ...item,
    }));
    const me = meUserId ? ranked.find((item) => Number(item.userId) === Number(meUserId)) || null : null;

    return res.json({
      sort,
      ranking: ranked.slice(0, 10),
      me,
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/trades', requireAuth, requireActiveUser, async (req, res, next) => {
  try {
    const trades = await store.getTrades(req.user.sub);
    return res.json({ trades });
  } catch (error) {
    return next(error);
  }
});

app.get('/asset-history', requireAuth, requireActiveUser, async (req, res, next) => {
  try {
    let history = await store.getAssetHistory(req.user.sub);

    if (history.length === 0) {
      await recordAssetSnapshot(req.user.sub);
      history = await store.getAssetHistory(req.user.sub);
    }

    return res.json({ history });
  } catch (error) {
    return next(error);
  }
});

app.get('/admin/status', requireAuth, requireActiveUser, requireAdmin, async (req, res, next) => {
  try {
    const stats = await store.getAdminStats();
    const stocks = await store.getStocks();
    const priceMap = new Map(stocks.map((stock) => [stock.code, stock.price]));
    const [recentTrades, users] = await Promise.all([
      store.getAdminRecentTrades(30),
      store.getAdminUsers(priceMap, 50),
    ]);

    return res.json({
      stats,
      recentTrades,
      users,
      priceRefresh: getPriceRefreshStatusForClient(),
      priceRefreshLogs,
      marketStatus: getMarketStatusForClient(),
      server: {
        environment: process.env.NODE_ENV || 'development',
        startedAt: serverStartedAt,
        uptimeSeconds: Math.floor(process.uptime()),
      },
    });
  } catch (error) {
    return next(error);
  }
});

app.use((error, req, res, next) => {
  if (error.status) {
    return res.status(error.status).json({ message: error.publicMessage || error.message });
  }

  console.error(error);
  res.status(500).json({ message: '서버 오류가 발생했습니다.' });
});

app.listen(port, host, () => {
  console.log(`API server listening on http://${host}:${port}`);
});
