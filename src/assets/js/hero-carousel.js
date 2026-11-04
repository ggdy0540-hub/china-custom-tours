/* 首页 Hero 自动左右轮播
   - 静态图帧：保留原有标题 / 正文 / CTA（可在可视化编辑器里改）
   - 视频帧：文字层自动淡出，画面完整呈现，不再被文字板块遮挡
   - 想增删静态图，只改下面 FRAMES 数组即可（type: 'image' / 'video'，dur 单位毫秒） */
(function () {
  var hero = document.querySelector('.hero');
  if (!hero) return;
  if (window.self !== window.top) return;          /* 可视化编辑器 iframe 预览保持原静态首屏 */
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var mobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  var LOOP_START = 4.2;    /* 跳过 0–4s 纯黑字幕片头 */
  var LOOP_END = 69.0;     /* 结尾淡黑前跳回 */
  var watchMode = false;   /* 访客正在完整观看品牌片 */
  var paused = false;      /* 自动轮播暂停（开原声 / 暂停 / 看全片 / 页面隐藏） */
  var idx = 0, timer = null;

  var FRAMES = [
    { type: 'image', src: 'assets/img/hero-greatwall.jpg',  caption: 'The Great Wall · Sunrise',       dur: 7000 },
    { type: 'video',                                        caption: 'Jing · Meet China · Brand Film', dur: 22000 },
    { type: 'image', src: 'assets/img/dest-chongqing.jpg',  caption: 'Chongqing · Hongyadong',        dur: 7000 }
  ];

  /* ---------- 媒体轨道 ---------- */
  hero.style.backgroundImage = 'none';
  hero.classList.add('hero-carousel');

  var media = document.createElement('div'); media.className = 'hero-media';
  var track = document.createElement('div'); track.className = 'hero-track';
  var video = null;

  FRAMES.forEach(function (f) {
    var frame = document.createElement('div');
    frame.className = 'hero-frame ' + (f.type === 'video' ? 'is-video' : 'is-image');
    if (f.type === 'image') {
      frame.style.backgroundImage = "url('" + f.src + "')";
      var pre = new Image(); pre.src = f.src;   /* 预加载，切换不白闪 */
    } else {
      video = document.createElement('video');
      video.className = 'hero-video';
      video.src = 'assets/video/hero-brand-' + (mobile ? '720' : '1080') + '.mp4';
      video.poster = 'assets/video/hero-poster.jpg';
      video.muted = true; video.loop = true; video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
      video.setAttribute('aria-hidden', 'true');
      frame.appendChild(video);
    }
    track.appendChild(frame);
  });
  media.appendChild(track);
  hero.insertBefore(media, hero.firstChild);

  /* ---------- 轮播导航 ---------- */
  var nav = document.createElement('div'); nav.className = 'hero-nav';
  var cap = document.createElement('span'); cap.className = 'hero-caption';
  var prev = document.createElement('button');
  prev.type = 'button'; prev.className = 'hero-arrow';
  prev.setAttribute('aria-label', 'Previous slide'); prev.innerHTML = '&#8249;';
  var dotsWrap = document.createElement('div'); dotsWrap.className = 'hero-dots';
  var dots = FRAMES.map(function (f, i) {
    var d = document.createElement('button');
    d.type = 'button'; d.className = 'hero-dot';
    d.setAttribute('aria-label', 'Go to slide ' + (i + 1));
    d.addEventListener('click', function () { go(i, true); });
    dotsWrap.appendChild(d);
    return d;
  });
  var next = document.createElement('button');
  next.type = 'button'; next.className = 'hero-arrow';
  next.setAttribute('aria-label', 'Next slide'); next.innerHTML = '&#8250;';
  prev.addEventListener('click', function () { go(idx - 1, true); });
  next.addEventListener('click', function () { go(idx + 1, true); });
  nav.appendChild(cap); nav.appendChild(prev); nav.appendChild(dotsWrap); nav.appendChild(next);
  hero.appendChild(nav);

  var progress = document.createElement('div'); progress.className = 'hero-progress';
  var progBar = document.createElement('span'); progress.appendChild(progBar);
  hero.appendChild(progress);

  /* ---------- 视频控件（只在视频帧出现） ---------- */
  var ICON = {
    mute: '<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.58 15.06 21 13.61 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>',
    sound: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1-3.29-2.5-4.03v8.05c1.5-.74 2.5-2.26 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    expand: '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>'
  };

  var bar = document.createElement('div'); bar.className = 'hero-controls';
  hero.appendChild(bar);

  if (mobile && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      var hidden = !entries[0].isIntersecting;
      bar.classList.toggle('is-hidden', hidden);
      nav.classList.toggle('is-hidden', hidden);
    }, { threshold: 0 });
    io.observe(hero);
  }

  function makeBtn(cls, icon, label, title, handler) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'hero-ctrl ' + cls;
    b.title = title; b.setAttribute('aria-label', title);
    b.innerHTML = '<span class="hc-ico">' + icon + '</span><span class="hc-txt">' + label + '</span>';
    b.addEventListener('click', handler);
    bar.appendChild(b);
    return b;
  }
  function setBtn(b, icon, label, title) {
    b.innerHTML = '<span class="hc-ico">' + icon + '</span><span class="hc-txt">' + label + '</span>';
    b.title = title; b.setAttribute('aria-label', title);
  }
  function tryPlay() {
    if (!video) return;
    if (!watchMode && !hero.classList.contains('is-video-frame')) return;
    var p = video.play(); if (p && p.catch) p.catch(function () {});
  }
  function syncSound() {
    if (video && soundBtn) setBtn(soundBtn, video.muted ? ICON.mute : ICON.sound, video.muted ? 'Sound on' : 'Mute', video.muted ? 'Turn on the original soundtrack' : 'Mute the video');
  }
  function syncPlay() {
    if (video && pauseBtn) setBtn(pauseBtn, video.paused ? ICON.play : ICON.pause, video.paused ? 'Play' : 'Pause', video.paused ? 'Play background video' : 'Pause background video');
  }

  var soundBtn = makeBtn('hc-sound', ICON.mute, 'Sound on', 'Turn on the original soundtrack', function () {
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted) {
      watchMode = true; pauseAuto();
      try { video.currentTime = 0; } catch (e) {}
      tryPlay();
    } else {
      watchMode = false;
      try { video.currentTime = LOOP_START; } catch (e) {}
      tryPlay(); resumeAuto();
    }
    syncSound(); syncPlay();
  });

  var pauseBtn = makeBtn('hc-pause', ICON.pause, 'Pause', 'Pause background video', function () {
    if (!video) return;
    if (video.paused) { tryPlay(); resumeAuto(); }
    else { video.pause(); pauseAuto(); }
    syncPlay();
  });
  if (video) {
    video.addEventListener('play', syncPlay);
    video.addEventListener('pause', syncPlay);
  }

  makeBtn('hc-film', ICON.expand, 'Watch full film', 'Watch the full brand film with sound', function () {
    if (!video) return;
    watchMode = true; pauseAuto();
    video.controls = true; video.muted = false;
    try { video.currentTime = 0; } catch (e) {}
    tryPlay(); syncSound();
    if (video.requestFullscreen) {
      var p = video.requestFullscreen(); if (p && p.catch) p.catch(function () {});
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  });

  function leaveFilm() {
    if (!watchMode) return;
    watchMode = false;
    if (video) {
      video.controls = false; video.muted = true;
      try { video.currentTime = LOOP_START; } catch (e) {}
      tryPlay();
    }
    syncSound(); syncPlay(); resumeAuto();
  }
  document.addEventListener('fullscreenchange', function () {
    if (document.fullscreenElement !== video) leaveFilm();
  });
  if (video) video.addEventListener('webkitendfullscreen', leaveFilm);

  /* ---------- 视频起播校正 / 失败降级 ---------- */
  if (video) {
    video.addEventListener('loadeddata', tryPlay);
    video.addEventListener('canplay', tryPlay);
    video.addEventListener('loadedmetadata', function () {
      if (!watchMode && video.currentTime < LOOP_START) { try { video.currentTime = LOOP_START; } catch (e) {} }
    });
    video.addEventListener('timeupdate', function () {
      if (watchMode) return;
      if (video.currentTime < LOOP_START - 0.3 || video.currentTime >= LOOP_END) {
        try { video.currentTime = LOOP_START; } catch (e) {}
      }
    });
    video.addEventListener('error', function () {
      var frame = video.parentNode;
      if (frame) {
        frame.className = 'hero-frame is-image';
        frame.style.backgroundImage = "url('assets/video/hero-poster.jpg')";
        frame.removeChild(video);
      }
      video = null;
      FRAMES.forEach(function (f) { if (f.type === 'video') { f.type = 'image'; f.caption = 'Jing · Meet China'; } });
      if (bar.parentNode) bar.parentNode.removeChild(bar);
      go(idx);
    });
  }

  /* ---------- 轮播调度 ---------- */
  function schedule() {
    clearTimeout(timer);
    var dur = FRAMES[idx].dur;
    progBar.style.animation = 'none';
    void progBar.offsetWidth;                       /* 强制重排，重启动画 */
    progBar.style.animation = 'hero-progress-fill ' + dur + 'ms linear forwards';
    if (paused || watchMode) { progBar.style.animationPlayState = 'paused'; return; }
    timer = setTimeout(function () { go(idx + 1); }, dur);
  }
  function pauseAuto() {
    paused = true; clearTimeout(timer);
    progBar.style.animationPlayState = 'paused';
  }
  function resumeAuto() { paused = false; schedule(); }

  function go(n) {
    idx = (n + FRAMES.length) % FRAMES.length;
    track.style.transform = 'translateX(-' + (idx * 100) + '%)';
    var isVid = FRAMES[idx].type === 'video' && !!video;
    hero.classList.toggle('is-video-frame', isVid);
    cap.textContent = FRAMES[idx].caption || '';
    dots.forEach(function (d, i) { d.classList.toggle('is-on', i === idx); });
    if (video) { if (isVid) tryPlay(); else video.pause(); }
    if (!isVid && watchMode) leaveFilm();
    schedule();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearTimeout(timer); progBar.style.animationPlayState = 'paused'; }
    else if (!paused && !watchMode) schedule();
  });

  go(0);
})();
