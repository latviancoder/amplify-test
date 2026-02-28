import { generateClient } from 'aws-amplify/data';
import type { Schema } from './data/resource';

export const client = generateClient<Schema>();
