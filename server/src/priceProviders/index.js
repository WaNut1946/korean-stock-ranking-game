import { createMockPriceProvider } from './mockPriceProvider.js';
import { createKisPriceProvider } from './kisPriceProvider.js';

export function createPriceProvider() {
  const providerName = process.env.PRICE_PROVIDER || 'mock';

  if (providerName === 'mock') {
    return createMockPriceProvider();
  }

  if (providerName === 'kis') {
    return createKisPriceProvider();
  }

  console.warn(`Unknown PRICE_PROVIDER "${providerName}". Falling back to mock provider.`);
  return createMockPriceProvider();
}
