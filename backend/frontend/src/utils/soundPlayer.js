const play = (id) => {
  const sound = document.getElementById(id);
  if (sound && typeof sound.play === "function") {
    sound.play().catch(() => {});
  }
};
export const soundPlayer = {
  added: () => play("addedSound"),
  swipe: () => play("swipeSound"),
  scanned: () => play("scannedSound"),
  failed: () => play("failedSound"),
  success: () => play("successSound"),
  save: () => play("saveSound"),
  deleted: () => play("deletedSound"),
  confirm: () => play("confirmSound"),
  error: () => play("errorSound"),
};
export default soundPlayer;
