export function isValidEmail(email) {
  const emailRegex = /^[^s@]+@[^s@]+.[^s@]+$/;
  return emailRegex.test(email);
}
export function isValidNumber(value) {
  return (
    !isNaN(value) &&
    (typeof value === "number" ||
      (typeof value === "string" && value.trim() !== ""))
  );
}
export const emptyValidator = (val) => val !== null && val !== "";
export const stringValidator = (val) => val && val.length > 0;
export const numberValidator = (val) =>
  val !== null && val !== "" && isValidNumber(val);
export const emailValidator = (val) =>
  val !== null && val !== "" && isValidEmail(val);
