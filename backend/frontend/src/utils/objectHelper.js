export const extractFields = (obj, fields = []) => {
  const opObj = {};
  for (const field of fields) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, field)) {
      opObj[field] = obj[field];
    }
  }
  return opObj;
};

export const updateObjectFields = (
  obj,
  payloadObject,
  {
    updateFields = [],
    numberFields = [],
    numberFieldsDefaultFill = 0,
    booleanFields = [],
    dateFields = [],
    dateStringFields = [],
    stringFields = [],
    stringFieldsStrict = [],
    jsonParse = [],
    arrayFields = [],
    objectFields = [],
  }
) => {
  const payload = JSON.parse(JSON.stringify(payloadObject));
  for (const updateField of updateFields) {
    if (Object.prototype.hasOwnProperty.call(payload, updateField)) {
      obj[updateField] = payload[updateField];
    }
  }
  for (const updateField of numberFields) {
    if (Object.prototype.hasOwnProperty.call(payload, updateField)) {
      const value = payload[updateField];
      if (typeof value === "number") {
        obj[updateField] = Number(value);
      } else if (!isNaN(Number(value))) {
        obj[updateField] = Number(value);
      } else {
        obj[updateField] = numberFieldsDefaultFill;
      }
    }
  }
  for (const updateField of booleanFields) {
    if (Object.prototype.hasOwnProperty.call(payload, updateField)) {
      const value = payload[updateField];
      if (typeof value === "boolean") {
        obj[updateField] = value;
      } else if (typeof value === "string") {
        if (value === "true") {
          obj[updateField] = true;
        } else if (value === "false") {
          obj[updateField] = false;
        }
      } else if (typeof value === "number") {
        if (value === 0) {
          obj[updateField] = false;
        } else {
          obj[updateField] = true;
        }
      }
    }
  }
  for (const updateField of dateFields) {
    if (Object.prototype.hasOwnProperty.call(payload, updateField)) {
      const value = payload[updateField];
      if (value instanceof Date) {
        obj[updateField] = value;
      } else if (typeof value === "string") {
        if (Date.parse(value)) {
          obj[updateField] = new Date(value);
        }
      }
    }
  }
  for (const updateField of dateStringFields) {
    if (Object.prototype.hasOwnProperty.call(payload, updateField)) {
      const value = payload[updateField];
      if (typeof value === "string") {
        if (Date.parse(value)) {
          obj[updateField] = new Date(value);
        }
      } else if (typeof value === "object" && value !== null) {
        obj[updateField] = JSON.stringify(value);
      }
    }
  }
  for (const updateField of stringFields) {
    if (Object.prototype.hasOwnProperty.call(payload, updateField)) {
      const value = payload[updateField];
      if (typeof value === "object" && value !== null) {
        obj[updateField] = JSON.stringify(value);
      } else {
        obj[updateField] = String(value);
      }
    }
  }
  for (const updateField of stringFieldsStrict) {
    if (Object.prototype.hasOwnProperty.call(payload, updateField)) {
      const value = payload[updateField];
      if (value) {
        obj[updateField] = String(value);
      } else {
        obj[updateField] = null;
      }
    }
  }
  for (const updateField of jsonParse) {
    if (Object.prototype.hasOwnProperty.call(payload, updateField)) {
      const value = payload[updateField];
      if (typeof value === "string" && value !== null) {
        obj[updateField] = JSON.parse(value);
      }
    }
  }
  for (const updateField of arrayFields) {
    if (
      Object.prototype.hasOwnProperty.call(payload, updateField) &&
      Array.isArray(payload[updateField])
    ) {
      obj[updateField] = payload[updateField];
    }
  }
  for (const updateField of objectFields) {
    if (
      Object.prototype.hasOwnProperty.call(payload, updateField) &&
      typeof payload[updateField] === "object" &&
      payload[updateField] !== null &&
      !Array.isArray(payload[updateField])
    ) {
      obj[updateField] = payload[updateField];
    }
  }
  return obj;
};
export const checkFields = (
  payloadObject,
  {
    required = false,
    allowEmptyString = true,
    allowEmptyArray = true,
    arrayFields = [],
    objectFields = [],
    stringFields = [],
    numberFields = [],
    booleanFields = [],
    dateFields = [],
    dateStringFields = [],
  }
) => {
  const payload = JSON.parse(JSON.stringify(payloadObject));
  const errors = {};
  if (required) {
    for (const field of [
      ...arrayFields,
      ...objectFields,
      ...stringFields,
      ...booleanFields,
      ...dateFields,
      ...dateStringFields,
    ]) {
      if (
        !Object.prototype.hasOwnProperty.call(payload, field) ||
        !payload[field]
      ) {
        errors[field] = `Please provide ${field}`;
      }
    }
    for (const field of [...numberFields]) {
      if (!Object.prototype.hasOwnProperty.call(payload, field)) {
        errors[field] = `Please provide ${field}`;
      }
    }
  }
  // array fields
  for (const field of arrayFields) {
    if (
      Object.prototype.hasOwnProperty.call(payload, field) &&
      !Array.isArray(payload[field])
    ) {
      errors[field] = `Please provide ${field} as array`;
    } else if (
      Object.prototype.hasOwnProperty.call(payload, field) &&
      Array.isArray(payload[field]) &&
      !allowEmptyArray &&
      payload[field].length === 0
    ) {
      errors[field] = `${field} is required, at least one value.`;
    }
  }
  // object fields
  for (const field of objectFields) {
    if (
      (Object.prototype.hasOwnProperty.call(payload, field) &&
        typeof payload[field] !== "object") ||
      Array.isArray(payload[field])
    ) {
      errors[field] = `Please provide ${field} as object`;
    }
  }
  // string fields
  for (const field of stringFields) {
    if (
      allowEmptyString &&
      Object.prototype.hasOwnProperty.call(payload, field) &&
      typeof payload[field] !== "string"
    ) {
      errors[field] = `Please provide ${field}`;
    } else if (
      Object.prototype.hasOwnProperty.call(payload, field) &&
      typeof payload[field] == "string" &&
      !payload[field].trim()
    ) {
      errors[field] = `Please provide ${field}`;
    }
  }
  // number fields
  for (const field of numberFields) {
    if (
      Object.prototype.hasOwnProperty.call(payload, field) &&
      typeof payload[field] !== "number"
    ) {
      errors[field] = `Please provide ${field} as number`;
    }
  }
  // boolean fields
  for (const field of booleanFields) {
    if (
      Object.prototype.hasOwnProperty.call(payload, field) &&
      typeof payload[field] !== "boolean"
    ) {
      errors[field] = `Please provide ${field} as boolean`;
    }
  }
  // date fields
  for (const field of dateFields) {
    if (
      Object.prototype.hasOwnProperty.call(payload, field) &&
      !(payload[field] instanceof Date)
    ) {
      errors[field] = `Please provide ${field} as date`;
    }
  }
  // date string
  for (const field of dateStringFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      if (payload[field] instanceof Date) {
        continue;
      }
      const date = new Date(payload[field]);
      if (isNaN(date.getTime())) {
        errors[field] = `Please provide ${field} as valid date string`;
      }
    }
  }
  return errors;
};

// const dummyInput = {
//     arrayField: ["s"],
//     objectField: { "hello": "x" },
//     stringField: "2",
//     numberField: 0,
//     booleanField: false,
//     dateField: new Date(),
//     dateStringField: "2024-01-01",
//     dateNumberField: 1640995200000
// };
// console.log(checkFields(dummyInput, {
//     required: true,
//     arrayFields: ["arrayField"],
//     objectFields: ["objectField"],
//     stringFields: ["stringField"],
//     numberFields: ["numberField"],
//     booleanFields: ["booleanField"],
//     dateFields: ["dateField"],
//     dateStringFields: ["dateStringField", "dateNumberField"],
// }));
