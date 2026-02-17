# GSC Builtins Research

Data gathered by research agent before it hit the 32K output token limit. Preserved here so nothing is lost.

## Sources Investigated

### Zeroy Wiki (wiki.zeroy.com)

Category index pages are **mostly empty** — only show headers, not function lists. Only a few had real content:

**String category**: `GetSubStr`, `IsSubStr`, `StrTok`, `ToLower`

**Effects category**: `GetFXVisibility`, `LoadFX`, `PlayFX`, `PlayFXOnTag`, `PlayLoopedFX`, `SetBlur`, `SetExpFog`, `SpawnFx`, `TriggerFX`, `VisionSetNaked`, `VisionSetNight`

**Full category list** (from nav bar):
AI, Animation, Array, BadPlaces, Clans, Client, Control, Damage, Debug, Dvars, Effects, Entity, File, Hud, Level, Math, Menus, Missile, Motion, Objective, Physics, Player, Precache, Rumble, Save, Sentient, Sound, Spawn, String, System, Teams, Trace, Triggers, Turret, Variables, Vector, Vehicles, Weapons

Individual function pages exist at: `wiki.zeroy.com/index.php?title=Call_of_Duty_4:_Scripting_Reference_-_<Category>::<FunctionName>`

### X Labs GSC Functions (xlabs-mirror.github.io/gsc_functions)

**Most complete source retrieved.** IW4x-confirmed functions:

| Function | Usage | Description |
|---|---|---|
| GetPing | `self GetPing()` | Get a Client's Ping |
| GetIP | `self GetIp()` | Get a Client's IP |
| SetPing | `self SetPing(int)` | Set a Client's Ping |
| Exec | `Exec(string)` | Execute a command |
| PrintConsole | `PrintConsole(string)` | Print to the console |
| GetSystemTime | `GetSystemTime()` | Get the current system time |
| GetSystemTimeMilliseconds | `GetSystemTimeMilliseconds()` | Get system time in milliseconds |
| ToUpper | `ToUpper(string)` | Converts string to upper case |
| FileRead | `FileRead(string filepath)` | Reads file from "scriptdata" folder |
| FileExists | `FileExists(string filepath)` | Checks if file exists in "scriptdata" |
| StorageSet | `StorageSet(string key, string data)` | Writes data to script storage |
| StorageRemove | `StorageRemove(string key)` | Removes data from script storage |
| StorageGet | `StorageGet(string key)` | Gets data from script storage |
| StorageHas | `StorageHas(string key)` | Checks if data exists in script storage |
| StorageDump | `StorageDump()` | Dumps script storage to JSON file |
| StorageLoad | `StorageLoad()` | Reads data from script storage JSON |
| StorageClear | `StorageClear()` | Clears all data in script storage |
| DisableWeaponPickup | `DisableWeaponPickup()` | Disables weapon pickup |
| EnableWeaponPickup | `EnableWeaponPickup()` | Enables weapon pickup |
| IsBot | `self IsBot()` | Checks if Player is a Bot |
| IsTestClient | `self IsTestClient()` | Checks if Player is a Testclient |
| BotStop | `bot BotStop()` | Bot stops moving |
| Int64IsInt | `Int64IsInt(string input)` | Checks if input is 32-bit integer |
| Int64ToInt | `Int64ToInt(string input)` | Converts to 32-bit integer |
| Int64OP | `Int64OP(string a, string op, string b)` | Performs int-64 operation |
| IsSprinting | `self IsSprinting()` | Check if client is sprinting |
| InitialWeaponRaise | `self InitialWeaponRaise(string weapon)` | BO2 compatibility function |
| OnPlayerSay | `OnPlayerSay(function(ent,string,string))` | Chat callback function |
| GetStat | `self GetStat(int index)` | CoD4 compatibility function |
| SetName | `self SetName(string)` | Changes Player Name |
| SetClanTag | `self SetClanTag(string)` | Changes Player Clan Name |

Table was truncated — full page has more rows.

### IW4x Client Source (C++)

Fetched from `raw.githubusercontent.com/iw4x/iw4x-client/main/src/Components/Modules/GSC/`

**ScriptExtension.cpp** — Engine extensions:
- `IsArray(object)` — checks if param is an array
- `ReplaceFunc(function, function)` — replaces function code position
- `GetSystemMilliseconds()` — system milliseconds
- `Exec(string)` — console command execution
- `PrintConsole(string...)` — console output

**IO.cpp** — File I/O:
- `FileWrite(filepath, string, mode)` — write text; mode is "append" or "write"
- `FileRead(filepath)` — read file (up to 65535 chars)
- `FileExists(filepath)` — check existence
- `FileRemove(filepath)` — delete file
- `FileRename(filepath, filepath)` — rename/move
- `FileCopy(filepath, filepath)` — copy
- `ReadStream()` — read next line from open file stream

**String.cpp** — String utilities:
- `ToUpper(string)` — uppercase
- `GetChar(string, int)` — character at index
- `StrICmp(string, string)` — case-insensitive compare
- `IsEndStr(string, string)` — ends-with check
- `Float(value)` — convert to float
- `Strtol(string, int)` — string to long with base
- `IString(string)` — internal string type

## What Was NOT Collected

- **Vanilla IW4 engine built-ins** (spawn, setOrigin, getOrigin, setModel, waittill, notify, thread, etc.) — these are in the base game, not the iw4x-client source
- **GSC dumps from leafized/GSC-Functions** — game script files were never fetched
- **Full iw4x-client GSC directory listing** — GitHub tree view requires auth, returned empty

## Next Steps Strategy

1. **Use GitHub MCP** to list `iw4x/iw4x-client/src/Components/Modules/GSC/` and read all source files
2. **Fetch full X Labs page** with `tavily_extract` using `extract_depth: "advanced"` for all rows
3. **Fetch leafized/GSC-Functions** game dumps via GitHub MCP
4. **Fetch individual Zeroy function pages** for categories with known content
5. **Write JSON in chunks** — don't try to generate the whole file in one agent call
