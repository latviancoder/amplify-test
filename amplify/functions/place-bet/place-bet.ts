import type { Schema } from '../../data/resource';
import { client } from '../../client';
import { env } from '$amplify/env/place-bet';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';
import {
  SchedulerClient,
  CreateScheduleCommand,
} from '@aws-sdk/client-scheduler';

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const schedulerClient = new SchedulerClient();

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

  // Schedule settle-bet to fire at settlesAt
  const scheduleExpression = `at(${settlesAt.toISOString().replace(/\.\d{3}Z$/, '')})`;

  console.log({ scheduleExpression });

  try {
    await schedulerClient.send(
      new CreateScheduleCommand({
        Name: `settle-bet-${bet!.id}`,
        GroupName: env.SCHEDULE_GROUP_NAME,
        ScheduleExpression: scheduleExpression,
        ScheduleExpressionTimezone: 'UTC',
        FlexibleTimeWindow: { Mode: 'OFF' },
        Target: {
          Arn: env.SETTLE_BET_FUNCTION_ARN,
          RoleArn: env.SCHEDULER_ROLE_ARN,
          Input: JSON.stringify({ betId: bet!.id }),
        },
        ActionAfterCompletion: 'DELETE',
      })
    );
  } catch (err) {
    console.error('Failed to create schedule, canceling bet:', err);
    await client.models.Bet.update({ id: bet!.id, status: 'CANCELED' });
    throw new Error('failed to schedule bet settlement');
  }

  return bet;
};
