"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import MobileChunkedPdfModal from "@/components/mobile-chunked-pdf-modal";
import GlobalNav from "@/components/global-nav";
import { globalNavConfig } from "@/lib/global-nav-config";
import Link from "next/link";

type ParsedQuery = {
  phrases: string[];
  excludePhrases: string[];
  excludeTerms: string[];
  keywords: string[];
  orGroups: Array<{ phrases: string[]; terms: string[] }>;
  filters: { dataset: string[]; doc: string[]; file: string[]; path: string[] };
  wildcards: { file: string[]; path: string[] };
};

type SearchHit = {
  _id?: string;
  _score?: number;
  _source?: {
    doc_id?: string;
    filename?: string;
    path?: string;
    dataset?: string;
  };
  highlight?: {
    content?: string[];
  };
};

type SearchResponse = {
  took?: number;
  hits?: {
    total?: { value?: number } | number;
    hits?: SearchHit[];
  };
  suggest?: {
    did_you_mean?: Array<{ options?: Array<{ text?: string }> }>;
  };
};

type PreviewVoteMeta = {
  voteUrl: string;
  voteTitle: string;
  voteFileName: string | null;
  voteSnippet: string | null;
};

function stripOuterQuotes(value: string) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

// ----- TLD + Date helpers -----

const TOP_TLDS = new Set(["gov", "com", "org", "net", "edu"]);

function isTldToken(token: string) {
  const t = token.trim().toLowerCase();
  if (t.startsWith(".")) return TOP_TLDS.has(t.slice(1));
  return TOP_TLDS.has(t);
}

// NOTE: no "/*" anywhere.
function tldToQueryString(token: string): string | null {
  const t = token.trim().toLowerCase();
  const tld = (t.startsWith(".") ? t.slice(1) : t).replace(/[^a-z0-9]/g, "");
  if (!tld) return null;

  // Escape '.' for query_string. This is safe.
  // Matches "... .gov" inside a URL-like token OR email domain.
  return `(*\\.${tld} OR *@*\\.${tld})`;
}

// ---- date parsing/expansion ----

// month name -> number
const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// Convert 2-digit years: 00-29 -> 2000-2029, else 1900-1999
function normalizeYear(yy: number) {
  if (yy < 100) return yy <= 29 ? 2000 + yy : 1900 + yy;
  return yy;
}

type ParsedDate = { y: number; m: number; d: number };

function parseDateToken(token: string): ParsedDate | null {
  const t = token.trim();

  // 2019-05-20 or 2019/05/20
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };

  // 05/20/19 or 05/20/2019 or 5-20-2019
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  if (m)
    return { y: normalizeYear(Number(m[3])), m: Number(m[1]), d: Number(m[2]) };

  // May 20, 2019 / May 20 2019 / May 20 19
  m = t.match(
    /^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{2}|\d{4})$/,
  );
  if (m) {
    const mm = MONTHS[m[1].toLowerCase()];
    if (!mm) return null;
    return { y: normalizeYear(Number(m[3])), m: mm, d: Number(m[2]) };
  }

  // 20 May 2019
  m = t.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:,)?\s+(\d{2}|\d{4})$/,
  );
  if (m) {
    const mm = MONTHS[m[2].toLowerCase()];
    if (!mm) return null;
    return { y: normalizeYear(Number(m[3])), m: mm, d: Number(m[1]) };
  }

  return null;
}

function dateToVariants(d: ParsedDate) {
  const yyyy = String(d.y);
  const yy = yyyy.slice(-2);
  const mm = pad2(d.m);
  const dd = pad2(d.d);

  // Common spellings
  const monthNames = Object.entries(MONTHS)
    .filter(([, num]) => num === d.m)
    .map(([name]) => name)
    // keep a few canonical names
    .filter((name) => name.length >= 3);

  // Prefer the full month and 3-letter month
  const fullMonth = monthNames.find((x) => x.length > 3) ?? monthNames[0] ?? "";
  const shortMonth = fullMonth
    ? fullMonth.slice(0, 3)
    : (monthNames[0]?.slice(0, 3) ?? "");

  const variants = new Set<string>();

  // numeric
  variants.add(`${mm}/${dd}/${yyyy}`);
  variants.add(`${d.m}/${d.d}/${yyyy}`);
  variants.add(`${mm}/${dd}/${yy}`);
  variants.add(`${d.m}/${d.d}/${yy}`);
  variants.add(`${yyyy}-${mm}-${dd}`);
  variants.add(`${yyyy}/${mm}/${dd}`);

  // textual
  if (fullMonth) {
    const capFull = fullMonth[0].toUpperCase() + fullMonth.slice(1);
    const capShort = shortMonth[0].toUpperCase() + shortMonth.slice(1);
    variants.add(`${capFull} ${d.d}, ${yyyy}`);
    variants.add(`${capFull} ${d.d} ${yyyy}`);
    variants.add(`${capShort} ${d.d}, ${yyyy}`);
    variants.add(`${capShort} ${d.d} ${yyyy}`);
    variants.add(`${d.d} ${capFull} ${yyyy}`);
    variants.add(`${d.d} ${capShort} ${yyyy}`);
  }

  return [...variants];
}

