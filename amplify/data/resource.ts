import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { btcPriceListener } from '../functions/btc-price-listener/resource';
import { placeBet } from '../functions/place-bet/resource';

const schema = a
  .schema({
    BtcPrice: a
      .model({
        ticker: a.string().required().default('BTCUSDT'),
        price: a.float().required(),
        timestamp: a.datetime().required(),
      })
      .authorization((allow) => [allow.publicApiKey(), allow.guest()]),
    Bet: a
      .model({
        userId: a.string().required(),
        direction: a.enum(['UP', 'DOWN']),
        priceAtBet: a.float().required(),
        priceAtSettlement: a.float(),
        status: a.enum(['PENDING', 'WON', 'LOST', 'CANCELED']),
        placedAt: a.datetime().required(),
        settlesAt: a.datetime().required(),
      })
      .authorization((allow) => [allow.publicApiKey(), allow.guest()]),
    placeBet: a
      .mutation()
      .arguments({ direction: a.enum(['UP', 'DOWN']) })
      .returns(a.ref('Bet'))
      .handler(a.handler.function(placeBet))
      .authorization((allow) => [allow.guest()]),
  })
  .authorization((allow) => [
    allow.resource(btcPriceListener),
    allow.resource(placeBet),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'identityPool',
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});
