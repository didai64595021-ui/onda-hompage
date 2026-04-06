/**
 * 텔레그램 ↔ Claude Code 순수 릴레이 스크립트
 *
 * OpenClaw 대신 직접 텔레그램 메시지를 Claude Code CLI로 전달하고
 * 결과를 텔레그램으로 반환합니다.
 *
 * 비용: $0 (Claude Max 토큰만 사용)
 * 실행: PM2로 상시 실행
 */

import { spawn, execSync } from 'child_process';

// 환경변수
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const ALLOWED_CHAT_IDS = (process.env.TELEGRAM_RELAY_CHAT_IDS || '-1003753252286').split(',');
const DEFAULT_WORKSPACE = process.env.CLAUDE_RELAY_WORKSPACE || '/home/onda/projects/onda-ad';
const MAX_RESPONSE_LENGTH = 4000;
const MAX_RETRIES = 2;
const TYPING_INTERVAL_MS = 8000;       // 8초마다 typing 표시
const PROGRESS_REPORT_MS = 30000;      // 30초 이상이면 중간보고

// 워크스페이스 매핑 (키워드 기반)
const WORKSPACE_MAP: Record<string, string> = {
  'onda-ad': '/home/onda/projects/onda-ad',
  '온다애드': '/home/onda/projects/onda-ad',
  'logic-monitor': '/home/onda/projects/onda-logic-monitor',
  '로직모니터': '/home/onda/projects/onda-logic-monitor',
  'homepage': '/home/onda/projects/onda-hompage',
  '홈페이지': '/home/onda/projects/onda-hompage',
  'coldmail': '/home/onda/projects/onda-coldmail',
  '콜드메일': '/home/onda/projects/onda-coldmail',
};

// 에러 메시지 패턴
const ERROR_PATTERNS = [
  /⚠️\s*Something went wrong while processing your request\.?[^\n]*(?:\n|$)/g,
  /Please try again, or use \/new to start a fresh session\.?\s*\n?/g,
  /^\s*Error:.*$/gm,
];

let lastUpdateId = 0;

// 메시지 큐
const messageQueue: Array<Record<string, unknown>> = [];
let processingQueue = false;

// 타임스탬프 로거
function log(level: string, msg: string) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  process.stdout.write(`[${ts}] [${level}] ${msg}\n`);
}

// 텔레그램 API 호출
async function tgApi(method: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json() as Promise<Record<string, unknown>>;
  } catch (err) {
    log('ERROR', `tgApi ${method} 실패: ${(err as Error).message}`);
    return { ok: false };
  }
}

// 텔레그램 메시지 전송 (4000자 제한 처리)
async function sendMessage(chatId: string, text: string, replyTo?: number) {
  if (!text.trim()) return;
  if (text.length <= MAX_RESPONSE_LENGTH) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text,
      reply_to_message_id: replyTo,
    });
  } else {
    const parts = [];
    for (let i = 0; i < text.length; i += MAX_RESPONSE_LENGTH) {
      parts.push(text.slice(i, i + MAX_RESPONSE_LENGTH));
    }
    for (const part of parts) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: part,
        reply_to_message_id: replyTo,
      });
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// 메시지에서 워크스페이스 감지
function detectWorkspace(text: string): string {
  for (const [keyword, workspace] of Object.entries(WORKSPACE_MAP)) {
    if (text.toLowerCase().includes(keyword.toLowerCase())) {
      return workspace;
    }
  }
  return DEFAULT_WORKSPACE;
}

