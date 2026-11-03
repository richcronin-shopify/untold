(() => {
  if (window.__untoldParksInit) return;
  window.__untoldParksInit = true;

  const JPEG = [0xff, 0xd8, 0xff];
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  function endpointOf(root) {
    return (root.dataset.endpoint || "/apps/parks").replace(/\/$/, "");
  }

  function show(element, message, kind) {
    if (!element) return;
    element.textContent = message || "";
    if (kind) element.dataset.kind = kind;
    else delete element.dataset.kind;
  }

  function redirectToLogin(root) {
    const base = root.dataset.loginUrl || "/account/login";
    const url = new URL(base, location.origin);
    url.searchParams.set("return_url", `${location.pathname}${location.search}`);
    url.searchParams.set("return_to", location.href);
    location.assign(url.toString());
  }

  function setPressed(button, pressed) {
    button.setAttribute("aria-pressed", pressed ? "true" : "false");
    const label = button.querySelector("[data-untold-label]");
    if (!label) return;
    label.textContent = pressed ? label.dataset.on || "" : label.dataset.off || "";
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    return { response, body: await readJson(response) };
  }

  function sniff(bytes) {
    if (JPEG.every((byte, index) => bytes[index] === byte)) return "image/jpeg";
    if (PNG.every((byte, index) => bytes[index] === byte)) return "image/png";
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return "image/webp";
    }
    return "";
  }

  async function headerBase64(file) {
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { mime: sniff(bytes), header: btoa(binary) };
  }

  async function refresh(root) {
    if (root.dataset.loggedIn !== "true" || !root.dataset.parkHandle) return;
    if (!root.querySelector("[data-untold-action]")) return;
    try {
      const response = await fetch(
        `${endpointOf(root)}/state?handle=${encodeURIComponent(root.dataset.parkHandle)}`,
        { headers: { accept: "application/json" }, cache: "no-store" },
      );
      const body = await readJson(response);
      if (!response.ok || !body || !body.loggedIn) return;
      const favourite = root.querySelector('[data-untold-action="favourite"]');
      const ridden = root.querySelector('[data-untold-action="ridden"]');
      if (favourite) setPressed(favourite, Boolean(body.favourite));
      if (ridden) setPressed(ridden, Boolean(body.ridden));
    } catch {
      /* Keep the state rendered by the theme. */
    }
  }

  function bindToggles(root) {
    const status = root.querySelector("[data-untold-action-status]");
    root.querySelectorAll("[data-untold-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (root.dataset.loggedIn !== "true") {
          show(status, "Taking you to sign in…", "ok");
          redirectToLogin(root);
          return;
        }
        if (button.disabled) return;
        const previous = button.getAttribute("aria-pressed") === "true";
        const action = button.dataset.untoldAction;
        setPressed(button, !previous);
        button.disabled = true;
        show(status, "", "");
        try {
          const { response, body } = await postJson(`${endpointOf(root)}/${action}`, {
            handle: root.dataset.parkHandle,
          });
          if (body && body.code === "login_required") {
            setPressed(button, previous);
            redirectToLogin(root);
            return;
          }
          if (!response.ok || !body || body.ok === false) {
            setPressed(button, previous);
            show(status, (body && body.error) || "That park couldn't be saved. Please try again.", "error");
            return;
          }
          const pressed = action === "favourite" ? body.favourite : body.ridden;
          setPressed(button, Boolean(pressed));
          show(status, pressed ? "Saved." : "Removed.", "ok");
        } catch {
          setPressed(button, previous);
          show(status, "That park couldn't be saved. Please try again.", "error");
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  async function uploadCover(root, file, status) {
    const sniffed = await headerBase64(file);
    if (!sniffed.mime || file.size < 1 || file.size > 5 * 1024 * 1024) {
      show(status, "Use a JPEG, PNG, or WebP photo up to 5 MB.", "error");
      return null;
    }
    show(status, "Uploading photo…", "");
    const staged = await postJson(`${endpointOf(root)}/events/upload-target`, {
      filename: file.name,
      mimeType: sniffed.mime,
      byteSize: file.size,
      headerBase64: sniffed.header,
    });
    if (staged.body && staged.body.code === "login_required") {
      redirectToLogin(root);
      return null;
    }
    if (!staged.response.ok || !staged.body || !staged.body.upload) {
      show(status, (staged.body && staged.body.error) || "The photo couldn't be uploaded.", "error");
      return null;
    }
    const upload = staged.body.upload;
    let uploadHost = "";
    try {
      const parsed = new URL(upload.url);
      if (parsed.protocol === "https:") uploadHost = parsed.hostname;
    } catch {
      uploadHost = "";
    }
    if (!/(^|\.)(googleapis\.com|shopify\.com|shopifycdn\.com)$/.test(uploadHost)) {
      show(status, "The photo couldn't be uploaded.", "error");
      return null;
    }
    const form = new FormData();
    for (const parameter of upload.parameters || []) form.append(parameter.name, parameter.value);
    form.append("file", file, file.name);
    const sent = await fetch(upload.url, { method: "POST", body: form, credentials: "omit" });
    if (!sent.ok) {
      show(status, "The photo couldn't be uploaded. Try a smaller JPEG, PNG, or WebP.", "error");
      return null;
    }
    return upload.resourceUrl;
  }

  function bindForm(root) {
    const toggle = root.querySelector("[data-untold-event-toggle]");
    const form = root.querySelector("[data-untold-event-form]");
    const panel = root.querySelector("[data-untold-event-panel]") || form;
    const wrap = root.querySelector("[data-untold-event]");
    if (!toggle || !panel) return;
    toggle.addEventListener("click", () => {
      const open = panel.hasAttribute("hidden");
      if (open) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (wrap) wrap.classList.toggle("is-open", open);
      if (open) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        panel.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
        const first = panel.querySelector("input:not([tabindex='-1']), textarea, select, a");
        if (first) first.focus({ preventScroll: true });
      }
    });
    if (!form) return;
    const status = form.querySelector("[data-untold-form-status]");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (root.dataset.loggedIn !== "true") {
        redirectToLogin(root);
        return;
      }
      const submit = form.querySelector("[data-untold-submit]");
      if (submit && submit.disabled) return;
      const data = new FormData(form);
      const payload = {
        handle: root.dataset.parkHandle,
        title: String(data.get("title") || ""),
        eventType: String(data.get("eventType") || ""),
        description: String(data.get("description") || ""),
        organiser: String(data.get("organiser") || ""),
        link: String(data.get("link") || ""),
        priceNote: String(data.get("priceNote") || ""),
        notes: String(data.get("notes") || ""),
        start: String(data.get("start") || ""),
        end: String(data.get("end") || ""),
        untold_leave_blank: String(data.get("untold_leave_blank") || ""),
      };
      if (submit) submit.disabled = true;
      show(status, "", "");
      try {
        const fileInput = form.querySelector('input[type="file"]');
        const file = fileInput && fileInput.files && fileInput.files[0];
        if (file) {
          const resourceUrl = await uploadCover(root, file, status);
          if (!resourceUrl) return;
          payload.resourceUrl = resourceUrl;
        }
        show(status, "Sending event…", "");
        const { response, body } = await postJson(`${endpointOf(root)}/events`, payload);
        if (body && body.code === "login_required") {
          redirectToLogin(root);
          return;
        }
        if (!response.ok || !body || body.ok === false) {
          show(status, (body && body.error) || "The event couldn't be sent. Please try again.", "error");
          return;
        }
        show(status, body.message || "Thanks. This will appear on the park page once it's approved.", "ok");
        form.querySelectorAll("input, textarea, select, button").forEach((control) => {
          if (control !== submit) control.disabled = true;
        });
        if (submit) submit.hidden = true;
      } catch {
        show(status, "The event couldn't be sent. Please try again.", "error");
      } finally {
        if (submit && !submit.hidden) submit.disabled = false;
      }
    });
  }

  function boot() {
    document.querySelectorAll("[data-untold-parks]").forEach((root) => {
      refresh(root);
      bindToggles(root);
      bindForm(root);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
