(function () {
  const views = ["day", "week", "month", "agenda"];
  const events = window.AIAU_DATA.calendarEvents;
  const detail = document.getElementById("event-detail");
  function showEvent(id) {
    const event = events.find((item) => item.id === id);
    if (!event || event.type === "undecided") {
      if (event && event.type === "undecided") window.location.href = "screen2.html";
      return;
    }
    document.querySelectorAll(".calendar-event.selected").forEach((item) => item.classList.remove("selected"));
    document.querySelectorAll(`[data-event="${id}"]`).forEach((item) => item.classList.add("selected"));
    detail.className = "event-detail";
    detail.innerHTML = `<span class="detail-label">${event.label}</span><h3>${event.title}</h3><dl class="detail-list"><div><dt>日時</dt><dd>${event.date} ${event.time}</dd></div><div><dt>場所</dt><dd>${event.location || "場所の指定なし"}</dd></div><div><dt>メモ</dt><dd>${event.detail || "メモはありません。"}</dd></div>${event.cost ? `<div><dt>費用</dt><dd>${event.cost}</dd></div>` : ""}</dl><div class="detail-links">${event.noteId ? `<a href="screen1.html#${event.noteId}">元の付箋を見る ↗</a>` : ""}${event.planId ? `<a href="screen2.html">プランを開く ↗</a>` : ""}</div>`;
  }
  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const selected = tab.dataset.view;
      document.querySelectorAll(".view-tab").forEach((item) => item.classList.toggle("active", item === tab));
      views.forEach((view) => { document.getElementById(`view-${view}`).hidden = view !== selected; });
    });
  });
  document.querySelectorAll("[data-event]").forEach((item) => {
    item.addEventListener("click", (event) => {
      if (item.tagName === "A") return;
      event.preventDefault();
      showEvent(item.dataset.event);
    });
  });
})();
