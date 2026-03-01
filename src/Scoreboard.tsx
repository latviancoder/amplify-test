import { useEffect, useMemo, useState } from 'react';
import { client } from './client';
import { useAuthSession } from './AuthSessionProvider';
import type { Schema } from '../amplify/data/resource';

type Bet = Schema['Bet']['type'];

function Scoreboard() {
  const [bets, setBets] = useState<Bet[]>([]);
  const session = useAuthSession();
  const userId = session.identityId;

  useEffect(() => {
    const sub = client.models.Bet.observeQuery().subscribe({
      next: ({ items }) => {
        const settled = items
          // canceled bets are not shown on the scoreboard
          .filter((b) => b.status === 'WON' || b.status === 'LOST')
          .sort(
            (a, b) =>
              new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime()
          );
        setBets(settled);
      },
    });

    return () => sub.unsubscribe();
  }, []);

  const leaderboard = useMemo(() => {
    const byUser = new Map<string, Bet[]>();
    for (const bet of bets) {
      const list = byUser.get(bet.userId) ?? [];
      list.push(bet);
      byUser.set(bet.userId, list);
    }

    if (userId && !byUser.has(userId)) {
      byUser.set(userId, []);
    }

    return Array.from(byUser.entries())
      .map(([id, userBets]) => {
        const wins = userBets.filter((b) => b.status === 'WON').length;
        const losses = userBets.filter((b) => b.status === 'LOST').length;
        return { id, bets: userBets, wins, losses, score: wins - losses };
      })
      .sort((a, b) => b.score - a.score);
  }, [bets, userId]);

  return (
    <div style={{ marginTop: 32 }}>
      <h2>Scoreboard</h2>
      {leaderboard.map((entry) => {
        const label = entry.id === userId ? 'You' : `...${entry.id.slice(-6)}`;
        const scoreColor =
          entry.score > 0 ? 'green' : entry.score < 0 ? 'red' : undefined;

        return (
          <details key={entry.id} className="scoreboard-entry">
            <summary>
              <strong>{label}</strong>
              <span style={{ color: scoreColor, marginLeft: 8 }}>
                {entry.score > 0 ? '+' : ''}
                {entry.score}
              </span>
            </summary>
            <table>
              <thead>
                <tr>
                  <th>Direction</th>
                  <th>Prices</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {entry.bets.map((bet) => {
                  const resultColor = bet.status === 'WON' ? 'green' : 'red';
                  return (
                    <tr key={bet.id}>
                      <td>{bet.direction}</td>
                      <td>
                        ${bet.priceAtBet.toLocaleString()}
                        {bet.priceAtSettlement != null &&
                          ` → $${bet.priceAtSettlement.toLocaleString()}`}
                      </td>
                      <td style={{ color: resultColor, fontWeight: 'bold' }}>
                        {bet.status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        );
      })}
    </div>
  );
}

export { Scoreboard };
