export const slidePreview = {
  render(container, slides) {
    container.innerHTML = "";

    if (!slides || slides.length === 0) {
      container.innerHTML = '<div class="text-gray-500 text-center py-8">No slides</div>';
      return;
    }

    if (slides.length > 1) {
      const nav = document.createElement("div");
      nav.className = "flex items-center gap-2 mb-4";
      nav.innerHTML = `
        <button class="prev-slide px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm disabled:opacity-30" disabled>&larr;</button>
        <span class="text-sm text-gray-400 slide-counter">1 / ${slides.length}</span>
        <button class="next-slide px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm">&rarr;</button>
      `;
      container.appendChild(nav);

      let currentIndex = 0;
      const slideEl = document.createElement("div");
      slideEl.className = "slide-preview";
      container.appendChild(slideEl);

      const prevBtn = nav.querySelector(".prev-slide");
      const nextBtn = nav.querySelector(".next-slide");
      const counter = nav.querySelector(".slide-counter");

      const updateNav = () => {
        counter.textContent = `${currentIndex + 1} / ${slides.length}`;
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex === slides.length - 1;
        this.renderSingle(slideEl, slides[currentIndex]);
      };

      prevBtn.addEventListener("click", () => { currentIndex--; updateNav(); });
      nextBtn.addEventListener("click", () => { currentIndex++; updateNav(); });

      // Use requestAnimationFrame so the element has layout before first render
      requestAnimationFrame(() => this.renderSingle(slideEl, slides[0]));
    } else {
      const slideEl = document.createElement("div");
      slideEl.className = "slide-preview";
      container.appendChild(slideEl);
      requestAnimationFrame(() => this.renderSingle(slideEl, slides[0]));
    }
  },

  renderSingle(el, slide) {
    el.style.background = slide.background ? `#${slide.background}` : "white";
    el.innerHTML = "";

    if (!slide.shapes) return;

    // Fallback to reasonable defaults if element has no layout yet
    const containerWidth = el.offsetWidth || 400;
    const containerHeight = el.offsetHeight || (containerWidth * 9 / 16);
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
        const st = shape.shapeType || "rect";
        const lineW = shape.lineWidth ? Math.max(1, shape.lineWidth) : 1;

        if (st === "line") {
          // Render line as a thin bordered div
          div.style.backgroundColor = "transparent";
          div.style.borderTop = `${lineW}px ${shape.lineDash === "dash" ? "dashed" : shape.lineDash === "dot" ? "dotted" : "solid"} #${shape.line || "000000"}`;
          div.style.height = "0px";
        } else if (st === "ellipse") {
          div.style.borderRadius = "50%";
          div.style.backgroundColor = shape.fill ? `#${shape.fill}` : "transparent";
          if (shape.fillTransparency) {
            div.style.opacity = `${1 - shape.fillTransparency / 100}`;
          }
          if (shape.line) {
            div.style.border = `${lineW}px solid #${shape.line}`;
          }
        } else {
          // rect, roundRect, triangle, etc.
          div.style.backgroundColor = shape.fill ? `#${shape.fill}` : "transparent";
          if (shape.fillTransparency) {
            div.style.opacity = `${1 - shape.fillTransparency / 100}`;
          }
          if (shape.line) {
            div.style.border = `${lineW}px ${shape.lineDash === "dash" ? "dashed" : shape.lineDash === "dot" ? "dotted" : "solid"} #${shape.line}`;
          }
          if (shape.rectRadius || shape.borderRadius) {
            div.style.borderRadius = `${shape.rectRadius || shape.borderRadius}px`;
          }
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

        if (shape.fill) {
          div.style.backgroundColor = `#${shape.fill}`;
        }

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
