import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { btcPriceListener } from '../functions/btc-price-listener/resource';
import { placeBet } from '../functions/place-bet/resource';
import { settleBet } from '../functions/settle-bet/resource';

const schema = a
  .schema({
    Direction: a.enum(['UP', 'DOWN']),
    BetStatus: a.enum(['PENDING', 'WON', 'LOST', 'CANCELED']),
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
        direction: a.ref('Direction').required(),
        priceAtBet: a.float().required(),
        priceAtSettlement: a.float(),
        status: a.ref('BetStatus').required(),
        placedAt: a.datetime().required(),
        settlesAt: a.datetime().required(),
      })
      .authorization((allow) => [allow.publicApiKey(), allow.guest()]),
    placeBet: a
      .mutation()
      .arguments({ direction: a.ref('Direction').required() })
      .returns(a.ref('Bet'))
      .handler(a.handler.function(placeBet))
      .authorization((allow) => [allow.guest()]),
  })
  .authorization((allow) => [
    allow.resource(btcPriceListener),
    allow.resource(placeBet),
    allow.resource(settleBet),
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
