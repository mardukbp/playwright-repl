// Add todos and verify they appear
// App: https://demo.playwright.dev/todomvc/

await page.goto('https://demo.playwright.dev/todomvc/')
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Buy groceries')
await page.keyboard.press('Enter')
await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Write tests')
await page.keyboard.press('Enter')
await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Deploy to production')
await page.keyboard.press('Enter')
await expect(page.getByText('Buy groceries')).toBeVisible()
await expect(page.getByText('Write tests')).toBeVisible()
await expect(page.getByText('Deploy to production')).toBeVisible()
await expect(page.getByText('3 items left')).toBeVisible()

// Cleanup
await page.evaluate(() => localStorage.clear())
