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
    // 기본값: muted=false (음악 on). 사용자가 명시적으로 mute 누르기 전까진 재생 의도.
    // 브라우저 autoplay 정책상 처음엔 muted로 시작해야 playVideo 성공 → 첫 user interaction에 자동 unmute.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { muted: false, time: 0 };
      const p = JSON.parse(raw);
      return {
        muted: p.muted === true,
        time: typeof p.time === 'number' && p.time > 0 ? p.time : 0,
      };
    } catch {
      return { muted: false, time: 0 };
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
        left: 20px;
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
        left: 60px;
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
        .tw-bgm-btn { bottom: 16px; left: 16px; width: 46px; height: 46px; font-size: 18px; }
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
        mute: 1, // 자동재생 정책상 muted 시작 필수 — 재생 의도는 state.muted가 담당
        start: Math.floor(state.time),
      },
      events: {
        onReady: function (e) {
          try {
            e.target.setVolume(VOLUME);
            e.target.playVideo();
            if (!state.muted) {
              // 재생 의도가 on — unmute 즉시 시도. autoplay policy로 실패 시 첫 user interaction으로 복구
              try { e.target.unMute(); } catch {}
              armAutoUnmute();
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

  // 첫 user interaction 한 번만 감지해서 unmute (autoplay 정책 우회)
  //  passive 리스너 + once:true로 성능/메모리 안전. 작동 후 자동 제거.
  function armAutoUnmute() {
    const kick = function () {
      try {
        if (player && typeof player.unMute === 'function') {
          player.unMute();
          player.setVolume(VOLUME);
          player.playVideo();
        }
      } catch {}
    };
    const opts = { once: true, passive: true, capture: true };
    ['pointerdown', 'touchstart', 'keydown', 'scroll'].forEach(function (evt) {
      window.addEventListener(evt, kick, opts);
    });
  }

  // 의도(state.muted) 기반 토글 — 브라우저가 iframe을 mute 강제해도 UI 일관성 유지
  function toggleMute() {
    const cur = loadState();
    const nextMuted = !cur.muted;
    try {
      if (player && typeof player.mute === 'function') {
        if (nextMuted) {
          player.mute();
        } else {
          player.unMute();
          player.setVolume(VOLUME);
          player.playVideo();
        }
      }
    } catch (err) {
      console.warn('[tw-bgm] toggle err', err);
    }
    saveState({ muted: nextMuted });
    updateButton(nextMuted);
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
