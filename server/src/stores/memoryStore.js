const INITIAL_CASH = 100000000;

let nextUserId = 1;
let nextHoldingId = 1;
let nextTradeId = 1;

const users = [];
const holdings = [];
const trades = [];
const stockPrices = new Map();
const stockPriceHistory = new Map();
const assetHistory = [];
let nextAssetHistoryId = 1;

function normalizeStock(stock) {
  return {
    code: stock.code,
    name: stock.name,
    sector: stock.sector || '기타',
    price: Number(stock.price),
    priceChange: Number(stock.priceChange || stock.price_change || 0),
    changeRate: Number(stock.changeRate || stock.change_rate || 0),
    fetchedAt: stock.fetched_at || stock.fetchedAt || new Date(),
  };
}

function normalizeTrade(trade) {
  return {
    id: trade.id,
    userId: trade.user_id || trade.userId,
    userNickname: trade.nickname || trade.userNickname,
    userEmail: trade.email || trade.userEmail,
    stockCode: trade.stock_code,
    stockName: trade.stock_name,
    type: trade.type,
    quantity: Number(trade.quantity),
    price: Number(trade.price),
    totalAmount: Number(trade.total_amount),
    createdAt: trade.created_at,
  };
}

function normalizePriceHistory(item) {
  return {
    stockCode: item.stock_code || item.stockCode,
    stockName: item.stock_name || item.stockName,
    sector: item.sector || '기타',
    price: Number(item.price),
    recordedAt: item.recorded_at || item.recordedAt,
  };
}

function normalizeAssetHistory(item) {
  return {
    id: item.id,
    userId: item.user_id || item.userId,
    cashBalance: Number(item.cash_balance || item.cashBalance),
    stockValue: Number(item.stock_value || item.stockValue),
    totalAsset: Number(item.total_asset || item.totalAsset),
    returnRate: Number(item.return_rate || item.returnRate),
    recordedAt: item.recorded_at || item.recordedAt,
  };
}

const historyLimits = {
  '15M': 24,
  '1H': 24,
  '1D': 24,
  '1W': 24,
  '1M': 24,
};

