#!/usr/bin/env python3
"""
계정별 발송 리포터 v1.0
- 계정별 성공/실패/스킵/유효율 추적
- 세션 종료 시 HTML + 텔레그램 보고서 자동 생성
- 실시간 로그 + 일일 통합 리포트
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

BASE_DIR = Path(__file__).parent
REPORT_DIR = BASE_DIR / 'reports'
REPORT_DIR.mkdir(exist_ok=True)
ACCOUNT_LOG_FILE = BASE_DIR / 'account_logs.json'


class AccountReporter:
    """계정별 발송 성과 추적 + 보고서 생성"""
    
    def __init__(self):
        self.sessions = {}  # {account_id: AccountSession}
        self.all_logs = self._load_logs()
    
    def _load_logs(self):
        if ACCOUNT_LOG_FILE.exists():
            return json.loads(ACCOUNT_LOG_FILE.read_text(encoding='utf-8'))
        return {'sessions': [], 'daily': {}}
    
    def _save_logs(self):
        ACCOUNT_LOG_FILE.write_text(
            json.dumps(self.all_logs, ensure_ascii=False, indent=2), encoding='utf-8')
    
    def start_session(self, account_id, proxy_ip='direct'):
        """계정 세션 시작"""
        session = {
            'account_id': account_id,
            'proxy_ip': proxy_ip,
            'start_time': datetime.now().isoformat(),
            'end_time': None,
            'expire_at': (datetime.now() + timedelta(hours=2)).isoformat(),
            'total_attempts': 0,
            'success': 0,
            'failed': 0,
            'skipped_no_talktalk': 0,
            'skipped_duplicate': 0,
            'captcha_hit': 0,
            'blocked': False,
            'block_reason': '',
            'details': [],  # [{pid, name, status, reason, time, elapsed_sec}]
        }
        self.sessions[account_id] = session
        return session
    
    def log_attempt(self, account_id, pid, name, status, reason='', elapsed_sec=0):
        """
        발송 시도 기록
        status: 'success' | 'failed' | 'skip_no_talktalk' | 'skip_duplicate' | 'captcha' | 'blocked'
        """
        if account_id not in self.sessions:
            self.start_session(account_id)
        
        session = self.sessions[account_id]
        session['total_attempts'] += 1
        
        detail = {
            'pid': str(pid),
            'name': name,
            'status': status,
            'reason': reason,
            'time': datetime.now().isoformat(),
            'elapsed_sec': round(elapsed_sec, 1),
        }
        session['details'].append(detail)
        
        if status == 'success':
            session['success'] += 1
        elif status == 'failed':
            session['failed'] += 1
        elif status == 'skip_no_talktalk':
            session['skipped_no_talktalk'] += 1
        elif status == 'skip_duplicate':
            session['skipped_duplicate'] += 1
        elif status == 'captcha':
            session['captcha_hit'] += 1
            session['failed'] += 1
        elif status == 'blocked':
            session['blocked'] = True
            session['block_reason'] = reason
            session['failed'] += 1
        
        return detail
    
    def end_session(self, account_id):
        """세션 종료 + 보고서 생성"""
        if account_id not in self.sessions:
            return None
        
        session = self.sessions[account_id]
        session['end_time'] = datetime.now().isoformat()
        
        # 로그 저장
        self.all_logs['sessions'].append(session)
        today = datetime.now().strftime('%Y-%m-%d')
        if today not in self.all_logs['daily']:
            self.all_logs['daily'][today] = {
                'accounts_used': 0, 'total_success': 0, 'total_failed': 0,
                'total_skip': 0, 'total_captcha': 0, 'total_blocked': 0
            }
        daily = self.all_logs['daily'][today]
        daily['accounts_used'] += 1
        daily['total_success'] += session['success']
        daily['total_failed'] += session['failed']
        daily['total_skip'] += session['skipped_no_talktalk'] + session['skipped_duplicate']
        daily['total_captcha'] += session['captcha_hit']
        if session['blocked']:
            daily['total_blocked'] += 1
        
        self._save_logs()
        
        # 보고서 생성
        report = self._generate_session_report(session)
        del self.sessions[account_id]
        return report
    
    def _generate_session_report(self, session):
        """세션 보고서 생성"""
        total = session['total_attempts']
        success = session['success']
        failed = session['failed']
        skip_tt = session['skipped_no_talktalk']
        skip_dup = session['skipped_duplicate']
        captcha = session['captcha_hit']
        
        # 유효율 계산
        actual_attempts = total - skip_tt - skip_dup
        valid_rate = (success / actual_attempts * 100) if actual_attempts > 0 else 0
        
        # 평균 소요시간
        success_details = [d for d in session['details'] if d['status'] == 'success']
        avg_elapsed = sum(d['elapsed_sec'] for d in success_details) / len(success_details) if success_details else 0
        
        # 세션 시간
        start = datetime.fromisoformat(session['start_time'])
        end = datetime.fromisoformat(session['end_time']) if session['end_time'] else datetime.now()
        duration = (end - start).total_seconds()
        
        # 텍스트 보고서
        text = f"""📊 계정 세션 보고서
