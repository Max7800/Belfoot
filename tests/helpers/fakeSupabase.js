// Faux client Supabase en mémoire, limité aux appels utilisés par les
// synchronisations testées. Aucun accès réseau.
//
// Comme PostgREST, chaque lecture est plafonnée à `maxRows` lignes (1 000 par
// défaut sur Supabase) SANS erreur : c'est ce plafond silencieux qui tronquait
// les correspondances construites sur « toute la table ».

// Colonne simple ou chemin JSON PostgREST « params->>cle » (valeur texte, comme en
// SQL) ou « ext->cle » (valeur JSON telle quelle).
function readColumn(row, column) {
  const text = String(column);
  if (!text.includes("->>") && text.includes("->")) {
    const [base, key] = text.split("->");
    const value = row[base]?.[key];
    return value === undefined ? null : value;
  }
  const [base, key] = text.split("->>");
  if (key === undefined) return row[base];
  const value = row[base]?.[key];
  return value === null || value === undefined ? null : String(value);
}

function compare(left, op, right) {
  if (op === "eq") return String(left) === String(right);
  if (op === "neq") return String(left) !== String(right);
  if (left === null || left === undefined) return false;
  if (op === "lt") return String(left) < String(right);
  if (op === "lte") return String(left) <= String(right);
  if (op === "gt") return String(left) > String(right);
  if (op === "gte") return String(left) >= String(right);
  throw new Error(`fakeSupabase: opérateur non géré ${op}`);
}

// Syntaxe PostgREST minimale de .or("a.is.null,b.lte.2026-07-15,c.in.(x,y)").
// Les virgules à l'intérieur d'une liste in.(…) ne séparent pas les clauses.
function splitOrClauses(expression) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of String(expression)) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) { parts.push(current); current = ""; continue; }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

function parseOr(expression) {
  const clauses = splitOrClauses(expression).map((part) => {
    const [column, op, ...rest] = part.split(".");
    const value = rest.join(".");
    if (op === "is" && value === "null") return (row) => row[column] === null || row[column] === undefined;
    if (op === "in") {
      const set = new Set(value.replace(/^\(|\)$/g, "").split(",").filter(Boolean));
      return (row) => set.has(String(row[column]));
    }
    return (row) => compare(row[column], op, value);
  });
  return (row) => clauses.some((clause) => clause(row));
}

// Valeurs par défaut des colonnes, comme dans les migrations (0001 : locked
// default false sur les entités synchronisées ; 0011 : team_type default
// 'first_team').
const COLUMN_DEFAULTS = {
  clubs: { locked: false, team_type: "first_team" },
  players: { locked: false },
  coaches: { locked: false },
  competitions: { locked: false },
  // 0032_season_rollout : import_status default 'draft', public_active default false.
  seasons: { locked: false, import_status: "draft", public_active: false },
  matches: { locked: false },
};

// Valeurs par défaut calculées à l'insertion (0001_core : job_runs.status
// default 'running', started_at default now() ; 0005 : pipeline_runs). Suit
// l'horloge simulée des tests.
const DYNAMIC_DEFAULTS = {
  job_runs: () => ({ status: "running", started_at: new Date().toISOString() }),
  pipeline_runs: () => ({ status: "running", params: {}, steps: [], next_step: 0, request_count: 0, started_at: new Date().toISOString(), heartbeat_at: new Date().toISOString() }),
};

