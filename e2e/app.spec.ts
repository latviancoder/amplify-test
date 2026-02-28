import { test, expect } from '@playwright/test';
import { mockAppSync, mockBtcPrice } from './helpers';

// generated all these test using claude code, just to be sure that I'm not missing anything.
// mocking setup (especially `mockAppSync`) is quite complex because playwright can't mock websocket requests.

test.describe('live backend', () => {
  test.beforeEach(async ({ page }) => {
    await mockBtcPrice(page, 100_000);
  });

  test('shows BTC price', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('$100,000')).toBeVisible();
  });

  test('can place an UP bet', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'UP' })).toBeEnabled();
    await page.getByRole('button', { name: 'UP' }).click();
    await expect(page.getByText(/Bet placed: UP at \$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'UP' })).toBeDisabled();
  });

  test('can place a DOWN bet', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'DOWN' })).toBeEnabled();
    await page.getByRole('button', { name: 'DOWN' }).click();
    await expect(page.getByText(/Bet placed: DOWN at \$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'DOWN' })).toBeDisabled();
  });

  test('buttons disabled during pending bet', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'UP' }).click();
    await expect(page.getByText(/Bet placed:/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'UP' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'DOWN' })).toBeDisabled();
  });

  test('bet settles as WON or LOST', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/');
    await page.getByRole('button', { name: 'UP' }).click();
    await expect(page.getByText(/Bet placed:/)).toBeVisible();

    // Wait for bet to settle (~60s) — the active bet text should disappear
    await expect(page.getByText(/Bet placed:/)).not.toBeVisible({
      timeout: 75_000,
    });

    // Expand the user's scoreboard entry to see bet details
    const youEntry = page.locator('details').filter({ hasText: 'You' });
    await youEntry.locator('summary').click();

    // Verify the latest bet resolved to WON or LOST
    const resultCell = youEntry.getByText(/^(WON|LOST)$/).first();
    await expect(resultCell).toBeVisible();

    const result = await resultCell.textContent();
    expect(result === 'WON' || result === 'LOST').toBe(true);
  });

  test('scoreboard renders', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Scoreboard' })
    ).toBeVisible();
  });
});

test.describe('mocked settlement', () => {
  test('bet settles as WON', async ({ page }) => {
    const mock = await mockAppSync(page, { price: 50_000 });
    await page.goto('/');

    await page.getByRole('button', { name: 'UP' }).click();
    await expect(page.getByText(/Bet placed: UP at \$50,000/)).toBeVisible();

    // Simulate settlement: price went up → UP bet WON
    mock.settleBet('WON', 51_000);
    await page.reload();

    const youEntry = page.locator('details').filter({ hasText: 'You' });
    await youEntry.locator('summary').click();
    await expect(youEntry.getByText('WON')).toBeVisible();
    await expect(youEntry.getByText(/\$50,000 → \$51,000/)).toBeVisible();
  });

  test('bet settles as LOST', async ({ page }) => {
    const mock = await mockAppSync(page, { price: 50_000 });
    await page.goto('/');

    await page.getByRole('button', { name: 'UP' }).click();
    await expect(page.getByText(/Bet placed: UP at \$50,000/)).toBeVisible();

    // Simulate settlement: price went down → UP bet LOST
    mock.settleBet('LOST', 49_000);
    await page.reload();

    const youEntry = page.locator('details').filter({ hasText: 'You' });
    await youEntry.locator('summary').click();
    await expect(youEntry.getByText('LOST')).toBeVisible();
    await expect(youEntry.getByText(/\$50,000 → \$49,000/)).toBeVisible();
  });
});
