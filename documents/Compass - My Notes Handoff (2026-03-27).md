# Compass — My Notes · Advanced Features Handoff
**Date:** March 28, 2026  
**For:** Coding agent — Phase 2 enhancements  
**Prerequisites:** my-notes-handoff.md (sections 1–26) + Technical Briefing MD  
**Status:** Design complete and locked. Ready to build.

---

## Overview

This document covers four interconnected enhancements to the My Notes module:

1. **View templates** — save any named view as a reusable blueprint, launch instances with parameterization
2. **Row-based flexible layouts** — replace uniform grid presets with per-row column control, row reordering, slot pruning, and row height
3. **Content swap** — drag-to-swap tiles within and across rows without losing content
4. **View-level invitation and permissions** — invite participants to an entire named view with role-based access, tile-level edit overrides, and read-only defaults

These four features build on top of the existing architecture documented in the Technical Briefing. No existing functionality is removed or broken. All additions are incremental.

---

## 1. View Templates

### Concept

A template is a named view designated as a reusable blueprint. Cloning it creates a new named view with the same layout, tile types, and widget configurations — but with a fresh name and entity bindings specific to the new instance.

### Save as Template flow

1. User configures a named view to their satisfaction
2. Opens the named view dropdown → selects "Save as template"
3. Dialog opens:
   - Template name (pre-filled from view name)
   - Category: Project / Onboarding / QMS / Custom
   - Parameters: comma-separated list of variable names (e.g. `projectName, clientName` or `newHireName, startDate, advisorName`)
   - Default invitees section (see Section 4)
   - Optional description
4. Confirm → template saved to `notes_workspace.state.library`
5. Template appears in the Library section of the left panel

### Library section in left panel

Lives above the knowledge tree. Same collapsible section style as Inbox. Shows template name and category badge per entry. On hover: "Launch instance" button.

### Launch Instance flow

1. User clicks "Launch instance" on a library entry
2. Popup form opens with two sections:

**Section 1 — Parameters**
One input field per parameter defined at template save time.
- Project template: Project name, Client name, PM name
- Onboarding template: New hire full name, Start date, Advisor name

**Section 2 — Invitees**
Pre-populated from template default invitees (see Section 4).
- Required invitees shown with locked checkbox
- Optional invitees shown pre-checked, can be unchecked
- Access level shown per invitee (View / Tile)
- Add button for additional invitees not in defaults

3. Confirm:
   - Clone view configuration from template
   - Substitute parameter values into tile titles and bindings
   - Mark entity-specific tiles as "pending configuration" (visually distinct placeholder)
   - Resolve role-based invitations to actual people
   - Send view-level inbox notifications to each invitee
   - Open new named view
   - Surface configuration prompt for unbound tiles: "This view has 3 tiles that need to be linked. Configure now?"

### Tile binding behavior on clone

