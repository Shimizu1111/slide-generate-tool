import { chatUI } from "../lib/chat.js";
import { slidePreview } from "../lib/preview.js";
import { parsePptx } from "../lib/pptx-reader.js";
import { generatePptx, downloadPptx } from "../lib/pptx-builder.js";
import { listTemplates, deleteTemplate } from "../lib/template-store.js";

const SYSTEM_PROMPT = `あなたはスライド生成の専門家です。
ユーザーの要望に基づいて、テンプレートのデザインを使ってスライドを生成します。

テンプレートの構造情報が提供されます。そのデザイン（レイアウト、色、フォント）を忠実に使いながら、
ユーザーが指定するコンテンツでスライドを作成してください。

ルール:
1. 変数名は pres (PptxGenJSインスタンス) を使う。presは既に作成済み。
2. テンプレートのデザイン（色、フォント、レイアウト）を忠実に再現する
3. ユーザーの指示に従ってコンテンツを配置する
4. 日本語フォントは "Meiryo" または "Yu Gothic" を使う
5. 座標・サイズはインチ単位

応答はJSON形式で:
{
  "message": "説明メッセージ",
  "code": "// pptxgenjsコード"
}`;

let state = {
  templates: [],
  selectedTemplate: null,
  templateInfo: null,
  mode: "form",
  composition: [],
  messages: [],
  pres: null,
  outputSlides: [],
};

