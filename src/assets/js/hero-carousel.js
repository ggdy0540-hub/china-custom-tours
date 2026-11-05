/* 首页 Hero 自动左右轮播
   - 帧配置来自 src/_data/heroSlides.json，构建时注入页面 #hero-slides
   - 在可视化编辑器「首屏轮播」里可增删帧、换图、改顺序/时长/标注
   - 静态图帧：保留原有标题 / 正文 / CTA
   - 视频帧：文字层自动淡出，画面完整呈现
   - 每个视频帧拥有独立的 video 元素与循环起止点，数量不限 */
(function () {
  var hero = document.querySelector('.hero');
  if (!hero) return;
  if (window.self !== window.top) return;          /* 可视化编辑器 iframe 预览保持原静态首屏 */
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var mobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  var watchMode = false;   /* 访客正在完整观看影片 */
  var paused = false;      /* 自动轮播暂停 */
  var idx = 0, timer = null, filmVideo = null;

  /* 配置缺失时的兜底（保证页面永远有首屏） */
  var DEFAULT = [
    { type: 'image', src: 'assets/img/hero-greatwall.jpg', caption: 'The Great Wall · Sunrise', dur: 7 },
    { type: 'video', video: 'assets/video/hero-brand-1080.mp4', videoMobile: 'assets/video/hero-brand-720.mp4', poster: 'assets/video/hero-poster.jpg', caption: 'Jing · Meet China · Brand Film', dur: 22, loopStart: 4.2, loopEnd: 69 },
    { type: 'image', src: 'assets/img/dest-chongqing.jpg', caption: 'Chongqing · Hongyadong', dur: 7 }
  ];

  function norm(f) {
    f = f || {};
    var o = {
      type: f.type === 'video' ? 'video' : 'image',
      src: String(f.src || ''),
      video: String(f.video || ''),
      videoMobile: String(f.videoMobile || ''),
      poster: String(f.poster || ''),
      caption: String(f.caption || ''),
      dur: Math.max(2, Math.min(180, Number(f.dur) || 7)) * 1000,
      loopStart: Math.max(0, Number(f.loopStart) || 0),
      loopEnd: Math.max(0, Number(f.loopEnd) || 0),
      _v: null
    };
    if (o.type === 'video' && !o.video && !o.videoMobile) {
      o.video = 'assets/video/hero-brand-1080.mp4';
      o.videoMobile = 'assets/video/hero-brand-720.mp4';
    }
    if (o.type === 'video' && !o.poster) o.poster = o.src || 'assets/video/hero-poster.jpg';
    return o;
  }

  var FRAMES = DEFAULT.map(norm);
  try {
    var cfgNode = document.getElementById('hero-slides');
    if (cfgNode) {
      var raw = JSON.parse(cfgNode.textContent || '');
      if (Array.isArray(raw) && raw.length) {
        var parsed = raw.map(norm).filter(function (f) {
          return f.type === 'image' ? !!f.src : (!!f.video || !!f.videoMobile);
        });
        if (parsed.length) FRAMES = parsed;
      }
    }
  } catch (e) {
    console.warn('Hero slides config invalid, using defaults:', e);
  }

  function curFrame() { return FRAMES[idx]; }
  function curVideo() { var f = curFrame(); return f ? f._v : null; }
  function anyVideo() {
    for (var i = 0; i < FRAMES.length; i++) if (FRAMES[i].type === 'video' && FRAMES[i]._v) return true;
    return false;
  }

  /* ---------- 媒体轨道 ---------- */
  hero.style.backgroundImage = 'none';
  hero.classList.add('hero-carousel');

  var media = document.createElement('div'); media.className = 'hero-media';
  var track = document.createElement('div'); track.className = 'hero-track';

  function playVideo(v) {
    if (!v) return;
    if (!watchMode && curVideo() !== v) return;   /* 不是当前帧，不抢播 */
    var p = v.play(); if (p && p.catch) p.catch(function () {});
  }
  function tryPlay() { playVideo(curVideo()); }

  function syncSound() {
    var v = curVideo(); if (!v || !soundBtn) return;
    setBtn(soundBtn, v.muted ? ICON.mute : ICON.sound, v.muted ? 'Sound on' : 'Mute', v.muted ? 'Turn on the original soundtrack' : 'Mute the video');
  }
  function syncPlay() {
    var v = curVideo(); if (!v || !pauseBtn) return;
    setBtn(pauseBtn, v.paused ? ICON.play : ICON.pause, v.paused ? 'Play' : 'Pause', v.paused ? 'Play background video' : 'Pause background video');
  }
  function refreshBar() { if (bar) bar.style.display = anyVideo() ? '' : 'none'; }

  function degrade(f, v, frame) {
    f.type = 'image';
    f.src = f.poster || f.src;
    f._v = null;
    frame.className = 'hero-frame is-image';
    frame.style.backgroundImage = "url('" + f.src + "')";
    if (v && v.parentNode) v.parentNode.removeChild(v);
    refreshBar();
    go(idx);
  }

  function bindVideo(f, v, frame) {
    v.addEventListener('loadeddata', function () { playVideo(v); });
    v.addEventListener('canplay', function () { playVideo(v); });
    v.addEventListener('loadedmetadata', function () {
      if (!watchMode && f.loopStart > 0 && v.currentTime < f.loopStart) {
        try { v.currentTime = f.loopStart; } catch (e) {}
      }
    });
    v.addEventListener('timeupdate', function () {
      if (watchMode && filmVideo === v) return;
      if (curFrame() !== f) return;
      if (f.loopEnd > 0 && v.currentTime >= f.loopEnd) {
        try { v.currentTime = f.loopStart; } catch (e) {}
      } else if (f.loopStart > 0 && v.currentTime < f.loopStart - 0.3) {
        try { v.currentTime = f.loopStart; } catch (e) {}
      }
    });
    v.addEventListener('play', function () { if (curFrame() === f) syncPlay(); });
    v.addEventListener('pause', function () { if (curFrame() === f) syncPlay(); });
    v.addEventListener('error', function () { degrade(f, v, frame); });
  }

  FRAMES.forEach(function (f) {
    var frame = document.createElement('div');
    frame.className = 'hero-frame ' + (f.type === 'video' ? 'is-video' : 'is-image');
    if (f.type === 'image') {
      frame.style.backgroundImage = "url('" + f.src + "')";
      var pre = new Image(); pre.src = f.src;   /* 预加载，切换不白闪 */
    } else {
      var v = document.createElement('video');
      v.className = 'hero-video';
      v.src = (mobile && f.videoMobile) ? f.videoMobile : (f.video || f.videoMobile);
      if (f.poster) v.poster = f.poster;
      v.muted = true; v.loop = true; v.playsInline = true;
      v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.setAttribute('aria-hidden', 'true');
      f._v = v;
      frame.appendChild(v);
      bindVideo(f, v, frame);
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
  refreshBar();

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

  var soundBtn = makeBtn('hc-sound', ICON.mute, 'Sound on', 'Turn on the original soundtrack', function () {
    var v = curVideo(); if (!v) return;
    v.muted = !v.muted;
    filmVideo = v;
    if (!v.muted) {
      watchMode = true; pauseAuto();
      try { v.currentTime = 0; } catch (e) {}
      playVideo(v);
    } else {
      watchMode = false; filmVideo = null;
      try { v.currentTime = curFrame().loopStart; } catch (e) {}
      playVideo(v); resumeAuto();
    }
    syncSound(); syncPlay();
  });

  var pauseBtn = makeBtn('hc-pause', ICON.pause, 'Pause', 'Pause background video', function () {
    var v = curVideo(); if (!v) return;
    if (v.paused) { playVideo(v); resumeAuto(); }
    else { v.pause(); pauseAuto(); }
    syncPlay();
  });

  makeBtn('hc-film', ICON.expand, 'Watch full film', 'Watch the full film with sound', function () {
    var v = curVideo(); if (!v) return;
    watchMode = true; filmVideo = v; pauseAuto();
    v.controls = true; v.muted = false;
    try { v.currentTime = 0; } catch (e) {}
    playVideo(v); syncSound();
    if (v.requestFullscreen) {
      var p = v.requestFullscreen(); if (p && p.catch) p.catch(function () {});
    } else if (v.webkitEnterFullscreen) {
      v.webkitEnterFullscreen();
    }
  });

  function leaveFilm() {
    if (!watchMode) return;
    var v = filmVideo || curVideo();
    watchMode = false; filmVideo = null;
    if (v) {
      v.controls = false; v.muted = true;
      var f = curFrame();
      try { v.currentTime = f ? f.loopStart : 0; } catch (e) {}
      playVideo(v);
    }
    syncSound(); syncPlay(); resumeAuto();
  }
  document.addEventListener('fullscreenchange', function () {
    if (document.fullscreenElement !== filmVideo) leaveFilm();
  });
  FRAMES.forEach(function (f) {
    if (f._v) f._v.addEventListener('webkitendfullscreen', leaveFilm);
  });

  /* ---------- 轮播调度 ---------- */
  function schedule() {
    clearTimeout(timer);
    var dur = curFrame().dur;
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
    var f = curFrame();
    var isVid = f.type === 'video' && !!f._v;
    hero.classList.toggle('is-video-frame', isVid);
    cap.textContent = f.caption || '';
    dots.forEach(function (d, i) { d.classList.toggle('is-on', i === idx); });
    FRAMES.forEach(function (x) { if (x._v && x._v !== f._v) x._v.pause(); });
    if (f._v) playVideo(f._v);
    if (!isVid && watchMode) leaveFilm();
    refreshBar();
    syncSound(); syncPlay();
    schedule();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearTimeout(timer); progBar.style.animationPlayState = 'paused'; }
    else if (!paused && !watchMode) schedule();
  });

  go(0);
})();
