import { Client } from "pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type DbFileRow = {
  efta_id: string;
  parent_efta_id: string | null;
  dataset: string | null;
  file_path: string | null;
  page_count: number | null;
  hidden: boolean;
  deleted: boolean;
  altered: boolean;
  shows_in_search: boolean | null;
  last_checked: string | null;
  doj_website_page: number | null;
  notes: string | null;
  description?: string | null;
  original_hash: string | null;
  current_hash: string | null;
  diff_scan_id?: string | number | null;
};

type DatasetRow = {
  dataset: string | null;
};

type StatsRow = {
  total_files: string | number;
  altered_files: string | number;
  hidden_files: string | number;
  deleted_files: string | number;
  files_with_parent: string | number;
  files_without_parent: string | number;
  distinct_datasets: string | number;
  avg_page_count: string | number | null;
  max_page_count: string | number | null;
};
type FilesChangeLogColumnRow = {
  column_name: string;
  data_type: string;
  udt_name: string;
  ordinal_position: string | number;
};

type DOJSearchSuggestionRow = {
  query_text: string;
};
type DOJSearchResultPageRow = {
  result_page: unknown;
};
type V2SearchResultPageRow = {
  result_page: unknown;
};

type DOJSearchResultVoteRow = {
  result_url: string;
  vote_count: number | string;
};

type DOJTopUpvotedResultRow = {
  result_url: string;
  title: string | null;
  file_name: string | null;
  snippet: string | null;
  highlight: string | null;
  file_size: number | string | null;
  vote_count: number | string;
  last_voted_at: string;
};

type DOJSearchResultUserVoteRow = {
  result_url: string;
};
type DOJSearchResultUserBookmarkRow = {
  result_url: string;
};
type DOJSearchResultBookmarkCountRow = {
  result_url: string;
  bookmark_count: number | string;
};
type DOJBookmarkedResultRow = {
  result_url: string;
  title: string | null;
  file_name: string | null;
  snippet: string | null;
  highlight: string | null;
  file_size: number | string | null;
  original_link: string | null;
  doj_link: string | null;
  note: string | null;
  created_at: string;
};

type DeletedBrowserRow = DbFileRow;
type DeletedDocVoteRow = {
  efta_id: string;
  vote_count: number | string;
};
type DeletedDocUserVoteRow = {
  efta_id: string;
};
type DeletedDocUserBookmarkRow = {
  efta_id: string;
};
type DeletedDocTopUpvotedRow = {
  efta_id: string;
  dataset: string | null;
  file_path: string | null;
  original_link: string | null;
  doj_link: string | null;
  thumbnail_url: string | null;
  vote_count: number | string;
  last_voted_at: string;
};
type DeletedDocDescriptionRow = {
  efta_id: string;
  document_description: string | null;
};
type FileDescriptionRow = {
  efta_id: string;
  description: string | null;
};
type FileSourceLookupRow = {
  efta_id: string;
  dataset: string | null;
  file_path: string | null;
  altered: boolean;
  deleted: boolean;
  hidden: boolean;
};
type DeletedDocReportRow = {
  efta_id: string;
  report_count: number | string;
};
type DeletedDocUserReportRow = {
  efta_id: string;
};
type DeletedDocBookmarkedRow = {
  efta_id: string;
  dataset: string | null;
  file_path: string | null;
  original_link: string | null;
  doj_link: string | null;
  note: string | null;
  created_at: string;
};

export type FilesChangeLogFeedItem = {
  efta_id: string;
  changed_at: string | null;
  change_kind: "deleted" | "restored";
  description: string | null;
  hash_matches_original: boolean | null;
  exists_in_files: boolean;
};

export type FilesChangeLogFeed = {
  items: FilesChangeLogFeedItem[];
};

export type SearchParams = {
  q?: string;
  dataset?: string;
  altered?: "all" | "yes" | "no";
  hidden?: "all" | "yes" | "no";
  deleted?: "all" | "yes" | "no";
  page?: number;
  pageSize?: number;
};

export type QueryCacheDebug = {
  mode: "disabled";
  cache: "none";
};

const DB_FILE_COLUMNS = `
  efta_id,
  parent_efta_id,
  dataset,
  file_path,
  page_count,
  hidden,
  deleted,
  altered,
  shows_in_search,
  last_checked::text AS last_checked,
  doj_website_page,
  notes,
  original_hash,
  current_hash
`;

function parseSsl(
  connectionString: string,
): boolean | { rejectUnauthorized: false } {
  try {
    const url = new URL(connectionString);
    const sslMode = (url.searchParams.get("sslmode") || "").toLowerCase();
    if (sslMode === "disable") {
      return false;
    }
    if (sslMode === "require" || sslMode === "prefer" || sslMode === "allow") {
      return { rejectUnauthorized: false };
    }
  } catch {
    // Fall back to permissive SSL for managed Postgres providers.
  }
  return { rejectUnauthorized: false };
}

function getCloudflareConnectionString() {
  try {
    const context = getCloudflareContext();
    const env = context?.env as
      | {
          HYPERDRIVE?: { connectionString?: string };
          POSTGRES_URL?: string;
          DATABASE_URL?: string;
        }
      | undefined;

    return (
      env?.HYPERDRIVE?.connectionString?.trim() ||
      env?.POSTGRES_URL?.trim() ||
      env?.DATABASE_URL?.trim() ||
      ""
    );
  } catch {
    return "";
  }
}

function getCloudflareFreshConnectionString() {
  try {
    const context = getCloudflareContext();
    const env = context?.env as
      | {
          HYPERDRIVE_NO_CACHE?: { connectionString?: string };
          HYPERDRIVE_NOCACHE?: { connectionString?: string };
          POSTGRES_URL_NO_CACHE?: string;
          DATABASE_URL_NO_CACHE?: string;
        }
      | undefined;

    return (
      env?.HYPERDRIVE_NO_CACHE?.connectionString?.trim() ||
      env?.HYPERDRIVE_NOCACHE?.connectionString?.trim() ||
      env?.POSTGRES_URL_NO_CACHE?.trim() ||
      env?.DATABASE_URL_NO_CACHE?.trim() ||
      ""
    );
  } catch {
    return "";
  }
}

function getConnectionString() {
  const connectionString =
    getCloudflareConnectionString() ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Missing POSTGRES_URL (or DATABASE_URL) environment variable.",
    );
  }
  return connectionString;
}

function getFreshConnectionString() {
  return (
    getCloudflareFreshConnectionString() ||
    process.env.POSTGRES_URL_NO_CACHE ||
    process.env.DATABASE_URL_NO_CACHE ||
    getConnectionString()
  );
}

