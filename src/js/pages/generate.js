import { chatUI } from "../lib/chat.js";
import { slidePreview } from "../lib/preview.js";
import { parsePptx } from "../lib/pptx-reader.js";
import { generatePptx, downloadPptx } from "../lib/pptx-builder.js";

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
  templateInfo: null,
  mode: "form", // "form" | "chat"
  composition: [],
  messages: [],
  pres: null,
  outputSlides: [],
};

export function renderGeneratePage(container) {
  container.innerHTML = `
    <div class="flex h-screen">
      <!-- Left: Template -->
      <div class="w-1/2 flex flex-col border-r border-gray-800">
        <div class="p-4 border-b border-gray-800">
          <h2 class="text-lg font-semibold">スライド生成</h2>
          <p class="text-sm text-gray-400 mt-1">テンプレートを使ってスライドを生成</p>
        </div>
        <div class="p-4 border-b border-gray-800">
          <label class="block">
            <input type="file" id="template-file" accept=".pptx"
              class="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer" />
          </label>
        </div>
        <div id="slide-gallery" class="p-4 overflow-auto flex-1">
          <div class="flex items-center justify-center h-48 text-gray-500">
            テンプレートPPTXをアップロードしてください
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

  const templateFile = container.querySelector("#template-file");
  const previewBtn = container.querySelector("#gen-preview-btn");
  const downloadBtn = container.querySelector("#gen-download-btn");
  const modeForm = container.querySelector("#mode-form");
  const modeChat = container.querySelector("#mode-chat");
  const genChat = container.querySelector("#gen-chat");

  chatUI.init(genChat, handleChatMessage);

  // Mode switching
  modeForm.addEventListener("click", () => switchMode("form"));
  modeChat.addEventListener("click", () => switchMode("chat"));

  templateFile.addEventListener("change", handleTemplateUpload);
  previewBtn.addEventListener("click", handleFormGenerate);
  downloadBtn.addEventListener("click", async () => {
    if (state.pres) await downloadPptx(state.pres);
  });
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

async function handleTemplateUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const gallery = document.getElementById("slide-gallery");
  gallery.innerHTML = '<div class="flex items-center justify-center h-48"><div class="spinner"></div></div>';

  try {
    const arrayBuffer = await file.arrayBuffer();
    const info = await parsePptx(arrayBuffer);
    state.templateInfo = info;
    state.composition = [];
    renderGallery(info);
  } catch (err) {
    gallery.innerHTML = `<div class="text-red-400 p-4">解析エラー: ${err.message}</div>`;
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
    slidePreview.renderSingle(previewEl, slide);

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
      <div class="space-y-2" id="placeholders-${item.id}"></div>
    `;

    const phContainer = card.querySelector(`#placeholders-${item.id}`);
    Object.entries(item.placeholders).forEach(([key, value]) => {
      const field = document.createElement("div");
      field.innerHTML = `
        <label class="text-xs text-gray-400">${key}</label>
        <textarea class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1 resize-none"
          rows="2" data-key="${key}">${escapeHtml(value)}</textarea>
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
    chatUI.addMessage("assistant", "先にテンプレートPPTXをアップロードしてください。");
    return;
  }

  // Include template structure in first message
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
    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { message: responseContent };

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