export function createMemoryStore() {
  return {
    async ensureStockPrices(stocks) {
      const now = new Date();
      for (const stock of stocks) {
        if (!stockPrices.has(stock.code)) {
          stockPrices.set(stock.code, normalizeStock({ ...stock, fetchedAt: now }));
        } else {
          const current = stockPrices.get(stock.code);
          stockPrices.set(stock.code, normalizeStock({ ...current, name: stock.name, sector: stock.sector }));
        }
      }
    },

    async recordStockPriceHistory(stock) {
      const rows = stockPriceHistory.get(stock.code) || [];
      rows.push(
        normalizePriceHistory({
          stockCode: stock.code,
          stockName: stock.name,
          sector: stock.sector,
          price: stock.price,
          recordedAt: new Date(),
        }),
      );
      stockPriceHistory.set(stock.code, rows.slice(-200));
    },

    async refreshStockPrices(stocks) {
      const now = new Date();
      for (const stock of stocks) {
        stockPrices.set(stock.code, normalizeStock({ ...stock, fetchedAt: now }));
        await this.recordStockPriceHistory(stock);
      }
      return this.getStocks();
    },

    async getStocks() {
      return [...stockPrices.values()].map(normalizeStock);
    },

    async findStockByCode(code) {
      return stockPrices.get(code) || null;
    },

    async getStockPriceHistory(code, period = '15M') {
      const limit = historyLimits[period] || historyLimits['15M'];
      return (stockPriceHistory.get(code) || []).slice(-limit);
    },

    async recordAssetHistory({ userId, cashBalance, stockValue, totalAsset, returnRate }) {
      assetHistory.push(
        normalizeAssetHistory({
          id: nextAssetHistoryId++,
          userId: Number(userId),
          cashBalance,
          stockValue,
          totalAsset,
          returnRate,
          recordedAt: new Date(),
        }),
      );
    },

    async getAssetHistory(userId, limit = 30) {
      return assetHistory
        .filter((item) => Number(item.userId) === Number(userId))
        .slice(-limit)
        .map(normalizeAssetHistory);
    },

    async createUser({ email, passwordHash, nickname }) {
      if (users.some((user) => user.email === email)) {
        throw new Error('EMAIL_EXISTS');
      }
      if (users.some((user) => user.nickname === nickname)) {
        throw new Error('NICKNAME_EXISTS');
      }

      const user = {
        id: nextUserId++,
        email,
        password_hash: passwordHash,
        nickname,
        cash_balance: INITIAL_CASH,
        created_at: new Date(),
      };
      users.push(user);
      return user;
    },

    async findUserByEmail(email) {
      return users.find((user) => user.email === email) || null;
    },

    async findUserById(id) {
      return users.find((user) => user.id === Number(id)) || null;
    },

    async deleteUser(userId) {
      const numericUserId = Number(userId);
      const user = users.find((item) => item.id === numericUserId);
      if (user) {
        users.splice(users.indexOf(user), 1);
      }

      for (let index = holdings.length - 1; index >= 0; index -= 1) {
        if (holdings[index].user_id === numericUserId) holdings.splice(index, 1);
      }
      for (let index = trades.length - 1; index >= 0; index -= 1) {
        if (trades[index].user_id === numericUserId) trades.splice(index, 1);
      }
      for (let index = assetHistory.length - 1; index >= 0; index -= 1) {
        if (Number(assetHistory[index].userId) === numericUserId) assetHistory.splice(index, 1);
      }
    },

    async getAllUserIds() {
      return users.map((user) => user.id);
    },

    async getAdminStats() {
      const latestTrade = trades.reduce(
        (latest, trade) => (new Date(trade.created_at) > new Date(latest || 0) ? trade.created_at : latest),
        null,
      );
      const latestStockHistory = [...stockPriceHistory.values()]
        .flat()
        .reduce(
          (latest, item) => (new Date(item.recordedAt) > new Date(latest || 0) ? item.recordedAt : latest),
          null,
        );

      return {
        userCount: users.length,
        holdingCount: holdings.length,
        tradeCount: trades.length,
        latestTradeAt: latestTrade,
        stockHistoryCount: [...stockPriceHistory.values()].reduce((sum, rows) => sum + rows.length, 0),
        latestStockHistoryAt: latestStockHistory,
      };
    },

    async getAdminRecentTrades(limit = 30) {
      return trades
        .map((trade) => {
          const user = users.find((item) => item.id === Number(trade.user_id));
          return normalizeTrade({
            ...trade,
            nickname: user?.nickname,
            email: user?.email,
          });
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, Math.min(Math.max(Number(limit) || 30, 1), 100));
    },

    async getAdminUsers(priceMap, limit = 100) {
      return users
        .slice()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, Math.min(Math.max(Number(limit) || 100, 1), 300))
        .map((user) => {
          const userHoldings = holdings.filter((holding) => holding.user_id === user.id);
          const stockValue = userHoldings.reduce(
            (sum, holding) => sum + holding.quantity * (priceMap.get(holding.stock_code) || 0),
            0,
          );
          const totalAsset = user.cash_balance + stockValue;

          return {
            userId: user.id,
            email: user.email,
            nickname: user.nickname,
            cashBalance: user.cash_balance,
            stockValue,
            totalAsset,
            returnRate: ((totalAsset - INITIAL_CASH) / INITIAL_CASH) * 100,
            holdingCount: userHoldings.length,
            createdAt: user.created_at,
          };
        });
    },

    async getHoldings(userId) {
      return holdings.filter((holding) => holding.user_id === Number(userId));
    },

    async getTrades(userId, limit = 30) {
      return trades
        .filter((trade) => trade.user_id === Number(userId))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, limit)
        .map(normalizeTrade);
    },

    async buyStock({ userId, stock, quantity }) {
      const user = await this.findUserById(userId);
      const totalAmount = stock.price * quantity;

      if (!user || user.cash_balance < totalAmount) {
        throw new Error('INSUFFICIENT_CASH');
      }

      const existing = holdings.find(
        (holding) => holding.user_id === Number(userId) && holding.stock_code === stock.code,
      );

      user.cash_balance -= totalAmount;

      if (existing) {
        const currentCost = existing.avg_price * existing.quantity;
        const nextQuantity = existing.quantity + quantity;
        existing.avg_price = Math.round((currentCost + totalAmount) / nextQuantity);
        existing.quantity = nextQuantity;
      } else {
        holdings.push({
          id: nextHoldingId++,
          user_id: Number(userId),
          stock_code: stock.code,
          stock_name: stock.name,
          quantity,
          avg_price: stock.price,
        });
      }

      trades.push({
        id: nextTradeId++,
        user_id: Number(userId),
        stock_code: stock.code,
        stock_name: stock.name,
        type: 'BUY',
        quantity,
        price: stock.price,
        total_amount: totalAmount,
        created_at: new Date(),
      });

      return this.getPortfolio(userId);
    },

    async sellStock({ userId, stock, quantity }) {
      const user = await this.findUserById(userId);
      const existing = holdings.find(
        (holding) => holding.user_id === Number(userId) && holding.stock_code === stock.code,
      );

      if (!user || !existing || existing.quantity < quantity) {
        throw new Error('INSUFFICIENT_STOCK');
      }

      const totalAmount = stock.price * quantity;
      existing.quantity -= quantity;
      user.cash_balance += totalAmount;

      if (existing.quantity === 0) {
        holdings.splice(holdings.indexOf(existing), 1);
      }

      trades.push({
        id: nextTradeId++,
        user_id: Number(userId),
        stock_code: stock.code,
        stock_name: stock.name,
        type: 'SELL',
        quantity,
        price: stock.price,
        total_amount: totalAmount,
        created_at: new Date(),
      });

      return this.getPortfolio(userId);
    },

    async getPortfolio(userId) {
      const user = await this.findUserById(userId);
      return {
        user,
        holdings: await this.getHoldings(userId),
      };
    },

    async getRanking(priceMap) {
      return users
        .map((user) => {
          const stockValue = holdings
            .filter((holding) => holding.user_id === user.id)
            .reduce((sum, holding) => sum + holding.quantity * (priceMap.get(holding.stock_code) || 0), 0);
          const totalAsset = user.cash_balance + stockValue;
          return {
            userId: user.id,
            nickname: user.nickname,
            totalAsset,
            returnRate: ((totalAsset - INITIAL_CASH) / INITIAL_CASH) * 100,
          };
        })
        .sort((a, b) => b.totalAsset - a.totalAsset);
    },
  };
}
