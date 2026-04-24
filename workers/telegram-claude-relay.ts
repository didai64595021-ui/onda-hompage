/**
 * 텔레그램 ↔ Claude Code 릴레이 v2
 *
 * 개선사항 (v1 대비):
 * - 그룹별 세션 유지 (--resume) → 대화 맥락 보존
 * - --dangerously-skip-permissions 제거 → --allowedTools로 안전 범위 제한
 * - 그룹↔워크스페이스 고정 매핑 → 오감지 방지
 * - CLAUDE.md/WORK_STATE.md 자동 참조
 *
 * 비용: $0 (Claude Max 토큰만 사용)
 * 실행: PM2로 상시 실행
 */

import { spawn, execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import dns from 'dns';

// Telegram API fetch 실패 해결 — IPv6 먼저 시도 시 ETIMEDOUT 반복.
// DNS 순서 IPv4 우선으로 고정 (Node 22에서도 undici fetch에 전달됨).
dns.setDefaultResultOrder('ipv4first');
// undici 별도 패키지 제거 — Node 22 내장이 아님(npm 설치 필요). DNS 순서 + tgApi 재시도
// 래퍼(아래)로 대체.

// ─── 설정 ───
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const MAX_RESPONSE_LENGTH = 4000;
const MAX_RETRIES = 2;
const TYPING_INTERVAL_MS = 8000;
const PROGRESS_REPORT_MS = 30000;
const SESSION_FILE = '/home/onda/logs/telegram-relay-sessions.json';
const CLAUDE_TIMEOUT = 600000; // 10분 — 복잡한 작업(빌드/크롤) 여유

// 허용 도구 (안전한 범위만)
const ALLOWED_TOOLS = [
  'Read', 'Glob', 'Grep', 'Bash', 'Edit', 'Write',
  'Agent', 'WebSearch', 'WebFetch'
].join(',');

// ─── 그룹 ↔ 워크스페이스 고정 매핑 ───
// 사용자 지정 16개 그룹 기준 (2026-04-24 재정비).
// 동일 chat_id 충돌 금지 — 하나의 그룹은 한 workspace로만.
const GROUP_WORKSPACE: Record<string, { workspace: string; name: string }> = {
  // v1. 온다 로직모니터
  '-1003804670860': { workspace: '/home/onda/projects/onda-logic-monitor', name: '온다 로직모니터' },
  // v2. 크몽 모두 — 슈퍼그룹 업그레이드로 chat_id 이전됨 (2026-04-25 확인).
  // 사용자가 전달한 -5018738099는 구 ID, 실제 현재 ID는 -1003990823637.
  // 구 ID로 보낼 경우 Telegram이 "chat was upgraded to supergroup" migrate_to_chat_id로 안내.
  '-1003990823637': { workspace: '/home/onda/projects/onda-hompage/kmong-crawler', name: '크몽 모두' },
  '-5018738099':    { workspace: '/home/onda/projects/onda-hompage/kmong-crawler', name: '크몽 모두 (구 ID, 호환용)' },
  // v3. 로직모니터 테스트 (dev 디렉토리 실존 여부 체크: 없으면 본서버 공유)
  '-5134820548':    { workspace: '/home/onda/projects/onda-logic-monitor', name: '로직모니터 테스트' },
  // v4. 네이버 톡톡 크롤러 (=coldmail과 동일 채널 id, coldmail 워크스페이스)
  '-1003870419601': { workspace: '/home/onda/projects/onda-coldmail', name: '네이버 톡톡 크롤러' },
  // v5. 온다커뮤니티포스터
  '-1003806737505': { workspace: '/home/onda/projects/onda-community-poster', name: '온다커뮤니티포스터' },
  // v6. 온다트래픽봇
  '-5254346681':    { workspace: '/home/onda/projects/onda-traffic-bot', name: '온다트래픽봇' },
  // v7. 온다유튜브자동화 (automation 디렉토리 실존 여부 체크: 없으면 investment로 대체)
  '-1003855690620': { workspace: '/home/onda/projects/onda-youtube-investment', name: '온다유튜브자동화' },
  // v8. 온다인스타레포트
  '-5079107870':    { workspace: '/home/onda/projects/onda-insta-report', name: '온다인스타레포트' },
  // v9. 온다셀프마케팅
  '-5055799097':    { workspace: '/home/onda/projects/onda-self-marketing', name: '온다셀프마케팅' },
  // v11. 온다 UIUX
  '-5268676231':    { workspace: '/home/onda/projects/onda-hompage', name: '온다 UIUX' },
  // v13. 온다 네이버 cpc
  '-5284621346':    { workspace: '/home/onda/projects/onda-ad', name: '온다 네이버 cpc' },
  // v16. 온다 전체 프로젝트
  '-1003738825402': { workspace: '/home/onda', name: '온다 전체 프로젝트' },

  // 기존 (사용자 16개 목록 밖이지만 유지)
  '-1003753252286': { workspace: '/home/onda', name: 'ONDA서버(통합)' },
  '-1003753078103': { workspace: '/home/onda/projects/onda-ad', name: '온다AD CPC관리' },
  '-1003800384738': { workspace: '/home/onda/projects/onda-hompage', name: 'onda-UIUX (구)' },
};

// 메시지 내 키워드로 workspace 오버라이드 (명시적 지정 시만)
const WORKSPACE_OVERRIDES: Record<string, string> = {
  '@onda-ad': '/home/onda/projects/onda-ad',
  '@로직모니터': '/home/onda/projects/onda-logic-monitor',
  '@홈페이지': '/home/onda/projects/onda-hompage',
  '@콜드메일': '/home/onda/projects/onda-coldmail',
  '@seo': '/home/onda/projects/onda-seo-auto',
};

// 에러 메시지 패턴 — Claude CLI 자체 에러 꼬리만 제거.
// "Error:"로 시작하는 모든 라인 제거(←과공격)는 삭제. 답변에 Error 언급이
// 있으면 통째 지워져 relay가 empty output으로 fail 처리되던 버그 원인.
const ERROR_PATTERNS = [
  /⚠️\s*Something went wrong while processing your request\.?[^\n]*(?:\n|$)/g,
  /Please try again, or use \/new to start a fresh session\.?\s*\n?/g,
];

let lastUpdateId = 0;
const messageQueue: Array<Record<string, unknown>> = [];
let processingQueue = false;

// ─── 메시지 배칭 (연속 메시지 합치기) ───
const BATCH_WAIT_MS = 15000; // 15초 대기
interface BatchEntry {
  messages: Array<{ text: string; messageId: number; username: string; msg: Record<string, unknown> }>;
  timer: ReturnType<typeof setTimeout> | null;
  notified: boolean; // "접수" 응답 전송 여부
}
const batchBuffer: Map<string, BatchEntry> = new Map();

// ─── 세션 관리 ───
type SessionMap = Record<string, { sessionId: string; workspace: string; lastUsed: number }>;

function loadSessions(): SessionMap {
  try {
    if (existsSync(SESSION_FILE)) {
      return JSON.parse(readFileSync(SESSION_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveSessions(sessions: SessionMap) {
  try {
    const dir = SESSION_FILE.replace(/\/[^/]+$/, '');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2));
  } catch (e) {
    log('WARN', `세션 저장 실패: ${(e as Error).message}`);
  }
}

function getSessionKey(chatId: string, workspace: string): string {
  return `${chatId}:${workspace}`;
}

// ─── 유틸 ───
function log(level: string, msg: string) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  process.stdout.write(`[${ts}] [${level}] ${msg}\n`);
}

async function tgApi(method: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  // "fetch failed"(IPv6 타임아웃) 간헐 장애 대응 — 지수백오프 3회 재시도.
  // getUpdates는 상위 pollUpdates 루프가 5초 후 재호출하지만, sendMessage/sendChatAction은
  // 단발이라 여기서 재시도 안 하면 사용자 응답이 유실됨.
  const MAX_TRIES = 3;
  let lastErr: string = '';
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return res.json() as Promise<Record<string, unknown>>;
    } catch (err) {
      lastErr = (err as Error).message;
      if (attempt < MAX_TRIES) {
        await new Promise(r => setTimeout(r, 500 * attempt * attempt)); // 500ms, 2s, 4.5s
      }
    }
  }
  log('ERROR', `tgApi ${method} 3회 모두 실패: ${lastErr}`);
  return { ok: false };
}

async function sendMessage(chatId: string, text: string, replyTo?: number) {
  if (!text.trim()) return;
  if (text.length <= MAX_RESPONSE_LENGTH) {
    await tgApi('sendMessage', { chat_id: chatId, text, reply_to_message_id: replyTo });
  } else {
    for (let i = 0; i < text.length; i += MAX_RESPONSE_LENGTH) {
      await tgApi('sendMessage', { chat_id: chatId, text: text.slice(i, i + MAX_RESPONSE_LENGTH), reply_to_message_id: replyTo });
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

function cleanClaudeOutput(raw: string): string {
  let cleaned = raw;
  for (const pattern of ERROR_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned.trim();
}

function startProgressTimer(chatId: string) {
  let elapsed = 0;
  let reported = false;
  const timer = setInterval(async () => {
    elapsed += TYPING_INTERVAL_MS;
    await tgApi('sendChatAction', { chat_id: chatId, action: 'typing' });
    if (!reported && elapsed >= PROGRESS_REPORT_MS) {
      reported = true;
      await sendMessage(chatId, '⏳ 아직 처리 중입니다. 잠시만 기다려주세요.');
      log('INFO', `중간보고 전송 (${Math.round(elapsed / 1000)}초 경과)`);
    }
  }, TYPING_INTERVAL_MS);
  return { stop: () => clearInterval(timer) };
}

// ─── Workspace 결정 (대화 맥락 기반) ───
const PROJECT_HINTS: Record<string, { workspace: string; keywords: string[] }> = {
  'onda-hompage': {
    workspace: '/home/onda/projects/onda-hompage',
    keywords: ['홈페이지','threeway','쓰리웨이','펜션','포트폴리오','cms','admin.html','index.html','배포','CF Pages']
  },
  'onda-logic-monitor': {
    workspace: '/home/onda/projects/onda-logic-monitor',
    keywords: ['로직모니터','logic-monitor','크롤러','supabase','대시보드','모니터링','adlog','키워드순위','셀프마케팅']
  },
  'onda-ad': {
    workspace: '/home/onda/projects/onda-ad',
    keywords: ['onda-ad','온다애드','광고','크몽','kmong','마케팅자동화']
  },
  'onda-coldmail': {
    workspace: '/home/onda/projects/onda-coldmail',
    keywords: ['콜드메일','coldmail','이메일','메일발송']
  },
  'onda-seo-auto': {
    workspace: '/home/onda/projects/onda-seo-auto',
    keywords: ['seo','검색등록','사이트등록','SEO']
  },
  'onda-youtube-investment': {
    workspace: '/home/onda/projects/onda-youtube-investment',
    keywords: ['유튜브','youtube','투자','영상']
  },
};

// 마지막 사용 workspace 캐시 (그룹별)
const lastWorkspaceByGroup: Record<string, string> = {};

function resolveWorkspace(chatId: string, text: string): string {
  // 1. 명시적 @키워드 (최우선)
  for (const [keyword, ws] of Object.entries(WORKSPACE_OVERRIDES)) {
    if (text.includes(keyword)) {
      lastWorkspaceByGroup[chatId] = ws;
      return ws;
    }
  }

  // 2. 대화 내용 키워드 매칭 (점수 기반)
  const lower = text.toLowerCase();
  let bestMatch = '';
  let bestScore = 0;

  for (const [, project] of Object.entries(PROJECT_HINTS)) {
    let score = 0;
    for (const kw of project.keywords) {
      if (lower.includes(kw.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = project.workspace;
    }
  }

  if (bestScore > 0) {
    lastWorkspaceByGroup[chatId] = bestMatch;
    log('INFO', `워크스페이스 감지: "${text.slice(0, 30)}..." → ${bestMatch} (score=${bestScore})`);
    return bestMatch;
  }

  // 3. 이전 대화 이어가기 (같은 그룹에서 키워드 없으면 마지막 workspace 유지)
  if (lastWorkspaceByGroup[chatId]) {
    return lastWorkspaceByGroup[chatId];
  }

  // 4. 그룹 기본값
  const group = GROUP_WORKSPACE[chatId];
  if (group) return group.workspace;

  return '/home/onda/projects/onda-hompage';
}

// ─── Claude Code CLI 실행 (세션 유지) ───
function runClaudeOnce(
  prompt: string,
  workspace: string,
  sessionId: string,
  isFirstCall: boolean
): Promise<{ success: boolean; output: string; raw: string }> {
  return new Promise((resolve) => {
    // 세션 유지 — `--session-id <uuid>`로 우리가 직접 관리.
    //   · 첫 호출: 이 UUID로 새 세션 파일 생성 (~/.claude/projects/<cwd>/<uuid>.jsonl)
    //   · 이후 호출: 같은 UUID로 --resume → 동일 파일에 누적 → 맥락 이어짐
    // `--print` 모드에서 stderr에 세션 ID가 나오지 않아 자동 파싱이 실패하던 문제의 근본 해결.
    const args = ['--print', '--allowedTools', ALLOWED_TOOLS];
    if (isFirstCall) {
      args.push('--session-id', sessionId);
    } else {
      args.push('--resume', sessionId);
    }

    // `--allowedTools`가 variadic(<tools...>)이라 뒤따르는 prompt를 tools로 흡수해서
    // "Input must be provided..." 에러가 발생. 반드시 `--` separator로 막고 positional 인자로.
    args.push('--', prompt);

    log('INFO', `Claude 호출: session=${sessionId || 'new'}, cwd=${workspace}`);

    // stdio: stdin을 ignore로 고정해야 claude가 "no stdin data in 3s" 경고 + 3초 대기를 건너뜀.
    // 기본 'pipe'면 pipe 열려 있어서 stdin 대기 → 실제론 prompt가 arg로 전달돼 답은 나오지만
    // timing 꼬임 + stderr 오염으로 relay가 fail 처리했음.
    const proc = spawn('claude', args, {
      cwd: workspace,
      env: { ...process.env, HOME: '/home/onda' },
      timeout: CLAUDE_TIMEOUT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.on('close', (code: number | null) => {
      const cleaned = cleanClaudeOutput(stdout);
      if (code === 0 && cleaned) {
        resolve({ success: true, output: cleaned, raw: stdout });
      } else if (code === 0 && stdout.trim() && !cleaned) {
        resolve({ success: false, output: '', raw: stdout });
      } else {
        resolve({ success: false, output: stderr.slice(0, 300), raw: stdout });
      }
    });

    proc.on('error', (err: Error) => {
      resolve({ success: false, output: err.message, raw: '' });
    });
  });
}

// Claude 실행 (재시도 + 세션 관리)
async function runClaude(prompt: string, workspace: string, chatId: string): Promise<string> {
  const sessions = loadSessions();
  const key = getSessionKey(chatId, workspace);
  let entry = sessions[key];
  let isFirstCall = false;

  // 최초 호출이면 UUID 생성 + 즉시 저장 (첫 호출 중 프로세스 죽어도 다음 번엔 이어감)
  if (!entry?.sessionId) {
    const newId = randomUUID();
    entry = { sessionId: newId, workspace, lastUsed: Date.now() };
    sessions[key] = entry;
    saveSessions(sessions);
    isFirstCall = true;
    log('INFO', `세션 신규 생성: ${key} → ${newId}`);
  }

  const sessionId = entry.sessionId;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log('INFO', `Claude 실행 (시도 ${attempt}/${MAX_RETRIES}): workspace=${workspace}, session=${sessionId.slice(0, 8)}..., first=${isFirstCall}`);

    const result = await runClaudeOnce(prompt, workspace, sessionId, isFirstCall && attempt === 1);

    if (result.success) {
      entry.lastUsed = Date.now();
      saveSessions(sessions);
      log('INFO', `Claude 완료: ${result.output.length}자 (session 유지)`);
      return result.output;
    }

    log('WARN', `Claude 시도 ${attempt} 실패: ${result.output.slice(0, 150)}`);

    // 세션 파일 손상/resume 실패 시 2번째 시도는 새 세션 생성
    if (attempt === 1 && !isFirstCall) {
      log('INFO', '기존 세션 resume 실패 → 새 세션으로 재시도');
      const newId = randomUUID();
      entry.sessionId = newId;
      entry.lastUsed = Date.now();
      saveSessions(sessions);
      isFirstCall = true;
    }

    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  log('ERROR', `Claude ${MAX_RETRIES}회 시도 모두 실패`);
  return '❌ 처리에 실패했습니다. 잠시 후 다시 시도해주세요.';
}

// ─── /새세션 명령 ───
function isNewSessionCommand(text: string): boolean {
  return /^\/(새세션|newsession|reset|new)\s*$/i.test(text.trim());
}

// ─── 메시지 처리 ───
async function handleMessage(msg: Record<string, unknown>) {
  const chatId = String((msg.chat as Record<string, unknown>).id);
  const messageId = msg.message_id as number;
  const text = (msg.text as string) || '';
  const from = msg.from as Record<string, unknown> | undefined;
  const username = from ? (from.username as string || from.first_name as string || 'unknown') : 'unknown';

  // 허용 그룹 확인
  if (!GROUP_WORKSPACE[chatId]) {
    log('WARN', `비허용 채팅방: ${chatId}`);
    return;
  }

  if (!text.trim()) return;

  // /새세션 명령 처리
  if (isNewSessionCommand(text)) {
    const sessions = loadSessions();
    const workspace = resolveWorkspace(chatId, text);
    const key = getSessionKey(chatId, workspace);
    delete sessions[key];
    saveSessions(sessions);
    await sendMessage(chatId, '🔄 세션이 초기화되었습니다. 새 대화를 시작합니다.', messageId);
    log('INFO', `세션 초기화: ${key}`);
    return;
  }

  // 일반 / 명령 무시 (/start 등)
  if (text.startsWith('/')) return;

  log('INFO', `메시지 수신: [${username}] ${text.slice(0, 100)}`);

  const progress = startProgressTimer(chatId);

  try {
    const workspace = resolveWorkspace(chatId, text);
    const response = await runClaude(text, workspace, chatId);
    await sendMessage(chatId, response, messageId);
    log('INFO', `응답 전송 완료: ${response.length}자`);
  } catch (err) {
    log('ERROR', `handleMessage 에러: ${(err as Error).message}`);
    await sendMessage(chatId, '❌ 내부 오류가 발생했습니다.', messageId);
  } finally {
    progress.stop();
  }
}

// ─── 즉시 처리 대상 판별 ───
function isImmediateCommand(text: string): boolean {
  if (!text.trim()) return false;
  // /새세션 등 슬래시 명령은 즉시 처리
  if (text.trim().startsWith('/')) return true;
  return false;
}

// ─── 배치 처리 큐 (동시 Claude 호출 방지) ───
const batchProcessQueue: Array<() => Promise<void>> = [];
let processingBatch = false;

async function enqueueBatchProcess(fn: () => Promise<void>) {
  batchProcessQueue.push(fn);
  if (processingBatch) return;
  processingBatch = true;
  while (batchProcessQueue.length > 0) {
    const task = batchProcessQueue.shift()!;
    try { await task(); }
    catch (err) { log('ERROR', `배치큐 에러: ${(err as Error).message}`); }
  }
  processingBatch = false;
}

// ─── 배칭된 메시지 처리 ───
function processBatch(chatId: string) {
  const batch = batchBuffer.get(chatId);
  if (!batch || batch.messages.length === 0) {
    batchBuffer.delete(chatId);
    return;
  }

  const messages = [...batch.messages];
  batchBuffer.delete(chatId);

  enqueueBatchProcess(async () => {
    // 첫 번째 메시지의 원본 msg 객체를 기반으로 처리
    const firstMsg = messages[0].msg;
    const firstMessageId = messages[0].messageId;

    if (messages.length === 1) {
      // 메시지가 1개면 기존과 동일하게 처리
      log('INFO', `배칭 완료: chatId=${chatId}, 메시지 1개 → 그대로 처리`);
      try { await handleMessage(firstMsg); }
      catch (err) { log('ERROR', `배칭 처리 에러: ${(err as Error).message}`); }
      return;
    }

    // 여러 메시지를 하나의 프롬프트로 합치기
    log('INFO', `배칭 완료: chatId=${chatId}, 메시지 ${messages.length}개 합침`);

    const combinedParts = messages.map((m, i) =>
      `[연속 메시지 ${i + 1}] ${m.text}`
    );
    const combinedText = combinedParts.join('\n\n') + '\n\n위 내용을 모두 반영하여 처리해주세요.';

    // 합친 텍스트로 가상 메시지 생성 (첫 번째 메시지 기반)
    const mergedMsg: Record<string, unknown> = {
      ...firstMsg,
      text: combinedText,
      message_id: firstMessageId, // 첫 번째 메시지에 reply
    };

    try { await handleMessage(mergedMsg); }
    catch (err) { log('ERROR', `배칭 처리 에러: ${(err as Error).message}`); }
  });
}

// ─── 큐 + 배칭 + 폴링 ───
async function processQueue() {
  if (processingQueue) return;
  processingQueue = true;

  while (messageQueue.length > 0) {
    const msg = messageQueue.shift()!;
    const chat = msg.chat as Record<string, unknown>;
    const chatId = String(chat.id);
    const text = (msg.text as string) || '';
    const messageId = msg.message_id as number;
    const from = msg.from as Record<string, unknown> | undefined;
    const username = from ? (from.username as string || from.first_name as string || 'unknown') : 'unknown';

    // 즉시 처리 대상 (슬래시 명령 등)은 배칭하지 않고 바로 처리
    if (isImmediateCommand(text)) {
      try { await handleMessage(msg); }
      catch (err) { log('ERROR', `즉시처리 에러: ${(err as Error).message}`); }
      continue;
    }

    // 허용 그룹 아니면 스킵
    if (!GROUP_WORKSPACE[chatId]) continue;

    // 배칭 버퍼에 추가
    const existing = batchBuffer.get(chatId);

    if (existing) {
      // 기존 타이머 리셋
      if (existing.timer) clearTimeout(existing.timer);
      existing.messages.push({ text, messageId, username, msg });
      log('INFO', `배칭 추가: chatId=${chatId}, 현재 ${existing.messages.length}개`);

      // 타이머 재시작 (마지막 메시지 기준 15초 대기)
      existing.timer = setTimeout(() => {
        processBatch(chatId);
      }, BATCH_WAIT_MS);
    } else {
      // 새 배치 시작
      const entry: BatchEntry = {
        messages: [{ text, messageId, username, msg }],
        timer: null,
        notified: false,
      };

      batchBuffer.set(chatId, entry);

      // "접수" 응답 즉시 전송 (Claude 작업 중이면 대기열 상태 표시)
      if (processingBatch) {
        const queueLen = batchProcessQueue.length + 1;
        sendMessage(chatId, `📋 대기열 ${queueLen}번째 추가됨 (앞 작업 처리 중, 완료 후 순차 진행)`, messageId)
          .then(() => { entry.notified = true; })
          .catch(() => {});
      } else {
        sendMessage(chatId, '📋 메시지 접수됨, 추가 메시지 대기 중... (15초)', messageId)
          .then(() => { entry.notified = true; })
          .catch(() => {});
      }

      log('INFO', `배칭 시작: chatId=${chatId}, 15초 대기`);

      // 15초 타이머 시작
      entry.timer = setTimeout(() => {
        processBatch(chatId);
      }, BATCH_WAIT_MS);
    }
  }

  processingQueue = false;
}

async function pollUpdates() {
  while (true) {
    try {
      const result = await tgApi('getUpdates', {
        offset: lastUpdateId + 1,
        timeout: 30,
        allowed_updates: ['message'],
      });
      const updates = (result.result as Record<string, unknown>[]) || [];
      for (const update of updates) {
        lastUpdateId = update.update_id as number;
        const msg = update.message as Record<string, unknown> | undefined;
        if (msg) messageQueue.push(msg);
      }
      if (messageQueue.length > 0) processQueue();
    } catch (err) {
      log('ERROR', `폴링 에러: ${(err as Error).message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// ─── 시작 ───
async function main() {
  if (!BOT_TOKEN) {
    log('ERROR', 'TELEGRAM_BOT_TOKEN 미설정');
    process.exit(1);
  }
  try { execSync('which claude', { stdio: 'pipe' }); }
  catch { log('ERROR', 'claude CLI 없음'); process.exit(1); }

  // getMe 네트워크 실패 방어 — fetch failed 시 재시도 (지수백오프).
  // 기존엔 me.result=undefined로 username 접근 시 crash → PM2 autorestart 무한반복 위험.
  let botInfo: Record<string, unknown> | undefined;
  for (let i = 0; i < 5; i++) {
    const me = await tgApi('getMe');
    if (me.ok && me.result) {
      botInfo = me.result as Record<string, unknown>;
      break;
    }
    log('WARN', `getMe 시도 ${i + 1}/5 실패, ${(i + 1) * 2}초 후 재시도`);
    await new Promise(r => setTimeout(r, (i + 1) * 2000));
  }
  if (!botInfo) {
    log('ERROR', 'getMe 5회 모두 실패 — 네트워크 복구 후 재시작 필요');
    process.exit(1);
  }
  log('INFO', `텔레그램 릴레이 v2 시작: @${botInfo.username}`);
  log('INFO', `그룹 매핑: ${Object.entries(GROUP_WORKSPACE).map(([id, g]) => `${g.name}(${id})`).join(', ')}`);
  log('INFO', `허용 도구: ${ALLOWED_TOOLS}`);
  log('INFO', `세션 파일: ${SESSION_FILE}`);

  await pollUpdates();
}

main().catch((err) => {
  log('ERROR', `치명적 에러: ${err.message}`);
  process.exit(1);
});