export function renderGeneratePage(container) {
  state = {
    templates: [],
    selectedTemplate: null,
    templateInfo: null,
    mode: "form",
    composition: [],
    messages: [],
    pres: null,
    outputSlides: [],
  };

  container.innerHTML = `
    <div class="flex h-screen">
      <!-- Left: Template Selection -->
      <div class="w-1/2 flex flex-col border-r border-gray-800">
        <div class="p-4 border-b border-gray-800">
          <h2 class="text-lg font-semibold">スライド生成</h2>
          <p class="text-sm text-gray-400 mt-1">テンプレートを選んでスライドを生成</p>
        </div>
        <div id="template-list" class="p-4 border-b border-gray-800">
          <div class="text-gray-500 text-sm">テンプレートを読み込み中...</div>
        </div>
        <div id="slide-gallery" class="p-4 overflow-auto flex-1">
          <div class="flex items-center justify-center h-48 text-gray-500">
            テンプレートを選択してください
          </div>
        </div>
      </div>
      <!-- Right: Mode Switch + Content -->
      <div class="w-1/2 flex flex-col">
        <div class="p-4 border-b border-gray-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-semibold">コンテンツ</h2>
            <div class="flex bg-gray-800 rounded-lg p-0.5">
              <button id="mode-form" class="mode-btn px-3 py-1.5 rounded-md text-xs font-medium transition-colors active">フォーム</button>
              <button id="mode-chat" class="mode-btn px-3 py-1.5 rounded-md text-xs font-medium transition-colors">チャット</button>
            </div>
          </div>
          <div class="flex gap-2">
            <button id="gen-preview-btn" class="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled>
              生成
            </button>
            <button id="gen-download-btn" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled>
              DL
            </button>
          </div>
        </div>
        <!-- Form Mode -->
        <div id="form-mode" class="flex-1 flex flex-col overflow-auto">
          <div id="composition" class="p-4 overflow-auto flex-1">
            <div class="flex items-center justify-center h-48 text-gray-500">
              左のギャラリーからスライドを追加してください
            </div>
          </div>
          <div id="output-preview" class="border-t border-gray-800 p-4 hidden">
            <h3 class="text-sm font-medium text-gray-400 mb-3">出力プレビュー</h3>
            <div id="output-slides"></div>
          </div>
        </div>
        <!-- Chat Mode -->
        <div id="chat-mode" class="flex-1 flex flex-col min-h-0 hidden">
          <div id="gen-chat" class="flex-1 flex flex-col min-h-0"></div>
          <div id="chat-output-preview" class="border-t border-gray-800 p-4 hidden">
            <h3 class="text-sm font-medium text-gray-400 mb-3">出力プレビュー</h3>
            <div id="chat-output-slides"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const previewBtn = container.querySelector("#gen-preview-btn");
  const downloadBtn = container.querySelector("#gen-download-btn");
  const modeForm = container.querySelector("#mode-form");
  const modeChat = container.querySelector("#mode-chat");
  const genChat = container.querySelector("#gen-chat");

  chatUI.init(genChat, handleChatMessage);

  modeForm.addEventListener("click", () => switchMode("form"));
  modeChat.addEventListener("click", () => switchMode("chat"));

  previewBtn.addEventListener("click", handleFormGenerate);
  downloadBtn.addEventListener("click", async () => {
    if (state.pres) await downloadPptx(state.pres);
  });

  loadTemplates();
}

async function loadTemplates() {
  const templateListEl = document.getElementById("template-list");
  try {
    state.templates = await listTemplates();

    if (state.templates.length === 0) {
      templateListEl.innerHTML = `
        <div class="text-gray-500 text-sm">
          <p>保存済みテンプレートがありません。</p>
          <p class="mt-1">先に「デザインキャプチャ」でテンプレートを作成・保存してください。</p>
          <div class="mt-3 border-t border-gray-800 pt-3">
            <label class="block">
              <span class="text-xs text-gray-400">または PPTX を直接アップロード:</span>
              <input type="file" id="fallback-upload" accept=".pptx"
                class="mt-1 block w-full text-sm text-gray-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600 file:cursor-pointer" />
            </label>
          </div>
        </div>
      `;
      const fallbackInput = templateListEl.querySelector("#fallback-upload");
      fallbackInput.addEventListener("change", handleFallbackUpload);
      return;
    }

    templateListEl.innerHTML = `
      <div class="space-y-2">
        ${state.templates
          .map(
            (t) => `
          <div class="template-item flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-700 transition-colors" data-id="${t.id}">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate">${escapeHtml(t.name)}</div>
              <div class="text-xs text-gray-500">${new Date(t.createdAt).toLocaleString("ja-JP")} / ${t.slides.length}枚</div>
            </div>
            <button class="delete-template ml-2 px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded" data-id="${t.id}">削除</button>
          </div>
        `
          )
          .join("")}
      </div>
      <div class="mt-3 border-t border-gray-800 pt-3">
        <label class="block">
          <span class="text-xs text-gray-400">PPTX を直接アップロード:</span>
          <input type="file" id="fallback-upload" accept=".pptx"
            class="mt-1 block w-full text-sm text-gray-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600 file:cursor-pointer" />
        </label>
      </div>
    `;

    // Template selection
    templateListEl.querySelectorAll(".template-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target.classList.contains("delete-template")) return;
        const id = parseInt(item.dataset.id);
        selectTemplate(id);
        templateListEl.querySelectorAll(".template-item").forEach((el) =>
          el.classList.toggle("ring-2", parseInt(el.dataset.id) === id)
        );
        templateListEl.querySelectorAll(".template-item").forEach((el) =>
          el.classList.toggle("ring-blue-500", parseInt(el.dataset.id) === id)
        );
      });
    });

    // Delete buttons
    templateListEl.querySelectorAll(".delete-template").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        await deleteTemplate(id);
        loadTemplates();
      });
    });

    // Fallback upload
    const fallbackInput = templateListEl.querySelector("#fallback-upload");
    if (fallbackInput) {
      fallbackInput.addEventListener("change", handleFallbackUpload);
    }
  } catch (err) {
    templateListEl.innerHTML = `<div class="text-red-400 text-sm">読み込みエラー: ${err.message}</div>`;
  }
}

async function selectTemplate(id) {
  const template = state.templates.find((t) => t.id === id);
  if (!template) return;

  state.selectedTemplate = template;
  state.composition = [];
  state.messages = [];

  // Parse the pptx binary to get structure
  try {
    state.templateInfo = await parsePptx(template.pptxBinary);
  } catch {
    // Fall back to stored slide definitions
    state.templateInfo = { slides: template.slides, slideWidth: 10, slideHeight: 5.63 };
  }

  renderGallery(state.templateInfo);
  renderComposition();
}

async function handleFallbackUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const gallery = document.getElementById("slide-gallery");
  gallery.innerHTML = '<div class="flex items-center justify-center h-48"><div class="spinner"></div></div>';

  try {
    const arrayBuffer = await file.arrayBuffer();
    state.templateInfo = await parsePptx(arrayBuffer);
    state.selectedTemplate = { name: file.name };
    state.composition = [];
    renderGallery(state.templateInfo);
  } catch (err) {
    gallery.innerHTML = `<div class="text-red-400 p-4">解析エラー: ${err.message}</div>`;
  }
}

function switchMode(mode) {
  state.mode = mode;
  const formEl = document.getElementById("form-mode");
  const chatEl = document.getElementById("chat-mode");
  const formBtn = document.getElementById("mode-form");
  const chatBtn = document.getElementById("mode-chat");

  if (mode === "form") {
    formEl.classList.remove("hidden");
    chatEl.classList.add("hidden");
    formBtn.classList.add("active");
    chatBtn.classList.remove("active");
  } else {
    formEl.classList.add("hidden");
    chatEl.classList.remove("hidden");
    formBtn.classList.remove("active");
    chatBtn.classList.add("active");
  }
}

function renderGallery(info) {
  const gallery = document.getElementById("slide-gallery");
  gallery.innerHTML = `
    <p class="text-sm text-gray-400 mb-3">${info.slides.length} スライド検出</p>
    <div class="grid grid-cols-2 gap-3" id="gallery-grid"></div>
  `;

  const grid = gallery.querySelector("#gallery-grid");
  info.slides.forEach((slide, i) => {
    const card = document.createElement("div");
    card.className = "bg-gray-800 rounded-lg p-2 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all";
    card.innerHTML = `
      <div class="slide-preview mb-2 text-xs" style="height: 100px;"></div>
      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-400">スライド ${i + 1}</span>
        <button class="add-slide-btn px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium">追加</button>
      </div>
    `;

    const previewEl = card.querySelector(".slide-preview");
    requestAnimationFrame(() => slidePreview.renderSingle(previewEl, slide));

    card.querySelector(".add-slide-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      addToComposition(i, slide);
    });

    grid.appendChild(card);
  });
}

function addToComposition(slideIndex, slideInfo) {
  const placeholders = {};
  if (slideInfo.shapes) {
    slideInfo.shapes.forEach((shape) => {
      if (shape.text !== undefined) {
        placeholders[shape.name || `shape_${shape.id}`] = shape.text;
      }
    });
  }

  state.composition.push({
    id: Date.now(),
    slideIndex,
    placeholders,
  });

  renderComposition();
  document.getElementById("gen-preview-btn").disabled = false;
}

function renderComposition() {
  const comp = document.getElementById("composition");
  if (state.composition.length === 0) {
    comp.innerHTML = '<div class="flex items-center justify-center h-48 text-gray-500">左のギャラリーからスライドを追加してください</div>';
    return;
  }

  comp.innerHTML = "";
  state.composition.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "bg-gray-800 rounded-lg p-4 mb-3";
    card.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-medium">スライド ${idx + 1} (テンプレ #${item.slideIndex + 1})</span>
        <div class="flex gap-1">
          ${idx > 0 ? `<button class="move-up px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">↑</button>` : ""}
          ${idx < state.composition.length - 1 ? `<button class="move-down px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">↓</button>` : ""}
          <button class="remove px-2 py-1 bg-red-600/50 hover:bg-red-600 rounded text-xs">削除</button>
        </div>
      </div>
      <div class="space-y-2 placeholder-fields"></div>
    `;

    const phContainer = card.querySelector(".placeholder-fields");
    Object.entries(item.placeholders).forEach(([key, value]) => {
      const field = document.createElement("div");
      field.innerHTML = `
        <label class="text-xs text-gray-400">${escapeHtml(key)}</label>
        <textarea class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1 resize-none"
          rows="2" data-key="${escapeHtml(key)}">${escapeHtml(value)}</textarea>
      `;
      field.querySelector("textarea").addEventListener("input", (e) => {
        item.placeholders[key] = e.target.value;
      });
      phContainer.appendChild(field);
    });

    card.querySelector(".remove")?.addEventListener("click", () => {
      state.composition.splice(idx, 1);
      renderComposition();
      if (state.composition.length === 0) {
        document.getElementById("gen-preview-btn").disabled = true;
      }
    });
    card.querySelector(".move-up")?.addEventListener("click", () => {
      [state.composition[idx - 1], state.composition[idx]] = [state.composition[idx], state.composition[idx - 1]];
      renderComposition();
    });
    card.querySelector(".move-down")?.addEventListener("click", () => {
      [state.composition[idx], state.composition[idx + 1]] = [state.composition[idx + 1], state.composition[idx]];
      renderComposition();
    });

    comp.appendChild(card);
  });
}

