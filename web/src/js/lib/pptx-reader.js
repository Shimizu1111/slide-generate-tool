// Parse PPTX (ZIP/XML) to extract slide structure for preview and cloning
// Uses JSZip loaded from CDN or bundled

export async function parsePptx(arrayBuffer) {
  // Dynamically load JSZip if not available
  if (!window.JSZip) {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
  }

  const zip = await JSZip.loadAsync(arrayBuffer);
  const result = {
    slides: [],
    slideWidth: 10, // inches (default 16:9)
    slideHeight: 5.63,
  };

  // Parse presentation.xml for slide size
  const presXml = await readXml(zip, "ppt/presentation.xml");
  if (presXml) {
    const sldSz = presXml.querySelector("sldSz");
    if (sldSz) {
      result.slideWidth = emuToInches(parseInt(sldSz.getAttribute("cx") || "9144000"));
      result.slideHeight = emuToInches(parseInt(sldSz.getAttribute("cy") || "5143500"));
    }
  }

  // Find all slide files
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)[1]);
      const numB = parseInt(b.match(/slide(\d+)/)[1]);
      return numA - numB;
    });

  for (const slideFile of slideFiles) {
    const slideXml = await readXml(zip, slideFile);
    if (!slideXml) continue;

    const slideData = { shapes: [], background: null };

    // Parse background
    const bgFill = slideXml.querySelector("bg > bgPr > solidFill > srgbClr");
    if (bgFill) {
      slideData.background = bgFill.getAttribute("val");
    }

    // Parse shapes (sp elements)
    const shapes = slideXml.querySelectorAll("spTree > sp");
    shapes.forEach((sp, idx) => {
      const shape = parseShape(sp, idx);
      if (shape) slideData.shapes.push(shape);
    });

    result.slides.push(slideData);
  }

  return result;
}

function parseShape(sp, idx) {
  const nvSpPr = sp.querySelector("nvSpPr");
  const name = nvSpPr?.querySelector("cNvPr")?.getAttribute("name") || `Shape ${idx + 1}`;

  // Position and size
  const off = sp.querySelector("spPr > xfrm > off");
  const ext = sp.querySelector("spPr > xfrm > ext");

  const x = off ? emuToInches(parseInt(off.getAttribute("x") || "0")) : 0;
  const y = off ? emuToInches(parseInt(off.getAttribute("y") || "0")) : 0;
  const w = ext ? emuToInches(parseInt(ext.getAttribute("cx") || "0")) : undefined;
  const h = ext ? emuToInches(parseInt(ext.getAttribute("cy") || "0")) : undefined;

  // Fill
  const solidFill = sp.querySelector("spPr > solidFill > srgbClr");
  const fill = solidFill?.getAttribute("val") || undefined;

  // Text
  const txBody = sp.querySelector("txBody");
  let text = undefined;
  let fontSize = undefined;
  let fontFace = undefined;
  let color = undefined;
  let bold = false;
  let align = undefined;

  if (txBody) {
    const paragraphs = txBody.querySelectorAll("p");
    const textParts = [];
    paragraphs.forEach((p) => {
      const runs = p.querySelectorAll("r");
      runs.forEach((r) => {
        const t = r.querySelector("t");
        if (t) textParts.push(t.textContent);

        // Get font properties from first run
        if (!fontSize) {
          const rPr = r.querySelector("rPr");
          if (rPr) {
            const sz = rPr.getAttribute("sz");
            if (sz) fontSize = parseInt(sz) / 100;
            bold = rPr.getAttribute("b") === "1";
            const clr = rPr.querySelector("solidFill > srgbClr");
            if (clr) color = clr.getAttribute("val");
            const latin = rPr.querySelector("latin");
            if (latin) fontFace = latin.getAttribute("typeface");
          }
        }
      });

      // Alignment
      const pPr = p.querySelector("pPr");
      if (pPr && !align) {
        align = pPr.getAttribute("algn");
        if (align === "ctr") align = "center";
        else if (align === "r") align = "right";
        else if (align === "l") align = "left";
      }
    });
    text = textParts.join("\n");
  }

  if (text === undefined && !fill) return null;

  return {
    id: idx,
    name,
    type: text !== undefined ? "text" : "shape",
    x, y, w, h,
    text, fontSize, fontFace, color, bold, align, fill,
  };
}

async function readXml(zip, path) {
  const file = zip.file(path);
  if (!file) return null;
  const text = await file.async("string");
  return new DOMParser().parseFromString(text, "application/xml");
}

function emuToInches(emu) {
  return Math.round((emu / 914400) * 100) / 100;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
