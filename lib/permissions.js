// Permissions extensibles : rôle -> actions. Les modules peuvent enrichir via grant().
const PERMS = { admin: ["*"], member: ["contribute", "comment", "vote", "report"], guest: [] };
export function grant(role, actions) { PERMS[role] = [...new Set([...(PERMS[role] || []), ...actions])]; }
export function can(role, action) { const a = PERMS[role || "guest"] || []; return a.includes("*") || a.includes(action); }
