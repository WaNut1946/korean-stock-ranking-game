import { createMockPriceProvider } from './mockPriceProvider.js';

export function createPriceProvider() {
  const providerName = process.env.PRICE_PROVIDER || 'mock';

  if (providerName === 'mock') {
    return createMockPriceProvider();
  }

  console.warn(`Unknown PRICE_PROVIDER "${providerName}". Falling back to mock provider.`);
  return createMockPriceProvider();
}
