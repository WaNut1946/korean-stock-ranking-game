import axios from 'axios';
import { mockStocks } from '../mockStocks.js';

const DEFAULT_BASE_URL = 'https://openapi.koreainvestment.com:9443';
const TOKEN_SAFETY_MS = 60 * 1000;
const DEFAULT_REQUEST_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required when PRICE_PROVIDER=kis.`);
  }
  return value;
}

export function createKisPriceProvider() {
  const baseURL = process.env.KIS_BASE_URL || DEFAULT_BASE_URL;
  const appKey = requireEnv('KIS_APP_KEY');
  const appSecret = requireEnv('KIS_APP_SECRET');
  const requestDelayMs = Number(process.env.KIS_REQUEST_DELAY_MS || DEFAULT_REQUEST_DELAY_MS);
  let token = null;
  let tokenExpiresAt = 0;
  let lastStats = {
    successfulCount: 0,
    failedCount: 0,
    failedStocks: [],
  };

  const client = axios.create({
    baseURL,
    timeout: 10000,
  });

  async function getAccessToken() {
    if (token && Date.now() < tokenExpiresAt - TOKEN_SAFETY_MS) {
      return token;
    }

    const { data } = await client.post(
      '/oauth2/tokenP',
      {
        grant_type: 'client_credentials',
        appkey: appKey,
        appsecret: appSecret,
      },
      {
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      },
    );

    token = data.access_token;
    tokenExpiresAt = Date.now() + Number(data.expires_in || 0) * 1000;

    if (!token) {
      throw new Error('KIS access token response did not include access_token.');
    }

    return token;
  }

  async function getPrice(stock) {
    const accessToken = await getAccessToken();
    const { data } = await client.get('/uapi/domestic-stock/v1/quotations/inquire-price', {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${accessToken}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: 'FHKST01010100',
      },
      params: {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: stock.code,
      },
    });

    const price = Number(data?.output?.stck_prpr);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(data?.msg1 || `Invalid KIS price response for ${stock.code}.`);
    }

    return {
      price: Math.round(price),
      priceChange: Number(data?.output?.prdy_vrss || 0),
      changeRate: Number(data?.output?.prdy_ctrt || 0),
    };
  }

  return {
    name: 'kis',

    async getSupportedStocks() {
      return mockStocks;
    },

    async getLatestPrices(currentStocks = []) {
      const currentMap = new Map(currentStocks.map((stock) => [stock.code, stock]));
      const results = [];
      const failedStocks = [];
      let successfulCount = 0;

      for (const stock of mockStocks) {
        const current = currentMap.get(stock.code) || stock;

        try {
          const quote = await getPrice(stock);
          results.push({ ...stock, ...quote });
          successfulCount += 1;
        } catch (error) {
          const detail = error.response?.data?.msg1 || error.response?.data?.message || error.message;
          console.warn(`KIS price fetch failed for ${stock.code}: ${detail}`);
          failedStocks.push({
            code: stock.code,
            name: stock.name,
            message: detail,
          });
          results.push({
            ...stock,
            price: Number(current.price || stock.price),
            priceChange: Number(current.priceChange || stock.priceChange || 0),
            changeRate: Number(current.changeRate || stock.changeRate || 0),
          });
        }

        await sleep(requestDelayMs);
      }

      lastStats = {
        successfulCount,
        failedCount: failedStocks.length,
        failedStocks,
      };

      return results;
    },

    getLastStats() {
      return lastStats;
    },
  };
}
