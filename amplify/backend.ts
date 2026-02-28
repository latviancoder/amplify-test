import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { btcPriceListener } from './functions/btc-price-listener/resource';
import { placeBet } from './functions/place-bet/resource';
import { settleBet } from './functions/settle-bet/resource';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';

const backend = defineBackend({
  auth,
  data,
  btcPriceListener,
  placeBet,
  settleBet,
});

// enable introspection for testing purposes (apollo graphql sandbox)
const { cfnGraphqlApi } = backend.data.resources.cfnResources;
cfnGraphqlApi.introspectionConfig = 'ENABLED';

// --- EventBridge Scheduler setup for settle-bet ---

const settleBetLambda = backend.settleBet.resources.lambda;
const placeBetLambda = backend.placeBet.resources.lambda;

// Schedule group for bet settlement schedules
const scheduleGroup = new scheduler.CfnScheduleGroup(
  placeBetLambda,
  'BetSettleScheduleGroup',
  { name: 'bet-settle-schedules' },
);

// IAM role that EventBridge Scheduler assumes to invoke settle-bet
const schedulerRole = new iam.Role(placeBetLambda, 'SchedulerRole', {
  assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
  inlinePolicies: {
    invokeLambda: new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          resources: [settleBetLambda.functionArn],
        }),
      ],
    }),
  },
});

// Grant place-bet Lambda permission to create schedules and pass the role
placeBetLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['scheduler:CreateSchedule'],
    resources: ['*'],
  }),
);

placeBetLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['iam:PassRole'],
    resources: [schedulerRole.roleArn],
  }),
);

// Pass env vars to place-bet so it can create schedules at runtime
backend.placeBet.addEnvironment(
  'SETTLE_BET_FUNCTION_ARN',
  settleBetLambda.functionArn,
);
backend.placeBet.addEnvironment('SCHEDULER_ROLE_ARN', schedulerRole.roleArn);
backend.placeBet.addEnvironment(
  'SCHEDULE_GROUP_NAME',
  scheduleGroup.name ?? 'bet-settle-schedules',
);
