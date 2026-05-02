// Test inspection commands: snapshot, highlight, console, network
// App: https://demo.playwright.dev/todomvc/

await page.goto('https://demo.playwright.dev/todomvc/')
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('Buy groceries')
await page.keyboard.press('Enter')

// Snapshot
page.ariaSnapshot ? await page.ariaSnapshot({ mode: 'ai' }) : await page.title()

// Highlight
await page.getByText('Buy groceries').highlight()

// Console and network (set up listeners, then read)
if (!page.__relay) { page.__relay = { console: [], network: [] }; page.on('console', (msg) => { page.__relay.console.push('[' + msg.type() + '] ' + msg.text()); }); page.on('response', (resp) => { const req = resp.request(); page.__relay.network.push({ status: resp.status(), method: req.method(), url: resp.url(), type: req.resourceType() }); }); }
page.__relay.console.length === 0 ? 'No console messages (listening...)' : page.__relay.console.join('\n')
page.__relay.network.length === 0 ? 'No network requests (listening...)' : page.__relay.network.map(r => r.status + ' ' + r.method + ' ' + r.url).join('\n')

// Verify visible
await expect(page.getByRole('textbox', { name: 'What needs to be done?' })).toBeVisible()

// Cleanup
await page.evaluate(() => localStorage.clear())
