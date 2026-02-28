import { client } from '../../client';
import { env } from '$amplify/env/settle-bet';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const STALENESS_THRESHOLD_MS = 2 * 60 * 1000;

export const handler = async (event: { betId: string }) => {
  console.log('settling bet at ', new Date().toISOString());
  const { betId } = event;

  const { data: bet } = await client.models.Bet.get({ id: betId });

  console.log({ bet });

  if (!bet) {
    console.log(`Bet ${betId} not found, skipping`);
    return;
  }

  if (bet.status !== 'PENDING') {
    console.log(`Bet ${betId} is ${bet.status}, skipping`);
    return;
  }

  const { data: btcPrice } = await client.models.BtcPrice.get({
    id: 'BTCUSDT',
  });

  const cancelBet = async () => {
    await client.models.Bet.update({ id: betId, status: 'CANCELED' });
  };

  if (!btcPrice) {
    console.log(`No BTC price available, canceling bet ${betId}`);
    await cancelBet();
    return;
  }

  const priceAge = Date.now() - new Date(btcPrice.timestamp).getTime();
  if (priceAge > STALENESS_THRESHOLD_MS) {
    // stale price, cancel the bet.
    // could happen if our price fetching is delayed or broken.
    console.log(`BTC price is stale`);
    await cancelBet();
    return;
  }

  const currentPrice = btcPrice.price;
  const priceAtBet = bet.priceAtBet;

  const won =
    bet.direction === 'UP'
      ? currentPrice > priceAtBet
      : currentPrice < priceAtBet;

  const status = won ? 'WON' : 'LOST';

  await client.models.Bet.update({
    id: betId,
    priceAtSettlement: currentPrice,
    status,
  });

  console.log(
    `${betId}, dir: ${bet.direction}, price: ${priceAtBet} -> ${currentPrice}, status: ${status}`
  );
};
