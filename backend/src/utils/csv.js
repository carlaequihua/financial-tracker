import { parse } from "csv-parse/sync";

export function parseCsv(content) {
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
}

export function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escaped = (v) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
      return "\"" + s.replaceAll("\"", "\"\"") + "\"";
    }
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escaped(row[h])).join(","));
  }
  return lines.join("\n");
}
