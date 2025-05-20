const { chromium } = require('playwright');

/**
 * Extract social media links from a website
 * @param {string} targetUrl - The website URL to extract social links from
 * @param {Object} options - Configuration options
 * @param {boolean} options.headless - Whether to run browser in headless mode (default: true)
 * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
 * @param {number} options.maxRetries - Maximum number of retries (default: 30)
 * @returns {Promise<Object>} - Object containing extracted social media links
 */
async function extractSocialLinks(targetUrl, options = {}) {
  // Default options
  const config = {
    headless: true, // Always use headless mode in environments without X server
    timeout: 30000,
    maxRetries: 30,
    ...options
  };

  // Normalize the URL
  let url = targetUrl.trim();
  if (!url.match(/^https?:\/\//i)) {
    url = "http://" + url;
  }
  
  console.log(`Extracting social links from: ${url}`);

  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  try {
    // Navigate to the target URL
    await page.goto(url, { timeout: config.timeout });
    
    // Initialize result object with empty values for each social platform
    const socialPlatforms = ['facebook', 'instagram', 'twitter', 'youtube', 'linkedin'];
    const result = socialPlatforms.reduce((acc, platform) => {
      acc[platform] = '';
      return acc;
    }, { contact: '' });
    
    // Helper function to check if we found any social links
    const hasSocialLinks = () => Object.values(result).some(value => value);
    
    // Helper function to extract links from an element
    const extractLinksFrom = async (element) => {
      const links = await element.$$('a[href]');
      for (const link of links) {
        const href = await link.getAttribute('href');
        if (!href) continue;
        
        const hrefLower = href.toLowerCase();
        
        // Check for social media links
        for (const platform of socialPlatforms) {
          if (!result[platform] && hrefLower.includes(`${platform}.com`)) {
            result[platform] = href;
          }
        }
        
        // Check for contact link
        if (!result.contact && 
            (hrefLower.includes('/contact') || 
             (await link.textContent()).toLowerCase().includes('contact'))) {
          result.contact = href;
        }
      }
    };
    
    // Main extraction function with retries
    let attempts = 0;
    
    while (attempts < config.maxRetries && !hasSocialLinks()) {
      attempts++;
      console.log(`🔁 Attempt ${attempts}/${config.maxRetries}`);
      
      try {
        // 1. Check header and footer
        const header = await page.$('header');
        const footer = await page.$('footer');
        
        if (header) await extractLinksFrom(header);
        if (footer) await extractLinksFrom(footer);
        
        // 2. Check structured data (application/ld+json)
        const jsonLdScripts = await page.$$('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
          try {
            const content = await script.textContent();
            const jsonData = JSON.parse(content);
            
            // Handle both direct sameAs and array of objects with sameAs
            let sameAs = jsonData.sameAs;
            if (!sameAs && Array.isArray(jsonData) && jsonData[0]) {
              sameAs = jsonData[0].sameAs;
            }
            
            if (sameAs) {
              const links = Array.isArray(sameAs) ? sameAs : [sameAs];
              for (const link of links) {
                const linkLower = link.toLowerCase();
                for (const platform of socialPlatforms) {
                  if (!result[platform] && linkLower.includes(`${platform}.com`)) {
                    result[platform] = link;
                  }
                }
              }
            }
          } catch (e) {
            // Ignore JSON parsing errors
          }
        }
        
        // 3. Check rel="me" links
        const relMeLinks = await page.$$('link[rel~="me"]');
        for (const link of relMeLinks) {
          const href = await link.getAttribute('href');
          if (!href) continue;
          
          const hrefLower = href.toLowerCase();
          for (const platform of socialPlatforms) {
            if (!result[platform] && hrefLower.includes(`${platform}.com`)) {
              result[platform] = href;
            }
          }
        }
        
        // 4. Check meta tags
        // Twitter
        const twitterSite = await page.$('meta[name="twitter:site"]');
        if (twitterSite && !result.twitter) {
          const content = await twitterSite.getAttribute('content');
          if (content) {
            result.twitter = content.trim();
          }
        }
        
        // OpenGraph see_also
        const ogSeeAlso = await page.$('meta[property="og:see_also"]');
        if (ogSeeAlso) {
          const content = await ogSeeAlso.getAttribute('content');
          if (content) {
            const links = content.split(',');
            for (const link of links) {
              const linkLower = link.toLowerCase();
              for (const platform of socialPlatforms) {
                if (!result[platform] && linkLower.includes(`${platform}.com`)) {
                  result[platform] = link.trim();
                }
              }
            }
          }
        }
        
        // 5. If still no results, check the entire document
        if (!hasSocialLinks()) {
          await extractLinksFrom(page);
        }
        
        // 6. Last resort: regex search in HTML
        if (!hasSocialLinks()) {
          const html = await page.content();
          for (const platform of socialPlatforms) {
            if (!result[platform]) {
              const regex = new RegExp(`(?:https?:)?\\/\\/[^"'>]*${platform}\\.com[\\w\\./?=&%-]*`, 'gi');
              const match = regex.exec(html);
              if (match) {
                result[platform] = match[0];
              }
            }
          }
        }
        
        console.log("🔍 SocialLinkFinder:", result);
        
        // If we found links or reached max attempts, break the loop
        if (hasSocialLinks() || attempts >= config.maxRetries) {
          break;
        }
        
        // Wait before next attempt
        await page.waitForTimeout(1000);
        
      } catch (error) {
        console.error(`Error in attempt ${attempts}:`, error.message);
        // Continue to next attempt
      }
    }
    
    return result;
    
  } catch (error) {
    console.error('Error extracting social links:', error);
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
    console.log('Usage: node social_link_extractor.js <website_url>');
    process.exit(1);
  }
  
  const targetUrl = process.argv[2];
  const result = await extractSocialLinks(targetUrl, { headless: true });
  
  console.log('\nResults:');
  console.log(JSON.stringify(result, null, 2));
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { extractSocialLinks };
