const puppeteer = require('puppeteer');
const fs = require('fs');

// Konfigurasi
const CONFIG = {
  baseUrl: 'https://lms.itmnganjuk.ac.id',
  nim: process.env.LMS_NIM,
  password: process.env.LMS_PASSWORD,
  outputFile: './courses-data.json',
  headless: false,
  timeout: 30000
};

if (!CONFIG.nim || !CONFIG.password) {
  throw new Error('Set LMS_NIM and LMS_PASSWORD before running the legacy scraper.');
}

async function scrapeCourses() {
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

    // LOGIN
    console.log('\n=== STEP 1: LOGIN ===');
    console.log('Navigasi ke halaman login...');
    await page.goto(`${CONFIG.baseUrl}/login/index.php`, { waitUntil: 'networkidle2' });

    console.log('Mengisi form login...');
    await page.type('input[name="username"]', CONFIG.nim, { delay: 50 });
    await page.type('input[name="password"]', CONFIG.password, { delay: 50 });

    console.log('Submit form login...');
    await Promise.all([
      page.click('button[type="submit"], input[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {})
    ]);

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Kalau masih di login page, redirect ke courses
    const currentUrl = page.url();
    if (currentUrl.includes('/login/')) {
      console.log('Redirect ke courses page...');
      await page.goto(`${CONFIG.baseUrl}/my/courses.php`, { waitUntil: 'networkidle0' });
    }

    const pageTitle = await page.title();
    console.log('✅ Login sukses! Page:', pageTitle);

    // GET ALL COURSES
    console.log('\n=== STEP 2: AMBIL DAFTAR COURSES ===');
    await page.waitForSelector('body', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const courseLinks = await page.evaluate(() => {
      const links = [];
      // Ambil semua course links
      document.querySelectorAll('a[href*="/course/view.php?id="]').forEach(link => {
        const href = link.href;
        const courseName = link.textContent.trim();
        if (href && courseName && !links.find(l => l.href === href)) {
          links.push({ href, courseName });
        }
      });
      return links;
    });

    console.log(`Ditemukan ${courseLinks.length} courses`);

    // SCRAPE EACH COURSE
    console.log('\n=== STEP 3: SCRAPE KONTEN SETIAP COURSE ===');
    const coursesData = [];

    for (let i = 0; i < courseLinks.length; i++) {
      const { href, courseName } = courseLinks[i];
      console.log(`\n[${i + 1}/${courseLinks.length}] Scraping: ${courseName}`);

      try {
        await page.goto(href, { waitUntil: 'networkidle0', timeout: 15000 });
        await new Promise(resolve => setTimeout(resolve, 1500));

        const courseData = await page.evaluate(() => {
          const data = {
            title: document.querySelector('.page-title-bar h1, .page-header h1')?.textContent?.trim() || 'Unknown',
            url: window.location.href,
            sections: [],
            activities: [],
            announcements: [],
            assignments: [],
            resources: []
          };

          // Extract course sections
          document.querySelectorAll('.section, [data-sectionid]').forEach((section, idx) => {
            const sectionTitle = section.querySelector('.sectionname, h3, .coltitle')?.textContent?.trim() || `Section ${idx}`;
            const sectionContent = section.querySelector('.content, .section-content')?.textContent?.trim() || '';

            const sectionData = {
              title: sectionTitle,
              content: sectionContent.substring(0, 200),
              activities: []
            };

            // Extract activities dalam section
            section.querySelectorAll('.activity, li.activity').forEach(activity => {
              const actName = activity.querySelector('.instancename, a')?.textContent?.trim() || 'Unknown activity';
              const actType = activity.querySelector('[class*="modtype"]')?.textContent?.trim() || '';
              const actLink = activity.querySelector('a')?.href || '';

              if (actName) {
                sectionData.activities.push({
                  name: actName,
                  type: actType,
                  link: actLink
                });
              }
            });

            data.sections.push(sectionData);
          });

          // Extract all activities/resources
          document.querySelectorAll('.activity, li.activity').forEach(activity => {
            const name = activity.querySelector('.instancename, a')?.textContent?.trim() || '';
            const type = activity.classList.toString().match(/type_(\w+)/) ? activity.classList.toString().match(/type_(\w+)/)[1] : '';
            const link = activity.querySelector('a')?.href || '';

            if (name) {
              if (type.includes('assign')) {
                data.assignments.push({ name, type, link });
              } else if (type.includes('resource') || type.includes('page') || type.includes('url')) {
                data.resources.push({ name, type, link });
              } else {
                data.activities.push({ name, type, link });
              }
            }
          });

          // Extract announcements/news
          document.querySelectorAll('.news-item, .announcement, [class*="post"]').forEach(item => {
            const title = item.querySelector('h3, h4, .title')?.textContent?.trim() || '';
            const content = item.querySelector('.content, p')?.textContent?.trim() || '';

            if (title) {
              data.announcements.push({
                title,
                content: content.substring(0, 150)
              });
            }
          });

          return data;
        });

        coursesData.push({
          courseName,
          courseUrl: href,
          scrapedAt: new Date().toISOString(),
          ...courseData
        });

        console.log(`   ✓ ${courseData.sections.length} sections, ${courseData.activities.length} activities, ${courseData.assignments.length} assignments`);

      } catch (error) {
        console.log(`   ✗ Error: ${error.message}`);
        coursesData.push({
          courseName,
          courseUrl: href,
          error: error.message
        });
      }
    }

    // SAVE RESULTS
    console.log('\n=== STEP 4: SIMPAN HASIL ===');
    const finalData = {
      timestamp: new Date().toISOString(),
      totalCourses: coursesData.length,
      courses: coursesData
    };

    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(finalData, null, 2));

    console.log(`\n✅ Sukses! Data disimpan ke: ${CONFIG.outputFile}`);
    console.log(`Total courses scraped: ${coursesData.length}`);

    // Print summary
    console.log('\n=== SUMMARY ===');
    coursesData.forEach((course, idx) => {
      if (!course.error) {
        console.log(`${idx + 1}. ${course.courseName}`);
        console.log(`   Sections: ${course.sections.length}, Activities: ${course.activities.length}, Assignments: ${course.assignments.length}`);
      }
    });

  } catch (error) {
    console.error('❌ Fatal Error:', error.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run scraper
scrapeCourses();