| Tile type | Clone behavior |
|---|---|
| Widget tiles (capacity gauge, counter, sparkline) | Clone fully configured |
| Blank note canvas | Clone as empty canvas |
| Entity-bound tiles (specific project's items) | Clone as pending configuration placeholder |
| Person-bound tiles (team member card) | Clone as pending, resolved from parameters where possible |

### Workspace state additions

```json
{
  "library": {
    "Onboarding Template": {
      "isTemplate": true,
      "category": "Onboarding",
      "description": "Standard new hire onboarding — 12 micro-flows",
      "parameters": ["newHireName", "startDate", "advisorName"],
      "defaultInvitees": [...],
      "rows": [...],
      "tiles": [...]
    }
  },
  "views": {
    "Alex Rivera — Onboarding": {
      "clonedFrom": "Onboarding Template",
      "createdAt": "2026-03-28",
      "parameters": {
        "newHireName": "Alex Rivera",
        "startDate": "2026-03-31",
        "advisorName": "Sandra Mitchell"
      },
      "rows": [...],
      "tiles": [...]
    }
  }
}
```

---

## 2. Row-Based Flexible Layouts

### Concept

Replace the single `gridSize` string (1x1 through 4x4) with a `rows` array where each row has its own column count and height. This gives unlimited layout flexibility while keeping the UI simple.

### Layout model

```json
{
  "rows": [
    { "id": "row1", "columns": 2, "height": "large" },
    { "id": "row2", "columns": 4, "height": "medium" },
    { "id": "row3", "columns": 4, "height": "medium" },
    { "id": "row4", "columns": 8, "height": "small" }
  ],
  "tiles": [
    { "row": "row1", "slot": 0, "noteId": "uuid" },
    { "row": "row1", "slot": 1, "noteId": "uuid" },
    { "row": "row2", "slot": 0, "noteId": "uuid" }
  ]
}
```

Tiles reference `row` (row id) and `slot` (0-indexed position within the row). The grid renders as a vertical stack of CSS grid rows, each with `grid-template-columns: repeat(N, minmax(0, 1fr))`.

### Row editor UI

A compact strip above the workspace. Each row appears as a labeled segment showing its column count. Controls per row:

- **Grip handle** (left edge) — drag up or down to reorder rows. Tiles travel with their row.
- **Column count** — small stepper (− and +) or inline number, 1–8
- **Height selector** — Small / Medium / Large / Auto (see below)
- **Add slot** (+) — appears at right edge when slot count < 8. Adds one empty slot.
- **Remove row** (×) — only enabled when all slots are empty or pruned. Disabled with tooltip "Move or close tiles first" when occupied tiles exist.

Row editor strip example:
```
⠿ Row 1 · [2 cols] · [Large ▾]  ×    ⠿ Row 2 · [4 cols] · [Medium ▾]  ×    [+ Add row]
```

### Row heights

| Option | Tile height | Best for |
|---|---|---|
| Small | 120px | Dense data tiles, micro-flow diagrams, compact counters |
| Medium | 180px | Standard tiles, team cards, meeting health |
| Large | 260px | Wide status panels, note canvases, detailed widgets |
| Auto | Fits tallest tile in row | Mixed content rows |

### Add row behavior

- Always inserts at bottom
- Default: 8 columns, Medium height, all slots empty
- Each empty slot shows a faint placeholder with × in corner
- User prunes unwanted slots immediately by clicking ×

### Slot operations

**Prune slot (×):**
- Empty slot: removes immediately, no confirmation
- Occupied slot: sends tile to tray, then removes slot. Content preserved.

**Add slot (+):**
- Appears at right edge of row when column count < 8
- Clicking adds one empty slot at the right end
- Hidden when column count = 8

**Constraints:**
- Maximum 8 columns per row
- Maximum 8 rows per view
- Enforced silently (+ button hides at max, Add row button grays at max)

### Backward compatibility

Existing gridSize strings migrate to equivalent rows arrays on first load:

| Old gridSize | New rows |
|---|---|
| 1x1 | [{columns:1,height:"auto"}] |
| 2x2 | [{columns:2,height:"medium"},{columns:2,height:"medium"}] |
| 3x3 | [{columns:3},{columns:3},{columns:3}] |
| 4x4 | [{columns:4},{columns:4},{columns:4},{columns:4}] |

All other combinations follow the same pattern.

---

## 3. Content Swap

### Concept

Dragging an occupied tile onto another occupied slot swaps both tiles' content. Neither tile loses its note, its canvas content, its chat thread, or its configuration. The layout reorganizes without requiring delete-and-re-add.

### Drag behavior by scenario

| Source | Target | Result |
|---|---|---|
| Occupied tile | Empty slot | Move (existing behavior) |
| Occupied tile | Occupied slot | Swap |
| Tray chip | Empty slot | Move from tray (existing behavior) |
| Tray chip | Occupied slot | Swap: tile goes to tray, chip takes slot |

### Visual during swap drag

- Dragged tile: 80% opacity, follows cursor
- Target slot (swap): shows two opposing arrows (⇄) overlay instead of standard drop highlight
- Target slot (move): standard cyan drop highlight (existing behavior)
- The opposing arrows indicator is the only visual distinction between swap and move — keep it clear

### Drag handle

Content drag uses the tile header bar as the handle. This distinguishes content drag from slot pruning (×) and from row reordering (row grip handle). Three distinct drag targets, three distinct operations, no ambiguity.

### Row-to-row swap

Swap works across rows with different column counts. A tile from a 4-column row can swap with a tile in an 8-column row. The tiles exchange row and slot references. Their visual width adapts to their new column context.

### Implementation note

Swap is a simple state update — exchange the `row` and `slot` values of the two tile records in the workspace state. No content moves. No DB writes for the notes themselves. Only the workspace state JSON updates.

---

## 4. View-Level Invitation and Permissions

### Permission model

Two levels. Tile-level overrides view-level. Most specific permission always wins.

**View-level roles:**

| Role | Rights |
|---|---|
| Owner | Full edit everywhere. Manage all permissions. Cannot be removed. |
| Editor | Full edit everywhere within the view. Assigned explicitly by owner. |
| Viewer | Read-only everywhere unless a tile-level override grants edit rights. |

**Tile-level overrides:**

| Override | Meaning |
|---|---|
| Tile editor | Can edit this tile regardless of view-level role |
| Tile viewer | Read-only on this tile even if view-level editor (protects sensitive tiles) |

**Default for all invitees: Viewer.** Edit rights are granted deliberately.

**Chat panel exception:** Always editable regardless of canvas edit rights. Being read-only on a canvas does not prevent participation in the chat thread.

### Read-only tile rendering

A read-only tile looks identical to an editable tile except:
- Small lock icon (🔒) in tile header alongside existing controls
- Canvas has non-editable cursor on hover
- `contenteditable="false"` on all canvas blocks
- Textarea has `readonly` attribute
- Chat panel remains fully interactive

No content is hidden or grayed out. The tile is fully readable. The person knows they are viewing, not editing.

### View-level presence strip

A participant strip above the workspace showing all view-level invitees:

Each participant shows:
- Avatar (initials circle in their assigned color)
- Presence dot: green (active within 15s), none (accepted/offline), outlined (pending)
- Small shield icon beneath avatar indicating view role
- Hover tooltip: "Can view all tiles. Can edit: [list of tile types]"

### Default invitees in templates

Templates store a `defaultInvitees` array. Each entry resolves to actual people at launch time — by firm role or by parameter reference.

```json
{
  "defaultInvitees": [
    {
      "role": "HR",
      "resolvedBy": "firmRole",
      "viewRole": "viewer",
      "required": true,
      "tileOverrides": [
        {
          "tileTypes": ["hr_paperwork", "benefits_enrollment",
                        "emergency_contacts", "compliance_training"],
          "editRight": "editor"
        }
      ]
    },
    {
      "role": "IT",
      "resolvedBy": "firmRole",
      "viewRole": "viewer",
      "required": false,
      "tileOverrides": [
        {
          "tileTypes": ["it_access", "tool_provisioning"],
          "editRight": "editor"
        }
      ]
    },
    {
      "role": "advisor",
      "resolvedBy": "parameter:advisorName",
      "viewRole": "viewer",
      "required": true,
      "tileOverrides": [
        {
          "tileTypes": ["advisor_designation"],
          "editRight": "editor"
        }
      ]
    },
    {
      "role": "new_hire",
      "resolvedBy": "parameter:newHireName",
      "viewRole": "viewer",
      "required": false,
      "ownerDecides": true,
      "tileOverrides": [
        {
          "tileTypes": ["emergency_contacts", "benefits_enrollment"],
          "editRight": "editor"
        }
      ]
    }
  ]
}
```

**`required: true`** — checkbox locked in launch popup, cannot be removed  
**`ownerDecides: true`** — pre-checked in launch popup, owner can uncheck before confirming  
**`resolvedBy: "firmRole"`** — resolved to all active resources with that department/role at launch time  
**`resolvedBy: "parameter:X"`** — resolved to the person named in parameter X

### Automatic note_participants creation

When a view instance is launched and tile-level edit rights are granted, `note_participants` rows are created automatically for each person with tile edit rights on each specific tile. They do not need a separate tile-level invitation — the view-level launch handles it. The existing tile collaboration system picks up these rows normally.

### Manage access panel

Available from the named view dropdown → "Manage access."

Shows:
- All participants with their view role and tile overrides
- Summary: "5 people have access. 3 have tile-level edit rights."
- Owner can change view role, add/remove tile overrides, remove participants
- Changes take effect immediately on next heartbeat

### DB additions

```sql
CREATE TABLE view_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL,
  workspace_owner_user_id uuid NOT NULL,
  view_name text NOT NULL,
  user_id uuid,
  resource_id uuid,
  view_role text CHECK (view_role IN ('owner','editor','viewer')) DEFAULT 'viewer',
  tile_edit_overrides jsonb DEFAULT '[]',
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  last_seen_at timestamptz
);
```

`tile_edit_overrides` format:
```json
[
  { "tileType": "hr_paperwork", "editRight": "editor" },
  { "tileType": "benefits_enrollment", "editRight": "editor" }
]
```

---

## 5. Build Order

Build in this sequence. Each step is independently testable before the next begins.

**Step 1 — Row-based layout engine**
Replace gridSize string with rows array. Implement row editor strip above workspace. Add/remove/reorder rows. Prune/add slots. Row heights. Migrate existing workspaces. Validate workspace save/restore with new format.

**Step 2 — Content swap**
Add swap detection to existing tile drag logic. Implement swap visual indicator (opposing arrows). Handle cross-row swap. Test edge cases: swap with tray chip, swap across different column-count rows.

**Step 3 — Template save**
Add "Save as template" to named view dropdown. Build save dialog with parameter definition and default invitee specification. Store templates in `notes_workspace.state.library`. Render Library section in left panel.

**Step 4 — Launch instance**
Build launch popup with parameter form and invitee section. Implement role resolution (by firm role and by parameter). Clone view configuration. Mark entity-bound tiles as pending. Send view-level inbox notifications.

**Step 5 — View-level permissions**
Create `view_participants` table. Add presence strip above workspace. Implement read-only canvas enforcement based on effective permission. Add lock icon to read-only tiles. Auto-create `note_participants` rows for tile-level edit grants. Build "Manage access" panel.

**Step 6 — Template default invitees**
Wire default invitee spec into launch popup. Implement required vs ownerDecides behavior. Resolve firm roles to actual people at launch time.

---

## 6. Key Constraints

- Maximum 8 columns per row. Maximum 8 rows per view. Enforced silently in UI.
- Pruning an occupied slot always sends tile to tray first. Content is never lost.
- Swap is a workspace state operation only. No note content moves in DB.
- Chat panel is always editable regardless of canvas permission.
- Owner cannot be removed from a view. Owner always has full edit rights.
- Required template invitees cannot be unchecked in launch popup.
- `note_participants` rows created by view launch behave identically to manually invited tile participants.
- Backward compatibility: all existing named views, tiles, and workspace states remain valid.

---

*Compass — Decision intelligence for professional services*  
*My Notes advanced features handoff · March 28, 2026*  
*Covers: view templates · row-based layouts · content swap · view-level permissions*
