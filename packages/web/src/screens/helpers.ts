/** Detect contents rather than relying on the filename; trimStart also removes a UTF-8 BOM. */
export const importFormat = (text: string): "json" | "csv" => {
  const content = text.trimStart()
  return content.startsWith("{") || content.startsWith("[") ? "json" : "csv"
}
