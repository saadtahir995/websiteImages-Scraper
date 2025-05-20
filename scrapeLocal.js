const { chromium } = require('playwright');
const readline = require('readline');

async function scrapeLocalServices(query, page = 1) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const pageObj = await context.newPage();

    const encodedQuery = encodeURIComponent(query);
    let url = `https://www.google.com/localservices/prolist?g2lbs=AOHF13l1nKXJyeo2Y1vrUsqbzm7nMGGqt9wU47bg_QV2aChhU80cGr1gmgxzmXE3Ica0abC84lU7&ssta=1&q=${encodedQuery}&oq=${encodedQuery}&src=2&serdesk=1`;

    if (page > 1) {
        url += `&lci=${20 * (page - 1)}`;
    }

    await pageObj.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // CAPTCHA detection
    const bodyText = await pageObj.textContent('body');
    const hasCaptcha = bodyText.includes("unusual traffic") || bodyText.includes("not a robot");
    const hasRecaptcha = await pageObj.$('iframe[src*="recaptcha"]');

    if (hasCaptcha || hasRecaptcha) {
        await browser.close();
        return { error: 'captcha' };
    }

    // Scroll to load more listings
    let prevHeight = 0;
    while (true) {
        const currentHeight = await pageObj.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
            return document.body.scrollHeight;
        });

        if (currentHeight === prevHeight) break;
        prevHeight = currentHeight;
        await pageObj.waitForTimeout(2000);
    }

    // Scrape local service results
    const results = await pageObj.evaluate(({ query, pageNumber }) => {
        const items = document.querySelectorAll("div[jscontroller='xkZ6Lb']");
        const phoneRegex = /^[+()?\d\s-]+$/;
        let data = [];

        items.forEach(e => {
            if (e.querySelector("span.uDmIZc")) return;

            const nameDiv = e.querySelector("div.rgnuSb.xYjf2e");
            const name = nameDiv ? nameDiv.innerText.trim() : "N/A";

            let website = "N/A";
            const websiteAnchor = e.querySelector('span[jsname="V67aGc"].VfPpkd-vQzf8d');
            if (websiteAnchor) {
                const anchor = websiteAnchor.closest("a");
                if (anchor && anchor.href && !anchor.href.includes("maps.google.com")) {
                    website = anchor.href.trim();
                }
            }

            let phone = "N/A", category = "N/A", address = "N/A";
            let foundPhone = false, foundCategory = false, foundAddress = false;

            e.querySelectorAll("span.hGz87c").forEach(span => {
                const text = span.innerText.trim();
                const lower = text.toLowerCase();

                if (lower.includes("open") || lower.includes("closed")) return;

                if (!foundPhone && phoneRegex.test(text)) {
                    phone = text;
                    foundPhone = true;
                } else if (!foundCategory) {
                    category = text;
                    foundCategory = true;
                } else if (!foundAddress) {
                    address = text;
                    foundAddress = true;
                }
            });

            let reviews = "N/A";
            const reviewElement = e.querySelector("div.leIgTe");
            if (reviewElement) {
                reviews = reviewElement.innerText.replace(/[()]/g, "").trim();
            }

            const ratingDiv = e.querySelector("div.rGaJuf");
            const rating = ratingDiv ? ratingDiv.innerText.trim() : "N/A";

            data.push({
                name,
                phone,
                category,
                address,
                website,
                reviews,
                rating,
                page: pageNumber,
                keyword: query
            });
        });

        let totalResults = data.length;
        const countEl = document.querySelector("div.AIYI7d");
        if (countEl?.getAttribute("aria-label")) {
            const match = countEl.getAttribute("aria-label").match(/of\s+([\d,]+)/i);
            if (match && match[1]) {
                totalResults = parseInt(match[1].replace(/,/g, ""), 10);
            }
        }

        return { data, total: totalResults };
    }, { query, page });

    await browser.close();
    return results;
}

// User input via readline
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question("Enter search query (e.g., 'electrician in chicago'): ", (query) => {
    rl.question("Enter page number (default = 1): ", (pageInput) => {
        const pageNum = parseInt(pageInput) || 1;

        scrapeLocalServices(query, pageNum)
            .then((result) => {
                console.log("\n=== Scraping Results ===");
                console.log(JSON.stringify(result, null, 2));
                rl.close();
            })
            .catch((err) => {
                console.error("❌ Error:", err);
                rl.close();
            });
    });
});
