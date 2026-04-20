/**
 * threeway-pension 배경음악 플레이어
 *  - YouTube IFrame API (Healing & Co. | 힐링앤코 - Playlist Vol.7)
 *  - 음소거 자동재생(브라우저 정책) + 우측 하단 플로팅 버튼으로 on/off
 *  - localStorage에 음소거 상태 + 재생 위치 저장 → 페이지 이동 시 자연스러운 연결
 *  - admin.html에선 작동 안 함
 */
(function () {
  'use strict';

  const VIDEO_ID = 'Pz47kIGTCKA';
  const VOLUME = 30;
  const STORAGE_KEY = 'tw-bgm-v1';

  let player = null;
  let saveTimer = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { muted: true, time: 0 };
      const p = JSON.parse(raw);
      return {
        muted: p.muted !== false,
        time: typeof p.time === 'number' && p.time > 0 ? p.time : 0,
      };
    } catch {
      return { muted: true, time: 0 };
    }
  }

  function saveState(partial) {
    const cur = loadState();
    const next = Object.assign({}, cur, partial);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }

  function injectStyles() {
    const css = `
      .tw-bgm-btn {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: rgba(44, 62, 45, 0.92);
        color: #fff;
        border: none;
        cursor: pointer;
        font-size: 22px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, background 0.2s;
      }
      .tw-bgm-btn:hover { transform: scale(1.08); background: rgba(44, 62, 45, 1); }
      .tw-bgm-btn .label {
        position: absolute;
        right: 60px;
        background: rgba(44, 62, 45, 0.92);
        color: #fff;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 12px;
        white-space: nowrap;
        opacity: 0;
        transition: opacity 0.2s;
        pointer-events: none;
      }
      .tw-bgm-btn:hover .label { opacity: 1; }
      .tw-bgm-iframe {
        position: absolute;
        top: -9999px;
        left: -9999px;
        width: 1px;
        height: 1px;
        pointer-events: none;
      }
      @media (max-width: 640px) {
        .tw-bgm-btn { bottom: 16px; right: 16px; width: 46px; height: 46px; font-size: 18px; }
        .tw-bgm-btn .label { display: none; }
      }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function injectButton() {
    const btn = document.createElement('button');
    btn.className = 'tw-bgm-btn';
    btn.id = 'tw-bgm-btn';
    btn.setAttribute('aria-label', '배경음악 켜기/끄기');
    btn.innerHTML = '🔇<span class="label">음악 켜기</span>';
    btn.addEventListener('click', toggleMute);
    document.body.appendChild(btn);
  }

  function updateButton(muted) {
    const btn = document.getElementById('tw-bgm-btn');
    if (!btn) return;
    btn.innerHTML = muted
      ? '🔇<span class="label">음악 켜기</span>'
      : '🎵<span class="label">음악 끄기</span>';
  }

  function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) {
      createPlayer();
      return;
    }
    window.onYouTubeIframeAPIReady = createPlayer;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }

  function createPlayer() {
    const container = document.createElement('div');
    container.className = 'tw-bgm-iframe';
    container.id = 'tw-bgm-player';
    document.body.appendChild(container);

    const state = loadState();

    player = new YT.Player('tw-bgm-player', {
      videoId: VIDEO_ID,
      playerVars: {
        autoplay: 1,
        controls: 0,
        loop: 1,
        playlist: VIDEO_ID, // loop는 playlist 파라미터 필요
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        mute: 1, // 자동재생 정책상 muted 시작 필수
        start: Math.floor(state.time),
      },
      events: {
        onReady: function (e) {
          try {
            e.target.setVolume(VOLUME);
            e.target.playVideo();
            if (!state.muted) {
              // 사용자가 이미 한 번 켰다면 unmute 시도 (이전 세션 interaction 이력 필요)
              e.target.unMute();
            }
            updateButton(state.muted);
            startPositionSaver();
          } catch (err) {
            console.warn('[tw-bgm] onReady err', err);
          }
        },
        onStateChange: function (e) {
          // loop 파라미터가 안 먹히는 경우 수동 복구
          if (e.data === YT.PlayerState.ENDED && player) {
            try { player.seekTo(0); player.playVideo(); } catch {}
          }
        },
        onError: function (e) {
          console.warn('[tw-bgm] YT error', e.data);
        },
      },
    });
  }

  function toggleMute() {
    if (!player || typeof player.isMuted !== 'function') {
      saveState({ muted: false });
      return;
    }
    try {
      if (player.isMuted()) {
        player.unMute();
        player.setVolume(VOLUME);
        saveState({ muted: false });
        updateButton(false);
      } else {
        player.mute();
        saveState({ muted: true });
        updateButton(true);
      }
    } catch (err) {
      console.warn('[tw-bgm] toggle err', err);
    }
  }

  function startPositionSaver() {
    if (saveTimer) clearInterval(saveTimer);
    saveTimer = setInterval(function () {
      if (!player || typeof player.getCurrentTime !== 'function') return;
      try {
        const t = player.getCurrentTime();
        if (typeof t === 'number' && isFinite(t) && t > 0) saveState({ time: t });
      } catch {}
    }, 3000);
  }

  function init() {
    // admin 페이지에선 작동 안 함 (혹시 잘못 로드되더라도 가드)
    if (/\/admin\.html(\?|$)/.test(location.pathname + location.search)) return;
    injectStyles();
    injectButton();
    loadYouTubeAPI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
