#!/usr/bin/env node
/**
 * Naver TalkTalk Messaging Campaign Server
 *
 * HTTP server for managing TalkTalk messaging campaigns.
 * Uses Naver Place GraphQL API via proxy for place/talk data.
 * No external dependencies - built-in Node.js modules only.
 *
 * Usage: node server.js
 * Starts on port 3400
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// ═══════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════

const PORT = 3400;

const PROXY_HOST = '49.247.137.28';
const PROXY_PORT = 3100;
const PROXY_API_KEY = 'onda-proxy-2026-secret';
const GRAPHQL_ENDPOINT = 'https://pcmap-api.place.naver.com/place/graphql';

const HISTORY_PATH = path.join(__dirname, '..', 'output', 'history.json');
const CAMPAIGNS_PATH = path.join(__dirname, 'campaigns.json');
const SENT_HISTORY_PATH = path.join(__dirname, 'sent_history.json');

const STALE_LOCK_MS = 5 * 60 * 1000; // 5 minutes

// ═══════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function readJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    log(`readJSON error (${filePath}): ${err.message}`);
    return null;
  }
}

function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Cache-Control': 'no-cache',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
}

function parsePath(rawUrl) {
  const parsed = url.parse(rawUrl, true);
  return { pathname: parsed.pathname, query: parsed.query };
}

function generateId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `${ts}-${rand}`;
}

function extractTalkId(talkUrl) {
  if (!talkUrl) return null;
  // Formats: http://talk.naver.com/wcc2vx?frm=... or https://talk.naver.com/XXXX
  const match = talkUrl.match(/talk\.naver\.com\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function graphqlRequest(query, referer) {
  return new Promise((resolve) => {
    const postBody = JSON.stringify([{ query }]);
    const proxyBody = JSON.stringify({
      targetUrl: GRAPHQL_ENDPOINT,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': referer || 'https://pcmap.place.naver.com/'
      },
      postBody
    });

    const req = http.request({
      hostname: PROXY_HOST,
      port: PROXY_PORT,
      path: '/proxy',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(proxyBody),
        'x-api-key': PROXY_API_KEY
      },
      timeout: 20000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(Array.isArray(parsed) ? parsed[0] : parsed);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(proxyBody);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════
// Data Access Helpers
// ═══════════════════════════════════════════════════════════

function getHistory() {
  const data = readJSON(HISTORY_PATH);
  if (!data || !data.crawled) {
    return { crawled: {} };
  }
  return data;
}

function getCampaigns() {
  const data = readJSON(CAMPAIGNS_PATH);
  if (!data || !Array.isArray(data)) {
    return [];
  }
  return data;
}

function saveCampaigns(campaigns) {
  writeJSON(CAMPAIGNS_PATH, campaigns);
}

function getSentHistory() {
  const data = readJSON(SENT_HISTORY_PATH);
  if (!data || typeof data !== 'object') {
    return {};
  }
  return data;
}

function saveSentHistory(sentHistory) {
  writeJSON(SENT_HISTORY_PATH, sentHistory);
}

// ═══════════════════════════════════════════════════════════
// Route Handlers
// ═══════════════════════════════════════════════════════════

function handleHealth(req, res) {
  sendJSON(res, {
    status: 'ok',
    uptime: process.uptime(),
    time: new Date().toISOString()
  });
}

function handleStats(req, res) {
  const history = getHistory();
  const crawled = history.crawled;
  const entries = Object.values(crawled);
  const sentHistory = getSentHistory();
  const sentCount = Object.keys(sentHistory).length;
  const sentTalkIds = new Set(Object.keys(sentHistory));

  let total = entries.length;
  let talkO = 0;
  let talkX = 0;
  let unknown = 0;
  const categoryMap = {};

  for (const entry of entries) {
    if (entry.talktalkButton === 'O') {
      talkO++;
    } else if (entry.talktalkButton === 'X') {
      talkX++;
    } else {
      unknown++;
    }

    const cat = entry.category || '기타';
    if (!categoryMap[cat]) {
      categoryMap[cat] = { total: 0, talkO: 0, sent: 0 };
    }
    categoryMap[cat].total++;
    if (entry.talktalkButton === 'O') {
      categoryMap[cat].talkO++;
      if (entry.talkId && sentTalkIds.has(entry.talkId)) {
        categoryMap[cat].sent++;
      }
    }
  }

  // Top 20 categories by talkO count
  const categoryStats = {};
  const sortedCats = Object.entries(categoryMap)
    .filter(([, s]) => s.talkO > 0)
    .sort((a, b) => b[1].talkO - a[1].talkO)
    .slice(0, 20);

  for (const [cat, stats] of sortedCats) {
    categoryStats[cat] = stats;
  }

  sendJSON(res, {
    total,
    talkO,
    talkX,
    unknown,
    sent: sentCount,
    categoryStats
  });
}

function handleTargets(req, res, query) {
  const history = getHistory();
  const crawled = history.crawled;
  const entries = Object.values(crawled);

  const categoryFilter = query.category || '';
  const regionFilter = query.region || '';
  const limit = parseInt(query.limit) || 100;
  const unsentOnly = query.unsent === 'true';

  let sentTalkIds = new Set();
  if (unsentOnly) {
    const sentHistory = getSentHistory();
    sentTalkIds = new Set(Object.keys(sentHistory));
  }

  const results = [];

  for (const entry of entries) {
    if (entry.talktalkButton !== 'O') continue;
    if (!entry.talkId) continue;

    if (categoryFilter && !(entry.category || '').includes(categoryFilter)) continue;
    if (regionFilter && !(entry.address || '').includes(regionFilter)) continue;
    if (unsentOnly && sentTalkIds.has(entry.talkId)) continue;

    results.push({
      name: entry.name,
      category: entry.category || '',
      address: entry.address || '',
      talkId: entry.talkId,
      talkUrl: entry.talkUrl || '',
      placeUrl: entry.placeUrl || ''
    });

    if (results.length >= limit) break;
  }

  sendJSON(res, results);
}

async function handleCrawl(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    sendJSON(res, { error: err.message }, 400);
    return;
  }

  const { keyword, region } = body;
  if (!keyword) {
    sendJSON(res, { error: 'keyword is required' }, 400);
    return;
  }

  const searchTerm = region ? `${keyword} ${region}` : keyword;
  const safeSearchTerm = searchTerm.replace(/"/g, '\\"');
  const gqlQuery = `{ places(input: {query: "${safeSearchTerm}"}) { items { id name talktalkUrl } } }`;

  log(`Crawl request: keyword="${keyword}" region="${region || ''}"`);

  const result = await graphqlRequest(gqlQuery);

  if (!result || !result.data) {
    sendJSON(res, {
      success: false,
      error: 'GraphQL request failed or returned no data',
      total: 0,
      talkO: 0,
      newAdded: 0,
      results: []
    });
    return;
  }

  const items = result.data.places?.items || [];
  const history = getHistory();
  let newAdded = 0;
  let talkOCount = 0;
  const resultItems = [];

  for (const item of items) {
    const talkId = extractTalkId(item.talktalkUrl);
    const hasTalk = !!item.talktalkUrl;

    if (hasTalk) talkOCount++;

    resultItems.push({
      id: item.id,
      name: item.name,
      talktalkUrl: item.talktalkUrl || null,
      talkId: talkId
    });

    // Create a key for history - use name + placeUrl pattern
    const placeUrl = `https://m.place.naver.com/place/${item.id}`;
    // Find if entry already exists by placeUrl
    let existingKey = null;
    for (const [key, val] of Object.entries(history.crawled)) {
      if (val.placeUrl === placeUrl) {
        existingKey = key;
        break;
      }
    }

    if (!existingKey) {
      // New entry
      const key = `${item.name}|api_crawl_${item.id}`;
      history.crawled[key] = {
        name: item.name,
        address: '',
        category: '',
        talktalkButton: hasTalk ? 'O' : 'X',
        talktalkVerified: 'api',
        talkUrl: item.talktalkUrl || '',
        talkId: talkId || '',
        placeUrl: placeUrl,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
      newAdded++;
    } else {
      // Update existing entry
      const existing = history.crawled[existingKey];
      existing.lastSeen = new Date().toISOString();
      if (hasTalk) {
        existing.talktalkButton = 'O';
        existing.talkUrl = item.talktalkUrl;
        existing.talkId = talkId;
      }
      existing.talktalkVerified = 'api';
    }
  }

  writeJSON(HISTORY_PATH, history);

  log(`Crawl complete: ${items.length} found, ${talkOCount} with talk, ${newAdded} new`);

  sendJSON(res, {
    success: true,
    total: items.length,
    talkO: talkOCount,
    newAdded,
    results: resultItems
  });
}

async function handleCreateCampaign(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    sendJSON(res, { error: err.message }, 400);
    return;
  }

  const { name, message, category, region, limit } = body;
  if (!name || !message) {
    sendJSON(res, { error: 'name and message are required' }, 400);
    return;
  }

  const targetLimit = parseInt(limit) || 100;

  // Filter targets from history
  const history = getHistory();
  const entries = Object.values(history.crawled);
  const targets = [];

  for (const entry of entries) {
    if (entry.talktalkButton !== 'O') continue;
    if (!entry.talkId) continue;
    if (category && !(entry.category || '').includes(category)) continue;
    if (region && !(entry.address || '').includes(region)) continue;

    targets.push(entry.talkId);
    if (targets.length >= targetLimit) break;
  }

  const campaign = {
    id: generateId(),
    name,
    message,
    category: category || '',
    region: region || '',
    limit: targetLimit,
    status: 'active',
    targets,
    created: new Date().toISOString(),
    progress: {
      total: targets.length,
      sent: 0,
      success: 0,
      fail: 0
    },
    assignments: {}
  };

  const campaigns = getCampaigns();
  campaigns.push(campaign);
  saveCampaigns(campaigns);

  log(`Campaign created: "${name}" (${campaign.id}) with ${targets.length} targets`);

  sendJSON(res, {
    success: true,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      targets: campaign.targets.length,
      created: campaign.created,
      progress: campaign.progress
    }
  });
}

function handleListCampaigns(req, res) {
  const campaigns = getCampaigns();

  const list = campaigns.map(c => ({
    id: c.id,
    name: c.name,
    message: c.message,
    category: c.category,
    region: c.region,
    status: c.status,
    created: c.created,
    progress: c.progress,
    targetCount: (c.targets || []).length
  }));

  sendJSON(res, list);
}

function handleGetCampaign(req, res, campaignId) {
  const campaigns = getCampaigns();
  const campaign = campaigns.find(c => c.id === campaignId);

  if (!campaign) {
    sendJSON(res, { error: 'Campaign not found' }, 404);
    return;
  }

  sendJSON(res, campaign);
}

async function handleWorkerFetch(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    sendJSON(res, { error: err.message }, 400);
    return;
  }

  const { campaign_id, worker_id, count } = body;
  if (!campaign_id || !worker_id) {
    sendJSON(res, { error: 'campaign_id and worker_id are required' }, 400);
    return;
  }

  const fetchCount = parseInt(count) || 10;
  const campaigns = getCampaigns();
  const campaign = campaigns.find(c => c.id === campaign_id);

  if (!campaign) {
    sendJSON(res, { error: 'Campaign not found' }, 404);
    return;
  }

  if (campaign.status !== 'active') {
    sendJSON(res, { error: 'Campaign is not active', status: campaign.status }, 400);
    return;
  }

  const sentHistory = getSentHistory();
  const sentTalkIds = new Set(Object.keys(sentHistory));
  const now = Date.now();

  // Initialize assignments map if not present
  if (!campaign.assignments) {
    campaign.assignments = {};
  }

  // Release stale locks
  for (const [talkId, assignment] of Object.entries(campaign.assignments)) {
    if (assignment.status === 'assigned' && (now - assignment.timestamp) > STALE_LOCK_MS) {
      delete campaign.assignments[talkId];
      log(`Released stale lock: ${talkId} (worker: ${assignment.worker_id})`);
    }
  }

  // Build lookup for target details from history
  const history = getHistory();
  const talkIdMap = {};
  for (const entry of Object.values(history.crawled)) {
    if (entry.talkId) {
      talkIdMap[entry.talkId] = entry;
    }
  }

  // Find unsent, unassigned targets
  const assigned = [];
  for (const talkId of campaign.targets) {
    if (assigned.length >= fetchCount) break;
    if (sentTalkIds.has(talkId)) continue;
    if (campaign.assignments[talkId] && campaign.assignments[talkId].status === 'assigned') continue;

    // Lock it
    campaign.assignments[talkId] = {
      status: 'assigned',
      worker_id,
      timestamp: now
    };

    const entry = talkIdMap[talkId] || {};
    assigned.push({
      talkId,
      talkUrl: entry.talkUrl || `http://talk.naver.com/${talkId}`,
      name: entry.name || '',
      category: entry.category || ''
    });
  }

  saveCampaigns(campaigns);

  log(`Worker ${worker_id} fetched ${assigned.length} targets from campaign ${campaign_id}`);

  sendJSON(res, assigned);
}

async function handleWorkerReport(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    sendJSON(res, { error: err.message }, 400);
    return;
  }

  const { campaign_id, worker_id, results } = body;
  if (!campaign_id || !worker_id || !Array.isArray(results)) {
    sendJSON(res, { error: 'campaign_id, worker_id, and results array are required' }, 400);
    return;
  }

  const campaigns = getCampaigns();
  const campaign = campaigns.find(c => c.id === campaign_id);

  if (!campaign) {
    sendJSON(res, { error: 'Campaign not found' }, 404);
    return;
  }

  if (!campaign.assignments) {
    campaign.assignments = {};
  }

  const sentHistory = getSentHistory();
  let updated = 0;

  for (const result of results) {
    const { talk_id, status, error } = result;
    if (!talk_id || !status) continue;

    // Update sent_history
    sentHistory[talk_id] = {
      campaign_id,
      worker_id,
      status,
      error: error || null,
      timestamp: new Date().toISOString()
    };

    // Update campaign assignment
    campaign.assignments[talk_id] = {
      status: 'completed',
      worker_id,
      result_status: status,
      timestamp: Date.now()
    };

    // Update campaign progress
    campaign.progress.sent++;
    if (status === 'sent') {
      campaign.progress.success++;
    } else if (status === 'fail') {
      campaign.progress.fail++;
    }
    // Other statuses (verify_needed, no_textarea, etc.) count as sent but not success/fail

    updated++;
  }

  // Check if campaign is complete
  if (campaign.progress.sent >= campaign.progress.total) {
    campaign.status = 'completed';
    campaign.completedAt = new Date().toISOString();
    log(`Campaign ${campaign_id} completed`);
  }

  saveSentHistory(sentHistory);
  saveCampaigns(campaigns);

  log(`Worker ${worker_id} reported ${updated} results for campaign ${campaign_id}`);

  sendJSON(res, { success: true, updated });
}

function handleSentHistory(req, res, query) {
  const limit = parseInt(query.limit) || 50;
  const offset = parseInt(query.offset) || 0;

  const sentHistory = getSentHistory();
  const entries = Object.entries(sentHistory)
    .map(([talkId, data]) => ({
      talkId,
      ...data
    }))
    .sort((a, b) => {
      // Newest first by timestamp
      const ta = a.timestamp || '';
      const tb = b.timestamp || '';
      return tb.localeCompare(ta);
    });

  const total = entries.length;
  const paged = entries.slice(offset, offset + limit);

  sendJSON(res, {
    total,
    offset,
    limit,
    entries: paged
  });
}

function handleDashboard(req, res) {
  const dashboardPath = path.join(__dirname, 'dashboard.html');
  if (!fs.existsSync(dashboardPath)) {
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end('dashboard.html not found');
    return;
  }

  const content = fs.readFileSync(dashboardPath, 'utf-8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });
  res.end(content);
}

// ═══════════════════════════════════════════════════════════
// Router
// ═══════════════════════════════════════════════════════════

async function router(req, res) {
  const { pathname, query } = parsePath(req.url);
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    setCORSHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  setCORSHeaders(res);

  try {
    // Static routes
    if ((pathname === '/' || pathname === '/dashboard') && method === 'GET') {
      handleDashboard(req, res);
      return;
    }

    // API routes
    if (pathname === '/api/health' && method === 'GET') {
      handleHealth(req, res);
      return;
    }

    if (pathname === '/api/stats' && method === 'GET') {
      handleStats(req, res);
      return;
    }

    if (pathname === '/api/targets' && method === 'GET') {
      handleTargets(req, res, query);
      return;
    }

    if (pathname === '/api/crawl' && method === 'POST') {
      await handleCrawl(req, res);
      return;
    }

    if (pathname === '/api/campaign' && method === 'POST') {
      await handleCreateCampaign(req, res);
      return;
    }

    if (pathname === '/api/campaigns' && method === 'GET') {
      handleListCampaigns(req, res);
      return;
    }

    // Campaign detail: /api/campaign/:id
    const campaignMatch = pathname.match(/^\/api\/campaign\/([a-zA-Z0-9_-]+)$/);
    if (campaignMatch && method === 'GET') {
      handleGetCampaign(req, res, campaignMatch[1]);
      return;
    }

    if (pathname === '/api/worker/fetch' && method === 'POST') {
      await handleWorkerFetch(req, res);
      return;
    }

    if (pathname === '/api/worker/report' && method === 'POST') {
      await handleWorkerReport(req, res);
      return;
    }

    if (pathname === '/api/sent' && method === 'GET') {
      handleSentHistory(req, res, query);
      return;
    }

    // 404
    sendJSON(res, { error: 'Not found', path: pathname }, 404);

  } catch (err) {
    log(`Error handling ${method} ${pathname}: ${err.message}`);
    sendJSON(res, { error: 'Internal server error', message: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════
// Server
// ═══════════════════════════════════════════════════════════

const server = http.createServer(router);

server.listen(PORT, () => {
  log(`TalkTalk Campaign Server started on port ${PORT}`);
  log(`Dashboard: http://localhost:${PORT}/`);
  log(`Health: http://localhost:${PORT}/api/health`);
  log(`History path: ${HISTORY_PATH}`);
  log(`Campaigns path: ${CAMPAIGNS_PATH}`);
  log(`Sent history path: ${SENT_HISTORY_PATH}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log(`Port ${PORT} is already in use. Exiting.`);
    process.exit(1);
  }
  log(`Server error: ${err.message}`);
});

// ═══════════════════════════════════════════════════════════
// Graceful Shutdown
// ═══════════════════════════════════════════════════════════

let shutdownInProgress = false;

function gracefulShutdown(signal) {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  log(`${signal} received. Shutting down gracefully...`);

  server.close(() => {
    log('Server closed. Goodbye.');
    process.exit(0);
  });

  // Force exit after 10 seconds if graceful shutdown stalls
  setTimeout(() => {
    log('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
