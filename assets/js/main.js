/* China Custom Tours — shared site scripts */
(function () {
  "use strict";

  /* ----- Sticky header shadow ----- */
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("scrolled", window.scrollY > 10);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ----- Mobile navigation toggle ----- */
  var toggle = document.querySelector(".nav-toggle");
  var navLinks = document.querySelector(".nav-links");
  if (toggle && navLinks) {
    toggle.addEventListener("click", function () {
      var open = navLinks.classList.toggle("open");
      toggle.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    navLinks.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        navLinks.classList.remove("open");
        toggle.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ----- Reveal animation: add .visible to all .reveal elements on DOM ready
         (animation is CSS-driven and always renders the final state) ----- */
  var revealEls = document.querySelectorAll(".reveal");
  if (revealEls.length) {
    var revealNow = function () { revealEls.forEach(function (el) { el.classList.add("visible"); }); };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", revealNow);
    } else {
      revealNow();
    }
  }

  /* ----- Contact form: validate + real submission to email backend -----
     Uses Web3Forms (free, no account/activation email needed): submissions
     go to the inbox tied to ACCESS_KEY below. Get a free key at
     https://web3forms.com (enter your email, copy the key). */
  var FORM_ENDPOINT = "https://api.web3forms.com/submit";

  document.querySelectorAll("form.js-form").forEach(function (form) {
    var errorEl = form.querySelector(".form-error");

    var clearErrors = function () {
      form.querySelectorAll(".form-field.invalid").forEach(function (w) {
        w.classList.remove("invalid");
      });
      if (errorEl) errorEl.hidden = true;
    };

    // Clear error state while typing
    form.querySelectorAll("[data-required]").forEach(function (field) {
      field.addEventListener("input", clearErrors);
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearErrors();

      var valid = true;
      form.querySelectorAll("[data-required]").forEach(function (field) {
        var wrap = field.closest(".form-field");
        var value = field.value.trim();
        var ok = value !== "";
        if (ok && field.type === "email") {
          ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        }
        if (wrap) wrap.classList.toggle("invalid", !ok);
        if (!ok) valid = false;
      });

      if (!valid) {
        var firstInvalid = form.querySelector(".form-field.invalid input, .form-field.invalid select, .form-field.invalid textarea");
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      var btn = form.querySelector("button[type='submit']");
      var original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = "Sending&hellip;";

      var data = new FormData(form);

      fetch(FORM_ENDPOINT, {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" }
      })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (json) {
          if (!json || json.success !== true) {
            throw new Error((json && json.message) ? json.message : "Submission failed");
          }
          form.style.display = "none";
          var success = form.parentElement.querySelector(".form-success");
          if (success) {
            success.classList.add("show");
            success.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        })
        .catch(function () {
          btn.disabled = false;
          btn.innerHTML = original;
          if (errorEl) {
            errorEl.textContent =
              "Sorry, the message couldn't be sent just now. Please email us directly at zjonny338@gmail.com — we'll reply within 24 hours.";
            errorEl.hidden = false;
          }
        });
    });
  });

  /* ----- Footer year ----- */
  var yearEl = document.querySelector("#year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
