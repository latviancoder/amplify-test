import { test, expect } from '@playwright/test';
import { mockAppSync } from './helpers';

// generated all these tests using claude code, just to be sure that I'm not missing anything.
// mocking setup (especially `mockAppSync`) is quite complex because playwright can't mock websocket requests.

test.describe('mocked settlement', () => {
  test('shows BTC price', async ({ page }) => {
    await mockAppSync(page, { price: 100_000 });
    await page.goto('/');
    await expect(page.getByText('$100,000')).toBeVisible();
  });

  test('scoreboard renders', async ({ page }) => {
    await mockAppSync(page, { price: 50_000 });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Scoreboard' })
    ).toBeVisible();
  });

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

  test('shows error when bet placement fails', async ({ page }) => {
    const mock = await mockAppSync(page, { price: 50_000 });
    mock.rejectPlaceBet('you already have a pending bet');
    await page.goto('/');

    await page.getByRole('button', { name: 'UP' }).click();
    await expect(
      page.getByText('you already have a pending bet')
    ).toBeVisible();
    // buttons should re-enable after error
    await expect(page.getByRole('button', { name: 'UP' })).toBeEnabled();
  });

  test('DOWN bet settles as WON when price drops', async ({ page }) => {
    const mock = await mockAppSync(page, { price: 50_000 });
    await page.goto('/');

    await page.getByRole('button', { name: 'DOWN' }).click();
    await expect(page.getByText(/Bet placed: DOWN at \$50,000/)).toBeVisible();

    mock.settleBet('WON', 49_000);
    await page.reload();

    const youEntry = page.locator('details').filter({ hasText: 'You' });
    await youEntry.locator('summary').click();
    await expect(youEntry.getByText('WON')).toBeVisible();
    await expect(youEntry.getByText(/\$50,000 → \$49,000/)).toBeVisible();
  });

  test('scoreboard shows correct score after settlement', async ({ page }) => {
    const mock = await mockAppSync(page, { price: 50_000 });
    await page.goto('/');

    await page.getByRole('button', { name: 'UP' }).click();
    await expect(page.getByText(/Bet placed: UP/)).toBeVisible();

    mock.settleBet('WON', 51_000);
    await page.reload();

    const youEntry = page.locator('details').filter({ hasText: 'You' });
    await expect(youEntry.locator('summary')).toContainText('+1');
  });

  test('can place another bet after first one settles', async ({ page }) => {
    const mock = await mockAppSync(page, { price: 50_000 });
    await page.goto('/');

    await page.getByRole('button', { name: 'UP' }).click();
    await expect(page.getByText(/Bet placed: UP/)).toBeVisible();

    mock.settleBet('WON', 51_000);
    await page.reload();

    // buttons should be re-enabled after settlement
    await expect(page.getByRole('button', { name: 'UP' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'DOWN' })).toBeEnabled();

    // place a second bet
    await page.getByRole('button', { name: 'DOWN' }).click();
    await expect(page.getByText(/Bet placed: DOWN at \$50,000/)).toBeVisible();
  });

  test('rejects bet when price drifts before placement', async ({ page }) => {
    const mock = await mockAppSync(page, { price: 50_000 });
    await page.goto('/');
    await expect(page.getByText('$50,000')).toBeVisible();

    // server price changes after user sees $50,000
    mock.setPrice(50_100);

    await page.getByRole('button', { name: 'UP' }).click();
    await expect(
      page.getByText('price has changed since you saw it — please try again')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'UP' })).toBeEnabled();
  });

  test('bet stays pending when price is unchanged', async ({ page }) => {
    await mockAppSync(page, { price: 50_000 });
    await page.goto('/');

    await page.getByRole('button', { name: 'UP' }).click();
    await expect(page.getByText(/Bet placed: UP at \$50,000/)).toBeVisible();

    // don't call settleBet — price hasn't changed, bet should remain pending
    await page.reload();

    await expect(page.getByText(/Bet placed: UP at \$50,000/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'UP' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'DOWN' })).toBeDisabled();
  });
});
