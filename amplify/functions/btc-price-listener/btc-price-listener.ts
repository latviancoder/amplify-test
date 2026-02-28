import type { Handler } from 'aws-lambda';

import { Amplify } from 'aws-amplify';

import { env } from '$amplify/env/btc-price-listener';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { client } from '../../client';

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

// amplify's minimum schedule interval is 1 minute, but we need ~30sec granularity for 60sec bets.
// so we fetch twice per invocation with a 30-second sleep in between.
// this is a hack to get the job done, not a real solution.
const TICKER_ID = 'BTCUSDT';

async function fetchAndStoreTick() {
  const btcTicker: { price: string } = await fetch(
    'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'
  ).then((res) => res.json());

  const price = Number(btcTicker.price);
  const timestamp = new Date().toISOString();

  // Upsert: try to update existing record, create if it doesn't exist yet
  const { data } = await client.models.BtcPrice.update({
    id: TICKER_ID,
    ticker: TICKER_ID,
    price,
    timestamp,
  });

  if (!data) {
    await client.models.BtcPrice.create({
      id: TICKER_ID,
      ticker: TICKER_ID,
      price,
      timestamp,
    });
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const handler: Handler = async () => {
  await fetchAndStoreTick();
  await sleep(30 * 1000);
  await fetchAndStoreTick();
};
