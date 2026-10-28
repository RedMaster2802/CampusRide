// supabase/loadtest/k6_create.js
// k6 load test for create_ride_request (LOADTEST.md section 4)

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const errorRate = new Rate('errors');

// Configuration - UPDATE THESE FOR YOUR ENVIRONMENT
const SUPABASE_URL = __ENV.SUPABASE_URL || 'http://localhost:54321';
const ANON_KEY = __ENV.ANON_KEY || 'your-anon-key';
const PROJECT_REF = __ENV.PROJECT_REF || 'local';

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 100 },   // Ramp up
    { duration: '1m', target: 500 },    // Sustained load
    { duration: '30s', target: 1000 },  // Peak
    { duration: '1m', target: 500 },    // Sustained
    { duration: '30s', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% of requests < 2s
    http_req_failed: ['rate<0.01'],     // Error rate < 1%
    errors: ['rate<0.05'],              // Custom error rate < 5%
  },
};

// Generate a simple JWT for local testing (in real test, use Supabase auth)
function generateTestJWT(userId) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: userId,
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  }));
  // Note: In real test, sign with proper secret. For local Supabase, use the known JWT secret.
  const signature = btoa('test-signature');
  return `${header}.${payload}.${signature}`;
}

function getRandomRoute() {
  const routes = [
    { origin: 'SECTOR_128', destination: 'OBS' },
    { origin: 'SECTOR_128', destination: 'BOTANICAL_METRO' },
    { origin: 'SECTOR_128', destination: 'SECTOR_62' },
    { origin: 'SECTOR_62', destination: 'SECTOR_128' },
    { origin: 'SECTOR_62', destination: 'OBS' },
    { origin: 'SECTOR_62', destination: 'BOTANICAL_METRO' },
    { origin: 'OBS', destination: 'SECTOR_128' },
    { origin: 'OBS', destination: 'SECTOR_62' },
    { origin: 'OBS', destination: 'BOTANICAL_METRO' },
    { origin: 'BOTANICAL_METRO', destination: 'SECTOR_128' },
    { origin: 'BOTANICAL_METRO', destination: 'SECTOR_62' },
    { origin: 'BOTANICAL_METRO', destination: 'OBS' },
  ];
  return routes[Math.floor(Math.random() * routes.length)];
}

function getRandomWindow() {
  const startOffset = Math.floor(Math.random() * 180); // 0-180 min from now
  const length = 30 + Math.floor(Math.random() * 150); // 30-180 min
  const start = new Date(Date.now() + startOffset * 60000);
  const end = new Date(start.getTime() + length * 60000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export default function () {
  // Each VU gets a unique user ID
  const userId = `load${__VU}${__ITER}@example.edu`;
  const jwt = generateTestJWT(userId);
  
  const route = getRandomRoute();
  const window = getRandomWindow();
  const partySize = 1 + Math.floor(Math.random() * 3);
  const targets = ['4', '6', 'ANY'];
  const target = targets[Math.floor(Math.random() * targets.length)];
  
  const payload = JSON.stringify({
    p_origin: route.origin,
    p_destination: route.destination,
    p_party_size: partySize,
    p_target: target,
    p_window_start: window.start,
    p_window_end: window.end,
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
      'apikey': ANON_KEY,
    },
  };
  
  const url = `${SUPABASE_URL}/rest/v1/rpc/create_ride_request`;
  
  const res = http.post(url, payload, params);
  
  const success = check(res, {
    'status 200 or 400': (r) => r.status === 200 || r.status === 400,
    'response has pool or error': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.pool !== undefined || body.error !== undefined || body.message !== undefined;
      } catch {
        return false;
      }
    },
  });
  
  errorRate.add(!success);
  
  // Small delay between requests
  sleep(Math.random() * 0.5);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  // Simple text summary
  let out = '\n=== k6 Load Test Summary ===\n';
  out += `Total requests: ${data.metrics.http_reqs.values.count}\n`;
  out += `Failed requests: ${data.metrics.http_req_failed.values.passes}\n`;
  out += `Avg response time: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
  out += `p95 response time: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  out += `Max response time: ${data.metrics.http_req_duration.values.max.toFixed(2)}ms\n`;
  return out;
}