/** Shape of a dictionary: nested objects of strings. */
export type TranslationTree = { readonly [key: string]: string | TranslationTree };