// Claude 출력에서 에러 메시지 필터링
function cleanClaudeOutput(raw: string): string {
  let cleaned = raw;
  for (const pattern of ERROR_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned.trim();
}

// typing 표시 + 중간보고 타이머 관리
function startProgressTimer(chatId: string) {
  let elapsed = 0;
  let reported = false;

  const timer = setInterval(async () => {
    elapsed += TYPING_INTERVAL_MS;
    await tgApi('sendChatAction', { chat_id: chatId, action: 'typing' });

    if (!reported && elapsed >= PROGRESS_REPORT_MS) {
      reported = true;
      await sendMessage(chatId, '⏳ 아직 처리 중입니다. 긴 작업이니 잠시만 기다려주세요.');
      log('INFO', `중간보고 전송 (${Math.round(elapsed / 1000)}초 경과)`);
    }
  }, TYPING_INTERVAL_MS);

  return { stop: () => clearInterval(timer) };
}

// Claude Code CLI 실행 (단일 시도)
function runClaudeOnce(prompt: string, workspace: string): Promise<{ success: boolean; output: string; raw: string }> {
  return new Promise((resolve) => {
    const proc = spawn('claude', [
      '--print',
      '--dangerously-skip-permissions',
      '--',
      prompt,
    ], {
      cwd: workspace,
      env: { ...process.env, HOME: '/home/onda' },
      timeout: 300000, // 5분 타임아웃 (단일 시도)
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number | null) => {
      const cleaned = cleanClaudeOutput(stdout);

      if (code === 0 && cleaned) {
        resolve({ success: true, output: cleaned, raw: stdout });
      } else if (code === 0 && stdout.trim() && !cleaned) {
        // 에러 메시지만 있고 실제 응답 없음
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

// Claude Code CLI 실행 (재시도 포함)
async function runClaude(prompt: string, workspace: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log('INFO', `Claude 실행 (시도 ${attempt}/${MAX_RETRIES}): workspace=${workspace}, prompt=${prompt.slice(0, 100)}...`);

    const result = await runClaudeOnce(prompt, workspace);

    if (result.success) {
      log('INFO', `Claude 완료: ${result.output.length}자 출력`);
      return result.output;
    }

    log('WARN', `Claude 시도 ${attempt} 실패: ${result.output.slice(0, 100)}`);

    if (attempt < MAX_RETRIES) {
      log('INFO', `${attempt + 1}번째 재시도 대기 (3초)...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  log('ERROR', `Claude ${MAX_RETRIES}회 시도 모두 실패`);
  return '❌ 처리에 실패했습니다. 잠시 후 다시 시도해주세요.';
}

// 메시지 처리
async function handleMessage(msg: Record<string, unknown>) {
  const chatId = String((msg.chat as Record<string, unknown>).id);
  const messageId = msg.message_id as number;
  const text = (msg.text as string) || '';
  const from = msg.from as Record<string, unknown> | undefined;
  const username = from ? (from.username as string || from.first_name as string || 'unknown') : 'unknown';

  // 허용된 채팅방만
  if (!ALLOWED_CHAT_IDS.includes(chatId)) {
    log('WARN', `비허용 채팅방: ${chatId}`);
    return;
  }

  // 빈 메시지 무시
  if (!text.trim()) return;

  // 봇 명령어 무시 (/start 등)
  if (text.startsWith('/')) return;

  log('INFO', `메시지 수신: [${username}] ${text.slice(0, 100)}`);

  // typing + 중간보고 타이머 시작
  const progress = startProgressTimer(chatId);

  try {
    // 워크스페이스 감지
    const workspace = detectWorkspace(text);

    // Claude Code 실행 (재시도 포함)
    const response = await runClaude(text, workspace);

    // 응답 전송
    await sendMessage(chatId, response, messageId);
    log('INFO', `응답 전송 완료: ${response.length}자`);
  } catch (err) {
    log('ERROR', `handleMessage 에러: ${(err as Error).message}`);
    await sendMessage(chatId, '❌ 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', messageId);
  } finally {
    progress.stop();
  }
}

// 메시지 큐 순차 처리
async function processQueue() {
  if (processingQueue) return;
  processingQueue = true;

  while (messageQueue.length > 0) {
    const msg = messageQueue.shift()!;
    try {
      await handleMessage(msg);
    } catch (err) {
      log('ERROR', `큐 처리 에러: ${(err as Error).message}`);
    }
  }

  processingQueue = false;
}

// 폴링 루프
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
        if (msg) {
          messageQueue.push(msg);
        }
      }

      // 큐에 메시지가 있으면 순차 처리 시작
      if (messageQueue.length > 0) {
        processQueue();
      }
    } catch (err) {
      log('ERROR', `폴링 에러: ${(err as Error).message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// 시작
async function main() {
  if (!BOT_TOKEN) {
    log('ERROR', 'TELEGRAM_BOT_TOKEN이 설정되지 않았습니다.');
    process.exit(1);
  }

  // claude CLI 확인
  try {
    execSync('which claude', { stdio: 'pipe' });
  } catch {
    log('ERROR', 'claude CLI를 찾을 수 없습니다.');
    process.exit(1);
  }

  const me = await tgApi('getMe');
  const botInfo = me.result as Record<string, unknown>;
  log('INFO', `텔레그램 봇 시작: @${botInfo.username}`);
  log('INFO', `허용 채팅방: ${ALLOWED_CHAT_IDS.join(', ')}`);
  log('INFO', `기본 워크스페이스: ${DEFAULT_WORKSPACE}`);
  log('INFO', `재시도: ${MAX_RETRIES}회, 중간보고: ${PROGRESS_REPORT_MS / 1000}초`);

  await pollUpdates();
}

main().catch((err) => {
  log('ERROR', `치명적 에러: ${err.message}`);
  process.exit(1);
});