async function withClient<T>(callback: (client: Client) => Promise<T>) {
  const connectionString = getConnectionString();
  const client = new Client({
    connectionString,
    ssl: parseSsl(connectionString),
  });

  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function withFreshClient<T>(callback: (client: Client) => Promise<T>) {
  const connectionString = getFreshConnectionString();
  const client = new Client({
    connectionString,
    ssl: parseSsl(connectionString),
  });

  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function withClientForConnectionString<T>(
  connectionString: string,
  callback: (client: Client) => Promise<T>,
) {
  const client = new Client({
    connectionString,
    ssl: parseSsl(connectionString),
  });

  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function clampPage(value: number | undefined, fallback: number) {
  if (!value || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

function pushFlagFilter(
  where: string[],
  values: unknown[],
  column: string,
  mode: "all" | "yes" | "no" | undefined,
) {
  if (mode === "yes") {
    values.push(true);
    where.push(`${column} = $${values.length}`);
    return;
  }
  if (mode === "no") {
    values.push(false);
    where.push(`${column} = $${values.length}`);
  }
}

function normalizeEftaSearchQuery(query: string) {
  const compact = query.trim().replace(/[\s-]+/g, "").toUpperCase();
  if (!compact) {
    return "";
  }

  if (/^\d+$/.test(compact)) {
    return `EFTA${compact}`;
  }

  const eftaMatch = compact.match(/^EFTA(\d+)$/);
  if (eftaMatch) {
    return `EFTA${eftaMatch[1]}`;
  }

  return compact;
}

function getPrefixUpperBound(prefix: string) {
  if (!prefix) {
    return "";
  }
  for (let index = prefix.length - 1; index >= 0; index -= 1) {
    const code = prefix.charCodeAt(index);
    if (code < 0xffff) {
      return `${prefix.slice(0, index)}${String.fromCharCode(code + 1)}`;
    }
  }
  return "";
}

export function createQueryCacheDebug(): QueryCacheDebug {
  return {
    mode: "disabled",
    cache: "none",
  };
}

export function getQueryCacheHeaderValue(debug: QueryCacheDebug) {
  return `${debug.mode}; cache=${debug.cache}`;
}

export async function getDatasets(
  debug?: QueryCacheDebug,
): Promise<DatasetRow[]> {
  void debug;
  return withClient(async (client) => {
    const result = await client.query<DatasetRow>(
      `
      SELECT dataset
      FROM (
        SELECT DISTINCT dataset
        FROM files
        WHERE dataset IS NOT NULL
      ) AS distinct_datasets
      ORDER BY
        CASE
          WHEN dataset::text ~ '^[0-9]+$' THEN (dataset::text)::numeric
        END ASC NULLS LAST,
        dataset::text ASC
    `,
    );
    return result.rows;
  });
}

export async function getStats(debug?: QueryCacheDebug) {
  void debug;
  return withClient(async (client) => {
    const summary = await client.query<StatsRow>(
      `
    SELECT * FROM files_summary;
      `,
    );
    const byDataset = await client.query<{
      dataset: string | null;
      count: string | number;
    }>(
      `
        SELECT dataset, COUNT(*) AS count
        FROM files
        GROUP BY dataset
        ORDER BY dataset NULLS FIRST
      `,
    );

    const row = summary.rows[0];
    return {
      total_files: Number(toNumber(row?.total_files) || 0),
      altered_files: Number(toNumber(row?.altered_files) || 0),
      hidden_files: Number(toNumber(row?.hidden_files) || 0),
      deleted_files: Number(toNumber(row?.deleted_files) || 0),
      files_with_parent: Number(toNumber(row?.files_with_parent) || 0),
      files_without_parent: Number(toNumber(row?.files_without_parent) || 0),
      distinct_datasets: Number(toNumber(row?.distinct_datasets) || 0),
      avg_page_count: toNumber(row?.avg_page_count),
      max_page_count: toNumber(row?.max_page_count),
      by_dataset: byDataset.rows.map((entry) => ({
        dataset: entry.dataset,
        count: Number(toNumber(entry.count) || 0),
      })),
    };
  });
}

export async function searchFiles(
  params: SearchParams = {},
  debug?: QueryCacheDebug,
) {
  void debug;
  const page = clampPage(params.page, 1);
  const pageSize = Math.min(200, clampPage(params.pageSize, 25));
  const dataset = params.dataset?.trim() ?? "";
  const alteredMode = params.altered || "all";
  const hiddenMode = params.hidden || "all";
  const deletedMode = params.deleted || "all";

  const where: string[] = [];
  const values: unknown[] = [];
  const searchQuery = normalizeEftaSearchQuery(params.q || "");
  const hasSearchQuery = searchQuery.length > 0;

  if (hasSearchQuery) {
    const upperBound = getPrefixUpperBound(searchQuery);
    if (upperBound) {
      values.push(searchQuery);
      const lowerParam = values.length;
      values.push(upperBound);
      const upperParam = values.length;
      where.push(
        `f.efta_id >= $${lowerParam} AND f.efta_id < $${upperParam}`,
      );
    } else {
      values.push(searchQuery);
      where.push(`f.efta_id = $${values.length}`);
    }
  } else {
    where.push(`(f.parent_efta_id IS NULL OR btrim(f.parent_efta_id) = '')`);
  }

  if (dataset) {
    values.push(dataset);
    where.push(`f.dataset = $${values.length}`);
  }

  pushFlagFilter(where, values, "f.altered", alteredMode);
  pushFlagFilter(where, values, "f.hidden", hiddenMode);
  pushFlagFilter(where, values, "f.deleted", deletedMode);

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const isDefaultBrowseQuery =
    !hasSearchQuery &&
    !dataset &&
    alteredMode === "all" &&
    hiddenMode === "all" &&
    deletedMode === "all";

  return withClient(async (client) => {
    let total = 0;
    if (isDefaultBrowseQuery) {
      const summaryResult = await client.query<{ total: string | number }>(
        `SELECT files_without_parent AS total FROM files_summary LIMIT 1`,
      );
      total = Number(toNumber(summaryResult.rows[0]?.total) || 0);
    } else {
      const totalResult = await client.query<{ total: string | number }>(
        `SELECT COUNT(*) AS total FROM files f ${whereSql}`,
        values,
      );
      total = Number(toNumber(totalResult.rows[0]?.total) || 0);
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);

    const pagedValues = [...values, pageSize, (safePage - 1) * pageSize];

    const rowsResult = await client.query<DbFileRow>(
      `
      SELECT
        f.efta_id,
        f.parent_efta_id,
        f.dataset,
        f.file_path,
        f.page_count,
        f.hidden,
        f.deleted,
        f.altered,
        f.shows_in_search,
        f.last_checked::text AS last_checked,
        f.doj_website_page,
        f.notes,
        f.original_hash,
        f.current_hash,
        c.diff_scan_id
      FROM files f
      LEFT JOIN (
        SELECT efta_id, MAX(diff_scan_id) AS diff_scan_id
        FROM changes
        GROUP BY efta_id
      ) c
        ON c.efta_id = f.efta_id
      ${whereSql}
      ORDER BY f.efta_id ASC
      LIMIT $${pagedValues.length - 1}
      OFFSET $${pagedValues.length}
    `,
      pagedValues,
    );

    return {
      total,
      page: safePage,
      pageSize,
      totalPages,
      rows: rowsResult.rows,
    };
  });
}

export async function getFileById(eftaId: string, debug?: QueryCacheDebug) {
  void debug;
  return withClient(async (client) => {
    const fileResult = await client.query<DbFileRow>(
      `
      SELECT ${DB_FILE_COLUMNS}
      FROM files
      WHERE efta_id = $1
      LIMIT 1
    `,
      [eftaId],
    );

    const file = fileResult.rows[0];
    if (!file) {
      return null;
    }

    let fileDescription: string | null = null;
    try {
      const descriptionResult = await client.query<{ description: string | null }>(
        `
          SELECT description
          FROM files
          WHERE efta_id = $1
          LIMIT 1
        `,
        [file.efta_id],
      );
      fileDescription = descriptionResult.rows[0]?.description ?? null;
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
      if (code !== "42703") {
        throw error;
      }
    }

    const parentResult = file.parent_efta_id
      ? await client.query<DbFileRow>(
          `
            SELECT ${DB_FILE_COLUMNS}
            FROM files
            WHERE efta_id = $1
            LIMIT 1
          `,
          [file.parent_efta_id],
        )
      : { rows: [] as DbFileRow[] };
    const childrenResult = await client.query<DbFileRow>(
      `
        SELECT ${DB_FILE_COLUMNS}
        FROM files
        WHERE parent_efta_id = $1
        ORDER BY efta_id ASC
      `,
      [file.efta_id],
    );

    return {
      file: {
        ...file,
        description: fileDescription,
      },
      parent: parentResult.rows[0] ?? null,
      children: childrenResult.rows,
    };
  });
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

function getPreferredTimeColumn(columnNames: string[]) {
  const preferredColumns = [
    "created_at",
    "updated_at",
    "changed_at",
    "change_at",
    "change_time",
    "timestamp",
    "logged_at",
    "inserted_at",
    "recorded_at",
    "event_time",
    "time",
  ];
  const normalized = new Set(columnNames.map((name) => name.toLowerCase()));
  for (const candidate of preferredColumns) {
    if (normalized.has(candidate)) {
      return columnNames.find((name) => name.toLowerCase() === candidate) ?? null;
    }
  }
  return null;
}

export async function getFilesChangeLogFeed(params?: {
  limit?: number;
  offset?: number;
}): Promise<FilesChangeLogFeed> {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(params?.limit ?? 120)));
  const safeOffset = Math.max(0, Math.floor(params?.offset ?? 0));

  return withClient(async (client) => {
    const logColumnsResult = await client.query<FilesChangeLogColumnRow>(
      `
      SELECT column_name, data_type, udt_name, ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'files_change_log'
      ORDER BY ordinal_position ASC
      `,
    );

    const columns = logColumnsResult.rows
      .map((row) => row.column_name)
      .filter((name) => Boolean(name));
    if (columns.length === 0) {
      return { items: [] };
    }

    const eftaColumn =
      columns.find((name) => name.toLowerCase() === "efta_id") ||
      columns.find((name) => name.toLowerCase() === "file_id") ||
      columns.find((name) => name.toLowerCase() === "id") ||
      null;
    if (!eftaColumn) {
      return { items: [] };
    }

    const changedAtColumn = getPreferredTimeColumn(columns);
    const deletedColumn =
      columns.find((name) => name.toLowerCase() === "deleted") ||
      columns.find((name) => name.toLowerCase() === "is_deleted") ||
      columns.find((name) => name.toLowerCase() === "deleted_flag") ||
      null;
    const actionColumn =
      columns.find((name) => name.toLowerCase() === "action") ||
      columns.find((name) => name.toLowerCase() === "change_type") ||
      columns.find((name) => name.toLowerCase() === "event_type") ||
      columns.find((name) => name.toLowerCase() === "operation") ||
      columns.find((name) => name.toLowerCase() === "event") ||
      null;

    const filesColumnsResult = await client.query<FilesChangeLogColumnRow>(
      `
      SELECT column_name, data_type, udt_name, ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'files'
      ORDER BY ordinal_position ASC
      `,
    );
    const filesColumns = new Set(
      filesColumnsResult.rows.map((row) => row.column_name.toLowerCase()),
    );

    const changedAtSql = changedAtColumn
      ? `l.${quoteIdentifier(changedAtColumn)}::text AS changed_at`
      : `NULL::text AS changed_at`;
    const deletedSql = deletedColumn
      ? `l.${quoteIdentifier(deletedColumn)} AS deleted_value`
      : `NULL::text AS deleted_value`;
    const actionSql = actionColumn
      ? `l.${quoteIdentifier(actionColumn)}::text AS action_value`
      : `NULL::text AS action_value`;
    const descriptionSql = filesColumns.has("description")
      ? `f.description::text AS description`
      : `NULL::text AS description`;
    const originalHashSql = filesColumns.has("original_hash")
      ? `f.original_hash::text AS original_hash`
      : `NULL::text AS original_hash`;
    const currentHashSql = filesColumns.has("current_hash")
      ? `f.current_hash::text AS current_hash`
      : `NULL::text AS current_hash`;
    const filesDeletedSql = filesColumns.has("deleted")
      ? `f.deleted AS files_deleted`
      : `NULL::boolean AS files_deleted`;
    const orderSql = changedAtColumn
      ? `ORDER BY l.${quoteIdentifier(changedAtColumn)} DESC NULLS LAST`
      : `ORDER BY l.${quoteIdentifier(eftaColumn)} DESC`;

    const rowsResult = await client.query<{
      efta_id: string | null;
      changed_at: string | null;
      deleted_value: unknown;
      action_value: string | null;
      exists_in_files: boolean;
      description: string | null;
      original_hash: string | null;
      current_hash: string | null;
      files_deleted: boolean | null;
    }>(
      `
      SELECT
        l.${quoteIdentifier(eftaColumn)}::text AS efta_id,
        ${changedAtSql},
        ${deletedSql},
        ${actionSql},
        (f.efta_id IS NOT NULL) AS exists_in_files,
        ${descriptionSql},
        ${originalHashSql},
        ${currentHashSql},
        ${filesDeletedSql}
      FROM public.files_change_log l
      LEFT JOIN public.files f
        ON f.efta_id = l.${quoteIdentifier(eftaColumn)}::text
      WHERE l.${quoteIdentifier(eftaColumn)} IS NOT NULL
        AND btrim(l.${quoteIdentifier(eftaColumn)}::text) <> ''
      ${orderSql}
      LIMIT $1
      OFFSET $2
      `,
      [safeLimit, safeOffset],
    );

    function toDeletedFlag(value: unknown) {
      if (typeof value === "boolean") {
        return value;
      }
      if (typeof value === "number") {
        if (value === 1) {
          return true;
        }
        if (value === 0) {
          return false;
        }
      }
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "t", "1", "yes", "y"].includes(normalized)) {
          return true;
        }
        if (["false", "f", "0", "no", "n"].includes(normalized)) {
          return false;
        }
      }
      return null;
    }

    function resolveChangeKind(
      deletedValue: unknown,
      actionValue: string | null,
      filesDeleted: boolean | null,
    ) {
      const deletedFlag = toDeletedFlag(deletedValue);
      if (deletedFlag === true) {
        return "deleted" as const;
      }
      if (deletedFlag === false) {
        return "restored" as const;
      }
      const action = (actionValue || "").toLowerCase();
      if (/(delete|removed|remove|hidden)/.test(action)) {
        return "deleted" as const;
      }
      if (/(restore|restored|undelete|unhide)/.test(action)) {
        return "restored" as const;
      }
      if (filesDeleted === true) {
        return "deleted" as const;
      }
      if (filesDeleted === false) {
        return "restored" as const;
      }
      return "deleted" as const;
    }

    return {
      items: rowsResult.rows
        .filter((row): row is typeof row & { efta_id: string } => Boolean(row.efta_id))
        .map((row) => {
          const original = row.original_hash?.trim() || null;
          const current = row.current_hash?.trim() || null;
          const hashMatches =
            original && current ? original === current : row.exists_in_files ? null : null;
          return {
            efta_id: row.efta_id,
            changed_at: row.changed_at,
            change_kind: resolveChangeKind(
              row.deleted_value,
              row.action_value,
              row.files_deleted,
            ),
            description: row.description?.trim() || null,
            hash_matches_original: hashMatches,
            exists_in_files: row.exists_in_files,
          };
        }),
    };
  });
}

export async function getFileSourceInputsByEftaIds(eftaIds: string[]) {
  const normalized = eftaIds.map((id) => id.trim().toUpperCase()).filter(Boolean);
  if (normalized.length === 0) {
    return {} as Record<
      string,
      {
        dataset: string | null;
        file_path: string | null;
        altered: boolean;
        deleted: boolean;
        hidden: boolean;
      }
    >;
  }

  return withClient(async (client) => {
    const result = await client.query<FileSourceLookupRow>(
      `
      SELECT efta_id, dataset, file_path, altered, deleted, hidden
      FROM files
      WHERE efta_id = ANY($1::text[])
      `,
      [normalized],
    );

    return result.rows.reduce<
      Record<
        string,
        {
          dataset: string | null;
          file_path: string | null;
          altered: boolean;
          deleted: boolean;
          hidden: boolean;
        }
      >
    >((acc, row) => {
      acc[row.efta_id] = {
        dataset: row.dataset,
        file_path: row.file_path,
        altered: row.altered,
        deleted: row.deleted,
        hidden: row.hidden,
      };
      return acc;
    }, {});
  });
}

export async function refreshFilesSummary() {
  return withClient(async (client) => {
    await client.query("REFRESH MATERIALIZED VIEW files_summary;");
  });
}

export async function refreshFilesSummaryWithConnectionString(
  connectionString: string,
) {
  return withClientForConnectionString(connectionString, async (client) => {
    await client.query("REFRESH MATERIALIZED VIEW files_summary;");
  });
}

async function ensureDojSearchQueriesTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS doj_search_queries (
      query_text TEXT PRIMARY KEY,
      hit_count INTEGER NOT NULL DEFAULT 1,
      last_success_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function ensureDojSearchResultPagesTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS doj_search_result_pages (
      query_text TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      result_page JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (query_text, page_number)
    )
  `);
}

async function ensureDojSearchResultVotesTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS doj_search_result_votes (
      result_url TEXT PRIMARY KEY,
      title TEXT NULL,
      file_name TEXT NULL,
      snippet TEXT NULL,
      highlight TEXT NULL,
      file_size BIGINT NULL,
      vote_count INTEGER NOT NULL DEFAULT 0,
      last_voted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    ALTER TABLE doj_search_result_votes
    ADD COLUMN IF NOT EXISTS snippet TEXT NULL
  `);
  await client.query(`
    ALTER TABLE doj_search_result_votes
    ADD COLUMN IF NOT EXISTS highlight TEXT NULL
  `);
  await client.query(`
    ALTER TABLE doj_search_result_votes
    ADD COLUMN IF NOT EXISTS file_size BIGINT NULL
  `);
}

async function ensureDojSearchResultVoteEventsTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS doj_search_result_vote_events (
      voter_id TEXT NOT NULL,
      result_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (voter_id, result_url)
    )
  `);
}

async function ensureDojSearchResultBookmarksTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS doj_search_result_bookmarks (
      voter_id TEXT NOT NULL,
      result_url TEXT NOT NULL,
      title TEXT NULL,
      file_name TEXT NULL,
      snippet TEXT NULL,
      highlight TEXT NULL,
      file_size BIGINT NULL,
      original_link TEXT NULL,
      doj_link TEXT NULL,
      note TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (voter_id, result_url)
    )
  `);
  await client.query(`
    ALTER TABLE doj_search_result_bookmarks
    ADD COLUMN IF NOT EXISTS note TEXT NULL
  `);
  await client.query(`
    ALTER TABLE doj_search_result_bookmarks
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
}

async function ensureDeletedDocVotesTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS deleted_doc_votes (
      efta_id TEXT PRIMARY KEY,
      dataset TEXT NULL,
      file_path TEXT NULL,
      original_link TEXT NULL,
      doj_link TEXT NULL,
      vote_count INTEGER NOT NULL DEFAULT 0,
      last_voted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function ensureDeletedDocVoteEventsTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS deleted_doc_vote_events (
      voter_id TEXT NOT NULL,
      efta_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (voter_id, efta_id)
    )
  `);
}

async function ensureDeletedDocBookmarksTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS deleted_doc_bookmarks (
      voter_id TEXT NOT NULL,
      efta_id TEXT NOT NULL,
      dataset TEXT NULL,
      file_path TEXT NULL,
      original_link TEXT NULL,
      doj_link TEXT NULL,
      note TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (voter_id, efta_id)
    )
  `);
  await client.query(`
    ALTER TABLE deleted_doc_bookmarks
    ADD COLUMN IF NOT EXISTS note TEXT NULL
  `);
  await client.query(`
    ALTER TABLE deleted_doc_bookmarks
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
}

async function ensureDeletedDocReportsTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS deleted_doc_reports (
      efta_id TEXT PRIMARY KEY,
      report_count INTEGER NOT NULL DEFAULT 0,
      last_reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function ensureDeletedDocReportEventsTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS deleted_doc_report_events (
      voter_id TEXT NOT NULL,
      efta_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (voter_id, efta_id)
    )
  `);
}

async function ensureDeletedDocBlacklistTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS deleted_doc_blacklist (
      efta_id TEXT PRIMARY KEY,
      reason TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function ensureV2SearchResultPagesTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS search_v2_result_pages (
      query_text TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      result_page JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (query_text, page_number)
    )
  `);
}

async function ensureV2SearchQueriesTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS search_v2_queries (
      query_text TEXT PRIMARY KEY,
      hit_count INTEGER NOT NULL DEFAULT 1,
      last_success_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function ensureDeletedDocThumbnailsTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS deleted_doc_thumbnails (
      efta_id TEXT PRIMARY KEY,
      thumbnail_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function ensureDeletedDocDescriptionsTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS deleted_doc_descriptions (
      efta_id TEXT PRIMARY KEY,
      document_description TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function getDeletedDocDescriptions(eftaIds: string[]) {
  const normalized = eftaIds.map((id) => id.trim().toUpperCase()).filter(Boolean);
  if (normalized.length === 0) {
    return {} as Record<string, string | null>;
  }

  return withClient(async (client) => {
    await ensureDeletedDocDescriptionsTable(client);
    const result = await client.query<DeletedDocDescriptionRow>(
      `
      SELECT efta_id, document_description
      FROM deleted_doc_descriptions
      WHERE efta_id = ANY($1::text[])
      `,
      [normalized],
    );

    return result.rows.reduce<Record<string, string | null>>((acc, row) => {
      acc[row.efta_id] = row.document_description ?? null;
      return acc;
    }, {});
  });
}

export async function getFileDescriptions(eftaIds: string[]) {
  const normalized = eftaIds.map((id) => id.trim().toUpperCase()).filter(Boolean);
  if (normalized.length === 0) {
    return {} as Record<string, string | null>;
  }

  return withClient(async (client) => {
    try {
      const result = await client.query<FileDescriptionRow>(
        `
        SELECT efta_id, description::text AS description
        FROM files
        WHERE efta_id = ANY($1::text[])
        `,
        [normalized],
      );

      return result.rows.reduce<Record<string, string | null>>((acc, row) => {
        acc[row.efta_id] = row.description?.trim() || null;
        return acc;
      }, {});
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
      if (code === "42703") {
        return {} as Record<string, string | null>;
      }
      throw error;
    }
  });
}

export async function saveDeletedDocDescriptions(
  rows: Array<{ eftaId: string; documentDescription: string | null }>,
) {
  const normalized = rows
    .map((row) => ({
      efta_id: row.eftaId.trim().toUpperCase(),
      document_description:
        typeof row.documentDescription === "string"
          ? row.documentDescription.trim()
          : null,
    }))
    .filter((row) => row.efta_id.length > 0);
  if (normalized.length === 0) {
    return;
  }

  return withClient(async (client) => {
    await ensureDeletedDocDescriptionsTable(client);
    for (const row of normalized) {
      await client.query(
        `
        INSERT INTO deleted_doc_descriptions (
          efta_id,
          document_description,
          created_at,
          updated_at
        )
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (efta_id)
        DO UPDATE SET
          document_description = EXCLUDED.document_description,
          updated_at = NOW()
        `,
        [row.efta_id, row.document_description],
      );
    }
  });
}

export async function recordDojSearchQuery(query: string) {
  const normalized = query.trim();
  if (!normalized) {
    return;
  }

  await withClient(async (client) => {
    await ensureDojSearchQueriesTable(client);
    await client.query(
      `
      INSERT INTO doj_search_queries (query_text, hit_count, last_success_at)
      VALUES ($1, 1, NOW())
      ON CONFLICT (query_text)
      DO UPDATE
      SET hit_count = doj_search_queries.hit_count + 1,
          last_success_at = NOW()
      `,
      [normalized],
    );
  });
}

export async function saveDojSearchResultPage(params: {
  query: string;
  page: number;
  payload: unknown;
}) {
  const query = params.query.trim();
  const page = Math.max(1, Math.floor(params.page));
  if (!query) {
    return;
  }

  await withClient(async (client) => {
    await ensureDojSearchResultPagesTable(client);
    await client.query(
      `
      INSERT INTO doj_search_result_pages (
        query_text,
        page_number,
        result_page,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3::jsonb, NOW(), NOW())
      ON CONFLICT (query_text, page_number) DO UPDATE
      SET
        result_page = EXCLUDED.result_page,
        updated_at = NOW()
      `,
      [query, page, JSON.stringify(params.payload ?? null)],
    );
  });
}

export async function getDojSearchQuerySuggestions(
  prefix: string,
  limit = 8,
) {
  const normalized = prefix.trim();
  if (!normalized) {
    return [] as string[];
  }

  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));

  return withClient(async (client) => {
    await ensureDojSearchQueriesTable(client);
    await ensureV2SearchQueriesTable(client);
    const result = await client.query<DOJSearchSuggestionRow>(
      `
      WITH combined AS (
        SELECT query_text, hit_count, last_success_at FROM doj_search_queries
        UNION ALL
        SELECT query_text, hit_count, last_success_at FROM search_v2_queries
      ),
      merged AS (
        SELECT
          query_text,
          SUM(hit_count)::bigint AS total_hits,
          MAX(last_success_at) AS latest_at
        FROM combined
        GROUP BY query_text
      )
      SELECT query_text
      FROM merged
      WHERE query_text ILIKE $1
      ORDER BY total_hits DESC, latest_at DESC
      LIMIT $2
      `,
      [`${normalized}%`, safeLimit],
    );
    return result.rows.map((row) => row.query_text);
  });
}

export async function getTopDojSearchQueries(limit = 10) {
  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));

  return withClient(async (client) => {
    await ensureDojSearchQueriesTable(client);
    await ensureV2SearchQueriesTable(client);
    const result = await client.query<DOJSearchSuggestionRow>(
      `
      WITH combined AS (
        SELECT query_text, hit_count, last_success_at FROM doj_search_queries
        UNION ALL
        SELECT query_text, hit_count, last_success_at FROM search_v2_queries
      ),
      merged AS (
        SELECT
          query_text,
          SUM(hit_count)::bigint AS total_hits,
          MAX(last_success_at) AS latest_at
        FROM combined
        GROUP BY query_text
      )
      SELECT query_text
      FROM merged
      ORDER BY total_hits DESC, latest_at DESC
      LIMIT $1
      `,
      [safeLimit],
    );
    return result.rows.map((row) => row.query_text);
  });
}

export async function getLatestDojSearchQueries(limit = 10) {
  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));

  return withClient(async (client) => {
    await ensureDojSearchQueriesTable(client);
    await ensureV2SearchQueriesTable(client);
    const result = await client.query<DOJSearchSuggestionRow>(
      `
      WITH combined AS (
        SELECT query_text, hit_count, last_success_at FROM doj_search_queries
        UNION ALL
        SELECT query_text, hit_count, last_success_at FROM search_v2_queries
      ),
      merged AS (
        SELECT
          query_text,
          SUM(hit_count)::bigint AS total_hits,
          MAX(last_success_at) AS latest_at
        FROM combined
        GROUP BY query_text
      )
      SELECT query_text
      FROM merged
      ORDER BY latest_at DESC, total_hits DESC
      LIMIT $1
      `,
      [safeLimit],
    );
    return result.rows.map((row) => row.query_text);
  });
}

