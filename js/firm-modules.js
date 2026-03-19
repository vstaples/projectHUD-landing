// ── HUD Platform · firm-modules.js ──────────────────────────────────────────
// Firm module gating — controls which product features are enabled per firm.
// Checked on page load; gates UI elements and API access.
//
// firm_modules table schema:
//   id       uuid
//   firm_id  uuid
//   modules  text[]   -- e.g. ['project', 'cadence', 'compliance']
//
// Depends on: config.js, auth.js, api.js
// ────────────────────────────────────────────────────────────────────────────

(function() {

let _modules = null;  // null = not yet loaded; [] = loaded but empty
let _firmId  = null;

// ── Load from database ────────────────────────────────────────────────────────

async function load(firmId) {
  _firmId = firmId;
  try {
    const rows = await API.get(`firm_modules?firm_id=eq.${firmId}&limit=1`);
    _modules = rows?.[0]?.modules || [];

    // In development, enable all modules if table is empty
    if (!_modules.length && PHUD.ENV === 'development') {
      _modules = ['project', 'cadence', 'compliance'];
    }

    // Update global PHUD.MODULES to match
    PHUD.MODULES = _modules;

  } catch(e) {
    // Table may not exist yet — default to dev mode with all modules
    console.warn('firm_modules not available, defaulting to all modules enabled');
    _modules = PHUD.MODULES || ['project', 'cadence', 'compliance'];
  }

  applyGating();
  return _modules;
}

// ── Gate check ────────────────────────────────────────────────────────────────

function has(moduleName) {
  if (_modules === null) return PHUD.hasModule(moduleName); // fallback to config
  return _modules.includes(moduleName);
}

function requireModule(moduleName, redirectUrl = '/index.html') {
  if (!has(moduleName)) {
    console.warn(`Module '${moduleName}' not enabled for this firm`);
    window.location.href = redirectUrl;
    return false;
  }
  return true;
}

// ── Apply gating to DOM ───────────────────────────────────────────────────────
// Elements with data-module="cadence" are shown/hidden based on module status

function applyGating() {
  document.querySelectorAll('[data-module]').forEach(el => {
    const mod = el.dataset.module;
    el.style.display = has(mod) ? '' : 'none';
  });
  document.querySelectorAll('[data-module-hide]').forEach(el => {
    const mod = el.dataset.moduleHide;
    el.style.display = has(mod) ? 'none' : '';
  });
}

// ── SQL migration helper ──────────────────────────────────────────────────────
// Returns the SQL needed to create the firm_modules table if it doesn't exist

function getMigrationSQL() {
  return `
-- Create firm_modules table for product tier gating
CREATE TABLE IF NOT EXISTS public.firm_modules (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  firm_id    uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  modules    text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(firm_id)
);

-- RLS
ALTER TABLE public.firm_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm can read own modules"
  ON public.firm_modules FOR SELECT
  USING (firm_id = (auth.jwt()->>'firm_id')::uuid);

-- Seed Apex Consulting Group with all modules enabled
INSERT INTO public.firm_modules (firm_id, modules)
VALUES ('aaaaaaaa-0001-0001-0001-000000000001', ARRAY['project','cadence','compliance'])
ON CONFLICT (firm_id) DO UPDATE SET modules = EXCLUDED.modules;
  `.trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

window.HUD = window.HUD || {};
window.HUD.Modules = {
  load,
  has,
  requireModule,
  applyGating,
  getMigrationSQL,
  get list() { return _modules || PHUD.MODULES; },
};

})();