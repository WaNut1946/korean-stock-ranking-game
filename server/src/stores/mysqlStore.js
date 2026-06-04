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

const historyLimits = {
  '15M': { bucketSeconds: 15 * 60, limit: 24 },
  '1H': { bucketSeconds: 60 * 60, limit: 24 },
  '1D': { bucketSeconds: 24 * 60 * 60, limit: 24 },
  '1W': { bucketSeconds: 7 * 24 * 60 * 60, limit: 24 },
  '1M': { bucketSeconds: 30 * 24 * 60 * 60, limit: 24 },
};

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
           SELECT
             stock_code,
             stock_name,
             sector,
             AVG(price) AS price,
             MIN(recorded_at) AS recorded_at
           FROM stock_price_history
           WHERE stock_code = ?
           GROUP BY stock_code, stock_name, sector, UNIX_TIMESTAMP(recorded_at) DIV ?
           ORDER BY recorded_at DESC
           LIMIT ${config.limit}
         ) AS compressed_history
         ORDER BY recorded_at ASC`,
        [code, config.bucketSeconds],
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

    async buyStock({ userId, stock, quantity }) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [[user]] = await connection.execute('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
        const totalAmount = stock.price * quantity;

        if (!user || Number(user.cash_balance) < totalAmount) {
          throw new Error('INSUFFICIENT_CASH');
        }

        const [[holding]] = await connection.execute(
          'SELECT * FROM holdings WHERE user_id = ? AND stock_code = ? FOR UPDATE',
          [userId, stock.code],
        );

        await connection.execute('UPDATE users SET cash_balance = cash_balance - ? WHERE id = ?', [totalAmount, userId]);

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
            [userId, stock.code, stock.name, quantity, stock.price],
          );
        }

        await connection.execute(
          'INSERT INTO trades (user_id, stock_code, stock_name, type, quantity, price, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, stock.code, stock.name, 'BUY', quantity, stock.price, totalAmount],
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

    async sellStock({ userId, stock, quantity }) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [[holding]] = await connection.execute(
          'SELECT * FROM holdings WHERE user_id = ? AND stock_code = ? FOR UPDATE',
          [userId, stock.code],
        );

        if (!holding || Number(holding.quantity) < quantity) {
          throw new Error('INSUFFICIENT_STOCK');
        }

        const totalAmount = stock.price * quantity;
        const nextQuantity = Number(holding.quantity) - quantity;

        await connection.execute('UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?', [totalAmount, userId]);

        if (nextQuantity === 0) {
          await connection.execute('DELETE FROM holdings WHERE id = ?', [holding.id]);
        } else {
          await connection.execute('UPDATE holdings SET quantity = ? WHERE id = ?', [nextQuantity, holding.id]);
        }

        await connection.execute(
          'INSERT INTO trades (user_id, stock_code, stock_name, type, quantity, price, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, stock.code, stock.name, 'SELL', quantity, stock.price, totalAmount],
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
