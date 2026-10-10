// Faux client Supabase en mémoire, limité aux appels utilisés par les
// synchronisations testées. Aucun accès réseau.
//
// Comme PostgREST, chaque lecture est plafonnée à `maxRows` lignes (1 000 par
// défaut sur Supabase) SANS erreur : c'est ce plafond silencieux qui tronquait
// les correspondances construites sur « toute la table ».

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

// Syntaxe PostgREST minimale de .or("a.is.null,b.lte.2026-07-15").
function parseOr(expression) {
  const clauses = String(expression).split(",").map((part) => {
    const [column, op, ...rest] = part.split(".");
    const value = rest.join(".");
    if (op === "is" && value === "null") return (row) => row[column] === null || row[column] === undefined;
    return (row) => compare(row[column], op, value);
  });
  return (row) => clauses.some((clause) => clause(row));
}

export function createFakeSupabase(seed = {}, { maxRows = 1000, rpc = {} } = {}) {
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
        return builder;
      },
      insert(payload) { state.op = "insert"; state.payload = payload; return builder; },
      update(payload) { state.op = "update"; state.payload = payload; return builder; },
      upsert(payload, options = {}) { state.op = "upsert"; state.payload = payload; state.options = options; return builder; },
      eq(column, value) { state.filters.push((row) => row[column] === value); return builder; },
      neq(column, value) { state.filters.push((row) => row[column] !== value); return builder; },
      in(column, values) { const set = new Set(values); state.filters.push((row) => set.has(row[column])); return builder; },
      is(column, value) { state.filters.push((row) => (value === null ? row[column] === null || row[column] === undefined : row[column] === value)); return builder; },
      not(column, op, value) {
        if (op !== "is" || value !== null) throw new Error("fakeSupabase: seul not(col, \"is\", null) est géré");
        state.filters.push((row) => row[column] !== null && row[column] !== undefined);
        return builder;
      },
      lt(column, value) { state.filters.push((row) => compare(row[column], "lt", value)); return builder; },
      lte(column, value) { state.filters.push((row) => compare(row[column], "lte", value)); return builder; },
      gt(column, value) { state.filters.push((row) => compare(row[column], "gt", value)); return builder; },
      gte(column, value) { state.filters.push((row) => compare(row[column], "gte", value)); return builder; },
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

    function insertRows(rows) {
      return rows.map((row) => {
        const stored = { id: newId(name), ...row };
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
        rows = insertRows(Array.isArray(state.payload) ? state.payload : [state.payload]);
      } else if (state.op === "update") {
        rows = table(name).filter(matches);
        for (const row of rows) Object.assign(row, state.payload);
      } else if (state.op === "upsert") {
        const keys = String(state.options.onConflict || "id").split(",").map((key) => key.trim());
        const payloads = Array.isArray(state.payload) ? state.payload : [state.payload];
        rows = payloads.map((payload) => {
          const existing = table(name).find((row) => keys.every((key) => row[key] === payload[key]));
          if (existing) return state.options.ignoreDuplicates ? existing : Object.assign(existing, payload);
          return insertRows([payload])[0];
        });
      }
      const data = rows.map((row) => ({ ...row }));
      if (state.mode === "single") return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: `single: ${data.length} ligne(s)` } };
      if (state.mode === "maybeSingle") return data.length <= 1 ? { data: data[0] || null, error: null } : { data: null, error: { message: "maybeSingle: plusieurs lignes" } };
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
