import { chatUI } from "../lib/chat.js";
import { slidePreview } from "../lib/preview.js";
import { parsePptx } from "../lib/pptx-reader.js";
import { generatePptx, downloadPptx } from "../lib/pptx-builder.js";
import { saveTemplate } from "../lib/template-store.js";

const SYSTEM_PROMPT = `あなたはスライドデザインの再現専門家です。
ユーザーがアップロードした画像やPPTXのデザインを、pptxgenjsのJavaScriptコードで忠実に再現してください。

ルール:
1. 変数名は pres (PptxGenJSインスタンス) を使う。presは既に作成済み。
2. 元のデザインのフォント、色、レイアウト、位置、装飾をできるだけ忠実に再現する
3. テキスト部分はプレースホルダーとして残す（例: "タイトルをここに入力"）
4. 日本語フォントは "Meiryo" または "Yu Gothic" を使う
5. 座標・サイズはインチ単位
6. 色は6桁16進数(FFなし): "0088CC"

応答はJSON形式で:
{
  "message": "説明メッセージ",
  "code": "// pptxgenjsコード"
}

pptxgenjs APIの主要メソッド:
- pres.addSlide() - スライド追加
- slide.addText(text, { x, y, w, h, fontSize, fontFace, color, bold, italic, align, valign, fill }) - テキスト追加
- slide.addShape(pres.ShapeType.rect, { x, y, w, h, fill, line }) - 図形追加
- slide.background = { fill: "FF0000" } - 背景色

align: "left", "center", "right"
valign: "top", "middle", "bottom"
fill: { color: "0088CC" }`;

let state = {
  sourceType: null,
  sourceDataUrl: null,
  sourceInfo: null,
  messages: [],
  slideDefinitions: [],
  pres: null,
};

export function renderCapturePage(container) {
  state = {
    sourceType: null,
    sourceDataUrl: null,
    sourceInfo: null,
    messages: [],
    slideDefinitions: [],
    pres: null,
  };

  container.innerHTML = `
    <div class="flex h-screen">
      <!-- Left: Source -->
      <div class="w-1/2 flex flex-col border-r border-gray-800">
        <div class="p-4 border-b border-gray-800">
          <h2 class="text-lg font-semibold">デザインキャプチャ</h2>
          <p class="text-sm text-gray-400 mt-1">画像・PPTX・PDFをアップロードしてデザインを再現</p>
        </div>
        <div class="p-4 border-b border-gray-800">
          <label class="block">
            <input type="file" id="source-file" accept=".png,.jpg,.jpeg,.webp,.pptx,.pdf"
              class="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer" />
          </label>
          <p class="text-xs text-gray-500 mt-2">PNG, JPG, PPTX, PDF に対応</p>
        </div>
        <div id="source-preview" class="flex-1 p-4 overflow-auto">
          <div class="flex items-center justify-center h-64 text-gray-500">
            ファイルをアップロードしてください
          </div>
        </div>
      </div>
      <!-- Right: Result + Chat -->
      <div class="w-1/2 flex flex-col">
        <div class="p-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold">再現結果</h2>
            <p class="text-sm text-gray-400 mt-1">AIが再現したテンプレート</p>
          </div>
          <div class="flex gap-2 items-center">
            <input type="text" id="template-name" placeholder="テンプレート名"
              class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 w-40 hidden" />
            <button id="capture-save-btn" class="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed hidden" disabled>
              保存
            </button>
            <button id="capture-download-btn" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled>
              DL
            </button>
          </div>
        </div>
        <div id="capture-preview" class="p-4 overflow-auto" style="min-height: 200px;">
          <div class="flex items-center justify-center h-48 text-gray-500">
            ファイルをアップロードすると自動でデザインを解析します
          </div>
        </div>
        <div class="flex-1 flex flex-col border-t border-gray-800 min-h-0">
          <div class="p-3 border-b border-gray-800">
            <h3 class="text-sm font-medium text-gray-400">修正チャット</h3>
          </div>
          <div id="capture-chat" class="flex-1 flex flex-col min-h-0"></div>
        </div>
      </div>
    </div>
  `;

  const sourceFile = container.querySelector("#source-file");
  const downloadBtn = container.querySelector("#capture-download-btn");
  const saveBtn = container.querySelector("#capture-save-btn");
  const templateNameInput = container.querySelector("#template-name");
  const captureChat = container.querySelector("#capture-chat");

  chatUI.init(captureChat, handleRefinement);

  sourceFile.addEventListener("change", handleFileUpload);

  downloadBtn.addEventListener("click", async () => {
    if (state.pres) await downloadPptx(state.pres);
  });

  saveBtn.addEventListener("click", async () => {
    if (!state.pres) return;
    const name = templateNameInput.value.trim() || `テンプレート ${new Date().toLocaleString("ja-JP")}`;
    try {
      saveBtn.disabled = true;
      saveBtn.textContent = "保存中...";
      const binary = await state.pres.write({ outputType: "arraybuffer" });
      await saveTemplate(name, binary, state.slideDefinitions);
      saveBtn.textContent = "保存済み";
      setTimeout(() => {
        saveBtn.textContent = "保存";
        saveBtn.disabled = false;
      }, 2000);
    } catch (err) {
      saveBtn.textContent = "保存";
      saveBtn.disabled = false;
      chatUI.addMessage("assistant", `保存エラー: ${err.message}`);
    }
  });
}

