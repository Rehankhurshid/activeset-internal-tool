const puppeteer = require('puppeteer');

(async () => {
  try {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    console.log("Browser launched. New page...");
    const page = await browser.newPage();
    console.log("Set content...");
    await page.setContent('<h1>Hello World</h1>', { waitUntil: 'domcontentloaded' });
    console.log("Generating PDF...");
    await page.pdf({ path: 'test.pdf', format: 'A4' });
    console.log("PDF generated successfully at test.pdf");
    await browser.close();
  } catch (e) {
    console.error("Puppeteer Failed:", e);
    process.exit(1);
  }
})();
