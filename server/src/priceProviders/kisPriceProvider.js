import axios from 'axios';
import { mockStocks } from '../mockStocks.js';

const DEFAULT_BASE_URL = 'https://openapi.koreainvestment.com:9443';
const TOKEN_SAFETY_MS = 60 * 1000;
const REQUEST_DELAY_MS = 180;

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
  let token = null;
  let tokenExpiresAt = 0;

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

    return Math.round(price);
  }

  return {
    name: 'kis',

    async getSupportedStocks() {
      return mockStocks;
    },

    async getLatestPrices(currentStocks = []) {
      const currentMap = new Map(currentStocks.map((stock) => [stock.code, stock]));
      const results = [];

      for (const stock of mockStocks) {
        const current = currentMap.get(stock.code) || stock;

        try {
          const price = await getPrice(stock);
          results.push({ ...stock, price });
        } catch (error) {
          console.warn(`KIS price fetch failed for ${stock.code}: ${error.message}`);
          results.push({
            ...stock,
            price: Number(current.price || stock.price),
          });
        }

        await sleep(REQUEST_DELAY_MS);
      }

      return results;
    },
  };
}
