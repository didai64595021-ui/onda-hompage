/* ================================================================
   ONDA AD — Dashboard Interactions (app.js)
   Pure JS, no external libraries
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ============ SIDEBAR ============
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('active');
    });
  }
  // Sidebar menu active
  document.querySelectorAll('.sidebar-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.sidebar-menu-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      // Close sidebar on mobile
      if (window.innerWidth <= 1024) sidebar.classList.remove('active');
    });
  });

  // ============ LINE CHART (SVG) ============
  const lineChart = document.getElementById('lineChart');
  if (lineChart) {
    const days = ['월', '화', '수', '목', '금', '토', '일'];
    const clicks = [1650, 1820, 1540, 2010, 1980, 1750, 2097];
    const spend = [520000, 610000, 480000, 680000, 640000, 550000, 700000];
    
    const w = 600, h = 240;
    const padL = 50, padR = 20, padT = 20, padB = 36;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;
    
    // Grid lines
    let svg = '';
    for (let i = 0; i <= 4; i++) {
      const y = padT + (chartH / 4) * i;
      svg += `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" class="chart-grid-line"/>`;
      const val = Math.round(2200 - (2200 / 4) * i);
      svg += `<text x="${padL - 8}" y="${y + 4}" class="chart-label" text-anchor="end">${val}</text>`;
    }
    
    // X labels
    days.forEach((d, i) => {
      const x = padL + (chartW / (days.length - 1)) * i;
      svg += `<text x="${x}" y="${h - 8}" class="chart-label" text-anchor="middle">${d}</text>`;
    });
    
    // Click line (green)
    const maxClick = 2200;
    const clickPoints = clicks.map((c, i) => {
      const x = padL + (chartW / (clicks.length - 1)) * i;
      const y = padT + chartH - (c / maxClick) * chartH;
      return `${x},${y}`;
    });
    
    // Area fill
    svg += `<path d="M${clickPoints[0]} ${clickPoints.join(' L')} L${padL + chartW},${padT + chartH} L${padL},${padT + chartH} Z" fill="url(#greenGrad)" class="chart-area-fill"/>`;
    svg += `<defs><linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#03C75A" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#03C75A" stop-opacity="0"/>
    </linearGradient></defs>`;
    
    svg += `<polyline points="${clickPoints.join(' ')}" class="chart-line chart-line-green"/>`;
    
    // Spend line (gray) — normalized
    const maxSpend = 800000;
    const spendPoints = spend.map((s, i) => {
      const x = padL + (chartW / (spend.length - 1)) * i;
      const y = padT + chartH - (s / maxSpend) * chartH;
      return `${x},${y}`;
    });
    svg += `<polyline points="${spendPoints.join(' ')}" class="chart-line chart-line-gray" stroke-dasharray="6,4"/>`;
    
    // Dots on click line
    clickPoints.forEach(p => {
      const [x, y] = p.split(',');
      svg += `<circle cx="${x}" cy="${y}" r="4" fill="#03C75A" stroke="#0a0a0a" stroke-width="2"/>`;
    });
    
    // Legend
    svg += `<circle cx="${padL}" cy="${h - 2}" r="4" fill="#03C75A"/>`;
    svg += `<text x="${padL + 10}" y="${h + 2}" class="chart-label">클릭</text>`;
    svg += `<line x1="${padL + 50}" y1="${h - 2}" x2="${padL + 70}" y2="${h - 2}" stroke="#555" stroke-width="2" stroke-dasharray="4,3"/>`;
    svg += `<text x="${padL + 76}" y="${h + 2}" class="chart-label">소진액</text>`;
    
    lineChart.innerHTML = svg;
  }

  // ============ BAR CHART ============
  const barChart = document.getElementById('barChart');
  if (barChart) {
    const data = [
      { label: '강남정형', ctr: 4.2, cpc: 2800 },
      { label: '어깨통증', ctr: 2.1, cpc: 1900 },
      { label: '무릎수술', ctr: 1.8, cpc: 3200 },
      { label: '관절전문', ctr: 3.5, cpc: 1500 },
      { label: '척추디스크', ctr: 2.8, cpc: 2100 },
    ];
    
    const maxCtr = 5;
    const maxCpc = 4000;
    
    data.forEach(d => {
      const group = document.createElement('div');
      group.className = 'bar-group';
      
      const barWrap = document.createElement('div');
      barWrap.className = 'bar-wrap';
      
      const barCtr = document.createElement('div');
      barCtr.className = 'bar bar-ctr';
      barCtr.style.height = '0%';
      barCtr.title = `CTR: ${d.ctr}%`;
      
      const barCpc = document.createElement('div');
      barCpc.className = 'bar bar-cpc';
      barCpc.style.height = '0%';
      barCpc.title = `CPC: ${d.cpc}원`;
      
      barWrap.appendChild(barCtr);
      barWrap.appendChild(barCpc);
      
      const label = document.createElement('div');
      label.className = 'bar-label';
      label.textContent = d.label;
      
      group.appendChild(barWrap);
      group.appendChild(label);
      barChart.appendChild(group);
      
      // Animate
      requestAnimationFrame(() => {
        setTimeout(() => {
          barCtr.style.height = `${(d.ctr / maxCtr) * 100}%`;
          barCpc.style.height = `${(d.cpc / maxCpc) * 100}%`;
        }, 300);
      });
    });
  }

  // ============ KEYWORD TABLE ============
  const tableBody = document.getElementById('keywordTableBody');
  if (tableBody) {
    const keywords = [
      { name: '강남 정형외과', clicks: 847, cpc: 2800, ctr: 4.2, quality: 8, status: 'good', statusText: '✅ 우수' },
      { name: '어깨 통증 치료', clicks: 423, cpc: 1900, ctr: 2.1, quality: 6, status: 'warn', statusText: '⚠️ 소재 교체' },
      { name: '무릎 수술 잘하는 곳', clicks: 234, cpc: 3200, ctr: 1.8, quality: 5, status: 'bad', statusText: '🔴 최적화 필요' },
      { name: '관절 전문병원', clicks: 567, cpc: 1500, ctr: 3.5, quality: 7, status: 'good', statusText: '✅ 정상' },
      { name: '척추 디스크 치료', clicks: 312, cpc: 2100, ctr: 2.8, quality: 6, status: 'warn', statusText: '⚠️ 입찰 조정' },
    ];
    
    keywords.forEach(kw => {
      const qualityClass = kw.quality >= 7 ? 'quality-high' : kw.quality >= 6 ? 'quality-mid' : 'quality-low';
      const statusClass = kw.status === 'good' ? 'status-good' : kw.status === 'warn' ? 'status-warn' : 'status-bad';
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="keyword-name">${kw.name}</td>
        <td class="right">${kw.clicks.toLocaleString()}</td>
        <td class="right">${kw.cpc.toLocaleString()}원</td>
        <td class="right">${kw.ctr}%</td>
        <td><span class="quality-badge ${qualityClass}">${kw.quality}/10</span></td>
        <td><span class="status-badge ${statusClass}">${kw.statusText}</span></td>
      `;
      tableBody.appendChild(tr);
    });
  }

  // ============ FRAUD PANEL ============
  const fraudBell = document.getElementById('fraudBell');
  const fraudPanel = document.getElementById('fraudPanel');
  const fraudOverlay = document.getElementById('fraudOverlay');
  const fraudClose = document.getElementById('fraudClose');
  const fraudList = document.getElementById('fraudList');
  
  // Populate fraud data
  if (fraudList) {
    const fraudData = [
      { ip: '211.234.xxx.123', time: '14:23:45', clicks: 8, reason: '동일 IP 3분 내 8회 클릭, 체류시간 2초' },
      { ip: '175.112.xxx.87', time: '03:12:11', clicks: 5, reason: '심야 시간대 반복 클릭, 전환 0건' },
      { ip: '222.106.xxx.201', time: '11:45:33', clicks: 12, reason: '동일 디바이스 핑거프린트, CTR 급등 패턴' },
      { ip: '118.235.xxx.45', time: '09:30:17', clicks: 3, reason: '체류시간 1초 미만, 봇 패턴 감지' },
      { ip: '203.247.xxx.156', time: '16:55:02', clicks: 6, reason: '동일 IP 대역 반복, VPN 사용 감지' },
    ];
    
    fraudData.forEach(f => {
      const item = document.createElement('div');
      item.className = 'fraud-item';
      item.innerHTML = `
        <div class="fraud-item-header">
          <span class="fraud-item-ip">${f.ip}</span>
          <span class="fraud-item-time">${f.time}</span>
        </div>
        <div class="fraud-item-details">
          <span>클릭 ${f.clicks}회</span>
        </div>
        <div class="fraud-item-reason">${f.reason}</div>
      `;
      fraudList.appendChild(item);
    });
  }
  
  function openFraudPanel() {
    fraudPanel.classList.add('active');
    fraudOverlay.classList.add('active');
  }
  function closeFraudPanel() {
    fraudPanel.classList.remove('active');
    fraudOverlay.classList.remove('active');
  }
  
  if (fraudBell) fraudBell.addEventListener('click', openFraudPanel);
  if (fraudClose) fraudClose.addEventListener('click', closeFraudPanel);
  if (fraudOverlay) fraudOverlay.addEventListener('click', closeFraudPanel);

  // ============ AI MODAL ============
  const aiModal = document.getElementById('aiModal');
  const aiGenerateBtn = document.getElementById('aiGenerateBtn');
  const aiGenerateBtn2 = document.getElementById('aiGenerateBtn2');
  const aiModalClose = document.getElementById('aiModalClose');
  const aiModalCancel = document.getElementById('aiModalCancel');
  const aiModalApply = document.getElementById('aiModalApply');
  const aiResults = document.getElementById('aiResults');
  
  function openAiModal() { aiModal.classList.add('active'); }
  function closeAiModal() { aiModal.classList.remove('active'); }
  
  if (aiGenerateBtn) aiGenerateBtn.addEventListener('click', openAiModal);
  if (aiGenerateBtn2) aiGenerateBtn2.addEventListener('click', openAiModal);
  if (aiModalClose) aiModalClose.addEventListener('click', closeAiModal);
  if (aiModalCancel) aiModalCancel.addEventListener('click', closeAiModal);
  
  // Select AI result
  if (aiResults) {
    aiResults.addEventListener('click', (e) => {
      const card = e.target.closest('.ai-result-card');
      if (!card) return;
      aiResults.querySelectorAll('.ai-result-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  }
  
  if (aiModalApply) {
    aiModalApply.addEventListener('click', () => {
      const selected = aiResults.querySelector('.ai-result-card.selected');
      if (selected) {
        alert('✅ 소재가 성공적으로 적용되었습니다!');
        closeAiModal();
      } else {
        alert('소재를 선택해주세요.');
      }
    });
  }
  
  // Close modal on overlay click
  if (aiModal) {
    aiModal.addEventListener('click', (e) => {
      if (e.target === aiModal) closeAiModal();
    });
  }

  // ============ API KEY BUTTON ============
  const apiKeyBtn = document.getElementById('apiKeyBtn');
  if (apiKeyBtn) {
    apiKeyBtn.addEventListener('click', () => {
      const key = prompt('네이버 검색광고 API 키를 입력하세요:');
      if (key && key.trim()) {
        alert('✅ API 키가 등록되었습니다. (데모 모드에서는 실제 연동되지 않습니다)');
      }
    });
  }

  // ============ ESC KEY ============
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAiModal();
      closeFraudPanel();
    }
  });

});