// produce a query_string OR clause for a date token
function dateTokenToQueryString(token: string) {
  const parsed = parseDateToken(token);
  if (!parsed) return null;

  // Escape slashes in query_string: forward slash is ok but keep safe
  const variants = dateToVariants(parsed).map((v) =>
    v.replace(/([+\-=&|><!(){}\[\]^"~*?:\\/])/g, "\\$1"),
  );

  // Join as ("a" OR "b" OR "c")
  return `(${variants.map((v) => `"${v}"`).join(" OR ")})`;
}

function parseGoogleish(input: string): ParsedQuery {
  const out: ParsedQuery = {
    phrases: [],
    excludePhrases: [],
    excludeTerms: [],
    keywords: [],
    orGroups: [],
    filters: { dataset: [], doc: [], file: [], path: [] },
    wildcards: { file: [], path: [] },
  };

  const remaining = input.trim().replace(/\(([^()]*)\)/g, (match, inner) => {
    if (!/\bOR\b/i.test(inner)) {
      return match;
    }
    const parts = inner
      .split(/\bOR\b/i)
      .map((part: string) => part.trim())
      .filter(Boolean);
    const group = { phrases: [] as string[], terms: [] as string[] };
    for (const part of parts) {
      const normalized = stripOuterQuotes(part);
      if (part.startsWith('"') && part.endsWith('"')) {
        group.phrases.push(normalized);
      } else {
        group.terms.push(normalized);
      }
    }
    if (group.phrases.length > 0 || group.terms.length > 0) {
      out.orGroups.push(group);
    }
    return " ";
  });

  const tokenRe = /-"[^"]+"|"[^"]+"|-\S+|\S+/g;
  const tokens = remaining.match(tokenRe) ?? [];
  for (const rawToken of tokens) {
    const token = rawToken.trim();
    if (!token) {
      continue;
    }

    const fieldMatch = token.match(/^([a-zA-Z_]+):(.+)$/);
    if (fieldMatch) {
      const field = fieldMatch[1].toLowerCase();
      const valueRaw = fieldMatch[2];
      const value = stripOuterQuotes(valueRaw);
      const isWildcard = /[*?]/.test(valueRaw);

      if (field === "dataset") {
        out.filters.dataset.push(value);
      } else if (field === "doc" || field === "doc_id") {
        out.filters.doc.push(value);
      } else if (field === "file" || field === "filename") {
        if (isWildcard) {
          out.wildcards.file.push(value);
        } else {
          out.filters.file.push(value);
        }
      } else if (field === "path") {
        if (isWildcard) {
          out.wildcards.path.push(value);
        } else {
          out.filters.path.push(value);
        }
      } else {
        out.keywords.push(token);
      }
      continue;
    }

    if (token.startsWith('-"') && token.endsWith('"')) {
      out.excludePhrases.push(stripOuterQuotes(token.slice(1)));
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      out.excludeTerms.push(token.slice(1));
      continue;
    }
    if (token.startsWith('"') && token.endsWith('"')) {
      out.phrases.push(stripOuterQuotes(token));
      continue;
    }
    out.keywords.push(token);
  }

  return out;
}

function looksLikeFilenameQuery(query: string) {
  return /\b[A-Za-z0-9_-]+\.[A-Za-z0-9]{2,6}\b/.test(query);
}

function buildLexicalClause(
  parsed: ParsedQuery,
  requirePhrases: boolean,
  useFuzzy: boolean,
) {
  const must: unknown[] = [];
  const mustNot: unknown[] = [];
  const filter: unknown[] = [];

  const phraseClauses = parsed.phrases.map((phrase) => ({
    match_phrase: { content: phrase },
  }));

  if (phraseClauses.length > 0) {
    if (requirePhrases) {
      // strict: quoted phrases must appear exactly
      must.push(...phraseClauses);
    } else {
      // soft: quoted phrases boost results but aren't required
      must.push({
        bool: { should: phraseClauses, minimum_should_match: 1 },
      });
    }
  }
  for (const group of parsed.orGroups) {
    const should: unknown[] = [];
    for (const term of group.terms) {
      should.push(
        useFuzzy
          ? {
              match: {
                content: {
                  query: term,
                  fuzziness: "AUTO",
                  prefix_length: 2,
                  max_expansions: 50,
                },
              },
            }
          : { match: { content: { query: term, operator: "and" } } },
      );
    }
    for (const phrase of group.phrases) {
      should.push({ match_phrase: { content: phrase } });
    }
    if (should.length > 0) {
      must.push({ bool: { should, minimum_should_match: 1 } });
    }
  }

  if (parsed.keywords.length > 0) {
    // Expand trailing underscore to wildcard (EFTA_ -> EFTA_*)
    const kws = parsed.keywords.map((k) => (k.endsWith("_") ? `${k}*` : k));
    const raw = kws.join(" ");

    // Special expansions
    const tldClauses: string[] = [];
    const dateClauses: string[] = [];
    const normalTerms: string[] = [];

    for (const k of kws) {
      if (isTldToken(k)) {
        const q = tldToQueryString(k);
        if (q) tldClauses.push(q);
        continue;
      }
      const dq = dateTokenToQueryString(stripOuterQuotes(k));
      if (dq) {
        dateClauses.push(dq);
        continue;
      }
      normalTerms.push(k);
    }

    const hasWildcard = /[*?]/.test(raw);

    // If we have special query_string clauses, use query_string so they actually work.
    const needsQueryString =
      hasWildcard || tldClauses.length > 0 || dateClauses.length > 0;

    if (needsQueryString) {
      // Build a query_string that combines:
      // - normal terms (space implies AND with default_operator)
      // - OR blocks for tld + dates
      const parts: string[] = [];

      if (normalTerms.length > 0) {
        // Escape query_string reserved chars for normal terms except *?
        const escaped = normalTerms
          .map((t) => t.replace(/([+\-=&|><!(){}\[\]^"~:\\/])/g, "\\$1"))
          .join(" ");
        parts.push(escaped);
      }

      parts.push(...tldClauses);
      parts.push(...dateClauses);

      must.push({
        query_string: {
          query: parts.filter(Boolean).join(" AND "),
          fields: ["content"],
          analyze_wildcard: true,
          default_operator: "AND",
        },
      });
    } else if (useFuzzy) {
      must.push({
        multi_match: {
          query: normalTerms.join(" "),
          fields: ["content"],
          fuzziness: "AUTO",
          prefix_length: 2,
          max_expansions: 50,
          operator: "and",
        },
      });
    } else {
      must.push({
        match: { content: { query: normalTerms.join(" "), operator: "and" } },
      });
    }
  }

  for (const term of parsed.excludeTerms) {
    mustNot.push({ match: { content: { query: term, operator: "and" } } });
  }
  for (const phrase of parsed.excludePhrases) {
    mustNot.push({ match_phrase: { content: phrase } });
  }

  for (const value of parsed.filters.dataset) {
    filter.push({ term: { dataset: value } });
  }
  for (const value of parsed.filters.doc) {
    filter.push({ term: { doc_id: value } });
  }
  for (const value of parsed.filters.file) {
    filter.push({ term: { filename: value } });
  }
  for (const value of parsed.filters.path) {
    filter.push({ term: { path: value } });
  }
  for (const value of parsed.wildcards.file) {
    filter.push({ wildcard: { filename: value } });
  }
  for (const value of parsed.wildcards.path) {
    filter.push({ wildcard: { path: value } });
  }

  return { bool: { must, must_not: mustNot, filter } };
}

function buildSemanticClause(parsed: ParsedQuery, requirePhrases: boolean) {
  const must: unknown[] = [];
  const mustNot: unknown[] = [];
  const filter: unknown[] = [];

  if (requirePhrases) {
    for (const phrase of parsed.phrases) {
      must.push({ match_phrase: { content: phrase } });
    }
  }

  for (const term of parsed.excludeTerms) {
    mustNot.push({ match: { content: { query: term, operator: "and" } } });
  }
  for (const phrase of parsed.excludePhrases) {
    mustNot.push({ match_phrase: { content: phrase } });
  }

  for (const value of parsed.filters.dataset) {
    filter.push({ term: { dataset: value } });
  }
  for (const value of parsed.filters.doc) {
    filter.push({ term: { doc_id: value } });
  }
  for (const value of parsed.filters.file) {
    filter.push({ term: { filename: value } });
  }
  for (const value of parsed.filters.path) {
    filter.push({ term: { path: value } });
  }
  for (const value of parsed.wildcards.file) {
    filter.push({ wildcard: { filename: value } });
  }
  for (const value of parsed.wildcards.path) {
    filter.push({ wildcard: { path: value } });
  }

  const semanticParts: string[] = [];
  semanticParts.push(...parsed.keywords);
  for (const group of parsed.orGroups) {
    semanticParts.push(...group.terms);
    semanticParts.push(...group.phrases);
  }
  if (semanticParts.length === 0 && parsed.phrases.length > 0) {
    semanticParts.push(...parsed.phrases);
  }
  if (semanticParts.length > 0) {
    must.push({
      semantic: {
        field: "content_semantic",
        query: semanticParts.join(" "),
      },
    });
  }

  return { bool: { must, must_not: mustNot, filter } };
}

function buildHighlight(
  parsed: ParsedQuery,
  userQuery: string,
  maxAnalyzedOffset: number,
) {
  const should: unknown[] = [];

  for (const phrase of parsed.phrases) {
    should.push({ match_phrase: { content: phrase } });
  }
  for (const keyword of parsed.keywords) {
    // don't push match() for wildcard tokens
    if (/[*?]/.test(keyword)) continue;
    // don't push match() for .gov tokens either (handled by query_string below)
    if (isTldToken(keyword)) continue;
    // don't push match() for date tokens (handled by query_string below)
    if (dateTokenToQueryString(stripOuterQuotes(keyword))) continue;

    should.push({ match: { content: { query: keyword, operator: "and" } } });
  }

  // Build one query_string for wildcard/tld/date highlighting if needed
  const kws = parsed.keywords.map((k) => (k.endsWith("_") ? `${k}*` : k));
  const tldClauses: string[] = [];
  const dateClauses: string[] = [];
  const normalTerms: string[] = [];

  for (const k of kws) {
    if (isTldToken(k)) {
      const q = tldToQueryString(k);
      if (q) tldClauses.push(q);
      continue;
    }
    const dq = dateTokenToQueryString(stripOuterQuotes(k));
    if (dq) {
      dateClauses.push(dq);
      continue;
    }
    normalTerms.push(k);
  }

  const raw = kws.join(" ");
  const hasWildcard = /[*?]/.test(raw);
  const needsQueryString =
    hasWildcard || tldClauses.length > 0 || dateClauses.length > 0;

  if (needsQueryString) {
    const parts: string[] = [];

    if (normalTerms.length > 0) {
      const escaped = normalTerms
        .map((t) => t.replace(/([+\-=&|><!(){}\[\]^"~:\\/])/g, "\\$1"))
        .join(" ");
      parts.push(escaped);
    }

    parts.push(...tldClauses);
    parts.push(...dateClauses);

    const q = parts.filter(Boolean).join(" AND ");
    if (q) {
      should.push({
        query_string: {
          query: q,
          fields: ["content"],
          analyze_wildcard: true,
          default_operator: "AND",
        },
      });
    }
  }
  for (const group of parsed.orGroups) {
    for (const term of group.terms) {
      should.push({ match: { content: { query: term, operator: "and" } } });
    }
    for (const phrase of group.phrases) {
      should.push({ match_phrase: { content: phrase } });
    }
  }
  if (should.length === 0 && userQuery.trim()) {
    should.push({
      match: { content: { query: userQuery.trim(), operator: "and" } },
    });
  }

  const boostedMaxOffset = looksLikeFilenameQuery(userQuery)
    ? Math.max(maxAnalyzedOffset, 3_000_000)
    : maxAnalyzedOffset;

  return {
    pre_tags: ["<mark><b>"],
    post_tags: ["</b></mark>"],
    fields: {
      content: {
        fragment_size: 240,
        number_of_fragments: 4,
        max_analyzed_offset: boostedMaxOffset,
        highlight_query: {
          bool: {
            should,
            minimum_should_match: 1,
          },
        },
      },
    },
  };
}

function renderHighlightedFragment(fragment: string) {
  const parts = fragment
    .split(/(<mark><b>[\s\S]*?<\/b><\/mark>)/gi)
    .filter(Boolean);
  return parts.map((part, index) => {
    const match = part.match(/^<mark><b>([\s\S]*?)<\/b><\/mark>$/i);
    if (match) {
      return (
        <mark key={`m-${index}`} className="search-mark">
          <b>{match[1]}</b>
        </mark>
      );
    }
    return <span key={`t-${index}`}>{part}</span>;
  });
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function SearchPage() {
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isFetchingMoreRef = useRef(false);
  const autoSearchInitRef = useRef(false);
  const [query, setQuery] = useState("");
  // const [status, setStatus] = useState("idle");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [activeQuery, setActiveQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [topSuggestions, setTopSuggestions] = useState<string[]>([]);
  const [latestSuggestions, setLatestSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [useHybrid, setUseHybrid] = useState(false);
  const [requirePhrases, setRequirePhrases] = useState(true);
  const [useFuzzy, setUseFuzzy] = useState(false);
  const [pageSize, setPageSize] = useState(20);
  const [highlightMax, setHighlightMax] = useState(5_000_000);
  const [trackTotal, setTrackTotal] = useState("true");
  const [from, setFrom] = useState(0);
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewVoteMeta, setPreviewVoteMeta] =
    useState<PreviewVoteMeta | null>(null);
  const [expandedSnippets, setExpandedSnippets] = useState<
    Record<string, boolean>
  >({});
  const snippetRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [snippetHasOverflow, setSnippetHasOverflow] = useState<
    Record<string, boolean>
  >({});

  const totalHits = useMemo(() => {
    const total = results?.hits?.total;
    if (typeof total === "number") {
      return total;
    }
    return total?.value ?? 0;
  }, [results]);

  const hits = results?.hits?.hits ?? [];
  const took = results?.took ?? 0;
  const didYouMean = results?.suggest?.did_you_mean?.[0]?.options?.[0]?.text;
  const isQueryingSuggestions = query.trim().length > 0;
  const showSuggestionMenu =
    showSuggestions &&
    (isQueryingSuggestions
      ? suggestions.length > 0
      : topSuggestions.length > 0 || latestSuggestions.length > 0);

  useEffect(() => {
    if (!showSuggestions) {
      return;
    }

    const q = query.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          ...(q ? { q } : {}),
          limit: "10",
        }).toString();
        const response = await fetch(`/api/doj-search/suggestions?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          suggestions?: string[];
          topSuggestions?: string[];
          latestSuggestions?: string[];
        };
        setSuggestions(payload.suggestions ?? []);
        setTopSuggestions(payload.topSuggestions ?? []);
        setLatestSuggestions(payload.latestSuggestions ?? []);
      } catch {
        // Keep search usable if suggestion fetch fails.
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, showSuggestions]);

  const runSearch = useCallback(
    async (
      resetPage: boolean,
      queryOverride?: string,
      fromOverride?: number,
      options?: { append?: boolean },
    ) => {
      const append = Boolean(options?.append);
      const q = (queryOverride ?? (append ? activeQuery : query)).trim();
      if (!q) {
        setError("Enter a query.");
        // setStatus("idle");
        return;
      }

      if (append && (isFetchingMoreRef.current || loadingMore)) {
        return;
      }

      const nextFrom = append
        ? (fromOverride ?? hits.length)
        : resetPage
          ? 0
          : (fromOverride ?? from);
      const parsed = parseGoogleish(q);
      const lexicalQuery = buildLexicalClause(parsed, requirePhrases, useFuzzy);
      const highlight = buildHighlight(parsed, q, highlightMax);

      const trackTotalHits = trackTotal === "true" ? true : Number(trackTotal);
      const suggest = {
        did_you_mean: {
          text: q,
          term: { field: "content" },
        },
      };

      const body = useHybrid
        ? {
            track_total_hits: trackTotalHits,
            from: nextFrom,
            size: pageSize,
            retriever: {
              rrf: {
                retrievers: [
                  { standard: { query: lexicalQuery } },
                  {
                    standard: {
                      query: buildSemanticClause(parsed, requirePhrases),
                    },
                  },
                ],
                rank_window_size: 500,
                rank_constant: 60,
              },
            },
            _source: ["doc_id", "filename", "path", "dataset"],
            highlight,
            suggest,
          }
        : {
            track_total_hits: trackTotalHits,
            from: nextFrom,
            size: pageSize,
            query: lexicalQuery,
            _source: ["doc_id", "filename", "path", "dataset"],
            highlight,
            suggest,
          };

      // setStatus("searching");
      setError(null);
      if (append) {
        isFetchingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text}`);
        }
        const payload = (await response.json()) as SearchResponse;
        if (append) {
          setResults((prev) => {
            if (!prev) {
              return payload;
            }
            const prevHits = prev.hits?.hits ?? [];
            const nextHits = payload.hits?.hits ?? [];
            const merged = [...prevHits];
            const seen = new Set(
              merged.map((item, idx) => getHitKey(item, idx)),
            );
            for (let i = 0; i < nextHits.length; i += 1) {
              const candidate = nextHits[i];
              const key = getHitKey(candidate, i);
              if (seen.has(key)) {
                continue;
              }
              seen.add(key);
              merged.push(candidate);
            }
            return {
              ...payload,
              hits: {
                ...(payload.hits ?? {}),
                total: payload.hits?.total ?? prev.hits?.total,
                hits: merged,
              },
            };
          });
        } else {
          setResults(payload);
          setExpandedSnippets({});
          setSnippetHasOverflow({});
        }
        setActiveQuery(q);
        setFrom(nextFrom);
        // setStatus("done");
      } catch (err) {
        // setStatus("error");
        setError(
          `${String(err)}\n\nNotes:\n- If Hybrid is enabled but index lacks semantic fields, disable Hybrid.\n- If highlights are missing on long docs, increase highlight max analyzed chars.`,
        );
      } finally {
        if (append) {
          isFetchingMoreRef.current = false;
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [
      activeQuery,
      from,
      highlightMax,
      hits.length,
      loadingMore,
      pageSize,
      query,
      requirePhrases,
      trackTotal,
      useFuzzy,
      useHybrid,
    ],
  );

  useEffect(() => {
    if (autoSearchInitRef.current) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const initialQuery =
      params.get("q")?.trim() ||
      params.get("query")?.trim() ||
      params.get("keys")?.trim() ||
      "";
    if (!initialQuery) {
      autoSearchInitRef.current = true;
      return;
    }
    autoSearchInitRef.current = true;
    setQuery(initialQuery);
    setShowSuggestions(false);
    void runSearch(true, initialQuery);
  }, [runSearch]);

  useEffect(() => {
    if (
      !results ||
      loading ||
      loadingMore ||
      !activeQuery ||
      hits.length === 0 ||
      hits.length >= totalHits
    ) {
      return;
    }
    const target = loadMoreRef.current;
    if (!target) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void runSearch(false, activeQuery, hits.length, { append: true });
        }
      },
      {
        root: null,
        rootMargin: "500px 0px",
        threshold: 0,
      },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    activeQuery,
    hits.length,
    loading,
    loadingMore,
    results,
    runSearch,
    totalHits,
  ]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSnippetHasOverflow((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const [key, element] of Object.entries(snippetRefs.current)) {
          if (!element) {
            continue;
          }
          const isCollapsed = element.classList.contains("is-collapsed");
          if (!isCollapsed) {
            continue;
          }
          const hasOverflow = element.scrollHeight > element.clientHeight + 1;
          if (next[key] !== hasOverflow) {
            next[key] = hasOverflow;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expandedSnippets, hits.length, results]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowSuggestions(false);
    void runSearch(true);
  }

  function onSuggestionSelect(suggestion: string) {
    setQuery(suggestion);
    setShowSuggestions(false);
    void runSearch(true, suggestion);
  }

  function onClearQuery() {
    setQuery("");
    setShowSuggestions(true);
    const input = queryInputRef.current;
    if (input && document.activeElement !== input) {
      input.focus();
    }
  }

  function onOpenPdfPreview(
    eftaId: string,
    voteMeta?: {
      fileName?: string | null;
      snippet?: string | null;
    },
  ) {
    const normalized = eftaId.trim();
    if (!normalized) {
      return;
    }
    setPreviewTitle(normalized);
    setPreviewUrl(`/api/pdf/${encodeURIComponent(normalized)}`);
    setPreviewVoteMeta({
      voteUrl: `/api/pdf/${encodeURIComponent(normalized)}`,
      voteTitle: normalized,
      voteFileName: voteMeta?.fileName ?? `${normalized}.pdf`,
      voteSnippet: voteMeta?.snippet ?? null,
    });
  }

  return (
    <main className="app-shell search-v2-page">
      <div className="glow glow-left" />
      <div className="glow glow-right" />

      <section className="hero">
        <p className="eyebrow">Search</p>
        <h1>Advanced Search V2</h1>
        <p className="subtitle">
          Google-like syntax, hybrid ranking, and highlighting
        </p>
        <p className="subtitle" style={{ paddingTop: "0.2rem" }}>
          OCR Dataset contributed by:{" "}
          <Link
            className="table-link"
            href="https://certant.ai/"
            target="_blank"
          >
            CertantAI
          </Link>
        </p>
      </section>

      <GlobalNav
        items={globalNavConfig.items}
        mobileTitle={globalNavConfig.mobileTitle}
        initiallyExpandedGroups={globalNavConfig.initiallyExpandedGroups}
      />

      <section className="panel search-v2-query-panel">
        <form className="search-v2-query-row" onSubmit={onSubmit}>
          <div className="suggestion-wrap">
            <input
              ref={queryInputRef}
              type="text"
              value={query}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                setTimeout(() => setShowSuggestions(false), 120);
              }}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="try: musk -elon"
              autoComplete="off"
            />
            {query.trim().length > 0 && (
              <button
                type="button"
                className="search-clear-btn"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onClearQuery}
                aria-label="Clear search query"
              >
                ×
              </button>
            )}
            {showSuggestionMenu && (
              <ul className="suggestions-menu" role="listbox">
                {isQueryingSuggestions ? (
                  <>
                    <li className="suggestions-label">Suggestions</li>
                    {suggestions.map((suggestion) => (
                      <li key={`s-${suggestion}`}>
                        <button
                          type="button"
                          className="suggestion-item"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            onSuggestionSelect(suggestion);
                          }}
                        >
                          {suggestion}
                        </button>
                      </li>
                    ))}
                  </>
                ) : (
                  <>
                    <li className="suggestions-columns">
                      <div className="suggestions-column">
                        <p className="suggestions-label">Top 10 Searches</p>
                        {topSuggestions.map((suggestion) => (
                          <button
                            key={`top-${suggestion}`}
                            type="button"
                            className="suggestion-item"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              onSuggestionSelect(suggestion);
                            }}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                      <div className="suggestions-column">
                        <p className="suggestions-label">Latest 10 Searches</p>
                        {latestSuggestions.map((suggestion) => (
                          <button
                            key={`latest-${suggestion}`}
                            type="button"
                            className="suggestion-item"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              onSuggestionSelect(suggestion);
                            }}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </li>
                  </>
                )}
              </ul>
            )}
          </div>
          <button type="submit">Search</button>
          {/* <span className="badge badge-muted search-v2-status">{status}</span> */}
        </form>
      </section>

      <section className="panel search-v2-controls-panel">
        <div className="search-v2-controls-grid">
          <div className="search-v2-help-panel">
            <button
              type="button"
              className="search-v2-toggle-btn"
              onClick={() => setShowSyntaxHelp((prev) => !prev)}
              aria-expanded={showSyntaxHelp}
            >
              Syntax (Google-ish) {showSyntaxHelp ? "Hide" : "Show"}
            </button>
            {showSyntaxHelp && (
              <div className="search-v2-help-rows">
                <p>
                  <span>Exact phrase</span>
                  <code>&quot;massage appointment&quot;</code>
                </p>
                <p>
                  <span>AND by default</span>
                  <code>&quot;Palm Beach&quot; witness</code>
                </p>
                <p>
                  <span>Exclude</span>
                  <code>Epstein -Maxwell</code>
                </p>
                <p>
                  <span>OR groups</span>
                  <code>
                    (&quot;Palm Beach&quot; OR &quot;New York&quot;) Epstein
                  </code>
                </p>
                <p>
                  <span>Wildcard</span>
                  <code>file:20180001*, file:*.jpg, path:*VOL00009*</code>
                </p>
                <p>
                  <span>Field filters</span>
                  <code>dataset:dataset_9, doc:EFTA00005711</code>
                </p>
              </div>
            )}
          </div>

          <div className="search-v2-settings-panel">
            <button
              type="button"
              className="search-v2-toggle-btn"
              onClick={() => setShowFilters((prev) => !prev)}
              aria-expanded={showFilters}
            >
              Search Settings
            </button>
            {showFilters && (
              <>
                <div
                  className="search-v2-settings-grid"
                  style={{ paddingTop: 10 }}
                >
                  <label
                    className="switch-row search-v2-switch"
                    htmlFor="search-hybrid-toggle"
                  >
                    <span>Hybrid (RRF: BM25 + semantic)</span>
                    <input
                      id="search-hybrid-toggle"
                      type="checkbox"
                      role="switch"
                      checked={useHybrid}
                      onChange={(event) => setUseHybrid(event.target.checked)}
                    />
                  </label>
                  <label
                    className="switch-row search-v2-switch"
                    htmlFor="search-require-phrases-toggle"
                  >
                    <span>Require quoted phrases</span>
                    <input
                      id="search-require-phrases-toggle"
                      type="checkbox"
                      role="switch"
                      checked={requirePhrases}
                      onChange={(event) =>
                        setRequirePhrases(event.target.checked)
                      }
                    />
                  </label>
                  <label
                    className="switch-row search-v2-switch"
                    htmlFor="search-fuzzy-toggle"
                  >
                    <span>Fuzzy keywords (typos)</span>
                    <input
                      id="search-fuzzy-toggle"
                      type="checkbox"
                      role="switch"
                      checked={useFuzzy}
                      onChange={(event) => setUseFuzzy(event.target.checked)}
                    />
                  </label>
                </div>

                <div className="search-v2-select-row">
                  <label>
                    <span className="search-v2-setting-label">
                      Results per page
                    </span>
                    <select
                      value={String(pageSize)}
                      onChange={(event) =>
                        setPageSize(Number(event.target.value))
                      }
                    >
                      <option value="10">10</option>
                      <option value="20">20</option>
                      <option value="50">50</option>
                    </select>
                  </label>
                  <label>
                    <span className="search-v2-setting-label">
                      Highlight max analyzed chars
                    </span>
                    <select
                      value={String(highlightMax)}
                      onChange={(event) =>
                        setHighlightMax(Number(event.target.value))
                      }
                    >
                      <option value="1000000">1,000,000</option>
                      <option value="3000000">3,000,000</option>
                      <option value="5000000">5,000,000</option>
                    </select>
                  </label>
                  <label>
                    <span className="search-v2-setting-label">
                      Track total hits
                    </span>
                    <select
                      value={trackTotal}
                      onChange={(event) => setTrackTotal(event.target.value)}
                    >
                      <option value="true">true (exact)</option>
                      <option value="100000">100,000 (cap)</option>
                      <option value="10000">10,000 (default-ish)</option>
                    </select>
                  </label>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {error && (
        <section className="panel error-panel">
          <strong>Request Error:</strong>
          <pre className="search-v2-error">{error}</pre>
        </section>
      )}

      {results && (
        <section className="panel search-v2-results-panel">
          <header
            className="results-head"
            style={{
              opacity: 0.6,
              border: "none",
              padding: 0,
              marginBottom: 12,
            }}
          >
            <h2>
              Found {formatNumber(totalHits)} hits in {took}ms
            </h2>
          </header>

          {totalHits === 0 && didYouMean && didYouMean !== activeQuery && (
            <p className="search-v2-suggest">
              Did you mean{" "}
              <button
                type="button"
                className="table-link search-v2-suggest-btn"
                onClick={() => {
                  setQuery(didYouMean);
                  void runSearch(true, didYouMean);
                }}
              >
                {didYouMean}
              </button>
              ?
            </p>
          )}

          <div className="search-v2-hit-list">
            {hits.map((hit, index) => {
              const src = hit._source ?? {};
              const fragments = hit.highlight?.content ?? [];
              const eftaId = src.doc_id ?? "";
              const resultKey = getHitKey(hit, index);
              const isExpanded = Boolean(expandedSnippets[resultKey]);
              const hasOverflow = Boolean(snippetHasOverflow[resultKey]);
              const snippetClassName = `search-v2-snippet ${isExpanded ? "is-expanded" : "is-collapsed"}`;
              return (
                <article className="search-v2-hit" key={resultKey}>
                  <header className="search-v2-hit-head">
                    <h3>
                      {eftaId ? (
                        <a
                          href={`/api/pdf/${encodeURIComponent(eftaId)}`}
                          className="table-link"
                          style={{ fontSize: 14 }}
                          onClick={(event) => {
                            event.preventDefault();
                            onOpenPdfPreview(eftaId, {
                              fileName: src.filename ?? null,
                              snippet: fragments[0] ?? null,
                            });
                          }}
                          onMouseDown={(event) => event.preventDefault()}
                        >
                          {eftaId}
                        </a>
                      ) : (
                        (hit._id ?? "(no id)")
                      )}
                    </h3>
                    <div className="search-v2-hit-badges">
                      <span className="badge badge-grey">
                        score{" "}
                        {typeof hit._score === "number"
                          ? hit._score.toFixed(6)
                          : "-"}
                      </span>
                      {src.dataset ? (
                        <span className="badge badge-grey">{src.dataset}</span>
                      ) : null}
                    </div>
                  </header>
                  <div
                    role={hasOverflow ? "button" : undefined}
                    tabIndex={hasOverflow ? 0 : undefined}
                    aria-expanded={hasOverflow ? isExpanded : undefined}
                    onClick={() => {
                      if (!hasOverflow) {
                        return;
                      }
                      setExpandedSnippets((prev) => ({
                        ...prev,
                        [resultKey]: !isExpanded,
                      }));
                    }}
                    onKeyDown={(event) => {
                      if (!hasOverflow) {
                        return;
                      }
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setExpandedSnippets((prev) => ({
                          ...prev,
                          [resultKey]: !isExpanded,
                        }));
                      }
                    }}
                    className={`search-v2-hit-body ${hasOverflow ? "is-toggleable" : ""}`}
                  >
                    <div
                      ref={(element) => {
                        snippetRefs.current[resultKey] = element;
                      }}
                      className={snippetClassName}
                    >
                      {fragments.length > 0 ? (
                        fragments.map((fragment, fragmentIndex) => (
                          <p key={`f-${fragmentIndex}`}>
                            {renderHighlightedFragment(fragment)}
                            {fragmentIndex < fragments.length - 1
                              ? "\n...\n"
                              : ""}
                          </p>
                        ))
                      ) : (
                        <p>(no highlight fragments)</p>
                      )}
                    </div>
                    {fragments.length > 0 && hasOverflow && (
                      <p
                        className="search-v2-more-indicator"
                        style={{
                          fontSize: 14,
                          marginTop: 20,
                          background: "rgba(255, 255, 255, 0.08)",
                          borderRadius: 4,
                          padding: "4px 8px",
                          display: "block",
                          textAlign: "center",
                          color: "#ddd",
                        }}
                      >
                        {isExpanded ? "Show less" : "(expand to see more)"}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {hits.length > 0 && hits.length < totalHits && (
            <div
              ref={loadMoreRef}
              className="results-infinite-trigger"
              aria-hidden="true"
            />
          )}
          {loadingMore && (
            <p className="results-infinite-status">Loading more results...</p>
          )}
          {!loadingMore &&
            !loading &&
            hits.length >= totalHits &&
            hits.length > 0 && (
              <p className="results-infinite-status">End of results.</p>
            )}
        </section>
      )}

      {previewUrl && (
        <MobileChunkedPdfModal
          sourceUrl={previewUrl}
          title={previewTitle || "PDF Preview"}
          kicker="Advanced Search"
          eftaId={previewTitle}
          voteUrl={previewVoteMeta?.voteUrl ?? ""}
          voteTitle={previewVoteMeta?.voteTitle ?? previewTitle}
          voteFileName={previewVoteMeta?.voteFileName ?? undefined}
          voteSnippet={previewVoteMeta?.voteSnippet ?? undefined}
          onClose={() => {
            setPreviewUrl(null);
            setPreviewTitle("");
            setPreviewVoteMeta(null);
          }}
        />
      )}
    </main>
  );
}
function getHitKey(hit: SearchHit, fallbackIndex: number) {
  return [
    hit._id ?? "",
    hit._source?.doc_id ?? "",
    hit._source?.path ?? "",
    String(fallbackIndex),
  ].join("|");
}
