type ExportFile = {
  content: unknown;
};

export function buildJsonlTextExport(files: ExportFile[]) {
  return files.map((file) => JSON.stringify(file.content)).join("\n");
}

export function textExportName(name: string) {
  return name.replace(/\.json$/i, ".txt");
}