━━━━━━━━━━━━━━━━━━━
🔑 계정: {session['account_id'][:4]}****
🌐 IP: {session['proxy_ip']}
⏱️ 세션: {start.strftime('%H:%M')} ~ {end.strftime('%H:%M')} ({duration/60:.0f}분)
{'🚫 차단됨: ' + session['block_reason'] if session['blocked'] else ''}
━━━━━━━━━━━━━━━━━━━
📤 총 시도: {total}건
  ✅ 발송 성공: {success}건
  ❌ 발송 실패: {failed}건
  ⏭️ 톡톡없음: {skip_tt}건
  🔄 중복스킵: {skip_dup}건
  🔒 캡차: {captcha}건
━━━━━━━━━━━━━━━━━━━
📈 유효 발송률: {valid_rate:.1f}%
   ({success}/{actual_attempts} 실제 시도 중 성공)
⚡ 평균 소요: {avg_elapsed:.1f}초/건
💰 계정 활용도: {total}건/{duration/60:.0f}분
"""
        
        # HTML 보고서
        html = self._generate_html_report(session, text)
        
        # HTML 저장
        safe_id = session['account_id'][:8].replace('@','_')
        timestamp = start.strftime('%Y%m%d_%H%M')
        html_path = REPORT_DIR / f'session_{safe_id}_{timestamp}.html'
        html_path.write_text(html, encoding='utf-8')
        
        return {
            'text': text,
            'html_path': str(html_path),
            'stats': {
                'total': total,
                'success': success,
                'failed': failed,
                'skip_no_talktalk': skip_tt,
                'skip_duplicate': skip_dup,
                'captcha': captcha,
                'blocked': session['blocked'],
                'valid_rate': round(valid_rate, 1),
                'avg_elapsed': round(avg_elapsed, 1),
                'duration_min': round(duration / 60, 1),
            }
        }
    
    def _generate_html_report(self, session, text_report):
        """HTML 보고서"""
        total = session['total_attempts']
        success = session['success']
        failed = session['failed']
        skip_tt = session['skipped_no_talktalk']
        actual = total - skip_tt - session['skipped_duplicate']
        valid_rate = (success / actual * 100) if actual > 0 else 0
        
        # 상세 테이블 행
        rows = ''
        for i, d in enumerate(session['details'], 1):
            status_emoji = {
                'success': '✅', 'failed': '❌', 'skip_no_talktalk': '⏭️',
                'skip_duplicate': '🔄', 'captcha': '🔒', 'blocked': '🚫'
            }.get(d['status'], '❓')
            status_class = {
                'success': 'green', 'failed': 'red', 'skip_no_talktalk': 'gray',
                'skip_duplicate': 'blue', 'captcha': 'orange', 'blocked': 'red'
            }.get(d['status'], '')
            time_str = datetime.fromisoformat(d['time']).strftime('%H:%M:%S')
            rows += f'''<tr class="{status_class}">
                <td>{i}</td><td>{time_str}</td><td>{d['name']}</td>
                <td>{d['pid']}</td><td>{status_emoji} {d['status']}</td>
                <td>{d['reason']}</td><td>{d['elapsed_sec']}s</td>
            </tr>'''
        
        return f'''<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>톡톡 발송 보고서</title>
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family: -apple-system, sans-serif; background: #0a0a1a; color: #eee; padding: 20px; }}
.container {{ max-width: 900px; margin: 0 auto; }}
h1 {{ text-align: center; margin: 20px 0; color: #00d26a; }}
.stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 20px 0; }}
.stat {{ background: #16213e; border-radius: 10px; padding: 15px; text-align: center; }}
.stat .num {{ font-size: 28px; font-weight: 700; }}
.stat .label {{ font-size: 12px; color: #888; margin-top: 5px; }}
.stat.green .num {{ color: #00d26a; }} .stat.red .num {{ color: #e94560; }}
.stat.blue .num {{ color: #4fc3f7; }} .stat.yellow .num {{ color: #f5a623; }}
.stat.purple .num {{ color: #bb86fc; }}
table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
th {{ background: #16213e; padding: 10px; text-align: left; font-size: 13px; }}
td {{ padding: 8px 10px; border-bottom: 1px solid #1a1a3e; font-size: 13px; }}
tr.green td {{ background: rgba(0,210,106,0.05); }}
tr.red td {{ background: rgba(233,69,96,0.05); }}
tr.gray td {{ color: #666; }}
tr.orange td {{ background: rgba(245,166,35,0.05); }}
.bar {{ height: 30px; border-radius: 6px; display: flex; overflow: hidden; margin: 10px 0; }}
.bar-green {{ background: #00d26a; }} .bar-red {{ background: #e94560; }}
.bar-gray {{ background: #333; }} .bar-blue {{ background: #4fc3f7; }}
</style></head><body>
<div class="container">
<h1>📊 톡톡 발송 보고서</h1>
<p style="text-align:center;color:#888;">계정: {session['account_id'][:4]}**** | IP: {session['proxy_ip']}</p>

<div class="stats">
  <div class="stat blue"><div class="num">{total}</div><div class="label">총 시도</div></div>
  <div class="stat green"><div class="num">{success}</div><div class="label">성공</div></div>
  <div class="stat red"><div class="num">{failed}</div><div class="label">실패</div></div>
  <div class="stat yellow"><div class="num">{skip_tt}</div><div class="label">톡톡없음</div></div>
  <div class="stat purple"><div class="num">{valid_rate:.0f}%</div><div class="label">유효율</div></div>
</div>

<div class="bar">
  <div class="bar-green" style="width:{success/max(total,1)*100}%" title="성공 {success}"></div>
  <div class="bar-red" style="width:{failed/max(total,1)*100}%" title="실패 {failed}"></div>
  <div class="bar-gray" style="width:{skip_tt/max(total,1)*100}%" title="스킵 {skip_tt}"></div>
</div>

<h2 style="margin:20px 0 10px;font-size:16px;">📋 상세 로그</h2>
<table>
<tr><th>#</th><th>시간</th><th>업체명</th><th>PID</th><th>상태</th><th>사유</th><th>소요</th></tr>
{rows}
</table>
</div></body></html>'''
    
    def get_daily_summary(self, date=None):
        """일일 통합 리포트"""
        date = date or datetime.now().strftime('%Y-%m-%d')
        daily = self.all_logs.get('daily', {}).get(date, {})
        
        if not daily:
            return '📊 오늘 발송 데이터 없음'
        
        today_sessions = [s for s in self.all_logs.get('sessions', []) 
                         if s['start_time'].startswith(date)]
        
        total_success = daily.get('total_success', 0)
        total_failed = daily.get('total_failed', 0)
        total_skip = daily.get('total_skip', 0)
        accounts = daily.get('accounts_used', 0)
        blocked = daily.get('total_blocked', 0)
        total = total_success + total_failed + total_skip
        valid_rate = (total_success / (total_success + total_failed) * 100) if (total_success + total_failed) > 0 else 0
        
        # 계정별 성과
        account_lines = ''
        for s in today_sessions:
            actual = s['total_attempts'] - s['skipped_no_talktalk'] - s['skipped_duplicate']
            ar = (s['success'] / actual * 100) if actual > 0 else 0
            status = '🚫차단' if s['blocked'] else '✅정상'
            account_lines += f"\n  {s['account_id'][:4]}**** | {status} | 성공:{s['success']} 실패:{s['failed']} 유효율:{ar:.0f}%"
        
        text = f"""📊 일일 발송 리포트 [{date}]
