import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { btcPriceListener } from './functions/btc-price-listener/resource';
import { placeBet } from './functions/place-bet/resource';
import { settleBet } from './functions/settle-bet/resource';
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

// --- Step Functions setup for settle-bet ---

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
  },
);

const stateMachine = new sfn.StateMachine(
  placeBetLambda,
  'BetSettlementStateMachine',
  {
    definitionBody: sfn.DefinitionBody.fromChainable(
      waitState.next(settleBetTask),
    ),
  },
);

stateMachine.grantStartExecution(placeBetLambda);

backend.placeBet.addEnvironment('STATE_MACHINE_ARN', stateMachine.stateMachineArn);
