import { client } from '../../client';
import { env } from '$amplify/env/settle-bet';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const STALENESS_THRESHOLD_MS = 2 * 60 * 1000;

export const handler = async (event: { betId: string }) => {
  const { betId } = event;
  console.log(`settling bet ${betId} at ${new Date().toISOString()}`);

  const { data: bet } = await client.models.Bet.get({ id: betId });

  if (!bet) {
    console.log(`bet not found`);
    return { settled: true };
  }

  if (bet.status !== 'PENDING') {
    console.log(`bet is ${bet.status}`);
    return { settled: true };
  }

  const { data: btcPrice } = await client.models.BtcPrice.get({
    id: 'BTCUSDT',
  });

  const cancelBet = async () => {
    await client.models.Bet.update({ id: betId, status: 'CANCELED' });
  };

  if (!btcPrice) {
    console.log('no price available');
    await cancelBet();
    return { settled: true };
  }

  const priceAge = Date.now() - new Date(btcPrice.timestamp).getTime();
  if (priceAge > STALENESS_THRESHOLD_MS) {
    console.log('price is stale');
    await cancelBet();
    return { settled: true };
  }

  const currentPrice = btcPrice.price;
  const priceAtBet = bet.priceAtBet;

  if (currentPrice === priceAtBet) {
    console.log(`price unchanged, will retry`);
    return { settled: false };
  }

  const won =
    bet.direction === 'UP'
      ? currentPrice > priceAtBet
      : currentPrice < priceAtBet;

  const status = won ? 'WON' : 'LOST';

  const { errors } = await client.models.Bet.update({
    id: betId,
    priceAtSettlement: currentPrice,
    status,
  });

  if (errors) {
    console.error(`failed to update bet ${betId}`, errors);
    return { settled: false };
  }

  console.log(
    `${betId}, dir: ${bet.direction}, price: ${priceAtBet} -> ${currentPrice}, status: ${status}`
  );

  return { settled: true };
};
