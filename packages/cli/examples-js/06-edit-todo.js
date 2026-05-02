// Double-click to edit a todo
// App: https://demo.playwright.dev/todomvc/

await page.goto('https://demo.playwright.dev/todomvc/')
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Buy groceries')
await page.keyboard.press('Enter')
await page.getByText('Buy groceries', { exact: true }).dblclick()
await page.keyboard.press('Control+a')
await page.keyboard.type('Buy organic groceries')
await page.keyboard.press('Enter')
await expect(page.getByText('Buy organic groceries')).toBeVisible()

// Cleanup
await page.evaluate(() => localStorage.clear())
