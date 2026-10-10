// Faux client Supabase en mémoire, limité aux appels utilisés par les
// synchronisations testées : select / insert / update / upsert, filtres eq / in,
// limit, single / maybeSingle. Aucun accès réseau.

export function createFakeSupabase(seed = {}) {
  const tables = {};
  let nextId = 1;
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  const table = (name) => (tables[name] ||= []);
  const newId = (name) => `${name}-${nextId++}`;

  function query(name) {
    const state = { op: "select", filters: [], payload: null, options: {}, limit: null, mode: "many", returning: false };
    const matches = (row) => state.filters.every((filter) => filter(row));
    const builder = {
      select() {
        if (state.op !== "select") state.returning = true;
        return builder;
      },
      insert(payload) { state.op = "insert"; state.payload = payload; return builder; },
      update(payload) { state.op = "update"; state.payload = payload; return builder; },
      upsert(payload, options = {}) { state.op = "upsert"; state.payload = payload; state.options = options; return builder; },
      eq(column, value) { state.filters.push((row) => row[column] === value); return builder; },
      in(column, values) { const set = new Set(values); state.filters.push((row) => set.has(row[column])); return builder; },
      limit(count) { state.limit = count; return builder; },
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

    function execute() {
      let rows = [];
      if (state.op === "select") {
        rows = table(name).filter(matches);
        if (state.limit !== null) rows = rows.slice(0, state.limit);
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
          if (existing) return Object.assign(existing, payload);
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
  };
}
