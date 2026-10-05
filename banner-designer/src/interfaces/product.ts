export interface SearchParamsInterface {
  page_size?: string;
  page?: string;
  search?: string;
};

export interface SearchParamsPageBuilderInterface extends SearchParamsInterface {
  iframe?: string;
};