━━━━━━━━━━━━━━━━━━━━━
🔑 사용 계정: {accounts}개 (차단: {blocked}개)
📤 총 처리: {total}건
  ✅ 성공: {total_success}건
  ❌ 실패: {total_failed}건  
  ⏭️ 스킵: {total_skip}건
📈 유효 발송률: {valid_rate:.1f}%
━━━━━━━━━━━━━━━━━━━━━
📋 계정별 성과:{account_lines}
━━━━━━━━━━━━━━━━━━━━━
💰 계정 효율: 평균 {total_success/max(accounts,1):.0f}건/계정
"""
        
        # HTML 일일 보고서도 생성
        html_path = REPORT_DIR / f'daily_{date}.html'
        self._generate_daily_html(date, today_sessions, html_path)
        
        return {'text': text, 'html_path': str(html_path)}
    
    def _generate_daily_html(self, date, sessions, html_path):
        """일일 HTML 보고서"""
        total_s = sum(s['success'] for s in sessions)
        total_f = sum(s['failed'] for s in sessions)
        total_skip = sum(s['skipped_no_talktalk'] + s['skipped_duplicate'] for s in sessions)
        accounts = len(sessions)
        blocked = sum(1 for s in sessions if s['blocked'])
        
        rows = ''
        for s in sessions:
            actual = s['total_attempts'] - s['skipped_no_talktalk'] - s['skipped_duplicate']
            vr = (s['success'] / actual * 100) if actual > 0 else 0
            start = datetime.fromisoformat(s['start_time']).strftime('%H:%M')
            end = datetime.fromisoformat(s['end_time']).strftime('%H:%M') if s['end_time'] else '-'
            status = '🚫' if s['blocked'] else '✅'
            rows += f'''<tr>
                <td>{s['account_id'][:4]}****</td><td>{s['proxy_ip']}</td>
                <td>{start}~{end}</td><td>{status}</td>
                <td>{s['success']}</td><td>{s['failed']}</td>
                <td>{s['skipped_no_talktalk']}</td><td>{s['captcha_hit']}</td>
                <td>{vr:.0f}%</td>
            </tr>'''
        
        html = f'''<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>일일 보고서 {date}</title>
<style>
body {{ font-family: -apple-system, sans-serif; background: #0a0a1a; color: #eee; padding: 20px; }}
.container {{ max-width: 900px; margin: 0 auto; }}
h1 {{ text-align: center; color: #00d26a; margin: 20px 0; }}
.stats {{ display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 20px 0; }}
.stat {{ background: #16213e; border-radius: 10px; padding: 15px; text-align: center; }}
.stat .num {{ font-size: 28px; font-weight: 700; }}
.stat .label {{ font-size: 12px; color: #888; }}
.green .num {{ color: #00d26a; }} .red .num {{ color: #e94560; }}
.blue .num {{ color: #4fc3f7; }} .yellow .num {{ color: #f5a623; }}
table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
th {{ background: #16213e; padding: 10px; text-align: left; }}
td {{ padding: 8px; border-bottom: 1px solid #1a1a3e; }}
</style></head><body>
<div class="container">
<h1>📊 일일 발송 보고서 — {date}</h1>
<div class="stats">
  <div class="stat blue"><div class="num">{accounts}</div><div class="label">계정 수</div></div>
  <div class="stat green"><div class="num">{total_s}</div><div class="label">성공</div></div>
  <div class="stat red"><div class="num">{total_f}</div><div class="label">실패</div></div>
  <div class="stat yellow"><div class="num">{total_skip}</div><div class="label">스킵</div></div>
  <div class="stat red"><div class="num">{blocked}</div><div class="label">차단</div></div>
</div>
<table>
<tr><th>계정</th><th>IP</th><th>시간</th><th>상태</th><th>성공</th><th>실패</th><th>톡톡없음</th><th>캡차</th><th>유효율</th></tr>
{rows}
</table>
</div></body></html>'''
        html_path.write_text(html, encoding='utf-8')


# CLI
if __name__ == '__main__':
    import sys
    reporter = AccountReporter()
    
    if len(sys.argv) > 1 and sys.argv[1] == 'daily':
        date = sys.argv[2] if len(sys.argv) > 2 else None
        result = reporter.get_daily_summary(date)
        if isinstance(result, str):
            print(result)
        else:
            print(result['text'])
            print(f'\n📁 HTML: {result["html_path"]}')
    
    elif len(sys.argv) > 1 and sys.argv[1] == 'demo':
        # 데모 데이터
        reporter.start_session('test_user1', '123.45.67.89')
        reporter.log_attempt('test_user1', '11111', '테스트업체A', 'success', elapsed_sec=35)
        reporter.log_attempt('test_user1', '22222', '테스트업체B', 'success', elapsed_sec=42)
        reporter.log_attempt('test_user1', '33333', '테스트업체C', 'skip_no_talktalk', reason='톡톡 버튼 없음')
        reporter.log_attempt('test_user1', '44444', '테스트업체D', 'failed', reason='메시지 입력창 없음', elapsed_sec=28)
        reporter.log_attempt('test_user1', '55555', '테스트업체E', 'captcha', reason='캡차 감지')
        result = reporter.end_session('test_user1')
        print(result['text'])
        print(f'\n📁 HTML: {result["html_path"]}')
    
    else:
        print('사용법:')
        print('  python account_reporter.py daily [YYYY-MM-DD]  — 일일 보고서')
        print('  python account_reporter.py demo                — 데모 데이터')
