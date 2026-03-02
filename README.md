Deployment: https://main.d2at9x14doupc8.amplifyapp.com/

## Flow

A Lambda polls Binance for the price every ~30 seconds and wirtes it to DynamoDB. The frontend subscribes to that record through AppSync for live updates.

Tapping UP or DOWN calls a `placeBet` mutation. On the backend, the `place-bet` Lambda checks you don't already have a pending bet, grabs the actual price from DynamoDB (ignoring whatever the client sent), and rejects the bet if the price moved since you saw it. If everything checks out, it creates a `PENDING` bet that settles in 60 seconds and starts a Step Functions workflow.

That workflow just waits until settlement time, then runs the `settle-bet` Lambda. It looks at the current price vs what you locked in - if it moved in your direction, you win. If the price hasn't moved at all, it retries every 10 seconds until it does. If the price feed is stale (older than 2 minutes), the bet gets canceled.

Meanwhile the frontend is subscribed to updates on your bet. As soon as the status changes, the buttons unlock and you can go again. A separate subscription powers the scoreboard - everyone ranked by wins minus losses, with expandable bet history per user.

## Quesions/Issues

- Do we rely on our DB as source of truth for btc price, or do we completely rely on external API like binance? Each approach has pros and cons. Decision depends on use case.
- Listening to BTC price is done using lambda which reruns every 60sec and sleeps 30sec (should be something like fargate + websockets instead).
- There is a race condition that allows users to place multiple bets at the same time.
- If price didn't change after 1 minute, step function will retry every 10 seconds, but there is no timeout of retry limit.
- If bet is placed at 12:00:00, the settlement time is 12:01:00. If settlement step function is delayed a couple seconds and price changes during that moment - that's an issue. This could be fixed by storing price history instead of only current price.