export async function getDojSearchVotes(urls: string[]) {
  const normalized = urls.map((url) => url.trim()).filter(Boolean);
  if (normalized.length === 0) {
    return {} as Record<string, number>;
  }

  return withClient(async (client) => {
    await ensureDojSearchResultVotesTable(client);
    const result = await client.query<DOJSearchResultVoteRow>(
      `
      SELECT result_url, vote_count
      FROM doj_search_result_votes
      WHERE result_url = ANY($1::text[])
      `,
      [normalized],
    );

    return result.rows.reduce<Record<string, number>>((acc, row) => {
      const voteCount = Number(row.vote_count) || 0;
      acc[row.result_url] = voteCount;
      return acc;
    }, {});
  });
}

export async function getDojSearchUserVotes(urls: string[], voterId: string) {
  const normalizedUrls = urls.map((url) => url.trim()).filter(Boolean);
  const normalizedVoterId = voterId.trim();
  if (normalizedUrls.length === 0 || !normalizedVoterId) {
    return {} as Record<string, boolean>;
  }

  return withClient(async (client) => {
    await ensureDojSearchResultVoteEventsTable(client);
    const result = await client.query<DOJSearchResultUserVoteRow>(
      `
      SELECT result_url
      FROM doj_search_result_vote_events
      WHERE voter_id = $1
        AND result_url = ANY($2::text[])
      `,
      [normalizedVoterId, normalizedUrls],
    );

    return result.rows.reduce<Record<string, boolean>>((acc, row) => {
      acc[row.result_url] = true;
      return acc;
    }, {});
  });
}

export async function getDojSearchUserBookmarks(urls: string[], voterId: string) {
  const normalizedUrls = urls.map((url) => url.trim()).filter(Boolean);
  const normalizedVoterId = voterId.trim();
  if (normalizedUrls.length === 0 || !normalizedVoterId) {
    return {} as Record<string, boolean>;
  }

  return withFreshClient(async (client) => {
    await ensureDojSearchResultBookmarksTable(client);
    const result = await client.query<DOJSearchResultUserBookmarkRow>(
      `
      SELECT result_url
      FROM doj_search_result_bookmarks
      WHERE voter_id = $1
        AND result_url = ANY($2::text[])
      `,
      [normalizedVoterId, normalizedUrls],
    );

    return result.rows.reduce<Record<string, boolean>>((acc, row) => {
      acc[row.result_url] = true;
      return acc;
    }, {});
  });
}

export async function getDojSearchBookmarkCounts(urls: string[]) {
  const normalizedUrls = urls.map((url) => url.trim()).filter(Boolean);
  if (normalizedUrls.length === 0) {
    return {} as Record<string, number>;
  }

  return withFreshClient(async (client) => {
    await ensureDojSearchResultBookmarksTable(client);
    const result = await client.query<DOJSearchResultBookmarkCountRow>(
      `
      SELECT result_url, COUNT(*)::int AS bookmark_count
      FROM doj_search_result_bookmarks
      WHERE result_url = ANY($1::text[])
      GROUP BY result_url
      `,
      [normalizedUrls],
    );

    return result.rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.result_url] = Number(row.bookmark_count) || 0;
      return acc;
    }, {});
  });
}

export async function bookmarkDojSearchResult(params: {
  url: string;
  title?: string | null;
  fileName?: string | null;
  snippet?: string | null;
  highlight?: string | null;
  fileSize?: number | null;
  originalLink?: string | null;
  dojLink?: string | null;
  note?: string | null;
  voterId: string;
}) {
  const url = params.url.trim();
  const voterId = params.voterId.trim();
  const note =
    typeof params.note === "string" ? params.note.trim() || null : null;
  if (!url) {
    throw new Error("Missing result URL");
  }
  if (!voterId) {
    throw new Error("Missing voter ID");
  }

  return withFreshClient(async (client) => {
    await ensureDojSearchResultBookmarksTable(client);
    const existing = await client.query<{ result_url: string }>(
      `
      SELECT result_url
      FROM doj_search_result_bookmarks
      WHERE voter_id = $1
        AND result_url = $2
      LIMIT 1
      `,
      [voterId, url],
    );
    await client.query(
      `
      INSERT INTO doj_search_result_bookmarks (
        voter_id,
        result_url,
        title,
        file_name,
        snippet,
        highlight,
        file_size,
        original_link,
        doj_link,
        note,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
      ON CONFLICT (voter_id, result_url) DO UPDATE
      SET
        title = COALESCE(EXCLUDED.title, doj_search_result_bookmarks.title),
        file_name = COALESCE(EXCLUDED.file_name, doj_search_result_bookmarks.file_name),
        snippet = COALESCE(EXCLUDED.snippet, doj_search_result_bookmarks.snippet),
        highlight = COALESCE(EXCLUDED.highlight, doj_search_result_bookmarks.highlight),
        file_size = COALESCE(EXCLUDED.file_size, doj_search_result_bookmarks.file_size),
        original_link = COALESCE(EXCLUDED.original_link, doj_search_result_bookmarks.original_link),
        doj_link = COALESCE(EXCLUDED.doj_link, doj_search_result_bookmarks.doj_link),
        note = COALESCE(EXCLUDED.note, doj_search_result_bookmarks.note),
        updated_at = NOW()
      `,
      [
        voterId,
        url,
        params.title ?? null,
        params.fileName ?? null,
        params.snippet ?? null,
        params.highlight ?? null,
        params.fileSize ?? null,
        params.originalLink ?? null,
        params.dojLink ?? null,
        note,
      ],
    );

    const countRes = await client.query<{ total: number | string }>(
      `
      SELECT COUNT(*) AS total
      FROM doj_search_result_bookmarks
      WHERE voter_id = $1
      `,
      [voterId],
    );
    const bookmarkCountRes = await client.query<{ total: number | string }>(
      `
      SELECT COUNT(*) AS total
      FROM doj_search_result_bookmarks
      WHERE result_url = $1
      `,
      [url],
    );

    return {
      alreadyBookmarked: existing.rows.length > 0,
      totalBookmarks: Number(countRes.rows[0]?.total) || 0,
      bookmarkCount: Number(bookmarkCountRes.rows[0]?.total) || 0,
      note,
    };
  });
}

export async function getDojSearchBookmarkByUrl(url: string, voterId: string) {
  const normalizedUrl = url.trim();
  const normalizedVoterId = voterId.trim();
  if (!normalizedUrl || !normalizedVoterId) {
    return { bookmarked: false, note: null as string | null };
  }

  return withFreshClient(async (client) => {
    await ensureDojSearchResultBookmarksTable(client);
    const result = await client.query<{ note: string | null }>(
      `
      SELECT note
      FROM doj_search_result_bookmarks
      WHERE voter_id = $1
        AND result_url = $2
      LIMIT 1
      `,
      [normalizedVoterId, normalizedUrl],
    );

    if (result.rows.length === 0) {
      return { bookmarked: false, note: null as string | null };
    }

    return {
      bookmarked: true,
      note: result.rows[0]?.note ?? null,
    };
  });
}

