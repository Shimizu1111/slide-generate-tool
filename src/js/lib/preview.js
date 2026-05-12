export const slidePreview = {
  render(container, slides) {
    container.innerHTML = "";

    if (!slides || slides.length === 0) {
      container.innerHTML = '<div class="text-gray-500 text-center py-8">スライドがありません</div>';
      return;
    }

    // Slide navigation
    if (slides.length > 1) {
      const nav = document.createElement("div");
      nav.className = "flex items-center gap-2 mb-4";
      nav.innerHTML = `
        <button id="prev-slide" class="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm disabled:opacity-30" disabled>←</button>
        <span class="text-sm text-gray-400" id="slide-counter">1 / ${slides.length}</span>
        <button id="next-slide" class="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm" ${slides.length <= 1 ? "disabled" : ""}>→</button>
      `;
      container.appendChild(nav);

      let currentIndex = 0;
      const slideEl = document.createElement("div");
      slideEl.className = "slide-preview";
      container.appendChild(slideEl);
      this.renderSingle(slideEl, slides[0]);

      const prevBtn = nav.querySelector("#prev-slide");
      const nextBtn = nav.querySelector("#next-slide");
      const counter = nav.querySelector("#slide-counter");

      const updateNav = () => {
        counter.textContent = `${currentIndex + 1} / ${slides.length}`;
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex === slides.length - 1;
        this.renderSingle(slideEl, slides[currentIndex]);
      };

      prevBtn.addEventListener("click", () => { currentIndex--; updateNav(); });
      nextBtn.addEventListener("click", () => { currentIndex++; updateNav(); });
    } else {
      const slideEl = document.createElement("div");
      slideEl.className = "slide-preview";
      container.appendChild(slideEl);
      this.renderSingle(slideEl, slides[0]);
    }
  },

  renderSingle(el, slide) {
    el.style.background = slide.background ? `#${slide.background}` : "white";
    el.innerHTML = "";

    if (!slide.shapes) return;

    const containerWidth = el.offsetWidth || 400;
    const containerHeight = el.offsetHeight || 225;
    // Standard slide is 10" x 5.63" (16:9)
    const scaleX = containerWidth / 10;
    const scaleY = containerHeight / 5.63;

    slide.shapes.forEach((shape) => {
      const div = document.createElement("div");
      div.style.position = "absolute";
      div.style.left = `${(shape.x || 0) * scaleX}px`;
      div.style.top = `${(shape.y || 0) * scaleY}px`;
      div.style.width = shape.w ? `${shape.w * scaleX}px` : "auto";
      div.style.height = shape.h ? `${shape.h * scaleY}px` : "auto";
      div.style.overflow = "hidden";

      if (shape.type === "shape" || shape.type === "rect") {
        div.style.backgroundColor = shape.fill ? `#${shape.fill}` : "transparent";
        if (shape.line) {
          div.style.border = `1px solid #${shape.line}`;
        }
        if (shape.borderRadius) {
          div.style.borderRadius = `${shape.borderRadius}px`;
        }
      }

      if (shape.text !== undefined) {
        div.style.fontSize = shape.fontSize ? `${shape.fontSize * (scaleX / 10) * 1.2}px` : `${scaleX * 1.2}px`;
        div.style.fontFamily = shape.fontFace || "sans-serif";
        div.style.color = shape.color ? `#${shape.color}` : (slide.background && isLightColor(slide.background) ? "#000" : "#333");
        div.style.fontWeight = shape.bold ? "bold" : "normal";
        div.style.fontStyle = shape.italic ? "italic" : "normal";
        div.style.textAlign = shape.align || "left";
        div.style.display = "flex";
        div.style.alignItems = shape.valign === "bottom" ? "flex-end" : shape.valign === "middle" ? "center" : "flex-start";
        div.style.whiteSpace = "pre-wrap";
        div.style.lineHeight = "1.3";
        div.style.padding = "2px 4px";

        const textSpan = document.createElement("span");
        textSpan.style.width = "100%";
        textSpan.textContent = shape.text;
        div.appendChild(textSpan);
      }

      el.appendChild(div);
    });
  },
};

function isLightColor(hex) {
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}
