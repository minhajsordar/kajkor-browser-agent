export const setToken = function (key, value) {
  localStorage.setItem(`${key}`, value);
};
export const getToken = function (key) {
  const token = localStorage.getItem(key);
  if (token) {
    return token;
  }
};
export const removeToken = function (key) {
  localStorage.removeItem(key);
};
const token = {
  setToken,
  getToken,
  removeToken,
};
export default token;
