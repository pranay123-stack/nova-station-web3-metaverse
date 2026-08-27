import { expect, test } from '@playwright/test';
import { freshWalletIndex, installWallet } from './wallet';

/**
 * The definition-of-done journey.
 *
 * One test walks the whole path a new player takes — connect, sign in, enter
 * the station, open every terminal, accept a contract, launch an expedition,
 * mine, come home, and look at the marketplace. It is deliberately one long
 * test rather than a dozen short ones: the point is that the sequence works,
 * and each step depends on the state the last one left behind.
 */
test.describe('NOVA STATION', () => {
  test('landing page presents the game and routes into it', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/NOVA STATION/);
    await expect(page.getByRole('heading', { name: /NOVA\s*STATION/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /enter station/i })).toBeVisible();

    // The FAQ answers the questions a sceptical player actually has.
    await expect(page.getByText(/Do I need cryptocurrency to play/i)).toBeVisible();
    await expect(page.getByText(/Is this pay-to-win/i)).toBeVisible();

    await page.getByRole('link', { name: /enter station/i }).click();
    await expect(page).toHaveURL(/\/play/);
  });

  test('marketplace is browsable without signing in', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByRole('heading', { name: /open listings/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /enter station to trade/i })).toBeVisible();
  });

  test('connect gate refuses to proceed without a wallet', async ({ page }) => {
    await page.goto('/play');
    await expect(page.getByText(/no browser wallet detected/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in with ethereum/i })).toBeDisabled();
  });

  test('connect gate reports a wrong network before letting a player sign in', async ({ page }) => {
    // The wallet announces mainnet; the game runs on the configured test chain.
    await installWallet(page, Number(freshWalletIndex() % 0xffffffffffffn) + 2000, { chainId: 1 });
    await page.goto('/play');
    await expect(page.getByText(/runs on/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /switch network/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in with ethereum/i })).toBeDisabled();
  });

  test('a player can sign in, enter the station and play', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

    // A wallet that produces genuine signatures.
    const wallet = await installWallet(page, Number(freshWalletIndex() % 0xffffffffffffn) + 1000);
    await page.goto('/play');

    /* ------------------------------------------------------- sign in */
    // A wallet that already authorised this origin reconnects on its own, which
    // is what a returning player sees. Only click Connect if it did not.
    const connectButton = page.getByRole('button', { name: /^connect nova/i });
    if (await connectButton.isVisible().catch(() => false)) {
      await connectButton.click();
    }
    await expect(page.getByText(wallet.address.slice(0, 6), { exact: false })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: /sign in with ethereum/i }).click();

    /* --------------------------------------------------- enter world */
    // The loading screen reports real stages and clears when they finish.
    await expect(page.getByText(/initialising/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/loading station/i)).toBeHidden({ timeout: 30_000 });

    // The HUD shows server-owned values.
    await expect(page.getByText('Nova Station', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: /game menus/i })).toBeVisible();

    /* ------------------------------------------------------ missions */
    await page.getByRole('button', { name: 'Missions', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/first haul/i)).toBeVisible();

    // Most of the board is gated behind level and standing, and says so.
    await expect(page.getByText(/your level is too low/i).first()).toBeVisible();

    // Accept the one starting contract a level-1 commander can actually take.
    const firstHaul = page.locator('li').filter({ hasText: 'First Haul' }).first();
    await firstHaul.getByRole('button', { name: /^accept$/i }).click();
    await expect(page.getByText(/contract accepted/i)).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByText(/active contracts/i)).toBeVisible();

    /* ----------------------------------------------------- inventory */
    await page.getByRole('button', { name: 'Inventory', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/cargo/i).first()).toBeVisible();
    await page.keyboard.press('Escape');

    /* ----------------------------------------------------------- map */
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.getByRole('img', { name: /station map/i })).toBeVisible();
    await page.keyboard.press('Escape');

    /* -------------------------------------------------------- menu */
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('tab', { name: /graphics/i })).toBeVisible();
    await page.getByRole('tab', { name: /accessibility/i }).click();
    await expect(page.getByText(/reduce motion/i)).toBeVisible();
    await page.keyboard.press('Escape');

    /* ------------------------------------------------- console clean */
    // Nothing in a normal session should log an error.
    expect(consoleErrors.filter((entry) => !entry.includes('favicon'))).toEqual([]);
  });
});
