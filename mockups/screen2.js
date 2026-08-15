(function () {
  const drawer = document.getElementById("history-drawer");
  document.getElementById("history-toggle").addEventListener("click", () => { drawer.hidden = !drawer.hidden; });
  document.getElementById("history-close").addEventListener("click", () => { drawer.hidden = true; });
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
})();
