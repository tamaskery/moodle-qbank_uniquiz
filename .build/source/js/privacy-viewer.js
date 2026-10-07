const dialog = document.querySelector("#privacy-architecture-dialog");
const openButton = document.querySelector("[data-privacy-open]");
const closeButton = dialog?.querySelector("[data-privacy-close]");

if (dialog instanceof HTMLDialogElement && openButton instanceof HTMLButtonElement && closeButton instanceof HTMLButtonElement) {
  openButton.addEventListener("click", () => dialog.showModal());
  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
    }
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => openButton.focus());
}
