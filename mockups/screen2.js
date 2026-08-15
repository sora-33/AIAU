(function () {
  const data = window.AIAU_DATA;
  const drawer = document.getElementById("history-drawer");
  const rows = document.getElementById("plan-rows");
  const selection = {
    museum: "plan-museum",
    lunch: null,
    afternoon: null
  };
  const voteAdjustments = {};
  const votedPlans = new Set();
  const aiSuggestionStates = {};
  let activePopover = null;

  const groups = [
    {
      id: "museum",
      label: "美術館の案",
      planIds: ["plan-museum", "plan-museum-option"]
    },
    {
      id: "lunch",
      label: "昼食の候補",
      planIds: ["plan-lunch-option"]
    },
    {
      id: "afternoon",
      label: "午後の候補",
      planIds: ["plan-teamlab-option"]
    }
  ];

  function findPlan(id) {
    return data.plans.find((item) => item.id === id);
  }

  function getVotes(plan) {
    return (plan.votes || 0) + (voteAdjustments[plan.id] || 0);
  }

  function parseTime(value) {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function getTimelinePosition(plan) {
    const timelineStart = 9 * 60;
    const timelineEnd = 18 * 60;
    const start = Math.max(parseTime(plan.start), timelineStart);
    const end = Math.min(parseTime(plan.end), timelineEnd);
    const total = timelineEnd - timelineStart;
    const left = ((start - timelineStart) / total) * 100;
    const width = ((Math.max(end - start, 15)) / total) * 100;
    return [`${left}%`, `${width}%`];
  }

  function getPlanKind(plan) {
    if (plan.proposalType === "gap") return "AI提案 / 空き時間";
    if (plan.type === "option") return "競合候補 / 投票中";
    return "確定予定";
  }

  function closePopover() {
    if (!activePopover) return;
    activePopover.block.setAttribute("aria-expanded", "false");
    activePopover.popover.remove();
    activePopover = null;
  }

  function showPopover(block, plan) {
    closePopover();
    if (!block.classList.contains("narrow")) return;
    const layout = block.closest(".timeline-layout");
    if (!layout) return;

    const popover = document.createElement("div");
    popover.className = "schedule-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", `${plan.title}の予定詳細`);

    const kind = document.createElement("span");
    kind.className = `schedule-popover-kind${plan.proposalType === "gap" ? " ai" : plan.type === "option" ? " conflict" : ""}`;
    kind.textContent = getPlanKind(plan);
    popover.appendChild(kind);

    const title = document.createElement("h4");
    title.textContent = plan.title;
    popover.appendChild(title);

    const time = document.createElement("p");
    time.textContent = `日時：${plan.time}`;
    popover.appendChild(time);

    const location = document.createElement("p");
    location.textContent = `場所：${plan.location || "指定なし"}`;
    popover.appendChild(location);

    if (plan.aiReason) {
      const reason = document.createElement("p");
      reason.textContent = `理由：${plan.aiReason}`;
      popover.appendChild(reason);
    }
    if (plan.noteId) {
      const link = document.createElement("a");
      link.href = `screen1.html#${plan.noteId}`;
      link.textContent = "付箋を見る ↗";
      popover.appendChild(link);
    }

    const close = document.createElement("button");
    close.type = "button";
    close.className = "schedule-popover-close";
    close.setAttribute("aria-label", "予定詳細を閉じる");
    close.textContent = "×";
    close.addEventListener("click", closePopover);
    popover.appendChild(close);

    layout.appendChild(popover);
    const layoutRect = layout.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    const popoverWidth = Math.min(260, Math.max(180, layoutRect.width - 16));
    popover.style.width = `${popoverWidth}px`;
    const left = Math.min(
      Math.max(8, blockRect.left - layoutRect.left),
      layoutRect.width - popoverWidth - 8
    );
    const popoverHeight = popover.offsetHeight;
    const belowTop = blockRect.bottom - layoutRect.top + 8;
    const aboveTop = blockRect.top - layoutRect.top - popoverHeight - 8;
    const top = blockRect.bottom + popoverHeight + 8 <= window.innerHeight
      ? belowTop
      : aboveTop;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    block.setAttribute("aria-expanded", "true");
    activePopover = { block, popover };
  }

  function createPlanBlock(plan, options = {}) {
    const block = document.createElement("div");
    const duration = parseTime(plan.end) - parseTime(plan.start);
    const classes = [
      "schedule-block",
      plan.type === "option" ? "option" : plan.status === "draft" ? "draft" : "",
      plan.proposalType === "gap" ? "ai-suggestion" : "",
      duration <= 90 ? "compact" : "",
      duration <= 30 ? "narrow" : "",
      options.rejected ? "rejected" : ""
    ].filter(Boolean);
    block.className = classes.join(" ");
    block.dataset.planId = plan.id;
    block.title = plan.title;
    const position = getTimelinePosition(plan);
    block.style.left = position[0];
    block.style.width = position[1];

    if (options.rejected) {
      const status = document.createElement("span");
      status.className = "tag held";
      status.textContent = "不採用";
      block.appendChild(status);
    }
    if (duration <= 30) {
      const marker = document.createElement("span");
      marker.className = "schedule-marker";
      marker.setAttribute("aria-hidden", "true");
      marker.textContent = plan.proposalType === "gap" ? "AI" : plan.type === "option" ? "候" : "確";
      block.appendChild(marker);
    }
    const title = document.createElement("h3");
    title.className = "schedule-title";
    title.textContent = plan.title;
    block.appendChild(title);
    if (plan.proposalType === "gap") {
      const origin = document.createElement("span");
      origin.className = "schedule-origin";
      origin.textContent = "AI提案";
      block.appendChild(origin);
    }
    const meta = document.createElement("div");
    meta.className = "schedule-meta";
    meta.textContent = `${plan.time}${plan.location ? ` ・ ${plan.location}` : ""}`;
    block.appendChild(meta);

    if (plan.noteId) {
      const link = document.createElement("a");
      link.className = "schedule-note";
      link.href = `screen1.html#${plan.noteId}`;
      link.textContent = "付箋を見る ↗";
      block.appendChild(link);
    } else if (plan.aiReason) {
      const reason = document.createElement("span");
      reason.className = "schedule-reason";
      reason.textContent = `AIが提案した理由：${plan.aiReason}`;
      block.appendChild(reason);
    }
    if (duration <= 30) {
      block.tabIndex = 0;
      block.setAttribute("aria-expanded", "false");
      block.addEventListener("mouseenter", () => showPopover(block, plan));
      block.addEventListener("focus", () => showPopover(block, plan));
      block.addEventListener("click", (event) => {
        if (event.target.closest("a")) return;
        showPopover(block, plan);
      });
      block.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showPopover(block, plan);
        } else if (event.key === "Escape") {
          closePopover();
        }
      });
    }
    return block;
  }

  function createTrack(plans, options = {}) {
    const track = document.createElement("div");
    track.className = "time-track";
    plans.forEach((plan) => track.appendChild(createPlanBlock(plan, options)));
    return track;
  }

  function createConfirmedRow() {
    const row = document.createElement("div");
    row.className = "timeline-row confirmed-row";
    const label = document.createElement("div");
    label.className = "row-label";
    label.innerHTML = "<strong>確定プラン</strong><span>重複しない予定と採用済みの案</span>";
    row.appendChild(label);

    const confirmedIds = ["plan-market", "plan-cafe", selection.museum];
    if (selection.lunch) confirmedIds.push(selection.lunch);
    if (selection.afternoon) confirmedIds.push(selection.afternoon);
    data.plans
      .filter((plan) => plan.proposalType === "gap" && aiSuggestionStates[plan.id] === "adopted")
      .forEach((plan) => confirmedIds.push(plan.id));
    const confirmedPlans = confirmedIds
      .map((id) => findPlan(id))
      .filter(Boolean)
      .sort((a, b) => a.start.localeCompare(b.start));
    row.appendChild(createTrack(confirmedPlans));
    return row;
  }

  function createSuggestionRow(plan) {
    const row = document.createElement("div");
    row.className = "timeline-row suggestion-row";
    const label = document.createElement("div");
    label.className = "row-label suggestion-label";

    const name = document.createElement("strong");
    name.className = "candidate-name";
    name.textContent = `AI提案：${plan.title}`;
    label.appendChild(name);
    const meta = document.createElement("span");
    meta.className = "candidate-meta";
    meta.textContent = `${plan.time} / 空き時間`;
    label.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "candidate-actions ai-suggestion-actions";
    const adopt = document.createElement("button");
    adopt.className = "ai-adopt-button";
    adopt.dataset.aiAdopt = plan.id;
    adopt.textContent = "採用する";
    actions.appendChild(adopt);
    const reject = document.createElement("button");
    reject.className = "ai-reject-button";
    reject.dataset.aiReject = plan.id;
    reject.textContent = "却下する";
    actions.appendChild(reject);
    label.appendChild(actions);
    row.appendChild(label);
    row.appendChild(createTrack([plan]));
    return row;
  }

  function createCandidateRow(group, plan, rejected) {
    const row = document.createElement("div");
    row.className = "timeline-row candidate-row";
    const label = document.createElement("div");
    label.className = "row-label candidate-label";

    const name = document.createElement("strong");
    name.className = "candidate-name";
    name.textContent = `${group.label}：${plan.title}`;
    label.appendChild(name);
    const meta = document.createElement("span");
    meta.className = "candidate-meta";
    meta.textContent = `${plan.time} / ${rejected ? "不採用" : `${getVotes(plan)}票`}`;
    label.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "candidate-actions";
    if (!rejected) {
      const vote = document.createElement("button");
      vote.className = `vote-button${votedPlans.has(plan.id) ? " voted" : ""}`;
      vote.dataset.vote = plan.id;
      vote.textContent = votedPlans.has(plan.id) ? "♥ 投票済み" : "♡ 投票";
      actions.appendChild(vote);
      const count = document.createElement("span");
      count.className = "vote-count";
      count.textContent = `${getVotes(plan)}票`;
      actions.appendChild(count);
      const adopt = document.createElement("button");
      adopt.className = "adopt-button";
      adopt.dataset.adopt = plan.id;
      adopt.dataset.group = group.id;
      adopt.textContent = "この案を採用";
      actions.appendChild(adopt);
    } else {
      const status = document.createElement("span");
      status.className = "tag held";
      status.textContent = "不採用";
      actions.appendChild(status);
    }
    label.appendChild(actions);
    row.appendChild(label);
    row.appendChild(createTrack([plan], { rejected }));
    return row;
  }

  function renderPlans() {
    closePopover();
    rows.innerHTML = "";
    rows.appendChild(createConfirmedRow());
    groups.forEach((group) => {
      const selected = selection[group.id];
      const candidateIds = selected === "plan-museum"
        ? ["plan-museum-option"]
        : selected
          ? group.planIds.filter((id) => id !== selected)
          : group.planIds;
      candidateIds
        .forEach((id) => {
          const plan = findPlan(id);
          if (!plan) return;
          const rejected = Boolean(
            selected &&
            !(group.id === "museum" && selected === "plan-museum") &&
            id !== selected
          );
          rows.appendChild(createCandidateRow(group, plan, rejected));
        });
    });
    data.plans
      .filter((plan) => plan.proposalType === "gap" && !aiSuggestionStates[plan.id])
      .forEach((plan) => rows.appendChild(createSuggestionRow(plan)));
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

  function bindPlanInteractions() {
    document.querySelectorAll("[data-vote]").forEach((button) => {
      button.addEventListener("click", () => {
        const planId = button.dataset.vote;
        const voted = votedPlans.has(planId);
        voteAdjustments[planId] = (voteAdjustments[planId] || 0) + (voted ? -1 : 1);
        if (voted) votedPlans.delete(planId);
        else votedPlans.add(planId);
        renderPlans();
        bindPlanInteractions();
      });
    });
    document.querySelectorAll("[data-adopt]").forEach((button) => {
      button.addEventListener("click", () => {
        selection[button.dataset.group] = button.dataset.adopt;
        renderPlans();
        bindPlanInteractions();
      });
    });
    document.querySelectorAll("[data-ai-adopt]").forEach((button) => {
      button.addEventListener("click", () => {
        aiSuggestionStates[button.dataset.aiAdopt] = "adopted";
        renderPlans();
        bindPlanInteractions();
      });
    });
    document.querySelectorAll("[data-ai-reject]").forEach((button) => {
      button.addEventListener("click", () => {
        aiSuggestionStates[button.dataset.aiReject] = "rejected";
        renderPlans();
        bindPlanInteractions();
      });
    });
  }

  function bindHistoryInteractions() {
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

  document.addEventListener("pointerdown", (event) => {
    if (activePopover && !activePopover.popover.contains(event.target) && !activePopover.block.contains(event.target)) {
      closePopover();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePopover();
  });

  renderPlans();
  bindPlanInteractions();
  renderHistory();
  bindHistoryInteractions();
  document.getElementById("history-toggle").addEventListener("click", () => { drawer.hidden = !drawer.hidden; });
  document.getElementById("history-close").addEventListener("click", () => { drawer.hidden = true; });
})();
