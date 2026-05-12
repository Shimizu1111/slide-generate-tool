import { chatUI } from "../lib/chat.js";
import { slidePreview } from "../lib/preview.js";
import { parsePptx } from "../lib/pptx-reader.js";
import { generatePptx, downloadPptx } from "../lib/pptx-builder.js";

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
  sourceType: null, // "image" | "pptx" | "pdf"
  sourceDataUrl: null,
  sourceInfo: null, // parsed pptx info
  messages: [],
  slideDefinitions: [],
  pres: null,
};

export function renderCapturePage(container) {
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
          <button id="capture-download-btn" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled>
            テンプレDL
          </button>
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
  const captureChat = container.querySelector("#capture-chat");

  chatUI.init(captureChat, handleRefinement);

  // Restore previous state
  state.messages.forEach((msg) => chatUI.addMessage(msg.role, msg.content));
  if (state.slideDefinitions.length > 0) {
    const capturePreview = container.querySelector("#capture-preview");
    slidePreview.render(capturePreview, state.slideDefinitions);
    downloadBtn.disabled = false;
  }

  sourceFile.addEventListener("change", handleFileUpload);

  downloadBtn.addEventListener("click", async () => {
    if (state.pres) await downloadPptx(state.pres);
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

  // Show image preview
  const dataUrl = await fileToDataUrl(file);
  state.sourceDataUrl = dataUrl;
  const sourcePreview = document.getElementById("source-preview");
  sourcePreview.innerHTML = `<img src="${dataUrl}" class="max-w-full rounded-lg shadow-lg" />`;

  // Send to Claude Vision API for analysis
  await analyzeAndGenerate(dataUrl, "image");
}

async function handlePptx(file) {
  state.sourceType = "pptx";

  const arrayBuffer = await file.arrayBuffer();
  const info = await parsePptx(arrayBuffer);
  state.sourceInfo = info;

  // Show source preview
  const sourcePreview = document.getElementById("source-preview");
  slidePreview.render(sourcePreview, info.slides);

  // Send structure to AI for reproduction
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

  // Convert PDF first page to image via API
  const dataUrl = await fileToDataUrl(file);
  state.sourceDataUrl = dataUrl;

  const sourcePreview = document.getElementById("source-preview");
  sourcePreview.innerHTML = `<div class="text-gray-400 text-center py-8">PDF解析中...</div>`;

  await analyzeAndGenerate(dataUrl, "pdf");
}

async function analyzeAndGenerate(dataUrl, type) {
  // Use Claude Vision to analyze the design
  const mediaType = type === "pdf" ? "application/pdf" : dataUrl.split(";")[0].split(":")[1];
  const base64Data = dataUrl.split(",")[1];

  const prompt = `この${type === "pdf" ? "PDF" : "画像"}のスライドデザインを分析して、pptxgenjsで忠実に再現してください。
レイアウト、配色、フォントサイズ、余白、装飾などすべての要素を再現してください。
テキスト内容はプレースホルダー（例: "タイトルをここに入力"）に置き換えてください。`;

  state.messages = [{
    role: "user",
    content: prompt,
    _image: { mediaType, base64Data },
  }];
  chatUI.addMessage("user", `${type === "pdf" ? "PDF" : "画像"}のデザインを解析・再現中...`);

  await callAIAndRender();
}

async function callAIAndRender() {
  try {
    // Build API messages with image support
    const apiMessages = state.messages.map((m) => {
      if (m._image) {
        return {
          role: m.role,
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: m._image.mediaType,
                data: m._image.base64Data,
              },
            },
            { type: "text", text: m.content },
          ],
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

    const data = await response.json();
    const content = data.content || "";

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { message: content };
    } catch {
      parsed = { message: content };
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
  // If we have an image, include it in context for refinement too
  const msg = { role: "user", content: userMessage };
  state.messages.push(msg);
  await callAIAndRender();
}

async function executeCode(code) {
  const capturePreview = document.getElementById("capture-preview");
  const downloadBtn = document.getElementById("capture-download-btn");

  try {
    const { pres, slides } = await generatePptx(code);
    state.pres = pres;
    state.slideDefinitions = slides;
    slidePreview.render(capturePreview, slides);
    downloadBtn.disabled = false;
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
