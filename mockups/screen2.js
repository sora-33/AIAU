(function () {
  const data = window.AIAU_DATA;
  const drawer = document.getElementById("history-drawer");

  function createPlanBlock(plan, index) {
    const block = document.createElement("div");
    block.className = `schedule-block ${plan.type === "option" ? "option" : plan.status === "draft" ? "draft" : ""}`;
    const positions = {
      "plan-museum": ["10%", "20%", "0"],
      "plan-museum-option": ["31%", "17%", "0"],
      "plan-lunch-option": ["32%", "15%", "0"],
      "plan-cafe": ["48%", "16%", "86px"],
      "plan-market": ["70%", "16%", "0"]
    };
    const position = positions[plan.id] || [`${10 + index * 18}%`, "16%", "0"];
    block.style.left = position[0];
    block.style.width = position[1];
    block.style.top = position[2];

    if (plan.type === "option") {
      const label = document.createElement("div");
      label.className = "option-group-label";
      label.textContent = plan.id === "plan-lunch-option" ? "候補 A" : "候補 B";
      block.appendChild(label);
    }
    const title = document.createElement("h3");
    title.className = "schedule-title";
    title.textContent = plan.title;
    block.appendChild(title);
    const meta = document.createElement("div");
    meta.className = "schedule-meta";
    meta.textContent = `${plan.time}${plan.location ? ` ・ ${plan.location}` : ""}`;
    block.appendChild(meta);

    if (plan.type === "option" || plan.status === "draft") {
      const votes = document.createElement("div");
      votes.className = "vote-row";
      votes.innerHTML = '<button class="vote-button" data-vote>♡ 投票</button>';
      const count = document.createElement("span");
      count.className = "vote-count";
      count.textContent = `${plan.votes || 0}票`;
      votes.appendChild(count);
      votes.insertAdjacentHTML("beforeend", '<button class="adopt-button" data-adopt>採用する</button>');
      block.appendChild(votes);
    } else {
      const link = document.createElement("a");
      link.className = "schedule-note";
      link.href = `screen1.html#${plan.noteId}`;
      link.textContent = "付箋を見る ↗";
      block.appendChild(link);
    }
    return block;
  }

  function renderPlans() {
    const slotMap = {
      morning: ["plan-museum", "plan-museum-option"],
      lunch: ["plan-lunch-option", "plan-cafe"],
      afternoon: ["plan-market"]
    };
    document.querySelectorAll("[data-plan-slot]").forEach((slot) => {
      slotMap[slot.dataset.planSlot].forEach((id, index) => {
        const plan = data.plans.find((item) => item.id === id);
        if (plan) slot.appendChild(createPlanBlock(plan, index));
      });
    });
  }

  function renderHistory() {
    const list = document.getElementById("history-list");
    data.history.forEach((item, index) => {
      const version = document.createElement("div");
      version.className = `history-version${index === 0 ? " current" : ""}`;
      const head = document.createElement("div");
      head.className = "version-head";
      const versionId = item.id || item.version || "v?";
      head.innerHTML = `<span class="version-id">${versionId} · ${item.date} ${item.time || ""}</span>${index === 0 ? '<span class="current-badge">現在のバージョン</span>' : ""}`;
      version.appendChild(head);
      const author = document.createElement("p");
      author.className = "version-author";
      author.textContent = `変更者：${item.author || "匿名ユーザー"}`;
      version.appendChild(author);
      const title = document.createElement("h3");
      title.className = "version-title";
      title.textContent = item.title;
      version.appendChild(title);
      const summary = document.createElement("p");
      summary.className = "version-summary";
      summary.textContent = item.summary;
      version.appendChild(summary);
      if (index > 0) {
        const actions = document.createElement("div");
        actions.className = "version-actions";
        actions.innerHTML = '<button data-preview>差分をプレビュー</button><button data-restore>この版を復元</button>';
        version.appendChild(actions);
      }
      list.appendChild(version);
    });
  }

  function bindInteractions() {
    document.querySelectorAll("[data-vote]").forEach((button) => {
      button.addEventListener("click", () => {
        button.classList.toggle("voted");
        button.textContent = button.classList.contains("voted") ? "♥ 投票済み" : "♡ 投票";
        const count = button.parentElement.querySelector(".vote-count");
        const number = Number.parseInt(count.textContent, 10) || 0;
        count.textContent = `${number + (button.classList.contains("voted") ? 1 : -1)}票`;
      });
    });
    document.querySelectorAll("[data-adopt]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-adopt]").forEach((item) => { item.textContent = "採用する"; item.disabled = false; });
        button.textContent = "採用確定 ✓";
        button.disabled = true;
        window.alert("この候補を採用案として確定しました（モックアップ）");
      });
    });
    document.querySelectorAll("[data-preview]").forEach((button) => {
      button.addEventListener("click", () => {
        button.textContent = "差分を表示中";
        button.parentElement.parentElement.style.background = "#fffaf0";
      });
    });
    document.querySelectorAll("[data-restore]").forEach((button) => {
      button.addEventListener("click", () => window.alert("復元前の確認画面です。実際の復元は行いません（モックアップ）。"));
    });
  }

  renderPlans();
  renderHistory();
  bindInteractions();
  document.getElementById("history-toggle").addEventListener("click", () => { drawer.hidden = !drawer.hidden; });
  document.getElementById("history-close").addEventListener("click", () => { drawer.hidden = true; });
})();