export async function getUserBookmarkedDojSearchResults(
  voterId: string,
  limit = 200,
) {
  const normalizedVoterId = voterId.trim();
  if (!normalizedVoterId) {
    return [] as Array<{
      result_url: string;
      title: string | null;
      file_name: string | null;
      snippet: string | null;
      highlight: string | null;
      file_size: number | null;
      original_link: string | null;
      doj_link: string | null;
      note: string | null;
      created_at: string;
    }>;
  }
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));

  return withFreshClient(async (client) => {
    await ensureDojSearchResultBookmarksTable(client);
    const result = await client.query<DOJBookmarkedResultRow>(
      `
      SELECT
        result_url,
        title,
        file_name,
        snippet,
        highlight,
        file_size,
        original_link,
        doj_link,
        note,
        created_at::text AS created_at
      FROM doj_search_result_bookmarks
      WHERE voter_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [normalizedVoterId, safeLimit],
    );

    return result.rows.map((row) => ({
      result_url: row.result_url,
      title: row.title,
      file_name: row.file_name,
      snippet: row.snippet,
      highlight: row.highlight,
      file_size:
        row.file_size === null || row.file_size === undefined
          ? null
          : Number(row.file_size),
      original_link: row.original_link,
      doj_link: row.doj_link,
      note: row.note,
      created_at: row.created_at,
    }));
  });
}

export async function getDojBookmarkTotal(voterId: string) {
  const normalizedVoterId = voterId.trim();
  if (!normalizedVoterId) {
    return 0;
  }

  return withFreshClient(async (client) => {
    await ensureDojSearchResultBookmarksTable(client);
    const result = await client.query<{ total: number | string }>(
      `
      SELECT COUNT(*) AS total
      FROM doj_search_result_bookmarks
      WHERE voter_id = $1
      `,
      [normalizedVoterId],
    );
    return Number(result.rows[0]?.total) || 0;
  });
}

export async function upvoteDojSearchResult(params: {
  url: string;
  title?: string | null;
  fileName?: string | null;
  snippet?: string | null;
  highlight?: string | null;
  fileSize?: number | null;
  voterId: string;
}) {
  const url = params.url.trim();
  const voterId = params.voterId.trim();
  if (!url) {
    throw new Error("Missing result URL");
  }
  if (!voterId) {
    throw new Error("Missing voter ID");
  }

  return withClient(async (client) => {
    await ensureDojSearchResultVotesTable(client);
    await ensureDojSearchResultVoteEventsTable(client);

    const voteEventInsert = await client.query(
      `
      INSERT INTO doj_search_result_vote_events (voter_id, result_url)
      VALUES ($1, $2)
      ON CONFLICT (voter_id, result_url) DO NOTHING
      `,
      [voterId, url],
    );

    if (voteEventInsert.rowCount === 0) {
      const existing = await client.query<{ vote_count: number | string }>(
        `
        SELECT vote_count
        FROM doj_search_result_votes
        WHERE result_url = $1
        LIMIT 1
        `,
        [url],
      );

      return {
        voteCount: Number(existing.rows[0]?.vote_count) || 0,
        alreadyVoted: true,
      };
    }

    const result = await client.query<{ vote_count: number | string }>(
      `
      INSERT INTO doj_search_result_votes (
        result_url,
        title,
        file_name,
        snippet,
        highlight,
        file_size,
        vote_count,
        last_voted_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 1, NOW())
      ON CONFLICT (result_url)
      DO UPDATE SET
        vote_count = doj_search_result_votes.vote_count + 1,
        title = COALESCE(EXCLUDED.title, doj_search_result_votes.title),
        file_name = COALESCE(EXCLUDED.file_name, doj_search_result_votes.file_name),
        snippet = COALESCE(EXCLUDED.snippet, doj_search_result_votes.snippet),
        highlight = COALESCE(EXCLUDED.highlight, doj_search_result_votes.highlight),
        file_size = COALESCE(EXCLUDED.file_size, doj_search_result_votes.file_size),
        last_voted_at = NOW()
      RETURNING vote_count
      `,
      [
        url,
        params.title ?? null,
        params.fileName ?? null,
        params.snippet ?? null,
        params.highlight ?? null,
        params.fileSize ?? null,
      ],
    );

    return {
      voteCount: Number(result.rows[0]?.vote_count) || 0,
      alreadyVoted: false,
    };
  });
}

export async function getTopUpvotedDojSearchResults(limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));

  return withClient(async (client) => {
    await ensureDojSearchResultVotesTable(client);
    const result = await client.query<DOJTopUpvotedResultRow>(
      `
      SELECT
        result_url,
        title,
        file_name,
        snippet,
        highlight,
        file_size,
        vote_count,
        last_voted_at::text AS last_voted_at
      FROM doj_search_result_votes
      ORDER BY vote_count DESC, last_voted_at DESC
      LIMIT $1
      `,
      [safeLimit],
    );

    return result.rows.map((row) => ({
      result_url: row.result_url,
      title: row.title,
      file_name: row.file_name,
      snippet: row.snippet,
      highlight: row.highlight,
      file_size:
        row.file_size === null || row.file_size === undefined
          ? null
          : Number(row.file_size),
      vote_count: Number(row.vote_count) || 0,
      last_voted_at: row.last_voted_at,
    }));
  });
}

export async function getUserUpvotedDojSearchResults(voterId: string, limit = 100) {
  const normalizedVoterId = voterId.trim();
  if (!normalizedVoterId) {
    return [] as Array<{
      result_url: string;
      title: string | null;
      file_name: string | null;
      snippet: string | null;
      highlight: string | null;
      file_size: number | null;
      vote_count: number;
      last_voted_at: string;
    }>;
  }
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));

  return withClient(async (client) => {
    await ensureDojSearchResultVotesTable(client);
    await ensureDojSearchResultVoteEventsTable(client);
    const result = await client.query<DOJTopUpvotedResultRow>(
      `
      SELECT
        v.result_url,
        v.title,
        v.file_name,
        v.snippet,
        v.highlight,
        v.file_size,
        v.vote_count,
        v.last_voted_at::text AS last_voted_at
      FROM doj_search_result_vote_events e
      JOIN doj_search_result_votes v
        ON v.result_url = e.result_url
      WHERE e.voter_id = $1
      ORDER BY e.created_at DESC
      LIMIT $2
      `,
      [normalizedVoterId, safeLimit],
    );

    return result.rows.map((row) => ({
      result_url: row.result_url,
      title: row.title,
      file_name: row.file_name,
      snippet: row.snippet,
      highlight: row.highlight,
      file_size:
        row.file_size === null || row.file_size === undefined
          ? null
          : Number(row.file_size),
      vote_count: Number(row.vote_count) || 0,
      last_voted_at: row.last_voted_at,
    }));
  });
}

export async function getDeletedDocVotes(eftaIds: string[]) {
  const normalized = eftaIds.map((id) => id.trim().toUpperCase()).filter(Boolean);
  if (normalized.length === 0) {
    return {} as Record<string, number>;
  }

  return withClient(async (client) => {
    await ensureDeletedDocVotesTable(client);
    const result = await client.query<DeletedDocVoteRow>(
      `
      SELECT efta_id, vote_count
      FROM deleted_doc_votes
      WHERE efta_id = ANY($1::text[])
      `,
      [normalized],
    );

    return result.rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.efta_id] = Number(row.vote_count) || 0;
      return acc;
    }, {});
  });
}

export async function getDeletedDocUserVotes(eftaIds: string[], voterId: string) {
  const normalizedIds = eftaIds.map((id) => id.trim().toUpperCase()).filter(Boolean);
  const normalizedVoterId = voterId.trim();
  if (normalizedIds.length === 0 || !normalizedVoterId) {
    return {} as Record<string, boolean>;
  }

  return withClient(async (client) => {
    await ensureDeletedDocVoteEventsTable(client);
    const result = await client.query<DeletedDocUserVoteRow>(
      `
      SELECT efta_id
      FROM deleted_doc_vote_events
      WHERE voter_id = $1
        AND efta_id = ANY($2::text[])
      `,
      [normalizedVoterId, normalizedIds],
    );

    return result.rows.reduce<Record<string, boolean>>((acc, row) => {
      acc[row.efta_id] = true;
      return acc;
    }, {});
  });
}

export async function getDeletedDocUserBookmarks(eftaIds: string[], voterId: string) {
  const normalizedIds = eftaIds.map((id) => id.trim().toUpperCase()).filter(Boolean);
  const normalizedVoterId = voterId.trim();
  if (normalizedIds.length === 0 || !normalizedVoterId) {
    return {} as Record<string, boolean>;
  }

  return withFreshClient(async (client) => {
    await ensureDeletedDocBookmarksTable(client);
    const result = await client.query<DeletedDocUserBookmarkRow>(
      `
      SELECT efta_id
      FROM deleted_doc_bookmarks
      WHERE voter_id = $1
        AND efta_id = ANY($2::text[])
      `,
      [normalizedVoterId, normalizedIds],
    );

    return result.rows.reduce<Record<string, boolean>>((acc, row) => {
      acc[row.efta_id] = true;
      return acc;
    }, {});
  });
}

export async function bookmarkDeletedDoc(params: {
  eftaId: string;
  dataset?: string | null;
  filePath?: string | null;
  originalLink?: string | null;
  dojLink?: string | null;
  note?: string | null;
  voterId: string;
}) {
  const eftaId = params.eftaId.trim().toUpperCase();
  const voterId = params.voterId.trim();
  const note =
    typeof params.note === "string" ? params.note.trim() || null : null;
  if (!eftaId) {
    throw new Error("Missing EFTA ID");
  }
  if (!voterId) {
    throw new Error("Missing voter ID");
  }

  return withFreshClient(async (client) => {
    await ensureDeletedDocBookmarksTable(client);
    const existing = await client.query<{ efta_id: string }>(
      `
      SELECT efta_id
      FROM deleted_doc_bookmarks
      WHERE voter_id = $1
        AND efta_id = $2
      LIMIT 1
      `,
      [voterId, eftaId],
    );
    await client.query(
      `
      INSERT INTO deleted_doc_bookmarks (
        voter_id,
        efta_id,
        dataset,
        file_path,
        original_link,
        doj_link,
        note,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
      ON CONFLICT (voter_id, efta_id) DO UPDATE
      SET
        dataset = COALESCE(EXCLUDED.dataset, deleted_doc_bookmarks.dataset),
        file_path = COALESCE(EXCLUDED.file_path, deleted_doc_bookmarks.file_path),
        original_link = COALESCE(EXCLUDED.original_link, deleted_doc_bookmarks.original_link),
        doj_link = COALESCE(EXCLUDED.doj_link, deleted_doc_bookmarks.doj_link),
        note = COALESCE(EXCLUDED.note, deleted_doc_bookmarks.note),
        updated_at = NOW()
      `,
      [
        voterId,
        eftaId,
        params.dataset ?? null,
        params.filePath ?? null,
        params.originalLink ?? null,
        params.dojLink ?? null,
        note,
      ],
    );

    const countRes = await client.query<{ total: number | string }>(
      `
      SELECT COUNT(*) AS total
      FROM deleted_doc_bookmarks
      WHERE voter_id = $1
      `,
      [voterId],
    );

    return {
      alreadyBookmarked: existing.rows.length > 0,
      totalBookmarks: Number(countRes.rows[0]?.total) || 0,
      note,
    };
  });
}

export async function getDeletedDocBookmarkByEftaId(
  eftaId: string,
  voterId: string,
) {
  const normalizedEftaId = eftaId.trim().toUpperCase();
  const normalizedVoterId = voterId.trim();
  if (!normalizedEftaId || !normalizedVoterId) {
    return { bookmarked: false, note: null as string | null };
  }

  return withFreshClient(async (client) => {
    await ensureDeletedDocBookmarksTable(client);
    const result = await client.query<{ note: string | null }>(
      `
      SELECT note
      FROM deleted_doc_bookmarks
      WHERE voter_id = $1
        AND efta_id = $2
      LIMIT 1
      `,
      [normalizedVoterId, normalizedEftaId],
    );

    if (result.rows.length === 0) {
      return { bookmarked: false, note: null as string | null };
    }

    return {
      bookmarked: true,
      note: result.rows[0]?.note ?? null,
    };
  });
}

export async function getUserBookmarkedDeletedDocs(voterId: string, limit = 200) {
  const normalizedVoterId = voterId.trim();
  if (!normalizedVoterId) {
    return [] as Array<{
      efta_id: string;
      dataset: string | null;
      file_path: string | null;
      original_link: string | null;
      doj_link: string | null;
      note: string | null;
      created_at: string;
    }>;
  }
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));

  return withFreshClient(async (client) => {
    await ensureDeletedDocBookmarksTable(client);
    const result = await client.query<DeletedDocBookmarkedRow>(
      `
      SELECT
        efta_id,
        dataset,
        file_path,
        original_link,
        doj_link,
        note,
        created_at::text AS created_at
      FROM deleted_doc_bookmarks
      WHERE voter_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [normalizedVoterId, safeLimit],
    );

    return result.rows.map((row) => ({
      efta_id: row.efta_id,
      dataset: row.dataset,
      file_path: row.file_path,
      original_link: row.original_link,
      doj_link: row.doj_link,
      note: row.note,
      created_at: row.created_at,
    }));
  });
}

