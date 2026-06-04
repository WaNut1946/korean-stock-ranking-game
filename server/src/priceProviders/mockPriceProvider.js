import { mockStocks } from '../mockStocks.js';

export function createMockPriceProvider() {
  let lastStats = {
    successfulCount: mockStocks.length,
    failedCount: 0,
    failedStocks: [],
  };

  return {
    name: 'mock',

    async getSupportedStocks() {
      return mockStocks;
    },

    async getLatestPrices(currentStocks = []) {
      const currentMap = new Map(currentStocks.map((stock) => [stock.code, stock]));
      lastStats = {
        successfulCount: mockStocks.length,
        failedCount: 0,
        failedStocks: [],
      };

      return mockStocks.map((stock) => {
        const current = currentMap.get(stock.code) || stock;
        const movement = 1 + (Math.random() * 0.04 - 0.02);
        const nextPrice = Math.max(1000, Math.round((Number(current.price) * movement) / 100) * 100);

        return {
          ...stock,
          price: nextPrice,
        };
      });
    },

    getLastStats() {
      return lastStats;
    },
  };
}
