import { defineFunction } from '@aws-amplify/backend';

// ideally this should be handled by Fargate or some other service that listens to websocket api,
// which ticks every 1000ms.
// for the sake of simplicity it's just a lambda that runs every minute.
export const btcPriceListener = defineFunction({
  name: 'btc-price-listener',
  entry: './btc-price-listener.ts',
  schedule: 'every 1m',
  timeoutSeconds: 90,
});
