/**
 * @file gsc/builtins.ts
 * Known GSC builtins and DVARs.
 *
 * A core set is always available with no I/O; the full sets are merged in
 * lazily from the knowledge base on first access and cached.
 */

import { getKnowledgeDir } from "../utils.js";

// ---------------------------------------------------------------------------
// Core entries that are always available (no file I/O needed)
// ---------------------------------------------------------------------------

const CORE_BUILTINS = [
  // IO
  "println", "print", "iprintln", "iprintlnbold", "print3d", "iprintlnln",
  // Dvars
  "getcvar", "setcvar", "getcvarint", "getcvarlen",
  "getdvar", "setdvar", "getdvarint", "getdvarfloat", "getdvarvector",
  "setdvarifuninitialized",
  // Entity
  "getent", "getarray", "getfirstarraykey", "getnextarraykey",
  "alloc", "free", "spawn", "spawnstruct",
  // Special
  "self", "level", "game", "player",
  // Flow control
  "thread", "call", "notify", "endon", "wait", "waittill",
  "waittillmatch", "waittillframeend", "childthread",
  // Type conversion
  "tostring", "int", "float", "strtok", "tolower", "toupper",
  // Type checking
  "isdefined", "isstring", "isarray", "isfunction",
  // Math
  "length", "vectordot", "vectorcross", "vectornormalize", "vectorscale",
  "anglestoforward", "anglestoright", "anglestoleft",
  "forward", "right", "up",
  "distance", "distance2d", "distanceSquared",
  "clamp", "lerp", "lerpvector",
  // Entity methods
  "getorigin", "setorigin", "getangles", "setangles",
  "getvelocity", "setvelocity", "getmodel", "setmodel",
  "getnumlinks", "getlinkname",
  // Arrays
  "array", "array_size", "sort", "random", "randomint", "randomfloat",
  // Effects & Audio
  "bullettrace", "bullettracepassed", "sighttracepassed",
  "playfx", "playsound", "playrumbleonentity",
  "playlocalsound",
  // HUD
  "setText", "setvalue", "clearalltextafterhud",
  // Client
  "setclientdvar", "setclientdvars",
  // Player
  "getguid", "getentitynumber", "isalive", "getteam", "getname",
  "getplayerangles", "sayteam", "sayall", "suicide", "pingplayer",
  // Input
  "notifyonplayercommand", "_setactionslot",
  // UI
  "openpopupmenu", "openpopupmenugamepad", "closepopupmenu",
  "objective_add", "objective_delete", "objective_player",
  "newclienthudelem", "newhudelem",
  // Assets
  "precacheshader", "precachestring", "precachemenu", "precacheheadicon",
  // Time
  "gettime", "getsystemtime",
  // Filesystem
  "readfile", "writefile", "fileexists",
];

const CORE_DVARS = [
  "ui_gametype", "g_gametype", "sv_fps", "sv_maxclients",
  "r_fog", "r_detail", "r_normalmap", "r_specularmap",
  "cg_fov", "cg_thirdperson", "cg_drawcrosshair", "cg_hud",
  "cl_paused", "snaps", "rate", "cl_maxpackets",
];

// ---------------------------------------------------------------------------
// Lazy-loaded caches (populated on first access via async I/O)
// ---------------------------------------------------------------------------

let _knownBuiltins: Set<string> | null = null;
let _knownDvars: Set<string> | null = null;

/**
 * Merge named entries from a knowledge-base JSON file into `target`.
 * `add` controls how each entry's name is inserted (e.g. with/without
 * a lowercase alias). On any I/O or parse failure, `target` is returned
 * unchanged so callers fall back to the core set.
 */
async function loadNames(
  fileName: string,
  key: string,
  target: Set<string>,
  add: (set: Set<string>, name: string) => void,
): Promise<Set<string>> {
  const filePath = getKnowledgeDir(fileName);
  if (!filePath) return target;
  try {
    const { readFile } = await import("node:fs/promises");
    const data = JSON.parse(await readFile(filePath, "utf-8"));
    const entries = Array.isArray(data[key]) ? data[key] : [];
    for (const entry of entries) {
      if (entry.name) add(target, entry.name);
    }
  } catch {
    // Fall back to the core entries already in `target`
  }
  return target;
}

/**
 * Returns the set of known GSC builtins (case-insensitive), loading from the
 * knowledge base on first access.
 */
export async function getKnownBuiltins(): Promise<Set<string>> {
  if (!_knownBuiltins) {
    _knownBuiltins = await loadNames("gsc-builtins.json", "functions", new Set(CORE_BUILTINS),
      (set, name) => { set.add(name); set.add(name.toLowerCase()); });
  }
  return _knownBuiltins;
}

/**
 * Returns the set of known DVARs (lowercased), loading from the knowledge
 * base on first access.
 */
export async function getKnownDvars(): Promise<Set<string>> {
  if (!_knownDvars) {
    _knownDvars = await loadNames("dvars.json", "dvars", new Set(CORE_DVARS),
      (set, name) => set.add(name.toLowerCase()));
  }
  return _knownDvars;
}
