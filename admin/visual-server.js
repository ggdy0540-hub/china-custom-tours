/**
 * 本地可视化编辑后台 —— 后端服务
 * 提供：
 *   GET  /api/pages              列出可编辑页面
 *   GET  /api/page/:name         读取页面的 frontmatter 数据（title/description/sections）
 *   POST /api/page/:name         写回页面（保存编辑结果）
 *   POST /api/rebuild            触发 eleventy 重新构建 _site
 *   静态资源：/assets/* -> src/assets/*，其余 -> 项目根目录
 *
 * 运行：在项目根目录执行  node admin/visual-server.js
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { execFile } = require('child_process');

// ---- 发布到 GitHub（保存后自动同步，触发 Pages 部署）----
// token 优先级：环境变量 GITHUB_TOKEN > admin/.publish.json
const PUBLISH_CFG = (function () {
  if (process.env.GITHUB_TOKEN) {
    return { token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPO || 'ggdy0540-hub/china-custom-tours', branch: process.env.GITHUB_BRANCH || 'main' };
  }
  try {
    const f = path.join(__dirname, '.publish.json');
    if (fs.existsSync(f)) {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      return { token: j.token, repo: j.repo || 'ggdy0540-hub/china-custom-tours', branch: j.branch || 'main' };
    }
  } catch (e) {}
  return null;
})();

function publishToGitHub(filePath, content) {
  return new Promise(function (resolve) {
    if (!PUBLISH_CFG || !PUBLISH_CFG.token) {
      return resolve({ skipped: true, reason: '未配置 GitHub Token（设置 GITHUB_TOKEN 或在 admin/.publish.json 中配置）' });
    }
    const apiPath = 'repos/' + PUBLISH_CFG.repo + '/contents/' + filePath;
    const headers = {
      Authorization: 'Bearer ' + PUBLISH_CFG.token,
      'User-Agent': 'visual-editor',
      Accept: 'application/vnd.github+json'
    };
    // 1) 取当前 sha
    https
      .get('https://api.github.com/' + apiPath + '?ref=' + PUBLISH_CFG.branch, { headers: headers }, function (res) {
        let body = '';
        res.on('data', function (c) { body += c; });
        res.on('end', function () {
          let sha = null;
          try { sha = JSON.parse(body).sha; } catch (e) {}
          // 2) PUT 更新（base64）
          const putBody = JSON.stringify({
            message: 'Update ' + filePath + ' via visual editor',
            content: Buffer.from(content, 'utf8').toString('base64'),
            sha: sha,
            branch: PUBLISH_CFG.branch
          });
          const req = https.request(
            'https://api.github.com/' + apiPath,
            { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, headers) },
            function (res2) {
              let body2 = '';
              res2.on('data', function (c) { body2 += c; });
              res2.on('end', function () {
                if (res2.statusCode >= 200 && res2.statusCode < 300) resolve({ ok: true });
                else resolve({ ok: false, error: 'GitHub API ' + res2.statusCode + ': ' + body2.slice(0, 200) });
              });
            }
          );
          req.on('error', function (e) { resolve({ ok: false, error: String(e.message || e) }); });
          req.write(putBody);
          req.end();
        });
      })
      .on('error', function (e) { resolve({ ok: false, error: String(e.message || e) }); });
  });
}

// 二进制图片发布（与文本版不同：content 直接用原始字节的 base64）
function publishBinaryToGitHub(filePath, b64) {
  return new Promise(function (resolve) {
    if (!PUBLISH_CFG || !PUBLISH_CFG.token) {
      return resolve({ skipped: true, reason: '未配置 GitHub Token' });
    }
    const apiPath = 'repos/' + PUBLISH_CFG.repo + '/contents/' + filePath;
    const headers = {
      Authorization: 'Bearer ' + PUBLISH_CFG.token,
      'User-Agent': 'visual-editor',
      Accept: 'application/vnd.github+json'
    };
    https
      .get('https://api.github.com/' + apiPath + '?ref=' + PUBLISH_CFG.branch, { headers: headers }, function (res) {
        let body = '';
        res.on('data', function (c) { body += c; });
        res.on('end', function () {
          let sha = null;
          try { sha = JSON.parse(body).sha; } catch (e) {}
          const putBody = JSON.stringify({
            message: 'Add image ' + filePath + ' via visual editor',
            content: b64,
            sha: sha,
            branch: PUBLISH_CFG.branch
          });
          const req = https.request(
            'https://api.github.com/' + apiPath,
            { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, headers) },
            function (res2) {
              let body2 = '';
              res2.on('data', function (c) { body2 += c; });
              res2.on('end', function () {
                if (res2.statusCode >= 200 && res2.statusCode < 300) resolve({ ok: true });
                else resolve({ ok: false, error: 'GitHub API ' + res2.statusCode + ': ' + body2.slice(0, 200) });
              });
            }
          );
          req.on('error', function (e) { resolve({ ok: false, error: String(e.message || e) }); });
          req.write(putBody);
          req.end();
        });
      })
      .on('error', function (e) { resolve({ ok: false, error: String(e.message || e) }); });
  });
}

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const PORT = process.env.PORT || 3002;

// 可编辑页面：name -> { file, label, active }
const PAGES = {
  index: { file: 'index.njk', label: '首页 Home', active: 'index' },
  about: { file: 'about.njk', label: '关于我们 About', active: 'about' },
  tours: { file: 'tours.njk', label: '线路总览 Tours', active: 'tours' },
  'tour-cultural': { file: 'tour-cultural.njk', label: '文化线路 Cultural', active: 'tour-cultural' },
  'tour-culinary': { file: 'tour-culinary.njk', label: '美食线路 Culinary', active: 'tour-culinary' },
  'tour-family': { file: 'tour-family.njk', label: '亲子线路 Family', active: 'tour-family' },
  'tour-nature': { file: 'tour-nature.njk', label: '自然线路 Nature', active: 'tour-nature' },
  'dest-shanghai': { file: 'dest-shanghai.njk', label: '目的地 · 上海', active: 'dest' },
  'dest-beijing': { file: 'dest-beijing.njk', label: '目的地 · 北京', active: 'dest' },
  'dest-xian': { file: 'dest-xian.njk', label: '目的地 · 西安', active: 'dest' },
  'dest-chengdu': { file: 'dest-chengdu.njk', label: '目的地 · 成都', active: 'dest' },
  'dest-guilin': { file: 'dest-guilin.njk', label: '目的地 · 桂林', active: 'dest' },
  'dest-zhangjiajie': { file: 'dest-zhangjiajie.njk', label: '目的地 · 张家界', active: 'dest' },
  contact: { file: 'contact.njk', label: '联系我们 Contact', active: 'contact' },
  faq: { file: 'faq.njk', label: '常见问题 FAQ', active: 'faq' },
  privacy: { file: 'privacy.njk', label: '隐私政策 Privacy', active: 'privacy' },
  terms: { file: 'terms.njk', label: '服务条款 Terms', active: 'terms' }
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8'
};

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readSettings() {
  const p = path.join(SRC, '_data', 'site.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeSettings(obj) {
  const p = path.join(SRC, '_data', 'site.json');
  const out = JSON.stringify(obj, null, 2);
  const tmp = p + '.tmp-' + Date.now();
  try {
    fs.writeFileSync(tmp, out, 'utf8');
    try { fs.renameSync(tmp, p); }
    catch (renameErr) {
      try { fs.unlinkSync(tmp); } catch (_) {}
      fs.writeFileSync(p, out, 'utf8');
    }
  } catch (e) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
    throw new Error('保存站点设置失败：' + (e.message || e));
  }
  return out;
}

function readPage(name) {
  const meta = PAGES[name];
  if (!meta) return null;
  const p = path.join(SRC, meta.file);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  const parsed = matter(raw);
  const data = parsed.data || {};
  const sections = Array.isArray(data.sections)
    ? data.sections.map(function (s) {
        return { label: s && s.label != null ? String(s.label) : '', html: s && s.html != null ? String(s.html) : '' };
      })
    : [];
  return {
    name: name,
    label: meta.label,
    active: meta.active,
    title: data.title != null ? String(data.title) : '',
    description: data.description != null ? String(data.description) : '',
    sections: sections,
    _content: parsed.content || ''
  };
}

function writePage(name, payload) {
  const meta = PAGES[name];
  const p = path.join(SRC, meta.file);
  const raw = fs.readFileSync(p, 'utf8');
  const parsed = matter(raw);
  const data = parsed.data || {};

  // ---- 区块数量保护：防止保存时误删大量区块 ----
  // 场景：编辑器因加载异常只拿到部分区块就点保存，会把其余区块覆盖掉。
  // 规则：磁盘上区块数 >=3 时，提交保存的区块数不得低于一半；否则拦截并提示先刷新。
  if (Array.isArray(payload.sections)) {
    const diskCount = Array.isArray(data.sections) ? data.sections.length : 0;
    const incomingCount = payload.sections.length;
    const minKeep = diskCount >= 3 ? Math.ceil(diskCount / 2) : diskCount;
    if (diskCount >= 3 && incomingCount < minKeep) {
      const err = new Error(
        '保存被拦截：磁盘上现有 ' + diskCount + ' 个区块，但你提交的只有 ' + incomingCount +
        ' 个，疑似丢失了大部分区块（可能是编辑器未完整加载）。请按 Ctrl+F5 刷新页面，' +
        '确认左侧「内容区块」列表完整后再保存。如确需删除区块，请在右侧逐块删除。'
      );
      err.code = 'SECTION_LOSS';
      throw err;
    }
  }

  data.title = payload.title != null ? payload.title : data.title;
  data.description = payload.description != null ? payload.description : data.description;
  if (Array.isArray(payload.sections)) {
    data.sections = payload.sections.map(function (s) {
      return { label: s.label != null ? s.label : '', html: s.html != null ? s.html : '' };
    });
  }
  const out = matter.stringify(parsed.content || '', data);

  // Windows 下偶发 EPERM：先写临时文件再重命名，可降低被占用/索引锁定概率
  const tmp = p + '.tmp-' + Date.now();
  let writeErr = null;
  try {
    fs.writeFileSync(tmp, out, 'utf8');
    try { fs.renameSync(tmp, p); }
    catch (renameErr) {
      // 重命名失败时回退到直接覆盖
      try { fs.unlinkSync(tmp); } catch (_) {}
      fs.writeFileSync(p, out, 'utf8');
    }
  } catch (e) {
    writeErr = e;
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
  }
  if (writeErr) {
    throw new Error('保存文件失败：' + (writeErr.message || writeErr) + '。可能原因：文件被其他程序占用、杀毒软件扫描中，或 Node 进程权限不足。');
  }
  return out;
}

function safePath(base, urlPath) {
  const rel = urlPath.replace(/^\/+/, '');
  const target = path.resolve(base, rel);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}

function serveStatic(req, res, urlPath) {
  let base = ROOT;
  let rel = urlPath;
  if (urlPath.indexOf('/assets/') === 0) {
    base = SRC;
    rel = urlPath.slice(1);
  }
  let target = safePath(base, rel);
  if (!target) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (target.endsWith('/')) target = path.join(target, 'index.html');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404);
    return res.end('Not Found: ' + urlPath);
  }
  const ext = path.extname(target).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
}

const server = http.createServer(function (req, res) {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const urlPath = parsedUrl.pathname;
  const method = req.method;

  if (urlPath === '/api/pages' && method === 'GET') {
    const list = Object.keys(PAGES).map(function (name) {
      return { name: name, label: PAGES[name].label };
    });
    return sendJSON(res, 200, { pages: list });
  }

  const pageMatch = urlPath.match(/^\/api\/page\/([\w-]+)$/);
  if (pageMatch && method === 'GET') {
    const name = pageMatch[1];
    const page = readPage(name);
    if (!page) return sendJSON(res, 404, { error: 'page not found: ' + name });
    return sendJSON(res, 200, page);
  }
  if (pageMatch && method === 'POST') {
    let body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () {
      let payload;
      try { payload = JSON.parse(body); }
      catch (e) { return sendJSON(res, 400, { error: 'invalid json' }); }
      let out;
      try {
        out = writePage(pageMatch[1], payload);
      } catch (e) {
        if (e && e.code === 'SECTION_LOSS') {
          return sendJSON(res, 400, { error: String(e.message || e), code: 'SECTION_LOSS' });
        }
        return sendJSON(res, 500, { error: String(e && e.message || e) });
      }
      // 本地保存成功后，自动发布到 GitHub 触发部署
      const meta = PAGES[pageMatch[1]];
      publishToGitHub('src/' + meta.file, out).then(function (pub) {
        if (pub.skipped) {
          return sendJSON(res, 200, { ok: true, published: false, note: pub.reason });
        }
        if (pub.ok) {
          return sendJSON(res, 200, { ok: true, published: true });
        }
        // 发布失败不影响本地已保存
        return sendJSON(res, 200, { ok: true, published: false, warn: pub.error });
      });
    });
    return;
  }

  if (urlPath === '/api/settings' && method === 'GET') {
    try {
      return sendJSON(res, 200, readSettings());
    } catch (e) {
      return sendJSON(res, 500, { error: String(e.message || e) });
    }
  }
  if (urlPath === '/api/settings' && method === 'POST') {
    let body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () {
      let obj;
      try { obj = JSON.parse(body); }
      catch (e) { return sendJSON(res, 400, { error: 'invalid json' }); }
      let out;
      try { out = writeSettings(obj); }
      catch (e) { return sendJSON(res, 500, { error: String(e.message || e) }); }
      publishToGitHub('src/_data/site.json', out).then(function (pub) {
        if (pub.skipped) return sendJSON(res, 200, { ok: true, published: false, note: pub.reason });
        if (pub.ok) return sendJSON(res, 200, { ok: true, published: true });
        return sendJSON(res, 200, { ok: true, published: false, warn: pub.error });
      });
    });
    return;
  }

  if (urlPath === '/api/upload' && method === 'POST') {
    let body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () {
      let payload;
      try { payload = JSON.parse(body); }
      catch (e) { return sendJSON(res, 400, { error: 'invalid json' }); }

      const data = payload.data; // base64（不含 data: 前缀）
      let filename = String(payload.filename || '').replace(/[^A-Za-z0-9._\-]/g, '');
      if (!filename) return sendJSON(res, 400, { error: '无效的文件名' });
      if (!data) return sendJSON(res, 400, { error: '缺少图片数据' });

      let buf;
      try { buf = Buffer.from(data, 'base64'); }
      catch (e) { return sendJSON(res, 400, { error: 'base64 解码失败' }); }
      if (buf.length > 8 * 1024 * 1024) return sendJSON(res, 400, { error: '图片过大（上限 8MB）' });

      // 通过文件魔数推断真实格式，兼容无扩展名或扩展名不准的文件
      function detectImageExt(buffer) {
        if (buffer.slice(0, 4).toString('hex') === '89504e47') return '.png';
        if (buffer.slice(0, 3).toString('hex') === 'ffd8ff') return '.jpg';
        if (buffer.slice(0, 4).toString('ascii') === 'GIF8') return '.gif';
        if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return '.webp';
        if (buffer.slice(0, 4).toString('ascii') === 'AVIF' || buffer.slice(4, 8).toString('ascii') === 'ftyp') {
          const head = buffer.slice(0, 32).toString('ascii');
          if (head.indexOf('avif') >= 0) return '.avif';
        }
        const textHead = buffer.slice(0, 100).toString('ascii').trim();
        if (textHead.indexOf('<svg') >= 0 || textHead.indexOf('<?xml') >= 0) return '.svg';
        return '';
      }

      const allowed = ['.png', '.jpg', '.jpeg', '.jpe', '.jfif', '.webp', '.gif', '.svg', '.avif', '.bmp', '.tif', '.tiff'];
      let ext = path.extname(filename).toLowerCase();
      // 如果扩展名缺失或不被允许，用魔数修正
      if (!ext || allowed.indexOf(ext) < 0) {
        const detected = detectImageExt(buf);
        if (!detected) return sendJSON(res, 400, { error: '无法识别图片格式：请上传 png/jpg/webp/gif/svg/avif 格式的图片' });
        const stem = filename.slice(0, filename.length - ext.length) || 'upload-' + Date.now().toString(36);
        filename = stem + detected;
        ext = detected;
      }
      if (allowed.indexOf(ext) < 0) return sendJSON(res, 400, { error: '不支持的图片格式：' + ext + '（仅限 png/jpg/webp/gif/svg/avif）' });

      const dir = path.join(SRC, 'assets', 'img');
      if (!fs.existsSync(dir)) { try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {} }
      let target = path.join(dir, filename);
      // 防目录穿越
      if (!target.startsWith(dir + path.sep)) return sendJSON(res, 403, { error: 'forbidden' });
      // 文件名冲突时追加时间戳，避免误覆盖已有素材
      if (fs.existsSync(target)) {
        const stem = filename.slice(0, filename.length - ext.length);
        filename = stem + '-' + Date.now().toString(36) + ext;
        target = path.join(dir, filename);
      }
      try { fs.writeFileSync(target, buf); }
      catch (e) { return sendJSON(res, 500, { error: '写入图片失败：' + (e.message || e) }); }

      const ghPath = 'src/assets/img/' + filename;
      const b64 = buf.toString('base64');
      publishBinaryToGitHub(ghPath, b64).then(function (pub) {
        if (pub.skipped) return sendJSON(res, 200, { ok: true, url: '/assets/img/' + filename, published: false, note: pub.reason });
        if (pub.ok) return sendJSON(res, 200, { ok: true, url: '/assets/img/' + filename, published: true });
        // 发布失败不影响本地已保存
        return sendJSON(res, 200, { ok: true, url: '/assets/img/' + filename, published: false, warn: pub.error });
      });
    });
    return;
  }

  if (urlPath === '/api/rebuild' && method === 'POST') {
    execFile('npx', ['eleventy'], { cwd: ROOT, windowsHide: true }, function (err, stdout, stderr) {
      if (err) return sendJSON(res, 500, { ok: false, error: String(err.message), stderr: stderr.toString() });
      return sendJSON(res, 200, { ok: true, output: stdout.toString() });
    });
    return;
  }

  if (urlPath.indexOf('/api/') === 0) {
    return sendJSON(res, 404, { error: 'unknown api' });
  }

  return serveStatic(req, res, urlPath);
});

server.listen(PORT, function () {
  console.log('可视化编辑后台已启动：http://localhost:' + PORT + '/admin/visual-editor.html');
});
