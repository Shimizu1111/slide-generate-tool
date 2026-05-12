import { chatUI } from "../lib/chat.js";
import { slidePreview } from "../lib/preview.js";
import { parsePptx } from "../lib/pptx-reader.js";
import { generatePptx, downloadPptx } from "../lib/pptx-builder.js";
import { saveTemplate } from "../lib/template-store.js";
import html2canvas from "html2canvas";

const SYSTEM_PROMPT = `あなたはスライドデザインの再現専門家です。
ユーザーがアップロードした画像やPPTXのデザインを、pptxgenjsのJavaScriptコードで**完全に**再現してください。

ルール:
1. 変数名は pres (PptxGenJSインスタンス) を使う。presは既に作成済み。
2. 元のデザインのフォント、色、レイアウト、位置、装飾を**ピクセル単位で忠実に**再現する
3. テキスト部分はプレースホルダーとして残す（例: "タイトルをここに入力"）
4. 日本語フォントは "Meiryo" または "Yu Gothic" を使う
5. 座標・サイズはインチ単位（スライドは 10 x 5.63 インチ）
6. 色は6桁16進数(FFなし): "0088CC"
7. 装飾要素（ドットパターン、グラデーション、アイコン風図形）も必ず再現する
8. 罫線は本数・太さ・位置を正確に再現する（二重線なら2本の線を描く）

■ 座標の正確な計算方法:
画像を10x5.63インチのグリッドとして見て、各要素の位置を比率で計算する。
- 画像の左端 = x: 0、右端 = x: 10
- 画像の上端 = y: 0、下端 = y: 5.63
- 要素が画像の横幅の30%の位置にある場合 → x: 3.0
- 要素が画像の高さの20%の位置にある場合 → y: 1.126
- 必ず画像をグリッド分割して位置を計測すること

■ よくある再現ミスと対策:
- ドットパターンが大きすぎる → dotSizeは0.04〜0.08インチ程度、gapは0.15〜0.25インチ程度が自然
- ドットの透明度が低すぎる → transparency: 60〜80で薄く
- 線が太すぎる → width: 1〜2が基本、太線でも3程度
- テキストサイズが大きすぎる → 元画像のテキストとスライド全体の比率を計算
- 余白が足りない → 左右の余白は通常0.5〜1.0インチ
- 二重線・三重線の間隔が広すぎる → 0.02〜0.05インチ間隔

応答はJSON形式で:
{
  "message": "説明メッセージ",
  "code": "// pptxgenjsコード"
}

pptxgenjs APIリファレンス:

■ スライド
- pres.addSlide() - スライド追加
- slide.background = { fill: "FF0000" } - 背景色

■ テキスト
- slide.addText(text, opts) - テキスト追加
- slide.addText([{ text: "太字", options: { bold: true } }, { text: "通常" }], opts) - リッチテキスト
  opts: { x, y, w, h, fontSize, fontFace, color, bold, italic, underline, align, valign, fill, line, margin, charSpacing, lineSpacingMultiple }

■ 図形 (ShapeType)
- slide.addShape(pres.ShapeType.rect, { x, y, w, h, fill, line, rectRadius, shadow }) - 矩形
- slide.addShape(pres.ShapeType.ellipse, { x, y, w, h, fill, line }) - 楕円・円
- slide.addShape(pres.ShapeType.line, { x, y, w, h, line }) - 直線
- slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill, rectRadius }) - 角丸矩形
- slide.addShape(pres.ShapeType.triangle, { x, y, w, h, fill }) - 三角形

■ 線のオプション
  line: { color: "333333", width: 2, dashType: "solid" }
  dashType: "solid", "dash", "dot", "lgDash", "lgDashDot", "sysDash", "sysDot"

■ 塗りつぶし
  fill: { color: "0088CC", transparency: 50 }

■ 影
  shadow: { type: "outer", blur: 3, offset: 2, color: "000000", opacity: 0.3 }

■ align / valign
  align: "left", "center", "right"
  valign: "top", "middle", "bottom"

■ 装飾パターンの再現テクニック:
- ドットパターン（ハーフトーン）: forループで小さなellipseを繰り返し配置
  例: for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slide.addShape(pres.ShapeType.ellipse, { x: startX + c*gap, y: startY + r*gap, w: dotSize, h: dotSize, fill: { color: "CCCCCC", transparency: t } })
  ドットサイズの目安: dotSize=0.05, gap=0.2 で控えめなドットパターン
- 二重線: 2本のlineを0.03インチ離して配置
- 三重線: 3本のlineを0.03インチ間隔で配置
- 装飾アイコン（地球、ピンなど）: テキストで Unicode 記号を使う（🌐 📍 など）
- グラデーション風: 透明度を変えた複数の矩形を重ねる

■ 重要な注意:
- 装飾要素を省略しない。すべての視覚要素を再現すること
- 位置は目測でなく、スライド全体(10x5.63)に対する比率で正確に計算すること
- 修正時は前回のコードをベースに差分修正すること（全体を一から書き直さない）`;

