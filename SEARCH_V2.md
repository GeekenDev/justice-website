## API ROUTE

ENV VARS: (make them secrets)
--es "https://epstein-72d494.es.us-central1.gcp.cloud.es.io:9243" --api-key "dGUtN21ad0JCeHFSMGtxUnJ4RWE6bWdGaFBueG5MdlowRHY0eFRlUGdSQQ=="

```js
// Proxy search to Elasticsearch
if (req.method === "POST" && req.url === "/search") {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const target = `${ES_URL.replace(/\/$/, "")}/${encodeURIComponent(ES_INDEX)}/_search`;

      const esResp = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${ES_API_KEY}`,
        },
        body,
      });

      const text = await esResp.text();
      res.writeHead(esResp.status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(text);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
  return;
}
```

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>
      Elastic Local Test UI (Google-like Syntax + Hybrid + Highlight)
    </title>
    <style>
      body {
        font-family:
          system-ui,
          -apple-system,
          Segoe UI,
          Roboto,
          Arial,
          sans-serif;
        margin: 24px;
      }
      .row {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }
      input[type="text"] {
        width: min(980px, 100%);
        padding: 10px;
        font-size: 16px;
      }
      button {
        padding: 10px 14px;
        font-size: 16px;
        cursor: pointer;
      }
      .meta {
        color: #666;
        font-size: 13px;
        margin-top: 6px;
      }
      .results {
        margin-top: 18px;
      }
      .hit {
        padding: 12px 0;
        border-top: 1px solid #eee;
      }
      .hit h3 {
        margin: 0 0 6px 0;
        font-size: 16px;
      }
      .hit .small {
        color: #666;
        font-size: 12px;
        margin-bottom: 8px;
      }
      .snip {
        background: #fafafa;
        padding: 10px;
        border-radius: 8px;
        white-space: pre-wrap;
        line-height: 1.5;
      }
      mark {
        background: #ffeb3b;
        color: #000;
        padding: 0 2px;
        border-radius: 2px;
      }
      mark b {
        font-weight: 800;
      }
      .error {
        color: #b00020;
        background: #fff0f0;
        padding: 10px;
        border-radius: 8px;
        margin-top: 12px;
        white-space: pre-wrap;
      }
      details {
        margin-top: 10px;
      }
      textarea {
        width: 100%;
        min-height: 220px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 12px;
      }
      .muted {
        color: #666;
      }
      .pill {
        display: inline-block;
        padding: 2px 8px;
        border: 1px solid #ddd;
        border-radius: 999px;
        font-size: 12px;
        color: #444;
      }
      .help {
        margin-top: 10px;
        padding: 10px;
        border: 1px solid #eee;
        border-radius: 10px;
        background: #fcfcfc;
        color: #444;
        font-size: 13px;
      }
      .help code {
        background: #f3f3f3;
        padding: 1px 6px;
        border-radius: 6px;
      }
      .suggest {
        margin-top: 6px;
        font-size: 13px;
        color: #444;
      }
      .suggest a {
        color: #1a73e8;
        text-decoration: none;
      }
      .suggest a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <h1>Elastic local test: Google-like syntax + Hybrid (RRF) + Highlight</h1>

    <div class="row">
      <input
        id="q"
        type="text"
        placeholder='Try: "The shipment has arrived" -Paul dataset:dataset_9 file:*.jpg'
      />
      <button id="btn">Search</button>
      <span id="status" class="pill muted">idle</span>
    </div>

    <div class="meta">
      Endpoint: <code id="esLabel">http://localhost:3000/search</code> ·
      Index/Alias: <code id="idxLabel"></code>
    </div>

    <div class="help">
      <div><b>Syntax</b> (Google-ish):</div>
      <ul>
        <li>Exact phrase: <code>"the shipment has arrived"</code></li>
        <li>AND by default: <code>"shipment arrived" Paul</code></li>
        <li>Exclude: <code>"shipment arrived" -Paul -invoice</code></li>
        <li>OR groups: <code>(Paul OR John) "shipment arrived"</code></li>
        <li>
          Wildcard: <code>file:20180001*</code> or <code>file:*.jpg</code> or
          <code>path:*VOL00009*</code>
        </li>
        <li>
          Field filters: <code>dataset:dataset_9</code>,
          <code>doc:EFTA00005711</code>, <code>file:EFTA00005711.md</code>,
          <code>path:ds9_clean/EFTA*</code>
        </li>
      </ul>
      <div class="muted">
        Notes: Wildcards only apply to fields like
        <code>filename</code>/<code>path</code>. Quotes force phrase match on
        <code>content</code>.
      </div>
    </div>

    <details>
      <summary>Settings</summary>
      <div class="muted" style="margin-top: 8px">
        This UI posts to your local proxy
        <code>http://localhost:3000/search</code>. Your proxy chooses the
        index/alias (ES_INDEX). Put <code>all_lex</code> or
        <code>ds_9_lex</code> in ES_INDEX and restart the proxy.
      </div>

      <div class="row" style="margin-top: 10px">
        <label
          ><input id="useHybrid" type="checkbox" checked /> Hybrid (RRF: BM25 +
          semantic)</label
        >
        <label
          ><input id="requirePhrases" type="checkbox" checked /> Require quoted
          phrases</label
        >
        <label
          ><input id="useFuzzy" type="checkbox" checked /> Fuzzy keywords
          (typos)</label
        >
        <label><input id="showJson" type="checkbox" /> Show request JSON</label>
      </div>

      <div class="row" style="margin-top: 10px">
        <label
          >Results per page:
          <select id="pageSize">
            <option>10</option>
            <option selected>20</option>
            <option>50</option>
          </select>
        </label>
        <label
          >Highlight max analyzed chars:
          <select id="hlMax">
            <option value="1000000" selected>1,000,000</option>
            <option value="3000000">3,000,000</option>
            <option value="5000000">5,000,000</option>
          </select>
        </label>
        <label
          >Track total hits:
          <select id="trackTotal">
            <option value="true" selected>true (exact)</option>
            <option value="100000">100,000 (cap)</option>
            <option value="10000">10,000 (default-ish)</option>
          </select>
        </label>
      </div>
    </details>

    <div id="jsonWrap" style="display: none; margin-top: 12px">
      <div class="muted">Request JSON:</div>
      <textarea id="jsonOut" readonly></textarea>
    </div>

    <div id="error" class="error" style="display: none"></div>

    <div class="results" id="results"></div>

    <script>
      // -------------------- Helpers --------------------
      function setStatus(text) {
        document.getElementById("status").textContent = text;
      }

      function showError(msg) {
        const el = document.getElementById("error");
        el.style.display = "block";
        el.textContent = msg;
      }

      function clearError() {
        const el = document.getElementById("error");
        el.style.display = "none";
        el.textContent = "";
      }

      function escapeHtml(s) {
        return String(s).replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#039;",
            })[c],
        );
      }

      function stripOuterQuotes(s) {
        if (!s) return s;
        const t = s.trim();
        if (t.length >= 2 && t.startsWith('"') && t.endsWith('"'))
          return t.slice(1, -1);
        return t;
      }

      function looksLikeFilenameQuery(q) {
        // If the user typed something like 20180001.jpg or has a dot-extension token
        return /\b[A-Za-z0-9_-]+\.[A-Za-z0-9]{2,6}\b/.test(q);
      }

      // -------------------- Google-ish query parser --------------------
      /**
       * Supports:
       *  - quoted phrases: "The shipment has arrived"
       *  - exclusions: -Paul  -"some phrase"
       *  - OR groups: (Paul OR John OR "Jane Doe")
       *  - field filters: dataset:dataset_9 doc:EFTA... file:*.jpg path:*VOL*
       *  - remaining tokens are keywords
       */
      function parseGoogleish(input) {
        const s = input.trim();
        const out = {
          phrases: [], // required quoted phrases
          excludePhrases: [], // -"phrase"
          excludeTerms: [], // -word
          keywords: [], // remaining keywords
          orGroups: [], // array of groups; each group: { phrases:[], terms:[] }
          filters: { dataset: [], doc: [], file: [], path: [] },
          wildcards: { file: [], path: [] }, // wildcard patterns
        };

        // 1) Extract OR groups like: (Paul OR John OR "Jane Doe")
        // We remove them from the string and parse the contents separately.
        let remaining = s.replace(/\(([^()]*)\)/g, (match, inner) => {
          if (!/\bOR\b/i.test(inner)) return match; // keep non-OR parentheses
          const parts = inner
            .split(/\bOR\b/i)
            .map((p) => p.trim())
            .filter(Boolean);
          const group = { phrases: [], terms: [] };
          for (const p of parts) {
            const t = stripOuterQuotes(p);
            if (p.trim().startsWith('"') && p.trim().endsWith('"'))
              group.phrases.push(t);
            else group.terms.push(t);
          }
          if (group.phrases.length || group.terms.length)
            out.orGroups.push(group);
          return " "; // remove from remaining
        });

        // 2) Tokenize remaining, preserving quoted phrases and -"quoted phrases"
        // This splits into tokens that are either:
        //   -"..." | "..." | -word | word
        const tokenRe = /-"[^"]+"|"[^"]+"|-\S+|\S+/g;
        const tokens = remaining.match(tokenRe) || [];

        for (const rawTok of tokens) {
          const tok = rawTok.trim();
          if (!tok) continue;

          // Field filters: dataset:, doc:, file:, path:
          const m = tok.match(/^([a-zA-Z_]+):(.+)$/);
          if (m) {
            const key = m[1].toLowerCase();
            const valRaw = m[2];
            const val = stripOuterQuotes(valRaw);

            // wildcard detection (* or ?)
            const isWildcard = /[*?]/.test(valRaw);

            if (key === "dataset") out.filters.dataset.push(val);
            else if (key === "doc" || key === "doc_id")
              out.filters.doc.push(val);
            else if (key === "file" || key === "filename") {
              if (isWildcard) out.wildcards.file.push(val);
              else out.filters.file.push(val);
            } else if (key === "path") {
              if (isWildcard) out.wildcards.path.push(val);
              else out.filters.path.push(val);
            } else {
              // unknown field -> treat as keyword token
              out.keywords.push(tok);
            }
            continue;
          }

          // Exclusions
          if (tok.startsWith('-"') && tok.endsWith('"')) {
            out.excludePhrases.push(stripOuterQuotes(tok.slice(1)));
            continue;
          }
          if (tok.startsWith("-") && tok.length > 1) {
            out.excludeTerms.push(tok.slice(1));
            continue;
          }

          // Required phrases
          if (tok.startsWith('"') && tok.endsWith('"')) {
            out.phrases.push(stripOuterQuotes(tok));
            continue;
          }

          // Otherwise keyword
          out.keywords.push(tok);
        }

        return out;
      }

      // -------------------- Build ES queries --------------------
      function buildLexicalClause(parsed, requirePhrases, useFuzzy) {
        const must = [];
        const must_not = [];

        // quoted phrases -> must match_phrase
        const phraseClauses = (parsed.phrases || []).map((p) => ({
          match_phrase: { content: p },
        }));
        if (requirePhrases) must.push(...phraseClauses);
        else {
          // if not required, treat phrases as boosters
          // (still helps highlight_query later)
        }

        // OR groups: each group is (A OR B OR "C") -> should, minimum 1
        for (const g of parsed.orGroups || []) {
          const should = [];
          for (const t of g.terms || []) {
            // For OR terms, keep them lexical exact-ish (no fuzziness unless user wants)
            should.push(
              useFuzzy
                ? {
                    match: {
                      content: {
                        query: t,
                        fuzziness: "AUTO",
                        prefix_length: 2,
                        max_expansions: 50,
                      },
                    },
                  }
                : { match: { content: { query: t, operator: "and" } } },
            );
          }
          for (const p of g.phrases || []) {
            should.push({ match_phrase: { content: p } });
          }
          if (should.length) {
            must.push({ bool: { should, minimum_should_match: 1 } });
          }
        }

        // Remaining keywords -> must (AND)
        if (parsed.keywords && parsed.keywords.length) {
          const q = parsed.keywords.join(" ");
          if (useFuzzy) {
            must.push({
              multi_match: {
                query: q,
                fields: ["content"],
                fuzziness: "AUTO",
                prefix_length: 2,
                max_expansions: 50,
                operator: "and",
              },
            });
          } else {
            must.push({ match: { content: { query: q, operator: "and" } } });
          }
        }

        // Exclusions
        for (const t of parsed.excludeTerms || []) {
          // exclude token(s)
          must_not.push({ match: { content: { query: t, operator: "and" } } });
        }
        for (const p of parsed.excludePhrases || []) {
          must_not.push({ match_phrase: { content: p } });
        }

        // Filters (keyword fields)
        const filter = [];

        for (const v of parsed.filters.dataset || [])
          filter.push({ term: { dataset: v } });
        for (const v of parsed.filters.doc || [])
          filter.push({ term: { doc_id: v } });
        for (const v of parsed.filters.file || [])
          filter.push({ term: { filename: v } });
        for (const v of parsed.filters.path || [])
          filter.push({ term: { path: v } });

        // Wildcards for file/path
        for (const p of parsed.wildcards.file || [])
          filter.push({ wildcard: { filename: p } });
        for (const p of parsed.wildcards.path || [])
          filter.push({ wildcard: { path: p } });

        return { bool: { must, must_not, filter } };
      }

      function buildSemanticClause(parsed, requirePhrases) {
        // NOTE: semantic query only applies to content_semantic field.
        // We'll still apply filters and phrase constraints via lexical matching in must/filter.
        const must = [];
        const must_not = [];
        const filter = [];

        const phraseClauses = (parsed.phrases || []).map((p) => ({
          match_phrase: { content: p },
        }));
        if (requirePhrases) must.push(...phraseClauses);

        // Exclusions stay lexical
        for (const t of parsed.excludeTerms || [])
          must_not.push({ match: { content: { query: t, operator: "and" } } });
        for (const p of parsed.excludePhrases || [])
          must_not.push({ match_phrase: { content: p } });

        // Filters
        for (const v of parsed.filters.dataset || [])
          filter.push({ term: { dataset: v } });
        for (const v of parsed.filters.doc || [])
          filter.push({ term: { doc_id: v } });
        for (const v of parsed.filters.file || [])
          filter.push({ term: { filename: v } });
        for (const v of parsed.filters.path || [])
          filter.push({ term: { path: v } });
        for (const p of parsed.wildcards.file || [])
          filter.push({ wildcard: { filename: p } });
        for (const p of parsed.wildcards.path || [])
          filter.push({ wildcard: { path: p } });

        // Semantic query text: combine remaining keywords + OR group terms/phrases (flattened)
        const semanticParts = [];
        for (const k of parsed.keywords || []) semanticParts.push(k);
        for (const g of parsed.orGroups || []) {
          for (const t of g.terms || []) semanticParts.push(t);
          for (const p of g.phrases || []) semanticParts.push(p);
        }
        // If user only provided phrases, we still want semantic to help ranking:
        // use phrases as query too.
        if (!semanticParts.length && parsed.phrases?.length)
          semanticParts.push(...parsed.phrases);

        if (semanticParts.length) {
          must.push({
            semantic: {
              field: "content_semantic",
              query: semanticParts.join(" "),
            },
          });
        }

        return { bool: { must, must_not, filter } };
      }

      function buildHighlight(parsed, userQuery) {
        const pageHlMax = parseInt(document.getElementById("hlMax").value, 10);
        // If it looks filename-like, boost highlight coverage automatically
        const autoBoost = looksLikeFilenameQuery(userQuery);
        const maxOffset = autoBoost ? Math.max(pageHlMax, 3000000) : pageHlMax;

        // Force highlighter to use our intended matching logic (fixes phrase-only + retriever quirks)
        const should = [];
        for (const p of parsed.phrases || [])
          should.push({ match_phrase: { content: p } });
        for (const k of parsed.keywords || [])
          should.push({ match: { content: { query: k, operator: "and" } } });
        for (const g of parsed.orGroups || []) {
          for (const t of g.terms || [])
            should.push({ match: { content: { query: t, operator: "and" } } });
          for (const p of g.phrases || [])
            should.push({ match_phrase: { content: p } });
        }
        // If nothing else, still highlight something from the raw query (helps for weird inputs)
        if (!should.length && userQuery.trim())
          should.push({
            match: { content: { query: userQuery.trim(), operator: "and" } },
          });

        return {
          pre_tags: ["<mark><b>"],
          post_tags: ["</b></mark>"],
          fields: {
            content: {
              fragment_size: 240,
              number_of_fragments: 4,
              max_analyzed_offset: maxOffset,
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

      function buildSearchBody({
        userQuery,
        requirePhrases,
        useHybrid,
        useFuzzy,
        pageSize,
        from,
      }) {
        const parsed = parseGoogleish(userQuery);

        const lexicalQuery = buildLexicalClause(
          parsed,
          requirePhrases,
          useFuzzy,
        );

        const highlight = buildHighlight(parsed, userQuery);

        // Track total hits beyond 10k
        const trackChoice = document.getElementById("trackTotal").value;
        const track_total_hits =
          trackChoice === "true" ? true : parseInt(trackChoice, 10);

        // Did-you-mean suggestions from content (lexical)
        const suggest = {
          did_you_mean: {
            text: userQuery,
            term: { field: "content" },
          },
        };

        // Non-hybrid query (lexical only)
        if (!useHybrid) {
          return {
            track_total_hits,
            from,
            size: pageSize,
            query: lexicalQuery,
            _source: ["doc_id", "filename", "path", "dataset"],
            highlight,
            suggest,
          };
        }

        // Hybrid:
        // - use lexicalQuery as one retriever
        // - use semanticClause as second retriever
        // If the index doesn't have content_semantic, ES will 400.
        // So we include a toggle in UI; you should use Hybrid only on *_final indexes (semantic enabled).
        const semanticQuery = buildSemanticClause(parsed, requirePhrases);

        return {
          track_total_hits,
          from,
          size: pageSize,
          retriever: {
            rrf: {
              retrievers: [
                { standard: { query: lexicalQuery } },
                { standard: { query: semanticQuery } },
              ],
              rank_window_size: 500,
              rank_constant: 60,
            },
          },
          _source: ["doc_id", "filename", "path", "dataset"],
          highlight,
          suggest,
        };
      }

      // -------------------- Render --------------------
      function renderResults(resp, userQuery, from, pageSize) {
        const resultsEl = document.getElementById("results");
        resultsEl.innerHTML = "";

        const total = resp?.hits?.total?.value ?? 0;
        const took = resp?.took ?? 0;

        const header = document.createElement("div");
        header.className = "meta";
        header.innerHTML = `Found <b>${Number(total).toLocaleString()}</b> hits in <b>${took}ms</b>`;
        resultsEl.appendChild(header);

        // Did you mean (clickable)
        const suggestion = resp?.suggest?.did_you_mean?.[0]?.options?.[0]?.text;
        if (suggestion && suggestion !== userQuery) {
          const sugDiv = document.createElement("div");
          sugDiv.className = "suggest";
          sugDiv.innerHTML = `Did you mean: <a href="#" id="didYouMean">${escapeHtml(suggestion)}</a>?`;
          resultsEl.appendChild(sugDiv);

          setTimeout(() => {
            const link = document.getElementById("didYouMean");
            if (link) {
              link.onclick = (e) => {
                e.preventDefault();
                document.getElementById("q").value = suggestion;
                runSearch({ resetPage: true });
              };
            }
          }, 0);
        }

        const hits = resp?.hits?.hits ?? [];
        for (const h of hits) {
          const src = h._source || {};
          const frags = h.highlight?.content || [];
          const snippet = frags.length
            ? frags.join("\n...\n")
            : "(no highlight fragments)";

          const div = document.createElement("div");
          div.className = "hit";
          div.innerHTML = `
            <h3>
              ${escapeHtml(src.doc_id || h._id || "(no id)")}
              <span class="pill">score ${h._score?.toFixed ? h._score.toFixed(6) : h._score}</span>
              ${src.dataset ? `<span class="pill">${escapeHtml(src.dataset)}</span>` : ""}
            </h3>
            <div class="small">
              <div><b>file</b>: ${escapeHtml(src.filename || "")}</div>
              <div><b>path</b>: ${escapeHtml(src.path || "")}</div>
            </div>
            <div class="snip">${snippet}</div>
          `;
          resultsEl.appendChild(div);
        }

        // Pagination controls
        const pager = document.createElement("div");
        pager.className = "meta";
        const start = from + 1;
        const end = Math.min(from + pageSize, total);
        const prevDisabled = from <= 0;
        const nextDisabled = from + pageSize >= total;

        pager.innerHTML = `
          <div style="margin-top:10px">
            Showing <b>${Number(start).toLocaleString()}</b>–<b>${Number(end).toLocaleString()}</b>
            ${total ? `of <b>${Number(total).toLocaleString()}</b>` : ""}
            &nbsp;·&nbsp;
            <a href="#" id="prevPage" style="pointer-events:${prevDisabled ? "none" : "auto"};opacity:${prevDisabled ? 0.4 : 1}">Prev</a>
            &nbsp;|&nbsp;
            <a href="#" id="nextPage" style="pointer-events:${nextDisabled ? "none" : "auto"};opacity:${nextDisabled ? 0.4 : 1}">Next</a>
          </div>
        `;
        resultsEl.appendChild(pager);

        setTimeout(() => {
          const prev = document.getElementById("prevPage");
          const next = document.getElementById("nextPage");
          if (prev)
            prev.onclick = (e) => {
              e.preventDefault();
              if (prevDisabled) return;
              window.__from = Math.max(0, from - pageSize);
              runSearch({ resetPage: false });
            };
          if (next)
            next.onclick = (e) => {
              e.preventDefault();
              if (nextDisabled) return;
              window.__from = from + pageSize;
              runSearch({ resetPage: false });
            };
        }, 0);
      }

      // -------------------- Main search --------------------
      async function runSearch({ resetPage } = { resetPage: true }) {
        clearError();
        setStatus("searching…");

        const userQuery = document.getElementById("q").value.trim();
        if (!userQuery) {
          setStatus("idle");
          showError("Enter a query.");
          return;
        }

        const requirePhrases =
          document.getElementById("requirePhrases").checked;
        const useHybrid = document.getElementById("useHybrid").checked;
        const useFuzzy = document.getElementById("useFuzzy").checked;
        const showJson = document.getElementById("showJson").checked;

        const pageSize = parseInt(
          document.getElementById("pageSize").value,
          10,
        );
        if (resetPage || typeof window.__from !== "number") window.__from = 0;
        const from = window.__from || 0;

        const body = buildSearchBody({
          userQuery,
          requirePhrases,
          useHybrid,
          useFuzzy,
          pageSize,
          from,
        });

        const jsonWrap = document.getElementById("jsonWrap");
        jsonWrap.style.display = showJson ? "block" : "none";
        if (showJson) {
          document.getElementById("jsonOut").value = JSON.stringify(
            body,
            null,
            2,
          );
        }

        const url = "http://localhost:3000/search";

        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const text = await res.text();
            throw new Error(`HTTP ${res.status}: ${text}`);
          }

          const data = await res.json();
          renderResults(data, userQuery, from, pageSize);
          setStatus("done");
        } catch (err) {
          setStatus("error");
          showError(
            String(err) +
              "\n\nNotes:\n- If you enabled Hybrid but your index/alias points to *_lex (no semantic field), switch to a *_final index/alias or turn off Hybrid.\n- If highlighting is missing for very long docs, raise Highlight max analyzed chars.\n",
          );
        }
      }

      // -------------------- Init --------------------
      function init() {
        // show which index/alias the proxy is using (if your server injects it, great; otherwise leave blank)
        document.getElementById("idxLabel").textContent =
          "(set ES_INDEX in proxy)";
        document
          .getElementById("btn")
          .addEventListener("click", () => runSearch({ resetPage: true }));
        document.getElementById("q").addEventListener("keydown", (e) => {
          if (e.key === "Enter") runSearch({ resetPage: true });
        });
      }

      init();
    </script>
  </body>
</html>
```