export async function getDeletedBookmarkTotal(voterId: string) {
  const normalizedVoterId = voterId.trim();
  if (!normalizedVoterId) {
    return 0;
  }

  return withFreshClient(async (client) => {
    await ensureDeletedDocBookmarksTable(client);
    const result = await client.query<{ total: number | string }>(
      `
      SELECT COUNT(*) AS total
      FROM deleted_doc_bookmarks
      WHERE voter_id = $1
      `,
      [normalizedVoterId],
    );
    return Number(result.rows[0]?.total) || 0;
  });
}

export async function getDeletedDocReportCounts(eftaIds: string[]) {
  const normalized = eftaIds.map((id) => id.trim().toUpperCase()).filter(Boolean);
  if (normalized.length === 0) {
    return {} as Record<string, number>;
  }

  return withClient(async (client) => {
    await ensureDeletedDocReportsTable(client);
    const result = await client.query<DeletedDocReportRow>(
      `
      SELECT efta_id, report_count
      FROM deleted_doc_reports
      WHERE efta_id = ANY($1::text[])
      `,
      [normalized],
    );

    return result.rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.efta_id] = Number(row.report_count) || 0;
      return acc;
    }, {});
  });
}

export async function getDeletedDocUserReports(eftaIds: string[], voterId: string) {
  const normalizedIds = eftaIds.map((id) => id.trim().toUpperCase()).filter(Boolean);
  const normalizedVoterId = voterId.trim();
  if (normalizedIds.length === 0 || !normalizedVoterId) {
    return {} as Record<string, boolean>;
  }

  return withClient(async (client) => {
    await ensureDeletedDocReportEventsTable(client);
    const result = await client.query<DeletedDocUserReportRow>(
      `
      SELECT efta_id
      FROM deleted_doc_report_events
      WHERE voter_id = $1
        AND efta_id = ANY($2::text[])
      `,
      [normalizedVoterId, normalizedIds],
    );

    return result.rows.reduce<Record<string, boolean>>((acc, row) => {
      acc[row.efta_id] = true;
      return acc;
    }, {});
  });
}

export async function upvoteDeletedDoc(params: {
  eftaId: string;
  dataset?: string | null;
  filePath?: string | null;
  originalLink?: string | null;
  dojLink?: string | null;
  voterId: string;
}) {
  const eftaId = params.eftaId.trim().toUpperCase();
  const voterId = params.voterId.trim();
  if (!eftaId) {
    throw new Error("Missing EFTA ID");
  }
  if (!voterId) {
    throw new Error("Missing voter ID");
  }

  return withClient(async (client) => {
    await ensureDeletedDocVotesTable(client);
    await ensureDeletedDocVoteEventsTable(client);

    const voteEventInsert = await client.query(
      `
      INSERT INTO deleted_doc_vote_events (voter_id, efta_id)
      VALUES ($1, $2)
      ON CONFLICT (voter_id, efta_id) DO NOTHING
      `,
      [voterId, eftaId],
    );

    if (voteEventInsert.rowCount === 0) {
      const existing = await client.query<{ vote_count: number | string }>(
        `
        SELECT vote_count
        FROM deleted_doc_votes
        WHERE efta_id = $1
        LIMIT 1
        `,
        [eftaId],
      );

      return {
        voteCount: Number(existing.rows[0]?.vote_count) || 0,
        alreadyVoted: true,
      };
    }

    const result = await client.query<{ vote_count: number | string }>(
      `
      INSERT INTO deleted_doc_votes (
        efta_id,
        dataset,
        file_path,
        original_link,
        doj_link,
        vote_count,
        last_voted_at
      )
      VALUES ($1, $2, $3, $4, $5, 1, NOW())
      ON CONFLICT (efta_id)
      DO UPDATE SET
        vote_count = deleted_doc_votes.vote_count + 1,
        dataset = COALESCE(EXCLUDED.dataset, deleted_doc_votes.dataset),
        file_path = COALESCE(EXCLUDED.file_path, deleted_doc_votes.file_path),
        original_link = COALESCE(EXCLUDED.original_link, deleted_doc_votes.original_link),
        doj_link = COALESCE(EXCLUDED.doj_link, deleted_doc_votes.doj_link),
        last_voted_at = NOW()
      RETURNING vote_count
      `,
      [
        eftaId,
        params.dataset ?? null,
        params.filePath ?? null,
        params.originalLink ?? null,
        params.dojLink ?? null,
      ],
    );

    return {
      voteCount: Number(result.rows[0]?.vote_count) || 0,
      alreadyVoted: false,
    };
  });
}