async function handleFormGenerate() {
  if (!state.templateInfo || state.composition.length === 0) return;

  const outputSection = document.getElementById("output-preview");
  const outputSlides = document.getElementById("output-slides");
  outputSection.classList.remove("hidden");
  outputSlides.innerHTML = '<div class="flex items-center justify-center py-8"><div class="spinner"></div></div>';

  try {
    let code = "";
    state.composition.forEach((item) => {
      const slide = state.templateInfo.slides[item.slideIndex];
      code += `{\n  const slide = pres.addSlide();\n`;

      if (slide.background) {
        code += `  slide.background = { fill: "${slide.background}" };\n`;
      }

      if (slide.shapes) {
        slide.shapes.forEach((shape) => {
          const text = item.placeholders[shape.name || `shape_${shape.id}`] || shape.text || "";
          if (shape.type === "text" || shape.text !== undefined) {
            const opts = [];
            if (shape.x !== undefined) opts.push(`x: ${shape.x}`);
            if (shape.y !== undefined) opts.push(`y: ${shape.y}`);
            if (shape.w !== undefined) opts.push(`w: ${shape.w}`);
            if (shape.h !== undefined) opts.push(`h: ${shape.h}`);
            if (shape.fontSize) opts.push(`fontSize: ${shape.fontSize}`);
            if (shape.fontFace) opts.push(`fontFace: "${shape.fontFace}"`);
            if (shape.color) opts.push(`color: "${shape.color}"`);
            if (shape.bold) opts.push(`bold: true`);
            if (shape.align) opts.push(`align: "${shape.align}"`);
            if (shape.fill) opts.push(`fill: { color: "${shape.fill}" }`);
            code += `  slide.addText(${JSON.stringify(text)}, { ${opts.join(", ")} });\n`;
          } else if (shape.type === "shape") {
            const opts = [];
            if (shape.x !== undefined) opts.push(`x: ${shape.x}`);
            if (shape.y !== undefined) opts.push(`y: ${shape.y}`);
            if (shape.w !== undefined) opts.push(`w: ${shape.w}`);
            if (shape.h !== undefined) opts.push(`h: ${shape.h}`);
            if (shape.fill) opts.push(`fill: { color: "${shape.fill}" }`);
            if (shape.line) opts.push(`line: { color: "${shape.line}" }`);
            code += `  slide.addShape(pres.ShapeType.rect, { ${opts.join(", ")} });\n`;
          }
        });
      }
      code += `}\n`;
    });

    const { pres, slides } = await generatePptx(code);
    state.pres = pres;
    state.outputSlides = slides;
    slidePreview.render(outputSlides, slides);
    document.getElementById("gen-download-btn").disabled = false;
  } catch (err) {
    outputSlides.innerHTML = `<div class="text-red-400 p-4">生成エラー: ${err.message}</div>`;
  }
}

