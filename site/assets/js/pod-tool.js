/* ProofFlow — free in-browser proof of delivery / proof of work generator.
   100% client-side: no backend, no accounts, nothing is uploaded anywhere.
   Records are stored in localStorage on this device only. */

(function () {
  "use strict";

  var LS_KEY = "proofflow_pod_records_v1";

  var LABELS = {
    delivery: {
      step1: "Delivery details",
      recipient: "Recipient name", recipientLc: "recipient",
      address: "Delivery address", order: "Order/reference #",
      items: "Items delivered", itemsReq: false,
      driver: "Delivered by", sigLine: "Recipient signature",
      docTitle: "PROOF OF DELIVERY", badge: "✓ DELIVERED",
      generate: "Create delivery record", heading: "Your delivery record",
      typeBadge: "Delivery", workRowsLabel: null
    },
    work: {
      step1: "Job details",
      recipient: "Client name", recipientLc: "client",
      address: "Job address", order: "Job / reference #",
      items: "Work performed", itemsReq: true,
      driver: "Completed by", sigLine: "Client signature",
      docTitle: "PROOF OF WORK", badge: "✓ WORK COMPLETED",
      generate: "Create work record", heading: "Your work record",
      typeBadge: "Work", workRowsLabel: null
    }
  };

  var FIELD_ROWS = [
    ["business", "Business name"],
    ["name", null],        /* label depends on type */
    ["address", null],
    ["order", null],
    ["items", null],
    ["notes", "Notes"],
    ["driver", null]
  ];

  function $(id) { return document.getElementById(id); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

  var state = {
    type: "delivery",
    photos: [],        /* delivery mode: up to 3 dataURLs */
    steps: [],         /* work mode: [{label, photo}] — up to 10 steps */
    sigDrawn: false,
    stampedText: "", lat: null, lon: null, geoShared: false, stamped: false
  };

  /* ---------- helpers ---------- */

  function esc(s) { return String(s == null ? "" : s); }

  function make(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function recordId() {
    var d = new Date();
    var ymd = d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, "0") +
      String(d.getDate()).padStart(2, "0");
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var buf = new Uint32Array(4);
    (window.crypto || {}).getRandomValues
      ? window.crypto.getRandomValues(buf)
      : buf.forEach(function (_, i, a) { a[i] = Math.floor(Math.random() * 1e9); });
    var s = "";
    for (var i = 0; i < 4; i++) s += chars[buf[i] % chars.length];
    return "PF-" + ymd + "-" + s;
  }

  function fmtStamp(d) {
    return d.toLocaleString(undefined, {
      weekday: "short", year: "numeric", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short"
    });
  }

  /* ---------- record type toggle ---------- */

  function applyType() {
    var L = LABELS[state.type];
    $("step1-title").textContent = L.step1;
    $("lbl-recipient").textContent = L.recipient;
    $("lbl-recipient-lc").textContent = L.recipientLc;
    $("lbl-address").textContent = L.address;
    $("lbl-order").textContent = L.order;
    $("lbl-driver").textContent = L.driver;
    $("lbl-items").textContent = L.items;
    var req = $("items-req");
    if (L.itemsReq) {
      req.textContent = "*";
      req.className = "req";
      req.setAttribute("aria-hidden", "true");
    } else {
      req.textContent = "(optional)";
      req.className = "opt";
    }
    $("generate-btn").textContent = L.generate;
    $("photo-group-delivery").hidden = state.type !== "delivery";
    $("photo-group-work").hidden = state.type !== "work";
    $("pod-items").closest(".field").hidden = state.type !== "delivery";
    updateSigEcho();
    hideFieldErrors();
  }

  var typeRadios = document.querySelectorAll('input[name="record-type"]');
  typeRadios.forEach(function (r) {
    r.addEventListener("change", function () {
      state.type = document.querySelector('input[name="record-type"]:checked').value;
      applyType();
    });
  });

  /* ---------- photos ---------- */

  function downscale(img, done) {
    var max = 1280;
    var scale = Math.min(1, max / Math.max(img.width, img.height));
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    done(c.toDataURL("image/jpeg", 0.82));
  }

  function wirePhotoInput(inputId, targetKey, previewId) {
    var input = $(inputId);
    on(input, "change", function () {
      var files = Array.prototype.slice.call(input.files || []);
      var limit = targetKey === "photos" ? 3 : 2;
      var arr = state[targetKey];
      files.forEach(function (f) {
        if (arr.length >= limit) return;
        var url = URL.createObjectURL(f);
        var img = new Image();
        img.onload = function () {
          downscale(img, function (dataUrl) {
            arr.push(dataUrl);
            renderPreviews();
            URL.revokeObjectURL(url);
          });
        };
        img.onerror = function () { URL.revokeObjectURL(url); };
        img.src = url;
      });
      input.value = "";
    });
  }

  function renderPreviews() {
    var groups = [
      ["all", "photos"]
    ];
    groups.forEach(function (g) {
      var box = $("preview-" + g[0]);
      if (!box) return;
      box.innerHTML = "";
      state[g[1]].forEach(function (dataUrl, i) {
        var fig = make("div", "pod-preview");
        var img = document.createElement("img");
        img.src = dataUrl;
        img.alt = "Photo " + (i + 1) + " preview";
        var btn = make("button", "pod-preview-remove", "Remove");
        btn.type = "button";
        btn.setAttribute("aria-label", "Remove photo " + (i + 1));
        (function (key, idx) {
          btn.addEventListener("click", function () {
            state[key].splice(idx, 1);
            renderPreviews();
          });
        })(g[1], i);
        fig.appendChild(img);
        fig.appendChild(btn);
        box.appendChild(fig);
      });
    });
  }

  wirePhotoInput("pod-photos-all", "photos", "preview-all");

  /* ---------- work steps (work mode) ---------- */

  function addStep() {
    if (state.steps.length >= 10) return;
    state.steps.push({ label: "", photo: null });
    renderSteps();
    var inputs = document.querySelectorAll("#pod-steps .pod-step-label-input");
    var last = inputs[inputs.length - 1];
    if (last) last.focus();
  }

  function stepPhoto(input, step) {
    var f = input.files && input.files[0];
    if (!f) return;
    var url = URL.createObjectURL(f);
    var img = new Image();
    img.onload = function () {
      downscale(img, function (dataUrl) {
        step.photo = dataUrl;
        renderSteps();
        URL.revokeObjectURL(url);
      });
    };
    img.onerror = function () { URL.revokeObjectURL(url); };
    img.src = url;
    input.value = "";
  }

  function renderSteps() {
    var box = $("pod-steps");
    if (!box) return;
    box.innerHTML = "";
    state.steps.forEach(function (st, i) {
      var row = make("div", "pod-step-row");
      var head = make("div", "pod-step-head");
      head.appendChild(make("span", "pod-step-num", String(i + 1)));
      var lab = document.createElement("input");
      lab.type = "text";
      lab.className = "pod-step-label-input";
      lab.placeholder = "Step " + (i + 1) + " — e.g. Removed old unit";
      lab.value = st.label || "";
      lab.setAttribute("aria-label", "Step " + (i + 1) + " description");
      lab.addEventListener("input", function () { st.label = lab.value; });
      head.appendChild(lab);
      var rm = make("button", "pod-step-remove", "Remove");
      rm.type = "button";
      rm.setAttribute("aria-label", "Remove step " + (i + 1));
      (function (idx) {
        rm.addEventListener("click", function () {
          state.steps.splice(idx, 1);
          renderSteps();
        });
      })(i);
      head.appendChild(rm);
      row.appendChild(head);

      var body = make("div", "pod-step-body");
      var pl = make("label", "btn btn-outline btn-sm pod-photo-btn", "Add photo");
      pl.setAttribute("for", "pod-step-photo-" + i);
      body.appendChild(pl);
      var fi = document.createElement("input");
      fi.type = "file";
      fi.id = "pod-step-photo-" + i;
      fi.accept = "image/*";
      fi.setAttribute("capture", "environment");
      fi.hidden = true;
      fi.addEventListener("change", function () { stepPhoto(fi, st); });
      body.appendChild(fi);
      if (st.photo) {
        var pv = make("div", "pod-step-preview");
        var img = document.createElement("img");
        img.src = st.photo;
        img.alt = "Step " + (i + 1) + " photo";
        var rmb = make("button", "pod-preview-remove", "Remove");
        rmb.type = "button";
        rmb.setAttribute("aria-label", "Remove step " + (i + 1) + " photo");
        rmb.addEventListener("click", function () {
          st.photo = null;
          renderSteps();
        });
        pv.appendChild(img);
        pv.appendChild(rmb);
        body.appendChild(pv);
      }
      row.appendChild(body);
      box.appendChild(row);
    });
    var addBtn = $("add-step-btn");
    if (addBtn) addBtn.disabled = state.steps.length >= 10;
  }

  on($("add-step-btn"), "click", addStep);

  /* ---------- signature pad ---------- */

  var canvas = $("pod-sig");
  var sctx = canvas.getContext("2d");
  var drawing = false, lastX = 0, lastY = 0;

  function fitSigCanvas() {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var backup = state.sigDrawn ? canvas.toDataURL() : null;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.round(200 * dpr);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.lineWidth = 2.6;
    sctx.lineCap = "round";
    sctx.lineJoin = "round";
    sctx.strokeStyle = "#0B2239";
    if (backup) {
      var img = new Image();
      img.onload = function () {
        sctx.drawImage(img, 0, 0, rect.width, 200);
      };
      img.src = backup;
    }
  }

  function sigPos(ev) {
    var r = canvas.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  canvas.addEventListener("pointerdown", function (ev) {
    ev.preventDefault();
    drawing = true;
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
    var p = sigPos(ev);
    lastX = p[0]; lastY = p[1];
    sctx.beginPath();
    sctx.moveTo(lastX, lastY);
  });
  canvas.addEventListener("pointermove", function (ev) {
    if (!drawing) return;
    ev.preventDefault();
    var p = sigPos(ev);
    sctx.lineTo(p[0], p[1]);
    sctx.stroke();
    state.sigDrawn = true;
  });
  function sigEnd() { drawing = false; }
  canvas.addEventListener("pointerup", sigEnd);
  canvas.addEventListener("pointercancel", sigEnd);

  on($("sig-clear"), "click", function () {
    sctx.clearRect(0, 0, canvas.width, canvas.height);
    state.sigDrawn = false;
  });

  var resizeT = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(fitSigCanvas, 200);
  });
  fitSigCanvas();

  function updateSigEcho() {
    var v = ($("pod-recipient").value || "").trim();
    $("sig-echo").textContent = "Signed by: " + (v || "—");
  }
  on($("pod-recipient"), "input", updateSigEcho);

  /* ---------- time & location stamp ---------- */

  on($("stamp-btn"), "click", function () {
    var now = new Date();
    state.stampedText = fmtStamp(now);
    state.stamped = true;
    var line = $("stamp-line");
    line.textContent = "Delivered at: " + state.stampedText + " — locating…";
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          state.lat = pos.coords.latitude;
          state.lon = pos.coords.longitude;
          state.geoShared = true;
          line.textContent = "Delivered at: " + state.stampedText +
            " · GPS: " + state.lat.toFixed(4) + ", " + state.lon.toFixed(4);
        },
        function () {
          state.geoShared = false;
          line.textContent = "Delivered at: " + state.stampedText +
            ". Location not shared — record will show time only.";
        },
        { timeout: 10000, maximumAge: 60000 }
      );
    } else {
      state.geoShared = false;
      line.textContent = "Delivered at: " + state.stampedText +
        ". Location not shared — record will show time only.";
    }
  });

  /* ---------- validation ---------- */

  function setError(inputId, errId, msg) {
    var err = $(errId), input = $(inputId);
    if (msg) {
      err.textContent = msg;
      err.hidden = false;
      if (input) input.setAttribute("aria-invalid", "true");
    } else {
      err.hidden = true;
      err.textContent = "";
      if (input) input.removeAttribute("aria-invalid");
    }
  }

  function hideFieldErrors() {
    ["err-recipient", "err-address", "err-items"].forEach(function (id) {
      $(id).hidden = true; $(id).textContent = "";
    });
    ["pod-recipient", "pod-address", "pod-items"].forEach(function (id) {
      $(id).removeAttribute("aria-invalid");
    });
    var box = $("pod-errors");
    box.hidden = true; box.innerHTML = "";
  }

  function validate() {
    var L = LABELS[state.type];
    var errs = [];
    var rec = $("pod-recipient").value.trim();
    var addr = $("pod-address").value.trim();
    setError("pod-recipient", "err-recipient", rec ? "" : L.recipient + " is required.");
    setError("pod-address", "err-address", addr ? "" : L.address + " is required.");
    setError("pod-items", "err-items", "");
    if (!rec) errs.push(L.recipient + " is required.");
    if (!addr) errs.push(L.address + " is required.");
    var box = $("pod-errors");
    if (errs.length) {
      box.innerHTML = "";
      var h = make("p", null, "Please fix the following:");
      h.style.fontWeight = "700";
      box.appendChild(h);
      var ul = make("ul");
      errs.forEach(function (m) { ul.appendChild(make("li", null, m)); });
      box.appendChild(ul);
      box.hidden = false;
      box.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    box.hidden = true;
    box.innerHTML = "";
    return true;
  }

  /* ---------- record rendering (DOM-safe: textContent only for user data) ---------- */

  function photoGroupsFor(rec) {
    if (rec.type === "work") return [];
    return rec.photoGroups && rec.photoGroups.all.length
      ? [{ label: null, urls: rec.photoGroups.all }]
      : [];
  }

  function renderRecord(rec) {
    var L = LABELS[rec.type];
    var doc = $("record");
    doc.innerHTML = "";

    var head = make("div", "record-head");
    head.appendChild(make("div", "record-id", "Record " + rec.id));
    head.appendChild(make("span", "badge-delivered", L.badge));
    doc.appendChild(head);

    var title = make("div", "record-doctitle", L.docTitle);
    doc.appendChild(title);

    var rows = make("div", "record-rows");
    var rowDefs = [
      ["Business", rec.business],
      [L.recipient, rec.name],
      [L.address, rec.address],
      [L.order, rec.order],
      [L.items, rec.items],
      ["Notes", rec.notes],
      [L.driver, rec.driver]
    ];
    rowDefs.forEach(function (rd) {
      if (!rd[1]) return;
      var row = make("div", "record-row");
      row.appendChild(make("div", "record-label", rd[0]));
      row.appendChild(make("div", "record-value", rd[1]));
      rows.appendChild(row);
    });
    doc.appendChild(rows);

    var groups = photoGroupsFor(rec);
    if (groups.length) {
      doc.appendChild(make("div", "record-subhead", "Photos"));
      groups.forEach(function (g) {
        if (g.label) doc.appendChild(make("div", "record-grouplabel", g.label));
        var grid = make("div", "record-photos");
        g.urls.forEach(function (u, i) {
          var fig = make("figure", "record-photo");
          var img = document.createElement("img");
          img.src = u;
          img.alt = (g.label ? g.label + " photo " : "Photo ") + (i + 1);
          img.loading = "lazy";
          fig.appendChild(img);
          grid.appendChild(fig);
        });
        doc.appendChild(grid);
      });
    }

    /* Work mode: step list renders in order, each checked off */
    if (rec.type === "work") {
      doc.appendChild(make("div", "record-subhead", "Work steps"));
      var anyStepPhoto = false;
      if (rec.steps && rec.steps.length) {
        var list = make("div", "record-steps");
        rec.steps.forEach(function (s, i) {
          if (s.photo) anyStepPhoto = true;
          var srow = make("div", "record-step");
          srow.appendChild(make("span", "pod-step-num", "✓"));
          var sbody = make("div", "record-step-body");
          sbody.appendChild(make("div", "record-step-label",
            (s.label && s.label.trim()) ? s.label.trim() : ("Step " + (i + 1))));
          if (s.photo) {
            var sfig = make("figure", "record-photo record-step-photo");
            var simg = document.createElement("img");
            simg.src = s.photo;
            simg.alt = "Step " + (i + 1) + " photo";
            simg.loading = "lazy";
            sfig.appendChild(simg);
            sbody.appendChild(sfig);
          }
          srow.appendChild(sbody);
          list.appendChild(srow);
        });
        doc.appendChild(list);
      }
      if (!anyStepPhoto) {
        doc.appendChild(make("div", "record-meta", "No step photos captured"));
      }
    }

    doc.appendChild(make("div", "record-subhead", L.sigLine));
    if (rec.signature) {
      var sigWrap = make("div", "record-sig");
      var simg = document.createElement("img");
      simg.src = rec.signature;
      simg.alt = "Captured signature";
      sigWrap.appendChild(simg);
      doc.appendChild(sigWrap);
      doc.appendChild(make("div", "record-meta", "Signed by: " + rec.name));
    } else {
      doc.appendChild(make("div", "record-meta", "Signature: not captured"));
    }

    doc.appendChild(make("div", "record-subhead", "Time & location"));
    doc.appendChild(make("div", "record-meta", rec.stampText));
    doc.appendChild(make("div", "record-meta",
      rec.geoShared ? ("GPS " + rec.lat.toFixed(4) + ", " + rec.lon.toFixed(4)) : "Location: not shared"));

    var foot = make("div", "record-foot", "Generated with ProofFlow — proofflow.me");
    doc.appendChild(foot);

    $("record-heading").textContent = L.heading;
    $("record-section").hidden = false;
  }

  /* ---------- storage ---------- */

  function loadRecords() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function persistAll(list) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(list));
      return true;
    } catch (e) { return false; }
  }

  function renderSaved() {
    var list = loadRecords();
    var box = $("saved-list");
    box.innerHTML = "";
    $("saved-empty").hidden = list.length > 0;
    list.forEach(function (rec, i) {
      var row = make("div", "saved-row");
      var info = make("div", "saved-info");
      var top = make("div", "saved-top");
      top.appendChild(make("span", "saved-id", rec.id));
      top.appendChild(make("span", "type-badge", LABELS[rec.type] ? LABELS[rec.type].typeBadge : "Record"));
      info.appendChild(top);
      var sub = rec.name ? rec.name + " — " : "";
      sub += rec.address || "";
      info.appendChild(make("div", "saved-sub", sub));
      info.appendChild(make("div", "saved-time", rec.stampText || ""));
      row.appendChild(info);
      var actions = make("div", "saved-actions");
      var view = make("button", "btn btn-outline btn-sm", "View");
      view.type = "button";
      (function (r) {
        view.addEventListener("click", function () {
          renderRecord(r);
          $("record-section").scrollIntoView({ behavior: "smooth" });
        });
      })(rec);
      var del = make("button", "btn btn-outline btn-sm", "Delete");
      del.type = "button";
      (function (r) {
        del.addEventListener("click", function () {
          if (!window.confirm("Delete record " + r.id + "? This cannot be undone.")) return;
          var all = loadRecords().filter(function (x) { return x.id !== r.id; });
          persistAll(all);
          renderSaved();
        });
      })(rec);
      actions.appendChild(view);
      actions.appendChild(del);
      row.appendChild(actions);
      box.appendChild(row);
    });
  }

  /* ---------- generate / reset ---------- */

  on($("generate-btn"), "click", function () {
    if (!validate()) return;
    if (!state.stamped) {
      var now = new Date();
      state.stampedText = fmtStamp(now);
      state.stamped = true;
      state.geoShared = false;
      $("stamp-line").textContent = "Delivered at: " + state.stampedText +
        ". Location not shared — record will show time only.";
    }
    var rec = {
      id: recordId(),
      type: state.type,
      business: $("pod-business").value.trim(),
      name: $("pod-recipient").value.trim(),
      address: $("pod-address").value.trim(),
      order: $("pod-order").value.trim(),
      items: $("pod-items").value.trim(),
      notes: $("pod-notes").value.trim(),
      driver: $("pod-driver").value.trim(),
      photoGroups: state.type === "work" ? null : { all: state.photos.slice() },
      steps: state.type === "work"
        ? state.steps.map(function (s) { return { label: (s.label || "").trim(), photo: s.photo }; })
        : [],
      signature: state.sigDrawn ? canvas.toDataURL("image/png") : null,
      stampText: state.stampedText,
      geoShared: state.geoShared,
      lat: state.lat, lon: state.lon
    };
    var all = loadRecords();
    all.unshift(rec);
    var saved = persistAll(all);
    $("quota-note").hidden = saved;
    renderRecord(rec);
    renderSaved();
    $("record-section").scrollIntoView({ behavior: "smooth" });
  });

  on($("print-btn"), "click", function () { window.print(); });

  on($("new-record-btn"), "click", function () {
    $("pod-form").reset();
    state.photos = []; state.steps = [];
    renderSteps();
    state.sigDrawn = false;
    state.stampedText = ""; state.lat = null; state.lon = null;
    state.geoShared = false; state.stamped = false;
    sctx.clearRect(0, 0, canvas.width, canvas.height);
    renderPreviews();
    $("stamp-line").textContent = "Not stamped yet.";
    $("sig-echo").textContent = "Signed by: —";
    hideFieldErrors();
    $("quota-note").hidden = true;
    $("record-section").hidden = true;
    $("record").innerHTML = "";
    state.type = "delivery";
    var d = document.querySelector('input[name="record-type"][value="delivery"]');
    if (d) d.checked = true;
    applyType();
    $("tool").scrollIntoView({ behavior: "smooth" });
  });

  /* ---------- init ---------- */

  applyType();
  renderSteps();
  renderSaved();
})();
