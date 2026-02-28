import { useEffect, useState } from 'react';
import { client } from './client';
import { useAuthSession } from './AuthSessionProvider';
import { Scoreboard } from './Scoreboard';
import type { Schema } from '../amplify/data/resource';

type BtcPrice = Schema['BtcPrice']['type'];
type Bet = Schema['Bet']['type'];

const TICKER_ID = 'BTCUSDT';

function App() {
  const [price, setPrice] = useState<BtcPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBet, setActiveBet] = useState<Bet | null>(null);
  const [placing, setPlacing] = useState(false);
  const session = useAuthSession();
  const userId = session.identityId;

  useEffect(() => {
    client.models.BtcPrice.get({ id: TICKER_ID }).then(({ data }) => {
      if (data) setPrice(data);
      setLoading(false);
    });

    const sub = client.models.BtcPrice.onUpdate().subscribe({
      next: (updated) => setPrice(updated),
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
    try {
      const { data } = await client.mutations.placeBet({ direction });
      if (data) setActiveBet(data as Bet);
    } finally {
      setPlacing(false);
    }
  }

  if (loading) return <>Loading...</>;

  const betDisabled = placing || !!activeBet;

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
