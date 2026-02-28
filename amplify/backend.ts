import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { btcPriceListener } from './functions/btc-price-listener/resource';
import { placeBet } from './functions/place-bet/resource';

const backend = defineBackend({
  auth,
  data,
  btcPriceListener,
  placeBet,
});

// enable introspection for testing purposes (apollo graphql sandbox)
const { cfnGraphqlApi } = backend.data.resources.cfnResources;
cfnGraphqlApi.introspectionConfig = 'ENABLED';
