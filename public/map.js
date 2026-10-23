// Click-to-toggle on the map, posting through a hidden form (keeps the server as the source of truth).
const map = document.querySelector(".map.editable");
const form = document.getElementById("toggleForm");
if (map && form) {
  map.addEventListener("click", (event) => {
    const path = event.target.closest("path[data-code]");
    if (!path) return;
    form.elements.code.value = path.dataset.code;
    form.submit();
  });
}

document.querySelectorAll("form[data-confirm]").forEach((f) => {
  f.addEventListener("submit", (event) => {
    if (!confirm(f.dataset.confirm)) event.preventDefault();
  });
});
