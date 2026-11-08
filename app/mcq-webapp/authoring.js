"use strict";
const settings = new URL(location.href);
const tfApp = document.getElementById("tfApp");
if (tfApp) tfApp.hidden = !settings.searchParams.has("tf");
for (const input of document.querySelectorAll("[data-port]")) {
  const key = input.dataset.port;
  if (key === "tf" && tfApp?.hidden) continue;
  const supplied = settings.searchParams.get(key);
  if (supplied && /^\d+$/.test(supplied) && Number(supplied) >= 1024 && Number(supplied) <= 65535) {
    input.value = supplied;
  } else if (key === "mcq" && location.port) {
    input.value = location.port;
  }
  const link = document.querySelector(`[data-app="${key}"]`);
  const update = () => {
    if (!input.checkValidity()) {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      return;
    }
    const destination = new URL("/", location.href);
    destination.port = input.value;
    link.href = destination.href;
    link.removeAttribute("aria-disabled");
    settings.searchParams.set(key, input.value);
    history.replaceState(null, "", settings.href);
  };
  input.addEventListener("input", update);
  update();
}
