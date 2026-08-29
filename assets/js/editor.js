/* ==========================================================================
   China Custom Tours — Admin-Protected Inline Content Editor
   Only authenticated admins can edit. Visitors see no edit UI at all.
   Login state persists in sessionStorage (cleared when browser closes).
   Password verified via SHA-256 hash comparison (no plaintext stored).
   ========================================================================== */
(function () {
  "use strict";

  var STORE_KEY = "cct-edits-v1";
  var ADMIN_HASH = "6051fc84a7a0d74c225fb18a496b09952da5642e60723ecae543298edd7d82d6";
  /* Default password: "admin2026" — change via admin panel after first login */

  /* Elements that can hold editable text (leaf, text-only) */
  var TEXT_SELECTOR = [
    "h1", "h2", "h3", "h4", "p", "li", "a", "span", "blockquote", "button",
    "strong", "em", "i", "b",
    ".stat-num", ".stat-label", ".step-num", ".stars", ".tour-zh"
  ].join(",");

  /* Avatar-style divs that can be swapped to a real photo */
  var AVATAR_SELECTOR = ".team-avatar, .avatar";

  /* Sections whose background photo can be swapped */
  var BG_SELECTOR = ".hero, .page-hero";

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, SVG: 1, NOSCRIPT: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1, INPUT: 1, BR: 1 };

  /* ==================== SHA-256 helper ==================== */
  function sha256(str) {
    var encoder = new TextEncoder();
    var data = encoder.encode(str);
    return crypto.subtle.digest("SHA-256", data).then(function (buf) {
      var arr = Array.from(new Uint8Array(buf));
      return arr.map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    });
  }

  /* ==================== Admin auth ==================== */
  var isAdmin = false;

  function checkAdmin() {
    if (sessionStorage.getItem("cct-admin") === "1") {
      isAdmin = true;
    }
    /* Check if user stored a custom password hash */
    var customHash = localStorage.getItem("cct-admin-hash");
    if (customHash) ADMIN_HASH = customHash;
  }

  function showLoginModal() {
    var overlay = document.createElement("div");
    overlay.className = "editor-ui admin-overlay";
    overlay.innerHTML =
        '<div class="admin-modal-header">' +
          '<span class="admin-seal">中</span>' +
          '<h3>Admin Access</h3>' +
          '<p>Enter your password to manage website content.</p>' +
        '</div>' +
        '<form class="admin-form">' +
          '<div class="form-field">' +
            '<input type="password" id="admin-pw" placeholder="Admin password" autocomplete="current-password" />' +
            '<span class="admin-error" id="admin-err"></span>' +
          '</div>' +
          '<button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px;">Sign In</button>' +
        '</form>' +
        '<button type="button" class="admin-close" aria-label="Close">&times;</button>' +
      '</div>';

    document.body.appendChild(overlay);

    var form = overlay.querySelector(".admin-form");
    var pwInput = overlay.querySelector("#admin-pw");
    var errEl = overlay.querySelector("#admin-err");
    var closeBtn = overlay.querySelector(".admin-close");

    pwInput.focus();

    closeBtn.addEventListener("click", function () { overlay.remove(); });

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.remove();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var pw = pwInput.value;
      if (!pw) return;
      sha256(pw).then(function (hash) {
        if (hash === ADMIN_HASH) {
          isAdmin = true;
          sessionStorage.setItem("cct-admin", "1");
          overlay.remove();
          showAdminUI();
          toast("Welcome back, admin");
        } else {
          errEl.textContent = "Incorrect password. Please try again.";
          pwInput.value = "";
          pwInput.focus();
        }
      });
    });
  }

  function showAdminUI() {
    if (!isAdmin) return;
    if (!toolbar) buildUI();
    toolbar.style.display = "";
    editBtn.style.display = editing ? "none" : "";
  }

  /* ==================== storage ==================== */
  function loadStore() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      return s && typeof s === "object" ? s : {};
    } catch (e) { return {}; }
  }
  function saveStore(store) { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
  function pageName() {
    var p = location.pathname.split("/").pop();
    return p || "index.html";
  }

  /* ==================== stable keys (DOM path) ==================== */
  function elKey(el, scope) {
    /* Explicit named key lets multiple elements share one stored value (e.g. logo in header & footer) */
    if (el.dataset && el.dataset.cctKey) return scope + "|" + el.dataset.cctKey;
    var path = [];
    var node = el;
    while (node && node !== document.body) {
      var idx = Array.prototype.indexOf.call(node.parentNode.children, node);
      path.unshift(node.tagName + ":" + idx);
      node = node.parentNode;
    }
    return scope + "|" + path.join(">");
  }
  function findByKey(key) {
    var parts = key.split("|");
    var scope = parts[0];
    var rest = parts[1] || "";
    /* Named key: look up by data-cct-key attribute */
    if (rest && rest.indexOf(">") === -1) {
      return document.querySelector('[data-cct-key="' + rest.replace(/"/g, '\\"') + '"]');
    }
    /* Path-based key */
    var segs = rest.split(">");
    var node = document.body;
    for (var i = 0; i < segs.length; i++) {
      var idx = parseInt(segs[i].split(":")[1], 10);
      node = node.children[idx];
      if (!node) return null;
    }
    return node;
  }

  /* ==================== normalization ==================== */
  function normalizeAll() {
    var els = document.body.querySelectorAll("*");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (SKIP_TAGS[el.tagName] || el.closest("svg") || el.closest(".editor-ui")) continue;
      var hasElChild = false, hasText = false;
      for (var c = 0; c < el.childNodes.length; c++) {
        var n = el.childNodes[c];
        if (n.nodeType === 1) hasElChild = true;
        else if (n.nodeType === 3 && n.textContent.trim()) hasText = true;
      }
      if (hasElChild && hasText) wrapTextRuns(el);
    }
  }
  function wrapTextRuns(el) {
    var runs = [], run = [];
    for (var c = 0; c < el.childNodes.length; c++) {
      var n = el.childNodes[c];
      if (n.nodeType === 3 && n.textContent.trim()) run.push(n);
      else if (run.length) { runs.push(run); run = []; }
    }
    if (run.length) runs.push(run);
    runs.forEach(function (r) {
      var span = document.createElement("span");
      span.className = "cct-t";
      el.insertBefore(span, r[0]);
      r.forEach(function (tn) { span.appendChild(tn); });
    });
  }

  /* ==================== apply stored edits ==================== */
  function applyStored() {
    var store = loadStore();
    var scopes = [
      store.shared || {},
      (store.pages && store.pages[pageName()]) || {}
    ];
    scopes.forEach(function (map) {
      Object.keys(map).forEach(function (key) {
        var v = map[key];
        if (!v) return;
        var rest = key.split("|")[1] || "";
        /* Named keys (data-cct-key) may match multiple elements (e.g. logo in header & footer) */
        var els = (rest && rest.indexOf(">") === -1)
          ? document.querySelectorAll('[data-cct-key="' + rest.replace(/"/g, '\\"') + '"]')
          : [findByKey(key)];
        els.forEach(function (el) {
          if (!el) return;
          if (v.t === "text" && el.children.length === 0) el.textContent = v.v;
          else if (v.t === "img") el.setAttribute("src", v.v);
          else if (v.t === "bg") el.style.backgroundImage = v.v;
          else if (v.t === "avatar") applyAvatarImage(el, v.v);
        });
      });
    });
  }

  /* ==================== collect editable items ==================== */
  var items = [];
  var byEl = new Map();
  var bgItems = [];
  var avatarItems = [];

  /* Apply a photo to an avatar div: background-image + cover + hide initials */
  function applyAvatarImage(el, dataUrl) {
    el.style.backgroundImage = 'url("' + dataUrl + '")';
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    el.style.backgroundRepeat = "no-repeat";
    el.classList.add("cct-avatar-photo");
    /* Hide the initials text when a photo is set */
    el.setAttribute("data-has-photo", "1");
  }

  function register(el, type) {
    if (byEl.has(el)) return;
    var scope = el.closest(".site-header, .site-footer") ? "shared" : "page";
    var item = { el: el, key: elKey(el, scope), scope: scope, type: type };
    items.push(item);
    byEl.set(el, item);
    el.classList.add(type === "text" ? "cct-text" : type === "img" ? "cct-img" : type === "avatar" ? "cct-avatar" : "cct-bg");
    if (type === "bg") bgItems.push(item);
    if (type === "avatar") avatarItems.push(item);
  }

  function collect() {
    document.querySelectorAll(TEXT_SELECTOR).forEach(function (el) {
      if (el.closest(".editor-ui")) return;
      if (el.children.length > 0) return;
      if (!el.textContent.trim()) return;
      register(el, "text");
    });
    document.querySelectorAll("img").forEach(function (el) {
      if (el.closest(".editor-ui")) return;
      register(el, "img");
    });
    document.querySelectorAll(AVATAR_SELECTOR).forEach(function (el) {
      if (el.closest(".editor-ui")) return;
      register(el, "avatar");
    });
    document.querySelectorAll(BG_SELECTOR).forEach(function (el) {
      register(el, "bg");
    });
  }

  /* ==================== values ==================== */
  function getValue(it) {
    if (it.type === "text") return it.el.textContent;
    if (it.type === "img") return it.el.getAttribute("src");
    if (it.type === "avatar") {
      var bg = it.el.style.backgroundImage;
      if (bg && bg !== "none" && bg.indexOf("url(") !== -1) {
        /* Extract the raw URL from url("...") or url(...) */
        return bg.replace(/^url\(["']?/, "").replace(/["']?\)$/, "");
      }
      return "";
    }
    return it.el.style.backgroundImage;
  }
  function setValue(it, v) {
    if (it.type === "text") it.el.textContent = v;
    else if (it.type === "img") it.el.setAttribute("src", v);
    else if (it.type === "avatar") {
      if (v) applyAvatarImage(it.el, v);
      else {
        /* Reset to initials: remove background-image and photo class */
        it.el.style.backgroundImage = "";
        it.el.style.backgroundSize = "";
        it.el.style.backgroundPosition = "";
        it.el.style.backgroundRepeat = "";
        it.el.classList.remove("cct-avatar-photo");
        it.el.removeAttribute("data-has-photo");
      }
    }
    else it.el.style.backgroundImage = v;
  }

  /* ==================== edit session ==================== */
  var editing = false;
  var snapshot = new Map();
  var changed = new Set();
  var currentEditEl = null;
  var chips = [];

  function enterEdit() {
    if (editing) return;
    editing = true;
    document.body.classList.add("edit-mode");
    snapshot = new Map();
    changed = new Set();
    items.forEach(function (it) { snapshot.set(it, getValue(it)); });
    injectChips();
    injectImgLabels();
    updateToolbar();
    showHint(true);
  }

  function exitEdit(restore) {
    commitCurrent();
    if (restore) snapshot.forEach(function (v, it) { setValue(it, v); });
    editing = false;
    document.body.classList.remove("edit-mode");
    items.forEach(function (it) { it.el.classList.remove("cct-changed"); });
    removeChips();
    removeImgLabels();
    changed = new Set();
    updateToolbar();
    showHint(false);
  }

  function commitCurrent() {
    if (!currentEditEl) return;
    var el = currentEditEl;
    currentEditEl = null;
    el.removeAttribute("contenteditable");
    el.classList.remove("cct-active");
    if (el.dataset.orig !== undefined) delete el.dataset.orig;
    markChanged(el);
  }

  function markChanged(el) {
    var it = byEl.get(el);
    if (!it) return;
    if (getValue(it) !== snapshot.get(it)) {
      changed.add(it);
      el.classList.add("cct-changed");
    } else {
      changed.delete(it);
      el.classList.remove("cct-changed");
    }
    updateToolbar();
  }

  /* ==================== click routing ==================== */
  document.addEventListener("click", function (e) {
    if (!editing) return;
    var t = e.target;
    /* Ignore clicks on editor UI controls (toolbar, chips, modals), but NOT on
       images — those live inside a .cct-img-wrap which also carries .editor-ui
       (used only to skip text normalization), so we must still allow them. */
    if (t.closest(".editor-ui") && !t.closest(".cct-img-wrap")) return;
    if (t.closest('[contenteditable="true"]')) return;
    e.preventDefault();
    e.stopPropagation();
    var it = itemFromPoint(t, e.clientX, e.clientY);
    if (!it) return;
    if (it.type === "text") beginTextEdit(it.el);
    else if (it.type === "img" || it.type === "avatar" || it.type === "bg") pickImage(it);
  }, true);

  function itemFromPoint(t, x, y) {
    var node = t;
    while (node && node !== document.body && node.nodeType === 1) {
      if (byEl.has(node)) return byEl.get(node);
      node = node.parentElement;
    }
    /* Fallback 1: use document.elementFromPoint to find the actual topmost
       element at the click position (handles cases where e.target is wrong,
       e.g. synthetic clicks targeting <html>) */
    if (typeof document.elementFromPoint === "function" && x !== undefined && y !== undefined) {
      var hit = document.elementFromPoint(x, y);
      if (hit) {
        var n2 = hit;
        while (n2 && n2 !== document.body && n2.nodeType === 1) {
          if (byEl.has(n2)) return byEl.get(n2);
          n2 = n2.parentElement;
        }
      }
    }
    /* Fallback 2: caretRangeFromPoint for text nodes */
    var range = null;
    if (typeof document.caretRangeFromPoint === "function") {
      range = document.caretRangeFromPoint(x, y);
    } else if (typeof document.caretPositionFromPoint === "function") {
      var pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }
    if (range && range.startContainer && range.startContainer.nodeType === 3) {
      var el = range.startContainer.parentElement;
      while (el && el !== document.body) {
        if (byEl.has(el)) {
          var r = el.getBoundingClientRect();
          if (x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4) {
            return byEl.get(el);
          }
          return null;
        }
        el = el.parentElement;
      }
    }
    return null;
  }

  /* ==================== text editing ==================== */
  function beginTextEdit(el) {
    if (currentEditEl && currentEditEl !== el) commitCurrent();
    currentEditEl = el;
    el.dataset.orig = el.textContent;
    el.setAttribute("contenteditable", "true");
    el.setAttribute("spellcheck", "false");
    el.classList.add("cct-active");
    el.focus();
    requestAnimationFrame(function () {
      var range = document.createRange();
      range.selectNodeContents(el);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
  }

  document.addEventListener("keydown", function (e) {
    if (!editing || !currentEditEl) return;
    if (e.key === "Enter") {
      e.preventDefault();
      currentEditEl.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      var el = currentEditEl;
      if (el.dataset.orig !== undefined) el.textContent = el.dataset.orig;
      el.blur();
    }
  });

  document.addEventListener("paste", function (e) {
    if (!editing || !currentEditEl) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  });

  document.addEventListener("focusout", function (e) {
    if (!editing) return;
    if (e.target === currentEditEl) commitCurrent();
  });

  /* ==================== image editing ==================== */
  var fileInput = null;
  var pendingImage = null;

  function pickImage(it) {
    commitCurrent();
    pendingImage = it;
    fileInput.value = "";
    fileInput.click();
  }

  function processImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var maxW = 1600;
        var w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        var canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        cb(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = function () { cb(ev.target.result); };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.className = "editor-ui";
  /* Visually hidden but still clickable — opens the OS native file picker.
     Using position/offscreen instead of display:none maximizes cross-browser
     reliability for programmatic .click() inside the edit-mode click handler. */
  fileInput.style.cssText = "position:fixed; top:-9999px; left:-9999px; width:1px; height:1px; opacity:0; pointer-events:none;";
  document.body.appendChild(fileInput);
  fileInput.addEventListener("change", function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f || !pendingImage) return;
    var it = pendingImage;
    processImage(f, function (dataUrl) {
      if (it.type === "img") it.el.setAttribute("src", dataUrl);
      else if (it.type === "avatar") applyAvatarImage(it.el, dataUrl);
      else it.el.style.backgroundImage = 'url("' + dataUrl + '")';
      markChanged(it.el);
      toast("Image updated — click Save to keep the change");
    });
  });

  /* ==================== background & avatar chips ==================== */
  function injectChips() {
    bgItems.forEach(function (it) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "editor-ui cct-bg-chip";
      chip.innerHTML = "&#10548; Change Background";
      chip.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        pickImage(it);
      });
      it.el.appendChild(chip);
      chips.push(chip);
    });
    avatarItems.forEach(function (it) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "editor-ui cct-avatar-chip";
      chip.innerHTML = "&#128247; Change Photo";
      chip.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        pickImage(it);
      });
      it.el.appendChild(chip);
      chips.push(chip);
    });
  }
  function removeChips() {
    chips.forEach(function (c) { c.remove(); });
    chips = [];
  }

  /* ==================== image hover labels ==================== */
  /* Since <img> is a replaced element, CSS ::after doesn't work.
     We inject wrapper labels via JS that appear on hover. */
  var imgLabels = [];

  function injectImgLabels() {
    items.forEach(function (it) {
      if (it.type !== "img") return;
      var parent = it.el.parentNode;
      if (!parent) return;
      /* Skip if the image is inside a <picture> or already wrapped */
      var wrapper = document.createElement("div");
      wrapper.className = "editor-ui cct-img-wrap";
      it.el.parentNode.insertBefore(wrapper, it.el);
      wrapper.appendChild(it.el);
      var label = document.createElement("span");
      label.className = "cct-img-label";
      label.innerHTML = "&#128247; Click to Replace";
      wrapper.appendChild(label);
      imgLabels.push({ wrapper: wrapper, original: it.el, label: label, parent: parent });
    });
  }
  function removeImgLabels() {
    /* Unwrap: move the <img> back to its original parent, remove the wrapper */
    imgLabels.forEach(function (rec) {
      if (rec.wrapper.parentNode) {
        rec.wrapper.parentNode.insertBefore(rec.original, rec.wrapper);
        rec.wrapper.remove();
      }
    });
    imgLabels = [];
  }

  /* ==================== save / cancel / reset ==================== */
  function saveChanges() {
    commitCurrent();
    var store = loadStore();
    if (!store.shared) store.shared = {};
    if (!store.pages) store.pages = {};
    if (!store.pages[pageName()]) store.pages[pageName()] = {};
    changed.forEach(function (it) {
      var map = it.scope === "shared" ? store.shared : store.pages[pageName()];
      map[it.key] = { t: it.type, v: getValue(it) };
    });
    try {
      saveStore(store);
      toast("Changes saved — visible on every visit");
      exitEdit(false);
    } catch (e) {
      toast("Could not save — browser storage is full. Try smaller images.", true);
    }
  }

  function resetPage() {
    if (!window.confirm("Reset this page to its original content?\nSaved edits for this page (including header & footer) will be removed.")) return;
    var store = loadStore();
    if (store.pages) delete store.pages[pageName()];
    if (store.shared) delete store.shared;
    try { saveStore(store); } catch (e) { /* ignore */ }
    location.reload();
  }

  function changePassword() {
    var current = prompt("Enter current admin password:");
    if (!current) return;
    sha256(current).then(function (hash) {
      if (hash !== ADMIN_HASH) { toast("Current password is incorrect.", true); return; }
      var newPw = prompt("Enter new admin password (min 6 characters):");
      if (!newPw || newPw.length < 6) { toast("Password too short.", true); return; }
      sha256(newPw).then(function (newHash) {
        localStorage.setItem("cct-admin-hash", newHash);
        ADMIN_HASH = newHash;
        toast("Admin password changed successfully");
      });
    });
  }

  function logoutAdmin() {
    sessionStorage.removeItem("cct-admin");
    isAdmin = false;
    if (editing) exitEdit(true);
    if (toolbar) toolbar.style.display = "none";
    toast("Logged out");
  }

  window.addEventListener("beforeunload", function (e) {
    if (editing && changed.size > 0) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /* ==================== toolbar UI ==================== */
  var toolbar, editBtn, editingBox, countEl, cancelBtn, saveBtn, resetBtn, pwBtn, logoutBtn, hint, toastEl, toastTimer;

  function buildUI() {
    toolbar = document.createElement("div");
    toolbar.className = "editor-ui editor-toolbar";
    toolbar.style.display = "none"; /* hidden until admin logs in */

    editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "ebtn ebtn-edit";
    editBtn.innerHTML = "&#9998; Edit Content";
    editBtn.addEventListener("click", function () {
      if (!editing) enterEdit();
    });

    editingBox = document.createElement("div");
    editingBox.style.display = "none";
    editingBox.style.alignItems = "center";
    editingBox.style.gap = "8px";

    countEl = document.createElement("span");
    countEl.className = "ecount";

    cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "ebtn ebtn-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", function () {
      exitEdit(true);
      toast("Changes discarded");
    });

    saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "ebtn ebtn-save";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", saveChanges);

    resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "ebtn ebtn-reset";
    resetBtn.title = "Reset this page to original content";
    resetBtn.setAttribute("aria-label", "Reset this page to original content");
    resetBtn.innerHTML = "&#8635;";
    resetBtn.addEventListener("click", resetPage);

    pwBtn = document.createElement("button");
    pwBtn.type = "button";
    pwBtn.className = "ebtn ebtn-reset";
    pwBtn.title = "Change admin password";
    pwBtn.setAttribute("aria-label", "Change admin password");
    pwBtn.innerHTML = "&#128274;";
    pwBtn.addEventListener("click", changePassword);

    logoutBtn = document.createElement("button");
    logoutBtn.type = "button";
    logoutBtn.className = "ebtn ebtn-reset";
    logoutBtn.title = "Logout";
    logoutBtn.setAttribute("aria-label", "Logout");
    logoutBtn.innerHTML = "&#10148;";
    logoutBtn.addEventListener("click", logoutAdmin);

    editingBox.appendChild(cancelBtn);
    editingBox.appendChild(countEl);
    editingBox.appendChild(saveBtn);
    editingBox.appendChild(resetBtn);
    editingBox.appendChild(pwBtn);
    editingBox.appendChild(logoutBtn);

    toolbar.appendChild(editBtn);
    toolbar.appendChild(editingBox);
    document.body.appendChild(toolbar);

    hint = document.createElement("div");
    hint.className = "editor-ui editor-hint";
    hint.style.display = "none";
    hint.innerHTML = "<strong>Admin Edit Mode</strong> — click any text to edit &nbsp;·&nbsp; click any <strong>image</strong> or <strong>avatar</strong> to replace &nbsp;·&nbsp; <strong>Enter</strong> finish &nbsp;·&nbsp; <strong>Esc</strong> undo item &nbsp;·&nbsp; Save when done";
    document.body.appendChild(hint);

    toastEl = document.createElement("div");
    toastEl.className = "editor-ui editor-toast";
    document.body.appendChild(toastEl);
  }

  /* ==================== Admin trigger ====================
     Two hidden ways to open the login modal:
     1. Shift+Click on the brand logo (header or footer)
     2. Ctrl+Shift+L keyboard shortcut (anywhere on page)
     Normal visitors never discover these — no UI hint is shown.
     ======================================================== */
  function setupAdminTrigger() {
    if (window._cctTriggerReady) return;
    window._cctTriggerReady = true;

    /* Shift+Click on any .brand element */
    document.addEventListener("click", function (e) {
      if (!e.shiftKey) return;
      if (!e.target.closest || !e.target.closest(".brand")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isAdmin) return;
      showLoginModal();
    }, true);

    /* Ctrl+Shift+L keyboard shortcut */
    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        if (isAdmin) return;
        showLoginModal();
      }
    }, true);
  }

  function updateToolbar() {
    if (!toolbar || !isAdmin) return;
    editBtn.style.display = editing ? "none" : "";
    editingBox.style.display = editing ? "flex" : "none";
    if (editing) {
      var n = changed.size;
      countEl.textContent = n === 0 ? "No changes yet" : n + (n === 1 ? " change" : " changes");
      countEl.className = "ecount" + (n === 0 ? " zero" : "");
      saveBtn.disabled = n === 0;
    }
  }

  function showHint(show) { if (hint) hint.style.display = show ? "block" : "none"; }

  function toast(msg, isError) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = "editor-ui editor-toast show" + (isError ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.className = "editor-ui editor-toast" + (isError ? " error" : "");
    }, 2800);
  }

  /* ==================== boot ==================== */
  checkAdmin();
  setupAdminTrigger();
  normalizeAll();
  applyStored();
  collect();
  buildUI();
  updateToolbar();

  /* If admin is already authenticated (sessionStorage), show toolbar */
  if (isAdmin) showAdminUI();
})();
