const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function findEmails(domain) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    );

    if (!/^https?:\/\//i.test(domain)) {
        domain = 'http://' + domain;
    }

    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(`Email of ${domain}`)}&t=h_&ia=web`;

    try {
        console.log(`Navigating to: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait a little for results to appear
        await new Promise(r => setTimeout(r, 3000));

        // Extract emails from visible page text
        const emails = await page.evaluate(() => {
            const text = document.body.innerText || '';
            const regex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
            const found = text.match(regex) || [];
            return [...new Set(found)].slice(0, 5);
        });

        // Take a screenshot for debugging
        await page.screenshot({ path: `${domain.replace(/[^a-zA-Z0-9]/g, '_')}_search.png` });

        await browser.close();
        return { domain, emails };
    } catch (error) {
        try {
            // Try to take a screenshot even if there was an error
            await page.screenshot({ path: `${domain.replace(/[^a-zA-Z0-9]/g, '_')}_error.png` });
        } catch (e) {
            console.error("Couldn't take error screenshot:", e.message);
        }
        await browser.close();
        return { domain, error: error.message };
    }
}

// Test domains
const testDomains = [
    'microsoft.com',
    'apple.com',
    'github.com',
    'wikipedia.org',
    'amazon.com'
];

async function runTests() {
    console.log('Starting email search tests...');

    const results = [];

    for (const domain of testDomains) {
        console.log(`\nTesting: ${domain}`);
        const result = await findEmails(domain);
        results.push(result);

        if (result.error) {
            console.log(`Error for ${domain}: ${result.error}`);
        } else {
            console.log(`Emails found for ${domain}:`, result.emails.length ? result.emails : 'No emails found');
        }
    }

    console.log('\n\nSummary of results:');
    for (const result of results) {
        if (result.error) {
            console.log(`${result.domain}: Error - ${result.error}`);
        } else {
            console.log(`${result.domain}: ${result.emails.length} emails found - ${result.emails.join(', ')}`);
        }
    }
}

runTests();
