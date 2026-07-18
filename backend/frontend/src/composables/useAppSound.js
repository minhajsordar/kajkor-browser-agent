export function useAppSound() {
  const swipeSound = document.getElementById("swipeSound");
  const scannedSound = document.getElementById("scannedSound");
  const playTestSound = () => {
    let audio = new Audio(import("@/assets/sounds/01.wav"));
    audio.play();
    try {
      audio = new Audio(import("@/assets/sounds/failed.mp3"));
      audio.play();
    } catch (error) {
      audio = new Audio(import("@/assets/sounds/failed.ogg"));
      audio.play();
    }
  };
  return { playTestSound };
}