async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const sourcePreview = document.getElementById("source-preview");
  sourcePreview.innerHTML = '<div class="flex items-center justify-center h-48"><div class="spinner"></div><span class="ml-3 text-gray-400">解析中...</span></div>';

  const ext = file.name.split(".").pop().toLowerCase();

  try {
    if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
      await handleImage(file);
    } else if (ext === "pptx") {
      await handlePptx(file);
    } else if (ext === "pdf") {
      await handlePdf(file);
    }
  } catch (err) {
    sourcePreview.innerHTML = `<div class="text-red-400 p-4">エラー: ${err.message}</div>`;
  }
}

async function handleImage(file) {
  state.sourceType = "image";
  const dataUrl = await fileToDataUrl(file);
  state.sourceDataUrl = dataUrl;

  const sourcePreview = document.getElementById("source-preview");
  sourcePreview.innerHTML = "";
  const img = document.createElement("img");
  img.src = dataUrl;
  img.className = "max-w-full rounded-lg shadow-lg";
  sourcePreview.appendChild(img);

  await analyzeAndGenerate(dataUrl, "image");
}

async function handlePptx(file) {
  state.sourceType = "pptx";
  const arrayBuffer = await file.arrayBuffer();
  const info = await parsePptx(arrayBuffer);
  state.sourceInfo = info;

  const sourcePreview = document.getElementById("source-preview");
  slidePreview.render(sourcePreview, info.slides);

  const prompt = `以下のスライドテンプレートのデザインを忠実に再現してください。
テキスト内容はプレースホルダー（例: "タイトルをここに入力"）に置き換えてください。

テンプレート構造:
${JSON.stringify(info, null, 2)}

各スライドのレイアウト、テキストの位置・サイズ・フォント・色、背景色、図形をすべて再現してください。`;

  state.messages = [{ role: "user", content: prompt }];
  chatUI.addMessage("user", "PPTXのデザインを解析・再現中...");
  await callAIAndRender();
}

async function handlePdf(file) {
  state.sourceType = "pdf";
  const dataUrl = await fileToDataUrl(file);
  state.sourceDataUrl = dataUrl;

  const sourcePreview = document.getElementById("source-preview");
  sourcePreview.innerHTML = '<div class="text-gray-400 text-center py-8">PDFを解析中...</div>';

  await analyzeAndGenerate(dataUrl, "pdf");
}