const MAX_AUTO_REFINE = 5;

const COMPARE_PROMPT = `あなたはスライドデザインの品質検査官です。
2つの画像を比較してください:
- 1枚目: オリジナルデザイン（目標）
- 2枚目: 再現されたスライドのスクリーンショット

以下の観点で差異を**具体的な数値を含めて**列挙してください:
1. レイアウト・位置のずれ → 「○○が左に0.5インチずれている」のように具体的に
2. 欠落している要素 → 何がどこにあるべきか
3. 色の違い → 元の色と再現色を16進数で
4. フォントサイズ・太さの違い → 「元は約36pt、再現は約48pt」のように
5. 線の本数・太さ・スタイルの違い → 本数、間隔、太さを具体的に
6. 装飾要素の品質 → ドットパターンのサイズ・間隔・透明度の具体的な修正指示
7. テキストの改行位置・行間の違い

各issueには**pptxgenjsでの具体的な修正方法**を含めてください。
例: "ドットパターンが大きすぎる。dotSizeを0.05に、gapを0.2に変更すべき"

応答はJSON形式で:
{
  "score": 0-100,
  "issues": ["修正方法を含む具体的な差異1", "修正方法を含む具体的な差異2", ...],
  "passed": true/false
}

scoreが85以上ならpassed: trueにしてください。
差異がない場合もpassed: trueにしてください。
厳しく採点してください。微細な差異も見逃さないでください。`;

let state = {
  sourceType: null,
  sourceDataUrl: null,
  sourceInfo: null,
  messages: [],
  slideDefinitions: [],
  pres: null,
  autoRefineCount: 0,
  isAutoRefining: false,
  lastGeneratedCode: null,
};

