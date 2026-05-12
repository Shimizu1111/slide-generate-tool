export const chatUI = {
  _container: null,
  _onSend: null,
  _messagesEl: null,

  init(container, onSend) {
    this._container = container;
    this._onSend = onSend;

    container.innerHTML = `
      <div class="chat-messages flex-1 p-4 space-y-3 overflow-y-auto" id="chat-messages"></div>
      <div class="p-4 border-t border-gray-800">
        <form id="chat-form" class="flex gap-2">
          <input type="text" id="chat-input"
            class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="メッセージを入力..." autocomplete="off" />
          <button type="submit" id="chat-send"
            class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            送信
          </button>
        </form>
      </div>
    `;

    this._messagesEl = container.querySelector("#chat-messages");
    const form = container.querySelector("#chat-form");
    const input = container.querySelector("#chat-input");
    const sendBtn = container.querySelector("#chat-send");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      input.value = "";
      input.disabled = true;
      sendBtn.disabled = true;

      this.addMessage("user", text);
      this._addLoading();

      try {
        await this._onSend(text);
      } finally {
        this._removeLoading();
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
      }
    });
  },

  addMessage(role, content) {
    const messagesEl = this._container.querySelector("#chat-messages");
    const div = document.createElement("div");
    div.className = `flex ${role === "user" ? "justify-end" : "justify-start"}`;
    div.innerHTML = `
      <div class="${role === "user" ? "chat-bubble-user" : "chat-bubble-assistant"} px-4 py-2.5 max-w-[85%] text-sm whitespace-pre-wrap">
        ${escapeHtml(content)}
      </div>
    `;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  },

  _addLoading() {
    const messagesEl = this._container.querySelector("#chat-messages");
    const div = document.createElement("div");
    div.id = "chat-loading";
    div.className = "flex justify-start";
    div.innerHTML = `
      <div class="chat-bubble-assistant px-4 py-3 flex items-center gap-2">
        <div class="spinner"></div>
        <span class="text-sm text-gray-400">考え中...</span>
      </div>
    `;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  },

  _removeLoading() {
    const loading = this._container.querySelector("#chat-loading");
    if (loading) loading.remove();
  },
};

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
