import 'dotenv/config';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import { signToken, requireAuth } from './auth.js';
import { createPool } from './db.js';
import { getKoreanMarketStatus } from './marketTime.js';
import { createPriceProvider } from './priceProviders/index.js';
import { createMemoryStore } from './stores/memoryStore.js';
import { createMysqlStore } from './stores/mysqlStore.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const isProduction = process.env.NODE_ENV === 'production';
const allowAfterHoursTrading = process.env.ALLOW_AFTER_HOURS_TRADING === 'true';
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';
const priceRefreshIntervalMinutes = 15;

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
  successfulCount: 0,
  failedCount: 0,
  failedStocks: [],
};

async function refreshPrices() {
  try {
    const currentStocks = await store.getStocks();
    const latestPrices = await priceProvider.getLatestPrices(currentStocks);
    await store.refreshStockPrices(latestPrices);
    const userIds = await store.getAllUserIds();
    await Promise.all(userIds.map((userId) => recordAssetSnapshot(userId)));
    const stats = priceProvider.getLastStats?.() || {};
    priceRefreshStatus.lastSuccessAt = new Date().toISOString();
    priceRefreshStatus.successfulCount = Number(stats.successfulCount || latestPrices.length);
    priceRefreshStatus.failedCount = Number(stats.failedCount || 0);
    priceRefreshStatus.failedStocks = stats.failedStocks || [];
    priceRefreshStatus.lastError = priceRefreshStatus.failedCount
      ? `${priceRefreshStatus.failedCount}개 종목은 이전 가격을 유지했습니다.`
      : null;
    console.log(
      `Stock prices refreshed by ${priceProvider.name} provider. ` +
        `success=${priceRefreshStatus.successfulCount}, failed=${priceRefreshStatus.failedCount}`,
    );
  } catch (error) {
    priceRefreshStatus.lastFailureAt = new Date().toISOString();
    priceRefreshStatus.lastError = error.message;
    console.error(`Failed to refresh stock prices: ${error.message}`);
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
  return {
    ...priceRefreshStatus,
    priceUpdatedAt,
  };
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

    if (!email || !nickname || password.length < 6) {
      return res.status(400).json({ message: '이메일, 닉네임, 6자 이상 비밀번호가 필요합니다.' });
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
    const user = await store.findUserByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    return res.json({
      token: signToken(user),
      user: toPublicUser(user),
    });
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

app.get('/portfolio', requireAuth, async (req, res, next) => {
  try {
    const portfolio = await store.getPortfolio(req.user.sub);
    return res.json(await enrichPortfolio(portfolio));
  } catch (error) {
    return next(error);
  }
});

app.post('/trade/buy', requireAuth, requireTradingOpen, async (req, res, next) => {
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

app.post('/trade/sell', requireAuth, requireTradingOpen, async (req, res, next) => {
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

app.get('/trades', requireAuth, async (req, res, next) => {
  try {
    const trades = await store.getTrades(req.user.sub);
    return res.json({ trades });
  } catch (error) {
    return next(error);
  }
});

app.get('/asset-history', requireAuth, async (req, res, next) => {
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

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: '서버 오류가 발생했습니다.' });
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