export function renderCapturePage(container) {
  state = {
    sourceType: null,
    sourceDataUrl: null,
    sourceInfo: null,
    messages: [],
    slideDefinitions: [],
    pres: null,
    autoRefineCount: 0,
    isAutoRefining: false,
    lastGeneratedCode: null,
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
          <div class="p-3 border-b border-gray-800 flex items-center justify-between">
            <h3 class="text-sm font-medium text-gray-400">修正チャット</h3>
            <div id="auto-refine-status" class="text-xs text-gray-500 hidden">
              <span class="inline-block w-2 h-2 bg-yellow-400 rounded-full animate-pulse mr-1"></span>
              自動修正中...
            </div>
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

まず画像を10x5.63インチのグリッドとして分析し、各要素の正確な位置(x,y)とサイズ(w,h)をインチ単位で計測してください。
以下をすべて再現してください:
- テキスト: 位置、サイズ、フォント、色、太さ、行間
- 罫線: 位置、太さ、本数（二重線・三重線の場合は複数のlineで再現）、間隔
- 装飾: ドットパターン（小さめ: dotSize=0.05程度）、アイコン、図形
- 背景色、余白
- テキスト内容はそのまま維持してください（プレースホルダーに変えない）`;

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
      if (m._images) {
        const contentParts = m._images.map((img) => ({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mediaType,
            data: img.base64Data,
          },
        }));
        contentParts.push({ type: "text", text: m.content });
        return { role: m.role, content: contentParts };
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
      state.lastGeneratedCode = parsed.code;
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

    // 自動比較・修正ループ（元画像がある場合のみ）
    if (state.sourceDataUrl && !state.isAutoRefining && state.autoRefineCount < MAX_AUTO_REFINE) {
      await autoRefineLoop(capturePreview);
    }
  } catch (err) {
    chatUI.addMessage("assistant", `コード実行エラー: ${err.message}`);
  }
}

async function capturePreviewScreenshot(previewEl) {
  // Wait for rendering to complete
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const slideEl = previewEl.querySelector(".slide-preview");
  if (!slideEl) return null;

  const canvas = await html2canvas(slideEl, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
  });
  return canvas.toDataURL("image/png");
}

async function compareWithOriginal(screenshotDataUrl) {
  const originalBase64 = state.sourceDataUrl.split(",")[1];
  const originalMediaType = state.sourceDataUrl.split(";")[0].split(":")[1];
  const screenshotBase64 = screenshotDataUrl.split(",")[1];

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: COMPARE_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: originalMediaType, data: originalBase64 } },
          { type: "image", source: { type: "base64", media_type: "image/png", data: screenshotBase64 } },
          { type: "text", text: "これら2つの画像を比較して、再現度を評価してください。1枚目がオリジナル、2枚目が再現結果です。" },
        ],
      }],
    }),
  });

  if (!response.ok) throw new Error(`Compare API error: ${response.status}`);

  const content = await readSSEStream(response);
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { score: 100, issues: [], passed: true };
}

async function autoRefineLoop(previewEl) {
  state.isAutoRefining = true;
  const statusEl = document.getElementById("auto-refine-status");
  if (statusEl) statusEl.classList.remove("hidden");

  try {
    while (state.autoRefineCount < MAX_AUTO_REFINE) {
      state.autoRefineCount++;
      chatUI.addMessage("assistant", `自動チェック中... (${state.autoRefineCount}/${MAX_AUTO_REFINE})`);

      // 1. プレビューをスクリーンショット
      const screenshot = await capturePreviewScreenshot(previewEl);
      if (!screenshot) {
        chatUI.addMessage("assistant", "プレビューのキャプチャに失敗しました。");
        break;
      }

      // 2. オリジナルと比較
      const result = await compareWithOriginal(screenshot);
      chatUI.addMessage("assistant",
        `再現スコア: ${result.score}/100\n${result.issues?.length ? "差異:\n- " + result.issues.join("\n- ") : "差異なし"}`
      );

      // 3. 合格なら終了
      if (result.passed) {
        chatUI.addMessage("assistant", "再現度チェック合格です。");
        break;
      }

      // 4. 不合格なら自動修正（元画像+スクリーンショット+前回コード付き）
      chatUI.addMessage("assistant", `自動修正中... (${state.autoRefineCount}/${MAX_AUTO_REFINE})`);

      const originalBase64 = state.sourceDataUrl.split(",")[1];
      const originalMediaType = state.sourceDataUrl.split(";")[0].split(":")[1];
      const screenshotBase64 = screenshot.split(",")[1];

      const fixPrompt = `再現度チェックの結果、以下の差異が見つかりました。

1枚目の画像: オリジナルデザイン（目標）
2枚目の画像: 現在の再現結果

差異:
${result.issues.map((i) => `- ${i}`).join("\n")}

スコア: ${result.score}/100

前回のコード:
\`\`\`javascript
${state.lastGeneratedCode || "(不明)"}
\`\`\`

上記コードをベースに、差異を修正してください。
画像を見比べて、位置・サイズ・色・装飾すべてを元画像に一致させてください。
すべてのスライドの完全なコードを出力してください。`;

      // 会話履歴が長くなりすぎないよう、自動修正時は直近のやり取りだけ保持
      const trimmedMessages = trimMessagesForAutoRefine(state.messages);
      state.messages = trimmedMessages;

      const fixMessage = {
        role: "user",
        content: fixPrompt,
        _images: [
          { mediaType: originalMediaType, base64Data: originalBase64 },
          { mediaType: "image/png", base64Data: screenshotBase64 },
        ],
      };
      state.messages.push(fixMessage);
      await callAIAndRender();
    }

    if (state.autoRefineCount >= MAX_AUTO_REFINE) {
      chatUI.addMessage("assistant", `自動修正の上限(${MAX_AUTO_REFINE}回)に達しました。チャットで手動修正できます。`);
    }
  } catch (err) {
    chatUI.addMessage("assistant", `自動チェックエラー: ${err.message}`);
  } finally {
    state.isAutoRefining = false;
    if (statusEl) statusEl.classList.add("hidden");
  }
}

// 自動修正時にメッセージ履歴を刈り込む（初回の元画像メッセージ + 直近2往復だけ残す）
function trimMessagesForAutoRefine(messages) {
  if (messages.length <= 5) return messages;
  // 最初のメッセージ（元画像付き）は常に保持
  const first = messages[0];
  // 直近4メッセージ（2往復分）を保持
  const recent = messages.slice(-4);
  return [first, ...recent];
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
