/* ProofFlow — shared site behavior.
   - Mobile nav toggle
   - Google AdSense loader (only when a publisher ID is configured)
   - Waitlist + contact forms submit via mailto (no backend, no account needed)
   - Footer year */
(function () {
  "use strict";

  /* Mobile nav */
  var toggle = document.getElementById("nav-toggle");
  var nav = document.getElementById("main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* Footer year */
  var year = document.getElementById("year");
  if (year) { year.textContent = new Date().getFullYear(); }

  /* Google AdSense: injects the page-level script when a publisher ID is configured
     in site-config.js. The ad-slot placeholders stay collapsed and invisible until
     Google approves the site and starts serving; only slots that carry a data-ad-slot
     id (defined after approval) get filled by Google's script. Config being set must
     never produce empty ad boxes. */
  function loadAdSense() {
    var cfg = window.PROOFFLOW_CONFIG || {};
    var clientId = (cfg.adsenseClientId || "").trim();
    if (!clientId) { return; }

    var script = document.createElement("script");
    script.async = true;
    script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(clientId);
    script.setAttribute("crossorigin", "anonymous");
    document.head.appendChild(script);

    var slots = document.querySelectorAll(".ad-slot[data-ad-slot]");
    slots.forEach(function (slot) {
      var adSlot = slot.getAttribute("data-ad-slot");
      if (!adSlot) { return; }
      slot.classList.add("ads-active");
      var ins = document.createElement("ins");
      ins.className = "adsbygoogle";
      ins.style.display = "block";
      ins.setAttribute("data-ad-slot", adSlot);
      ins.setAttribute("data-ad-client", clientId);
      ins.setAttribute("data-ad-format", "auto");
      ins.setAttribute("data-full-width-responsive", "true");
      slot.appendChild(ins);
    });

    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }

  /* mailto forms: waitlist + contact. Composes the message, opens the visitor's email app. */
  function wireMailtoForm(formId, buildMailto) {
    var form = document.getElementById(formId);
    if (!form) { return; }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      window.location.href = buildMailto(new FormData(form));
    });
  }

  function encode(s) { return encodeURIComponent(String(s || "")).replace(/%20/g, "+"); }

  wireMailtoForm("waitlist-form", function (d) {
    var subject = "ProofFlow early access request";
    var body = [
      "Name: " + d.get("name"),
      "Work email: " + d.get("email"),
      "Company: " + d.get("company"),
      "Fleet size: " + d.get("fleet"),
      "",
      "Please add me to the ProofFlow early access list."
    ].join("\n");
    return "mailto:contact@proofflow.me?subject=" + encode(subject) + "&body=" + encode(body);
  });

  wireMailtoForm("contact-form", function (d) {
    var subject = "ProofFlow contact: " + d.get("name");
    var body = [
      "Name: " + d.get("name"),
      "Email: " + d.get("email"),
      "Company: " + d.get("company"),
      "",
      d.get("message")
    ].join("\n");
    return "mailto:contact@proofflow.me?subject=" + encode(subject) + "&body=" + encode(body);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAdSense);
  } else {
    loadAdSense();
  }
})();
