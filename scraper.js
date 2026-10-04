const puppeteer = require('puppeteer');
const fs = require('fs');

// Konfigurasi
const CONFIG = {
  baseUrl: 'https://lms.itmnganjuk.ac.id',
  nim: process.env.LMS_NIM,
  password: process.env.LMS_PASSWORD,
  outputFile: './dashboard-data.json',
  headless: false, // Set false jika ingin lihat browser
  timeout: 30000
};

if (!CONFIG.nim || !CONFIG.password) {
  throw new Error('Set LMS_NIM and LMS_PASSWORD before running the legacy scraper.');
}

async function scrapeDashboard() {
  let browser;
  try {
    console.log('Membuka browser...');
    browser = await puppeteer.launch({
      headless: CONFIG.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(CONFIG.timeout);
    page.setDefaultNavigationTimeout(CONFIG.timeout);

    console.log('Navigasi ke halaman login...');
    await page.goto(`${CONFIG.baseUrl}/login/index.php`, { waitUntil: 'networkidle2' });

    // Debug: extract form structure
    const formHtml = await page.evaluate(() => document.querySelector('form').outerHTML);
    console.log('Login form HTML:');
    console.log(formHtml.substring(0, 800));

    console.log('\nMengisi form login...');
    // Isi username (NIM)
    await page.type('input[name="username"]', CONFIG.nim, { delay: 50 });
    // Isi password
    await page.type('input[name="password"]', CONFIG.password, { delay: 50 });

    console.log('Submit form login...');
    // Click submit dan tunggu redirect
    await Promise.all([
      page.click('button[type="submit"], input[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {})
    ]);

    // Tunggu redirect selesai
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Kalau masih di login page, coba redirect manual ke dashboard
    const currentUrl = page.url();
    console.log('Current URL after login:', currentUrl);
    if (currentUrl.includes('/login/')) {
      console.log('Redirect manual ke dashboard...');
      await page.goto(`${CONFIG.baseUrl}/my/`, { waitUntil: 'networkidle0', timeout: 15000 });
    }

    console.log('Login berhasil! Scraping dashboard...');

    // Tunggu halaman load dengan lebih fleksibel
    await page.waitForSelector('body', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000)); // Tunggu render

    // Debug: Lihat struktur halaman
    const pageTitle = await page.title();
    const htmlStructure = await page.evaluate(() => document.documentElement.innerHTML.substring(0, 500));
    console.log('Page title:', pageTitle);

    // Scrape data dari dashboard
    const dashboardData = await page.evaluate(() => {
      const data = {
        timestamp: new Date().toISOString(),
        pageTitle: document.title,
        url: window.location.href,
        blocks: [],
        courses: [],
        announcements: []
      };

      // Scrape blocks (widget dashboard)
      const blocks = document.querySelectorAll('.block');
      blocks.forEach((block, index) => {
        const blockData = {
          id: block.getAttribute('id'),
          title: block.querySelector('.block-title, .block_title, h2, h3')?.textContent?.trim() || 'Untitled',
          content: block.querySelector('.content, .block-content')?.textContent?.trim() || ''
        };
        data.blocks.push(blockData);
      });

      // Scrape courses yang sedang diambil
      const courseElements = document.querySelectorAll(
        '.coursebox, [class*="course"], .course-card'
      );
      courseElements.forEach((course, index) => {
        const courseData = {
          name: course.querySelector('.coursename, h3, [class*="title"]')?.textContent?.trim() || 'Unknown',
          code: course.querySelector('[class*="code"]')?.textContent?.trim() || '',
          instructor: course.querySelector('[class*="instructor"], [class*="teacher"]')?.textContent?.trim() || '',
          link: course.querySelector('a')?.href || ''
        };
        if (courseData.name) {
          data.courses.push(courseData);
        }
      });

      // Scrape announcements
      const announcements = document.querySelectorAll(
        '.news-item, [class*="announcement"], .activity'
      );
      announcements.forEach((ann, index) => {
        const annData = {
          title: ann.querySelector('h3, .title, [class*="headline"]')?.textContent?.trim() || '',
          content: ann.querySelector('.content, p')?.textContent?.trim() || '',
          date: ann.querySelector('[class*="date"], time')?.textContent?.trim() || ''
        };
        if (annData.title) {
          data.announcements.push(annData);
        }
      });

      return data;
    });

    console.log('Menyimpan hasil ke file...');
    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(dashboardData, null, 2));

    console.log(`\n✅ Sukses! Data disimpan ke: ${CONFIG.outputFile}`);
    console.log(`Total blocks: ${dashboardData.blocks.length}`);
    console.log(`Total courses: ${dashboardData.courses.length}`);
    console.log(`Total announcements: ${dashboardData.announcements.length}`);

    return dashboardData;

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Jalankan scraper
scrapeDashboard();
