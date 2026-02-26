type FileSourceInput = {
  efta_id: string;
  dataset: string | null;
  file_path: string | null;
};

export function buildOriginalLink(input: FileSourceInput): string | null {
  if (!input.dataset || !input.file_path) {
    return null;
  }

  const datasetNumber = Number(input.dataset);
  if (Number.isNaN(datasetNumber)) {
    return null;
  }

  const volume = `VOL${String(datasetNumber).padStart(5, "0")}`;
  let normalizedPath = input.file_path.replace(/^\/+/, "");

  // Dataset 9 originals are hosted without the intermediate IMAGES subfolder.
  if (datasetNumber === 9) {
    const parts = normalizedPath.split("/").filter(Boolean);
    const fileName = parts[parts.length - 1];
    if (fileName) {
      normalizedPath = `IMAGES/${fileName}`;
    }
  }

  return `https://doj-files.geeken.dev/doj_zips/${volume}/${normalizedPath}`;
}

export function buildDojLink(input: FileSourceInput): string | null {
  if (!input.dataset) {
    return null;
  }

  const datasetNumber = Number(input.dataset);
  if (Number.isNaN(datasetNumber)) {
    return null;
  }

  return `https://www.justice.gov/epstein/files/DataSet%20${datasetNumber}/${input.efta_id}.pdf`;
}

export function withSources<T extends FileSourceInput>(row: T) {
  return {
    ...row,
    sources: {
      original_link: buildOriginalLink(row),
      doj_link: buildDojLink(row),
    },
  };
}

export function buildKinoThumbnailLink(input: {
  efta_id: string;
  dataset: string | null;
  width?: number;
  quality?: number;
}) {
  if (!input.dataset) {
    return null;
  }

  const datasetNumber = Number(input.dataset);
  if (Number.isNaN(datasetNumber)) {
    return null;
  }

  const efta = input.efta_id.trim().toLowerCase();
  if (!efta) {
    return null;
  }

  return ``;
}

export function isGetKinoUrl(url: string | null | undefined) {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "getkino.com" ||
        parsed.hostname.endsWith(".getkino.com"))
    );
  } catch {
    return false;
  }
}

export function buildKinoProxyUrl() {
  return "";
}
