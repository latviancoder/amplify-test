import type { Schema } from '../../data/resource';
import { client } from '../../client';
import { env } from '$amplify/env/place-bet';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const BET_SETTLE_TIME = 60 * 1000;

export const handler: Schema['placeBet']['functionHandler'] = async (event) => {
  const { direction } = event.arguments;
  const identity = event.identity as { cognitoIdentityId?: string } | undefined;
  const userId = identity?.cognitoIdentityId;

  if (!userId) {
    throw new Error('no user id');
  }

  // not atomic — there's a small race window between the check and the create,
  // but it requires the same user to fire two near-simultaneous requests
  const { data: existingBets } = await client.models.Bet.list({
    filter: {
      userId: { eq: userId },
      status: { eq: 'PENDING' },
    },
  });

  if (existingBets && existingBets.length > 0) {
    throw new Error('you already have a pending bet');
  }

  const { data: btcPrice } = await client.models.BtcPrice.get({
    id: 'BTCUSDT',
  });

  if (!btcPrice) {
    throw new Error('no btc price available');
  }

  const now = new Date();
  const settlesAt = new Date(now.getTime() + BET_SETTLE_TIME);

  const { data: bet, errors } = await client.models.Bet.create({
    userId,
    direction,
    priceAtBet: btcPrice.price,
    status: 'PENDING',
    placedAt: now.toISOString(),
    settlesAt: settlesAt.toISOString(),
  });

  if (errors) {
    throw new Error(`failed bet: ${JSON.stringify(errors)}`);
  }

  return bet;
};
