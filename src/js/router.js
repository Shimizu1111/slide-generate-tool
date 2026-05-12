import { renderCapturePage } from "./pages/capture.js";
import { renderGeneratePage } from "./pages/generate.js";

const pages = {
  capture: { render: renderCapturePage, label: "デザインキャプチャ" },
  generate: { render: renderGeneratePage, label: "スライド生成" },
};

function getPageFromHash() {
  const hash = location.hash.replace("#", "") || "capture";
  return pages[hash] ? hash : "capture";
}

function navigate(pageName) {
  const main = document.getElementById("main-content");
  main.innerHTML = "";

  // Update nav active state
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.page === pageName);
  });

  const page = pages[pageName];
  if (page) {
    page.render(main);
  }
}

export const router = {
  init() {
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        location.hash = page;
        navigate(page);
      });
    });

    window.addEventListener("hashchange", () => {
      navigate(getPageFromHash());
    });

    navigate(getPageFromHash());
  },
};
