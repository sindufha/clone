const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

// Konfigurasi
const CONFIG = {
  baseUrl: 'https://lms.itmnganjuk.ac.id',
  nim: process.env.LMS_NIM,
  password: process.env.LMS_PASSWORD,
  outputFile: './dashboard-data.json'
};

if (!CONFIG.nim || !CONFIG.password) {
  throw new Error('Set LMS_NIM and LMS_PASSWORD before running the legacy scraper.');
}

// Create axios instance dengan cookie support
const client = axios.create({
  baseURL: CONFIG.baseUrl,
  withCredentials: true,
  validateStatus: () => true // Accept all status codes
});

async function scrapeDashboard() {
  try {
    console.log('Step 1: Mengambil halaman login...');
    const loginPageResponse = await client.get('/login/index.php');

    // Parse halaman login untuk cari login token (jika ada)
    const $ = cheerio.load(loginPageResponse.data);
    const logintoken = $('input[name="logintoken"]').val();

    console.log('Step 2: Submit login form...');
    const loginResponse = await client.post('/login/index.php', {
      username: CONFIG.nim,
      password: CONFIG.password,
      logintoken: logintoken || '',
      redirect: ''
    });

    // Check apakah login berhasil
    if (loginResponse.status !== 200 || loginResponse.data.includes('login')) {
      console.error('❌ Login gagal! Periksa NIM dan password.');
      process.exit(1);
    }

    console.log('Step 3: Navigasi ke dashboard...');
    const dashboardResponse = await client.get('/my/');

    if (dashboardResponse.status !== 200) {
      console.error('❌ Gagal akses dashboard');
      process.exit(1);
    }

    console.log('Step 4: Scrape dashboard content...');
    const dashboardHtml = dashboardResponse.data;
    const dashboardCheerio = cheerio.load(dashboardHtml);

    const dashboardData = {
      timestamp: new Date().toISOString(),
      pageTitle: dashboardCheerio('title').text(),
      url: dashboardResponse.config.url,
      profile: {},
      courses: [],
      announcements: [],
      events: [],
      rawHtmlLength: dashboardHtml.length
    };

    // Extract user info
    const userInfo = dashboardCheerio('.userdrop, .navbar-nav .nav-item');
    if (userInfo.length) {
      dashboardData.profile.name = userInfo.text().trim();
    }

    // Extract courses
    dashboardCheerio('.coursebox, [data-course], .course-card, li.course').each((i, elem) => {
      const courseElement = cheerio.load(elem);
      const courseData = {
        name: courseElement('.coursename, h3, .course-name').text().trim(),
        link: courseElement('a').attr('href') || '',
        progress: courseElement('.progress-bar, .completion').attr('aria-valuenow') || '',
      };

      if (courseData.name) {
        dashboardData.courses.push(courseData);
      }
    });

    // Extract recent activity / announcements
    dashboardCheerio('.activity, .event-item, .news-item, .timeline-item').each((i, elem) => {
      const actElement = cheerio.load(elem);
      const actData = {
        title: actElement('h4, h3, .activity-title').text().trim(),
        description: actElement('.description, p').text().trim().substring(0, 200),
        date: actElement('.time, .date, time').text().trim()
      };

      if (actData.title) {
        dashboardData.announcements.push(actData);
      }
    });

    // Simpan hasil
    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(dashboardData, null, 2));

    console.log('\n✅ Sukses! Data disimpan ke: ' + CONFIG.outputFile);
    console.log(`Courses found: ${dashboardData.courses.length}`);
    console.log(`Announcements found: ${dashboardData.announcements.length}`);
    console.log('\n📊 Preview data:');
    console.log(JSON.stringify(dashboardData, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
    }
    process.exit(1);
  }
}

// Jalankan
scrapeDashboard();
