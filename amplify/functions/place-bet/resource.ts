import { defineFunction } from '@aws-amplify/backend';

export const placeBet = defineFunction({
  name: 'place-bet',
  entry: './place-bet.ts',
});
