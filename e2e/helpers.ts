import type { Page } from '@playwright/test';

interface MockBet {
  id: string;
  userId: string;
  direction: 'UP' | 'DOWN';
  priceAtBet: number;
  priceAtSettlement: number | null;
  status: 'PENDING' | 'WON' | 'LOST' | 'CANCELED';
  placedAt: string;
  settlesAt: string;
}

function betResponse(bet: MockBet) {
  return {
    ...bet,
    createdAt: bet.placedAt,
    updatedAt: bet.placedAt,
    __typename: 'Bet',
  };
}

/**
 * Mock all AppSync GraphQL HTTP requests (queries + mutations).
 * Subscriptions use WebSocket and bypass this, but after calling
 * `settleBet()` + `page.reload()`, the next HTTP fetch returns
 * the settled state — giving deterministic WON/LOST control.
 */
export async function mockAppSync(page: Page, options: { price: number }) {
  const state = {
    bets: [] as MockBet[],
    capturedUserId: '',
    placeBetError: null as string | null,
    currentPrice: options.price,
  };

  await page.route('https://*.appsync-api.*.amazonaws.com/graphql', (route) => {
    const body = route.request().postData() ?? '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(body);
    } catch {
      return route.continue();
    }

    // Capture userId from filtered list queries
    const filterUserId = parsed.variables?.filter?.userId?.eq;
    if (filterUserId) {
      state.capturedUserId = filterUserId;
    }

    const btcPriceItem = {
      id: 'BTCUSDT',
      ticker: 'BTCUSDT',
      price: options.price,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      __typename: 'BtcPrice',
    };

    // BtcPrice get query
    if (body.includes('getBtcPrice')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getBtcPrice: btcPriceItem } }),
      });
    }

    // BtcPrice list query (used by observeQuery)
    if (body.includes('listBtcPrices')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            listBtcPrices: {
              items: [btcPriceItem],
              nextToken: null,
              __typename: 'ModelBtcPriceConnection',
            },
          },
        }),
      });
    }

    // placeBet mutation
    if (body.includes('placeBet')) {
      if (state.placeBetError) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { placeBet: null },
            errors: [{ message: state.placeBetError }],
          }),
        });
      }
      const direction = parsed.variables?.direction ?? 'UP';
      const clientPrice = parsed.variables?.priceAtBet;
      if (clientPrice !== undefined && clientPrice !== state.currentPrice) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { placeBet: null },
            errors: [{ message: 'price has changed since you saw it — please try again' }],
          }),
        });
      }
      const now = new Date();
      const bet: MockBet = {
        id: `mock-bet-${Date.now()}`,
        userId: state.capturedUserId || 'mock-user',
        direction,
        priceAtBet: clientPrice ?? state.currentPrice,
        priceAtSettlement: null,
        status: 'PENDING',
        placedAt: now.toISOString(),
        settlesAt: new Date(now.getTime() + 60_000).toISOString(),
      };
      state.bets.push(bet);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { placeBet: betResponse(bet) },
        }),
      });
    }

    // listBets query (used by Bet.list and observeQuery initial fetch)
    if (body.includes('listBets')) {
      let items = [...state.bets];
      const filter = parsed.variables?.filter;
      if (filter?.status?.eq) {
        items = items.filter((b) => b.status === filter.status.eq);
      }
      if (filter?.userId?.eq) {
        items = items.filter((b) => b.userId === filter.userId.eq);
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            listBets: {
              items: items.map(betResponse),
              nextToken: null,
              __typename: 'ModelBetConnection',
            },
          },
        }),
      });
    }

    return route.continue();
  });

  return {
    /** Mutate the mock bet in-place. Reload the page afterwards to pick up the change. */
    settleBet(status: 'WON' | 'LOST', priceAtSettlement: number) {
      const bet = state.bets[state.bets.length - 1];
      if (bet) {
        bet.status = status;
        bet.priceAtSettlement = priceAtSettlement;
      }
    },
    /** Make the next placeBet call return an error. */
    rejectPlaceBet(message: string) {
      state.placeBetError = message;
    },
    /** Change the server-side price (simulates drift). */
    setPrice(newPrice: number) {
      state.currentPrice = newPrice;
    },
  };
}
