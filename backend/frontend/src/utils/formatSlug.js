export const formatSlug = (val) =>
  val
    .replace(/ /g, "-")
    .replace(/[^\w-]+/g, "")
    .toLowerCase();

// const slugHook = formatSlugHook('name')

// Example call:
// slugHook({
//   data: { name: 'Test Category' },
//   operation: 'create',
//   value: undefined
// })
// Would return: 'test-category'

// Another example with existing value:
// slugHook({
//   data: { name: 'Test Category' },
//   operation: 'update',
//   value: 'existing-slug'
// })
// Would return: 'existing-slug' (keeps existing value on update)
export const formatSlugHook =
  (fallback) =>
  ({ data, operation, value }) => {
    if (typeof value === "string") {
      return formatSlug(value);
    }

    if (operation === "create" || !data?.slug) {
      const fallbackData = data?.[fallback] || data?.[fallback];

      if (fallbackData && typeof fallbackData === "string") {
        return formatSlug(fallbackData);
      }
    }

    return value;
  };
