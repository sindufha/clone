const puppeteer = require('puppeteer');
const fs = require('fs');

// Konfigurasi
const CONFIG = {
  baseUrl: 'https://lms.itmnganjuk.ac.id',
  nim: process.env.LMS_NIM,
  password: process.env.LMS_PASSWORD,
  outputFile: './assignments-data.json',
  headless: false,
  timeout: 30000
};

if (!CONFIG.nim || !CONFIG.password) {
  throw new Error('Set LMS_NIM and LMS_PASSWORD before running the legacy scraper.');
}

async function scrapeAssignments() {
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

    // SCRAPE ASSIGNMENTS FROM EACH COURSE
    console.log('\n=== STEP 3: SCRAPE ASSIGNMENTS DARI SETIAP COURSE ===');
    const allAssignments = [];

    for (let i = 0; i < courseLinks.length; i++) {
      const { href, courseName } = courseLinks[i];
      console.log(`\n[${i + 1}/${courseLinks.length}] Processing: ${courseName}`);

      try {
        await page.goto(href, { waitUntil: 'networkidle0', timeout: 15000 });
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Get assignment links dalam course
        const assignmentLinks = await page.evaluate(() => {
          const assignments = [];
          document.querySelectorAll('a[href*="/mod/assign/view.php"]').forEach(link => {
            const href = link.href;
            if (href && !assignments.find(a => a.href === href)) {
              assignments.push({
                href,
                title: link.textContent.trim()
              });
            }
          });
          return assignments;
        });

        console.log(`   Found ${assignmentLinks.length} assignments`);

        // SCRAPE EACH ASSIGNMENT
        for (let j = 0; j < assignmentLinks.length; j++) {
          const { href: assignmentUrl, title: assignmentTitle } = assignmentLinks[j];
          console.log(`   [${j + 1}/${assignmentLinks.length}] ${assignmentTitle}`);

          try {
            await page.goto(assignmentUrl, { waitUntil: 'networkidle0', timeout: 15000 });
            await new Promise(resolve => setTimeout(resolve, 1000));

            const assignmentData = await page.evaluate(() => {
              const data = {
                title: document.querySelector('h1, .page-title')?.textContent?.trim() || 'Unknown',
                url: window.location.href,
                description: '',
                startTime: '',
                dueDate: '',
                cutoffDate: '',
                gradeScale: '',
                submissionType: '',
                maxAttempts: '',
                grading: '',
                requiresSubmission: '',
                draftSubmission: '',
                onlineText: '',
                fileUpload: '',
                requiresGrading: '',
                points: '',
                status: '',
                submission: {},
                details: {}
              };

              // Extract description
              const descElement = document.querySelector('.description, [role="main"], [data-region="assignment-intro"]');
              if (descElement) {
                data.description = descElement.textContent.trim().substring(0, 500);
              }

              // Extract all key-value pairs from detail sections
              let dueDateFound = false;
              let startDateFound = false;
              let cutoffDateFound = false;

              // Try to find in all text elements
              document.querySelectorAll('*').forEach(el => {
                const text = el.textContent;
                if (text.includes('Due date') || text.includes('due date')) {
                  const next = el.nextElementSibling?.textContent || '';
                  if (next && !dueDateFound) {
                    data.dueDate = next.trim().substring(0, 100);
                    dueDateFound = true;
                  }
                }
                if (text.includes('Allow submissions from') || text.includes('allow submissions')) {
                  const next = el.nextElementSibling?.textContent || '';
                  if (next && !startDateFound) {
                    data.startTime = next.trim().substring(0, 100);
                    startDateFound = true;
                  }
                }
                if (text.includes('Cut-off date') || text.includes('cut-off')) {
                  const next = el.nextElementSibling?.textContent || '';
                  if (next && !cutoffDateFound) {
                    data.cutoffDate = next.trim().substring(0, 100);
                    cutoffDateFound = true;
                  }
                }
                if (text.includes('Maximum grade') || text.includes('maximum grade')) {
                  const match = text.match(/\d+(?:\.\d+)?/);
                  if (match) data.gradeScale = match[0];
                }
                if (text.includes('Submission type') || text.includes('submission type')) {
                  const next = el.nextElementSibling?.textContent || '';
                  if (next) data.submissionType = next.trim().substring(0, 100);
                }
              });

              // Extract from definition list if exists
              document.querySelectorAll('dt').forEach(dt => {
                const label = dt.textContent.toLowerCase();
                const dd = dt.nextElementSibling;
                if (dd) {
                  const value = dd.textContent.trim();
                  if (label.includes('due')) data.dueDate = data.dueDate || value;
                  if (label.includes('allow')) data.startTime = data.startTime || value;
                  if (label.includes('cut')) data.cutoffDate = data.cutoffDate || value;
                  if (label.includes('grade')) data.gradeScale = data.gradeScale || value;
                }
              });

              // Extract submission details
              const submissionArea = document.querySelector('[data-region="submission"], .submission');
              if (submissionArea) {
                data.submission.status = submissionArea.textContent.trim().substring(0, 150);
              }

              // Check status
              const statusElement = document.querySelector('[data-region="submission-status"]');
              if (statusElement) {
                data.status = statusElement.textContent.trim().substring(0, 100);
              }

              return data;
            });

            // Parse submission info from description
            if (assignmentData.description) {
              // Extract deadline info from description
              if (assignmentData.description.includes('overdue')) {
                const overdueMatch = assignmentData.description.match(/overdue by: ([\d\s\w:]+)/i);
                if (overdueMatch) assignmentData.overdueInfo = overdueMatch[1];
              }
              if (assignmentData.description.includes('late')) {
                const lateMatch = assignmentData.description.match(/(\d+\s+\w+\s+\d+\s+\w+\s+\d{1,2}:\d{2})\s+\w+/);
                if (lateMatch) assignmentData.submissionLateInfo = lateMatch[1];
              }
              // Extract submission status
              if (assignmentData.description.includes('Submitted for grading')) {
                assignmentData.submissionStatus = 'Submitted for grading';
              } else if (assignmentData.description.includes('No submissions')) {
                assignmentData.submissionStatus = 'No submissions';
              } else if (assignmentData.description.includes('Draft')) {
                assignmentData.submissionStatus = 'Draft saved';
              }
              // Extract grading status
              if (assignmentData.description.includes('Not graded')) {
                assignmentData.gradingStatus = 'Not graded';
              } else if (assignmentData.description.includes('Graded')) {
                const gradeMatch = assignmentData.description.match(/Graded\s*[\n\s]*([0-9.]+)/);
                if (gradeMatch) assignmentData.gradingStatus = 'Graded: ' + gradeMatch[1];
              }
            }

            allAssignments.push({
              courseName,
              courseUrl: href,
              assignmentTitle: assignmentTitle,
              assignmentUrl: assignmentUrl,
              scrapedAt: new Date().toISOString(),
              ...assignmentData
            });

            console.log(`      ✓ Scraped successfully`);

          } catch (error) {
            console.log(`      ✗ Error: ${error.message}`);
            allAssignments.push({
              courseName,
              courseUrl: href,
              assignmentTitle: assignmentTitle,
              assignmentUrl: assignmentUrl,
              error: error.message
            });
          }
        }

      } catch (error) {
        console.log(`   ✗ Course error: ${error.message}`);
      }
    }

    // SAVE RESULTS
    console.log('\n=== STEP 4: SIMPAN HASIL ===');
    const finalData = {
      timestamp: new Date().toISOString(),
      totalAssignments: allAssignments.length,
      assignments: allAssignments
    };

    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(finalData, null, 2));

    console.log(`\n✅ Sukses! Data disimpan ke: ${CONFIG.outputFile}`);
    console.log(`Total assignments scraped: ${allAssignments.length}`);

    // Print summary
    console.log('\n=== SUMMARY ===');
    const courseSummary = {};
    allAssignments.forEach(assignment => {
      if (!assignment.error) {
        if (!courseSummary[assignment.courseName]) {
          courseSummary[assignment.courseName] = [];
        }
        courseSummary[assignment.courseName].push({
          title: assignment.assignmentTitle,
          dueDate: assignment.dueDate || 'N/A',
          startTime: assignment.startTime || 'N/A',
          gradeScale: assignment.gradeScale || 'N/A'
        });
      }
    });

    Object.entries(courseSummary).forEach(([courseName, assignments]) => {
      console.log(`\n${courseName}:`);
      assignments.forEach((assignment, idx) => {
        console.log(`  ${idx + 1}. ${assignment.title}`);
        console.log(`     Due: ${assignment.dueDate}`);
        console.log(`     Start: ${assignment.startTime}`);
        console.log(`     Max Grade: ${assignment.gradeScale}`);
      });
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
scrapeAssignments();