async function handleChatMessage(userMessage) {
  if (!state.templateInfo) {
    chatUI.addMessage("assistant", "先にテンプレートを選択してください。");
    return;
  }

  const isFirst = state.messages.length === 0;
  const content = isFirst
    ? `以下のテンプレートのデザインを使って、ユーザーの指示に従ってスライドを生成してください。

テンプレート構造:
${JSON.stringify(state.templateInfo, null, 2)}

ユーザーの指示: ${userMessage}`
    : userMessage;

  state.messages.push({ role: "user", content });

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: state.messages.map((m) => ({ role: m.role, content: m.content })),
        system: SYSTEM_PROMPT,
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const responseContent = data.content || "";

    let parsed;
    try {
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { message: responseContent };
    } catch {
      parsed = { message: responseContent };
    }

    const assistantMessage = parsed.message || "スライドを生成しました。";
    state.messages.push({ role: "assistant", content: assistantMessage });
    chatUI.addMessage("assistant", assistantMessage);

    if (parsed.code) {
      const chatOutputSection = document.getElementById("chat-output-preview");
      const chatOutputSlides = document.getElementById("chat-output-slides");
      chatOutputSection.classList.remove("hidden");

      const { pres, slides } = await generatePptx(parsed.code);
      state.pres = pres;
      state.outputSlides = slides;
      slidePreview.render(chatOutputSlides, slides);
      document.getElementById("gen-download-btn").disabled = false;
    }
  } catch (err) {
    chatUI.addMessage("assistant", `エラー: ${err.message}`);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
