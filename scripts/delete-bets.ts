import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import outputs from '../amplify_outputs.json';

Amplify.configure(outputs);

const client = generateClient<Schema>({
  authMode: 'apiKey',
});

let nextToken: string | null | undefined;

do {
  const { data: bets, nextToken: token } = await client.models.Bet.list({
    ...(nextToken ? { nextToken } : {}),
  });

  nextToken = token;

  for (const bet of bets) {
    await client.models.Bet.delete({ id: bet.id });
    console.log(`deleted ${bet.id} (${bet.status})`);
  }
} while (nextToken);

console.log('done');
