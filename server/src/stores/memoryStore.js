import { calculateTradeCost } from '../tradingRules.js';

const INITIAL_CASH = 100000000;

let nextUserId = 1;
let nextHoldingId = 1;
let nextTradeId = 1;
let nextPendingOrderId = 1;

const users = [];
const holdings = [];
const trades = [];
const pendingOrders = [];
const stockPrices = new Map();
const stockPriceHistory = new Map();
const assetHistory = [];
let nextAssetHistoryId = 1;
const announcements = [];
let nextAnnouncementId = 1;

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

function normalizePendingOrder(order) {
  return {
    id: order.id,
    userId: order.user_id,
    stockCode: order.stock_code,
    stockName: order.stock_name,
    type: order.type,
    quantity: Number(order.quantity),
    limitPrice: Number(order.limit_price),
    reservedAmount: Number(order.reserved_amount || 0),
    reservedAvgPrice: Number(order.reserved_avg_price || 0),
    status: order.status,
    createdAt: order.created_at,
    filledAt: order.filled_at,
    canceledAt: order.canceled_at,
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

function normalizeAnnouncement(item) {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    isVisible: Boolean(item.is_visible ?? item.isVisible),
    isImportant: Boolean(item.is_important ?? item.isImportant),
    createdAt: item.created_at || item.createdAt,
    updatedAt: item.updated_at || item.updatedAt,
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
      for (let index = pendingOrders.length - 1; index >= 0; index -= 1) {
        if (pendingOrders[index].user_id === numericUserId) pendingOrders.splice(index, 1);
      }
      for (let index = assetHistory.length - 1; index >= 0; index -= 1) {
        if (Number(assetHistory[index].userId) === numericUserId) assetHistory.splice(index, 1);
      }
    },

    async updateUserPassword(userId, passwordHash) {
      const user = users.find((item) => item.id === Number(userId));
      if (user) {
        user.password_hash = passwordHash;
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

    async getPublicAnnouncements(limit = 10) {
      return announcements
        .filter((item) => item.is_visible)
        .sort((a, b) => Number(Boolean(b.is_important)) - Number(Boolean(a.is_important)) ||
          new Date(b.created_at) - new Date(a.created_at))
        .slice(0, Math.min(Math.max(Number(limit) || 10, 1), 30))
        .map(normalizeAnnouncement);
    },

    async getAdminAnnouncements(limit = 30) {
      return announcements
        .slice()
        .sort((a, b) => Number(Boolean(b.is_important)) - Number(Boolean(a.is_important)) ||
          new Date(b.created_at) - new Date(a.created_at))
        .slice(0, Math.min(Math.max(Number(limit) || 30, 1), 100))
        .map(normalizeAnnouncement);
    },

    async createAnnouncement({ title, content, isVisible = true, isImportant = false }) {
      const now = new Date();
      const announcement = {
        id: nextAnnouncementId++,
        title,
        content,
        is_visible: isVisible,
        is_important: isImportant,
        created_at: now,
        updated_at: now,
      };
      announcements.push(announcement);
      return normalizeAnnouncement(announcement);
    },

    async updateAnnouncementVisibility(id, isVisible) {
      const announcement = announcements.find((item) => item.id === Number(id));
      if (!announcement) return null;

      announcement.is_visible = Boolean(isVisible);
      announcement.updated_at = new Date();
      return normalizeAnnouncement(announcement);
    },

    async updateAnnouncement(id, { title, content, isVisible, isImportant = false }) {
      const announcement = announcements.find((item) => item.id === Number(id));
      if (!announcement) return null;

      announcement.title = title;
      announcement.content = content;
      announcement.is_visible = Boolean(isVisible);
      announcement.is_important = Boolean(isImportant);
      announcement.updated_at = new Date();
      return normalizeAnnouncement(announcement);
    },

    async deleteAnnouncement(id) {
      const announcementIndex = announcements.findIndex((item) => item.id === Number(id));
      if (announcementIndex === -1) return false;

      announcements.splice(announcementIndex, 1);
      return true;
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

    async buyStock({ userId, stock, quantity, price = stock.price }) {
      const user = await this.findUserById(userId);
      const tradeCost = calculateTradeCost({ price, quantity, type: 'BUY' });
      const totalAmount = tradeCost.settlementAmount;

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
          avg_price: Math.round(totalAmount / quantity),
        });
      }

      trades.push({
        id: nextTradeId++,
        user_id: Number(userId),
        stock_code: stock.code,
        stock_name: stock.name,
        type: 'BUY',
        quantity,
        price,
        total_amount: totalAmount,
        created_at: new Date(),
      });

      return this.getPortfolio(userId);
    },

    async sellStock({ userId, stock, quantity, price = stock.price }) {
      const user = await this.findUserById(userId);
      const existing = holdings.find(
        (holding) => holding.user_id === Number(userId) && holding.stock_code === stock.code,
      );

      if (!user || !existing || existing.quantity < quantity) {
        throw new Error('INSUFFICIENT_STOCK');
      }

      const tradeCost = calculateTradeCost({ price, quantity, type: 'SELL' });
      const totalAmount = tradeCost.settlementAmount;
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
        price,
        total_amount: totalAmount,
        created_at: new Date(),
      });

      return this.getPortfolio(userId);
    },

    async placeLimitOrder({ userId, stock, quantity, type, limitPrice }) {
      const normalizedType = type === 'SELL' ? 'SELL' : 'BUY';
      const executable = normalizedType === 'BUY' ? stock.price <= limitPrice : stock.price >= limitPrice;

      if (executable) {
        const portfolio = normalizedType === 'BUY'
          ? await this.buyStock({ userId, stock, quantity, price: stock.price })
          : await this.sellStock({ userId, stock, quantity, price: stock.price });
        return { status: 'FILLED', order: null, portfolio };
      }

      const user = await this.findUserById(userId);
      let reservedAmount = 0;
      let reservedAvgPrice = 0;

      if (normalizedType === 'BUY') {
        reservedAmount = calculateTradeCost({ price: limitPrice, quantity, type: 'BUY' }).settlementAmount;
        if (!user || user.cash_balance < reservedAmount) throw new Error('INSUFFICIENT_CASH');
        user.cash_balance -= reservedAmount;
      } else {
        const existing = holdings.find(
          (holding) => holding.user_id === Number(userId) && holding.stock_code === stock.code,
        );
        if (!existing || existing.quantity < quantity) throw new Error('INSUFFICIENT_STOCK');
        reservedAvgPrice = existing.avg_price;
        existing.quantity -= quantity;
        if (existing.quantity === 0) holdings.splice(holdings.indexOf(existing), 1);
      }

      const order = {
        id: nextPendingOrderId++,
        user_id: Number(userId),
        stock_code: stock.code,
        stock_name: stock.name,
        type: normalizedType,
        quantity,
        limit_price: limitPrice,
        reserved_amount: reservedAmount,
        reserved_avg_price: reservedAvgPrice,
        status: 'OPEN',
        created_at: new Date(),
        filled_at: null,
        canceled_at: null,
      };
      pendingOrders.push(order);
      return { status: 'OPEN', order: normalizePendingOrder(order), portfolio: await this.getPortfolio(userId) };
    },

    async getOpenOrders(userId) {
      return pendingOrders
        .filter((order) => order.user_id === Number(userId) && order.status === 'OPEN')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map(normalizePendingOrder);
    },

    async cancelOrder({ userId, orderId }) {
      const order = pendingOrders.find(
        (item) => item.id === Number(orderId) && item.user_id === Number(userId) && item.status === 'OPEN',
      );
      if (!order) throw new Error('ORDER_NOT_FOUND');

      const user = await this.findUserById(userId);
      if (order.type === 'BUY') {
        user.cash_balance += order.reserved_amount;
      } else {
        const existing = holdings.find(
          (holding) => holding.user_id === Number(userId) && holding.stock_code === order.stock_code,
        );
        if (existing) {
          const nextQuantity = existing.quantity + order.quantity;
          existing.avg_price = Math.round(
            (existing.avg_price * existing.quantity + order.reserved_avg_price * order.quantity) / nextQuantity,
          );
          existing.quantity = nextQuantity;
        } else {
          holdings.push({
            id: nextHoldingId++,
            user_id: Number(userId),
            stock_code: order.stock_code,
            stock_name: order.stock_name,
            quantity: order.quantity,
            avg_price: order.reserved_avg_price,
          });
        }
      }

      order.status = 'CANCELED';
      order.canceled_at = new Date();
      return this.getPortfolio(userId);
    },

    async processPendingOrders() {
      let filledCount = 0;
      for (const order of pendingOrders.filter((item) => item.status === 'OPEN')) {
        const stock = stockPrices.get(order.stock_code);
        if (!stock) continue;

        const executable = order.type === 'BUY' ? stock.price <= order.limit_price : stock.price >= order.limit_price;
        if (!executable) continue;

        const user = await this.findUserById(order.user_id);
        const tradeCost = calculateTradeCost({ price: stock.price, quantity: order.quantity, type: order.type });
        const totalAmount = tradeCost.settlementAmount;

        if (order.type === 'BUY') {
          const refund = Math.max(order.reserved_amount - totalAmount, 0);
          user.cash_balance += refund;
          const existing = holdings.find(
            (holding) => holding.user_id === Number(order.user_id) && holding.stock_code === order.stock_code,
          );
          if (existing) {
            const currentCost = existing.avg_price * existing.quantity;
            const nextQuantity = existing.quantity + order.quantity;
            existing.avg_price = Math.round((currentCost + totalAmount) / nextQuantity);
            existing.quantity = nextQuantity;
          } else {
            holdings.push({
              id: nextHoldingId++,
              user_id: Number(order.user_id),
              stock_code: order.stock_code,
              stock_name: order.stock_name,
              quantity: order.quantity,
              avg_price: Math.round(totalAmount / order.quantity),
            });
          }
          trades.push({
            id: nextTradeId++,
            user_id: order.user_id,
            stock_code: order.stock_code,
            stock_name: order.stock_name,
            type: 'BUY',
            quantity: order.quantity,
            price: stock.price,
            total_amount: totalAmount,
            created_at: new Date(),
          });
        } else {
          user.cash_balance += totalAmount;
          trades.push({
            id: nextTradeId++,
            user_id: order.user_id,
            stock_code: order.stock_code,
            stock_name: order.stock_name,
            type: 'SELL',
            quantity: order.quantity,
            price: stock.price,
            total_amount: totalAmount,
            created_at: new Date(),
          });
        }
        order.status = 'FILLED';
        order.filled_at = new Date();
        filledCount += 1;
      }
      return { filledCount };
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
