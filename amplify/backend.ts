import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { btcPriceListener } from './functions/btc-price-listener/resource';
import { placeBet } from './functions/place-bet/resource';
import { settleBet } from './functions/settle-bet/resource';
import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

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

// 1. wait until 60s after the bet was placed.
// 2. invoke settle-bet lambda to check the price.
// 3. if price changed, the bet is settled (won/lost). done.
// 4. if price hasn't changed, wait 10s and retry from step 2.
// number 4 covers the requirement "The guess is resolved when the price changes",
// although unchanged btc price is probably highly unlikely.
// we retry forever which is A BAD IDEA. should add max retry limit or timeout.

const settleBetLambda = backend.settleBet.resources.lambda;
const placeBetLambda = backend.placeBet.resources.lambda;

const waitState = new sfn.Wait(placeBetLambda, 'WaitUntilSettlesAt', {
  time: sfn.WaitTime.timestampPath('$.settlesAt'),
});

const settleBetTask = new tasks.LambdaInvoke(
  placeBetLambda,
  'InvokeSettleBet',
  {
    lambdaFunction: settleBetLambda,
    payload: sfn.TaskInput.fromObject({
      betId: sfn.JsonPath.stringAt('$.betId'),
    }),
    resultPath: '$.result',
  }
);

const retryWait = new sfn.Wait(placeBetLambda, 'WaitForPriceChange', {
  time: sfn.WaitTime.duration(cdk.Duration.seconds(10)),
});

// we retry forever which is A BAD IDEA. should add max retry limit or timeout.
const isSettled = new sfn.Choice(placeBetLambda, 'IsBetSettled')
  .when(
    sfn.Condition.booleanEquals('$.result.Payload.settled', true),
    new sfn.Succeed(placeBetLambda, 'Done')
  )
  .otherwise(retryWait.next(settleBetTask));

const stateMachine = new sfn.StateMachine(
  placeBetLambda,
  'BetSettlementStateMachine',
  {
    definitionBody: sfn.DefinitionBody.fromChainable(
      waitState.next(settleBetTask).next(isSettled)
    ),
  }
);

stateMachine.grantStartExecution(placeBetLambda);

backend.placeBet.addEnvironment(
  'STATE_MACHINE_ARN',
  stateMachine.stateMachineArn
);
