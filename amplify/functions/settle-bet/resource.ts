import { defineFunction } from '@aws-amplify/backend';

export const settleBet = defineFunction({
  name: 'settle-bet',
  entry: './settle-bet.ts',
  timeoutSeconds: 30,
});
