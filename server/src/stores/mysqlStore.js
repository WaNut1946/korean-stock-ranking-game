import { calculateTradeCost } from '../tradingRules.js';

const INITIAL_CASH = 100000000;

function normalizeUser(row) {
  return row
    ? {
        ...row,
        cash_balance: Number(row.cash_balance),
      }
    : null;
}

function normalizeHolding(row) {
  return {
    ...row,
    quantity: Number(row.quantity),
    avg_price: Number(row.avg_price),
  };
}

function normalizeStock(row) {
  return {
    code: row.stock_code,
    name: row.stock_name,
    sector: row.sector || '기타',
    price: Number(row.price),
    priceChange: Number(row.price_change || 0),
    changeRate: Number(row.change_rate || 0),
    fetchedAt: row.fetched_at,
  };
}

function normalizeTrade(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userNickname: row.nickname,
    userEmail: row.email,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    type: row.type,
    quantity: Number(row.quantity),
    price: Number(row.price),
    totalAmount: Number(row.total_amount),
    createdAt: row.created_at,
  };
}

function normalizePendingOrder(row) {
  return {
    id: row.id,
    userId: row.user_id,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    type: row.type,
    quantity: Number(row.quantity),
    limitPrice: Number(row.limit_price),
    reservedAmount: Number(row.reserved_amount || 0),
    reservedAvgPrice: Number(row.reserved_avg_price || 0),
    status: row.status,
    createdAt: row.created_at,
    filledAt: row.filled_at,
    canceledAt: row.canceled_at,
  };
}

function normalizePriceHistory(row) {
  return {
    stockCode: row.stock_code,
    stockName: row.stock_name,
    sector: row.sector || '기타',
    price: Number(row.price),
    recordedAt: row.recorded_at,
  };
}

function normalizeAssetHistory(row) {
  return {
    id: row.id,
    userId: row.user_id,
    cashBalance: Number(row.cash_balance),
    stockValue: Number(row.stock_value),
    totalAsset: Number(row.total_asset),
    returnRate: Number(row.return_rate),
    recordedAt: row.recorded_at,
  };
}

