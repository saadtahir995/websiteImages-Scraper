const { chromium } = require('playwright');

/**
 * Extract information from a Facebook business page
 * @param {string} facebookUrl - The Facebook page URL to scrape
 * @param {Object} options - Configuration options
 * @param {boolean} options.headless - Whether to run browser in headless mode (default: true)
 * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
 * @param {number} options.maxRetries - Maximum number of retries (default: 20)
 * @returns {Promise<Object>} - Object containing extracted Facebook page information
 */
async function scrapeFacebookProfile(facebookUrl, options = {}) {
  // Default options
  const config = {
    headless: true, // Always use headless mode in environments without X server
    timeout: 30000,
    maxRetries: 20,
    ...options
  };

  // Normalize the URL
  let url = facebookUrl.trim();
  if (!url.match(/^https?:\/\//i)) {
    url = "https://" + url;
  }
  
  // Limit URL length to prevent issues (similar to the extension's slice(0, 10) logic)
  url = url.split(/\s+/).slice(0, 10).join(" ");
  
  console.log(`Scraping Facebook profile: ${url}`);

  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  try {
    // Navigate to Facebook page
    await page.goto(url, { timeout: config.timeout });
    
    // Check for captcha
    const bodyText = await page.textContent('body');
    
    if (
      bodyText.includes('unusual traffic') || 
      bodyText.includes('not a robot') || 
      await page.locator('iframe[src*="recaptcha"]').count() > 0
    ) {
      console.log('Captcha detected!');
      return {
        error: 'captcha',
        url: url
      };
    }

    // Extract Facebook page information
    let retries = 0;
    let profileInfo = null;
    
    while (retries < config.maxRetries && !profileInfo) {
      console.log(`Facebook Profile Scraper: Attempt ${retries + 1}`);
      
      try {
        // Page name
        const pageNameElement = await page.locator('h1.html-h1').first();
        const pageName = await pageNameElement.count() > 0 ? await pageNameElement.innerText() : '';
        
        // Likes and followers
        const likesElement = await page.locator('a[href*="friends_likes"]').first();
        const followersElement = await page.locator('a[href*="followers"]').first();
        
        const pageLikes = await likesElement.count() > 0 ? await likesElement.innerText() : '';
        const pageFollowers = await followersElement.count() > 0 ? await followersElement.innerText() : '';
        
        // Email and website
        let email = '';
        let website = '';
        
        // Get all span elements with dir="auto" attribute
        const spanElements = await page.locator('span[dir="auto"]').all();
        for (const span of spanElements) {
          const text = await span.innerText();
          const trimmedText = text.trim();
          
          // Check for email
          if (!email && trimmedText.includes('@') && trimmedText.includes('.')) {
            email = trimmedText;
          }
          
          // Check for website
          if (!website && /^[\w.-]+\.[a-z]{2,}$/i.test(trimmedText)) {
            website = trimmedText;
          }
        }
        
        // Phone and address
        let phone = '';
        let address = '';
        
        // Target the specific div that contains contact info
        const contactDivs = await page.locator('div.x9f619.x1ja2u2z.x78zum5.x2lah0s.x1n2onr6.x1nhvcw1.x1qjc9v5.xozqiw3.x1q0g3np.xyamay9.xykv574.xbmpl8g.x4cne27.xifccgj').all();
        
        for (const div of contactDivs) {
          // Look for the image element that indicates phone or address
          const img = await div.locator('img.x1b0d499.xuo83w3').first();
          if (await img.count() === 0) continue;
          
          const imgSrc = await img.getAttribute('src') || '';
          const spanElement = await div.locator('span[dir="auto"]').first();
          if (await spanElement.count() === 0) continue;
          
          const spanText = await spanElement.innerText();
          
          // Check for phone (image with "Dc7-7AgwkwS.png" in src)
          if (!phone && imgSrc.includes('Dc7-7AgwkwS.png')) {
            phone = spanText.trim();
          }
          
          // Check for address (image with "8k_Y-oVxbuU.png" in src)
          if (!address && imgSrc.includes('8k_Y-oVxbuU.png')) {
            address = spanText.trim();
          }
        }
        
        // Category
        let category = '';
        
        // Try first method: span.x193iq5w span.html-strong
        const categoryElement = await page.locator('span.x193iq5w span.html-strong').first();
        
        if (await categoryElement.count() > 0) {
          const parentElement = await categoryElement.locator('xpath=..').first();
          if (await parentElement.count() > 0) {
            const parentText = await parentElement.innerText();
            category = parentText.replace(/Page\s*·\s*/, '').trim();
          }
        } 
        // Try alternative XPath method if first method fails
        else {
          const xpathResult = await page.locator('xpath=//span[contains(.,"Page") and contains(.,"·")]').first();
          if (await xpathResult.count() > 0) {
            const parentElement = await xpathResult.locator('xpath=..').first();
            if (await parentElement.count() > 0) {
              const parentText = await parentElement.innerText();
              category = parentText.replace(/Page\s*·\s*/, '').trim();
            }
          }
        }
        
        // Check if we found any information
        if (pageName || pageLikes || pageFollowers || phone || email || address || website || category) {
          profileInfo = {
            pageName: pageName || '',
            pageLikes: pageLikes || '',
            pageFollowers: pageFollowers || '',
            phone: phone || '',
            email: email || '',
            address: address || '',
            website: website || '',
            category: category || ''
          };
          break;
        }
      } catch (error) {
        console.error(`Error during extraction attempt ${retries + 1}:`, error.message);
      }
      
      // Wait and retry
      await page.waitForTimeout(1000);
      retries++;
    }
    
    // If no profile found after all retries, return empty values
    if (!profileInfo) {
      profileInfo = {
        pageName: '',
        pageLikes: '',
        pageFollowers: '',
        phone: '',
        email: '',
        address: '',
        website: '',
        category: ''
      };
    }
    
    return profileInfo;
    
  } catch (error) {
    console.error('Error scraping Facebook profile:', error);
    return {
      error: error.message,
      url: url
    };
  } finally {
    await browser.close();
  }
}

// Example usage
async function main() {
  if (process.argv.length < 3) {
    console.log('Usage: node facebook_scraper.js <facebook_page_url>');
    process.exit(1);
  }
  
  const facebookUrl = process.argv[2];
  const result = await scrapeFacebookProfile(facebookUrl, { headless: true });
  
  console.log('\nResults:');
  console.log(JSON.stringify(result, null, 2));
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { scrapeFacebookProfile };
