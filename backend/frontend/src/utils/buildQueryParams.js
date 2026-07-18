export default function buildQueryParams(params) {
  let queryParams = '';

  for (const key in params) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      const value = params[key];
      if (value !== undefined && value !== null && value !== '') {
        if (queryParams !== '') {
          queryParams += '&';
        }
        queryParams += `${key}=${encodeURIComponent(String(value))}`;
      }
    }
  }

  return queryParams;
}