// `uniqueIndexes` reproduit des index uniques partiels de la base, par ex.
// { competitions: [["source", "external_id"], ["slug"]] } : une insertion qui
// en violerait un échoue ENTIÈREMENT avec le code Postgres 23505, comme un
// INSERT multiple réel (une clé à null n'entre pas dans l'index).
export function createFakeSupabase(seed = {}, { maxRows = 1000, rpc = {}, uniqueIndexes = {}, notNull = {} } = {}) {
  const tables = {};
  const rpcCalls = [];
  let nextId = 1;
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  const table = (name) => (tables[name] ||= []);
  const newId = (name) => `${name}-${nextId++}`;

  function query(name) {
    const state = { op: "select", filters: [], payload: null, options: {}, limit: null, range: null, orders: [], mode: "many", returning: false, countOnly: false };
    const matches = (row) => state.filters.every((filter) => filter(row));
    const builder = {
      select(columns, options = {}) {
        if (state.op !== "select") state.returning = true;
        if (options.head && options.count) state.countOnly = true;
        // Comme PostgREST : `count` accompagne aussi une lecture normale (total avant pagination).
        else if (options.count) state.withCount = true;
        return builder;
      },
      insert(payload) { state.op = "insert"; state.payload = payload; return builder; },
      update(payload) { state.op = "update"; state.payload = payload; return builder; },
      delete() { state.op = "delete"; return builder; },
      upsert(payload, options = {}) { state.op = "upsert"; state.payload = payload; state.options = options; return builder; },
      eq(column, value) { state.filters.push((row) => readColumn(row, column) === value); return builder; },
      neq(column, value) { state.filters.push((row) => readColumn(row, column) !== value); return builder; },
      in(column, values) { const set = new Set(values); state.filters.push((row) => set.has(readColumn(row, column))); return builder; },
      is(column, value) { state.filters.push((row) => (value === null ? readColumn(row, column) === null || readColumn(row, column) === undefined : readColumn(row, column) === value)); return builder; },
      // .contains("params", { cle: valeur }) : inclusion d'objet JSON (opérateur @>).
      contains(column, subset) { state.filters.push((row) => Object.entries(subset || {}).every(([key, value]) => JSON.stringify(row[column]?.[key]) === JSON.stringify(value))); return builder; },
      not(column, op, value) {
        // not(col, "in", "(a,b)") : exclusion d'une liste, comme PostgREST.
        if (op === "in") {
          const excluded = new Set(String(value).replace(/^\(|\)$/g, "").split(",").map((item) => item.trim()));
          state.filters.push((row) => !excluded.has(String(readColumn(row, column))));
          return builder;
        }
        if (op !== "is" || value !== null) throw new Error("fakeSupabase: seuls not(col, \"is\", null) et not(col, \"in\", liste) sont gérés");
        state.filters.push((row) => readColumn(row, column) !== null && readColumn(row, column) !== undefined);
        return builder;
      },
      lt(column, value) { state.filters.push((row) => compare(readColumn(row, column), "lt", value)); return builder; },
      lte(column, value) { state.filters.push((row) => compare(readColumn(row, column), "lte", value)); return builder; },
      gt(column, value) { state.filters.push((row) => compare(readColumn(row, column), "gt", value)); return builder; },
      gte(column, value) { state.filters.push((row) => compare(readColumn(row, column), "gte", value)); return builder; },
      ilike(column, pattern) {
        const regex = new RegExp(`^${String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i");
        state.filters.push((row) => regex.test(String(row[column] ?? "")));
        return builder;
      },
      or(expression) { state.filters.push(parseOr(expression)); return builder; },
      order(column, { ascending = true } = {}) { state.orders.push({ column, ascending }); return builder; },
      limit(count) { state.limit = count; return builder; },
      range(from, to) { state.range = [from, to]; return builder; },
      single() { state.mode = "single"; return builder; },
      maybeSingle() { state.mode = "maybeSingle"; return builder; },
      then(resolve, reject) {
        try { resolve(execute()); } catch (error) { reject(error); }
      },
    };

    function uniqueViolation(rows) {
      const present = (value) => value !== null && value !== undefined;
      for (const keys of uniqueIndexes[name] || []) {
        const seen = new Set(table(name).filter((row) => keys.every((key) => present(row[key]))).map((row) => keys.map((key) => String(row[key])).join("\u0000")));
        for (const row of rows) {
          if (!keys.every((key) => present(row[key]))) continue;
          const value = keys.map((key) => String(row[key])).join("\u0000");
          if (seen.has(value)) return { code: "23505", message: `duplicate key value violates unique constraint "${name}_${keys.join("_")}"` };
          seen.add(value);
        }
      }
      return null;
    }

    function insertRows(rows) {
      return rows.map((row) => {
        const stored = { id: newId(name), ...(COLUMN_DEFAULTS[name] || {}), ...(DYNAMIC_DEFAULTS[name]?.() || {}), ...row };
        table(name).push(stored);
        return stored;
      });
    }

    function selectRows() {
      let rows = table(name).filter(matches);
      if (state.countOnly) return rows;
      for (const { column, ascending } of [...state.orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const left = a[column] ?? "";
          const right = b[column] ?? "";
          if (left === right) return 0;
          return (left < right ? -1 : 1) * (ascending ? 1 : -1);
        });
      }
      if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1);
      if (state.limit !== null) rows = rows.slice(0, state.limit);
      return rows.slice(0, maxRows);
    }

    function execute() {
      let rows = [];
      if (state.op === "select") {
        rows = selectRows();
        if (state.countOnly) return { data: null, count: rows.length, error: null };
      } else if (state.op === "insert") {
        const payloads = Array.isArray(state.payload) ? state.payload : [state.payload];
        const violation = uniqueViolation(payloads);
        if (violation) return { data: null, error: violation };
        // Colonnes NOT NULL déclarées (ex. clubs.name) : même erreur que Postgres (23502).
        const missingColumn = (notNull[name] || []).find((column) => payloads.some((payload) => payload[column] === null || payload[column] === undefined));
        if (missingColumn) return { data: null, error: { code: "23502", message: `null value in column "${missingColumn}" of relation "${name}" violates not-null constraint` } };
        rows = insertRows(payloads);
      } else if (state.op === "update") {
        rows = table(name).filter(matches);
        for (const row of rows) Object.assign(row, state.payload);
      } else if (state.op === "delete") {
        rows = table(name).filter(matches);
        tables[name] = table(name).filter((row) => !matches(row));
      } else if (state.op === "upsert") {
        const keys = String(state.options.onConflict || "id").split(",").map((key) => key.trim());
        // Upsert groupé : comme supabase-js (defaultToNull) et PostgREST, les colonnes
        // sont l'union des clés du lot ; une clé absente d'une ligne y est écrite à null.
        const batch = Array.isArray(state.payload) ? state.payload : [state.payload];
        const columns = [...new Set(batch.flatMap((payload) => Object.keys(payload)))];
        const payloads = batch.length > 1 && state.options.defaultToNull !== false
          ? batch.map((payload) => Object.fromEntries(columns.map((column) => [column, payload[column] === undefined ? null : payload[column]])))
          : batch;
        const conflictKeys = payloads.map((payload) => keys.map((key) => String(payload[key])).join("|"));
        if (new Set(conflictKeys).size < conflictKeys.length) return { data: null, error: { code: "21000", message: "ON CONFLICT DO UPDATE command cannot affect row a second time" } };
        rows = payloads.map((payload) => {
          const existing = table(name).find((row) => keys.every((key) => row[key] === payload[key]));
          if (existing) return state.options.ignoreDuplicates ? existing : Object.assign(existing, payload);
          return insertRows([payload])[0];
        });
      }
      const data = rows.map((row) => ({ ...row }));
      if (state.mode === "single") return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: `single: ${data.length} ligne(s)` } };
      if (state.mode === "maybeSingle") return data.length <= 1 ? { data: data[0] || null, error: null } : { data: null, error: { message: "maybeSingle: plusieurs lignes" } };
      if (state.op === "select" && state.withCount) return { data, count: table(name).filter(matches).length, error: null };
      return { data: state.op === "select" || state.returning ? data : null, error: null };
    }

    return builder;
  }

  return {
    from: (name) => query(name),
    rows: (name) => table(name),
    rpcCalls,
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      return rpc[name] ? rpc[name](args) : { data: null, error: null };
    },
  };
}
