// Test localStorage commands
// App: https://demo.playwright.dev/todomvc/

await page.goto('https://demo.playwright.dev/todomvc/')
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Buy groceries')
await page.keyboard.press('Enter')
await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Write tests')
await page.keyboard.press('Enter')
await expect(page.getByText('2 items left')).toBeVisible()

// Verify localStorage has data
JSON.stringify(await page.evaluate(() => { const r = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); r[k] = localStorage.getItem(k); } return r; }))

// Clear and verify empty
await page.evaluate(() => localStorage.clear())
JSON.stringify(await page.evaluate(() => { const r = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); r[k] = localStorage.getItem(k); } return r; }))
await page.reload()

// After reload with empty storage, todos should be gone
await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Fresh todo')
await page.keyboard.press('Enter')
await expect(page.getByText('1 item left')).toBeVisible()

// Cleanup
await page.evaluate(() => localStorage.clear())