function normalizeAnnouncement(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    isVisible: Boolean(row.is_visible),
    isImportant: Boolean(row.is_important),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const historyLimits = {
  '15M': { bucketExpression: 'FLOOR(UNIX_TIMESTAMP(recorded_at) / 900)', limit: 24 },
  '1H': { bucketExpression: 'FLOOR(UNIX_TIMESTAMP(recorded_at) / 3600)', limit: 24 },
  '1D': { bucketExpression: 'DATE(DATE_ADD(recorded_at, INTERVAL 9 HOUR))', limit: 24 },
  '1W': { bucketExpression: 'YEARWEEK(DATE_ADD(recorded_at, INTERVAL 9 HOUR), 3)', limit: 24 },
  '1M': { bucketExpression: "DATE_FORMAT(DATE_ADD(recorded_at, INTERVAL 9 HOUR), '%Y-%m')", limit: 24 },
};

async function addBoughtHolding(connection, { userId, stock, quantity, price, totalAmount }) {
  const [[holding]] = await connection.execute(
    'SELECT * FROM holdings WHERE user_id = ? AND stock_code = ? FOR UPDATE',
    [userId, stock.code],
  );

  if (holding) {
    const nextQuantity = Number(holding.quantity) + quantity;
    const nextAvgPrice = Math.round(
      (Number(holding.avg_price) * Number(holding.quantity) + totalAmount) / nextQuantity,
    );
    await connection.execute('UPDATE holdings SET quantity = ?, avg_price = ? WHERE id = ?', [
      nextQuantity,
      nextAvgPrice,
      holding.id,
    ]);
  } else {
    await connection.execute(
      'INSERT INTO holdings (user_id, stock_code, stock_name, quantity, avg_price) VALUES (?, ?, ?, ?, ?)',
      [userId, stock.code, stock.name, quantity, Math.round(totalAmount / quantity)],
    );
  }
}

async function reserveSellHolding(connection, { userId, stock, quantity }) {
  const [[holding]] = await connection.execute(
    'SELECT * FROM holdings WHERE user_id = ? AND stock_code = ? FOR UPDATE',
    [userId, stock.code],
  );

  if (!holding || Number(holding.quantity) < quantity) {
    throw new Error('INSUFFICIENT_STOCK');
  }

  const nextQuantity = Number(holding.quantity) - quantity;
  if (nextQuantity === 0) {
    await connection.execute('DELETE FROM holdings WHERE id = ?', [holding.id]);
  } else {
    await connection.execute('UPDATE holdings SET quantity = ? WHERE id = ?', [nextQuantity, holding.id]);
  }

  return Number(holding.avg_price);
}

async function restoreSellHolding(connection, { userId, order }) {
  const [[holding]] = await connection.execute(
    'SELECT * FROM holdings WHERE user_id = ? AND stock_code = ? FOR UPDATE',
    [userId, order.stock_code],
  );

  if (holding) {
    const nextQuantity = Number(holding.quantity) + Number(order.quantity);
    const nextAvgPrice = Math.round(
      (Number(holding.avg_price) * Number(holding.quantity) +
        Number(order.reserved_avg_price) * Number(order.quantity)) /
        nextQuantity,
    );
    await connection.execute('UPDATE holdings SET quantity = ?, avg_price = ? WHERE id = ?', [
      nextQuantity,
      nextAvgPrice,
      holding.id,
    ]);
  } else {
    await connection.execute(
      'INSERT INTO holdings (user_id, stock_code, stock_name, quantity, avg_price) VALUES (?, ?, ?, ?, ?)',
      [userId, order.stock_code, order.stock_name, order.quantity, order.reserved_avg_price],
    );
  }
}

export function createMysqlStore(pool) {
  return {
    async ensureStockPrices(stocks) {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS stock_prices (
          stock_code VARCHAR(20) PRIMARY KEY,
          stock_name VARCHAR(120) NOT NULL,
          sector VARCHAR(80) NOT NULL DEFAULT '기타',
          price DECIMAL(15, 2) NOT NULL,
          price_change DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
          change_rate DECIMAL(10, 4) NOT NULL DEFAULT 0.0000,
          fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      try {
        await pool.execute("ALTER TABLE stock_prices ADD COLUMN sector VARCHAR(80) NOT NULL DEFAULT '기타' AFTER stock_name");
      } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') {
          throw error;
        }
      }

      try {
        await pool.execute("ALTER TABLE stock_prices ADD COLUMN price_change DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER price");
      } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') {
          throw error;
        }
      }

      try {
        await pool.execute("ALTER TABLE stock_prices ADD COLUMN change_rate DECIMAL(10, 4) NOT NULL DEFAULT 0.0000 AFTER price_change");
      } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') {
          throw error;
        }
      }

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS stock_price_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          stock_code VARCHAR(20) NOT NULL,
          stock_name VARCHAR(120) NOT NULL,
          sector VARCHAR(80) NOT NULL DEFAULT '기타',
          price DECIMAL(15, 2) NOT NULL,
          recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_stock_history_code_time (stock_code, recorded_at)
        )
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS asset_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          cash_balance DECIMAL(15, 2) NOT NULL,
          stock_value DECIMAL(15, 2) NOT NULL,
          total_asset DECIMAL(15, 2) NOT NULL,
          return_rate DECIMAL(10, 4) NOT NULL,
          recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_asset_history_user_time (user_id, recorded_at),
          CONSTRAINT fk_asset_history_user
            FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
        )
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS announcements (
          id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(120) NOT NULL,
          content TEXT NOT NULL,
          is_visible TINYINT(1) NOT NULL DEFAULT 1,
          is_important TINYINT(1) NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_announcements_visible_created (is_visible, is_important, created_at)
        )
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS pending_orders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          stock_code VARCHAR(20) NOT NULL,
          stock_name VARCHAR(120) NOT NULL,
          type ENUM('BUY', 'SELL') NOT NULL,
          quantity INT NOT NULL,
          limit_price DECIMAL(15, 2) NOT NULL,
          reserved_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
          reserved_avg_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
          status ENUM('OPEN', 'FILLED', 'CANCELED') NOT NULL DEFAULT 'OPEN',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          filled_at TIMESTAMP NULL DEFAULT NULL,
          canceled_at TIMESTAMP NULL DEFAULT NULL,
          INDEX idx_pending_user_status (user_id, status, created_at),
          INDEX idx_pending_status_stock (status, stock_code),
          CONSTRAINT fk_pending_orders_user
            FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
        )
      `);

      try {
        await pool.execute('ALTER TABLE announcements ADD COLUMN is_important TINYINT(1) NOT NULL DEFAULT 0 AFTER is_visible');
      } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') {
          throw error;
        }
      }

      for (const stock of stocks) {
        await pool.execute(
          `INSERT INTO stock_prices (stock_code, stock_name, sector, price, price_change, change_rate)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE stock_name = VALUES(stock_name), sector = VALUES(sector)`,
          [stock.code, stock.name, stock.sector || '기타', stock.price, stock.priceChange || 0, stock.changeRate || 0],
        );
      }
    },

    async recordStockPriceHistory(stock) {
      await pool.execute(
        `INSERT INTO stock_price_history (stock_code, stock_name, sector, price, recorded_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [stock.code, stock.name, stock.sector || '기타', stock.price],
      );
    },

    async refreshStockPrices(stocks) {
      for (const stock of stocks) {
        await pool.execute(
          `INSERT INTO stock_prices (stock_code, stock_name, sector, price, price_change, change_rate, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE stock_name = VALUES(stock_name), sector = VALUES(sector),
             price = VALUES(price), price_change = VALUES(price_change), change_rate = VALUES(change_rate), fetched_at = NOW()`,
          [
            stock.code,
            stock.name,
            stock.sector || '기타',
            stock.price,
            stock.priceChange || 0,
            stock.changeRate || 0,
          ],
        );
        await this.recordStockPriceHistory(stock);
      }

      return this.getStocks();
    },

    async getStocks() {
      const [rows] = await pool.execute('SELECT * FROM stock_prices ORDER BY stock_name');
      return rows.map(normalizeStock);
    },

    async findStockByCode(code) {
      const [rows] = await pool.execute('SELECT * FROM stock_prices WHERE stock_code = ?', [code]);
      return rows[0] ? normalizeStock(rows[0]) : null;
    },

    async getStockPriceHistory(code, period = '15M') {
      const config = historyLimits[period] || historyLimits['15M'];
      const [rows] = await pool.execute(
        `SELECT stock_code, stock_name, sector, price, recorded_at
         FROM (
           SELECT stock_code, stock_name, sector, price, recorded_at
           FROM (
             SELECT
               stock_code,
               stock_name,
               sector,
               price,
               recorded_at,
               ROW_NUMBER() OVER (
                 PARTITION BY bucket_key
                 ORDER BY recorded_at DESC, id DESC
               ) AS row_rank
             FROM (
               SELECT
                 id,
                 stock_code,
                 stock_name,
                 sector,
                 price,
                 recorded_at,
                 ${config.bucketExpression} AS bucket_key
               FROM stock_price_history
               WHERE stock_code = ?
             ) AS bucketed_history
           ) AS ranked_history
           WHERE row_rank = 1
           ORDER BY recorded_at DESC
           LIMIT ${config.limit}
         ) AS compressed_history
         ORDER BY recorded_at ASC`,
        [code],
      );
      return rows.map(normalizePriceHistory);
    },

    async recordAssetHistory({ userId, cashBalance, stockValue, totalAsset, returnRate }) {
      await pool.execute(
        `INSERT INTO asset_history (user_id, cash_balance, stock_value, total_asset, return_rate, recorded_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [userId, cashBalance, stockValue, totalAsset, returnRate],
      );
    },

    async getAssetHistory(userId, limit = 30) {
      const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 200);
      const [rows] = await pool.execute(
        `SELECT id, user_id, cash_balance, stock_value, total_asset, return_rate, recorded_at
         FROM asset_history
         WHERE user_id = ?
         ORDER BY recorded_at DESC, id DESC
         LIMIT ${safeLimit}`,
        [userId],
      );
      return rows.map(normalizeAssetHistory).reverse();
    },

    async createUser({ email, passwordHash, nickname }) {
      try {
        const [result] = await pool.execute(
          'INSERT INTO users (email, password_hash, nickname, cash_balance) VALUES (?, ?, ?, ?)',
          [email, passwordHash, nickname, INITIAL_CASH],
        );
        return this.findUserById(result.insertId);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          throw new Error('USER_EXISTS');
        }
        throw error;
      }
    },

    async findUserByEmail(email) {
      const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
      return normalizeUser(rows[0]);
    },

    async findUserById(id) {
      const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
      return normalizeUser(rows[0]);
    },

    async deleteUser(userId) {
      await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    },

    async updateUserPassword(userId, passwordHash) {
      await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
    },

    async getAllUserIds() {
      const [rows] = await pool.execute('SELECT id FROM users');
      return rows.map((row) => row.id);
    },

    async getAdminStats() {
      const [[userStats]] = await pool.execute('SELECT COUNT(*) AS user_count FROM users');
      const [[holdingStats]] = await pool.execute('SELECT COUNT(*) AS holding_count FROM holdings');
      const [[tradeStats]] = await pool.execute(
        'SELECT COUNT(*) AS trade_count, MAX(created_at) AS latest_trade_at FROM trades',
      );
      const [[stockHistoryStats]] = await pool.execute(
        'SELECT COUNT(*) AS stock_history_count, MAX(recorded_at) AS latest_stock_history_at FROM stock_price_history',
      );

      return {
        userCount: Number(userStats.user_count || 0),
        holdingCount: Number(holdingStats.holding_count || 0),
        tradeCount: Number(tradeStats.trade_count || 0),
        latestTradeAt: tradeStats.latest_trade_at,
        stockHistoryCount: Number(stockHistoryStats.stock_history_count || 0),
        latestStockHistoryAt: stockHistoryStats.latest_stock_history_at,
      };
    },

    async getPublicAnnouncements(limit = 10) {
      const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 30);
      const [rows] = await pool.execute(
        `SELECT id, title, content, is_visible, is_important, created_at, updated_at
         FROM announcements
         WHERE is_visible = 1
         ORDER BY is_important DESC, created_at DESC, id DESC
         LIMIT ${safeLimit}`,
      );
      return rows.map(normalizeAnnouncement);
    },

    async getAdminAnnouncements(limit = 30) {
      const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
      const [rows] = await pool.execute(
        `SELECT id, title, content, is_visible, is_important, created_at, updated_at
         FROM announcements
         ORDER BY is_important DESC, created_at DESC, id DESC
         LIMIT ${safeLimit}`,
      );
      return rows.map(normalizeAnnouncement);
    },

    async createAnnouncement({ title, content, isVisible = true, isImportant = false }) {
      const [result] = await pool.execute(
        'INSERT INTO announcements (title, content, is_visible, is_important) VALUES (?, ?, ?, ?)',
        [title, content, isVisible ? 1 : 0, isImportant ? 1 : 0],
      );
      const [rows] = await pool.execute(
        `SELECT id, title, content, is_visible, is_important, created_at, updated_at
         FROM announcements
         WHERE id = ?`,
        [result.insertId],
      );
      return normalizeAnnouncement(rows[0]);
    },

    async updateAnnouncementVisibility(id, isVisible) {
      await pool.execute('UPDATE announcements SET is_visible = ? WHERE id = ?', [isVisible ? 1 : 0, id]);
      const [rows] = await pool.execute(
        `SELECT id, title, content, is_visible, is_important, created_at, updated_at
         FROM announcements
         WHERE id = ?`,
        [id],
      );
      return rows[0] ? normalizeAnnouncement(rows[0]) : null;
    },

    async updateAnnouncement(id, { title, content, isVisible, isImportant = false }) {
      await pool.execute(
        'UPDATE announcements SET title = ?, content = ?, is_visible = ?, is_important = ? WHERE id = ?',
        [title, content, isVisible ? 1 : 0, isImportant ? 1 : 0, id],
      );
      const [rows] = await pool.execute(
        `SELECT id, title, content, is_visible, is_important, created_at, updated_at
         FROM announcements
         WHERE id = ?`,
        [id],
      );
      return rows[0] ? normalizeAnnouncement(rows[0]) : null;
    },

    async deleteAnnouncement(id) {
      const [result] = await pool.execute('DELETE FROM announcements WHERE id = ?', [id]);
      return result.affectedRows > 0;
    },

    async getAdminRecentTrades(limit = 30) {
      const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
      const [rows] = await pool.execute(
        `SELECT
           trades.id,
           trades.user_id,
           users.nickname,
           users.email,
           trades.stock_code,
           trades.stock_name,
           trades.type,
           trades.quantity,
           trades.price,
           trades.total_amount,
           trades.created_at
         FROM trades
         JOIN users ON users.id = trades.user_id
         ORDER BY trades.created_at DESC, trades.id DESC
         LIMIT ${safeLimit}`,
      );
      return rows.map(normalizeTrade);
    },

    async getAdminUsers(priceMap, limit = 100) {
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 300);
      const [users] = await pool.execute(
        `SELECT id, email, nickname, cash_balance, created_at FROM users ORDER BY created_at DESC LIMIT ${safeLimit}`,
      );
      const [holdings] = await pool.execute('SELECT user_id, stock_code, quantity FROM holdings');

      return users.map((user) => {
        const userHoldings = holdings.filter((holding) => holding.user_id === user.id);
        const stockValue = userHoldings.reduce(
          (sum, holding) => sum + Number(holding.quantity) * (priceMap.get(holding.stock_code) || 0),
          0,
        );
        const cashBalance = Number(user.cash_balance);
        const totalAsset = cashBalance + stockValue;

        return {
          userId: user.id,
          email: user.email,
          nickname: user.nickname,
          cashBalance,
          stockValue,
          totalAsset,
          returnRate: ((totalAsset - INITIAL_CASH) / INITIAL_CASH) * 100,
          holdingCount: userHoldings.length,
          createdAt: user.created_at,
        };
      });
    },

    async getHoldings(userId) {
      const [rows] = await pool.execute('SELECT * FROM holdings WHERE user_id = ? ORDER BY stock_name', [userId]);
      return rows.map(normalizeHolding);
    },

    async getTrades(userId, limit = 30) {
      const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
      const [rows] = await pool.execute(
        `SELECT id, stock_code, stock_name, type, quantity, price, total_amount, created_at
         FROM trades
         WHERE user_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ${safeLimit}`,
        [userId],
      );
      return rows.map(normalizeTrade);
    },

    async buyStock({ userId, stock, quantity, price = stock.price }) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [[user]] = await connection.execute('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
        const tradeCost = calculateTradeCost({ price, quantity, type: 'BUY' });
        const totalAmount = tradeCost.settlementAmount;

        if (!user || Number(user.cash_balance) < totalAmount) {
          throw new Error('INSUFFICIENT_CASH');
        }

        await connection.execute('UPDATE users SET cash_balance = cash_balance - ? WHERE id = ?', [totalAmount, userId]);
        await addBoughtHolding(connection, { userId, stock, quantity, price, totalAmount });

        await connection.execute(
          'INSERT INTO trades (user_id, stock_code, stock_name, type, quantity, price, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, stock.code, stock.name, 'BUY', quantity, price, totalAmount],
        );

        await connection.commit();
        return this.getPortfolio(userId);
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async sellStock({ userId, stock, quantity, price = stock.price }) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        await reserveSellHolding(connection, { userId, stock, quantity });
        const tradeCost = calculateTradeCost({ price, quantity, type: 'SELL' });
        const totalAmount = tradeCost.settlementAmount;

        await connection.execute('UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?', [totalAmount, userId]);

        await connection.execute(
          'INSERT INTO trades (user_id, stock_code, stock_name, type, quantity, price, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, stock.code, stock.name, 'SELL', quantity, price, totalAmount],
        );

        await connection.commit();
        return this.getPortfolio(userId);
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async placeLimitOrder({ userId, stock, quantity, type, limitPrice }) {
      const normalizedType = type === 'SELL' ? 'SELL' : 'BUY';
      const currentPrice = Number(stock.price);
      const numericLimitPrice = Number(limitPrice);
      const executable =
        normalizedType === 'BUY' ? currentPrice <= numericLimitPrice : currentPrice >= numericLimitPrice;

      if (executable) {
        const portfolio = normalizedType === 'BUY'
          ? await this.buyStock({ userId, stock, quantity, price: currentPrice })
          : await this.sellStock({ userId, stock, quantity, price: currentPrice });
        return { status: 'FILLED', order: null, portfolio };
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        let reservedAmount = 0;
        let reservedAvgPrice = 0;

        if (normalizedType === 'BUY') {
          const [[user]] = await connection.execute('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
          reservedAmount = calculateTradeCost({ price: numericLimitPrice, quantity, type: 'BUY' }).settlementAmount;

          if (!user || Number(user.cash_balance) < reservedAmount) {
            throw new Error('INSUFFICIENT_CASH');
          }

          await connection.execute('UPDATE users SET cash_balance = cash_balance - ? WHERE id = ?', [
            reservedAmount,
            userId,
          ]);
        } else {
          reservedAvgPrice = await reserveSellHolding(connection, { userId, stock, quantity });
        }

        const [result] = await connection.execute(
          `INSERT INTO pending_orders
             (user_id, stock_code, stock_name, type, quantity, limit_price, reserved_amount, reserved_avg_price)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [userId, stock.code, stock.name, normalizedType, quantity, numericLimitPrice, reservedAmount, reservedAvgPrice],
        );

        await connection.commit();

        return {
          status: 'OPEN',
          order: {
            id: result.insertId,
            userId,
            stockCode: stock.code,
            stockName: stock.name,
            type: normalizedType,
            quantity,
            limitPrice: numericLimitPrice,
            reservedAmount,
            reservedAvgPrice,
            status: 'OPEN',
            createdAt: new Date().toISOString(),
          },
          portfolio: await this.getPortfolio(userId),
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async getOpenOrders(userId) {
      const [rows] = await pool.execute(
        `SELECT * FROM pending_orders
         WHERE user_id = ? AND status = 'OPEN'
         ORDER BY created_at DESC, id DESC`,
        [userId],
      );
      return rows.map(normalizePendingOrder);
    },

    async cancelOrder({ userId, orderId }) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [[order]] = await connection.execute(
          `SELECT * FROM pending_orders
           WHERE id = ? AND user_id = ? AND status = 'OPEN'
           FOR UPDATE`,
          [orderId, userId],
        );

        if (!order) {
          throw new Error('ORDER_NOT_FOUND');
        }

        if (order.type === 'BUY') {
          await connection.execute('UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?', [
            order.reserved_amount,
            userId,
          ]);
        } else {
          await restoreSellHolding(connection, { userId, order });
        }

        await connection.execute(
          "UPDATE pending_orders SET status = 'CANCELED', canceled_at = NOW() WHERE id = ?",
          [order.id],
        );

        await connection.commit();
        return this.getPortfolio(userId);
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async processPendingOrders() {
      const [orders] = await pool.execute(
        `SELECT pending_orders.*, stock_prices.price
         FROM pending_orders
         JOIN stock_prices ON stock_prices.stock_code = pending_orders.stock_code
         WHERE pending_orders.status = 'OPEN'
         ORDER BY pending_orders.created_at ASC, pending_orders.id ASC`,
      );
      let filledCount = 0;

      for (const order of orders) {
        const currentPrice = Number(order.price);
        const limitPrice = Number(order.limit_price);
        const executable = order.type === 'BUY' ? currentPrice <= limitPrice : currentPrice >= limitPrice;
        if (!executable) continue;

        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();

          const [[lockedOrder]] = await connection.execute(
            "SELECT * FROM pending_orders WHERE id = ? AND status = 'OPEN' FOR UPDATE",
            [order.id],
          );

          if (!lockedOrder) {
            await connection.rollback();
            continue;
          }

          const stock = {
            code: lockedOrder.stock_code,
            name: lockedOrder.stock_name,
            price: currentPrice,
          };
          const tradeCost = calculateTradeCost({ price: currentPrice, quantity: lockedOrder.quantity, type: lockedOrder.type });
          const totalAmount = tradeCost.settlementAmount;

          if (lockedOrder.type === 'BUY') {
            const refund = Math.max(Number(lockedOrder.reserved_amount) - totalAmount, 0);
            if (refund > 0) {
              await connection.execute('UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?', [
                refund,
                lockedOrder.user_id,
              ]);
            }
            await addBoughtHolding(connection, {
              userId: lockedOrder.user_id,
              stock,
              quantity: Number(lockedOrder.quantity),
              price: currentPrice,
              totalAmount,
            });
          } else {
            await connection.execute('UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?', [
              totalAmount,
              lockedOrder.user_id,
            ]);
          }

          await connection.execute(
            'INSERT INTO trades (user_id, stock_code, stock_name, type, quantity, price, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              lockedOrder.user_id,
              lockedOrder.stock_code,
              lockedOrder.stock_name,
              lockedOrder.type,
              lockedOrder.quantity,
              currentPrice,
              totalAmount,
            ],
          );
          await connection.execute("UPDATE pending_orders SET status = 'FILLED', filled_at = NOW() WHERE id = ?", [
            lockedOrder.id,
          ]);

          await connection.commit();
          filledCount += 1;
        } catch (error) {
          await connection.rollback();
          console.error(`Pending order ${order.id} processing failed: ${error.message}`);
        } finally {
          connection.release();
        }
      }

      return { filledCount };
    },

    async getPortfolio(userId) {
      return {
        user: await this.findUserById(userId),
        holdings: await this.getHoldings(userId),
      };
    },

    async getRanking(priceMap) {
      const [users] = await pool.execute('SELECT id, nickname, cash_balance FROM users');
      const [holdings] = await pool.execute('SELECT user_id, stock_code, quantity FROM holdings');

      return users
        .map((user) => {
          const stockValue = holdings
            .filter((holding) => holding.user_id === user.id)
            .reduce((sum, holding) => sum + Number(holding.quantity) * (priceMap.get(holding.stock_code) || 0), 0);
          const totalAsset = Number(user.cash_balance) + stockValue;
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