async function analyzeAndGenerate(dataUrl, type) {
  const mediaType = type === "pdf" ? "application/pdf" : dataUrl.split(";")[0].split(":")[1];
  const base64Data = dataUrl.split(",")[1];

  const prompt = `この${type === "pdf" ? "PDF" : "画像"}のスライドデザインを分析して、pptxgenjsで忠実に再現してください。
レイアウト、配色、フォントサイズ、余白、装飾などすべての要素を再現してください。
テキスト内容はプレースホルダー（例: "タイトルをここに入力"）に置き換えてください。`;

  state.messages = [{
    role: "user",
    content: prompt,
    _attachment: { mediaType, base64Data, type },
  }];
  chatUI.addMessage("user", `${type === "pdf" ? "PDF" : "画像"}のデザインを解析・再現中...`);
  await callAIAndRender();
}

async function readSSEStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let content = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;

      try {
        const event = JSON.parse(data);
        if (event.type === "content_block_delta" && event.delta?.text) {
          content += event.delta.text;
        }
      } catch {
        // ignore parse errors for non-JSON SSE lines
      }
    }
  }

  return content;
}

async function callAIAndRender() {
  try {
    const apiMessages = state.messages.map((m) => {
      if (m._attachment) {
        const isPdf = m._attachment.type === "pdf";
        const contentBlock = isPdf
          ? {
              type: "document",
              source: {
                type: "base64",
                media_type: m._attachment.mediaType,
                data: m._attachment.base64Data,
              },
            }
          : {
              type: "image",
              source: {
                type: "base64",
                media_type: m._attachment.mediaType,
                data: m._attachment.base64Data,
              },
            };
        return {
          role: m.role,
          content: [contentBlock, { type: "text", text: m.content }],
        };
      }
      return { role: m.role, content: m.content };
    });

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: apiMessages,
        system: SYSTEM_PROMPT,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API error: ${response.status} ${errText}`);
    }

    const content = await readSSEStream(response);

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { message: content };
    } catch {
      const msgMatch = content.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const codeMatch = content.match(/"code"\s*:\s*"([\s\S]*)/);
      if (msgMatch) {
        parsed = { message: msgMatch[1] };
        if (codeMatch) {
          parsed.message += "\n\n⚠️ コードが途中で切れたため再現できませんでした。スライド数を減らすか、再度お試しください。";
        }
      } else {
        parsed = { message: "⚠️ AIの応答が長すぎて解析できませんでした。スライド数を減らしてお試しください。" };
      }
    }

    const assistantMessage = parsed.message || "デザインを再現しました。";
    state.messages.push({ role: "assistant", content: assistantMessage });
    chatUI.addMessage("assistant", assistantMessage);

    if (parsed.code) {
      await executeCode(parsed.code);
    }
  } catch (err) {
    const errorMsg = `エラー: ${err.message}`;
    state.messages.push({ role: "assistant", content: errorMsg });
    chatUI.addMessage("assistant", errorMsg);
  }
}

async function handleRefinement(userMessage) {
  const msg = { role: "user", content: userMessage };
  state.messages.push(msg);
  await callAIAndRender();
}

async function executeCode(code) {
  const capturePreview = document.getElementById("capture-preview");
  const downloadBtn = document.getElementById("capture-download-btn");
  const saveBtn = document.getElementById("capture-save-btn");
  const templateNameInput = document.getElementById("template-name");

  try {
    const { pres, slides } = await generatePptx(code);
    state.pres = pres;
    state.slideDefinitions = slides;
    slidePreview.render(capturePreview, slides);
    downloadBtn.disabled = false;
    saveBtn.disabled = false;
    saveBtn.classList.remove("hidden");
    templateNameInput.classList.remove("hidden");
  } catch (err) {
    chatUI.addMessage("assistant", `コード実行エラー: ${err.message}`);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
