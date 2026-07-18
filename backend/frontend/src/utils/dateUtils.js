/**
 * Converts a date string to the beginning of the day (00:00:00.000)
 * @param {string} dateString - The date string (YYYY-MM-DD format)
 * @returns {string} ISO string with time set to beginning of day
 */
export const toStartOfDay = (dateString) => {
  if (!dateString) return null;
  const startOfDay = new Date(dateString);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay.toISOString();
};

/**
 * Converts a date string to the end of the day (23:59:59.999)
 * @param {string} dateString - The date string (YYYY-MM-DD format)
 * @returns {string} ISO string with time set to end of day
 */
export const toEndOfDay = (dateString) => {
  if (!dateString) return null;
  const endOfDay = new Date(dateString);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay.toISOString();
};

/**
 * Creates a date filter object with proper start and end of day times
 * @param {string} startDate - Start date string (YYYY-MM-DD format)
 * @param {string} endDate - End date string (YYYY-MM-DD format)
 * @returns {object} Filter object with $gte and $lte properties
 */
export const createDateFilter = (startDate, endDate) => {
  const filter = {};
  if (startDate) {
    filter.$gte = toStartOfDay(startDate);
  }
  if (endDate) {
    filter.$lte = toEndOfDay(endDate);
  }
  return filter;
};
