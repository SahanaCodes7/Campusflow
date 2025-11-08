const axios = require('axios');
(async () => {
  try {
    console.log('Checking health...');
    const h = await axios.get('http://localhost:3000/health', { timeout: 3000 });
    console.log('health:', h.data);

    console.log('Posting test assignment...');
    const post = await axios.post('http://localhost:3000/assignments', {
      title: 'E2E node test',
      description: 'created by node e2e script',
      deadline: '2025-11-30T12:00:00'
    }, { timeout: 5000 });
    console.log('post response:', post.data);

    console.log('Fetching announcements...');
    const anns = await axios.get('http://localhost:3000/api/announcements', { timeout: 5000 });
    console.log('announcements:\n', JSON.stringify(anns.data, null, 2));
  } catch (err) {
    console.error('ERROR:', err && err.message ? err.message : err);
    if (err.code) console.error('code:', err.code);
    if (err.stack) console.error(err.stack);
    if (err.response) console.error('response data:', err.response.data);
    process.exit(1);
  }
})();
