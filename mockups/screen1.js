(function () {
  const board = document.getElementById("board-canvas");
  const dialog = document.getElementById("note-dialog");
  const form = document.getElementById("note-form");
  const titleInput = document.getElementById("note-title-input");
  const memoInput = document.getElementById("note-memo-input");
  const attrsInput = document.getElementById("note-attrs-input");
  let editingCard = null;

  function createNoteCard(note) {
    const card = document.createElement("article");
    card.className = `note-card${note.status === "held" ? " held" : ""}${note.origin === "user" ? " user-note" : ""}`;
    card.id = note.id;
    card.dataset.noteId = note.id;
    card.style.left = `${note.x}%`;
    card.style.top = `${note.y}%`;

    const pin = document.createElement("span");
    pin.className = "pin";
    pin.textContent = "●";
    card.appendChild(pin);

    const origin = document.createElement("span");
    origin.className = `tag ${note.status === "held" ? "held" : note.origin === "ai" ? "ai" : "manual"}`;
    origin.textContent = note.status === "held" ? "保留中" : note.origin === "ai" ? "AI 抽出" : "手動作成";
    card.appendChild(origin);

    const title = document.createElement("h3");
    title.className = "note-title";
    title.textContent = note.title;
    card.appendChild(title);
    const memo = document.createElement("p");
    memo.className = "note-memo";
    memo.textContent = note.memo;
    card.appendChild(memo);

    const attrList = document.createElement("div");
    attrList.className = "note-attrs";
    note.attrs.forEach((attr) => {
      const item = document.createElement("span");
      item.textContent = attr;
      attrList.appendChild(item);
    });
    card.appendChild(attrList);

    const footer = document.createElement("div");
    footer.className = "note-footer";
    if (note.source) {
      const source = document.createElement("a");
      source.className = "source-link";
      source.href = `#${note.source}`;
      source.textContent = `根拠：${note.sourceLabel.replace(/「.*$/, "")} ↗`;
      footer.appendChild(source);
    } else {
      const source = document.createElement("span");
      source.className = "source-link";
      source.textContent = "作成者：ゆき";
      footer.appendChild(source);
    }
    const actions = document.createElement("span");
    actions.className = "note-actions";
    actions.innerHTML = '<button data-action="edit">編集</button><button data-action="delete">削除</button>';
    footer.appendChild(actions);
    card.appendChild(footer);
    return card;
  }

  function bindCard(card) {
    makeDraggable(card);
    card.querySelector('[data-action="edit"]').addEventListener("click", () => openEditor(card));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => removeCard(card));
  }

  function renderNotes() {
    const list = document.getElementById("note-list");
    window.AIAU_DATA.notes.forEach((note) => {
      const card = createNoteCard(note);
      list.appendChild(card);
      bindCard(card);
    });
  }

  function makeDraggable(card) {
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    card.addEventListener("pointerdown", function (event) {
      if (event.target.closest("button, a")) return;
      event.preventDefault();
      card.setPointerCapture(event.pointerId);
      const boardRect = board.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      startX = event.clientX; startY = event.clientY;
      startLeft = cardRect.left - boardRect.left; startTop = cardRect.top - boardRect.top;
      card.dataset.dragging = "true";
    });
    card.addEventListener("pointermove", function (event) {
      if (card.dataset.dragging !== "true") return;
      const boardRect = board.getBoundingClientRect();
      const nextLeft = Math.max(4, Math.min(boardRect.width - card.offsetWidth - 4, startLeft + event.clientX - startX));
      const nextTop = Math.max(4, Math.min(boardRect.height - card.offsetHeight - 4, startTop + event.clientY - startY));
      card.style.left = `${(nextLeft / boardRect.width) * 100}%`;
      card.style.top = `${(nextTop / boardRect.height) * 100}%`;
    });
    card.addEventListener("pointerup", function () {
      card.dataset.dragging = "false";
    });
  }

  function openEditor(card) {
    editingCard = card;
    const note = window.AIAU_DATA.notes.find((item) => item.id === card.dataset.noteId);
    document.getElementById("dialog-title").textContent = note ? "付箋を編集" : "付箋を追加";
    titleInput.value = note ? note.title : "";
    memoInput.value = note ? note.memo : "";
    attrsInput.value = note ? note.attrs.join(", ") : "";
    dialog.showModal();
    titleInput.focus();
  }

  function removeCard(card) {
    if (window.confirm("この付箋を削除しますか？")) card.remove();
  }

  renderNotes();
  document.getElementById("add-note-button").addEventListener("click", () => openEditor(null));
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (editingCard) {
      editingCard.querySelector(".note-title").textContent = titleInput.value;
      editingCard.querySelector(".note-memo").textContent = memoInput.value || "メモはありません。";
      const attrs = editingCard.querySelector(".note-attrs");
      attrs.innerHTML = "";
      attrsInput.value.split(",").map((value) => value.trim()).filter(Boolean).forEach((value) => {
        const span = document.createElement("span"); span.textContent = value; attrs.appendChild(span);
      });
      editingCard.classList.add("user-note");
      editingCard.querySelector(".tag").textContent = "手動編集";
      editingCard.querySelector(".tag").className = "tag manual";
    } else {
      const card = document.createElement("article");
      card.className = "note-card user-note";
      card.style.left = "8%"; card.style.top = "34%";
      card.dataset.noteId = `note-${Date.now()}`;
      const attrs = attrsInput.value.split(",").map((value) => value.trim()).filter(Boolean).map((value) => `<span>${value}</span>`).join("");
      card.innerHTML = `<span class="pin">●</span><span class="tag manual">手動作成</span><h3 class="note-title"></h3><p class="note-memo"></p><div class="note-attrs">${attrs}</div><div class="note-footer"><span class="source-link">作成者：あなた</span><span class="note-actions"><button data-action="edit">編集</button><button data-action="delete">削除</button></span></div>`;
      card.querySelector(".note-title").textContent = titleInput.value;
      card.querySelector(".note-memo").textContent = memoInput.value || "メモはありません。";
      board.appendChild(card);
      bindCard(card);
    }
    dialog.close();
  });
  document.getElementById("chat-form").addEventListener("submit", function (event) {
    event.preventDefault();
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;
    const message = document.createElement("div");
    message.className = "message mine";
    message.innerHTML = `<div class="message-avatar">あ</div><div class="message-content"><div class="message-meta"><strong>あなた</strong><span>いま</span></div><div class="message-bubble"></div></div>`;
    message.querySelector(".message-bubble").textContent = text;
    document.getElementById("chat-messages").appendChild(message);
    input.value = "";
    message.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
})();
