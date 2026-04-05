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

let lastUpdateId = 0;
let isProcessing = false;

// 타임스탬프 로거
function log(level: string, msg: string) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  process.stdout.write(`[${ts}] [${level}] ${msg}\n`);
}

// 텔레그램 API 호출
async function tgApi(method: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<Record<string, unknown>>;
}

// 텔레그램 메시지 전송 (4000자 제한 처리)
async function sendMessage(chatId: string, text: string, replyTo?: number) {
  if (text.length <= MAX_RESPONSE_LENGTH) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text,
      reply_to_message_id: replyTo,
    });
  } else {
    // 긴 응답은 파트로 분할
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

// Claude Code CLI 실행
function runClaude(prompt: string, workspace: string): Promise<string> {
  return new Promise((resolve) => {
    log('INFO', `Claude 실행: workspace=${workspace}, prompt=${prompt.slice(0, 100)}...`);

    const proc = spawn('claude', [
      '--print',
      '--dangerously-skip-permissions',
      prompt,
    ], {
      cwd: workspace,
      env: { ...process.env, HOME: '/home/onda' },
      timeout: 5400000, // 1시간 30분 타임아웃
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
      if (code === 0 && stdout.trim()) {
        log('INFO', `Claude 완료: ${stdout.length}자 출력`);
        resolve(stdout.trim());
      } else {
        log('ERROR', `Claude 실패: code=${code}, stderr=${stderr.slice(0, 200)}`);
        resolve(`❌ Claude Code 실행 실패 (exit: ${code})\n${stderr.slice(0, 500)}`);
      }
    });

    proc.on('error', (err: Error) => {
      log('ERROR', `Claude spawn 에러: ${err.message}`);
      resolve(`❌ Claude Code 실행 에러: ${err.message}`);
    });
  });
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

  // 처리 중 표시
  await tgApi('sendChatAction', { chat_id: chatId, action: 'typing' });

  // 워크스페이스 감지
  const workspace = detectWorkspace(text);

  // Claude Code 실행
  const response = await runClaude(text, workspace);

  // 응답 전송
  await sendMessage(chatId, response, messageId);
  log('INFO', `응답 전송 완료: ${response.length}자`);
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
          // 순차 처리 (Claude Code 동시 실행 방지)
          if (!isProcessing) {
            isProcessing = true;
            try {
              await handleMessage(msg);
            } finally {
              isProcessing = false;
            }
          } else {
            const chatId = String((msg.chat as Record<string, unknown>).id);
            await sendMessage(chatId, '⏳ 이전 요청 처리 중입니다. 잠시 후 다시 시도해주세요.');
          }
        }
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

  await pollUpdates();
}

main().catch((err) => {
  log('ERROR', `치명적 에러: ${err.message}`);
  process.exit(1);
});
