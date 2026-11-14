/** API smoke checks for auth, booking ownership, admin roles, and detection keys. */
const http = require('http');
const testEmail = `admin-${Date.now()}@example.test`;
process.env.AUTH_MODE = 'local';
process.env.NODE_ENV = 'test';
process.env.LOCAL_ADMIN_EMAILS = testEmail;
process.env.LOCAL_SESSION_SECRET = 'test-session-secret-that-is-long-enough-0123456789';
process.env.DETECTION_API_KEY = 'test-detection-key-for-local-suite-only-00000000';
const app = require('../server');

let server;
const PORT = 5099;
function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ ...options, port: PORT, host: '127.0.0.1' }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: body ? JSON.parse(body) : null }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  let passed = 0;
  let failed = 0;
  const assert = (condition, message) => {
    if (condition) { console.log(`PASS ${message}`); passed++; }
    else { console.error(`FAIL ${message}`); failed++; }
  };
  server = app.listen(PORT);
  try {
    const health = await request({ path: '/api/health', method: 'GET' });
    assert(health.status === 200 && health.body.databaseStatus === 'HEALTHY', 'health endpoint reports database healthy');
    const slots = await request({ path: '/api/parking/slots', method: 'GET' });
    assert(slots.status === 200 && slots.body.data.length > 0, 'parking slots are available');
    const anonymousBookings = await request({ path: '/api/bookings', method: 'GET' });
    assert(anonymousBookings.status === 401, 'booking API requires a session');

    const signUp = await request({ path: '/api/auth/signup', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { email: testEmail, password: 'Safe-test-password-123' });
    assert(signUp.status === 201, 'user signup succeeds');
    const login = await request({ path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { email: testEmail, password: 'Safe-test-password-123' });
    const cookie = (login.headers['set-cookie'] || [])[0]?.split(';')[0];
    assert(login.status === 200 && Boolean(cookie), 'login returns an HTTP-only session cookie');
    const me = await request({ path: '/api/auth/me', method: 'GET', headers: { Cookie: cookie } });
    assert(me.status === 200 && me.body.data.email === testEmail, 'session endpoint returns authenticated account');

    const free = (await request({ path: '/api/parking/availability', method: 'GET' })).body.data.slots.find(slot => slot.status === 'FREE');
    if (free) {
      const booking = await request({ path: '/api/bookings', method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie } }, { slotId: free.slotId, userId: 'forged-user-id', vehicleNumber: 'TEST-123' });
      assert(booking.status === 201 && booking.body.data.userId === me.body.data.sub, 'booking owner comes from authenticated identity');
      const mine = await request({ path: '/api/bookings', method: 'GET', headers: { Cookie: cookie } });
      assert(mine.status === 200 && mine.body.data.some(item => item.bookingId === booking.body.data.bookingId), 'driver can list their own bookings');
      const cancel = await request({ path: `/api/bookings/${booking.body.data.bookingId}/cancel`, method: 'PUT', headers: { Cookie: cookie } });
      assert(cancel.status === 200, 'driver can cancel their own booking');
    } else assert(false, 'a free slot is available for booking check');

    const admin = await request({ path: '/api/admin/dashboard', method: 'GET', headers: { Cookie: cookie } });
    assert(admin.status === 200, 'admin route accepts a signed-in administrator');
    const noAdmin = await request({ path: '/api/admin/dashboard', method: 'GET' });
    assert(noAdmin.status === 401, 'admin route rejects anonymous requests');
    const noDetectionKey = await request({ path: '/api/detection/update', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { slotId: 'A03', status: 'OCCUPIED', source: 'JSON', confidence: 0.98 });
    assert(noDetectionKey.status === 401, 'detection endpoint rejects missing key');
    const detection = await request({ path: '/api/detection/update', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-detection-key': process.env.DETECTION_API_KEY } }, { slotId: 'A03', status: 'OCCUPIED', source: 'JSON', confidence: 0.98 });
    assert(detection.status === 200, 'detection endpoint accepts configured key');
  } catch (error) {
    console.error('Test execution error:', error);
    failed++;
  } finally {
    server.close();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exitCode = failed ? 1 : 0;
  }
}

if (require.main === module) runTests();
