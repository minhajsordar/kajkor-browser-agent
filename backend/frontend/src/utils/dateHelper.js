export const getHourMinutes = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return `${`0${d.getHours()}`.slice(-2)}:${`0${d.getMinutes()}`.slice(-2)}`;
};
export function decimalToTime(decimalTime) {
    // Calculate total seconds
    if(!decimalTime) return "00:00:00";
    const totalSeconds = Math.round(decimalTime * 3600); // Avoid floating-point errors

    // Extract hours, minutes, seconds
    const hours = Math.floor(totalSeconds / 3600);
    const remainingSeconds = totalSeconds % 3600;
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    // Return as object (flexible for formatting)
    return `${hours}:${minutes}:${seconds}`;
}

const DateHelper = {
  // BASIC FORMATTING
  format(date, formatStr = 'yyyy-MM-dd') {
    if(!date) return formatStr;
    const d = new Date(date);
    const pad = (num) => num.toString().padStart(2, '0');
    
    const replacements = {
      'yyyy': d.getFullYear(),
      'yy': d.getFullYear().toString().slice(-2),
      'MM': pad(d.getMonth() + 1),
      'M': d.getMonth() + 1,
      'dd': pad(d.getDate()),
      'd': d.getDate(),
      'HH': pad(d.getHours()),
      'H': d.getHours(),
      'mm': pad(d.getMinutes()),
      'm': d.getMinutes(),
      'ss': pad(d.getSeconds()),
      's': d.getSeconds(),
      'SSS': pad(d.getMilliseconds(), 3),
      'a': d.getHours() < 12 ? 'AM' : 'PM'
    };

    return formatStr.replace(/yyyy|yy|MM|M|dd|d|HH|H|mm|m|ss|s|SSS|a/g, match => replacements[match]);
  },

  // CONVERSIONS
  toUTC(date) {
    const d = typeof date === 'string'? new Date(date): date;
    return new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  },

  toLocal(date) {
    const d = typeof date === 'string'? new Date(date): date;
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  },

  hmsToDecimal(timeStr) {
    const parts = timeStr.split(':').map(Number);
    const hours = parts[0] || 0;
    const minutes = parts[1] || 0;
    const seconds = parts[2] || 0;
    return hours + (minutes / 60) + (seconds / 3600);
  },

  decimalToHMS(decimalTime) {
    const totalSeconds = Math.round(decimalTime * 3600);
    const hours = Math.floor(totalSeconds / 3600);
    const remainingSeconds = totalSeconds % 3600;
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return { hours, minutes, seconds };
  },

  // DATE MANIPULATION
  addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  },

  addMonths(date, months) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  },

  addYears(date, years) {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() + years);
    return result;
  },

  // COMPARISONS
  isBefore(date1, date2) {
    return new Date(date1) < new Date(date2);
  },

  isAfter(date1, date2) {
    return new Date(date1) > new Date(date2);
  },

  isSame(date1, date2, granularity = 'day') {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    
    if (granularity === 'year') {
      return d1.getFullYear() === d2.getFullYear();
    }
    if (granularity === 'month') {
      return d1.getFullYear() === d2.getFullYear() && 
             d1.getMonth() === d2.getMonth();
    }
    if (granularity === 'day') {
      return d1.getFullYear() === d2.getFullYear() && 
             d1.getMonth() === d2.getMonth() && 
             d1.getDate() === d2.getDate();
    }
    return d1.getTime() === d2.getTime();
  },

  // DIFFERENCE CALCULATION
  diffInDays(date1, date2) {
    const diff = Math.abs(new Date(date1) - new Date(date2));
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  },

  diffInHours(date1, date2) {
    const diff = Math.abs(new Date(date1) - new Date(date2));
    return Math.floor(diff / (1000 * 60 * 60));
  },

  diffInMinutes(date1, date2) {
    const diff = Math.abs(new Date(date1) - new Date(date2));
    return Math.floor(diff / (1000 * 60));
  },

  // VALIDATION
  isValid(date) {
    return date instanceof Date && !isNaN(date);
  },

  isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  },

  // UTILITIES
  startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  },

  getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  },

  // WEEK RELATED
  getDayOfWeek(date, startOfWeek = 0) {
    const day = date.getDay();
    return (day - startOfWeek + 7) % 7;
  },

  isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  },
  getCurrentMonthRange() {
    const now = new Date();
  
    // First day of this month (UTC midnight)
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  
    // First day of next month (UTC midnight)
    const startOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  
    // End = last day midnight (like 2025-09-30T00:00:00.000Z)
    const end = new Date(startOfNextMonth.getTime() - 24 * 60 * 60 * 1000);
  
    return { start, end };
  },
  // PARSING
  parse(dateStr, formatStr = 'yyyy-MM-dd') {
    // Simple parser - works for common formats
    const parts = {};
    const formatParts = formatStr.match(/yyyy|yy|MM|M|dd|d|HH|H|mm|m|ss|s/g) || [];
    
    const values = dateStr.split(/[^0-9]/);
    
    formatParts.forEach((part, i) => {
      parts[part] = parseInt(values[i], 10);
    });
    
    const year = parts.yyyy || (parts.yy ? 2000 + parts.yy : new Date().getFullYear());
    const month = (parts.MM || parts.M || 1) - 1;
    const day = parts.dd || parts.d || 1;
    const hours = parts.HH || parts.H || 0;
    const minutes = parts.mm || parts.m || 0;
    const seconds = parts.ss || parts.s || 0;
    
    return new Date(year, month, day, hours, minutes, seconds);
  }
};
export default DateHelper;
