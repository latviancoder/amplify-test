import { useEffect, useState } from 'react';
import type { Schema } from '../amplify/data/resource';
import { useAuthSession } from './AuthSessionProvider';
import { client } from './client';
import { Scoreboard } from './Scoreboard';
import { TICKER_ID } from '../amplify/constants';

type BtcPrice = Schema['BtcPrice']['type'];
type Bet = Schema['Bet']['type'];

function App() {
  const [price, setPrice] = useState<BtcPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBet, setActiveBet] = useState<Bet | null>(null);
  const [placing, setPlacing] = useState(false);
  const [betError, setBetError] = useState<string | null>(null);
  const session = useAuthSession();
  const userId = session.identityId;

  useEffect(() => {
    const sub = client.models.BtcPrice.observeQuery().subscribe({
      next: ({ items }) => {
        const match = items.find((p) => p.id === TICKER_ID);
        if (match) setPrice(match);
        setLoading(false);
      },
    });

    return () => sub.unsubscribe();
  }, []);

  // load any existing PENDING bet on mount
  useEffect(() => {
    client.models.Bet.list({
      filter: { userId: { eq: userId }, status: { eq: 'PENDING' } },
    }).then(({ data }) => {
      if (data.length > 0) setActiveBet(data[0]);
    });
  }, [userId]);

  // clear active bet when its status changes from PENDING
  useEffect(() => {
    if (!activeBet) return;

    const sub = client.models.Bet.onUpdate({
      filter: { id: { eq: activeBet.id } },
    }).subscribe({
      next: (updated) => {
        if (updated.status !== 'PENDING') setActiveBet(null);
      },
    });

    return () => sub.unsubscribe();
  }, [activeBet]);

  async function placeBet(direction: 'UP' | 'DOWN') {
    setPlacing(true);
    setBetError(null);
    try {
      const { data, errors } = await client.mutations.placeBet({
        direction,
        // we don't blindly trust this price on the backend
        priceAtBet: price!.price,
      });
      if (errors?.length) throw new Error(errors[0].message);
      if (data) setActiveBet(data as Bet);
    } catch (e) {
      setBetError(e instanceof Error ? e.message : 'Failed to place bet');
    } finally {
      setPlacing(false);
    }
  }

  if (loading) return <>Loading...</>;

  const betDisabled = placing || !!activeBet || !price;

  return (
    <div>
      <h1>BTC Price</h1>
      {price ? (
        <p>
          ${price.price.toLocaleString()} —{' '}
          {new Date(price.timestamp).toLocaleTimeString()}
        </p>
      ) : (
        <p>No price data yet</p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button disabled={betDisabled} onClick={() => placeBet('UP')}>
          UP
        </button>
        <button disabled={betDisabled} onClick={() => placeBet('DOWN')}>
          DOWN
        </button>
      </div>

      {betError && <p style={{ color: 'red' }}>{betError}</p>}

      {activeBet && (
        <p>
          Bet placed: {activeBet.direction} at $
          {activeBet.priceAtBet.toLocaleString()} — settles{' '}
          {new Date(activeBet.settlesAt).toLocaleTimeString()}
        </p>
      )}

      <Scoreboard />
    </div>
  );
}

export default App;
