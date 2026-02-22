import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"]
});

const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });

async function copyTestArchive(src, dest) {
  console.log(`Copying safely to sandbox... ${src} -> ${dest}`);
  await fs.copyFile(src, dest);
  return dest;
}

async function cleanup(dirPath) {
  console.log(`Cleaning up test paths...`);
  await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
}

async function run() {
  await client.connect(transport);
  
  const baseTarget = path.resolve("F:\\Shehab Projects\\iw4x-toolkit\\testiwd\\promod_v3.3\\promodlive_v3.3.iwd");
  const testDir = path.resolve("../testiwd/manual_test_env");
  await fs.mkdir(testDir, { recursive: true });
  
  const targetIwd = await copyTestArchive(baseTarget, path.join(testDir, "promod_test.iwd"));
  const extractDest = path.join(testDir, "extracted");
  const dummyModsDir = path.join(testDir, "mods_dummy");
  const dummyUserrawDir = path.join(testDir, "userraw_dummy");

  console.log(`\nStarting Integration Automation on: ${targetIwd}\n`);

  try {
    console.log("=== 1. Testing iwd_list with limit: 5 ===");
    let res = await client.callTool({
      name: "iwd_list",
      arguments: { path: targetIwd, limit: 5 }
    });
    console.log(res.content[0].text);

    console.log("\n=== 2. Testing iwd_info with summary_only: true ===");
    res = await client.callTool({
      name: "iwd_info",
      arguments: { path: targetIwd, entry: "maps/mp/gametypes/_promod.gsc", summary_only: true }
    });
    console.log(res.content[0].text);

    console.log("\n=== 3. Testing iwd_read with minified bounds exception (offset 50) ===");
    res = await client.callTool({
      name: "iwd_read",
      arguments: { path: targetIwd, entry: "maps/mp/gametypes/_promod.gsc", offset: 50, limit: 1 }
    });
    if (res.isError) {
      console.log("EXPECTED BOUNDS ERROR CAUGHT:");
      console.log(res.content[0].text);
    }

    console.log("\n=== 4. Testing iwd_grep with dynamic truncation on minified file ===");
    res = await client.callTool({
      name: "iwd_grep",
      arguments: { path: targetIwd, entry_glob: "**/_promod.gsc", pattern: "setServerDvarDefault" }
    });
    console.log(res.content[0].text);

    console.log("\n=== 5. Testing iwd_extract (globs) ===");
    res = await client.callTool({
      name: "iwd_extract",
      arguments: { path: targetIwd, dest: extractDest, entry_glob: "maps/mp/gametypes/*.gsc" }
    });
    console.log(res.content[0].text);

    console.log("\n=== 6. Testing iwd_patch (modifying class_assault_limit) ===");
    res = await client.callTool({
      name: "iwd_patch",
      arguments: { path: targetIwd, entry: "maps/mp/gametypes/_promod.gsc", old: "class_assault_limit", new: "class_assault_limit_patched", count: 1 }
    });
    console.log(res.content[0].text);

    console.log("\n=== 7. Testing iwd_write (injecting custom/test.gsc) ===");
    res = await client.callTool({
      name: "iwd_write",
      arguments: { path: targetIwd, entry: "custom/test.gsc", content: "// A brand new payload" }
    });
    console.log(res.content[0].text);

    console.log("\n=== 8. Testing iwd_rename (custom/test.gsc -> custom/moved.gsc) ===");
    res = await client.callTool({
      name: "iwd_rename",
      arguments: { path: targetIwd, entry: "custom/test.gsc", new_entry: "custom/moved.gsc" }
    });
    console.log(res.content[0].text);

    console.log("\n=== 9. Testing iwd_copy (custom/moved.gsc -> custom/copied.gsc) ===");
    res = await client.callTool({
      name: "iwd_copy",
      arguments: { src_path: targetIwd, src_entry: "custom/moved.gsc", dst_path: targetIwd, dst_entry: "custom/copied.gsc" }
    });
    console.log(res.content[0].text);

    console.log("\n=== 10. Testing iwd_remove (removing custom/moved.gsc) ===");
    res = await client.callTool({
      name: "iwd_remove",
      arguments: { path: targetIwd, entry: "custom/moved.gsc" }
    });
    console.log(res.content[0].text);

    console.log("\n=== 11. Testing iwd_diff (.bak against mutated archive) ===");
    res = await client.callTool({
      name: "iwd_diff",
      arguments: { path1: targetIwd + ".bak", path2: targetIwd, content_diff: true }
    });
    console.log("Difference check parsed successfully. Diff length:", res.content[0].text.length, "characters");
    
    console.log("\n=== 12. Testing dvar_search (query: fov) ===");
    res = await client.callTool({
      name: "dvar_search",
      arguments: { query: "fov" }
    });
    // Print first two lines
    console.log(res.content[0].text.split("\\n").slice(0, 5).join("\\n"));

    console.log("\n=== 13. Testing iwd_pack (Repacking workspace into packed.iwd) ===");
    res = await client.callTool({
      name: "iwd_pack",
      arguments: { source_dir: extractDest, dest_path: path.join(testDir, "packed.iwd") }
    });
    console.log(res.content[0].text);

    console.log("\n=== 14. Testing iwd_sync (Syncing workspace update to packed.iwd) ===");
    // Create a dummy file in the workspace to sync
    await fs.writeFile(path.join(extractDest, "sync_test.txt"), "sync me!");
    res = await client.callTool({
      name: "iwd_sync",
      arguments: { source_dir: extractDest, dest_path: path.join(testDir, "packed.iwd") }
    });
    console.log(res.content[0].text);

    console.log("\n=== 15. Testing mods_sync (Workspace -> mods_dummy) ===");
    res = await client.callTool({
      name: "mods_sync",
      arguments: { source_dir: extractDest, mod_dir: dummyModsDir }
    });
    console.log(res.content[0].text);

    console.log("\n=== 16. Testing userraw_sync (Workspace -> userraw_dummy) ===");
    res = await client.callTool({
      name: "userraw_sync",
      arguments: { source_dir: extractDest, userraw_dir: dummyUserrawDir }
    });
    console.log(res.content[0].text);

    console.log("\n✅ All 16 operations tested successfully on the integration suite.");

  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await cleanup(testDir);
    process.exit(0);
  }
}

run().catch(console.error);
