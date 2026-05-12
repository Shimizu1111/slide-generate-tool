import PptxGenJS from "pptxgenjs";

// Execute pptxgenjs code and capture slide definitions for preview
export async function generatePptx(code) {
  const pres = new PptxGenJS();
  const slides = [];

  // Monkey-patch addSlide to capture definitions
  const originalAddSlide = pres.addSlide.bind(pres);
  pres.addSlide = (opts) => {
    const slide = originalAddSlide(opts);
    const slideData = { shapes: [], background: null };
    slides.push(slideData);

    // Capture addText
    const origAddText = slide.addText.bind(slide);
    slide.addText = (textOrArr, opts = {}) => {
      const text = Array.isArray(textOrArr)
        ? textOrArr.map((t) => (typeof t === "string" ? t : t.text || "")).join("")
        : textOrArr;
      slideData.shapes.push({
        type: "text",
        text,
        x: opts.x || 0,
        y: opts.y || 0,
        w: opts.w,
        h: opts.h,
        fontSize: opts.fontSize,
        fontFace: opts.fontFace,
        color: opts.color,
        bold: opts.bold,
        italic: opts.italic,
        align: opts.align,
        valign: opts.valign,
        fill: opts.fill?.color,
      });
      return origAddText(textOrArr, opts);
    };

    // Capture addShape
    const origAddShape = slide.addShape.bind(slide);
    slide.addShape = (shapeType, opts = {}) => {
      slideData.shapes.push({
        type: "shape",
        x: opts.x || 0,
        y: opts.y || 0,
        w: opts.w,
        h: opts.h,
        fill: opts.fill?.color,
        line: opts.line?.color,
      });
      return origAddShape(shapeType, opts);
    };

    // Capture background via proxy
    const origBgDescriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(slide),
      "background"
    );
    Object.defineProperty(slide, "background", {
      set(val) {
        slideData.background = val?.fill || null;
        if (origBgDescriptor?.set) origBgDescriptor.set.call(slide, val);
      },
      get() {
        return origBgDescriptor?.get?.call(slide);
      },
    });

    return slide;
  };

  // Execute the AI-generated code
  const fn = new Function("pres", code);
  fn(pres);

  return { pres, slides };
}

export async function downloadPptx(pres) {
  await pres.writeFile({ fileName: "slide-output.pptx" });
}