export async function reportDeletedDoc(params: { eftaId: string; voterId: string }) {
  const eftaId = params.eftaId.trim().toUpperCase();
  const voterId = params.voterId.trim();
  if (!eftaId) {
    throw new Error("Missing EFTA ID");
  }
  if (!voterId) {
    throw new Error("Missing voter ID");
  }

  return withClient(async (client) => {
    await ensureDeletedDocReportsTable(client);
    await ensureDeletedDocReportEventsTable(client);

    const reportEventInsert = await client.query(
      `
      INSERT INTO deleted_doc_report_events (voter_id, efta_id)
      VALUES ($1, $2)
      ON CONFLICT (voter_id, efta_id) DO NOTHING
      `,
      [voterId, eftaId],
    );

    if (reportEventInsert.rowCount === 0) {
      const existing = await client.query<{ report_count: number | string }>(
        `
        SELECT report_count
        FROM deleted_doc_reports
        WHERE efta_id = $1
        LIMIT 1
        `,
        [eftaId],
      );

      return {
        reportCount: Number(existing.rows[0]?.report_count) || 0,
        alreadyReported: true,
      };
    }

    const result = await client.query<{ report_count: number | string }>(
      `
      INSERT INTO deleted_doc_reports (efta_id, report_count, last_reported_at)
      VALUES ($1, 1, NOW())
      ON CONFLICT (efta_id)
      DO UPDATE SET
        report_count = deleted_doc_reports.report_count + 1,
        last_reported_at = NOW()
      RETURNING report_count
      `,
      [eftaId],
    );

    return {
      reportCount: Number(result.rows[0]?.report_count) || 0,
      alreadyReported: false,
    };
  });
}

export async function getTopUpvotedDeletedDocs(limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));

  return withClient(async (client) => {
    await ensureDeletedDocVotesTable(client);
    await ensureDeletedDocThumbnailsTable(client);
    const result = await client.query<DeletedDocTopUpvotedRow>(
      `
      SELECT
        v.efta_id,
        v.dataset,
        v.file_path,
        v.original_link,
        v.doj_link,
        t.thumbnail_url,
        v.vote_count,
        v.last_voted_at::text AS last_voted_at
      FROM deleted_doc_votes v
      LEFT JOIN deleted_doc_thumbnails t
        ON t.efta_id = v.efta_id
      ORDER BY v.vote_count DESC, v.last_voted_at DESC
      LIMIT $1
      `,
      [safeLimit],
    );

    return result.rows.map((row) => ({
      efta_id: row.efta_id,
      dataset: row.dataset,
      file_path: row.file_path,
      original_link: row.original_link,
      doj_link: row.doj_link,
      thumbnail_url: row.thumbnail_url,
      vote_count: Number(row.vote_count) || 0,
      last_voted_at: row.last_voted_at,
    }));
  });
}

export async function recordV2SearchQuery(query: string) {
  const normalized = query.trim();
  if (!normalized) {
    return;
  }

  await withClient(async (client) => {
    await ensureV2SearchQueriesTable(client);
    await client.query(
      `
      INSERT INTO search_v2_queries (query_text, hit_count, last_success_at)
      VALUES ($1, 1, NOW())
      ON CONFLICT (query_text)
      DO UPDATE
      SET hit_count = search_v2_queries.hit_count + 1,
          last_success_at = NOW()
      `,
      [normalized],
    );
  });
}

export async function getDojSearchResultPage(params: {
  query: string;
  page: number;
}) {
  const query = params.query.trim();
  const page = Math.max(1, Math.floor(params.page));
  if (!query) {
    return null;
  }

  return withClient(async (client) => {
    await ensureDojSearchResultPagesTable(client);
    const result = await client.query<DOJSearchResultPageRow>(
      `
      SELECT result_page
      FROM doj_search_result_pages
      WHERE query_text = $1
        AND page_number = $2
      LIMIT 1
      `,
      [query, page],
    );
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0].result_page ?? null;
  });
}

export async function saveV2SearchResultPage(params: {
  query: string;
  page: number;
  payload: unknown;
}) {
  const query = params.query;
  const page = Math.max(1, Math.floor(params.page));
  if (!query || page < 1) {
    return;
  }

  await withClient(async (client) => {
    await ensureV2SearchResultPagesTable(client);
    await client.query(
      `
      INSERT INTO search_v2_result_pages (
        query_text,
        page_number,
        result_page,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3::jsonb, NOW(), NOW())
      ON CONFLICT (query_text, page_number) DO UPDATE
      SET
        result_page = EXCLUDED.result_page,
        updated_at = NOW()
      `,
      [query, page, JSON.stringify(params.payload ?? null)],
    );
  });
}

export async function getV2SearchResultPage(params: {
  query: string;
  page: number;
}) {
  const query = params.query;
  const page = Math.max(1, Math.floor(params.page));
  if (!query || page < 1) {
    return null;
  }

  return withClient(async (client) => {
    await ensureV2SearchResultPagesTable(client);
    const result = await client.query<V2SearchResultPageRow>(
      `
      SELECT result_page
      FROM search_v2_result_pages
      WHERE query_text = $1
        AND page_number = $2
      LIMIT 1
      `,
      [query, page],
    );
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0].result_page ?? null;
  });
}

export async function getUserUpvotedDeletedDocs(voterId: string, limit = 100) {
  const normalizedVoterId = voterId.trim();
  if (!normalizedVoterId) {
    return [] as Array<{
      efta_id: string;
      dataset: string | null;
      file_path: string | null;
      original_link: string | null;
      doj_link: string | null;
      thumbnail_url: string | null;
      vote_count: number;
      last_voted_at: string;
    }>;
  }
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));

  return withClient(async (client) => {
    await ensureDeletedDocVotesTable(client);
    await ensureDeletedDocVoteEventsTable(client);
    await ensureDeletedDocThumbnailsTable(client);
    const result = await client.query<DeletedDocTopUpvotedRow>(
      `
      SELECT
        v.efta_id,
        v.dataset,
        v.file_path,
        v.original_link,
        v.doj_link,
        t.thumbnail_url,
        v.vote_count,
        v.last_voted_at::text AS last_voted_at
      FROM deleted_doc_vote_events e
      JOIN deleted_doc_votes v
        ON v.efta_id = e.efta_id
      LEFT JOIN deleted_doc_thumbnails t
        ON t.efta_id = v.efta_id
      WHERE e.voter_id = $1
      ORDER BY e.created_at DESC
      LIMIT $2
      `,
      [normalizedVoterId, safeLimit],
    );

    return result.rows.map((row) => ({
      efta_id: row.efta_id,
      dataset: row.dataset,
      file_path: row.file_path,
      original_link: row.original_link,
      doj_link: row.doj_link,
      thumbnail_url: row.thumbnail_url,
      vote_count: Number(row.vote_count) || 0,
      last_voted_at: row.last_voted_at,
    }));
  });
}

export async function getRandomDeletedFile(excludeEftaIds: string[] = []) {
  const excludes = excludeEftaIds.map((id) => id.trim()).filter(Boolean);

  return withClient(async (client) => {
    await ensureDeletedDocBlacklistTable(client);

    if (excludes.length > 0) {
      const result = await client.query<DeletedBrowserRow>(
        `
        SELECT ${DB_FILE_COLUMNS}
        FROM files
        WHERE deleted = TRUE
          AND NOT EXISTS (
            SELECT 1
            FROM deleted_doc_blacklist b
            WHERE b.efta_id = files.efta_id
          )
          AND efta_id <> ALL($1::text[])
        ORDER BY RANDOM()
        LIMIT 1
        `,
        [excludes],
      );
      if (result.rows[0]) {
        return result.rows[0];
      }
    }

    const fallback = await client.query<DeletedBrowserRow>(
      `
      SELECT ${DB_FILE_COLUMNS}
      FROM files
      WHERE deleted = TRUE
        AND NOT EXISTS (
          SELECT 1
          FROM deleted_doc_blacklist b
          WHERE b.efta_id = files.efta_id
        )
      ORDER BY RANDOM()
      LIMIT 1
      `,
    );

    return fallback.rows[0] ?? null;
  });
}

export async function getDeletedFileById(eftaId: string) {
  const normalized = eftaId.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  return withClient(async (client) => {
    await ensureDeletedDocBlacklistTable(client);
    const result = await client.query<DeletedBrowserRow>(
      `
      SELECT ${DB_FILE_COLUMNS}
      FROM files
      WHERE efta_id = $1
        AND deleted = TRUE
        AND NOT EXISTS (
          SELECT 1
          FROM deleted_doc_blacklist b
          WHERE b.efta_id = files.efta_id
        )
      LIMIT 1
      `,
      [normalized],
    );
    return result.rows[0] ?? null;
  });
}
